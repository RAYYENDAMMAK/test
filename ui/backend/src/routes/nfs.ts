import { Router, Request, Response } from 'express';
import * as yaml from 'js-yaml';
import { coreV1Api, appsV1Api, NAMESPACE, NF_NAMES, NF_CONFIG_MAP, NF_CONFIG_KEY } from '../k8s-client';

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read a dotted path from a nested object, supporting array indices.
 *  e.g. getPath(obj, 'amf.ngap.0.addr') */
function getPath(obj: any, path: string): any {
  return path.split('.').reduce((o, k) => (o != null ? o[k] : undefined), obj);
}

/** Set a dotted path in a nested object (mutates). Creates missing nodes. */
function setPath(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const nextIsIdx = /^\d+$/.test(keys[i + 1]);
    if (cur[k] == null) cur[k] = nextIsIdx ? [] : {};
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  cur[last] = value;
}

const GLOBAL_CM = '5gcore-global-config';

/** Default global config — used when ConfigMap doesn't exist yet */
const DEFAULT_GLOBAL = {
  mcc: '001', mnc: '01', tac: 1, sst: 1, sd: '000001',
  nrfUri: 'http://nrf-svc:7777',
  mongoUri: 'mongodb://mongodb-svc:27017/open5gs',
  logLevel: 'info',
};

// ─── YAML paths for each structured field per NF ─────────────────────────────
// Maps structured key → YAML dotted path within the NF's parsed YAML
const NF_FIELD_PATHS: Record<string, Record<string, string>> = {
  nrf:  {
    sbi_addr: 'nrf.sbi.0.addr',
    sbi_port: 'nrf.sbi.0.port',
    mcc:      'nrf.serving.0.plmn_id.mcc',
    mnc:      'nrf.serving.0.plmn_id.mnc',
  },
  ausf: {
    sbi_addr: 'ausf.sbi.0.addr',
    sbi_port: 'ausf.sbi.0.port',
    nrf_uri:  'ausf.nrf.uri',
  },
  udm:  {
    sbi_addr: 'udm.sbi.0.addr',
    sbi_port: 'udm.sbi.0.port',
    nrf_uri:  'udm.nrf.uri',
  },
  udr:  {
    sbi_addr: 'udr.sbi.0.addr',
    sbi_port: 'udr.sbi.0.port',
    nrf_uri:  'udr.nrf.uri',
    db_uri:   'udr.db_uri',
  },
  pcf:  {
    sbi_addr: 'pcf.sbi.0.addr',
    sbi_port: 'pcf.sbi.0.port',
    nrf_uri:  'pcf.nrf.uri',
  },
  nssf: {
    sbi_addr: 'nssf.sbi.0.addr',
    sbi_port: 'nssf.sbi.0.port',
    nrf_uri:  'nssf.nrf.uri',
    sst:      'nssf.sbi.0.path.0',   // simplified; NSSF slice selection is complex
    sd:       'nssf.nsi.0.s_nssai.sd',
  },
  bsf:  {
    sbi_addr: 'bsf.sbi.0.addr',
    sbi_port: 'bsf.sbi.0.port',
    nrf_uri:  'bsf.nrf.uri',
  },
  amf:  {
    mcc:              'amf.guami.0.plmn_id.mcc',
    mnc:              'amf.guami.0.plmn_id.mnc',
    tac:              'amf.tai.0.tac',
    sst:              'amf.plmn_support.0.s_nssai.0.sst',
    sd:               'amf.plmn_support.0.s_nssai.0.sd',
    network_name:     'amf.network_name.full',
    amf_name:         'amf.amf_name',
    ngap_addr:        'amf.ngap.0.addr',
    sbi_addr:         'amf.sbi.0.addr',
    sbi_port:         'amf.sbi.0.port',
    nrf_uri:          'amf.nrf.uri',
    integrity_order:  'amf.security.integrity_order',
    ciphering_order:  'amf.security.ciphering_order',
    t3512:            'amf.t3512.value',
  },
  smf:  {
    sbi_addr:     'smf.sbi.0.addr',
    sbi_port:     'smf.sbi.0.port',
    pfcp_addr:    'smf.pfcp.0.addr',
    upf_addr:     'upf.pfcp.0.addr',   // remote UPF node in SMF config
    ue_subnet:    'smf.subnet.0.addr',
    dnn:          'smf.subnet.0.dnn',
    mtu:          'smf.mtu',
    dns_primary:  'smf.dns.0',
    dns_secondary:'smf.dns.1',
    nrf_uri:      'smf.nrf.uri',
  },
  upf:  {
    pfcp_addr: 'upf.pfcp.0.addr',
    gtpu_addr: 'upf.gtpu.0.addr',
    ue_subnet: 'upf.subnet.0.addr',
    dnn:       'upf.subnet.0.dnn',
    tun_dev:   'upf.subnet.0.dev',
  },
};

