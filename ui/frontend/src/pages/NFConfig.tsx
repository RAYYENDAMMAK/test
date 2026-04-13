import React, { useEffect, useState, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import {
  Save, RotateCcw, RefreshCw, Globe, ChevronUp, ChevronDown,
  Info, Server, Database, Shield, Clock, Network, Code2,
  CheckCircle, AlertCircle, Cpu, Link, LayoutGrid,
} from 'lucide-react';
import { api } from '../api';
import StatusBadge from '../components/StatusBadge';

// ─── Types ────────────────────────────────────────────────────────────────────
interface GlobalConfig {
  mcc: string;
  mnc: string;
  tac: number;
  sst: number;
  sd: string;
  nrfUri: string;
  mongoUri: string;
  logLevel: string;
  networkName: string;
}

type FieldType = 'text' | 'number' | 'ip' | 'cidr' | 'select' | 'tags';
interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
  options?: string[];
  fromGlobal?: keyof GlobalConfig;
  unit?: string;
  width?: 'full' | 'half' | 'third';
}
interface FieldGroup {
  section: string;
  icon: React.ReactNode;
  fields: FieldDef[];
}

// ─── NF Field Schemas ─────────────────────────────────────────────────────────
const NF_SCHEMAS: Record<string, FieldGroup[]> = {
  nrf: [
    { section: 'SBI Interface', icon: <Network size={13} />, fields: [
      { key: 'sbi_addr', label: 'Bind Address', type: 'ip', placeholder: '0.0.0.0' },
      { key: 'sbi_port', label: 'Port', type: 'number', placeholder: '7777', width: 'third' },
    ]},
    { section: 'Network Identity', icon: <Globe size={13} />, fields: [
      { key: 'mcc', label: 'MCC', type: 'text', placeholder: '001', fromGlobal: 'mcc', width: 'third', hint: 'Mobile Country Code' },
      { key: 'mnc', label: 'MNC', type: 'text', placeholder: '01',  fromGlobal: 'mnc', width: 'third', hint: 'Mobile Network Code' },
    ]},
  ],
  ausf: [
    { section: 'SBI Interface', icon: <Network size={13} />, fields: [
      { key: 'sbi_addr', label: 'Bind Address', type: 'ip', placeholder: '0.0.0.0' },
      { key: 'sbi_port', label: 'Port', type: 'number', placeholder: '7777', width: 'third' },
    ]},
    { section: 'NRF Discovery', icon: <Link size={13} />, fields: [
      { key: 'nrf_uri', label: 'NRF URI', type: 'text', fromGlobal: 'nrfUri', placeholder: 'http://nrf-svc:7777' },
    ]},
  ],
  udm: [
    { section: 'SBI Interface', icon: <Network size={13} />, fields: [
      { key: 'sbi_addr', label: 'Bind Address', type: 'ip', placeholder: '0.0.0.0' },
      { key: 'sbi_port', label: 'Port', type: 'number', placeholder: '7777', width: 'third' },
    ]},
    { section: 'NRF Discovery', icon: <Link size={13} />, fields: [
      { key: 'nrf_uri', label: 'NRF URI', type: 'text', fromGlobal: 'nrfUri', placeholder: 'http://nrf-svc:7777' },
    ]},
  ],
  udr: [
    { section: 'SBI Interface', icon: <Network size={13} />, fields: [
      { key: 'sbi_addr', label: 'Bind Address', type: 'ip', placeholder: '0.0.0.0' },
      { key: 'sbi_port', label: 'Port', type: 'number', placeholder: '7777', width: 'third' },
    ]},
    { section: 'Database', icon: <Database size={13} />, fields: [
      { key: 'db_uri', label: 'MongoDB URI', type: 'text', fromGlobal: 'mongoUri', placeholder: 'mongodb://mongodb-svc:27017/open5gs', hint: 'Subscriber data store' },
    ]},
    { section: 'NRF Discovery', icon: <Link size={13} />, fields: [
      { key: 'nrf_uri', label: 'NRF URI', type: 'text', fromGlobal: 'nrfUri', placeholder: 'http://nrf-svc:7777' },
    ]},
  ],
  pcf: [
    { section: 'SBI Interface', icon: <Network size={13} />, fields: [
      { key: 'sbi_addr', label: 'Bind Address', type: 'ip', placeholder: '0.0.0.0' },
      { key: 'sbi_port', label: 'Port', type: 'number', placeholder: '7777', width: 'third' },
    ]},
    { section: 'NRF Discovery', icon: <Link size={13} />, fields: [
      { key: 'nrf_uri', label: 'NRF URI', type: 'text', fromGlobal: 'nrfUri' },
    ]},
  ],
  nssf: [
    { section: 'SBI Interface', icon: <Network size={13} />, fields: [
      { key: 'sbi_addr', label: 'Bind Address', type: 'ip', placeholder: '0.0.0.0' },
      { key: 'sbi_port', label: 'Port', type: 'number', placeholder: '7777', width: 'third' },
    ]},
    { section: 'Slice Selection', icon: <LayoutGrid size={13} />, fields: [
      { key: 'sst', label: 'Default SST', type: 'number', fromGlobal: 'sst', width: 'third', hint: 'Slice/Service Type' },
      { key: 'sd', label: 'Default SD', type: 'text', fromGlobal: 'sd', width: 'third', hint: 'Slice Differentiator (hex)' },
      { key: 'nrf_uri', label: 'NRF URI', type: 'text', fromGlobal: 'nrfUri' },
    ]},
  ],
  bsf: [
    { section: 'SBI Interface', icon: <Network size={13} />, fields: [
      { key: 'sbi_addr', label: 'Bind Address', type: 'ip', placeholder: '0.0.0.0' },
      { key: 'sbi_port', label: 'Port', type: 'number', placeholder: '7777', width: 'third' },
    ]},
    { section: 'NRF Discovery', icon: <Link size={13} />, fields: [
      { key: 'nrf_uri', label: 'NRF URI', type: 'text', fromGlobal: 'nrfUri' },
    ]},
  ],
  amf: [
    { section: 'Network Identity', icon: <Globe size={13} />, fields: [
      { key: 'mcc',          label: 'MCC',          type: 'text',   fromGlobal: 'mcc', placeholder: '001',      width: 'third', hint: 'Mobile Country Code' },
      { key: 'mnc',          label: 'MNC',          type: 'text',   fromGlobal: 'mnc', placeholder: '01',       width: 'third', hint: 'Mobile Network Code' },
      { key: 'tac',          label: 'TAC',          type: 'number', fromGlobal: 'tac', placeholder: '1',        width: 'third', hint: 'Tracking Area Code' },
      { key: 'sst',          label: 'SST',          type: 'number', fromGlobal: 'sst', placeholder: '1',        width: 'third', hint: 'Slice/Service Type' },
      { key: 'sd',           label: 'SD',           type: 'text',   fromGlobal: 'sd',  placeholder: '000001',   width: 'third', hint: 'Slice Differentiator' },
      { key: 'network_name', label: 'Network Name', type: 'text',   fromGlobal: 'networkName', width: 'half' },
      { key: 'amf_name',     label: 'AMF Name',     type: 'text',   placeholder: 'open5gs-amf0', width: 'half' },
    ]},
    { section: 'NGAP — N2 Interface (toward gNB)', icon: <Server size={13} />, fields: [
      { key: 'ngap_addr', label: 'NGAP Bind Address', type: 'ip', placeholder: '0.0.0.0', hint: 'gNB connects here via SCTP port 38412' },
    ]},
    { section: 'SBI Interface', icon: <Network size={13} />, fields: [
      { key: 'sbi_addr', label: 'SBI Bind Address', type: 'ip', placeholder: '0.0.0.0' },
      { key: 'sbi_port', label: 'SBI Port', type: 'number', placeholder: '7777', width: 'third' },
      { key: 'nrf_uri',  label: 'NRF URI',  type: 'text', fromGlobal: 'nrfUri' },
    ]},
    { section: 'Security Algorithms', icon: <Shield size={13} />, fields: [
      { key: 'integrity_order', label: 'Integrity (priority order)', type: 'tags', options: ['NIA0','NIA1','NIA2'], hint: 'Drag to reorder — leftmost = highest priority' },
      { key: 'ciphering_order', label: 'Ciphering (priority order)', type: 'tags', options: ['NEA0','NEA1','NEA2','NEA3'], hint: 'Drag to reorder — leftmost = highest priority' },
    ]},
    { section: 'Timers', icon: <Clock size={13} />, fields: [
      { key: 't3512', label: 'T3512 — Periodic Registration', type: 'number', placeholder: '540', unit: 'sec', width: 'third', hint: 'How often UE sends registration update' },
    ]},
  ],
  smf: [
    { section: 'Interfaces', icon: <Network size={13} />, fields: [
      { key: 'sbi_addr',  label: 'SBI Bind Address',       type: 'ip', placeholder: '0.0.0.0' },
      { key: 'sbi_port',  label: 'SBI Port',               type: 'number', placeholder: '7777', width: 'third' },
      { key: 'pfcp_addr', label: 'PFCP Address (N4 local)', type: 'ip', placeholder: '0.0.0.0', hint: 'SMF side of N4 interface toward UPF' },
      { key: 'upf_addr',  label: 'UPF PFCP Address',        type: 'ip', placeholder: 'upf-svc', hint: 'UPF remote PFCP endpoint' },
    ]},
    { section: 'UE IP Pool & Data Network', icon: <Cpu size={13} />, fields: [
      { key: 'ue_subnet', label: 'UE IP Subnet', type: 'cidr', placeholder: '10.45.0.1/16', hint: 'Range allocated to UEs on attach' },
      { key: 'dnn',       label: 'DNN / APN',   type: 'text', placeholder: 'internet', hint: 'Data Network Name (must match UPF)' },
      { key: 'mtu',       label: 'MTU',          type: 'number', placeholder: '1400', unit: 'bytes', width: 'third' },
    ]},
    { section: 'DNS', icon: <Globe size={13} />, fields: [
      { key: 'dns_primary',   label: 'Primary DNS',   type: 'ip', placeholder: '8.8.8.8', width: 'half' },
      { key: 'dns_secondary', label: 'Secondary DNS', type: 'ip', placeholder: '8.8.4.4', width: 'half' },
    ]},
    { section: 'NRF Discovery', icon: <Link size={13} />, fields: [
      { key: 'nrf_uri', label: 'NRF URI', type: 'text', fromGlobal: 'nrfUri' },
    ]},
  ],
  upf: [
    { section: 'Interfaces', icon: <Network size={13} />, fields: [
      { key: 'pfcp_addr', label: 'PFCP Address (N4)', type: 'ip', placeholder: '0.0.0.0', hint: 'Must match SMF UPF PFCP config' },
      { key: 'gtpu_addr', label: 'GTP-U Address (N3)', type: 'ip', placeholder: '0.0.0.0', hint: 'gNB sends user-plane traffic here' },
    ]},
    { section: 'UE IP Pool & Data Network', icon: <Cpu size={13} />, fields: [
      { key: 'ue_subnet', label: 'UE IP Subnet', type: 'cidr', placeholder: '10.45.0.1/16', hint: 'Must match SMF subnet exactly' },
      { key: 'dnn',       label: 'DNN / APN',   type: 'text', placeholder: 'internet', hint: 'Must match SMF DNN exactly' },
      { key: 'tun_dev',   label: 'TUN Device',  type: 'text', placeholder: 'ogstun', hint: 'Kernel TUN interface name for UE traffic' },
    ]},
  ],
};

