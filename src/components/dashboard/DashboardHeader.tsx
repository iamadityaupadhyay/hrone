'use client';

import { Clock, Plus, RotateCw, MessageSquare, Megaphone, Lock, LogOut } from 'lucide-react';

interface DashboardHeaderProps {
  istClock: string;
  loading: boolean;
  missingPasswordCount: number;
  whatsAppConnected: boolean;
  onRefresh: () => void;
  onOpenAddModal: () => void;
  onOpenWhatsAppModal: () => void;
  onOpenBroadcastModal: () => void;
  onOpenPasswordModal: () => void;
  onLogout: () => void;
}

export function DashboardHeader({
  istClock,
  loading,
  missingPasswordCount,
  whatsAppConnected,
  onRefresh,
  onOpenAddModal,
  onOpenWhatsAppModal,
  onOpenBroadcastModal,
  onOpenPasswordModal,
  onLogout,
}: DashboardHeaderProps) {
  return (
    <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-15 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-sm">
            <Clock className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-sm font-bold text-white tracking-tight">HROne Attendance</h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Auto-Pilot
            </span>
          </div>
        </div>

        {/* Right Action Utilities */}
        <div className="flex items-center gap-2">
          {/* Live IST Clock */}
          {istClock && (
            <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900/80 border border-zinc-800 text-xs font-mono text-zinc-300">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{istClock} IST</span>
            </div>
          )}

          {/* WhatsApp Bot Status Button */}
          <button
            onClick={onOpenWhatsAppModal}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              whatsAppConnected
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/15'
                : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
            title="WhatsApp Bot Status"
          >
            <MessageSquare className={`w-3.5 h-3.5 ${whatsAppConnected ? 'text-emerald-400' : 'text-zinc-400'}`} />
            <span className="hidden sm:inline">WhatsApp</span>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                whatsAppConnected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
              }`}
            />
          </button>

          {/* Broadcast Announcement Button */}
          <button
            onClick={onOpenBroadcastModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium transition-all"
            title="Broadcast Announcement"
          >
            <Megaphone className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">Broadcast</span>
          </button>

          {/* Password Management */}
          <button
            onClick={onOpenPasswordModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium transition-all relative"
            title="Manage Passwords"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Passwords</span>
            {missingPasswordCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-bold rounded-md">
                {missingPasswordCount}
              </span>
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white transition-colors"
            title="Refresh Fleet Data"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          {/* Add Employee CTA */}
          <button
            onClick={onOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold shadow-sm transition-all active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span className="hidden sm:inline">Add Employee</span>
          </button>

          {/* Sign Out */}
          <button
            onClick={onLogout}
            className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-rose-400 hover:border-rose-500/30 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}

