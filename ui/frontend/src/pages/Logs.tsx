import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Play, Square, Download, RefreshCw, Database, Server } from 'lucide-react';
import { api } from '../api';

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function strip(s: string) { return s.replace(ANSI_RE, ''); }
function colorLine(line: string): string {
  if (/error|ERROR|CRIT|FATAL/.test(line)) return 'text-red-400';
  if (/warn|WARN|WARNING/.test(line))       return 'text-yellow-400';
  if (/info|INFO/.test(line))               return 'text-gray-300';
  if (/debug|DEBUG/.test(line))             return 'text-gray-500';
  return 'text-gray-400';
}

interface LogLine { text: string; ts: string; color: string; nf?: string; }

const SINCE_OPTS = ['15m','30m','1h','3h','6h','24h'];
const LEVEL_OPTS = ['all','ERROR','WARN','INFO','DEBUG'];
const NF_LIST    = ['amf','smf','upf','nrf','ausf','udm','udr','pcf','nssf','bsf'];

export default function Logs() {
  // Source: 'loki' | 'k8s' | 'detecting'
  const [source, setSource]       = useState<'loki'|'k8s'|'detecting'>('detecting');
  const [nfs, setNfs]             = useState<any[]>([]);
  const [selectedNf, setSelectedNf] = useState<string>('amf');
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [lines, setLines]         = useState<LogLine[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [tail, setTail]           = useState(200);
  const [since, setSince]         = useState('1h');
  const [filter, setFilter]       = useState('');
  const [level, setLevel]         = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const bottomRef      = useRef<HTMLDivElement>(null);

  // Detect Loki on mount
  useEffect(() => {
    api.logs.lokiReady().then(r => {
      setSource(r.ready ? 'loki' : 'k8s');
    }).catch(() => setSource('k8s'));
  }, []);

  // Load NF list for k8s pod picker
  useEffect(() => {
    api.nfs.list().then(data => {
      const withPod = data.filter((n: any) => n.podName);
      setNfs(withPod);
      if (withPod.length > 0) setSelectedPod(withPod[0].podName);
    }).catch(() => {});
  }, []);

  const loadLoki = useCallback(async () => {
    if (!selectedNf) return;
    setLoading(true);
    try {
      const res = await api.logs.lokiQuery({ nf: selectedNf, since, limit: tail });
      const parsed: LogLine[] = (res.lines || []).map((l: any) => ({
        text:  strip(l.line),
        ts:    l.ts,
        nf:    l.nfLabel,
        color: colorLine(l.line),
      }));
      setLines(parsed);
    } catch (e: any) {
      setLines([{ text: `Loki error: ${e.message}`, ts: new Date().toISOString(), color: 'text-red-400' }]);
    } finally { setLoading(false); }
  }, [selectedNf, since, tail]);

  const loadK8s = useCallback(async () => {
    if (!selectedPod) return;
    setLoading(true);
    try {
      const res = await api.logs.get(selectedPod, tail);
      const parsed: LogLine[] = (res.logs || '').split('\n').filter(Boolean).map((l: string) => ({
        text: strip(l), ts: new Date().toISOString(), color: colorLine(l),
      }));
      setLines(parsed);
    } catch (e: any) {
      setLines([{ text: `Error: ${e.message}`, ts: new Date().toISOString(), color: 'text-red-400' }]);
    } finally { setLoading(false); }
  }, [selectedPod, tail]);

  useEffect(() => {
    if (source === 'detecting') return;
    if (source === 'loki') loadLoki();
    else loadK8s();
  }, [source, loadLoki, loadK8s]);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, autoScroll]);

  const startStream = () => {
    if (!selectedPod || streaming) return;
    const url = api.logs.streamUrl(selectedPod);
    const es = new EventSource(url);
    setStreaming(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setLines(prev => [...prev.slice(-999), {
          text: strip(data.line), ts: data.ts, color: colorLine(data.line),
        }]);
      } catch {}
    };
    es.onerror = () => { setStreaming(false); es.close(); };
    eventSourceRef.current = es;
  };

  const stopStream = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setStreaming(false);
  };

  const reload = () => {
    if (source === 'loki') loadLoki();
    else loadK8s();
  };

  const downloadLogs = () => {
    const text = filtered.map(l => `${l.ts}${l.nf ? ` [${l.nf}]` : ''} ${l.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${selectedNf || selectedPod}-logs.txt`;
    a.click();
  };

  const filtered = lines.filter(l => {
    if (level !== 'all' && !l.text.toUpperCase().includes(level)) return false;
    if (filter && !l.text.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  const isLoki = source === 'loki';

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Logs</h1>
        <div className="flex items-center gap-2 text-xs">
          {source === 'detecting' ? (
            <span className="text-gray-500">Detecting log source…</span>
          ) : (
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
              isLoki
                ? 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                : 'bg-gray-800 border-gray-700 text-gray-400'
            }`}>
              {isLoki ? <Database size={11} /> : <Server size={11} />}
              {isLoki ? 'Loki' : 'k8s pod logs'}
            </span>
          )}
          {/* Manual source toggle */}
          {source !== 'detecting' && (
            <button
              onClick={() => { setLines([]); setSource(s => s === 'loki' ? 'k8s' : 'loki'); }}
              className="text-xs text-gray-600 hover:text-gray-400 underline"
            >
              switch
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* NF / pod selector */}
        {isLoki ? (
          <select
            value={selectedNf}
            onChange={e => { setSelectedNf(e.target.value); setLines([]); }}
            className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            {NF_LIST.map(nf => (
              <option key={nf} value={nf}>{nf.toUpperCase()}</option>
            ))}
            <option value="">All NFs</option>
          </select>
        ) : (
          <select
            value={selectedPod}
            onChange={e => { setSelectedPod(e.target.value); stopStream(); setLines([]); }}
            className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            {nfs.map(n => (
              <option key={n.podName} value={n.podName}>{n.name.toUpperCase()} — {n.podName}</option>
            ))}
          </select>
        )}

        {/* Time range (Loki) or tail (k8s) */}
        {isLoki ? (
          <select
            value={since}
            onChange={e => setSince(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none"
          >
            {SINCE_OPTS.map(v => <option key={v} value={v}>Last {v}</option>)}
          </select>
        ) : (
          <select
            value={tail}
            onChange={e => setTail(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none"
          >
            {[50,100,200,500,1000].map(v => <option key={v} value={v}>Last {v} lines</option>)}
          </select>
        )}

        {/* Level filter */}
        <select
          value={level}
          onChange={e => setLevel(e.target.value)}
          className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none"
        >
          {LEVEL_OPTS.map(l => <option key={l} value={l}>{l === 'all' ? 'All levels' : l}</option>)}
        </select>

        {/* Text filter */}
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter logs…"
          className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 w-48"
        />

        {/* Actions */}
        <div className="flex gap-2 ml-auto">
          {/* Stream (k8s only) */}
          {!isLoki && (!streaming ? (
            <button onClick={startStream}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">
              <Play size={13} /> Stream Live
            </button>
          ) : (
            <button onClick={stopStream}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">
              <Square size={13} /> Stop
            </button>
          ))}

          <button onClick={reload} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            {isLoki ? 'Query' : 'Reload'}
          </button>

          <button onClick={downloadLogs}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">
            <Download size={13} /> Export
          </button>

          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="rounded" />
            Auto-scroll
          </label>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>{filtered.length} lines{filter && ` (filtered from ${lines.length})`}</span>
        {streaming && (
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" /> Live streaming
          </span>
        )}
        {isLoki && (
          <span className="text-purple-400 flex items-center gap-1">
            <Database size={10} /> Loki · {since} window · persistent across restarts
          </span>
        )}
      </div>

      {/* Log box */}
      <div className="flex-1 min-h-0 bg-gray-950 border border-gray-800 rounded-xl overflow-auto p-4 font-mono text-xs">
        {loading && lines.length === 0 && (
          <div className="text-gray-600 text-center py-8">Loading…</div>
        )}
        {filtered.map((l, i) => (
          <div key={i} className={`${l.color} leading-5 hover:bg-gray-800/40 px-1 rounded whitespace-pre-wrap break-all`}>
            <span className="text-gray-600 mr-2 select-none">{l.ts.substring(11, 23)}</span>
            {l.nf && <span className="text-blue-400 mr-2">[{l.nf}]</span>}
            {l.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