const NF_LIST = ['nrf','ausf','udm','udr','pcf','nssf','bsf','amf','smf','upf'];

const DEFAULT_GLOBAL: GlobalConfig = {
  mcc: '605', mnc: '01', tac: 1, sst: 1, sd: '000001',
  nrfUri: 'http://nrf-svc:7777',
  mongoUri: 'mongodb://mongodb-svc:27017/open5gs',
  logLevel: 'info',
  networkName: '5G SA PRIVATE NETWORK',
};

const MOCK_FIELDS: Record<string, Record<string, any>> = {
  nrf:  { sbi_addr:'0.0.0.0', sbi_port:7777, mcc:'001', mnc:'01' },
  ausf: { sbi_addr:'0.0.0.0', sbi_port:7777, nrf_uri:'http://nrf-svc:7777' },
  udm:  { sbi_addr:'0.0.0.0', sbi_port:7777, nrf_uri:'http://nrf-svc:7777' },
  udr:  { sbi_addr:'0.0.0.0', sbi_port:7777, nrf_uri:'http://nrf-svc:7777', db_uri:'mongodb://mongodb-svc:27017/open5gs' },
  pcf:  { sbi_addr:'0.0.0.0', sbi_port:7777, nrf_uri:'http://nrf-svc:7777' },
  nssf: { sbi_addr:'0.0.0.0', sbi_port:7777, nrf_uri:'http://nrf-svc:7777', sst:1, sd:'000001' },
  bsf:  { sbi_addr:'0.0.0.0', sbi_port:7777, nrf_uri:'http://nrf-svc:7777' },
  amf:  { mcc:'605', mnc:'01', tac:1, sst:1, sd:'000001', network_name:'5G SA PRIVATE NETWORK', amf_name:'open5gs-amf0',
          ngap_addr:'0.0.0.0', sbi_addr:'0.0.0.0', sbi_port:7777, nrf_uri:'http://nrf-svc:7777',
          integrity_order:['NIA2','NIA1','NIA0'], ciphering_order:['NEA0','NEA2','NEA1'], t3512:540 },
  smf:  { sbi_addr:'0.0.0.0', sbi_port:7777, pfcp_addr:'0.0.0.0', upf_addr:'upf-svc',
          ue_subnet:'10.45.0.1/16', dnn:'internet', mtu:1400,
          dns_primary:'8.8.8.8', dns_secondary:'8.8.4.4', nrf_uri:'http://nrf-svc:7777' },
  upf:  { pfcp_addr:'0.0.0.0', gtpu_addr:'0.0.0.0', ue_subnet:'10.45.0.1/16', dnn:'internet', tun_dev:'ogstun' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function GlobalBadge({ onClick }: { onClick?: () => void }) {
  return (
    <span
      onClick={onClick}
      title="Value inherited from Global Configuration"
      className={`inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide
        px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20
        ${onClick ? 'cursor-pointer hover:bg-blue-500/20' : ''}`}
    >
      <Globe size={8} /> Global
    </span>
  );
}

function OverrideBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide
      px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
      Override
    </span>
  );
}

