'use client';

import {
  LogIn,
  LogOut,
  CheckCircle2,
  Calendar,
  MoreVertical,
  Shield,
  RotateCw,
  RefreshCw,
  Key,
  Trash2,
  Lock,
  AlertCircle,
} from 'lucide-react';
import { EmployeeProfile } from '@/lib/types/employee';

interface EmployeeGridProps {
  employees: EmployeeProfile[];
  todayDateStr: string;
  actionLoading: string | null;
  menuOpenId: number | null;
  onSetMenuOpenId: (id: number | null) => void;
  onToggleActive: (emp: EmployeeProfile) => void;
  onToggleSaturday: (emp: EmployeeProfile) => void;
  onToggleSuperAdmin: (emp: EmployeeProfile) => void;
  onManualPunch: (employeeId: number, type: 'CHECK_IN' | 'CHECK_OUT') => void;
  onRefreshToken: (employeeId: number, forcePassword?: boolean) => void;
  onDeleteEmployee: (id: string, name: string) => void;
}

function formatExpiryText(isoString?: string) {
  if (!isoString) return 'Auto-refresh';
  const diffMs = new Date(isoString).getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d left`;
  return `${hours}h left`;
}

export function EmployeeGrid({
  employees,
  todayDateStr,
  actionLoading,
  menuOpenId,
  onSetMenuOpenId,
  onToggleActive,
  onToggleSaturday,
  onToggleSuperAdmin,
  onManualPunch,
  onRefreshToken,
  onDeleteEmployee,
}: EmployeeGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {employees.map((emp) => {
        const isCheckedIn =
          emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkInStatus === 'SUCCESS';
        const isCheckedOut =
          emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkOutStatus === 'SUCCESS';
        const hasSaturday = (emp.schedule?.workingDays || [1, 2, 3, 4, 5]).includes(6);
        const isSuperAdmin = Boolean(emp.isSuperAdmin || emp.employeeId === 2357);
        const isCheckInAction = actionLoading === `punch-${emp.employeeId}-CHECK_IN`;
        const isCheckOutAction = actionLoading === `punch-${emp.employeeId}-CHECK_OUT`;
        const isMenuOpen = menuOpenId === emp.employeeId;

        return (
          <div
            key={emp.employeeId}
            className="bg-zinc-900/60 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl p-4.5 backdrop-blur-md transition-all flex flex-col justify-between space-y-3.5 shadow-lg relative group"
          >
            <div>
              {/* Header: Name, Avatar, ID, Status */}
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div className="h-9 w-9 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center font-bold text-xs text-emerald-400 font-mono flex-shrink-0">
                    {emp.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-semibold text-zinc-100 text-sm truncate max-w-[140px] sm:max-w-[170px]">
                        {emp.name}
                      </h3>
                      {isSuperAdmin && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-semibold">
                          <Shield className="w-2.5 h-2.5" /> Admin
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      #{emp.employeeId} • {emp.username || emp.mobileNumber || 'Employee'}
                    </span>
                  </div>
                </div>

                {/* Autopilot Badge & More Menu */}
                <div className="flex items-center gap-1.5 relative">
                  <button
                    onClick={() => onToggleActive(emp)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors flex items-center gap-1.5 ${
                      emp.schedule.active
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        emp.schedule.active ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
                      }`}
                    />
                    {emp.schedule.active ? 'Active' : 'Paused'}
                  </button>

                  <button
                    onClick={() => onSetMenuOpenId(isMenuOpen ? null : emp.employeeId)}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                  >
                    <MoreVertical className="w-3.5 h-3.5" />
                  </button>

                  {/* Dropdown Menu */}
                  {isMenuOpen && (
                    <div className="absolute right-0 top-8 z-30 w-52 rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl py-1 text-xs text-zinc-300 text-left">
                      <button
                        onClick={() => {
                          onToggleSuperAdmin(emp);
                          onSetMenuOpenId(null);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-zinc-800 flex items-center gap-2 text-zinc-300 transition-colors"
                      >
                        <Shield className={`w-3.5 h-3.5 ${isSuperAdmin ? 'text-zinc-100' : 'text-zinc-400'}`} />
                        <span>{isSuperAdmin ? 'Remove Super Admin' : 'Make Super Admin'}</span>
                      </button>
                      <button
                        onClick={() => {
                          onToggleSaturday(emp);
                          onSetMenuOpenId(null);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-zinc-800 flex items-center gap-2 text-zinc-300 transition-colors"
                      >
                        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{hasSaturday ? 'Turn Off Saturday' : 'Enable Saturday Punch'}</span>
                      </button>
                      <button
                        onClick={() => {
                          onRefreshToken(emp.employeeId, false);
                          onSetMenuOpenId(null);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-zinc-800 flex items-center gap-2 text-zinc-300 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                        <span>Refresh Session</span>
                      </button>
                      {emp.password && (
                        <button
                          onClick={() => {
                            onRefreshToken(emp.employeeId, true);
                            onSetMenuOpenId(null);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-zinc-800 flex items-center gap-2 text-zinc-200 transition-colors"
                        >
                          <Key className="w-3.5 h-3.5 text-zinc-400" />
                          <span>Re-login with Password</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (emp._id) onDeleteEmployee(emp._id, emp.name);
                          onSetMenuOpenId(null);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-rose-500/10 flex items-center gap-2 text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove Employee</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Today Punch Stat Boxes */}
              <div className="grid grid-cols-2 gap-2 mt-3">
                {/* In Box */}
                <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span className="font-medium text-zinc-300 flex items-center gap-1">
                      <LogIn className="w-2.5 h-2.5 text-emerald-400" /> In
                    </span>
                    <span className="font-mono text-zinc-500">{emp.schedule.checkInMin}</span>
                  </div>
                  <div className="text-xs">
                    {isCheckedIn ? (
                      <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                    ) : emp.todayPunch?.plannedCheckIn ? (
                      <span className="text-amber-300 font-mono font-semibold text-[11px]">
                        At {emp.todayPunch.plannedCheckIn}
                      </span>
                    ) : (
                      <span className="text-zinc-500 text-[10px]">Scheduled</span>
                    )}
                  </div>
                </div>

                {/* Out Box */}
                <div className="p-2.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                  <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-0.5">
                    <span className="font-medium text-zinc-300 flex items-center gap-1">
                      <LogOut className="w-2.5 h-2.5 text-sky-400" /> Out
                    </span>
                    <span className="font-mono text-zinc-500">{emp.schedule.checkOutMin}</span>
                  </div>
                  <div className="text-xs">
                    {isCheckedOut ? (
                      <span className="text-emerald-400 font-medium inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Done
                      </span>
                    ) : emp.todayPunch?.plannedCheckOut ? (
                      <span className="text-sky-300 font-mono font-semibold text-[11px]">
                        At {emp.todayPunch.plannedCheckOut}
                      </span>
                    ) : (
                      <span className="text-zinc-500 text-[10px]">Scheduled</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Metadata Pill Row */}
              <div className="mt-2.5 pt-2 border-t border-zinc-800/60 flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5 font-mono text-zinc-400">
                  <span className="text-emerald-400/90">{formatExpiryText(emp.tokenExpiry)}</span>
                  {emp.password ? (
                    <span className="text-emerald-400" title="Password Saved">
                      <Lock className="w-2.5 h-2.5" />
                    </span>
                  ) : (
                    <span className="text-amber-400" title="Missing Password">
                      <AlertCircle className="w-2.5 h-2.5" />
                    </span>
                  )}
                </div>
                <button
                  onClick={() => onToggleSaturday(emp)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-all ${
                    hasSaturday
                      ? 'bg-amber-500/10 text-amber-300 border border-amber-500/25'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {hasSaturday ? 'Sat ON' : 'Sat OFF'}
                </button>
              </div>
            </div>

            {/* Manual Punch Quick Action Buttons */}
            <div className="pt-2 border-t border-zinc-800/60 flex items-center gap-2">
              <button
                onClick={() => onManualPunch(emp.employeeId, 'CHECK_IN')}
                disabled={!!actionLoading}
                className="flex-1 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 text-xs font-medium transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {isCheckInAction ? (
                  <RotateCw className="w-3 h-3 animate-spin text-emerald-400" />
                ) : (
                  <LogIn className="w-3 h-3 text-emerald-400" />
                )}
                <span>Punch In</span>
              </button>
              <button
                onClick={() => onManualPunch(emp.employeeId, 'CHECK_OUT')}
                disabled={!!actionLoading}
                className="flex-1 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/25 text-xs font-medium transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {isCheckOutAction ? (
                  <RotateCw className="w-3 h-3 animate-spin text-sky-400" />
                ) : (
                  <LogOut className="w-3 h-3 text-sky-400" />
                )}
                <span>Punch Out</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

