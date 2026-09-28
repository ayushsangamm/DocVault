import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  KeyRound,
  FileText,
  Share2,
  Layers,
  ShieldCheck,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useToast } from './Toast';

export function Navbar({ activeSharesCount = 0 }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const handleLogout = async () => {
    await logout();
    addToast('Logged out of DocVault', 'info');
    navigate('/login');
  };

  const getUserInitials = (name) => {
    if (!name) return 'DV';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-30 bg-[#09090b]/85 backdrop-blur-xl border-b border-zinc-800/80 px-6 sm:px-10 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Brand Logo & Navigation */}
        <div className="flex items-center gap-8">
          <NavLink to="/app/documents" className="flex items-center gap-3 cursor-pointer group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#FF3B5C] to-[#FF6B81] p-[1.5px] shadow-lg shadow-[#FF3B5C]/20 group-hover:scale-105 transition-transform duration-200">
              <div className="w-full h-full bg-[#09090b] rounded-[10px] flex items-center justify-center">
                <KeyRound className="w-4 h-4 text-[#FF3B5C]" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-sm tracking-tight text-white group-hover:text-zinc-200 transition">
                DocVault
              </span>
              <span className="text-[10px] font-mono text-zinc-500">v1.0</span>
            </div>
          </NavLink>

          {/* Navigation Pills */}
          <nav className="hidden md:flex items-center gap-1 bg-zinc-900/60 p-1 rounded-xl border border-zinc-800/80">
            <NavLink
              to="/app/documents"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                  isActive
                    ? 'bg-zinc-800 text-white border border-zinc-700/60 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`
              }
            >
              <FileText className="w-3.5 h-3.5 text-[#FF3B5C]" />
              <span>Documents</span>
            </NavLink>

            <NavLink
              to="/app/shares"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                  isActive
                    ? 'bg-zinc-800 text-white border border-zinc-700/60 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`
              }
            >
              <Share2 className="w-3.5 h-3.5 text-zinc-400" />
              <span>Shared by Me</span>
              {activeSharesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-md bg-zinc-950 text-[10px] font-mono text-emerald-400 border border-emerald-500/20">
                  {activeSharesCount}
                </span>
              )}
            </NavLink>

            <NavLink
              to="/app/audit"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                  isActive
                    ? 'bg-zinc-800 text-white border border-zinc-700/60 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`
              }
            >
              <Layers className="w-3.5 h-3.5 text-zinc-400" />
              <span>Audit Trail</span>
            </NavLink>

            <NavLink
              to="/app/analytics"
              className={({ isActive }) =>
                `px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition ${
                  isActive
                    ? 'bg-zinc-800 text-white border border-zinc-700/60 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }`
              }
            >
              <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
              <span>Security Ledger</span>
            </NavLink>
          </nav>
        </div>

        {/* Right Header Status & User Profile */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>End-to-End Audited</span>
          </div>

          <div className="flex items-center gap-2.5">
            <div
              title={user?.email || 'Owner Account'}
              className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono font-medium text-zinc-300"
            >
              {getUserInitials(user?.name)}
            </div>

            <button
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
}
