import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, Edit2, Trash2, Play, PauseCircle, ChevronDown, ChevronUp,
  Cpu, MemoryStick, Layers, CheckCircle2, XCircle, Clock, X, Save,
  RefreshCw, Zap, Network,
} from 'lucide-react';
import { api } from '../api';
import { NetworkSlice, NFAllocation } from '../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_NFS = ['nrf', 'ausf', 'udm', 'udr', 'pcf', 'nssf', 'bsf', 'amf', 'smf', 'upf'];

const NF_ROLES: Record<string, string> = {
  nrf: 'Repository', ausf: 'Auth Server', udm: 'User Data Mgmt',
  udr: 'User Data Repo', pcf: 'Policy Control', nssf: 'Slice Selection',
  bsf: 'Binding Support', amf: 'Access & Mobility', smf: 'Session Mgmt', upf: 'User Plane',
};

const NF_REQUIRED = ['nrf', 'ausf', 'udm', 'udr', 'pcf', 'amf', 'smf', 'upf'];

const UNIT_LABELS = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];

const PRESET_SLICES = [
  { label: 'eMBB', sst: 1, sd: '000001', color: '#3b82f6', dnn: 'internet', ambr: { dl: 1000, ul: 500 } },
  { label: 'URLLC', sst: 2, sd: '000002', color: '#f59e0b', dnn: 'urllc',   ambr: { dl: 100,  ul: 100 } },
  { label: 'mIoT',  sst: 3, sd: '000003', color: '#10b981', dnn: 'miot',    ambr: { dl: 10,   ul: 10  } },
];

const SLICE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

const DEFAULT_NF_ALLOC = (name: string): NFAllocation => ({
  name,
  enabled: NF_REQUIRED.includes(name),
  cpu: { request: '100m', limit: '500m' },
  memory: { request: '64Mi', limit: '256Mi' },
  replicas: 1,
});

const DEFAULT_SLICE: Omit<NetworkSlice, '_id'> = {
  name: '',
  description: '',
  sst: 1,
  sd: '000001',
  color: '#3b82f6',
  status: 'draft',
  dnn: 'internet',
  subnet: '10.45.0.0/16',
  dns: ['8.8.8.8', '8.8.4.4'],
  ambr: { downlink: { value: 1000, unit: 3 }, uplink: { value: 500, unit: 3 } },
  qos: { index: 9, arp: { priority_level: 8, pre_emption_capability: 1, pre_emption_vulnerability: 1 } },
  mtu: 1400,
  priority: 1,
  networkFunctions: ALL_NFS.map(DEFAULT_NF_ALLOC),
};

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  active:   { label: 'Active',   bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', dot: 'bg-emerald-400' },
  inactive: { label: 'Inactive', bg: 'bg-gray-500/20',    text: 'text-gray-400',    border: 'border-gray-500/30',    dot: 'bg-gray-400'    },
  draft:    { label: 'Draft',    bg: 'bg-yellow-500/20',  text: 'text-yellow-400',  border: 'border-yellow-500/30',  dot: 'bg-yellow-400'  },
};

function SliceBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.bg} ${c.text} ${c.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ── Field component ───────────────────────────────────────────────────────────

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder = '', type = 'text', disabled = false, mono = false, className = '' }: any) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600
        focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors ${mono ? 'font-mono' : ''} ${className}`}
    />
  );
}

function Select({ value, onChange, children, className = '' }: any) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100
        focus:outline-none focus:border-blue-500 transition-colors ${className}`}
    >
      {children}
    </select>
  );
}

// ── NF Resource Row ───────────────────────────────────────────────────────────

