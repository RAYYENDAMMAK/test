import { getStoredToken } from './context/AuthContext';

const BASE = '/api';

export async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    // Token expired — clear storage and reload to login
    localStorage.removeItem('5gcore_token');
    localStorage.removeItem('5gcore_user');
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      apiFetch<any>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    me: () => apiFetch<any>('/auth/me'),
    logout: () => apiFetch('/auth/logout', { method: 'POST' }),
  },
  nfs: {
    list: () => apiFetch<any[]>('/nfs'),
    getConfig: (name: string) => apiFetch<any>(`/nfs/${name}/config`),
    updateConfig: (name: string, content: string) =>
      apiFetch(`/nfs/${name}/config`, { method: 'PUT', body: JSON.stringify({ content }) }),
    restart: (name: string) => apiFetch(`/nfs/${name}/restart`, { method: 'POST' }),
    nodes: () => apiFetch<any[]>('/nfs/cluster/nodes'),
    services: () => apiFetch<any[]>('/nfs/cluster/services'),
    // Global config — shared PLMN/NRF URI/MongoDB/etc.
    getGlobal: () => apiFetch<any>('/nfs/global'),
    updateGlobal: (config: any) =>
      apiFetch('/nfs/global', { method: 'PUT', body: JSON.stringify(config) }),
    // Structured fields (parsed from YAML)
    getFields: (name: string) => apiFetch<any>(`/nfs/${name}/config/fields`),
    updateFields: (name: string, fields: any) =>
      apiFetch(`/nfs/${name}/config/fields`, { method: 'PUT', body: JSON.stringify({ fields }) }),
  },
  subscribers: {
    list: (page = 1, limit = 20, search = '') =>
      apiFetch<any>(`/subscribers?page=${page}&limit=${limit}&search=${search}`),
    get: (imsi: string) => apiFetch<any>(`/subscribers/${imsi}`),
    create: (data: any) => apiFetch('/subscribers', { method: 'POST', body: JSON.stringify(data) }),
    update: (imsi: string, data: any) =>
      apiFetch(`/subscribers/${imsi}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (imsi: string) => apiFetch(`/subscribers/${imsi}`, { method: 'DELETE' }),
  },
  logs: {
    get: (pod: string, tail = 200) => apiFetch<any>(`/logs/${pod}?tail=${tail}`),
    streamUrl: (pod: string) => {
      const token = getStoredToken();
      const q = token ? `?token=${encodeURIComponent(token)}` : '';
      return `${BASE}/logs/${pod}/stream${q}`;
    },
    lokiReady: () => apiFetch<any>('/logs/loki/ready'),
    lokiQuery: (params: {
      nf?: string; query?: string; since?: string;
      start?: number; end?: number; limit?: number; direction?: string;
    }) => apiFetch<any>(`/logs/loki/query?${new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([,v]) => v !== undefined).map(([k,v]) => [k, String(v)]))
    )}`),
    lokiLabels: () => apiFetch<any>('/logs/loki/labels'),
  },
  pcap: {
    sessions: () => apiFetch<any[]>('/pcap/sessions'),
    pods: () => apiFetch<any[]>('/pcap/pods'),
    start: (data: any) => apiFetch('/pcap/start', { method: 'POST', body: JSON.stringify(data) }),
    stop: (id: string) => apiFetch(`/pcap/stop/${id}`, { method: 'POST' }),
    delete: (id: string) => apiFetch(`/pcap/sessions/${id}`, { method: 'DELETE' }),
    downloadUrl: (id: string) => {
      const token = getStoredToken();
      const q = token ? `?token=${encodeURIComponent(token)}` : '';
      return `${BASE}/pcap/download/${id}${q}`;
    },
  },
  topology: {
    get: () => apiFetch<any>('/topology'),
  },
  metrics: {
    summary: () => apiFetch<any>('/metrics/summary'),
    grafana: () => apiFetch<any>('/metrics/grafana'),
    query: (q: string) => apiFetch<any>(`/metrics/query?q=${encodeURIComponent(q)}`),
  },
  gnbs: {
    list:        ()         => apiFetch<any>('/gnbs').then(r => r.gnbs),
    live:        ()         => apiFetch<any>('/gnbs/live').then(r => r.assocs),
    get:         (id: string) => apiFetch<any>(`/gnbs/${id}`),
    create:      (data: any)  => apiFetch('/gnbs', { method: 'POST', body: JSON.stringify(data) }),
    update:      (id: string, data: any) => apiFetch(`/gnbs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove:      (id: string) => apiFetch(`/gnbs/${id}`, { method: 'DELETE' }),
    events:      (id: string) => apiFetch<any[]>(`/gnbs/${id}/events`),
  },
  multus: {
    nads:        ()            => apiFetch<any[]>('/multus/nads'),
    getNad:      (name: string) => apiFetch<any>(`/multus/nads/${name}`),
    updateNad:   (name: string, data: any) => apiFetch(`/multus/nads/${name}`, { method: 'PUT', body: JSON.stringify(data) }),
    status:      ()            => apiFetch<any[]>('/multus/status'),
  },
  slices: {
    list: () => apiFetch<any[]>('/slices'),
    get: (id: string) => apiFetch<any>(`/slices/${id}`),
    create: (data: any) => apiFetch('/slices', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => apiFetch(`/slices/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => apiFetch(`/slices/${id}`, { method: 'DELETE' }),
    apply: (id: string) => apiFetch(`/slices/${id}/apply`, { method: 'POST' }),
    deactivate: (id: string) => apiFetch(`/slices/${id}/deactivate`, { method: 'POST' }),
    nfStatus: (id: string) => apiFetch<any[]>(`/slices/${id}/nf-status`),
  },
};
