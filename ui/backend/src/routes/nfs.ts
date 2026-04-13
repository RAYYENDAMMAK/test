import { Router, Request, Response } from 'express';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import * as path from 'path';
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

/** Delete a dotted path from a nested object (mutates). */
function deletePath(obj: any, path: string): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur == null) return;
    cur = cur[keys[i]];
  }
  if (cur == null) return;
  delete cur[keys[keys.length - 1]];
}

function deepEqual(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const GLOBAL_CM = '5gcore-global-config';
const NF_CONFIG_DIR = process.env.NF_CONFIG_DIR || '/var/lib/5gcore-ui/nf-configs';
const SOURCE_CONFIGMAP_DIR = process.env.SOURCE_CONFIGMAP_DIR || '/etc/open5gs';

/** Default global config — used when ConfigMap doesn't exist yet */
const DEFAULT_GLOBAL = {
  mcc: '605', mnc: '01', tac: 1, sst: 1, sd: '000001',
  nrfUri: 'http://nrf-svc:7777',
  mongoUri: 'mongodb://mongodb-svc:27017/open5gs',
  logLevel: 'info',
};

// ─── YAML paths for each structured field per NF ─────────────────────────────
// Maps structured key → YAML dotted path within the NF's parsed YAML
const NF_FIELD_PATHS: Record<string, Record<string, string>> = {
  nrf:  {
    sbi_addr: 'nrf.sbi.server.0.address',
    sbi_port: 'nrf.sbi.server.0.port',
    mcc:      'nrf.serving.0.plmn_id.mcc',
    mnc:      'nrf.serving.0.plmn_id.mnc',
  },
  ausf: {
    sbi_addr: 'ausf.sbi.server.0.address',
    sbi_port: 'ausf.sbi.server.0.port',
    nrf_uri:  'ausf.sbi.client.nrf.0.uri',
  },
  udm:  {
    sbi_addr: 'udm.sbi.server.0.address',
    sbi_port: 'udm.sbi.server.0.port',
    nrf_uri:  'udm.sbi.client.nrf.0.uri',
  },
  udr:  {
    sbi_addr: 'udr.sbi.server.0.address',
    sbi_port: 'udr.sbi.server.0.port',
    nrf_uri:  'udr.sbi.client.nrf.0.uri',
    db_uri:   'db_uri',
  },
  pcf:  {
    sbi_addr: 'pcf.sbi.server.0.address',
    sbi_port: 'pcf.sbi.server.0.port',
    nrf_uri:  'pcf.sbi.client.nrf.0.uri',
  },
  nssf: {
    sbi_addr: 'nssf.sbi.server.0.address',
    sbi_port: 'nssf.sbi.server.0.port',
    nrf_uri:  'nssf.sbi.client.nrf.0.uri',
    sst:      'nssf.sbi.client.nsi.0.s_nssai.sst',
    sd:       'nssf.sbi.client.nsi.0.s_nssai.sd',
  },
  bsf:  {
    sbi_addr: 'bsf.sbi.server.0.address',
    sbi_port: 'bsf.sbi.server.0.port',
    nrf_uri:  'bsf.sbi.client.nrf.0.uri',
  },
  amf:  {
    mcc:              'amf.guami.0.plmn_id.mcc',
    mnc:              'amf.guami.0.plmn_id.mnc',
    tac:              'amf.tai.0.tac',
    sst:              'amf.plmn_support.0.s_nssai.0.sst',
    sd:               'amf.plmn_support.0.s_nssai.0.sd',
    network_name:     'amf.network_name.full',
    amf_name:         'amf.amf_name',
    ngap_addr:        'amf.ngap.server.0.address',
    sbi_addr:         'amf.sbi.server.0.address',
    sbi_port:         'amf.sbi.server.0.port',
    nrf_uri:          'amf.sbi.client.nrf.0.uri',
    integrity_order:  'amf.security.integrity_order',
    ciphering_order:  'amf.security.ciphering_order',
    t3512:            'amf.time.t3512.value',
  },
  smf:  {
    sbi_addr:     'smf.sbi.server.0.address',
    sbi_port:     'smf.sbi.server.0.port',
    pfcp_addr:    'smf.pfcp.server.0.address',
    upf_addr:     'smf.pfcp.client.upf.0.address',
    ue_subnet:    'smf.session.0.subnet',
    dnn:          'smf.session.0.dnn',
    mtu:          'smf.mtu',
    dns_primary:  'smf.dns.0',
    dns_secondary:'smf.dns.1',
    nrf_uri:      'smf.sbi.client.nrf.0.uri',
  },
  upf:  {
    pfcp_addr: 'upf.pfcp.server.0.address',
    gtpu_addr: 'upf.gtpu.server.0.address',
    ue_subnet: 'upf.session.0.subnet',
    dnn:       'upf.session.0.dnn',
    tun_dev:   'upf.session.0.dev',
  },
};

// Legacy structured paths used by older UI/backend code. These are normalized
// into the actual Open5GS YAML schema and then removed from the document.
const LEGACY_NF_FIELD_PATHS: Record<string, Record<string, string>> = {
  nrf:  {
    sbi_addr: 'nrf.sbi.0.addr',
    sbi_port: 'nrf.sbi.0.port',
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
    sst:      'nssf.sbi.0.path.0',
    sd:       'nssf.nsi.0.s_nssai.sd',
  },
  bsf:  {
    sbi_addr: 'bsf.sbi.0.addr',
    sbi_port: 'bsf.sbi.0.port',
    nrf_uri:  'bsf.nrf.uri',
  },
  amf:  {
    ngap_addr: 'amf.ngap.0.addr',
    sbi_addr:  'amf.sbi.0.addr',
    sbi_port:  'amf.sbi.0.port',
    nrf_uri:   'amf.nrf.uri',
    t3512:     'amf.t3512.value',
  },
  smf:  {
    sbi_addr:  'smf.sbi.0.addr',
    sbi_port:  'smf.sbi.0.port',
    pfcp_addr: 'smf.pfcp.0.addr',
    upf_addr:  'upf.pfcp.0.addr',
    ue_subnet: 'smf.subnet.0.addr',
    dnn:       'smf.subnet.0.dnn',
    nrf_uri:   'smf.nrf.uri',
  },
  upf:  {
    pfcp_addr: 'upf.pfcp.0.addr',
    gtpu_addr: 'upf.gtpu.0.addr',
    ue_subnet: 'upf.subnet.0.addr',
    dnn:       'upf.subnet.0.dnn',
    tun_dev:   'upf.subnet.0.dev',
  },
};

function normalizeNfConfig(name: string, obj: any): { obj: any; changed: boolean } {
  const fieldPaths = NF_FIELD_PATHS[name] || {};
  const legacyPaths = LEGACY_NF_FIELD_PATHS[name] || {};
  let changed = false;

  for (const [fieldKey, canonicalPath] of Object.entries(fieldPaths)) {
    const legacyPath = legacyPaths[fieldKey];
    if (!legacyPath || legacyPath === canonicalPath) continue;

    const canonicalVal = getPath(obj, canonicalPath);
    const legacyVal = getPath(obj, legacyPath);

    if (canonicalVal === undefined && legacyVal !== undefined) {
      setPath(obj, canonicalPath, legacyVal);
      changed = true;
    }

    if (legacyVal !== undefined) {
      deletePath(obj, legacyPath);
      changed = true;
    }
  }

  // Remove empty legacy containers left behind by older mappings.
  const cleanupPaths = [
    `${name}.nrf`,
    `${name}.db_uri`,
    `${name}.sbi.0`,
    `${name}.ngap.0`,
    `${name}.pfcp.0`,
    `${name}.gtpu.0`,
    `${name}.subnet`,
    `${name}.nsi`,
  ];

  for (const path of cleanupPaths) {
    const value = getPath(obj, path);
    if (value && typeof value === 'object' && Object.keys(value).length === 0) {
      deletePath(obj, path);
      changed = true;
    }
  }

  return { obj, changed };
}

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
  const filePath = path.join(NF_CONFIG_DIR, `${name}.yaml`);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const obj = yaml.load(raw) as any || {};
    return { obj, raw };
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }

  const cmName = NF_CONFIG_MAP[name];
  const key    = NF_CONFIG_KEY[name];
  const cm = await coreV1Api.readNamespacedConfigMap(cmName, NAMESPACE);
  const raw = cm.body.data?.[key] || '';
  const obj = yaml.load(raw) as any || {};
  await fs.mkdir(NF_CONFIG_DIR, { recursive: true });
  await fs.writeFile(filePath, raw, 'utf8');
  return { obj, raw };
}

