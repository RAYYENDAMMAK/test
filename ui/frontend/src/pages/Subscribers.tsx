import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Trash2, Edit2, X, Save, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api';
import Card from '../components/Card';

const DEFAULT_SUB = {
  imsi: '',
  msisdn: [],
  security: { 
    k: '465B5CE8B199B49FAA5F0A2EE238A6BC', 
    opc: 'E8ED289DEBA952E4283B54E88E6183CA', 
    amf: '8000' 
  },
  ambr: {
    downlink: { value: 1, unit: 3 },
    uplink: { value: 1, unit: 3 },
  },
  slice: [{
    sst: 1, sd: '000001', default_indicator: true,
    session: [{
      name: 'internet', type: 3,
      ambr: { downlink: { value: 1, unit: 3 }, uplink: { value: 1, unit: 3 } },
      qos: { index: 9, arp: { priority_level: 8, pre_emption_capability: 1, pre_emption_vulnerability: 1 } },
    }],
  }],
};

export default function Subscribers() {
  const [data, setData] = useState<any>({ subscribers: [], total: 0, page: 1, pages: 1 });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<null | 'create' | 'edit'>(null);
  const [formData, setFormData] = useState<any>(DEFAULT_SUB);
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.subscribers.list(page, 20, search);
      setData(res);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setFormData({ ...DEFAULT_SUB, imsi: '' });
    setSelected(null);
    setModal('create');
  };

  const openEdit = async (imsi: string) => {
    try {
      const sub = await api.subscribers.get(imsi);
      setFormData(sub);
      setSelected(imsi);
      setModal('edit');
    } catch (e: any) { setError(e.message); }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      if (modal === 'create') {
        await api.subscribers.create(formData);
      } else {
        await api.subscribers.update(selected!, formData);
      }
      setModal(null);
      load();
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (imsi: string) => {
    if (!confirm(`Delete subscriber ${imsi}?`)) return;
    try {
      await api.subscribers.delete(imsi);
      load();
    } catch (e: any) { setError(e.message); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Subscribers</h1>
          <p className="text-gray-400 text-sm mt-1">{data.total} total subscribers</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
          <Plus size={14} /> Add Subscriber
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-sm">
          {error}
        </div>
      )}

      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by IMSI..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left py-2 font-medium">IMSI</th>
                <th className="text-left py-2 font-medium">MSISDN</th>
                <th className="text-left py-2 font-medium">Slice (SST/SD)</th>
                <th className="text-left py-2 font-medium">DL AMBR</th>
                <th className="text-left py-2 font-medium">UL AMBR</th>
                <th className="text-right py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">Loading...</td></tr>
              )}
              {!loading && data.subscribers.map((sub: any) => (
                <tr key={sub.imsi} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="py-2.5 font-mono text-white">{sub.imsi}</td>
                  <td className="py-2.5 text-gray-400">{sub.msisdn?.[0] || '—'}</td>
                  <td className="py-2.5 text-gray-400">
                    {sub.slice?.map((s: any) => `${s.sst}/${s.sd || '—'}`).join(', ') || '—'}
                  </td>
                  <td className="py-2.5 text-gray-400">{formatAMBR(sub.ambr?.downlink)}</td>
                  <td className="py-2.5 text-gray-400">{formatAMBR(sub.ambr?.uplink)}</td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => openEdit(sub.imsi)} className="p-1.5 text-gray-400 hover:text-blue-400 mr-1">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(sub.imsi)} className="p-1.5 text-gray-400 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && data.subscribers.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No subscribers found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {data.pages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800">
            <span className="text-xs text-gray-500">Page {page} of {data.pages}</span>
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

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-800">
              <h2 className="font-semibold text-white">{modal === 'create' ? 'Add Subscriber' : `Edit ${selected}`}</h2>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-3 py-2 rounded text-sm">{error}</div>}

              <div className="grid grid-cols-2 gap-4">
                <Field label="IMSI" value={formData.imsi}
                  onChange={v => setFormData((f: any) => ({ ...f, imsi: v }))}
                  disabled={modal === 'edit'} placeholder="605010000000001" />
                <Field label="MSISDN" value={formData.msisdn?.[0] || ''}
                  onChange={v => setFormData((f: any) => ({ ...f, msisdn: v ? [v] : [] }))}
                  placeholder="51314715" />
              </div>

              <div className="border-t border-gray-800 pt-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Security</div>
                <div className="grid grid-cols-1 gap-3">
                  <Field label="Ki (128-bit hex)" value={formData.security?.k || ''}
                    onChange={(v: string) => setFormData((f: any) => ({ ...f, security: { ...f.security, k: v } }))}
                    placeholder="465B5CE8B199B49FAA5F0A2EE238A6BC" mono />
                  <Field label="OPc (128-bit hex)" value={formData.security?.opc || ''}
                    onChange={(v: string) => setFormData((f: any) => ({ ...f, security: { ...f.security, opc: v } }))}
                    placeholder="E8ED289DEBA952E4283B54E88E6183CA" mono />
                  <Field label="AMF" value={formData.security?.amf || '8000'}
                    onChange={(v: string) => setFormData((f: any) => ({ ...f, security: { ...f.security, amf: v } }))}
                    placeholder="8000" mono />
                </div>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">AMBR</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Downlink (Gbps)" type="number"
                    value={String(formData.ambr?.downlink?.value || 1)}
                    onChange={v => setFormData((f: any) => ({ ...f, ambr: { ...f.ambr, downlink: { value: Number(v), unit: 3 } } }))} />
                  <Field label="Uplink (Gbps)" type="number"
                    value={String(formData.ambr?.uplink?.value || 1)}
                    onChange={v => setFormData((f: any) => ({ ...f, ambr: { ...f.ambr, uplink: { value: Number(v), unit: 3 } } }))} />
                </div>
              </div>

              <div className="border-t border-gray-800 pt-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Slice (SST/SD)</div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="SST" type="number" value={String(formData.slice?.[0]?.sst || 1)}
                    onChange={v => setFormData((f: any) => {
                      const s = [...(f.slice || [{}])];
                      s[0] = { ...s[0], sst: Number(v) };
                      return { ...f, slice: s };
                    })} />
                  <Field label="SD (hex)" value={formData.slice?.[0]?.sd || '000001'}
                    onChange={v => setFormData((f: any) => {
                      const s = [...(f.slice || [{}])];
                      s[0] = { ...s[0], sd: v };
                      return { ...f, slice: s };
                    })} />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-800">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-gray-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50">
                <Save size={14} /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, disabled, placeholder, mono, type = 'text' }: any) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

function formatAMBR(ambr: any): string {
  if (!ambr) return '—';
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps'];
  return `${ambr.value} ${units[ambr.unit] || 'Mbps'}`;
}
