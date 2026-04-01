import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();

// Load from in-cluster config if available, otherwise from default kubeconfig
try {
  kc.loadFromCluster();
} catch {
  kc.loadFromDefault();
}

export const coreV1Api = kc.makeApiClient(k8s.CoreV1Api);
export const appsV1Api = kc.makeApiClient(k8s.AppsV1Api);
export const k8sConfig = kc;

export const NAMESPACE = process.env.K8S_NAMESPACE || 'open5gs';

export const NF_NAMES = [
  'nrf', 'ausf', 'udm', 'udr', 'pcf',
  'nssf', 'bsf', 'amf', 'smf', 'upf',
];

export const NF_CONFIG_MAP: Record<string, string> = {
  nrf: 'nrf-config',
  ausf: 'ausf-config',
  udm: 'udm-config',
  udr: 'udr-config',
  pcf: 'pcf-config',
  nssf: 'nssf-config',
  bsf: 'bsf-config',
  amf: 'amf-config',
  smf: 'smf-config',
  upf: 'upf-config',
};

export const NF_CONFIG_KEY: Record<string, string> = {
  nrf: 'nrf.yaml',
  ausf: 'ausf.yaml',
  udm: 'udm.yaml',
  udr: 'udr.yaml',
  pcf: 'pcf.yaml',
  nssf: 'nssf.yaml',
  bsf: 'bsf.yaml',
  amf: 'amf.yaml',
  smf: 'smf.yaml',
  upf: 'upf.yaml',
};
