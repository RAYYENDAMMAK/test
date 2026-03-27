import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, Settings, BarChart3,
  Network, FileText, Radio, Layers, LogOut, User
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const nav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/subscribers', icon: Users, label: 'Subscribers' },
  { to: '/nf-config', icon: Settings, label: 'NF Config' },
  { to: '/metrics', icon: BarChart3, label: 'Metrics' },
  { to: '/topology', icon: Network, label: 'Topology' },
  { to: '/slicing', icon: Layers, label: 'Slicing' },
  { to: '/logs', icon: FileText, label: 'Logs' },
  { to: '/tracing', icon: Radio, label: 'Tracing' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <img
          src="/ieee-5g6g-innovation-testbed-logo.png"
          alt="IEEE 5G/6G Innovation Testbed"
          className="h-10 w-auto object-contain"
        />
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-gray-800 space-y-2">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-800/50">
          <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0">
            <User size={13} className="text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">{user?.displayName || user?.username}</div>
            <div className="text-[10px] text-gray-500 capitalize">{user?.role}</div>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            className="p-1 text-gray-500 hover:text-red-400 transition-colors rounded"
          >
            <LogOut size={13} />
          </button>
        </div>
        <div className="text-[10px] text-gray-700 text-center">Tunisia 5G Core Testbed</div>
      </div>
    </aside>
  );
}
