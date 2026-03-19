import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { api } from '../api';
import Card from '../components/Card';

const GRAFANA_DASHBOARDS = [
  { label: 'Overview', path: '/d/open5gs-overview' },
  { label: 'AMF', path: '/d/open5gs-amf' },
  { label: 'SMF', path: '/d/open5gs-smf' },
  { label: 'UPF', path: '/d/open5gs-upf' },
];

export default function Metrics() {
  const [summary, setSummary] = useState<any>({});
  const [grafanaUrl, setGrafanaUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'grafana' | 'charts'>('charts');
  const [grafanaDash, setGrafanaDash] = useState(GRAFANA_DASHBOARDS[0].path);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const [sum, g] = await Promise.allSettled([api.metrics.summary(), api.metrics.grafana()]);
      if (sum.status === 'fulfilled') {
        setSummary(sum.value);
        setHistory(h => [...h.slice(-19), { time: new Date().toLocaleTimeString(), ...sum.value }]);
      }
      if (g.status === 'fulfilled') setGrafanaUrl(g.value.url);
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchMetrics(); }, []);
  useEffect(() => {
    const t = setInterval(fetchMetrics, 10000);
    return () => clearInterval(t);
  }, []);

  const barData = [
    { name: 'UEs', value: Number(summary.amf_ue_count) || 0 },
    { name: 'Sessions', value: Number(summary.smf_session_count) || 0 },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Metrics</h1>
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-800 rounded-lg p-1">
            {['charts', 'grafana'].map(t => (
              <button key={t} onClick={() => setActiveTab(t as any)}
                className={`px-3 py-1 rounded text-sm capitalize transition-colors ${activeTab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                {t}
              </button>
            ))}
          </div>
          <button onClick={fetchMetrics} disabled={loading}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {activeTab === 'charts' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Active UEs', value: summary.amf_ue_count || '0', color: 'text-blue-400' },
              { label: 'PDU Sessions', value: summary.smf_session_count || '0', color: 'text-emerald-400' },
              { label: 'UPF RX', value: fmtBytes(summary.upf_bytes_in), color: 'text-purple-400' },
              { label: 'UPF TX', value: fmtBytes(summary.upf_bytes_out), color: 'text-orange-400' },
            ].map(item => (
              <div key={item.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wide">{item.label}</div>
                <div className={`text-2xl font-bold mt-1 ${item.color}`}>{item.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Card title="UE & Session Count">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', color: '#f9fafb' }} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Live UE Count (last 20 polls)">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="time" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', color: '#f9fafb' }} />
                  <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                  <Line type="monotone" dataKey="amf_ue_count" stroke="#3b82f6" name="UEs" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="smf_session_count" stroke="#10b981" name="Sessions" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card title="UPF Throughput (last 20 polls)">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" tick={{ fill: '#9ca3af', fontSize: 10 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={fmtBytes} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', color: '#f9fafb' }}
                  formatter={(v: any) => fmtBytes(v)} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                <Line type="monotone" dataKey="upf_bytes_in" stroke="#a855f7" name="RX Bytes" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="upf_bytes_out" stroke="#f97316" name="TX Bytes" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {activeTab === 'grafana' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            {GRAFANA_DASHBOARDS.map(d => (
              <button key={d.path} onClick={() => setGrafanaDash(d.path)}
                className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${grafanaDash === d.path ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                {d.label}
              </button>
            ))}
            {grafanaUrl && (
              <a href={`${grafanaUrl}${grafanaDash}`} target="_blank" rel="noreferrer"
                className="ml-auto flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
                <ExternalLink size={13} /> Open in Grafana
              </a>
            )}
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 260px)' }}>
            {grafanaUrl ? (
              <iframe
                src={`${grafanaUrl}${grafanaDash}?orgId=1&kiosk=tv&theme=dark`}
                className="w-full h-full border-0"
                title="Grafana Dashboard"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <div className="text-4xl mb-3">📊</div>
                <div className="font-medium">Grafana not configured</div>
                <div className="text-sm mt-1">Set GRAFANA_URL environment variable in the backend</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtBytes(val: any): string {
  const n = Number(val);
  if (isNaN(n) || n === 0) return '0';
  if (n > 1e9) return (n / 1e9).toFixed(1) + 'G';
  if (n > 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n > 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}
