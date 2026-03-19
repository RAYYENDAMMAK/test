import React, { useEffect, useState } from 'react';
import { Play, Square, Download, Trash2, Radio } from 'lucide-react';
import { api } from '../api';
import { PcapSession } from '../types';

export default function Tracing() {
  const [pods, setPods] = useState<any[]>([]);
  const [sessions, setSessions] = useState<PcapSession[]>([]);
  const [form, setForm] = useState({ pod: '', container: '', interface: 'any', filter: '', duration: '60' });
  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState<{ type: string; text: string } | null>(null);

  const loadAll = async () => {
    const [p, s] = await Promise.allSettled([api.pcap.pods(), api.pcap.sessions()]);
    if (p.status === 'fulfilled') {
      setPods(p.value);
      if (p.value.length > 0 && !form.pod) setForm(f => ({ ...f, pod: p.value[0].name }));
    }
    if (s.status === 'fulfilled') setSessions(s.value);
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    const t = setInterval(() => api.pcap.sessions().then(setSessions).catch(() => {}), 5000);
    return () => clearInterval(t);
  }, []);

  const startCapture = async () => {
    if (!form.pod) return setMsg({ type: 'error', text: 'Select a pod' });
    setStarting(true);
    setMsg(null);
    try {
      const res = await api.pcap.start({
        pod: form.pod,
        container: form.container || undefined,
        interface: form.interface,
        filter: form.filter,
        duration: Number(form.duration),
      });
      setMsg({ type: 'success', text: `Capture started: ${res.id}` });
      loadAll();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    } finally { setStarting(false); }
  };

  const stopCapture = async (id: string) => {
    await api.pcap.stop(id);
    loadAll();
  };

  const deleteSession = async (id: string) => {
    await api.pcap.delete(id);
    setSessions(s => s.filter(x => x.id !== id));
  };

  const selectedPod = pods.find(p => p.name === form.pod);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tracing</h1>
        <p className="text-gray-400 text-sm mt-1">Capture PCAP traces from running 5G NF pods</p>
      </div>

      {msg && (
        <div className={`px-4 py-2 rounded-lg text-sm border ${
          msg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>{msg.text}</div>
      )}

      {/* New Capture Form */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
          <Radio size={16} className="text-blue-400" /> New Capture
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Pod</label>
            <select
              value={form.pod}
              onChange={e => setForm(f => ({ ...f, pod: e.target.value, container: '' }))}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            >
              <option value="">— Select pod —</option>
              {pods.map(p => (
                <option key={p.name} value={p.name}>{p.app?.toUpperCase() || p.name} ({p.podIP})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Container</label>
            <select
              value={form.container}
              onChange={e => setForm(f => ({ ...f, container: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none"
            >
              <option value="">Default</option>
              {selectedPod?.containers?.map((c: string) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Interface</label>
            <input
              value={form.interface}
              onChange={e => setForm(f => ({ ...f, interface: e.target.value }))}
              placeholder="any, eth0, n2..."
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1">BPF Filter (optional)</label>
            <input
              value={form.filter}
              onChange={e => setForm(f => ({ ...f, filter: e.target.value }))}
              placeholder="e.g. port 38412, host 10.45.0.1, sctp"
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Duration (sec)</label>
            <input
              type="number"
              value={form.duration}
              onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-4 flex gap-3">
          <button onClick={startCapture} disabled={starting || !form.pod}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
            <Play size={13} /> {starting ? 'Starting...' : 'Start Capture'}
          </button>
        </div>

        {/* BPF cheat-sheet */}
        <div className="mt-4 p-3 bg-gray-800/50 rounded-lg">
          <div className="text-xs font-medium text-gray-400 mb-2">Common BPF Filters for 5G</div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {[
              ['NGAP (N2)', 'sctp port 38412'],
              ['GTP-U (N3)', 'udp port 2152'],
              ['PFCP (N4)', 'udp port 8805'],
              ['SBI (HTTP)', 'tcp port 7777'],
              ['All SCTP', 'sctp'],
              ['UE subnet', 'net 10.45.0.0/16'],
            ].map(([label, filter]) => (
              <button key={label} onClick={() => setForm(f => ({ ...f, filter }))}
                className="text-left p-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors">
                <div className="font-medium text-gray-300">{label}</div>
                <div className="font-mono text-gray-500">{filter}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h2 className="font-semibold text-white">Capture Sessions</h2>
          <button onClick={loadAll} className="text-xs text-gray-400 hover:text-white">Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left px-5 py-2 font-medium">Pod</th>
                <th className="text-left px-4 py-2 font-medium">Interface</th>
                <th className="text-left px-4 py-2 font-medium">Filter</th>
                <th className="text-left px-4 py-2 font-medium">Started</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-5 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-500">No capture sessions</td></tr>
              )}
              {sessions.map(s => (
                <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-5 py-3 font-mono text-white text-xs">{s.pod}</td>
                  <td className="px-4 py-3 text-gray-400">{s.interface}</td>
                  <td className="px-4 py-3 font-mono text-gray-400 text-xs">{s.filter || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(s.startTime).toLocaleTimeString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      s.status === 'running' ? 'bg-emerald-500/20 text-emerald-400' :
                      s.status === 'stopped' ? 'bg-gray-500/20 text-gray-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>{s.status}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    {s.status === 'running' && (
                      <button onClick={() => stopCapture(s.id)}
                        className="p-1.5 text-gray-400 hover:text-yellow-400 mr-1" title="Stop">
                        <Square size={13} />
                      </button>
                    )}
                    {s.status === 'stopped' && (
                      <a href={api.pcap.downloadUrl(s.id)} download
                        className="inline-flex p-1.5 text-gray-400 hover:text-blue-400 mr-1" title="Download PCAP">
                        <Download size={13} />
                      </a>
                    )}
                    <button onClick={() => deleteSession(s.id)}
                      className="p-1.5 text-gray-400 hover:text-red-400" title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-sm text-gray-400">
        <div className="font-medium text-blue-400 mb-1">Requirements</div>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>tcpdump must be installed in the target container</li>
          <li>Container must have NET_ADMIN capability or run as privileged</li>
          <li>UPF pod already has the required capabilities for N3/N4 interface captures</li>
          <li>For AMF N2 captures: filter on <code className="font-mono bg-gray-800 px-1 rounded">sctp port 38412</code></li>
        </ul>
      </div>
    </div>
  );
}
