import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Play, Square, Trash2, Download } from 'lucide-react';
import { api } from '../api';

const ANSI_COLORS: Record<string, string> = {
  '\x1b[31m': 'text-red-400', '\x1b[32m': 'text-emerald-400',
  '\x1b[33m': 'text-yellow-400', '\x1b[34m': 'text-blue-400',
  '\x1b[35m': 'text-purple-400', '\x1b[0m': 'text-gray-300',
};

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function colorLine(line: string): string {
  if (/error|ERROR|CRIT/.test(line)) return 'text-red-400';
  if (/warn|WARN/.test(line)) return 'text-yellow-400';
  if (/info|INFO/.test(line)) return 'text-gray-300';
  if (/debug|DEBUG/.test(line)) return 'text-gray-500';
  return 'text-gray-400';
}

interface LogLine { text: string; ts: string; color: string; }

export default function Logs() {
  const [nfs, setNfs] = useState<any[]>([]);
  const [selectedPod, setSelectedPod] = useState<string>('');
  const [lines, setLines] = useState<LogLine[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [tail, setTail] = useState(200);
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const logBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.nfs.list().then(data => {
      setNfs(data.filter((n: any) => n.podName));
      if (data.length > 0 && data[0].podName) setSelectedPod(data[0].podName);
    });
  }, []);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, autoScroll]);

  const loadLogs = useCallback(async () => {
    if (!selectedPod) return;
    try {
      const res = await api.logs.get(selectedPod, tail);
      const text: string = res.logs || '';
      const parsed = text.split('\n').filter(Boolean).map(l => ({
        text: stripAnsi(l),
        ts: new Date().toISOString(),
        color: colorLine(l),
      }));
      setLines(parsed);
    } catch (e: any) {
      setLines([{ text: `Error: ${e.message}`, ts: new Date().toISOString(), color: 'text-red-400' }]);
    }
  }, [selectedPod, tail]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const startStream = () => {
    if (!selectedPod || streaming) return;
    const url = api.logs.streamUrl(selectedPod);
    const es = new EventSource(url);
    setStreaming(true);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        setLines(prev => [...prev.slice(-999), {
          text: stripAnsi(data.line),
          ts: data.ts,
          color: colorLine(data.line),
        }]);
      } catch {}
    };
    es.onerror = () => {
      setStreaming(false);
      es.close();
    };
    eventSourceRef.current = es;
  };

  const stopStream = () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setStreaming(false);
  };

  const downloadLogs = () => {
    const text = lines.map(l => `${l.ts} ${l.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${selectedPod}-logs.txt`;
    a.click();
  };

  const filtered = filter
    ? lines.filter(l => l.text.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  const nfOptions = nfs.filter(n => n.podName);

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Logs</h1>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedPod}
          onChange={e => { setSelectedPod(e.target.value); stopStream(); setLines([]); }}
          className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
        >
          {nfOptions.map(n => (
            <option key={n.podName} value={n.podName}>{n.name.toUpperCase()} — {n.podName}</option>
          ))}
        </select>

        <select
          value={tail}
          onChange={e => setTail(Number(e.target.value))}
          className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none"
        >
          {[50, 100, 200, 500, 1000].map(v => <option key={v} value={v}>Last {v} lines</option>)}
        </select>

        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter logs..."
          className="bg-gray-800 border border-gray-700 text-gray-100 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500 w-48"
        />

        <div className="flex gap-2 ml-auto">
          {!streaming ? (
            <button onClick={startStream}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm">
              <Play size={13} /> Stream Live
            </button>
          ) : (
            <button onClick={stopStream}
              className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm">
              <Square size={13} /> Stop
            </button>
          )}
          <button onClick={loadLogs}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">
            Reload
          </button>
          <button onClick={downloadLogs}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm">
            <Download size={13} /> Export
          </button>
          <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)}
              className="rounded" />
            Auto-scroll
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span>{filtered.length} lines{filter && ` (filtered from ${lines.length})`}</span>
        {streaming && <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" /> Live streaming</span>}
      </div>

      <div
        ref={logBoxRef}
        className="flex-1 min-h-0 bg-gray-950 border border-gray-800 rounded-xl overflow-auto p-4 font-mono text-xs"
      >
        {filtered.map((l, i) => (
          <div key={i} className={`${l.color} leading-5 hover:bg-gray-800/40 px-1 rounded whitespace-pre-wrap break-all`}>
            <span className="text-gray-600 mr-3 select-none">{l.ts.substring(11, 23)}</span>
            {l.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
