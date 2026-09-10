'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  RotateCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  Trash2,
  LogIn,
  LogOut,
  X,
  FileCode,
  Check,
  RefreshCw,
  Sliders,
  MoreVertical,
} from 'lucide-react';
import { EmployeeProfile, PunchLog } from '@/lib/types/employee';

export default function AttendanceDashboard() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [logs, setLogs] = useState<PunchLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [importTab, setImportTab] = useState<'curl' | 'manual'>('curl');
  const [rawCurl, setRawCurl] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [manualForm, setManualForm] = useState({
    name: '',
    employeeId: '',
    username: '',
    companyDomainCode: 'uharvest',
    refreshToken: '',
    jwtToken: '',
    checkInMin: '08:00',
    checkInMax: '10:00',
    checkOutMin: '18:00',
    checkOutMax: '20:00',
    geoLocation: '210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India',
    latitude: '28.5004327',
    longitude: '77.4150811',
    geoAccuracy: '12.126',
  });

  const fetchData = useCallback(async () => {
    try {
      const [empRes, logsRes] = await Promise.all([
        fetch('/api/employees', { cache: 'no-store' }),
        fetch('/api/logs?limit=15', { cache: 'no-store' }),
      ]);

      const empData = await empRes.json();
      const logsData = await logsRes.json();

      if (empData.success) setEmployees(empData.employees || []);
      if (logsData.success) setLogs(logsData.logs || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleManualPunch = async (employeeId: number, punchType: 'CHECK_IN' | 'CHECK_OUT') => {
    const actionKey = `punch-${employeeId}-${punchType}`;
    setActionLoading(actionKey);
    setFeedback(null);

    try {
      const res = await fetch(`/api/employees/${employeeId}/punch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ punchType }),
      });
      const data = await res.json();

      if (data.success) {
        setFeedback({
          type: 'success',
          message: `${punchType === 'CHECK_IN' ? 'Clock-In' : 'Clock-Out'} marked successfully (${data.punchTime})`,
        });
        fetchData();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || 'Attendance punch failed.',
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Execution failed';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefreshToken = async (employeeId: number) => {
    const actionKey = `refresh-${employeeId}`;
    setActionLoading(actionKey);
    setMenuOpenId(null);
    setFeedback(null);

    try {
      const res = await fetch(`/api/employees/${employeeId}/refresh`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        setFeedback({
          type: 'success',
          message: 'Session refreshed successfully.',
        });
        fetchData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Refresh failed' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (employee: EmployeeProfile) => {
    try {
      const updatedSchedule = {
        ...employee.schedule,
        active: !employee.schedule.active,
      };
      const res = await fetch(`/api/employees/${employee.employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: updatedSchedule }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  const handleDeleteEmployee = async (id: string, name: string) => {
    setMenuOpenId(null);
    if (!confirm(`Remove ${name} from automated attendance?`)) return;
    try {
      const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: `${name} removed.` });
        fetchData();
      }
    } catch (err) {
      console.error('Failed to delete employee:', err);
    }
  };

  const handleOnboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('onboard');
    setFeedback(null);

    try {
      let payload: Record<string, unknown> = {};

      if (importTab === 'curl') {
        if (!rawCurl.trim()) {
          setFeedback({ type: 'error', message: 'Please paste your HROne cURL command.' });
          setActionLoading(null);
          return;
        }
        payload = { rawCurl };
      } else {
        if (!manualForm.employeeId || !manualForm.refreshToken) {
          setFeedback({ type: 'error', message: 'Employee ID and Refresh Token are required.' });
          setActionLoading(null);
          return;
        }
        payload = {
          name: manualForm.name,
          employeeId: Number(manualForm.employeeId),
          username: manualForm.username,
          companyDomainCode: manualForm.companyDomainCode,
          jwtToken: manualForm.jwtToken,
          refreshToken: manualForm.refreshToken,
          latitude: manualForm.latitude,
          longitude: manualForm.longitude,
          geoAccuracy: manualForm.geoAccuracy,
          geoLocation: manualForm.geoLocation,
          schedule: {
            active: true,
            checkInMin: manualForm.checkInMin,
            checkInMax: manualForm.checkInMax,
            checkOutMin: manualForm.checkOutMin,
            checkOutMax: manualForm.checkOutMax,
            workingDays: [1, 2, 3, 4, 5],
          },
        };
      }

      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setFeedback({
          type: 'success',
          message: data.message || 'Employee added successfully!',
        });
        setIsModalOpen(false);
        setRawCurl('');
        fetchData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to add employee.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error adding employee';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(null);
    }
  };

  const activeCount = employees.filter((e) => e.status === 'ACTIVE' && e.schedule.active).length;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 selection:bg-indigo-500 selection:text-white pb-16">
      {/* Subtle Ambient Light */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-72 bg-gradient-to-b from-indigo-900/15 via-transparent to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Clean Navbar */}
      <header className="border-b border-slate-800/60 bg-slate-950/40 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/30">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">HROne Attendance</h1>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Auto-Active
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => fetchData()}
              disabled={loading}
              className="p-2 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Employee</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between transition-all text-xs font-medium ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-white p-1 rounded-md"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Minimalist Summary Bar */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-1">
          <div className="flex items-center gap-2">
            <span>Enrolled: <strong className="text-white">{employees.length}</strong></span>
            <span>•</span>
            <span>Autopilot Active: <strong className="text-emerald-400">{activeCount}</strong></span>
          </div>
          <div>
            <span>Today: <strong className="text-slate-200">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</strong></span>
          </div>
        </div>

        {/* Employees Grid */}
        {employees.length === 0 && !loading ? (
          <div className="bg-slate-900/30 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
            <h3 className="text-sm font-semibold text-white">No employees enrolled</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Add Aditya, Rachit, Rohit, or any teammate to automate attendance.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Employee</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {employees.map((emp) => {
              const isCheckInAction = actionLoading === `punch-${emp.employeeId}-CHECK_IN`;
              const isCheckOutAction = actionLoading === `punch-${emp.employeeId}-CHECK_OUT`;
              const isMenuOpen = menuOpenId === emp.employeeId;

              return (
                <div
                  key={emp.employeeId}
                  className="bg-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-5 backdrop-blur-sm transition-all flex flex-col justify-between space-y-4 relative"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-indigo-300">
                          {emp.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white text-sm">{emp.name}</h3>
                            <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                              #{emp.employeeId}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400">
                            AltF Sector 142, Noida
                          </span>
                        </div>
                      </div>

                      {/* Status Toggle & Menu */}
                      <div className="flex items-center gap-1.5 relative">
                        <button
                          onClick={() => handleToggleActive(emp)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors flex items-center gap-1.5 ${
                            emp.schedule.active
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              emp.schedule.active ? 'bg-emerald-400' : 'bg-slate-500'
                            }`}
                          />
                          {emp.schedule.active ? 'Active' : 'Paused'}
                        </button>

                        <button
                          onClick={() => setMenuOpenId(isMenuOpen ? null : emp.employeeId)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                          <div className="absolute right-0 top-8 z-20 w-44 rounded-xl bg-slate-900 border border-slate-800 shadow-xl py-1 text-xs text-slate-300">
                            <button
                              onClick={() => handleRefreshToken(emp.employeeId)}
                              className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2 text-slate-300"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Refresh Session</span>
                            </button>
                            <button
                              onClick={() => emp._id && handleDeleteEmployee(emp._id, emp.name)}
                              className="w-full px-3 py-2 text-left hover:bg-rose-500/10 flex items-center gap-2 text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove Employee</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Punch Status */}
                    <div className="grid grid-cols-2 gap-2.5 mt-4">
                      <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            <LogIn className="w-3 h-3 text-emerald-400" /> In
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {emp.schedule.checkInMin} - {emp.schedule.checkInMax}
                          </span>
                        </div>
                        <div className="text-xs">
                          {emp.todayPunch?.checkInStatus === 'SUCCESS' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          ) : emp.todayPunch?.plannedCheckIn ? (
                            <span className="text-slate-300 font-mono">
                              At <strong className="text-indigo-400">{emp.todayPunch.plannedCheckIn}</strong>
                            </span>
                          ) : (
                            <span className="text-slate-400">Scheduled 8-10 AM</span>
                          )}
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            <LogOut className="w-3 h-3 text-indigo-400" /> Out
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {emp.schedule.checkOutMin} - {emp.schedule.checkOutMax}
                          </span>
                        </div>
                        <div className="text-xs">
                          {emp.todayPunch?.checkOutStatus === 'SUCCESS' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          ) : emp.todayPunch?.plannedCheckOut ? (
                            <span className="text-slate-300 font-mono">
                              At <strong className="text-indigo-400">{emp.todayPunch.plannedCheckOut}</strong>
                            </span>
                          ) : (
                            <span className="text-slate-400">Scheduled 6-8 PM</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Manual Punch Actions */}
                  <div className="pt-2 border-t border-slate-800/60 flex items-center gap-2">
                    <button
                      onClick={() => handleManualPunch(emp.employeeId, 'CHECK_IN')}
                      disabled={!!actionLoading}
                      className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 text-xs font-medium transition-all disabled:opacity-50"
                    >
                      <LogIn className="w-3 h-3" />
                      <span>{isCheckInAction ? 'Marking...' : 'Punch In'}</span>
                    </button>

                    <button
                      onClick={() => handleManualPunch(emp.employeeId, 'CHECK_OUT')}
                      disabled={!!actionLoading}
                      className="flex-1 inline-flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 text-xs font-medium transition-all disabled:opacity-50"
                    >
                      <LogOut className="w-3 h-3" />
                      <span>{isCheckOutAction ? 'Marking...' : 'Punch Out'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Clean Recent Activity */}
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Recent Activity</h3>
            <span className="text-[11px] text-slate-400">Live attendance status</span>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400">
              No recent attendance records yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 text-xs">
              {logs.map((log) => (
                <div key={log._id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        log.punchType === 'CHECK_IN'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-indigo-500/10 text-indigo-400'
                      }`}
                    >
                      {log.punchType === 'CHECK_IN' ? 'IN' : 'OUT'}
                    </span>
                    <span className="font-semibold text-white">{log.employeeName}</span>
                    <span className="text-slate-400 font-mono text-[11px]">{log.punchTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 font-medium ${
                        log.success ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {log.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      {log.success ? 'Success' : 'Failed'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Add Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Enroll Team Member</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setImportTab('curl')}
                className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  importTab === 'curl' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Paste cURL</span>
              </button>
              <button
                type="button"
                onClick={() => setImportTab('manual')}
                className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  importTab === 'manual' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Manual</span>
              </button>
            </div>

            <form onSubmit={handleOnboardSubmit} className="space-y-4">
              {importTab === 'curl' ? (
                <div className="space-y-2">
                  <label className="text-xs text-slate-300 block">
                    Paste HROne cURL from DevTools:
                  </label>
                  <textarea
                    rows={7}
                    value={rawCurl}
                    onChange={(e) => setRawCurl(e.target.value)}
                    placeholder="curl --request POST --url https://app.hrone.cloud/api/timeoffice/... --header 'Cookie: JwtTokenCookie=...'"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-indigo-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-400">
                    Auto-detects employee name, ID, credentials, and office coordinates.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400 mb-1 block">Name</label>
                    <input
                      type="text"
                      value={manualForm.name}
                      onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                      placeholder="Rachit Sharma"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 mb-1 block">Employee ID</label>
                    <input
                      type="number"
                      value={manualForm.employeeId}
                      onChange={(e) => setManualForm({ ...manualForm, employeeId: e.target.value })}
                      placeholder="2358"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-slate-400 mb-1 block">RefreshTokenCookie</label>
                    <input
                      type="text"
                      value={manualForm.refreshToken}
                      onChange={(e) => setManualForm({ ...manualForm, refreshToken: e.target.value })}
                      placeholder="UUID from cookies"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-indigo-300"
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'onboard'}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5"
                >
                  {actionLoading === 'onboard' ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save Employee</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
