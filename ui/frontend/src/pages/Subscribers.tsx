import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Plus, Search, Trash2, Edit2, X, Save, ChevronLeft, ChevronRight, Users,
  UserPlus, ChevronDown, ChevronUp, UserX,
} from 'lucide-react';
import { api } from '../api';
import Card from '../components/Card';

// ── Open5GS encodings (match the official WebUI) ─────────────────────────────
const PDN_TYPES   = [{ value: 1, label: 'IPv4' }, { value: 2, label: 'IPv6' }, { value: 3, label: 'IPv4v6' }];
const AMBR_UNITS  = [{ value: 0, label: 'bps' }, { value: 1, label: 'Kbps' }, { value: 2, label: 'Mbps' }, { value: 3, label: 'Gbps' }, { value: 4, label: 'Tbps' }];
const PREEMPTION  = [{ value: 1, label: 'Disabled' }, { value: 2, label: 'Enabled' }];

// ── Defaults (match reference dialog) ────────────────────────────────────────
const DEFAULT_KEY = '465B5CE8B199B49FAA5F0A2EE238A6BC';
const DEFAULT_OPC = 'E8ED289DEBA952E4283B54E88E6183CA';
const DEFAULT_AMF = '8000';

const newSession = () => ({
  name: 'internet',
  type: 3,
  pcc_rule: [] as any[],
  ambr: {
    downlink: { value: 1000000000, unit: 0 },
    uplink:   { value: 1000000000, unit: 0 },
  },
  qos: {
    index: 9,
    arp: { priority_level: 8, pre_emption_capability: 1, pre_emption_vulnerability: 2 },
  },
});

const newSlice = () => ({
  sst: 1,
  sd: '000001',
  default_indicator: true,
  session: [newSession()],
});

const DEFAULT_SUB = () => ({
  imsi: '',
  msisdn: [] as string[],
  imeisv: '',
  schema_version: 1,
  security: { k: DEFAULT_KEY, opc: DEFAULT_OPC, op: '', amf: DEFAULT_AMF, sqn: 0 },
  ambr: {
    downlink: { value: 1000000000, unit: 0 },
    uplink:   { value: 1000000000, unit: 0 },
  },
  slice: [newSlice()],
});

const DEFAULT_BULK = {
  startImsi: '',
  numOfUe: 1,
  key: DEFAULT_KEY,
  opc: DEFAULT_OPC,
  dnn: 'internet',
  sst: 1,
  sd: '000001',
};

type ModalMode = null | 'create' | 'edit' | 'bulk';
type FormTab   = 'basic' | 'security' | 'slices';

