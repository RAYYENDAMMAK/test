import { Router, Request, Response } from 'express';
import { coreV1Api, appsV1Api, NAMESPACE, NF_NAMES } from '../k8s-client';

const router = Router();

// Defines 5G core logical connections (Model C: Indirect Communication via SCP)
const NF_CONNECTIONS = [
  // Consumers to SCP
  { from: 'amf', to: 'scp', interface: 'SBI' },
  { from: 'smf', to: 'scp', interface: 'SBI' },
  
  // SCP to Producers
  { from: 'scp', to: 'nrf', interface: 'Nnrf' },
  { from: 'scp', to: 'ausf', interface: 'Nausf' },
  { from: 'scp', to: 'udm', interface: 'Nudm' },
  { from: 'scp', to: 'udr', interface: 'Nudr' },
  { from: 'scp', to: 'pcf', interface: 'Npcf' },
  { from: 'scp', to: 'nssf', interface: 'Nnssf' },
  { from: 'scp', to: 'bsf', interface: 'Nbsf' },

  // NSSF direct NSI link to NRF (Slice Selection)
  { from: 'nssf', to: 'nrf', interface: 'NSI' },

  // Non-SBI / Interface connections
  { from: 'smf', to: 'upf', interface: 'N4/PFCP' },
  { from: 'upf', to: 'internet', interface: 'N6' },
  { from: 'gnb', to: 'amf', interface: 'N2/NGAP' },
  { from: 'gnb', to: 'upf', interface: 'N3/GTP-U' },
];

router.get('/', async (req: Request, res: Response) => {
  try {
    const [deployRes, podRes] = await Promise.all([
      appsV1Api.listNamespacedDeployment(NAMESPACE),
      coreV1Api.listNamespacedPod(NAMESPACE),
    ]);

    const deployments = deployRes.body.items;
    const pods = podRes.body.items;

    const nfStatus: Record<string, string> = {};
    NF_NAMES.forEach(name => {
      const deploy = deployments.find(d => d.metadata?.name === name);
      const ready = deploy?.status?.readyReplicas || 0;
      const desired = deploy?.spec?.replicas || 1;
      nfStatus[name] = ready === desired && desired > 0 ? 'Running' : ready === 0 ? 'Down' : 'Degraded';
    });

    // Build nodes
    const nodes = [
      ...NF_NAMES.map(name => ({
        id: name,
        label: name.toUpperCase(),
        type: 'nf',
        status: nfStatus[name] || 'Unknown',
        group: getGroup(name),
      })),
      { id: 'gnb', label: 'gNB (RAN)', type: 'external', status: 'External', group: 'ran' },
      { id: 'internet', label: 'Internet / DN', type: 'external', status: 'External', group: 'dn' },
      { id: 'mongodb', label: 'MongoDB', type: 'db', status: 'Running', group: 'db' },
    ];

    // Add mongo connections
    const mongoConnections = ['udr', 'pcf', 'bsf'].map(nf => ({
      from: nf, to: 'mongodb', interface: 'MongoDB'
    }));

    const edges = [...NF_CONNECTIONS, ...mongoConnections].map((c, i) => ({
      id: `e${i}`,
      from: c.from,
      to: c.to,
      label: c.interface,
    }));

    res.json({ nodes, edges });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function getGroup(name: string): string {
  if (['nrf'].includes(name)) return 'core';
  if (['scp'].includes(name)) return 'proxy';
  if (['ausf', 'udm', 'udr'].includes(name)) return 'auth';
  if (['pcf', 'nssf', 'bsf'].includes(name)) return 'policy';
  if (['amf', 'smf'].includes(name)) return 'cp';
  if (['upf'].includes(name)) return 'up';
  return 'other';
}

export default router;