/** Which structured fields correspond to global config keys, per NF */
const GLOBAL_PROPAGATION: Record<string, Record<string, keyof typeof DEFAULT_GLOBAL>> = {
  nrf:  { mcc: 'mcc', mnc: 'mnc' },
  ausf: { nrf_uri: 'nrfUri' },
  udm:  { nrf_uri: 'nrfUri' },
  udr:  { nrf_uri: 'nrfUri', db_uri: 'mongoUri' },
  pcf:  { nrf_uri: 'nrfUri' },
  nssf: { nrf_uri: 'nrfUri', sst: 'sst', sd: 'sd' },
  bsf:  { nrf_uri: 'nrfUri' },
  amf:  { mcc: 'mcc', mnc: 'mnc', tac: 'tac', sst: 'sst', sd: 'sd', nrf_uri: 'nrfUri' },
  smf:  { nrf_uri: 'nrfUri' },
  upf:  {},
};

// ─── Helpers: read/write ConfigMap YAML ──────────────────────────────────────
async function readNfYaml(name: string): Promise<{ obj: any; raw: string }> {
  const cmName = NF_CONFIG_MAP[name];
  const key    = NF_CONFIG_KEY[name];
  const cm = await coreV1Api.readNamespacedConfigMap(cmName, NAMESPACE);
  const raw = cm.body.data?.[key] || '';
  const obj = yaml.load(raw) as any || {};
  return { obj, raw };
}

async function writeNfYaml(name: string, obj: any): Promise<void> {
  const cmName = NF_CONFIG_MAP[name];
  const key    = NF_CONFIG_KEY[name];
  const raw    = yaml.dump(obj, { lineWidth: 120 });
  const cm = await coreV1Api.readNamespacedConfigMap(cmName, NAMESPACE);
  if (!cm.body.data) cm.body.data = {};
  cm.body.data[key] = raw;
  await coreV1Api.replaceNamespacedConfigMap(cmName, NAMESPACE, cm.body);
}

// ─── Existing routes ─────────────────────────────────────────────────────────