export default function Subscribers() {
  const [data, setData]       = useState<any>({ subscribers: [], total: 0, page: 1, pages: 1 });
  const [search, setSearch]   = useState('');
  const [page, setPage]       = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [modal, setModal]     = useState<ModalMode>(null);
  const [tab, setTab]         = useState<FormTab>('basic');
  const [formData, setFormData] = useState<any>(DEFAULT_SUB());
  const [bulkData, setBulkData] = useState<any>(DEFAULT_BULK);
  const [selectedImsi, setSelectedImsi] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.subscribers.list(page, pageSize, search);
      setData(res);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, pageSize, search]);

  useEffect(() => { load(); }, [load]);

  // ── Modal open helpers ──
  const openCreate = () => { setFormData(DEFAULT_SUB()); setSelectedImsi(null); setError(''); setTab('basic'); setModal('create'); };
  const openBulk   = () => { setBulkData({ ...DEFAULT_BULK }); setError(''); setModal('bulk'); };
  const openEdit   = async (imsi: string) => {
    setError('');
    try {
      const sub = await api.subscribers.get(imsi);
      // Backfill missing optional fields so the form bindings don't crash
      const filled = {
        ...DEFAULT_SUB(), ...sub,
        security: { ...DEFAULT_SUB().security, ...(sub.security || {}) },
        ambr:     { ...DEFAULT_SUB().ambr,     ...(sub.ambr     || {}) },
        slice: (sub.slice && sub.slice.length ? sub.slice : [newSlice()]).map((s: any) => ({
          ...newSlice(), ...s,
          session: (s.session && s.session.length ? s.session : [newSession()]).map((sess: any) => ({
            ...newSession(), ...sess,
            ambr: { ...newSession().ambr, ...(sess.ambr || {}) },
            qos:  { ...newSession().qos,  ...(sess.qos  || {}), arp: { ...newSession().qos.arp, ...(sess.qos?.arp || {}) } },
          })),
        })),
      };
      setFormData(filled);
      setSelectedImsi(imsi);
      setTab('basic');
      setModal('edit');
    } catch (e: any) { setError(e.message); }
  };

  // ── Save / Delete ──
  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      if (modal === 'create') await api.subscribers.create(formData);
      else if (modal === 'edit') await api.subscribers.update(selectedImsi!, formData);
      setModal(null); load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleBulkSave = async () => {
    setSaving(true); setError('');
    try {
      const res = await api.subscribers.bulkGenerate(bulkData);
      setModal(null); load();
      alert(`Created ${res.created} subscriber(s), skipped ${res.skipped} existing.`);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (imsi: string) => {
    if (!confirm(`Delete subscriber ${imsi}?`)) return;
    try { await api.subscribers.delete(imsi); load(); }
    catch (e: any) { setError(e.message); }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} subscriber(s)? This cannot be undone.`)) return;
    try {
      await api.subscribers.bulkDelete(Array.from(selected));
      setSelected(new Set()); load();
    } catch (e: any) { setError(e.message); }
  };

  // ── Selection helpers ──
  const toggleSelect = (imsi: string) =>
    setSelected(s => { const n = new Set(s); n.has(imsi) ? n.delete(imsi) : n.add(imsi); return n; });
  const toggleSelectAll = () => {
    const visible = data.subscribers.map((s: any) => s.imsi);
    const allSelected = visible.every((i: string) => selected.has(i));
    setSelected(s => {
      const n = new Set(s);
      if (allSelected) visible.forEach((i: string) => n.delete(i));
      else             visible.forEach((i: string) => n.add(i));
      return n;
    });
  };

  // ── Form mutators (slices/sessions) ──
  const updateSlice = (i: number, patch: any) =>
    setFormData((f: any) => ({ ...f, slice: f.slice.map((s: any, idx: number) => idx === i ? { ...s, ...patch } : s) }));
  const addSlice = () => setFormData((f: any) => ({ ...f, slice: [...f.slice, newSlice()] }));
  const removeSlice = (i: number) =>
    setFormData((f: any) => f.slice.length > 1 ? { ...f, slice: f.slice.filter((_: any, idx: number) => idx !== i) } : f);

  const updateSession = (si: number, gi: number, patch: any) =>
    setFormData((f: any) => ({
      ...f,
      slice: f.slice.map((s: any, idx: number) => idx !== si ? s : {
        ...s, session: s.session.map((sess: any, j: number) => j === gi ? { ...sess, ...patch } : sess),
      }),
    }));
  const addSession = (si: number) =>
    setFormData((f: any) => ({
      ...f,
      slice: f.slice.map((s: any, idx: number) => idx === si ? { ...s, session: [...s.session, newSession()] } : s),
    }));
  const removeSession = (si: number, gi: number) =>
    setFormData((f: any) => ({
      ...f,
      slice: f.slice.map((s: any, idx: number) => idx !== si ? s : {
        ...s, session: s.session.length > 1 ? s.session.filter((_: any, j: number) => j !== gi) : s.session,
      }),
    }));

  const allOnPageSelected = useMemo(
    () => data.subscribers.length > 0 && data.subscribers.every((s: any) => selected.has(s.imsi)),
    [data.subscribers, selected],
  );

  return (
    <div className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Users className="text-blue-400" size={22} /> Subscribers
          </h1>
          <p className="text-gray-500 text-sm mt-1">UE provisioning — Open5GS subscribers in MongoDB</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button onClick={handleBulkDelete}
              className="flex items-center gap-2 px-3 py-2 bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-red-300 rounded-lg text-sm transition-colors">
              <Trash2 size={14} /> Delete Selected ({selected.size})
            </button>
          )}
          <button onClick={openBulk}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-sm transition-colors">
            <Users size={14} /> Bulk Add
          </button>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
            <UserPlus size={14} /> Add Subscriber
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm">{error}</div>
      )}

      {/* ── Toolbar + table ── */}
      <Card>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by IMSI..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <span className="px-2.5 py-1 rounded-full bg-gray-800 text-gray-400 text-xs">
              {data.total} total
            </span>
          </div>
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
          >
            {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left py-2 px-2 w-8">
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll}
                    className="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500" />
                </th>
                <th className="text-left py-2 font-medium">IMSI</th>
                <th className="text-left py-2 font-medium">MSISDN</th>
                <th className="text-left py-2 font-medium">Auth Key (K)</th>
                <th className="text-left py-2 font-medium">Slices</th>
                <th className="text-left py-2 font-medium">Sessions / APNs</th>
                <th className="text-left py-2 font-medium">UE AMBR</th>
                <th className="text-right py-2 font-medium pr-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="py-8 text-center text-gray-500">Loading…</td></tr>
              )}
              {!loading && data.subscribers.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12">
                    <div className="flex flex-col items-center gap-3 text-gray-500">
                      <UserX size={32} className="text-gray-600" />
                      <div className="text-sm">{search ? 'No subscribers match your search.' : 'No subscribers configured yet.'}</div>
                      {!search && (
                        <button onClick={openCreate}
                          className="mt-2 flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
                          <UserPlus size={14} /> Add First Subscriber
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {!loading && data.subscribers.map((sub: any) => (
                <tr key={sub.imsi} className={`border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors ${selected.has(sub.imsi) ? 'bg-blue-500/5' : ''}`}>
                  <td className="py-2.5 px-2">
                    <input type="checkbox" checked={selected.has(sub.imsi)} onChange={() => toggleSelect(sub.imsi)}
                      className="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500" />
                  </td>
                  <td className="py-2.5 font-mono text-white text-xs">{sub.imsi}</td>
                  <td className="py-2.5 text-gray-400 text-xs">{sub.msisdn?.[0] || '—'}</td>
                  <td className="py-2.5 font-mono text-gray-500 text-xs">{maskKey(sub.security?.k)}</td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(sub.slice || []).map((s: any, i: number) => (
                        <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 text-xs border border-purple-500/30">
                          SST={s.sst}{s.sd ? `/SD=${s.sd}` : ''}
                        </span>
                      ))}
                      {(!sub.slice || sub.slice.length === 0) && <span className="text-gray-600 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {(sub.slice || []).flatMap((s: any) =>
                        (s.session || []).map((sess: any, i: number) => (
                          <span key={`${s.sst}-${sess.name}-${i}`} className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-xs border border-emerald-500/30">
                            {sess.name}
                          </span>
                        )),
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 text-gray-400 text-xs">
                    <span title="Downlink / Uplink">{formatAMBR(sub.ambr?.downlink)} ↓ / {formatAMBR(sub.ambr?.uplink)} ↑</span>
                  </td>
                  <td className="py-2.5 text-right pr-2">
                    <button onClick={() => openEdit(sub.imsi)} className="p-1.5 text-gray-500 hover:text-blue-400 mr-1" title="Edit"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(sub.imsi)} className="p-1.5 text-gray-500 hover:text-red-400" title="Delete"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.pages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800">
            <span className="text-xs text-gray-500">Page {page} of {data.pages} • showing {data.subscribers.length} of {data.total}</span>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                className="p-1.5 rounded border border-gray-700 text-gray-400 disabled:opacity-40 hover:border-gray-600">
                <ChevronLeft size={14} />
              </button>
              <button disabled={page === data.pages} onClick={() => setPage(p => p + 1)}
                className="p-1.5 rounded border border-gray-700 text-gray-400 disabled:opacity-40 hover:border-gray-600">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ── Add / Edit modal (tabbed) ── */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <UserPlus size={16} className="text-blue-400" />
                {modal === 'create' ? 'Add Subscriber' : `Edit ${selectedImsi}`}
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800 px-5">
              {([
                ['basic',    'Basic Info'],
                ['security', 'Security'],
                ['slices',   'Slices & Sessions'],
              ] as [FormTab, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)}
                  className={`px-4 py-3 text-sm transition-colors border-b-2 -mb-px ${
                    tab === id ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded text-sm">{error}</div>}

              {/* ─── Tab 1: Basic ─── */}
              {tab === 'basic' && (
                <div className="space-y-5">
                  <div>
                    <SectionTitle>Subscriber Identity</SectionTitle>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="IMSI (5–15 digits)" value={formData.imsi}
                        onChange={(v) => setFormData((f: any) => ({ ...f, imsi: v.replace(/\D/g, '') }))}
                        disabled={modal === 'edit'} placeholder="001010000000001" mono />
                      <Field label="MSISDN (optional)" value={formData.msisdn?.[0] || ''}
                        onChange={(v) => setFormData((f: any) => ({ ...f, msisdn: v ? [v] : [] }))}
                        placeholder="821012345678" />
                    </div>
                    <div className="mt-3">
                      <Field label="IMEISV (optional)" value={formData.imeisv || ''}
                        onChange={(v) => setFormData((f: any) => ({ ...f, imeisv: v }))}
                        placeholder="4301816125816151" />
                    </div>
                  </div>

                  <div>
                    <SectionTitle>UE Aggregate Maximum Bit Rate (AMBR)</SectionTitle>
                    <div className="grid grid-cols-4 gap-3">
                      <Field label="DL Value" type="number"
                        value={String(formData.ambr.downlink.value)}
                        onChange={(v) => setFormData((f: any) => ({ ...f, ambr: { ...f.ambr, downlink: { ...f.ambr.downlink, value: Number(v) } } }))} />
                      <Select label="DL Unit" value={formData.ambr.downlink.unit} options={AMBR_UNITS}
                        onChange={(v) => setFormData((f: any) => ({ ...f, ambr: { ...f.ambr, downlink: { ...f.ambr.downlink, unit: v } } }))} />
                      <Field label="UL Value" type="number"
                        value={String(formData.ambr.uplink.value)}
                        onChange={(v) => setFormData((f: any) => ({ ...f, ambr: { ...f.ambr, uplink: { ...f.ambr.uplink, value: Number(v) } } }))} />
                      <Select label="UL Unit" value={formData.ambr.uplink.unit} options={AMBR_UNITS}
                        onChange={(v) => setFormData((f: any) => ({ ...f, ambr: { ...f.ambr, uplink: { ...f.ambr.uplink, unit: v } } }))} />
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Tab 2: Security ─── */}
              {tab === 'security' && (
                <div className="space-y-5">
                  <div>
                    <SectionTitle>Authentication Credentials</SectionTitle>
                    <Field label="Authentication Key (K) — 32 hex chars" value={formData.security.k}
                      onChange={(v) => setFormData((f: any) => ({ ...f, security: { ...f.security, k: v } }))}
                      placeholder={DEFAULT_KEY} mono />
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <Field label="OPc — 32 hex chars" value={formData.security.opc}
                        onChange={(v) => setFormData((f: any) => ({ ...f, security: { ...f.security, opc: v } }))}
                        placeholder={DEFAULT_OPC} mono />
                      <Field label="OP (leave empty if using OPc)" value={formData.security.op || ''}
                        onChange={(v) => setFormData((f: any) => ({ ...f, security: { ...f.security, op: v || null } }))}
                        mono />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <Field label="AMF" value={formData.security.amf}
                        onChange={(v) => setFormData((f: any) => ({ ...f, security: { ...f.security, amf: v } }))}
                        placeholder={DEFAULT_AMF} mono />
                      <Field label="SQN" type="number" value={String(formData.security.sqn ?? 0)}
                        onChange={(v) => setFormData((f: any) => ({ ...f, security: { ...f.security, sqn: Number(v) } }))} />
                    </div>
                  </div>
                </div>
              )}

              {/* ─── Tab 3: Slices & Sessions ─── */}
              {tab === 'slices' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <SectionTitle inline>Network Slices</SectionTitle>
                    <button onClick={addSlice}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-xs">
                      <Plus size={12} /> Add Slice
                    </button>
                  </div>

                  {formData.slice.map((s: any, si: number) => (
                    <SlicePanel key={si} slice={s} index={si} canRemove={formData.slice.length > 1}
                      onChange={(patch) => updateSlice(si, patch)}
                      onRemove={() => removeSlice(si)}
                      onAddSession={() => addSession(si)}
                      onUpdateSession={(gi, patch) => updateSession(si, gi, patch)}
                      onRemoveSession={(gi) => removeSession(si, gi)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-5 border-t border-gray-800">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving || !formData.imsi}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
                <Save size={14} /> {saving ? 'Saving…' : (modal === 'edit' ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk add modal ── */}
      {modal === 'bulk' && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Users size={16} className="text-blue-400" /> Bulk Add Subscribers
              </h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded text-sm">{error}</div>}
              <p className="text-xs text-gray-500">Generate a range of subscribers starting from the given IMSI. Existing IMSIs are skipped.</p>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Start IMSI (15 digits)" mono value={bulkData.startImsi}
                  onChange={(v) => setBulkData((d: any) => ({ ...d, startImsi: v.replace(/\D/g, '') }))}
                  placeholder="001010000000001" />
                <Field label="Number of UEs (max 1000)" type="number" value={String(bulkData.numOfUe)}
                  onChange={(v) => setBulkData((d: any) => ({ ...d, numOfUe: Math.min(1000, Math.max(1, Number(v))) }))} />
              </div>

              <SectionTitle>Security</SectionTitle>
              <Field label="Authentication Key (K)" mono value={bulkData.key}
                onChange={(v) => setBulkData((d: any) => ({ ...d, key: v }))} placeholder={DEFAULT_KEY} />
              <Field label="OPc" mono value={bulkData.opc}
                onChange={(v) => setBulkData((d: any) => ({ ...d, opc: v }))} placeholder={DEFAULT_OPC} />

              <SectionTitle>Slice / Session</SectionTitle>
              <div className="grid grid-cols-3 gap-3">
                <Field label="DNN / APN" value={bulkData.dnn}
                  onChange={(v) => setBulkData((d: any) => ({ ...d, dnn: v }))} placeholder="internet" />
                <Field label="SST" type="number" value={String(bulkData.sst)}
                  onChange={(v) => setBulkData((d: any) => ({ ...d, sst: Number(v) }))} />
                <Field label="SD (hex)" value={bulkData.sd}
                  onChange={(v) => setBulkData((d: any) => ({ ...d, sd: v }))} placeholder="000001" />
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-800">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleBulkSave} disabled={saving || !bulkData.startImsi}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
                <Users size={14} /> {saving ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SlicePanel({
  slice, index, canRemove, onChange, onRemove, onAddSession, onUpdateSession, onRemoveSession,
}: {
  slice: any; index: number; canRemove: boolean;
  onChange: (patch: any) => void;
  onRemove: () => void;
  onAddSession: () => void;
  onUpdateSession: (gi: number, patch: any) => void;
  onRemoveSession: (gi: number) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/40 overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-white">Slice {index + 1}</span>
          <span className="text-gray-500">SST={slice.sst}{slice.sd ? ` /SD=${slice.sd}` : ''}</span>
          {slice.default_indicator && <span className="px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 text-xs border border-blue-500/30">Default</span>}
          <span className="text-gray-600 text-xs">· {slice.session.length} session(s)</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-800">
          <div className="grid grid-cols-3 gap-3 pt-3">
            <Field label="SST (0–255)" type="number" value={String(slice.sst)}
              onChange={(v) => onChange({ sst: Number(v) })} />
            <Field label="SD (hex, optional)" value={slice.sd || ''}
              onChange={(v) => onChange({ sd: v })} placeholder="000001" />
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input type="checkbox" checked={!!slice.default_indicator}
                  onChange={(e) => onChange({ default_indicator: e.target.checked })}
                  className="rounded bg-gray-800 border-gray-600 text-blue-500 focus:ring-blue-500" />
                Default Slice
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sessions / APNs</span>
            <button type="button" onClick={onAddSession}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-md text-xs">
              <Plus size={11} /> Add Session
            </button>
          </div>

          {slice.session.map((sess: any, gi: number) => (
            <SessionCard key={gi} session={sess} index={gi} canRemove={slice.session.length > 1}
              onChange={(patch) => onUpdateSession(gi, patch)}
              onRemove={() => onRemoveSession(gi)} />
          ))}

          <div className="flex justify-end pt-2">
            <button type="button" onClick={onRemove} disabled={!canRemove}
              className="flex items-center gap-1.5 px-2.5 py-1 text-red-400 hover:bg-red-500/10 rounded-md text-xs disabled:opacity-40 disabled:cursor-not-allowed">
              <Trash2 size={11} /> Remove Slice
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionCard({
  session, index, canRemove, onChange, onRemove,
}: {
  session: any; index: number; canRemove: boolean;
  onChange: (patch: any) => void; onRemove: () => void;
}) {
  const setAmbr = (dir: 'downlink' | 'uplink', field: 'value' | 'unit', val: number) =>
    onChange({ ambr: { ...session.ambr, [dir]: { ...session.ambr[dir], [field]: val } } });
  const setQos = (field: string, val: number) =>
    onChange({ qos: { ...session.qos, [field]: val } });
  const setArp = (field: string, val: number) =>
    onChange({ qos: { ...session.qos, arp: { ...session.qos.arp, [field]: val } } });

  return (
    <div className="border border-gray-800 rounded-lg p-3 bg-gray-950/40 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">Session {index + 1}: <span className="text-white">{session.name}</span></span>
        <button type="button" onClick={onRemove} disabled={!canRemove}
          className="p-1 text-red-400 hover:bg-red-500/10 rounded disabled:opacity-40 disabled:cursor-not-allowed" title="Remove session">
          <Trash2 size={12} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="DNN / APN" value={session.name}
          onChange={(v) => onChange({ name: v })} placeholder="internet" />
        <Select label="PDN Type" value={session.type} options={PDN_TYPES}
          onChange={(v) => onChange({ type: v })} />
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1.5">Session AMBR</div>
        <div className="grid grid-cols-4 gap-2">
          <Field label="DL Value" type="number" value={String(session.ambr.downlink.value)}
            onChange={(v) => setAmbr('downlink', 'value', Number(v))} />
          <Select label="DL Unit" value={session.ambr.downlink.unit} options={AMBR_UNITS}
            onChange={(v) => setAmbr('downlink', 'unit', v)} />
          <Field label="UL Value" type="number" value={String(session.ambr.uplink.value)}
            onChange={(v) => setAmbr('uplink', 'value', Number(v))} />
          <Select label="UL Unit" value={session.ambr.uplink.unit} options={AMBR_UNITS}
            onChange={(v) => setAmbr('uplink', 'unit', v)} />
        </div>
      </div>

      <div>
        <div className="text-xs text-gray-500 mb-1.5">QoS</div>
        <div className="grid grid-cols-4 gap-2">
          <Field label="5QI Index" type="number" value={String(session.qos.index)}
            onChange={(v) => setQos('index', Number(v))} />
          <Field label="ARP Priority (1–15)" type="number" value={String(session.qos.arp.priority_level)}
            onChange={(v) => setArp('priority_level', Number(v))} />
          <Select label="Pre-empt Cap." value={session.qos.arp.pre_emption_capability} options={PREEMPTION}
            onChange={(v) => setArp('pre_emption_capability', v)} />
          <Select label="Pre-empt Vuln." value={session.qos.arp.pre_emption_vulnerability} options={PREEMPTION}
            onChange={(v) => setArp('pre_emption_vulnerability', v)} />
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return <div className={`text-xs font-semibold text-gray-400 uppercase tracking-wider ${inline ? '' : 'mb-2'}`}>{children}</div>;
}

function Field({
  label, value, onChange, disabled, placeholder, mono, type = 'text',
}: {
  label: string; value: string; onChange?: (v: string) => void;
  disabled?: boolean; placeholder?: string; mono?: boolean; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input
        type={type} value={value}
        onChange={onChange ? (e => onChange(e.target.value)) : undefined}
        readOnly={!onChange} disabled={disabled} placeholder={placeholder}
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

function Select({
  label, value, options, onChange,
}: {
  label: string; value: number; options: { value: number; label: string }[];
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function maskKey(k?: string): string {
  if (!k) return '—';
  if (k.length <= 8) return '••••••••';
  return `${k.slice(0, 4)}••••••••••••••••••••••••${k.slice(-4)}`;
}

function formatAMBR(ambr?: any): string {
  if (!ambr) return '—';
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
  return `${ambr.value} ${units[ambr.unit] ?? 'bps'}`;
}