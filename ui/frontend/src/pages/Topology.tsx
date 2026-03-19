import React, { useEffect, useState, useCallback } from 'react';
import ReactFlow, {
  Node, Edge, Background, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType,
  BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { api } from '../api';
import { RefreshCw } from 'lucide-react';

const GROUP_POSITIONS: Record<string, { x: number; y: number }> = {
  ran:    { x: 100, y: 300 },
  core:   { x: 500, y: 50 },
  auth:   { x: 900, y: 50 },
  policy: { x: 900, y: 350 },
  cp:     { x: 500, y: 300 },
  up:     { x: 500, y: 520 },
  dn:     { x: 100, y: 520 },
  db:     { x: 1200, y: 200 },
  other:  { x: 700, y: 450 },
};

const GROUP_OFFSETS: Record<string, number[][]> = {
  auth:   [[0,0],[0,100],[0,200]],
  policy: [[0,0],[0,100],[0,200]],
  cp:     [[0,0],[200,0]],
  default:[[0,0]],
};

const STATUS_COLORS: Record<string, string> = {
  Running: '#10b981',
  Down: '#ef4444',
  Degraded: '#f59e0b',
  Unknown: '#6b7280',
  External: '#a855f7',
};

function buildNodes(rawNodes: any[]): Node[] {
  const groupCount: Record<string, number> = {};
  return rawNodes.map(n => {
    const base = GROUP_POSITIONS[n.group] || GROUP_POSITIONS.other;
    const offsets = GROUP_OFFSETS[n.group] || GROUP_OFFSETS.default;
    const idx = groupCount[n.group] || 0;
    groupCount[n.group] = idx + 1;
    const off = offsets[idx] || [0, idx * 90];
    const color = STATUS_COLORS[n.status] || STATUS_COLORS.Unknown;
    return {
      id: n.id,
      position: { x: base.x + off[0], y: base.y + off[1] },
      data: {
        label: (
          <div className="flex flex-col items-center gap-1 select-none">
            <div className="font-bold text-xs text-white">{n.label}</div>
            <div className="text-[10px]" style={{ color }}>{n.status}</div>
          </div>
        ),
      },
      style: {
        background: '#111827',
        border: `2px solid ${color}`,
        borderRadius: 10,
        padding: '8px 12px',
        minWidth: 90,
      },
      type: 'default',
    };
  });
}

function buildEdges(rawEdges: any[]): Edge[] {
  return rawEdges.map(e => ({
    id: e.id,
    source: e.from,
    target: e.to,
    label: e.label,
    type: 'smoothstep',
    labelStyle: { fill: '#6b7280', fontSize: 9 },
    labelBgStyle: { fill: '#111827' },
    style: { stroke: '#374151', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#374151' },
  }));
}

export default function Topology() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.topology.get();
      setNodes(buildNodes(data.nodes));
      setEdges(buildEdges(data.edges));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 h-full flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Network Topology</h1>
          <p className="text-gray-400 text-sm mt-1">5G Core — 3GPP TS 23.501 reference architecture</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="flex-1 min-h-0 bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => setSelected(node)}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1f2937" />
          <Controls className="bg-gray-900 border-gray-700" />
          <MiniMap
            nodeColor={n => {
              const s = (n.data?.label?.props?.children?.[1]?.props?.children) || 'Unknown';
              return STATUS_COLORS[s] || '#6b7280';
            }}
            style={{ background: '#111827' }}
          />
        </ReactFlow>
      </div>

      <div className="flex items-center gap-4 text-xs text-gray-500">
        {Object.entries(STATUS_COLORS).map(([s, c]) => (
          <div key={s} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ background: c }} />
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
