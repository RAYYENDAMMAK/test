import React, { useEffect, useState, useCallback } from 'react';
import { Radio, Plus, RefreshCw, Wifi, WifiOff, Users, Activity, X, Save } from 'lucide-react';
import { api } from '../api';

interface GnbEntry {
  _id: string;
  gnbId: string;
  name: string;
  type: string;
  vendor: string;
  version: string;
  site: string;
  expectedIP: string;
  maxUEs: number;
  notes: string;
  allowedSlices: { sst: number; sd: string }[];
  createdAt: string;
}

interface LiveAssoc {
  gnbId?: string;
  name?: string;
  remoteIP: string;
  remotePort: number;
  sctpState: string;
  assocId: string;
  ueCount?: number;
}

const EMPTY_GNB = {
  gnbId: '', name: '', type: 'gNB', vendor: '', version: '',
  site: '', expectedIP: '', maxUEs: 128, notes: '',
};

export default function GNBs() {
  const [gnbs, setGnbs] = useState<GnbEntry[]>([]); //affiche la table des gNBs enregistrés, permet l'édition/suppression.
  const [live, setLive] = useState<LiveAssoc[]>([]); //affiche les connexions SCTP en cours, calcule les stats (connectés, UEs actifs).
  const [loading, setLoading] = useState(true); //affiche "Loading…" dans la table tant que loadGnbs() n'a pas terminé.
  const [polling, setPolling] = useState(false);//Usage : désactive le bouton et montre "Polling…" pendant pollLive().
  const [lastPoll, setLastPoll] = useState<string>('—'); // affiche "Last polled: 14:32:15" dans le header pour indiquer la fraîcheur des données.
  const [modal, setModal] = useState<{ open: boolean; editing: GnbEntry | null }>({ open: false, editing: null });
  const [form, setForm] = useState<any>(EMPTY_GNB); //lie les inputs de la modale aux valeurs, permet la saisie/édition.
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadGnbs = useCallback(async () => {
    try {
      const data = await api.gnbs.list();
      setGnbs(data); //fonction pour mettre à jour la liste des gNBs.
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  const pollLive = useCallback(async () => {
    setPolling(true);
    try {
      const data = await api.gnbs.live();
      setLive(data); //fonction pour mettre à jour les données live.
      setLastPoll(new Date().toLocaleTimeString());
    } catch { setLive([]); }
    finally { setPolling(false); }
  }, []);

  useEffect(() => {
    loadGnbs();
    pollLive();
  }, [loadGnbs, pollLive]); // le hook se relance si ces fonctions changent

  const connected = live.filter(l => l.sctpState === 'ESTABLISHED').length;
  const totalUEs   = live.reduce((s, l) => s + (l.ueCount || 0), 0);

  function openRegister() { setForm(EMPTY_GNB); setModal({ open: true, editing: null }); setError(''); }
  //setForm : fonction pour mettre à jour les champs du formulaire.
  function openEdit(g: GnbEntry) { setForm({ ...g }); setModal({ open: true, editing: g }); setError(''); }
  function closeModal() { setModal({ open: false, editing: null }); }
  //setModal : fonction pour ouvrir/fermer la modale et spécifier si on édite un gNB existant.

  async function save() {
    if (!form.gnbId || !form.name) { setError('gNB ID and Name are required'); return; }
    setSaving(true); setError('');
    try {
      if (modal.editing) await api.gnbs.update(modal.editing._id, form);
      else               await api.gnbs.create(form);
      closeModal();
      loadGnbs();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  }

  async function remove(g: GnbEntry) {
    if (!confirm(`Delete ${g.name}?`)) return;
    await api.gnbs.remove(g._id);
    loadGnbs();
  }

  function liveForGnb(g: GnbEntry): LiveAssoc | undefined {
    return live.find(l => l.remoteIP === g.expectedIP || l.gnbId === g.gnbId);
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Radio className="text-blue-400" size={22} />
            RAN / gNBs
          </h1>
          <p className="text-gray-500 text-sm mt-1">gNodeB connections via NGAP — SCTP associations on AMF N2 interface</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className={`w-2 h-2 rounded-full ${polling ? 'bg-blue-400 animate-pulse' : 'bg-gray-700'}`} />
            {polling ? 'Polling…' : `Last polled: ${lastPoll}`}
          </div>
          <button
            onClick={pollLive}
            disabled={polling}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={polling ? 'animate-spin' : ''} />
            Poll SCTP
          </button>
          <button
            onClick={openRegister}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
          >
            <Plus size={13} />
            Register gNB
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total gNBs',    value: gnbs.length,          color: 'text-white',        sub: 'N2 interfaces registered' },
          { label: 'Connected',     value: connected,             color: 'text-emerald-400',  sub: 'SCTP ESTABLISHED', border: 'border-emerald-500/20' },
          { label: 'Disconnected',  value: live.length - connected, color: 'text-red-400',    sub: 'SCTP CLOSED / failed', border: 'border-red-500/20' },
          { label: 'Active UEs',    value: totalUEs,              color: 'text-blue-400',     sub: 'across all gNBs', border: 'border-blue-500/20' },
        ].map(c => (
          <div key={c.label} className={`bg-gray-900 border ${c.border || 'border-gray-800'} rounded-xl p-4`}>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">{c.label}</div>
            <div className={`text-3xl font-bold ${c.color}`}>{c.value}</div>
            <div className="text-xs text-gray-600 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Live SCTP associations */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Activity size={13} className="text-blue-400" /> Live SCTP Associations
          </span>
          <span className="text-xs text-gray-500">{live.length} association(s)</span>
        </div>
        {live.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500 text-sm">
            No active SCTP associations — gNBs will appear here when they connect to the AMF
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['Remote IP', 'Port', 'State', 'gNB Name', 'UEs', 'Assoc ID'].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {live.map((l, i) => {
                const isUp = l.sctpState === 'ESTABLISHED';
                const matched = gnbs.find(g => g.expectedIP === l.remoteIP || g.gnbId === l.gnbId);
                return (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3 text-gray-300 font-mono text-xs">{l.remoteIP}</td>
                    <td className="px-5 py-3 text-gray-500 font-mono text-xs">{l.remotePort}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isUp ? <Wifi size={11} /> : <WifiOff size={11} />}
                        {l.sctpState}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-300 text-xs">{matched?.name || l.name || <span className="text-gray-600 italic">unknown</span>}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{l.ueCount ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600 font-mono text-xs">{l.assocId}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Registered gNBs */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Registered gNBs</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-600 text-sm">Loading…</div>
        ) : gnbs.length === 0 ? (
          <div className="p-8 text-center text-gray-600 text-sm">No gNBs registered yet — click Register gNB to add one.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                {['gNB ID', 'Name', 'Type', 'Site', 'Expected IP', 'Status', 'Max UEs', ''].map(h => (
                  <th key={h} className="text-left px-5 py-2.5 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gnbs.map(g => {
                const assoc = liveForGnb(g);
                const isUp = assoc?.sctpState === 'ESTABLISHED';
                return (
                  <tr key={g._id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-5 py-3 text-gray-300 font-mono text-xs">{g.gnbId}</td>
                    <td className="px-5 py-3 text-white font-medium text-xs">{g.name}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{g.type}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{g.site || '—'}</td>
                    <td className="px-5 py-3 text-gray-400 font-mono text-xs">{g.expectedIP || '—'}</td>
                    <td className="px-5 py-3">
                      {assoc ? (
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                          {isUp ? <Wifi size={11} /> : <WifiOff size={11} />}
                          {assoc.sctpState}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-600 flex items-center gap-1.5"><Users size={11} />Not seen</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{g.maxUEs}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(g)} className="text-xs text-gray-500 hover:text-blue-400 transition-colors">Edit</button>
                        <button onClick={() => remove(g)} className="text-xs text-gray-500 hover:text-red-400 transition-colors">Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Register / Edit Modal */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <span className="font-semibold text-white">{modal.editing ? 'Edit gNB' : 'Register gNB'}</span>
              <button onClick={closeModal} className="text-gray-500 hover:text-white transition-colors"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg px-4 py-2 text-sm">{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'gnbId',      label: 'gNB ID *',       placeholder: 'e.g. 0x00e000' },
                  { key: 'name',       label: 'Name *',          placeholder: 'e.g. gNB-Lab-1' },
                  { key: 'type',       label: 'Type',            placeholder: 'gNB' },
                  { key: 'vendor',     label: 'Vendor',          placeholder: 'e.g. OAI' },
                  { key: 'version',    label: 'Software Version', placeholder: '2024.w25' },
                  { key: 'site',       label: 'Site / Location', placeholder: 'e.g. Building A' },
                  { key: 'expectedIP', label: 'Expected IP',     placeholder: '192.168.10.50' },
                  { key: 'maxUEs',     label: 'Max UEs',         placeholder: '128', type: 'number' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs text-gray-400 mb-1.5 font-medium">{f.label}</label>
                    <input
                      type={f.type || 'text'}
                      value={form[f.key]}
                      onChange={e => setForm((p: any) => ({ ...p, [f.key]: f.type === 'number' ? +e.target.value : e.target.value }))}
                      placeholder={f.placeholder}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5 font-medium">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm((p: any) => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-800">
              <button onClick={closeModal} className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors">Cancel</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50">
                <Save size={13} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