// GET /api/nfs — list NF statuses
router.get('/', async (req: Request, res: Response) => {
  try {
    const [deployRes, podRes] = await Promise.all([
      appsV1Api.listNamespacedDeployment(NAMESPACE),
      coreV1Api.listNamespacedPod(NAMESPACE),
    ]);

    const deployments = deployRes.body.items;
    const pods        = podRes.body.items;

    const nfs = NF_NAMES.map(name => {
      const deploy    = deployments.find(d => d.metadata?.name === name);
      const nfPods    = pods.filter(p => p.metadata?.labels?.app === name);
      const pod       = nfPods[0];
      const ready     = deploy?.status?.readyReplicas || 0;
      const desired   = deploy?.spec?.replicas || 1;

      let status = 'Unknown';
      if (!deploy)                           status = 'NotDeployed';
      else if (ready === desired && desired)  status = 'Running';
      else if (ready === 0)                   status = 'Down';
      else                                    status = 'Degraded';

      return {
        name, status, readyReplicas: ready, desiredReplicas: desired,
        restartCount: pod?.status?.containerStatuses?.[0]?.restartCount || 0,
        podPhase:     pod?.status?.phase || 'Unknown',
        podName:      pod?.metadata?.name || null,
        podIP:        pod?.status?.podIP || null,
        nodeIP:       pod?.status?.hostIP || null,
        startTime:    pod?.status?.startTime || null,
        image:        pod?.spec?.containers?.[0]?.image || null,
        hasConfig:    !!NF_CONFIG_MAP[name],
      };
    });

    res.json(nfs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nfs/global — fetch shared global config
router.get('/global', async (req: Request, res: Response) => {
  try {
    const cm = await coreV1Api.readNamespacedConfigMap(GLOBAL_CM, NAMESPACE)
      .catch(() => null);
    if (!cm) return res.json(DEFAULT_GLOBAL);
    const stored = cm.body.data?.['global.json'];
    res.json(stored ? JSON.parse(stored) : DEFAULT_GLOBAL);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nfs/global — save global config; optionally propagate to all NFs
router.put('/global', async (req: Request, res: Response) => {
  const { propagate, ...globalCfg } = req.body as any;
  try {
    // Upsert the global ConfigMap
    const payload = {
      apiVersion: 'v1', kind: 'ConfigMap',
      metadata: { name: GLOBAL_CM, namespace: NAMESPACE },
      data: { 'global.json': JSON.stringify(globalCfg, null, 2) },
    };
    await coreV1Api.readNamespacedConfigMap(GLOBAL_CM, NAMESPACE)
      .then(() => coreV1Api.replaceNamespacedConfigMap(GLOBAL_CM, NAMESPACE, payload))
      .catch(() => coreV1Api.createNamespacedConfigMap(NAMESPACE, payload));

    if (propagate) {
      // For each NF, overwrite inherited fields in its YAML
      await Promise.allSettled(
        Object.entries(GLOBAL_PROPAGATION).map(async ([nfName, mapping]) => {
          if (!NF_CONFIG_MAP[nfName]) return;
          const { obj } = await readNfYaml(nfName).catch(() => ({ obj: {} }));
          const fieldPaths = NF_FIELD_PATHS[nfName] || {};

          for (const [fieldKey, globalKey] of Object.entries(mapping)) {
            const yamlPath = fieldPaths[fieldKey];
            if (yamlPath && globalCfg[globalKey] !== undefined) {
              setPath(obj, yamlPath, globalCfg[globalKey]);
            }
          }
          await writeNfYaml(nfName, obj).catch(() => {});
        })
      );
    }

    res.json({ success: true, propagated: !!propagate });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nfs/:name/config — raw YAML
router.get('/:name/config', async (req: Request, res: Response) => {
  const { name } = req.params;
  const cmName = NF_CONFIG_MAP[name];
  if (!cmName) return res.status(404).json({ error: 'No config for this NF' });
  try {
    const cm  = await coreV1Api.readNamespacedConfigMap(cmName, NAMESPACE);
    const key = NF_CONFIG_KEY[name];
    res.json({ name, configMap: cmName, key, content: cm.body.data?.[key] || '' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nfs/:name/config — save raw YAML
router.put('/:name/config', async (req: Request, res: Response) => {
  const { name } = req.params;
  const { content } = req.body;
  const cmName = NF_CONFIG_MAP[name];
  const key    = NF_CONFIG_KEY[name];
  if (!cmName) return res.status(404).json({ error: 'No config for this NF' });
  try {
    const cm = await coreV1Api.readNamespacedConfigMap(cmName, NAMESPACE);
    if (!cm.body.data) cm.body.data = {};
    cm.body.data[key] = content;
    await coreV1Api.replaceNamespacedConfigMap(cmName, NAMESPACE, cm.body);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nfs/:name/config/fields — parse YAML, return structured fields + raw yaml
router.get('/:name/config/fields', async (req: Request, res: Response) => {
  const { name } = req.params;
  if (!NF_CONFIG_MAP[name]) return res.status(404).json({ error: 'No config for this NF' });
  try {
    const { obj, raw } = await readNfYaml(name);
    const paths  = NF_FIELD_PATHS[name] || {};
    const fields: Record<string, any> = {};
    for (const [fieldKey, path] of Object.entries(paths)) {
      const val = getPath(obj, path);
      if (val !== undefined) fields[fieldKey] = val;
    }
    res.json({ name, fields, yaml: raw });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nfs/:name/config/fields — merge structured fields into YAML, save
router.put('/:name/config/fields', async (req: Request, res: Response) => {
  const { name } = req.params;
  const { fields } = req.body as { fields: Record<string, any> };
  if (!NF_CONFIG_MAP[name]) return res.status(404).json({ error: 'No config for this NF' });
  try {
    const { obj } = await readNfYaml(name);
    const paths   = NF_FIELD_PATHS[name] || {};
    for (const [fieldKey, value] of Object.entries(fields)) {
      const path = paths[fieldKey];
      if (path) setPath(obj, path, value);
    }
    await writeNfYaml(name, obj);
    res.json({ success: true, updated: Object.keys(fields).length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/nfs/:name/restart
router.post('/:name/restart', async (req: Request, res: Response) => {
  const { name } = req.params;
  try {
    const pods = await coreV1Api.listNamespacedPod(
      NAMESPACE, undefined, undefined, undefined, undefined, `app=${name}`
    );
    await Promise.all(pods.body.items.map(p =>
      coreV1Api.deleteNamespacedPod(p.metadata!.name!, NAMESPACE)
    ));
    res.json({ success: true, message: `Restarting ${name} pods` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nfs/cluster/nodes
router.get('/cluster/nodes', async (req: Request, res: Response) => {
  try {
    const nodes = await coreV1Api.listNode();
    res.json(nodes.body.items.map(n => ({
      name:        n.metadata?.name,
      status:      n.status?.conditions?.find(c => c.type === 'Ready')?.status === 'True' ? 'Ready' : 'NotReady',
      roles:       Object.keys(n.metadata?.labels || {})
                     .filter(k => k.startsWith('node-role.kubernetes.io/'))
                     .map(k => k.replace('node-role.kubernetes.io/', '')),
      capacity:    n.status?.capacity,
      allocatable: n.status?.allocatable,
      nodeInfo:    n.status?.nodeInfo,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/nfs/cluster/services
router.get('/cluster/services', async (req: Request, res: Response) => {
  try {
    const svcs = await coreV1Api.listNamespacedService(NAMESPACE);
    res.json(svcs.body.items.map(s => ({
      name:       s.metadata?.name,
      type:       s.spec?.type,
      clusterIP:  s.spec?.clusterIP,
      ports:      s.spec?.ports,
      externalIP: s.status?.loadBalancer?.ingress?.[0]?.ip || null,
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
