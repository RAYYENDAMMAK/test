import React, { useEffect, useState, useCallback } from 'react';
import { Network, RefreshCw, Save, X, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../api';

interface NAD {
  name: string;
  iface: string;
  proto: string;
  cidr: string;
  gateway: string;
  usedBy: string;
  purpose: string;
  raw?: any;
}

interface PodStatus {
  pod: string;
  nf: string;
  interfaces: { name: string; ips: string[]; mac?: string; default?: boolean }[];
}

const NAD_COLOR: Record<string, string> = {
  'nad-n2': 'border-purple-500/30 bg-purple-500/5',
  'nad-n3': 'border-blue-500/30 bg-blue-500/5',
  'nad-n4': 'border-yellow-500/30 bg-yellow-500/5',
  'nad-n6': 'border-emerald-500/30 bg-emerald-500/5',
};
const NAD_BADGE: Record<string, string> = {
  'nad-n2': 'bg-purple-500/20 text-purple-300',
  'nad-n3': 'bg-blue-500/20 text-blue-300',
  'nad-n4': 'bg-yellow-500/20 text-yellow-300',
  'nad-n6': 'bg-emerald-500/20 text-emerald-300',
};

export default function Networking() {
  const [nads, setNads]       = useState<NAD[]>([]);
  const [status, setStatus]   = useState<PodStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState<NAD | null>(null);
  const [editIface, setEditIface]   = useState('');
  const [editCidr, setEditCidr]     = useState('');
  const [editGw, setEditGw]         = useState('');
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [n, s] = await Promise.all([api.multus.nads(), api.multus.status()]);
      setNads(n);
      setStatus(s);
    } catch { /* backend may return empty if Multus not enabled */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openModal(nad: NAD) {
    setModal(nad);
    setEditIface(nad.iface);
    setEditCidr(nad.cidr);
    setEditGw(nad.gateway);
    setMsg(null);
  }

  async function saveNad() {
    if (!modal) return;
    setSaving(true); setMsg(null);
    try {
      await api.multus.updateNad(modal.name, { iface: editIface, cidr: editCidr, gateway: editGw });
      setMsg({ type: 'ok', text: 'NAD updated — changes take effect on pod restart' });
      load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally { setSaving(false); }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Network className="text-blue-400" size={22} />
            Network Interfaces
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Multus CNI — NetworkAttachmentDefinitions &amp; live pod interface status
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* NAD cards */}
      <div>
        <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
          NetworkAttachmentDefinitions
          <span className="text-gray-700 font-normal normal-case ml-2">Click a card to edit the host interface name or IP range</span>
        </div>
        {loading ? (
          <div className="text-gray-600 text-sm py-8 text-center">Loading NADs…</div>
        ) : nads.length === 0 ? (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-6 text-center">
            <AlertCircle className="text-yellow-400 mx-auto mb-2" size={20} />
            <div className="text-yellow-300 text-sm font-medium">Multus not enabled</div>
            <div className="text-gray-500 text-xs mt-1">Uncomment Multus entries in kustomization.yaml and re-apply to enable multi-NIC support.</div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {nads.map(nad => (
              <button
                key={nad.name}
                onClick={() => openModal(nad)}
                className={`border rounded-xl p-4 text-left hover:brightness-110 transition-all ${NAD_COLOR[nad.name] || 'border-gray-700 bg-gray-900'}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${NAD_BADGE[nad.name] || 'bg-gray-700 text-gray-300'}`}>
                    {nad.name.replace('nad-', '').toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-500">{nad.proto}</span>
                </div>
                <div className="text-white font-semibold text-sm mb-1">{nad.name}</div>
                <div className="text-gray-400 text-xs mb-0.5">Used by: <span className="text-gray-300">{nad.usedBy}</span></div>
                <div className="text-gray-400 text-xs mb-2">{nad.purpose}</div>
                <div className="border-t border-gray-700/50 pt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">master</span>
                    <span className="text-xs font-mono text-blue-300">{nad.iface}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">CIDR</span>
                    <span className="text-xs font-mono text-gray-400">{nad.cidr || '—'}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Live pod interface status */}
      {status.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
            Live Pod Interface Status
            <span className="text-gray-700 font-normal normal-case ml-2">
              From <code className="bg-gray-900 px-1 py-0.5 rounded text-gray-500">k8s.v1.cni.cncf.io/networks-status</code> annotation
            </span>
          </div>
          <div className="space-y-3">
            {status.map(pod => (
              <div key={pod.pod} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-3">
                  <span className="text-xs font-mono text-blue-400 font-semibold">{pod.nf.toUpperCase()}</span>
                  <span className="text-xs text-gray-600">{pod.pod}</span>
                </div>
                <div className="p-4 grid grid-cols-3 gap-3">
                  {pod.interfaces.map(iface => (
                    <div key={iface.name} className="bg-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-mono font-semibold text-gray-300">{iface.name}</span>
                        {iface.default && <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">default</span>}
                      </div>
                      {iface.ips.map(ip => (
                        <div key={ip} className="text-xs font-mono text-emerald-400">{ip}</div>
                      ))}
                      {iface.mac && <div className="text-xs font-mono text-gray-600 mt-1">{iface.mac}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit NAD Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <span className="font-semibold text-white">Edit NAD — <span className="text-blue-400 font-mono">{modal.name}</span></span>
              <button onClick={() => setModal(null)} className="text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {msg && (
                <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${msg.type === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`}>
                  {msg.type === 'ok' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                  {msg.text}
                </div>
              )}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Host Interface (master)</label>
                <input
                  value={editIface}
                  onChange={e => setEditIface(e.target.value)}
                  placeholder="eth1, ens4, enp3s0…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                />
                <p className="text-xs text-gray-600 mt-1">Run <code className="bg-gray-800 px-1 rounded">ip link show</code> to list available NICs</p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">CIDR (pod IP/mask)</label>
                <input
                  value={editCidr}
                  onChange={e => setEditCidr(e.target.value)}
                  placeholder="192.168.10.10/24"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Gateway</label>
                <input
                  value={editGw}
                  onChange={e => setEditGw(e.target.value)}
                  placeholder="192.168.10.1"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors font-mono"
                />
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-500">
                <strong className="text-gray-400">Used by:</strong> {modal.usedBy} &nbsp;·&nbsp;
                <strong className="text-gray-400">Purpose:</strong> {modal.purpose}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-800">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">Cancel</button>
              <button onClick={saveNad} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
                <Save size={13} />
                {saving ? 'Saving…' : 'Save & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
