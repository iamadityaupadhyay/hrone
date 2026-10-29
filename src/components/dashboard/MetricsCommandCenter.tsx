'use client';

import { LogIn, LogOut, Key, Play, Pause, RotateCw } from 'lucide-react';

interface MetricsCommandCenterProps {
  totalCount: number;
  activeCount: number;
  satCount: number;
  checkedInTodayCount: number;
  checkedOutTodayCount: number;
  pendingCheckInCount: number;
  pendingCheckOutCount: number;
  actionLoading: string | null;
  onCheckinAll: () => void;
  onCheckoutAll: () => void;
  onLoginAll: () => void;
  onAutopilotAll: (action: 'resume' | 'pause') => void;
}

export function MetricsCommandCenter({
  totalCount,
  activeCount,
  satCount,
  checkedInTodayCount,
  checkedOutTodayCount,
  pendingCheckInCount,
  pendingCheckOutCount,
  actionLoading,
  onCheckinAll,
  onCheckoutAll,
  onLoginAll,
  onAutopilotAll,
}: MetricsCommandCenterProps) {
  const checkInPct = totalCount > 0 ? Math.round((checkedInTodayCount / totalCount) * 100) : 0;
  const checkOutPct = totalCount > 0 ? Math.round((checkedOutTodayCount / totalCount) * 100) : 0;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
      {/* Top Operations Action Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Bulk Punch Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onCheckinAll}
            disabled={actionLoading !== null}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-300 text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-50"
            title="Check IN all active employees pending check-in today"
          >
            {actionLoading === 'checkin-all' ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <LogIn className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>Check In All</span>
            {pendingCheckInCount > 0 ? (
              <span className="px-1.5 py-0.2 text-[10px] bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 font-bold rounded-md font-mono">
                {pendingCheckInCount} pending
              </span>
            ) : checkedInTodayCount > 0 ? (
              <span className="text-[10px] text-emerald-400 font-mono">✓ done</span>
            ) : null}
          </button>

          <button
            onClick={onCheckoutAll}
            disabled={actionLoading !== null}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/25 text-sky-300 text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-50"
            title="Punch OUT all active employees pending check-out today"
          >
            {actionLoading === 'checkout-all' ? (
              <RotateCw className="w-3.5 h-3.5 animate-spin text-sky-400" />
            ) : (
              <LogOut className="w-3.5 h-3.5 text-sky-400" />
            )}
            <span>Punch Out All</span>
            {pendingCheckOutCount > 0 ? (
              <span className="px-1.5 py-0.2 text-[10px] bg-sky-500/20 text-sky-200 border border-sky-500/30 font-bold rounded-md font-mono">
                {pendingCheckOutCount} pending
              </span>
            ) : checkedOutTodayCount > 0 ? (
              <span className="text-[10px] text-sky-400 font-mono">✓ done</span>
            ) : null}
          </button>
        </div>

        {/* Fleet Auth & Autopilot */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onLoginAll}
            disabled={actionLoading === 'login-all'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-300 text-xs font-medium transition-all active:scale-[0.98] disabled:opacity-50"
            title="Login / Re-authenticate all users with saved passwords"
          >
            <Key className={`w-3.5 h-3.5 text-amber-400 ${actionLoading === 'login-all' ? 'animate-spin' : ''}`} />
            <span>{actionLoading === 'login-all' ? 'Logging in...' : 'Login All Users'}</span>
          </button>

          <div className="flex items-center rounded-lg bg-zinc-950 border border-zinc-800 p-0.5">
            <button
              onClick={() => onAutopilotAll('resume')}
              disabled={actionLoading?.startsWith('autopilot-all')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                activeCount < totalCount
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 shadow-sm'
                  : 'text-zinc-300 hover:text-emerald-300'
              }`}
              title="Resume autopilot for all employees"
            >
              {actionLoading === 'autopilot-all-resume' ? (
                <RotateCw className="w-3 h-3 animate-spin text-emerald-400" />
              ) : (
                <Play className="w-3 h-3 text-emerald-400 fill-emerald-400" />
              )}
              <span>Resume All</span>
            </button>

            <button
              onClick={() => {
                if (confirm('Pause auto-pilot for all employees?')) {
                  onAutopilotAll('pause');
                }
              }}
              disabled={actionLoading?.startsWith('autopilot-all')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium text-zinc-400 hover:text-rose-400 transition-all"
              title="Pause autopilot for all employees"
            >
              {actionLoading === 'autopilot-all-pause' ? (
                <RotateCw className="w-3 h-3 animate-spin text-rose-400" />
              ) : (
                <Pause className="w-3 h-3 text-rose-400/80" />
              )}
              <span>Pause</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Tiles with Clean Progress Bars */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-zinc-800/60 text-xs">
        {/* Tile 1: Fleet */}
        <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Fleet Total</span>
          <div className="text-xl font-bold text-white mt-0.5 font-mono">{totalCount}</div>
          <div className="text-[11px] mt-1 flex items-center justify-between font-mono">
            <span className="text-emerald-400">{activeCount} active</span>
            {totalCount - activeCount > 0 && (
              <span className="text-amber-400">{totalCount - activeCount} paused</span>
            )}
          </div>
        </div>

        {/* Tile 2: Check-In Progress */}
        <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Checked In</span>
            <span className="font-mono text-emerald-400 font-semibold">{checkInPct}%</span>
          </div>
          <div className="text-xl font-bold text-white mt-0.5 font-mono">
            {checkedInTodayCount} <span className="text-xs text-zinc-500 font-normal">/ {totalCount}</span>
          </div>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1.5">
            <div className="bg-emerald-500 h-full rounded-full transition-all duration-300" style={{ width: `${checkInPct}%` }} />
          </div>
        </div>

        {/* Tile 3: Check-Out Progress */}
        <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Checked Out</span>
            <span className="font-mono text-sky-400 font-semibold">{checkOutPct}%</span>
          </div>
          <div className="text-xl font-bold text-white mt-0.5 font-mono">
            {checkedOutTodayCount} <span className="text-xs text-zinc-500 font-normal">/ {totalCount}</span>
          </div>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-1.5">
            <div className="bg-sky-500 h-full rounded-full transition-all duration-300" style={{ width: `${checkOutPct}%` }} />
          </div>
        </div>

        {/* Tile 4: Schedule */}
        <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-xl p-3 flex flex-col justify-between">
          <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">Schedule</span>
          <div className="text-sm font-semibold text-zinc-200 mt-0.5 truncate">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
          <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between font-mono">
            <span className="text-amber-400">Sat ON: {satCount}</span>
            <span className="text-zinc-500">Mon–Fri</span>
          </div>
        </div>
      </div>
    </div>
  );
}

