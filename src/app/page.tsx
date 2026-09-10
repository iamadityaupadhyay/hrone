'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Clock,
  RotateCw,
  Plus,
  CheckCircle2,
  AlertCircle,
  MapPin,
  ShieldCheck,
  Trash2,
  Sparkles,
  Power,
  LogIn,
  LogOut,
  Calendar,
  X,
  FileCode,
  Check,
  ChevronRight,
  RefreshCw,
  Sliders,
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
  const [manualForm, setManualForm] = useState({
    name: '',
    employeeId: '',
    username: '',
    companyDomainCode: 'uharvest',
    refreshToken: '',
    jwtToken: '',
    checkInMin: '09:00',
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
        fetch('/api/logs?limit=30', { cache: 'no-store' }),
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
    const interval = setInterval(fetchData, 15000); // Auto-refresh UI every 15s
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
          message: `${punchType === 'CHECK_IN' ? 'Clock-In' : 'Clock-Out'} successful for employee #${employeeId} at ${data.punchTime}!`,
        });
        fetchData();
      } else {
        setFeedback({
          type: 'error',
          message: data.error || `Punch failed (HTTP ${data.httpStatus || 'error'})`,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Punch execution failed';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefreshToken = async (employeeId: number) => {
    const actionKey = `refresh-${employeeId}`;
    setActionLoading(actionKey);
    setFeedback(null);

    try {
      const res = await fetch(`/api/employees/${employeeId}/refresh`, {
        method: 'POST',
      });
      const data = await res.json();

      if (data.success) {
        setFeedback({
          type: 'success',
          message: `Sliding session refreshed! Access token extended to ${new Date(data.tokenExpiry).toLocaleDateString()}.`,
        });
        fetchData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Token refresh failed' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to refresh token';
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
    if (!confirm(`Are you sure you want to remove ${name} from automated attendance?`)) return;
    try {
      const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: `${name} removed from automated attendance.` });
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
          message: data.message || 'Employee onboarded successfully with sliding token!',
        });
        setIsModalOpen(false);
        setRawCurl('');
        fetchData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to onboard employee.' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error onboarding employee';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(null);
    }
  };

  const activeCount = employees.filter((e) => e.status === 'ACTIVE' && e.schedule.active).length;

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 selection:bg-indigo-500 selection:text-white pb-20">
      {/* Glow Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-96 bg-gradient-to-b from-indigo-900/20 via-purple-900/10 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-white">HROne Auto-Attendance</h1>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Autopilot Engine
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Automated Check-In (09:00 - 10:00) & Check-Out (18:00 - 20:00) with Sliding Sessions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => fetchData()}
              disabled={loading}
              className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              title="Refresh Data"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/50 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Add / Import Employee</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-3 text-sm font-medium">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Team Members
              </span>
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">{employees.length}</span>
              <span className="text-xs text-slate-400">enrolled</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Active on Autopilot
              </span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-emerald-400">{activeCount}</span>
              <span className="text-xs text-slate-400">auto-clocking</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Token Security
              </span>
              <ShieldCheck className="w-4 h-4 text-purple-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">Sliding</span>
              <span className="text-xs text-emerald-400 font-medium">Perpetual Refresh</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Default Location
              </span>
              <MapPin className="w-4 h-4 text-amber-400" />
            </div>
            <div className="mt-2">
              <span className="text-sm font-semibold text-white truncate block">AltF Sector 142</span>
              <span className="text-xs text-slate-400">Noida (28.5004, 77.4150)</span>
            </div>
          </div>
        </div>

        {/* Employees Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Team Attendance Status</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300">
                  {employees.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Individual attendance windows, token status, and manual triggers
              </p>
            </div>
          </div>

          {employees.length === 0 && !loading ? (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-3xl p-12 text-center">
              <div className="h-14 w-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4 text-indigo-400">
                <Users className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-white">No employees enrolled yet</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mt-1 mb-6">
                Add Aditya, Rachit, Rohit, or any teammate by simply pasting their HROne cURL command.
              </p>
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Onboard First Employee</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {employees.map((emp) => {
                const isCheckInAction = actionLoading === `punch-${emp.employeeId}-CHECK_IN`;
                const isCheckOutAction = actionLoading === `punch-${emp.employeeId}-CHECK_OUT`;
                const isRefreshAction = actionLoading === `refresh-${emp.employeeId}`;

                return (
                  <div
                    key={emp.employeeId}
                    className="bg-slate-900/70 border border-slate-800/90 hover:border-slate-700/80 rounded-3xl p-6 backdrop-blur-sm transition-all shadow-lg shadow-black/20 flex flex-col justify-between space-y-6"
                  >
                    <div>
                      {/* Top Bar */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3.5">
                          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-600/50 flex items-center justify-center font-bold text-lg text-indigo-300 shadow-inner">
                            {emp.name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-bold text-white text-base">{emp.name}</h3>
                              <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-400 font-mono">
                                #{emp.employeeId}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                              <span>Username: <strong className="text-slate-300">{emp.username}</strong></span>
                              <span>•</span>
                              <span>Domain: <strong className="text-slate-300">{emp.companyDomainCode}</strong></span>
                            </div>
                          </div>
                        </div>

                        {/* Status Switch */}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleActive(emp)}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                              emp.schedule.active
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                emp.schedule.active ? 'bg-emerald-400' : 'bg-slate-500'
                              }`}
                            />
                            {emp.schedule.active ? 'Autopilot ON' : 'Paused'}
                          </button>

                          <button
                            onClick={() => emp._id && handleDeleteEmployee(emp._id, emp.name)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Remove Employee"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Today's Schedule & Punch Details */}
                      <div className="grid grid-cols-2 gap-3 mt-5">
                        <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                            <span className="flex items-center gap-1.5 font-medium text-slate-300">
                              <LogIn className="w-3.5 h-3.5 text-emerald-400" /> Morning In
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {emp.schedule.checkInMin} - {emp.schedule.checkInMax}
                            </span>
                          </div>
                          <div className="text-xs">
                            {emp.todayPunch?.checkInStatus === 'SUCCESS' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Done today
                              </span>
                            ) : emp.todayPunch?.plannedCheckIn ? (
                              <span className="text-slate-300 font-mono">
                                Scheduled: <strong className="text-indigo-400">{emp.todayPunch.plannedCheckIn}</strong>
                              </span>
                            ) : (
                              <span className="text-slate-400">Pending next window</span>
                            )}
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80">
                          <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                            <span className="flex items-center gap-1.5 font-medium text-slate-300">
                              <LogOut className="w-3.5 h-3.5 text-indigo-400" /> Evening Out
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {emp.schedule.checkOutMin} - {emp.schedule.checkOutMax}
                            </span>
                          </div>
                          <div className="text-xs">
                            {emp.todayPunch?.checkOutStatus === 'SUCCESS' ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Done today
                              </span>
                            ) : emp.todayPunch?.plannedCheckOut ? (
                              <span className="text-slate-300 font-mono">
                                Scheduled: <strong className="text-indigo-400">{emp.todayPunch.plannedCheckOut}</strong>
                              </span>
                            ) : (
                              <span className="text-slate-400">Pending next window</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Token Health */}
                      <div className="mt-3.5 flex items-center justify-between text-xs text-slate-400 px-1">
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>
                            Token Active (
                            {emp.tokenExpiry
                              ? `Expires ${new Date(emp.tokenExpiry).toLocaleDateString()}`
                              : 'Auto-refreshing'}
                            )
                          </span>
                        </div>
                        <button
                          onClick={() => handleRefreshToken(emp.employeeId)}
                          disabled={isRefreshAction}
                          className="text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 text-xs"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRefreshAction ? 'animate-spin' : ''}`} />
                          Refresh
                        </button>
                      </div>
                    </div>

                    {/* Manual Trigger Buttons */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center gap-2.5">
                      <button
                        onClick={() => handleManualPunch(emp.employeeId, 'CHECK_IN')}
                        disabled={!!actionLoading}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold transition-all disabled:opacity-50"
                      >
                        <LogIn className={`w-3.5 h-3.5 ${isCheckInAction ? 'animate-bounce' : ''}`} />
                        <span>{isCheckInAction ? 'Punching In...' : 'Punch In Now'}</span>
                      </button>

                      <button
                        onClick={() => handleManualPunch(emp.employeeId, 'CHECK_OUT')}
                        disabled={!!actionLoading}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xs font-semibold transition-all disabled:opacity-50"
                      >
                        <LogOut className={`w-3.5 h-3.5 ${isCheckOutAction ? 'animate-bounce' : ''}`} />
                        <span>{isCheckOutAction ? 'Punching Out...' : 'Punch Out Now'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Background Daemon Helper Banner */}
        <div className="bg-gradient-to-r from-slate-900/90 via-indigo-950/40 to-slate-900/90 border border-indigo-500/20 rounded-3xl p-6 backdrop-blur-md">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-400" />
                <h4 className="text-sm font-bold text-white">Continuous Background Automation</h4>
              </div>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                The scheduler runs autonomously, keeping sessions alive and marking daily attendance with organic humanized jitter. To run the scheduler daemon in the background or with PM2:
              </p>
            </div>
            <div className="bg-slate-950/80 px-4 py-2 rounded-xl border border-slate-800 flex items-center gap-2 text-xs font-mono text-indigo-300">
              <span>$ npm run worker</span>
            </div>
          </div>
        </div>

        {/* Audit Logs Table */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 backdrop-blur-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Live Attendance Audit Logs</h3>
              <p className="text-xs text-slate-400">Real-time trace of API executions and HROne responses</p>
            </div>
            <button
              onClick={() => fetchData()}
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800/60"
            >
              <RotateCw className="w-3 h-3" /> Refresh Logs
            </button>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500">
              No punch executions recorded yet. Triggers will appear here.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/40 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Punch Time</th>
                    <th className="py-3 px-4">Trigger</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {logs.map((log) => (
                    <tr key={log._id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 text-slate-400 font-mono">
                        {new Date(log.executedAt).toLocaleTimeString()} ({new Date(log.executedAt).toLocaleDateString()})
                      </td>
                      <td className="py-3 px-4 font-semibold text-white">{log.employeeName}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                            log.punchType === 'CHECK_IN'
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          }`}
                        >
                          {log.punchType}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">{log.punchTime}</td>
                      <td className="py-3 px-4 text-slate-400">{log.triggerType}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            log.success ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {log.success ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                          {log.success ? 'Success' : `Failed (${log.httpStatus || 'Err'})`}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 truncate max-w-xs" title={log.error || JSON.stringify(log.responsePayload)}>
                        {log.error || (typeof log.responsePayload === 'object' ? JSON.stringify(log.responsePayload) : String(log.responsePayload || 'OK'))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Onboard Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Enroll Team Member</h3>
                  <p className="text-xs text-slate-400">Put Rachit, Rohit, or anyone on 100% automated attendance</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab selection */}
            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setImportTab('curl')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  importTab === 'curl'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileCode className="w-4 h-4" />
                <span>1-Click Import from cURL</span>
              </button>
              <button
                type="button"
                onClick={() => setImportTab('manual')}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  importTab === 'manual'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-4 h-4" />
                <span>Manual Details</span>
              </button>
            </div>

            <form onSubmit={handleOnboardSubmit} className="space-y-4">
              {importTab === 'curl' ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-300 block">
                    Paste HROne Attendance or OAuth cURL command:
                  </label>
                  <textarea
                    rows={8}
                    value={rawCurl}
                    onChange={(e) => setRawCurl(e.target.value)}
                    placeholder="curl --request POST --url https://app.hrone.cloud/api/timeoffice/... --header 'Cookie: JwtTokenCookie=...; RefreshTokenCookie=...'"
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-indigo-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 leading-relaxed"
                  />
                  <p className="text-[11px] text-slate-400 leading-normal">
                    💡 <strong>Tip:</strong> Open HROne in Chrome, open DevTools (F12) → Network tab, punch once or refresh the page, right-click the attendance or token request, and select <em>Copy as cURL</em>. We automatically parse employeeId, tokens, username, and coordinates!
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Full Name</label>
                    <input
                      type="text"
                      value={manualForm.name}
                      onChange={(e) => setManualForm({ ...manualForm, name: e.target.value })}
                      placeholder="e.g. Rachit Sharma"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Employee ID</label>
                    <input
                      type="number"
                      value={manualForm.employeeId}
                      onChange={(e) => setManualForm({ ...manualForm, employeeId: e.target.value })}
                      placeholder="e.g. 2358"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Username / Logon ID</label>
                    <input
                      type="text"
                      value={manualForm.username}
                      onChange={(e) => setManualForm({ ...manualForm, username: e.target.value })}
                      placeholder="e.g. E1886 or phone"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Company Domain Code</label>
                    <input
                      type="text"
                      value={manualForm.companyDomainCode}
                      onChange={(e) => setManualForm({ ...manualForm, companyDomainCode: e.target.value })}
                      placeholder="uharvest"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-slate-400 mb-1 block">RefreshTokenCookie / refreshId</label>
                    <input
                      type="text"
                      value={manualForm.refreshToken}
                      onChange={(e) => setManualForm({ ...manualForm, refreshToken: e.target.value })}
                      placeholder="UUID from cookies (e.g. 7907818f-b6a4-4e90-9537-cd3588381707)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-indigo-300 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Clock-In Window</label>
                    <div className="flex gap-2 items-center text-xs">
                      <input
                        type="time"
                        value={manualForm.checkInMin}
                        onChange={(e) => setManualForm({ ...manualForm, checkInMin: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      />
                      <span className="text-slate-500">to</span>
                      <input
                        type="time"
                        value={manualForm.checkInMax}
                        onChange={(e) => setManualForm({ ...manualForm, checkInMax: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Clock-Out Window</label>
                    <div className="flex gap-2 items-center text-xs">
                      <input
                        type="time"
                        value={manualForm.checkOutMin}
                        onChange={(e) => setManualForm({ ...manualForm, checkOutMin: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      />
                      <span className="text-slate-500">to</span>
                      <input
                        type="time"
                        value={manualForm.checkOutMax}
                        onChange={(e) => setManualForm({ ...manualForm, checkOutMax: e.target.value })}
                        className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-white"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading === 'onboard'}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {actionLoading === 'onboard' ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Validating & Enrolling...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Auto-Detect & Enroll</span>
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