async function writeFileAtomically(filePath: string, raw: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tempPath, raw, 'utf8');
  await fs.rename(tempPath, filePath);
}

/** Restart all pods for a given NF to pick up new ConfigMap */
async function restartNfPods(name: string): Promise<void> {
  const pods = await coreV1Api.listNamespacedPod(
    NAMESPACE, undefined, undefined, undefined, undefined, `app=${name}`
  );
  await Promise.all(pods.body.items.map(p =>
    coreV1Api.deleteNamespacedPod(p.metadata!.name!, NAMESPACE)
  ));
}

async function writeNfYamlRaw(name: string, raw: string, restartPods: boolean = true): Promise<string> {
  const cmName = NF_CONFIG_MAP[name];
  const key    = NF_CONFIG_KEY[name];
  const filePath = path.join(NF_CONFIG_DIR, `${name}.yaml`);
  const sourceFilePath = path.join(SOURCE_CONFIGMAP_DIR, `${name}.yaml`);
  const parsed = yaml.load(raw) as any || {};
  const normalized = normalizeNfConfig(name, parsed).obj;
  const normalizedRaw = yaml.dump(normalized, { lineWidth: 120 });

  // Write to local cache
  await writeFileAtomically(filePath, normalizedRaw);

  // Write to source configmap directory (/etc/open5gs)
  try {
    await writeFileAtomically(sourceFilePath, normalizedRaw);
  } catch (err: any) {
    console.error(`Failed to write source config at ${sourceFilePath}:`, err.message);
  }

  // Update ConfigMap in Kubernetes
  const cm = await coreV1Api.readNamespacedConfigMap(cmName, NAMESPACE);
  if (!cm.body.data) cm.body.data = {};
  cm.body.data[key] = normalizedRaw;
  await coreV1Api.replaceNamespacedConfigMap(cmName, NAMESPACE, cm.body);

  // Restart pods to pick up the new ConfigMap content in /etc/open5gs
  if (restartPods) {
    await restartNfPods(name).catch(err => {
      console.error(`Failed to restart ${name} pods:`, err.message);
    });
  }

  return normalizedRaw;
}