function NFResourceRow({
  alloc, onChange,
}: {
  alloc: NFAllocation;
  onChange: (updated: NFAllocation) => void;
}) {
  const set = (patch: Partial<NFAllocation>) => onChange({ ...alloc, ...patch });
  const setCpu = (patch: Partial<NFAllocation['cpu']>) => set({ cpu: { ...alloc.cpu, ...patch } });
  const setMem = (patch: Partial<NFAllocation['memory']>) => set({ memory: { ...alloc.memory, ...patch } });
  const required = NF_REQUIRED.includes(alloc.name);

  return (
    <div className={`grid grid-cols-12 gap-2 items-center py-2 px-3 rounded-lg transition-colors ${
      alloc.enabled ? 'bg-gray-800/60' : 'bg-gray-900/40 opacity-60'
    }`}>
      {/* Enable toggle */}
      <div className="col-span-1 flex justify-center">
        <button
          onClick={() => !required && set({ enabled: !alloc.enabled })}
          title={required ? 'Required NF' : alloc.enabled ? 'Disable' : 'Enable'}
          className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            alloc.enabled
              ? 'bg-blue-600 border-blue-600'
              : 'border-gray-600 hover:border-gray-500'
          } ${required ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {alloc.enabled && <span className="text-white text-[10px] font-bold">✓</span>}
        </button>
      </div>

      {/* NF name */}
      <div className="col-span-2">
        <div className="font-mono text-xs font-semibold text-white uppercase">{alloc.name}</div>
        <div className="text-[10px] text-gray-500">{NF_ROLES[alloc.name]}</div>
      </div>

      {/* Replicas */}
      <div className="col-span-1">
        <input
          type="number" min={1} max={10}
          value={alloc.replicas}
          onChange={e => set({ replicas: Number(e.target.value) })}
          disabled={!alloc.enabled}
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-40 text-center"
        />
      </div>

      {/* CPU request */}
      <div className="col-span-2">
        <input
          value={alloc.cpu.request}
          onChange={e => setCpu({ request: e.target.value })}
          disabled={!alloc.enabled}
          placeholder="100m"
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-40"
        />
      </div>

      {/* CPU limit */}
      <div className="col-span-2">
        <input
          value={alloc.cpu.limit}
          onChange={e => setCpu({ limit: e.target.value })}
          disabled={!alloc.enabled}
          placeholder="500m"
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-40"
        />
      </div>

      {/* Memory request */}
      <div className="col-span-2">
        <input
          value={alloc.memory.request}
          onChange={e => setMem({ request: e.target.value })}
          disabled={!alloc.enabled}
          placeholder="64Mi"
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-40"
        />
      </div>

      {/* Memory limit */}
      <div className="col-span-2">
        <input
          value={alloc.memory.limit}
          onChange={e => setMem({ limit: e.target.value })}
          disabled={!alloc.enabled}
          placeholder="256Mi"
          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs font-mono text-gray-100 focus:outline-none focus:border-blue-500 disabled:opacity-40"
        />
      </div>
    </div>
  );
}

// ── Slice Form Modal ──────────────────────────────────────────────────────────