function TagsField({
  value, options, onChange,
}: { value: string[]; options: string[]; onChange: (v: string[]) => void }) {
  const move = (idx: number, dir: -1 | 1) => {
    const arr = [...value];
    const swap = idx + dir;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    onChange(arr);
  };

  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter(v => v !== opt));
    } else {
      onChange([...value, opt]);
    }
  };

  return (
    <div className="space-y-2">
      {/* Priority-ordered active tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((v, i) => (
            <div key={v} className="flex items-center gap-0.5 bg-blue-600/20 border border-blue-500/30 rounded px-2 py-0.5">
              <span className="text-[10px] text-gray-500 mr-1">{i + 1}.</span>
              <span className="text-xs font-mono text-white">{v}</span>
              <div className="flex flex-col ml-1">
                <button onClick={() => move(i, -1)} disabled={i === 0}
                  className="text-gray-500 hover:text-white disabled:opacity-20 leading-none">
                  <ChevronUp size={9} />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === value.length - 1}
                  className="text-gray-500 hover:text-white disabled:opacity-20 leading-none">
                  <ChevronDown size={9} />
                </button>
              </div>
              <button onClick={() => toggle(v)} className="ml-1 text-gray-500 hover:text-red-400 text-[10px]">✕</button>
            </div>
          ))}
        </div>
      )}
      {/* Inactive options */}
      <div className="flex flex-wrap gap-1.5">
        {options.filter(o => !value.includes(o)).map(opt => (
          <button key={opt} onClick={() => toggle(opt)}
            className="text-xs font-mono px-2 py-0.5 rounded border border-gray-700 text-gray-500
              hover:border-blue-500/50 hover:text-gray-300 transition-colors">
            + {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function FieldInput({
  field, value, globalValue, onChange,
}: {
  field: FieldDef;
  value: any;
  globalValue?: any;
  onChange: (v: any) => void;
}) {
  const isInherited = field.fromGlobal !== undefined;

  // Global-inherited fields are read-only — edit via the Global Config panel
  if (isInherited) {
    const displayVal = globalValue ?? value ?? '—';
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/5 border border-blue-500/20 min-h-[36px]">
        <span className="text-sm text-blue-300 font-mono flex-1 truncate">{displayVal}</span>
        <span className="text-[10px] text-blue-500 shrink-0 whitespace-nowrap">← Global</span>
      </div>
    );
  }

  const base = `w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono
    placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/30 transition-colors`;

  if (field.type === 'tags') {
    return (
      <div>
        <TagsField value={Array.isArray(value) ? value : []} options={field.options || []} onChange={onChange} />
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={base}>
        {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <div className="relative">
      <input
        type={field.type === 'number' ? 'number' : 'text'}
        value={value ?? ''}
        placeholder={field.placeholder}
        onChange={e => onChange(field.type === 'number' ? Number(e.target.value) : e.target.value)}
        className={base}
        style={field.unit ? { paddingRight: '2.5rem' } : undefined}
      />
      {field.unit && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">{field.unit}</span>
      )}
    </div>
  );
}

// ─── Global Settings Panel ────────────────────────────────────────────────────
function GlobalPanel({
  config, saving, onChange, onSave, onApplyAll,
}: {
  config: GlobalConfig;
  saving: boolean;
  onChange: (k: keyof GlobalConfig, v: any) => void;
  onSave: () => void;
  onApplyAll: () => void;
}) {
  const inp = `w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
    font-mono placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-colors`;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1">
      {/* PLMN */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe size={14} className="text-blue-400" />
          <span className="text-sm font-semibold text-white">PLMN Identity</span>
          <span className="text-xs text-gray-500 ml-1">Propagated to all NFs</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">MCC <span className="text-gray-600">(3 digits)</span></label>
            <input value={config.mcc} onChange={e => onChange('mcc', e.target.value)}
              className={inp} placeholder="605" maxLength={3} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">MNC <span className="text-gray-600">(2–3 digits)</span></label>
            <input value={config.mnc} onChange={e => onChange('mnc', e.target.value)}
              className={inp} placeholder="01" maxLength={3} />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">TAC <span className="text-gray-600">(Tracking Area Code)</span></label>
            <input type="number" value={config.tac} onChange={e => onChange('tac', Number(e.target.value))}
              className={inp} placeholder="1" />
          </div>
          <div className="col-span-3">
            <label className="block text-xs text-gray-400 mb-1.5">
              Network Name <span className="text-gray-600">(broadcast to UEs on network selection)</span>
            </label>
            <input value={config.networkName} onChange={e => onChange('networkName', e.target.value)}
              className={inp} placeholder="5G SA PRIVATE NETWORK" />
            <p className="text-[10px] text-gray-600 mt-1">Propagated to AMF — shown on UE network selection screen</p>
          </div>
        </div>
      </section>

      {/* S-NSSAI */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <LayoutGrid size={14} className="text-purple-400" />
          <span className="text-sm font-semibold text-white">Default S-NSSAI</span>
          <span className="text-xs text-gray-500 ml-1">Used by AMF, NSSF, and slices</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">SST <span className="text-gray-600">(0–255)</span></label>
            <input type="number" value={config.sst} onChange={e => onChange('sst', Number(e.target.value))}
              className={inp} placeholder="1" min={0} max={255} />
            <p className="text-[10px] text-gray-600 mt-1">1=eMBB · 2=URLLC · 3=mIoT</p>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-400 mb-1.5">SD <span className="text-gray-600">(6 hex digits, optional)</span></label>
            <input value={config.sd} onChange={e => onChange('sd', e.target.value)}
              className={inp} placeholder="000001" maxLength={6} />
          </div>
        </div>
      </section>

      {/* Service URIs */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Link size={14} className="text-emerald-400" />
          <span className="text-sm font-semibold text-white">Service URIs</span>
          <span className="text-xs text-gray-500 ml-1">Inherited by all NFs</span>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">NRF URI</label>
            <input value={config.nrfUri} onChange={e => onChange('nrfUri', e.target.value)}
              className={inp} placeholder="http://nrf-svc:7777" />
            <p className="text-[10px] text-gray-600 mt-1">All NFs register to this NRF</p>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">MongoDB URI</label>
            <input value={config.mongoUri} onChange={e => onChange('mongoUri', e.target.value)}
              className={inp} placeholder="mongodb://mongodb-svc:27017/open5gs" />
            <p className="text-[10px] text-gray-600 mt-1">Used by UDR (subscriber data)</p>
          </div>
        </div>
      </section>

      {/* Logging */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info size={14} className="text-yellow-400" />
          <span className="text-sm font-semibold text-white">Logging</span>
        </div>
        <div className="w-48">
          <label className="block text-xs text-gray-400 mb-1.5">Global Log Level</label>
          <select value={config.logLevel} onChange={e => onChange('logLevel', e.target.value)}
            className={inp}>
            {['trace','debug','info','warn','error','fatal'].map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-3 pb-4">
        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm disabled:opacity-50 transition-colors">
          <Save size={14} /> {saving ? 'Saving...' : 'Save Global Config'}
        </button>
        <button onClick={onApplyAll} disabled={saving}
          className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm disabled:opacity-50 transition-colors">
          <Globe size={14} /> Apply to All NFs
        </button>
        <p className="text-xs text-gray-500">"Apply to All" overwrites inherited fields in every NF config.</p>
      </div>
    </div>
  );
}

// ─── NF Structured Form Panel ─────────────────────────────────────────────────
function NFFormPanel({
  nfName, fields, globalCfg, onChange,
}: {
  nfName: string;
  fields: Record<string, any>;
  globalCfg: GlobalConfig;
  onChange: (key: string, value: any) => void;
}) {
  const schema = NF_SCHEMAS[nfName] || [];

  const widthClass = (w?: string) => ({
    full: 'col-span-3',
    half: 'col-span-3 sm:col-span-1',
    third: 'col-span-1',
  }[w || 'full'] ?? 'col-span-3');

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
      {schema.map(group => (
        <section key={group.section} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4 text-gray-400">
            {group.icon}
            <span className="text-xs font-semibold uppercase tracking-wider">{group.section}</span>
          </div>
          <div className="grid grid-cols-3 gap-x-4 gap-y-4">
            {group.fields.map(field => {
              const isInherited = field.fromGlobal !== undefined;
              const globalVal = isInherited ? globalCfg[field.fromGlobal!] : undefined;
              const val = !isInherited ? (fields[field.key] ?? '') : globalVal;

              return (
                <div key={field.key} className={widthClass(field.width)}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="text-xs text-gray-400">{field.label}</label>
                    {isInherited && <GlobalBadge onClick={() => {}} />}
                  </div>
                  <FieldInput
                    field={field}
                    value={val}
                    globalValue={globalVal}
                    onChange={v => onChange(field.key, v)}
                  />
                  {field.hint && !isInherited && (
                    <p className="text-[10px] text-gray-600 mt-1">{field.hint}</p>
                  )}
                  {isInherited && (
                    <p className="text-[10px] text-gray-600 mt-1">Set in Global Config</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NFConfig() {
  const [nfs, setNfs]                 = useState<any[]>([]);
  const [selected, setSelected]       = useState<string>('global');
  const [globalCfg, setGlobalCfg]     = useState<GlobalConfig>(DEFAULT_GLOBAL);
  const [nfFields, setNfFields]       = useState<Record<string, Record<string, any>>>(MOCK_FIELDS);
  const [yamlMap, setYamlMap]         = useState<Record<string, string>>({});
  const [viewMode, setViewMode]       = useState<'form' | 'yaml'>('form');
  const [saving, setSaving]           = useState(false);
  const [restarting, setRestarting]   = useState(false);
  const [msg, setMsg]                 = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Track dirty state per section
  const [dirtyGlobal, setDirtyGlobal]   = useState(false);
  const [dirtyFields, setDirtyFields]   = useState<Record<string, boolean>>({});
  const [dirtyYaml, setDirtyYaml]       = useState<Record<string, boolean>>({});

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  // Load NF list
  useEffect(() => {
    api.nfs.list().then(setNfs).catch(() => {
      // Mock NF statuses for demo
      setNfs(NF_LIST.map((n, i) => ({
        name: n, status: i < 8 ? 'Running' : 'Down',
        readyReplicas: i < 8 ? 1 : 0, desiredReplicas: 1,
        restartCount: 0, podPhase: 'Running',
        podName: `${n}-xxx-yyy`, podIP: `10.42.0.${10 + i}`,
        nodeIP: '192.168.1.10', startTime: new Date().toISOString(),
        image: `openverso/open5gs-${n}:2.7.0`,
      })));
    });
  }, []);

  // Load global config
  useEffect(() => {
    (api.nfs as any).getGlobal?.()
      .then((g: GlobalConfig) => { setGlobalCfg(g); })
      .catch(() => {/* use defaults */});
  }, []);

  // Load NF fields when switching to a NF
  useEffect(() => {
    if (selected === 'global' || nfFields[selected]) return;
    (api.nfs as any).getFields?.(selected)
      .then((f: any) => {
        setNfFields(prev => ({ ...prev, [selected]: f.fields }));
        setYamlMap(prev => ({ ...prev, [selected]: f.yaml || '' }));
      })
      .catch(() => {/* use mock */});
  }, [selected]);

  // Load YAML when switching to yaml view
  useEffect(() => {
    if (selected === 'global' || viewMode !== 'yaml' || yamlMap[selected]) return;
    api.nfs.getConfig(selected)
      .then(r => setYamlMap(prev => ({ ...prev, [selected]: r.content })))
      .catch(() => {});
  }, [selected, viewMode]);

  const handleGlobalChange = (k: keyof GlobalConfig, v: any) => {
    setGlobalCfg(prev => ({ ...prev, [k]: v }));
    setDirtyGlobal(true);
  };

  const handleFieldChange = useCallback((key: string, value: any) => {
    setNfFields(prev => ({ ...prev, [selected]: { ...prev[selected], [key]: value } }));
    setDirtyFields(prev => ({ ...prev, [selected]: true }));
  }, [selected]);

  const handleYamlChange = (yaml: string) => {
    setYamlMap(prev => ({ ...prev, [selected]: yaml }));
    setDirtyYaml(prev => ({ ...prev, [selected]: true }));
  };

  const handleSaveGlobal = async () => {
    setSaving(true);
    try {
      await (api.nfs as any).updateGlobal?.(globalCfg);
      setDirtyGlobal(false);
      flash('ok', 'Global config saved.');
    } catch { flash('ok', 'Global config saved (demo mode).'); setDirtyGlobal(false); }
    finally { setSaving(false); }
  };

  const handleApplyAll = async () => {
    setSaving(true);
    try {
      await (api.nfs as any).updateGlobal?.({ ...globalCfg, propagate: true });
      setDirtyGlobal(false);
      flash('ok', 'Global settings applied to all NF configs. Restart NFs to take effect.');
    } catch { flash('ok', 'Applied to all NFs (demo mode).'); setDirtyGlobal(false); }
    finally { setSaving(false); }
  };

  const handleSaveFields = async () => {
    setSaving(true);
    try {
      await (api.nfs as any).updateFields?.(selected, nfFields[selected]);
      setDirtyFields(prev => ({ ...prev, [selected]: false }));
      flash('ok', `${selected.toUpperCase()} config saved. Restart to apply.`);
    } catch { flash('ok', `${selected.toUpperCase()} config saved (demo mode).`); setDirtyFields(prev => ({...prev,[selected]:false})); }
    finally { setSaving(false); }
  };

  const handleSaveYaml = async () => {
    setSaving(true);
    try {
      await api.nfs.updateConfig(selected, yamlMap[selected]);
      setDirtyYaml(prev => ({ ...prev, [selected]: false }));
      flash('ok', `${selected.toUpperCase()} YAML saved. Restart to apply.`);
    } catch { flash('ok', 'Saved (demo mode).'); setDirtyYaml(prev => ({...prev,[selected]:false})); }
    finally { setSaving(false); }
  };

  const handleRestart = async () => {
    if (!confirm(`Restart ${selected.toUpperCase()}? This causes brief service interruption.`)) return;
    setRestarting(true);
    try {
      await api.nfs.restart(selected);
      flash('ok', `${selected.toUpperCase()} pods restarting...`);
    } catch { flash('ok', 'Restart triggered (demo mode).'); }
    finally { setRestarting(false); }
  };

  const currentNF = nfs.find(n => n.name === selected);
  const isDirtyForm = selected === 'global' ? dirtyGlobal : (dirtyFields[selected] || false);
  const isDirtyYaml = dirtyYaml[selected] || false;
  const fields = nfFields[selected] || MOCK_FIELDS[selected] || {};

  return (
    <div className="p-6 h-full flex flex-col gap-0 min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-white">NF Configuration</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {selected === 'global'
              ? 'Shared parameters — PLMN, NRF URI, MongoDB, etc. — inherited by all Network Functions'
              : `Configure ${selected.toUpperCase()} — only the fields that matter`}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {selected !== 'global' && (
            <>
              {/* Structured / YAML toggle */}
              <div className="flex items-center bg-gray-800 rounded-lg p-0.5 border border-gray-700">
                <button onClick={() => setViewMode('form')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                    viewMode === 'form' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                  <LayoutGrid size={12} /> Structured
                </button>
                <button onClick={() => setViewMode('yaml')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                    viewMode === 'yaml' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
                  <Code2 size={12} /> Raw YAML
                </button>
              </div>

              {(isDirtyForm || isDirtyYaml) && (
                <button
                  onClick={() => {
                    setNfFields(prev => ({ ...prev, [selected]: MOCK_FIELDS[selected] || {} }));
                    setDirtyFields(prev => ({ ...prev, [selected]: false }));
                    setDirtyYaml(prev => ({ ...prev, [selected]: false }));
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-gray-400 hover:text-white border border-gray-700 rounded-lg text-xs">
                  <RotateCcw size={12} /> Reset
                </button>
              )}

              <button
                onClick={viewMode === 'yaml' ? handleSaveYaml : handleSaveFields}
                disabled={saving || (!isDirtyForm && !isDirtyYaml)}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs disabled:opacity-50 transition-colors">
                <Save size={12} /> {saving ? 'Saving…' : 'Save'}
              </button>

              <button onClick={handleRestart} disabled={restarting}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs disabled:opacity-50 transition-colors">
                <RefreshCw size={12} className={restarting ? 'animate-spin' : ''} />
                {restarting ? 'Restarting…' : 'Restart NF'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toast */}
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs border mb-4 shrink-0 ${
          msg.type === 'ok'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {msg.type === 'ok' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
          {msg.text}
        </div>
      )}

      {/* Body */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Left sidebar — NF list */}
        <div className="w-44 shrink-0 space-y-0.5">
          {/* Global entry */}
          <button
            onClick={() => setSelected('global')}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              selected === 'global'
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            }`}
          >
            <Globe size={13} />
            <span className="font-medium">Global</span>
            {dirtyGlobal && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-yellow-400" />}
          </button>

          <div className="border-t border-gray-800 my-2" />

          {NF_LIST.map(name => {
            const nf = nfs.find(n => n.name === name);
            const dirty = dirtyFields[name] || dirtyYaml[name];
            return (
              <button
                key={name}
                onClick={() => setSelected(name)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  selected === name
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <span className="font-mono uppercase font-medium text-xs">{name}</span>
                <div className="flex items-center gap-1">
                  {dirty && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />}
                  {nf && <StatusBadge status={nf.status} />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right — main content */}
        <div className="flex-1 flex gap-4 min-h-0 min-w-0">

          {/* Form / YAML area */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">

            {/* NF sub-header (not shown for global) */}
            {selected !== 'global' && (
              <div className="flex items-center gap-3 mb-4 shrink-0">
                <span className="text-xl font-mono font-bold text-white uppercase">{selected}</span>
                {currentNF && <StatusBadge status={currentNF.status} />}
                {(isDirtyForm || isDirtyYaml) && (
                  <span className="text-xs text-yellow-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                    Unsaved changes
                  </span>
                )}
              </div>
            )}

            {/* Content */}
            {selected === 'global' ? (
              <GlobalPanel
                config={globalCfg}
                saving={saving}
                onChange={handleGlobalChange}
                onSave={handleSaveGlobal}
                onApplyAll={handleApplyAll}
              />
            ) : viewMode === 'form' ? (
              <NFFormPanel
                nfName={selected}
                fields={fields}
                globalCfg={globalCfg}
                onChange={handleFieldChange}
              />
            ) : (
              /* Raw YAML editor */
              <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-gray-800">
                <div className="bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center justify-between">
                  <span className="text-xs font-mono text-gray-400">/etc/open5gs/{selected}.yaml</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-600">Full YAML — all fields exposed</span>
                    {isDirtyYaml && <span className="text-xs text-yellow-400">● Unsaved</span>}
                  </div>
                </div>
                <Editor
                  height="calc(100% - 37px)"
                  language="yaml"
                  value={yamlMap[selected] || `# Loading ${selected}.yaml…`}
                  onChange={v => handleYamlChange(v || '')}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    tabSize: 2,
                  }}
                />
              </div>
            )}
          </div>

          {/* Right info panel — NF status (only when NF selected) */}
          {selected !== 'global' && currentNF && (
            <div className="w-52 shrink-0 space-y-3">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Runtime</div>
                <StatusBadge status={currentNF.status} />
                {[
                  ['Ready', `${currentNF.readyReplicas}/${currentNF.desiredReplicas}`],
                  ['Pod', currentNF.podName?.split('-').slice(-2).join('-') || '—'],
                  ['Pod IP', currentNF.podIP || '—'],
                  ['Node IP', currentNF.nodeIP || '—'],
                  ['Restarts', currentNF.restartCount],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <div className="text-[10px] text-gray-500">{k}</div>
                    <div className="text-xs font-mono text-gray-300 truncate">{v}</div>
                  </div>
                ))}
              </div>

              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Image</div>
                <div className="text-[10px] font-mono text-gray-400 break-all leading-relaxed">
                  {currentNF.image || '—'}
                </div>
              </div>

              {/* Global inheritance indicator */}
              {NF_SCHEMAS[selected]?.some(g => g.fields.some(f => f.fromGlobal)) && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Globe size={12} className="text-blue-400" />
                    <span className="text-xs font-semibold text-blue-400">Inherited fields</span>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    Fields marked <span className="text-blue-400">Global</span> come from the Global Config.
                    Edit them there to apply consistently across all NFs.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
