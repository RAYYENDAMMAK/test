import React from 'react';
import clsx from 'clsx';

const colors: Record<string, string> = {
  Running: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  Down: 'bg-red-500/20 text-red-400 border border-red-500/30',
  Degraded: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  Unknown: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  NotDeployed: 'bg-gray-500/20 text-gray-500 border border-gray-600/30',
  External: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', colors[status] || colors.Unknown)}>
      {status}
    </span>
  );
}