async function writeNfYaml(name: string, obj: any, restartPods: boolean = true): Promise<void> {
  await writeNfYamlRaw(name, yaml.dump(obj, { lineWidth: 120 }), restartPods);
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
          await writeNfYaml(nfName, obj, true).catch(() => {});
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
    const key = NF_CONFIG_KEY[name];
    const { obj, raw } = await readNfYaml(name);
    const original = JSON.parse(JSON.stringify(obj || {}));
    const normalized = normalizeNfConfig(name, obj);
    const content = normalized.changed && !deepEqual(original, normalized.obj)
      ? await writeNfYamlRaw(name, yaml.dump(normalized.obj, { lineWidth: 120 }))
      : raw;
    res.json({ name, configMap: cmName, key, content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/nfs/:name/config — save raw YAML
router.put('/:name/config', async (req: Request, res: Response) => {
  const { name } = req.params;
  const { content, restartPods } = req.body;
  const cmName = NF_CONFIG_MAP[name];
  const key    = NF_CONFIG_KEY[name];
  if (!cmName) return res.status(404).json({ error: 'No config for this NF' });
  try {
    const normalizedContent = await writeNfYamlRaw(name, content, restartPods !== false);
    res.json({
      success: true,
      content: normalizedContent,
      key,
      message: restartPods !== false ? `Config updated and ${name} pods restarting` : 'Config updated (pods not restarted)',
    });
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
    const original = JSON.parse(JSON.stringify(obj || {}));
    const normalized = normalizeNfConfig(name, obj);
    if (normalized.changed && !deepEqual(original, normalized.obj)) {
      await writeNfYaml(name, normalized.obj);
    }
    const paths  = NF_FIELD_PATHS[name] || {};
    const fields: Record<string, any> = {};
    for (const [fieldKey, path] of Object.entries(paths)) {
      const val = getPath(normalized.obj, path);
      if (val !== undefined) fields[fieldKey] = val;
    }
    res.json({
      name,
      fields,
      yaml: normalized.changed ? yaml.dump(normalized.obj, { lineWidth: 120 }) : raw,
    });
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
    res.json({ success: true, updated: Object.keys(fields).length, message: `Config updated and ${name} pods restarting` });
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
