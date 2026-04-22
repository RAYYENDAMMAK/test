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
  'nssf', 'bsf', 'amf', 'smf', 'upf', 'scp',
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
  scp: 'scp-config',
};

export const NF_CONFIG_KEY: Record<string, string> = {
  nrf: 'nrf.yaml.in',
  ausf: 'ausf.yaml.in',
  udm: 'udm.yaml.in',
  udr: 'udr.yaml.in',
  pcf: 'pcf.yaml.in',
  nssf: 'nssf.yaml.in',
  bsf: 'bsf.yaml.in',
  amf: 'amf.yaml.in',
  smf: 'smf.yaml.in',
  upf: 'upf.yaml.in',
  scp: 'scp.yaml.in',
};
