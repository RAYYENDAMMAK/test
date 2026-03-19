import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Server, Activity, Cpu, HardDrive } from 'lucide-react';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';
import Card from '../components/Card';
import { NF } from '../types';

const NF_GROUP: Record<string, string> = {
  nrf: 'Core', ausf: 'Auth', udm: 'Auth', udr: 'Auth',
  pcf: 'Policy', nssf: 'Policy', bsf: 'Policy',
  amf: 'Control Plane', smf: 'Control Plane', upf: 'User Plane',
  webui: 'Management',
};

export default function Dashboard() {
  const [nfs, setNfs] = useState<NF[]>([]);
  const [nodes, setNodes] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [nfData, nodeData, metricData] = await Promise.allSettled([
        api.nfs.list(),
        api.nfs.nodes(),
        api.metrics.summary(),
      ]);
      if (nfData.status === 'fulfilled') setNfs(nfData.value);
      if (nodeData.status === 'fulfilled') setNodes(nodeData.value);
      if (metricData.status === 'fulfilled') setMetrics(metricData.value);
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, []);
  useEffect(() => {
    const t = setInterval(fetchAll, 15000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const running = nfs.filter(n => n.status === 'Running').length;
  const down = nfs.filter(n => n.status === 'Down').length;
  const degraded = nfs.filter(n => n.status === 'Degraded').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'NFs Running', value: running, total: nfs.length, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'NFs Down', value: down, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Degraded', value: degraded, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: 'K8s Nodes', value: nodes.filter(n => n.status === 'Ready').length, total: nodes.length, color: 'text-blue-400', bg: 'bg-blue-500/10' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} border border-gray-800 rounded-xl p-4`}>
            <div className="text-gray-400 text-xs font-medium uppercase tracking-wide">{card.label}</div>
            <div className={`text-3xl font-bold mt-1 ${card.color}`}>
              {card.value}
              {card.total !== undefined && <span className="text-gray-500 text-lg">/{card.total}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Active UEs', value: metrics.amf_ue_count || '—', icon: Activity },
          { label: 'PDU Sessions', value: metrics.smf_session_count || '—', icon: Server },
          { label: 'UPF RX Bytes', value: formatBytes(metrics.upf_bytes_in), icon: HardDrive },
          { label: 'UPF TX Bytes', value: formatBytes(metrics.upf_bytes_out), icon: Cpu },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
            <div className="bg-blue-500/10 p-2 rounded-lg">
              <Icon className="text-blue-400" size={18} />
            </div>
            <div>
              <div className="text-gray-400 text-xs">{label}</div>
              <div className="text-white font-semibold">{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* NF Status Table */}
      <Card title="Network Functions">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left py-2 font-medium">Name</th>
                <th className="text-left py-2 font-medium">Group</th>
                <th className="text-left py-2 font-medium">Status</th>
                <th className="text-left py-2 font-medium">Replicas</th>
                <th className="text-left py-2 font-medium">Restarts</th>
                <th className="text-left py-2 font-medium">Pod IP</th>
                <th className="text-left py-2 font-medium">Uptime</th>
              </tr>
            </thead>
            <tbody>
              {nfs.map(nf => (
                <tr key={nf.name} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="py-2.5 font-mono font-medium text-white uppercase">{nf.name}</td>
                  <td className="py-2.5 text-gray-400">{NF_GROUP[nf.name] || 'Other'}</td>
                  <td className="py-2.5"><StatusBadge status={nf.status} /></td>
                  <td className="py-2.5 text-gray-300">{nf.readyReplicas}/{nf.desiredReplicas}</td>
                  <td className="py-2.5">
                    <span className={nf.restartCount > 0 ? 'text-yellow-400' : 'text-gray-400'}>
                      {nf.restartCount}
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-400 font-mono text-xs">{nf.podIP || '—'}</td>
                  <td className="py-2.5 text-gray-400 text-xs">{nf.startTime ? uptime(nf.startTime) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* K8s Nodes */}
      {nodes.length > 0 && (
        <Card title="Kubernetes Nodes">
          <div className="grid gap-3">
            {nodes.map(node => (
              <div key={node.name} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                <div>
                  <div className="font-medium text-white text-sm">{node.name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {node.roles?.join(', ') || 'worker'} · {node.nodeInfo?.osImage}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <div>CPU: {node.capacity?.cpu}</div>
                  <div>RAM: {formatBytes(node.capacity?.memory?.replace('Ki', ''))}</div>
                  <StatusBadge status={node.status} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function uptime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatBytes(val: any): string {
  if (!val || val === '—') return '—';
  const n = Number(val);
  if (isNaN(n)) return String(val);
  if (n > 1e9) return (n / 1e9).toFixed(1) + ' GB';
  if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
  if (n > 1e3) return (n / 1e3).toFixed(1) + ' KB';
  return n + ' B';
}
