import { Router, Request, Response } from 'express';
import * as yaml from 'js-yaml';
import { coreV1Api, appsV1Api, NAMESPACE, NF_NAMES, NF_CONFIG_MAP, NF_CONFIG_KEY } from '../k8s-client';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const [deployRes, podRes, cmRes] = await Promise.all([
      appsV1Api.listNamespacedDeployment(NAMESPACE),
      coreV1Api.listNamespacedPod(NAMESPACE),
      coreV1Api.listNamespacedConfigMap(NAMESPACE),
    ]);

    const deployments = deployRes.body.items;
    const cms = cmRes.body.items;

    const nfStatus: Record<string, string> = {};
    const nfConfigs: Record<string, any> = {};

    NF_NAMES.forEach(name => {
      const deploy = deployments.find(d => d.metadata?.name === name);
      if (!deploy) {
        nfStatus[name] = 'NotDeployed';
        return;
      }
      const ready = deploy?.status?.readyReplicas || 0;
      const desired = deploy?.spec?.replicas || 1;
      nfStatus[name] = ready === desired && desired > 0 ? 'Running' : ready === 0 ? 'Down' : 'Degraded';

      // Parse Config
      const cmName = NF_CONFIG_MAP[name];
      const key = NF_CONFIG_KEY[name];
      const cm = cms.find(c => c.metadata?.name === cmName);
      if (cm?.data) {
        // Try exact key, then .in, then fallback to first key
        const raw = cm.data[key] || cm.data[`${key}.in`] || Object.values(cm.data)[0];
        if (raw && typeof raw === 'string') {
          try { nfConfigs[name] = yaml.load(raw); } catch {}
        }
      }
    });

    // Build nodes (exclude NotDeployed if desired, but here we keep them but show as NotDeployed)
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

    const connections: { from: string, to: string, interface: string }[] = [];

    // Build connections from configs
    Object.entries(nfConfigs).forEach(([name, config]) => {
      const core = (config as any)?.[name];
      if (!core) return;

      // 1. SBI Clients (Consumers)
      if (core.sbi?.client) {
        const c = core.sbi.client;
        if (c.scp?.length > 0 || c.scp?.uri) {
          connections.push({ from: name, to: 'scp', interface: 'SBI' });
        } else if (c.nrf?.length > 0 || c.nrf?.uri) {
          connections.push({ from: name, to: 'nrf', interface: 'SBI' });
        }
        
        // Specialized NSI link for NSSF
        if (c.nsi?.length > 0 || c.nsi?.uri) {
          connections.push({ from: name, to: 'nrf', interface: 'NSI' });
        }
      }

      // 2. SMF PFCP
      if (name === 'smf' && core.pfcp?.client?.upf) {
        connections.push({ from: 'smf', to: 'upf', interface: 'N4/PFCP' });
      }

      // 3. Inferred RAN links (Inferred from server presence)
      if (name === 'amf' && core.ngap) {
        connections.push({ from: 'gnb', to: 'amf', interface: 'N2/NGAP' });
      }
      if (name === 'upf' && core.gtpu) {
        connections.push({ from: 'gnb', to: 'upf', interface: 'N3/GTP-U' });
      }
      if (name === 'upf' && core.session) {
        connections.push({ from: 'upf', to: 'internet', interface: 'N6' });
      }
    });

    // 4. SCP to NRF (Always if SCP is proxying or configured)
    if (nfConfigs['scp']?.scp?.sbi?.client?.nrf) {
      connections.push({ from: 'scp', to: 'nrf', interface: 'Nnrf' });
    }

    // 5. SCP to Producers (Logical if SCP is used as proxy)
    // If major consumers use SCP, we show SCP routing to producers
    const usesScp = ['amf', 'smf'].some(n => {
      const c = nfConfigs[n]?.[n]?.sbi?.client;
      return c?.scp?.length > 0 || c?.scp?.uri;
    });

    if (usesScp) {
       ['ausf', 'udm', 'udr', 'pcf', 'nssf', 'bsf'].forEach(prod => {
         if (nfStatus[prod] !== 'NotDeployed') {
           connections.push({ from: 'scp', to: prod, interface: `N${prod}` });
         }
       });
    }

    // 6. DB connections
    ['udr', 'pcf', 'bsf'].forEach(nf => {
       if (nfStatus[nf] !== 'NotDeployed') {
         connections.push({ from: nf, to: 'mongodb', interface: 'MongoDB' });
       }
    });

    // Remove duplicates
    const seen = new Set<string>();
    const uniqueConnections = connections.filter(c => {
      const key = `${c.from}-${c.to}-${c.interface}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const edges = uniqueConnections.map((c, i) => ({
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