function SliceModal({
  initial,
  onSave,
  onClose,
}: {
  initial: Partial<NetworkSlice>;
  onSave: (data: any) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<any>({
    ...DEFAULT_SLICE,
    ...initial,
    networkFunctions: initial.networkFunctions?.length
      ? initial.networkFunctions
      : ALL_NFS.map(DEFAULT_NF_ALLOC),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'basic' | 'nfs' | 'qos'>('basic');

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const setNF = (updated: NFAllocation) => {
    setForm((f: any) => ({
      ...f,
      networkFunctions: f.networkFunctions.map((n: NFAllocation) =>
        n.name === updated.name ? updated : n
      ),
    }));
  };

  const applyPreset = (preset: typeof PRESET_SLICES[0]) => {
    set({
      sst: preset.sst, sd: preset.sd, color: preset.color,
      dnn: preset.dnn,
      name: form.name || preset.label,
      ambr: {
        downlink: { value: preset.ambr.dl, unit: 3 },
        uplink:   { value: preset.ambr.ul, unit: 3 },
      },
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Slice name is required');
    setSaving(true);
    setError('');
    try {
      await onSave(form);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  const enabledCount = form.networkFunctions.filter((n: NFAllocation) => n.enabled).length;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: form.color }} />
            <h2 className="font-semibold text-white text-lg">
              {initial._id ? `Edit Slice — ${initial.name}` : 'New Network Slice'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4">
          {(['basic', 'nfs', 'qos'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm capitalize font-medium transition-colors ${
                tab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}>
              {t === 'nfs' ? `Network Functions (${enabledCount})` : t === 'qos' ? 'QoS & DNN' : 'Basic'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* ── BASIC TAB ── */}
          {tab === 'basic' && (
            <div className="space-y-5">
              {/* Presets */}
              <div>
                <div className="text-xs font-medium text-gray-400 mb-2">Quick Presets</div>
                <div className="flex gap-2">
                  {PRESET_SLICES.map(p => (
                    <button key={p.label} onClick={() => applyPreset(p)}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-700 hover:border-gray-500 transition-colors text-gray-300 hover:text-white">
                      <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      {p.label} (SST={p.sst})
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Slice Name *">
                  <Input value={form.name} onChange={(v: string) => set({ name: v })} placeholder="e.g. eMBB-slice-1" />
                </Field>
                <Field label="Description">
                  <Input value={form.description} onChange={(v: string) => set({ description: v })} placeholder="Optional description" />
                </Field>
                <Field label="SST (Slice/Service Type)">
                  <Select value={form.sst} onChange={(v: string) => set({ sst: Number(v) })}>
                    <option value={1}>1 — eMBB (Enhanced Mobile Broadband)</option>
                    <option value={2}>2 — URLLC (Ultra-Reliable Low Latency)</option>
                    <option value={3}>3 — mIoT (Massive IoT)</option>
                    <option value={4}>4 — V2X (Vehicle-to-Everything)</option>
                    <option value={5}>5 — HMTC (High-density MTC)</option>
                  </Select>
                </Field>
                <Field label="SD (Slice Differentiator, hex)">
                  <Input value={form.sd} onChange={(v: string) => set({ sd: v })} placeholder="000001" mono />
                </Field>
                <Field label="Color">
                  <div className="flex gap-2 flex-wrap">
                    {SLICE_COLORS.map(c => (
                      <button key={c} onClick={() => set({ color: c })}
                        className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${form.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900' : ''}`}
                        style={{ background: c }} />
                    ))}
                  </div>
                </Field>
                <Field label="Priority (1=highest)">
                  <input type="number" min={1} max={127} value={form.priority}
                    onChange={e => set({ priority: Number(e.target.value) })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500" />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-800">
                <Field label="DL AMBR (value)">
                  <input type="number" value={form.ambr.downlink.value}
                    onChange={e => set({ ambr: { ...form.ambr, downlink: { ...form.ambr.downlink, value: Number(e.target.value) } } })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500" />
                </Field>
                <Field label="DL AMBR (unit)">
                  <Select value={form.ambr.downlink.unit} onChange={(v: string) => set({ ambr: { ...form.ambr, downlink: { ...form.ambr.downlink, unit: Number(v) } } })}>
                    {UNIT_LABELS.map((u, i) => <option key={i} value={i}>{u}</option>)}
                  </Select>
                </Field>
                <Field label="UL AMBR (value)">
                  <input type="number" value={form.ambr.uplink.value}
                    onChange={e => set({ ambr: { ...form.ambr, uplink: { ...form.ambr.uplink, value: Number(e.target.value) } } })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500" />
                </Field>
                <Field label="UL AMBR (unit)">
                  <Select value={form.ambr.uplink.unit} onChange={(v: string) => set({ ambr: { ...form.ambr, uplink: { ...form.ambr.uplink, unit: Number(v) } } })}>
                    {UNIT_LABELS.map((u, i) => <option key={i} value={i}>{u}</option>)}
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {/* ── NFS TAB ── */}
          {tab === 'nfs' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                Configure CPU/memory resource allocation for each network function in this slice.
                Required NFs (marked ✓) cannot be disabled.
              </p>
              {/* Header row */}
              <div className="grid grid-cols-12 gap-2 px-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                <div className="col-span-1">En.</div>
                <div className="col-span-2">NF</div>
                <div className="col-span-1">Replicas</div>
                <div className="col-span-2">CPU Req</div>
                <div className="col-span-2">CPU Limit</div>
                <div className="col-span-2">Mem Req</div>
                <div className="col-span-2">Mem Limit</div>
              </div>
              {form.networkFunctions.map((nf: NFAllocation) => (
                <NFResourceRow key={nf.name} alloc={nf} onChange={setNF} />
              ))}

              {/* Quick presets */}
              <div className="pt-3 border-t border-gray-800">
                <div className="text-xs font-medium text-gray-400 mb-2">Resource Presets</div>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: 'Minimal', cpu: { request: '50m', limit: '200m' }, memory: { request: '32Mi', limit: '128Mi' } },
                    { label: 'Standard', cpu: { request: '100m', limit: '500m' }, memory: { request: '64Mi', limit: '256Mi' } },
                    { label: 'Performance', cpu: { request: '250m', limit: '1000m' }, memory: { request: '128Mi', limit: '512Mi' } },
                    { label: 'High', cpu: { request: '500m', limit: '2000m' }, memory: { request: '256Mi', limit: '1Gi' } },
                  ].map(preset => (
                    <button key={preset.label}
                      onClick={() => setForm((f: any) => ({
                        ...f,
                        networkFunctions: f.networkFunctions.map((nf: NFAllocation) =>
                          nf.enabled ? { ...nf, cpu: preset.cpu, memory: preset.memory } : nf
                        ),
                      }))}
                      className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-lg border border-gray-700 transition-colors">
                      Apply {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── QoS TAB ── */}
          {tab === 'qos' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Data Network Name (DNN)">
                  <Input value={form.dnn} onChange={(v: string) => set({ dnn: v })} placeholder="internet" mono />
                </Field>
                <Field label="UE Subnet">
                  <Input value={form.subnet} onChange={(v: string) => set({ subnet: v })} placeholder="10.45.0.0/16" mono />
                </Field>
                <Field label="DNS Servers (comma-separated)">
                  <Input
                    value={form.dns.join(', ')}
                    onChange={(v: string) => set({ dns: v.split(',').map((s: string) => s.trim()).filter(Boolean) })}
                    placeholder="8.8.8.8, 8.8.4.4"
                    mono
                  />
                </Field>
                <Field label="MTU">
                  <input type="number" value={form.mtu} min={576} max={9000}
                    onChange={e => set({ mtu: Number(e.target.value) })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500" />
                </Field>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">5QI / QoS</div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="5QI Index">
                    <Select value={form.qos.index}
                      onChange={(v: string) => set({ qos: { ...form.qos, index: Number(v) } })}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 65, 66, 67, 69, 70, 75, 79, 80, 82, 83, 84, 85].map(i => (
                        <option key={i} value={i}>5QI {i}{i === 9 ? ' (default, non-GBR)' : i <= 4 ? ' (GBR)' : ''}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="ARP Priority Level (1–15)">
                    <input type="number" min={1} max={15}
                      value={form.qos.arp.priority_level}
                      onChange={e => set({ qos: { ...form.qos, arp: { ...form.qos.arp, priority_level: Number(e.target.value) } } })}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500" />
                  </Field>
                  <Field label="Pre-emption Capability">
                    <Select value={form.qos.arp.pre_emption_capability}
                      onChange={(v: string) => set({ qos: { ...form.qos, arp: { ...form.qos.arp, pre_emption_capability: Number(v) } } })}>
                      <option value={1}>1 — May preempt</option>
                      <option value={2}>2 — Shall not preempt</option>
                    </Select>
                  </Field>
                  <Field label="Pre-emption Vulnerability">
                    <Select value={form.qos.arp.pre_emption_vulnerability}
                      onChange={(v: string) => set({ qos: { ...form.qos, arp: { ...form.qos.arp, pre_emption_vulnerability: Number(v) } } })}>
                      <option value={1}>1 — Preemptable</option>
                      <option value={2}>2 — Not preemptable</option>
                    </Select>
                  </Field>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
            <Save size={14} /> {saving ? 'Saving…' : 'Save Slice'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Slice Card ────────────────────────────────────────────────────────────────

function SliceCard({
  slice, onEdit, onDelete, onApply, onDeactivate,
}: {
  slice: NetworkSlice;
  onEdit: () => void;
  onDelete: () => void;
  onApply: () => void;
  onDeactivate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [nfStatus, setNfStatus] = useState<any[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const loadNFStatus = useCallback(async () => {
    if (!slice._id) return;
    setLoadingStatus(true);
    try {
      const s = await api.slices.nfStatus(slice._id);
      setNfStatus(s);
    } finally { setLoadingStatus(false); }
  }, [slice._id]);

  useEffect(() => { if (expanded) loadNFStatus(); }, [expanded]);

  const enabledNFs = slice.networkFunctions.filter(n => n.enabled);
  const ambr = (v: { value: number; unit: number }) => `${v.value} ${UNIT_LABELS[v.unit] || 'Mbps'}`;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      {/* Color bar */}
      <div className="h-1" style={{ background: slice.color }} />

      <div className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm mt-0.5"
              style={{ background: slice.color + '33', border: `2px solid ${slice.color}50` }}>
              {slice.sst}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white">{slice.name}</h3>
                <SliceBadge status={slice.status} />
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{slice.description || `SST=${slice.sst} SD=${slice.sd || '—'}`}</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {slice.status !== 'active' ? (
              <button onClick={onApply} title="Apply to cluster"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 rounded-lg text-xs font-medium transition-colors border border-emerald-600/30">
                <Zap size={12} /> Apply
              </button>
            ) : (
              <button onClick={onDeactivate} title="Deactivate"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700/50 hover:bg-gray-700 text-gray-400 rounded-lg text-xs font-medium transition-colors">
                <PauseCircle size={12} /> Deactivate
              </button>
            )}
            <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-400 transition-colors">
              <Edit2 size={14} />
            </button>
            <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-400 transition-colors">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3 mt-4">
          {[
            { label: 'DNN', value: slice.dnn },
            { label: 'DL AMBR', value: ambr(slice.ambr.downlink) },
            { label: 'UL AMBR', value: ambr(slice.ambr.uplink) },
            { label: 'NFs', value: `${enabledNFs.length}/${ALL_NFS.length}` },
          ].map(s => (
            <div key={s.label} className="bg-gray-800/50 rounded-lg px-3 py-2">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">{s.label}</div>
              <div className="text-sm font-medium text-white mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>

        {/* NF chips */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {ALL_NFS.map(name => {
            const nf = slice.networkFunctions.find(n => n.name === name);
            const enabled = nf?.enabled ?? false;
            return (
              <span key={name}
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium uppercase ${
                  enabled
                    ? 'text-white border'
                    : 'text-gray-600 bg-gray-800/30 border border-gray-700/50'
                }`}
                style={enabled ? { borderColor: slice.color + '80', background: slice.color + '18', color: slice.color } : {}}>
                {name}
              </span>
            );
          })}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1.5 mt-3 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? 'Hide' : 'Show'} NF resource details
          {loadingStatus && <RefreshCw size={10} className="animate-spin ml-1" />}
        </button>
      </div>

      {/* Expanded NF details */}
      {expanded && (
        <div className="border-t border-gray-800 px-5 pb-4">
          <div className="grid grid-cols-12 gap-2 py-2 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-2">NF</div>
            <div className="col-span-1 text-center">Rep.</div>
            <div className="col-span-2">CPU Req/Lim</div>
            <div className="col-span-2">Mem Req/Lim</div>
            <div className="col-span-2">Live Status</div>
            <div className="col-span-2">Live CPU Lim</div>
            <div className="col-span-1">Live Mem</div>
          </div>
          {enabledNFs.map(nf => {
            const live = nfStatus.find(s => s.name === nf.name);
            const statusColor = live?.status === 'Running' ? 'text-emerald-400' : live?.status === 'Down' ? 'text-red-400' : 'text-yellow-400';
            return (
              <div key={nf.name} className="grid grid-cols-12 gap-2 py-1.5 text-xs border-b border-gray-800/50 last:border-0">
                <div className="col-span-2 font-mono font-semibold text-white uppercase">{nf.name}</div>
                <div className="col-span-1 text-center text-gray-400">{nf.replicas}</div>
                <div className="col-span-2 font-mono text-gray-400">{nf.cpu.request}/{nf.cpu.limit}</div>
                <div className="col-span-2 font-mono text-gray-400">{nf.memory.request}/{nf.memory.limit}</div>
                <div className={`col-span-2 font-medium ${statusColor}`}>{live?.status || '—'}</div>
                <div className="col-span-2 font-mono text-gray-500">{live?.currentCpu || '—'}</div>
                <div className="col-span-1 font-mono text-gray-500">{live?.currentMemory || '—'}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Slicing() {
  const [slices, setSlices] = useState<NetworkSlice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | { mode: 'create' | 'edit'; initial: Partial<NetworkSlice> }>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.slices.list();
      setSlices(data);
    } catch (e: any) { showToast('error', e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  const handleSave = async (data: any) => {
    if (modal?.mode === 'create') {
      await api.slices.create(data);
      showToast('success', `Slice "${data.name}" created`);
    } else {
      await api.slices.update(modal!.initial._id!, data);
      showToast('success', `Slice "${data.name}" updated`);
    }
    setModal(null);
    load();
  };

  const handleDelete = async (slice: NetworkSlice) => {
    if (!confirm(`Delete slice "${slice.name}"?`)) return;
    try {
      await api.slices.delete(slice._id!);
      showToast('success', `Slice "${slice.name}" deleted`);
      load();
    } catch (e: any) { showToast('error', e.message); }
  };

  const handleApply = async (slice: NetworkSlice) => {
    try {
      const res = await api.slices.apply(slice._id!) as any;
      const applied = res.results?.filter((r: any) => r.status === 'applied').length || 0;
      const errors = res.results?.filter((r: any) => r.status === 'error').length || 0;
      showToast(errors > 0 ? 'error' : 'success',
        `Applied: ${applied} NFs updated${errors > 0 ? `, ${errors} errors` : ''}`);
      load();
    } catch (e: any) { showToast('error', e.message); }
  };

  const handleDeactivate = async (slice: NetworkSlice) => {
    try {
      await api.slices.deactivate(slice._id!);
      showToast('success', `Slice "${slice.name}" deactivated`);
      load();
    } catch (e: any) { showToast('error', e.message); }
  };

  const activeCount = slices.filter(s => s.status === 'active').length;

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border text-sm font-medium shadow-xl transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {toast.text}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Layers className="text-blue-400" size={22} />
            Network Slicing
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Manage 5G network slices — configure NFs, resources, and QoS per slice
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="p-2 text-gray-400 hover:text-white">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setModal({ mode: 'create', initial: {} })}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
            <Plus size={14} /> New Slice
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Slices', value: slices.length, color: 'text-blue-400' },
          { label: 'Active', value: activeCount, color: 'text-emerald-400' },
          { label: 'Draft', value: slices.filter(s => s.status === 'draft').length, color: 'text-yellow-400' },
          { label: 'Inactive', value: slices.filter(s => s.status === 'inactive').length, color: 'text-gray-400' },
        ].map(card => (
          <div key={card.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</div>
            <div className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Slice grid */}
      {loading ? (
        <div className="text-center py-16 text-gray-500">Loading slices…</div>
      ) : slices.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Layers size={40} className="text-gray-700 mx-auto" />
          <div className="text-gray-400 font-medium">No slices configured</div>
          <div className="text-gray-600 text-sm">Create your first network slice to get started</div>
          <button onClick={() => setModal({ mode: 'create', initial: {} })}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm mt-2">
            <Plus size={14} /> Create First Slice
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {slices.map(slice => (
            <SliceCard
              key={slice._id}
              slice={slice}
              onEdit={() => setModal({ mode: 'edit', initial: slice })}
              onDelete={() => handleDelete(slice)}
              onApply={() => handleApply(slice)}
              onDeactivate={() => handleDeactivate(slice)}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <SliceModal
          initial={modal.initial}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
