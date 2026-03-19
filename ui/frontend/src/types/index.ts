export interface NF {
  name: string;
  status: 'Running' | 'Down' | 'Degraded' | 'Unknown' | 'NotDeployed';
  readyReplicas: number;
  desiredReplicas: number;
  restartCount: number;
  podPhase: string;
  podName: string | null;
  podIP: string | null;
  nodeIP: string | null;
  startTime: string | null;
  image: string | null;
  hasConfig: boolean;
}

export interface Subscriber {
  _id?: string;
  imsi: string;
  msisdn?: string[];
  security?: {
    k?: string;
    op?: string;
    opc?: string;
    amf?: string;
  };
  ambr?: {
    downlink?: { value: number; unit: number };
    uplink?: { value: number; unit: number };
  };
  slice?: Array<{
    sst: number;
    sd?: string;
    default_indicator?: boolean;
    session?: Array<{
      name: string;
      type: number;
      ambr?: { downlink?: { value: number; unit: number }; uplink?: { value: number; unit: number } };
      qos?: { index: number };
    }>;
  }>;
}

export interface TopologyNode {
  id: string;
  label: string;
  type: string;
  status: string;
  group: string;
}

export interface TopologyEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface PcapSession {
  id: string;
  pod: string;
  container?: string;
  interface: string;
  filter: string;
  startTime: string;
  status: 'running' | 'stopped' | 'error';
}

export interface K8sNode {
  name: string;
  status: string;
  roles: string[];
  capacity: Record<string, string>;
  allocatable: Record<string, string>;
  nodeInfo: any;
}

export interface NFAllocation {
  name: string;
  enabled: boolean;
  cpu: { request: string; limit: string };
  memory: { request: string; limit: string };
  replicas: number;
}

export interface NetworkSlice {
  _id?: string;
  name: string;
  description: string;
  sst: number;
  sd: string;
  color: string;
  status: 'active' | 'inactive' | 'draft';
  dnn: string;
  subnet: string;
  dns: string[];
  ambr: {
    downlink: { value: number; unit: number };
    uplink: { value: number; unit: number };
  };
  qos: {
    index: number;
    arp: {
      priority_level: number;
      pre_emption_capability: number;
      pre_emption_vulnerability: number;
    };
  };
  mtu: number;
  priority: number;
  networkFunctions: NFAllocation[];
  createdAt?: string;
  updatedAt?: string;
}
