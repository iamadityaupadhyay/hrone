'use client';

import { CheckCircle2, RotateCw, MoreVertical, Calendar, RefreshCw, Key, Trash2, Shield, Lock, AlertCircle } from 'lucide-react';
import { EmployeeProfile } from '@/lib/types/employee';

interface EmployeeTableProps {
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

function getExpiryBadgeStyle(isoString?: string) {
  if (!isoString) return 'text-zinc-400 bg-zinc-950 border-zinc-800';
  const diffMs = new Date(isoString).getTime() - Date.now();
  if (diffMs <= 0) return 'text-rose-400 bg-rose-500/10 border-rose-500/25';
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 24) return 'text-amber-300 bg-amber-500/10 border-amber-500/25';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25';
}

export function EmployeeTable({
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
}: EmployeeTableProps) {
  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-950/70 text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
              <th className="py-3 px-4">Employee</th>
              <th className="py-3 px-4">Autopilot</th>
              <th className="py-3 px-4">Check-In</th>
              <th className="py-3 px-4">Check-Out</th>
              <th className="py-3 px-4">Saturday</th>
              <th className="py-3 px-4">Session</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-sans">
            {employees.map((emp) => {
              const isCheckedIn = emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkInStatus === 'SUCCESS';
              const isCheckedOut = emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkOutStatus === 'SUCCESS';
              const hasSaturday = (emp.schedule?.workingDays || [1, 2, 3, 4, 5]).includes(6);
              const isSuperAdmin = Boolean(emp.isSuperAdmin || emp.employeeId === 2357);
              const isCheckInAction = actionLoading === `punch-${emp.employeeId}-CHECK_IN`;
              const isCheckOutAction = actionLoading === `punch-${emp.employeeId}-CHECK_OUT`;
              const isMenuOpen = menuOpenId === emp.employeeId;

              return (
                <tr key={emp.employeeId} className="hover:bg-zinc-800/40 transition-colors">
                  {/* Employee Column */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700/80 flex items-center justify-center font-bold text-xs text-emerald-400 font-mono flex-shrink-0">
                        {emp.name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-zinc-100 text-xs truncate">{emp.name}</span>
                          {isSuperAdmin && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-semibold">
                              <Shield className="w-2.5 h-2.5" /> Admin
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono mt-0.5">
                          <span className="text-zinc-300">#{emp.employeeId}</span>
                          <span>•</span>
                          <span>{emp.username || emp.mobileNumber || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Autopilot Column */}
                  <td className="py-3 px-4">
                    <button
                      onClick={() => onToggleActive(emp)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                        emp.schedule.active
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                      title="Toggle autopilot status"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${emp.schedule.active ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
                      <span>{emp.schedule.active ? 'Active' : 'Paused'}</span>
                    </button>
                  </td>

                  {/* Today Check-In */}
                  <td className="py-3 px-4">
                    {isCheckedIn ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 font-mono text-[11px] text-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Done</span>
                        {emp.todayPunch?.checkedInAt && (
                          <span className="text-emerald-400/80 text-[10px]">
                            ({new Date(emp.todayPunch.checkedInAt).toLocaleTimeString('en-US', {
                              timeZone: 'Asia/Kolkata',
                              hour: '2-digit',
                              minute: '2-digit',
                            })})
                          </span>
                        )}
                      </span>
                    ) : emp.todayPunch?.plannedCheckIn ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400">
                        <span>At</span>
                        <strong className="text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-semibold">
                          {emp.todayPunch.plannedCheckIn}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-500">
                        {emp.schedule.checkInMin}–{emp.schedule.checkInMax}
                      </span>
                    )}
                  </td>

                  {/* Today Check-Out */}
                  <td className="py-3 px-4">
                    {isCheckedOut ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 font-mono text-[11px] text-emerald-300">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Done</span>
                        {emp.todayPunch?.checkedOutAt && (
                          <span className="text-emerald-400/80 text-[10px]">
                            ({new Date(emp.todayPunch.checkedOutAt).toLocaleTimeString('en-US', {
                              timeZone: 'Asia/Kolkata',
                              hour: '2-digit',
                              minute: '2-digit',
                            })})
                          </span>
                        )}
                      </span>
                    ) : emp.todayPunch?.plannedCheckOut ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400">
                        <span>At</span>
                        <strong className="text-sky-300 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded font-semibold">
                          {emp.todayPunch.plannedCheckOut}
                        </strong>
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-zinc-500">
                        {emp.schedule.checkOutMin}–{emp.schedule.checkOutMax}
                      </span>
                    )}
                  </td>

                  {/* Saturday Toggle */}
                  <td className="py-3 px-4">
                    <button
                      onClick={() => onToggleSaturday(emp)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border transition-colors ${
                        hasSaturday
                          ? 'bg-amber-500/10 border-amber-500/25 text-amber-300 hover:bg-amber-500/20'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {hasSaturday ? 'Sat ON' : 'Sat OFF'}
                    </button>
                  </td>

                  {/* Session Expiry & PW */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <span className={`px-1.5 py-0.5 rounded border ${getExpiryBadgeStyle(emp.tokenExpiry)}`}>
                        {formatExpiryText(emp.tokenExpiry)}
                      </span>
                      {emp.password ? (
                        <span className="text-emerald-400" title="Password Saved">
                          <Lock className="w-3 h-3" />
                        </span>
                      ) : (
                        <span className="text-amber-400" title="Missing Password">
                          <AlertCircle className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Row Actions */}
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5 relative">
                      <button
                        onClick={() => onManualPunch(emp.employeeId, 'CHECK_IN')}
                        disabled={!!actionLoading}
                        className="px-2 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 text-[11px] font-semibold transition-colors disabled:opacity-40"
                      >
                        {isCheckInAction ? <RotateCw className="w-3 h-3 animate-spin" /> : 'In'}
                      </button>

                      <button
                        onClick={() => onManualPunch(emp.employeeId, 'CHECK_OUT')}
                        disabled={!!actionLoading}
                        className="px-2 py-1 rounded-md bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/25 text-[11px] font-semibold transition-colors disabled:opacity-40"
                      >
                        {isCheckOutAction ? <RotateCw className="w-3 h-3 animate-spin" /> : 'Out'}
                      </button>

                      <button
                        onClick={() => onSetMenuOpenId(isMenuOpen ? null : emp.employeeId)}
                        className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {/* Dropdown Menu */}
                      {isMenuOpen && (
                        <div className="absolute right-0 top-8 z-30 w-52 rounded-xl bg-zinc-900 border border-zinc-800 shadow-xl py-1 text-xs text-zinc-300 text-left">
                          <button
                            onClick={() => onToggleSuperAdmin(emp)}
                            className="w-full px-3 py-2 text-left hover:bg-zinc-800 flex items-center gap-2 text-zinc-300"
                          >
                            <Shield className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{isSuperAdmin ? 'Demote Super Admin' : 'Promote Super Admin'}</span>
                          </button>
                          <button
                            onClick={() => {
                              onToggleSaturday(emp);
                              onSetMenuOpenId(null);
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-zinc-800 flex items-center gap-2 text-zinc-300"
                          >
                            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{hasSaturday ? 'Turn Off Saturday' : 'Enable Saturday Punch'}</span>
                          </button>
                          <button
                            onClick={() => onRefreshToken(emp.employeeId, false)}
                            className="w-full px-3 py-2 text-left hover:bg-zinc-800 flex items-center gap-2 text-zinc-300"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                            <span>Refresh Session</span>
                          </button>
                          {emp.password && (
                            <button
                              onClick={() => onRefreshToken(emp.employeeId, true)}
                              className="w-full px-3 py-2 text-left hover:bg-zinc-800 flex items-center gap-2 text-zinc-300"
                            >
                              <Key className="w-3.5 h-3.5 text-zinc-400" />
                              <span>Re-login with Password</span>
                            </button>
                          )}
                          <button
                            onClick={() => emp._id && onDeleteEmployee(emp._id, emp.name)}
                            className="w-full px-3 py-2 text-left hover:bg-rose-500/10 flex items-center gap-2 text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove Employee</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

