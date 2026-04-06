import { Router, Request, Response } from 'express';
import * as yaml from 'js-yaml';
import { coreV1Api, k8sConfig, NAMESPACE } from '../k8s-client';
import * as k8s from '@kubernetes/client-node';

const router = Router();

const customApi = k8sConfig.makeApiClient(k8s.CustomObjectsApi);

const NAD_GROUP   = 'k8s.cni.cncf.io';
const NAD_VERSION = 'v1';
const NAD_PLURAL  = 'network-attachment-definitions';

// ── Metadata about our 5G NADs ────────────────────────────────────────────────
const NAD_META: Record<string, { iface: string; proto: string; port: string; nfs: string[]; color: string }> = {
  'nad-n2': { iface: 'N2 / NGAP',  proto: 'SCTP', port: '38412', nfs: ['amf'],       color: '#3b82f6' },
  'nad-n3': { iface: 'N3 / GTP-U', proto: 'UDP',  port: '2152',  nfs: ['upf'],       color: '#10b981' },
  'nad-n4': { iface: 'N4 / PFCP',  proto: 'UDP',  port: '8805',  nfs: ['smf','upf'], color: '#f59e0b' },
  'nad-n6': { iface: 'N6 / DN',    proto: 'IP',   port: '—',     nfs: ['upf'],       color: '#a855f7' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse the CNI JSON config from a NAD spec.config string */
function parseNadConfig(raw: string): any {
  try { return JSON.parse(raw); } catch { return {}; }
}

/** Build a summary object from a NAD custom resource */
function summariseNad(item: any) {
  const name   = item.metadata?.name as string;
  const config = parseNadConfig(item.spec?.config || '{}');
  const meta   = NAD_META[name] as typeof NAD_META[string] | undefined;
  const ipamAddresses = config.ipam?.addresses || [];
  const firstAddress = ipamAddresses[0]?.address || '';
  const firstGateway = ipamAddresses[0]?.gateway || '';
  return {
    name,
    iface:     config.master    || meta?.iface  || name,
    proto:     meta?.proto  || '—',
    cidr:      firstAddress,
    gateway:   firstGateway,
    usedBy:    meta?.nfs?.join(', ') || '—',
    purpose:   config.type ? `${config.type} (${config.mode || 'bridge'})` : '—',
    // Additional fields for detailed view
    port:      meta?.port   || '—',
    nfs:       meta?.nfs    || [],
    color:     meta?.color  || '#6b7280',
    cniType:   config.type      || '—',
    master:    config.master    || '—',
    mode:      config.mode      || '—',
    ipamType:  config.ipam?.type || '—',
    addresses: ipamAddresses.map((a: any) => a.address),
    range:     config.ipam?.range || null,
    rangeStart:config.ipam?.range_start || null,
    rangeEnd:  config.ipam?.range_end   || null,
    rawConfig: item.spec?.config || '',
  };
}

// ── GET /api/multus/nads ──────────────────────────────────────────────────────
router.get('/nads', async (req: Request, res: Response) => {
  try {
    const result: any = await customApi.listNamespacedCustomObject(
      NAD_GROUP, NAD_VERSION, NAMESPACE, NAD_PLURAL
    );
    const nads = (result.body?.items || []).map(summariseNad);
    res.json(nads);
  } catch (err: any) {
    // Multus CRD not installed yet
    if (err?.response?.statusCode === 404 || err?.statusCode === 404) {
      return res.json([]);
    }
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/multus/nads/:name ────────────────────────────────────────────────
router.get('/nads/:name', async (req: Request, res: Response) => {
  try {
    const item: any = await customApi.getNamespacedCustomObject(
      NAD_GROUP, NAD_VERSION, NAMESPACE, NAD_PLURAL, req.params.name
    );
    res.json(summariseNad(item.body));
  } catch (err: any) {
    res.status(err?.response?.statusCode === 404 ? 404 : 500).json({ error: err.message });
  }
});

// ── PUT /api/multus/nads/:name ────────────────────────────────────────────────
// Body: { master?, mode?, address?, gateway?, range?, rangeStart?, rangeEnd? }
router.put('/nads/:name', async (req: Request, res: Response) => {
  const { name } = req.params;
  const patch = req.body as {
    master?: string; mode?: string;
    address?: string; gateway?: string;         // static IPAM
    range?: string; rangeStart?: string; rangeEnd?: string; // whereabouts
  };
  try {
    const existing: any = await customApi.getNamespacedCustomObject(
      NAD_GROUP, NAD_VERSION, NAMESPACE, NAD_PLURAL, name
    );
    const cfg = parseNadConfig(existing.body?.spec?.config || '{}');

    if (patch.master)     cfg.master = patch.master;
    if (patch.mode)       cfg.mode   = patch.mode;

    // Static IPAM
    if (patch.address || patch.gateway) {
      if (!cfg.ipam) cfg.ipam = { type: 'static' };
      if (!cfg.ipam.addresses) cfg.ipam.addresses = [{}];
      if (patch.address) cfg.ipam.addresses[0].address = patch.address;
      if (patch.gateway) cfg.ipam.addresses[0].gateway = patch.gateway;
    }
    // Whereabouts IPAM
    if (patch.range)      cfg.ipam = { ...cfg.ipam, range: patch.range };
    if (patch.rangeStart) cfg.ipam = { ...cfg.ipam, range_start: patch.rangeStart };
    if (patch.rangeEnd)   cfg.ipam = { ...cfg.ipam, range_end:   patch.rangeEnd   };

    const updated = { ...existing.body, spec: { config: JSON.stringify(cfg, null, 2) } };
    await customApi.replaceNamespacedCustomObject(
      NAD_GROUP, NAD_VERSION, NAMESPACE, NAD_PLURAL, name, updated
    );
    res.json({ success: true, nad: summariseNad(updated) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/multus/status ────────────────────────────────────────────────────
// Returns per-pod Multus interface status from the networks-status annotation.
router.get('/status', async (req: Request, res: Response) => {
  try {
    const podRes = await coreV1Api.listNamespacedPod(NAMESPACE);
    const nfNames = ['amf', 'smf', 'upf'];

    const result = podRes.body.items
      .filter(p => {
        const app = p.metadata?.labels?.app;
        return app && nfNames.includes(app);
      })
      .map(p => {
        const app         = p.metadata?.labels?.app || '?';
        const podName     = p.metadata?.name || '?';
        const phase       = p.status?.phase || 'Unknown';
        const annotations = p.metadata?.annotations || {};

        // k8s.v1.cni.cncf.io/networks-status is set by Multus after attachment
        const networkStatusRaw = annotations['k8s.v1.cni.cncf.io/networks-status'] || '[]';
        let networkStatus: any[] = [];
        try { networkStatus = JSON.parse(networkStatusRaw); } catch {}

        // k8s.v1.cni.cncf.io/networks is what was requested
        const requestedRaw = annotations['k8s.v1.cni.cncf.io/networks'] || '[]';
        let requested: any[] = [];
        try { requested = JSON.parse(requestedRaw); } catch {}

        const interfaces = networkStatus.map((iface: any) => ({
          name:      iface.name      || '—',
          interface: iface.interface || '—',
          ips:       iface.ips       || [],
          mac:       iface.mac       || null,
          default:   iface.default   || false,
          dns:       iface.dns       || {},
        }));

        // Flag missing attachments (requested but not in status)
        const attached   = interfaces.map(i => i.name);
        const missing    = requested
          .filter((r: any) => r.name && !attached.some(a => a.includes(r.name)))
          .map((r: any) => r.name);

        return { nf: app, pod: podName, phase, interfaces, missing, multusReady: missing.length === 0 };
      });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
