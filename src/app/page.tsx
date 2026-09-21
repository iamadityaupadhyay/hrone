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
  Key,
  ShieldCheck,
  MessageSquare,
  Smartphone,
  Eye,
  EyeOff,
  Lock,
  ShieldAlert,
  Save,
  Megaphone,
} from 'lucide-react';
import { EmployeeProfile, PunchLog } from '@/lib/types/employee';
import BroadcastModal from '@/components/BroadcastModal';

function formatTokenExpiry(isoString?: string) {
  if (!isoString) return 'Active (Auto-refresh)';
  const date = new Date(isoString);
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  const formatted = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (diffDays >= 1) {
    return `${formatted} (${diffDays}d left)`;
  }
  return `${formatted} (${diffHours}h left)`;
}

export default function AttendanceDashboard() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [logs, setLogs] = useState<PunchLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Password Management State
  const [showPasswordModal, setShowPasswordModal] = useState<boolean>(false);
  const [passwordInputs, setPasswordInputs] = useState<Record<number, string>>({});
  const [showPasswordVisibility, setShowPasswordVisibility] = useState<Record<number, boolean>>({});
  const [savingPasswordId, setSavingPasswordId] = useState<number | null>(null);
  const [passwordSaveStatus, setPasswordSaveStatus] = useState<Record<number, string>>({});

  // WhatsApp Bot State
  const [showWhatsAppModal, setShowWhatsAppModal] = useState<boolean>(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState<boolean>(false);
  const [whatsAppStatus, setWhatsAppStatus] = useState<{
    status: string;
    phoneNumber?: string;
    qrDataUrl?: string;
    updatedAt?: string;
  } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [importTab, setImportTab] = useState<'login' | 'curl' | 'manual'>('login');
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: '',
    companyDomainCode: 'uharvest',
  });
  const [rawCurl, setRawCurl] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [manualForm, setManualForm] = useState({
    name: '',
    employeeId: '',
    username: '',
    companyDomainCode: 'uharvest',
    refreshToken: '',
    jwtToken: '',
    checkInMin: '09:30',
    checkInMax: '09:55',
    checkOutMin: '19:00',
    checkOutMax: '21:00',
    geoLocation: '210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India',
    latitude: '28.5004327',
    longitude: '77.4150811',
    geoAccuracy: '12.126',
  });

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading('login');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: data.message });
        setIsModalOpen(false);
        setLoginForm({ username: '', password: '', companyDomainCode: 'uharvest' });
        fetchData();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Authentication failed' });
      }
    } catch {
      setFeedback({ type: 'error', message: 'Failed to contact authentication server' });
    } finally {
      setActionLoading(null);
    }
  };

  const fetchData = useCallback(async () => {
    try {
      const [empRes, logsRes, waRes] = await Promise.all([
        fetch('/api/employees', { cache: 'no-store' }),
        fetch('/api/logs?limit=15', { cache: 'no-store' }),
        fetch('/api/whatsapp/status', { cache: 'no-store' }),
      ]);

      const empData = await empRes.json();
      const logsData = await logsRes.json();
      const waData = await waRes.json();

      if (empData.success) setEmployees(empData.employees || []);
      if (logsData.success) setLogs(logsData.logs || []);
      if (waData.success) setWhatsAppStatus(waData);
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

  // Fast-poll WhatsApp status when modal is open to detect instant pairing
  useEffect(() => {
    if (!showWhatsAppModal) return;
    const fastPoll = setInterval(async () => {
      try {
        const res = await fetch('/api/whatsapp/status', { cache: 'no-store' });
        const data = await res.json();
        if (data.success) setWhatsAppStatus(data);
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(fastPoll);
  }, [showWhatsAppModal]);

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

  const handleLoginAll = async (forcePassword = false) => {
    setActionLoading('login-all');
    setFeedback(null);
    try {
      const res = await fetch('/api/employees/login-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcePassword }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: data.message || 'All employees logged in successfully!',
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.message || data.error || 'Some logins failed.',
        });
      }
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bulk login failed';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefreshToken = async (employeeId: number, forcePassword = false) => {
    const actionKey = `refresh-${employeeId}`;
    setActionLoading(actionKey);
    setMenuOpenId(null);
    setFeedback(null);

    try {
      const res = await fetch(`/api/employees/${employeeId}/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcePassword }),
      });
      const data = await res.json();

      if (data.success) {
        setFeedback({
          type: 'success',
          message: data.message || 'Session logged in / refreshed successfully.',
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

  const handleSavePassword = async (employee: EmployeeProfile, passToSave?: string) => {
    const pwd = passToSave !== undefined ? passToSave : passwordInputs[employee.employeeId];
    if (!pwd || !pwd.trim()) {
      setPasswordSaveStatus((prev) => ({ ...prev, [employee.employeeId]: '⚠️ Password cannot be blank' }));
      return;
    }

    setSavingPasswordId(employee.employeeId);
    setPasswordSaveStatus((prev) => ({ ...prev, [employee.employeeId]: 'Saving...' }));

    try {
      const res = await fetch(`/api/employees/${employee.employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        setPasswordSaveStatus((prev) => ({ ...prev, [employee.employeeId]: `❌ Failed: ${data.error}` }));
        return;
      }

      setPasswordSaveStatus((prev) => ({ ...prev, [employee.employeeId]: '✅ Password saved!' }));
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setPasswordSaveStatus((prev) => ({ ...prev, [employee.employeeId]: `❌ Error: ${msg}` }));
    } finally {
      setSavingPasswordId(null);
    }
  };

  const handleSaveAllPasswords = async () => {
    setActionLoading('save-all-passwords');
    for (const emp of employees) {
      const pwd = passwordInputs[emp.employeeId];
      if (pwd && pwd.trim()) {
        await handleSavePassword(emp, pwd.trim());
      }
    }
    setActionLoading(null);
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
              onClick={() => setShowWhatsAppModal(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                whatsAppStatus?.status === 'CONNECTED'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
              }`}
              title="WhatsApp Attendance Bot"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>WhatsApp Bot</span>
              {whatsAppStatus?.status === 'CONNECTED' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setShowBroadcastModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600/15 hover:bg-violet-600/25 border border-violet-500/30 text-violet-200 text-xs font-semibold shadow-sm transition-all active:scale-95"
              title="Broadcast Announcement to Employees via WhatsApp"
            >
              <Megaphone className="w-3.5 h-3.5 text-violet-400" />
              <span>Broadcast</span>
            </button>
            <button
              onClick={() => fetchData()}
              disabled={loading}
              className="p-2 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-semibold transition-all active:scale-95 relative"
              title="Manage Passwords"
            >
              <Lock className="w-3.5 h-3.5 text-indigo-400" />
              <span>Passwords</span>
              {employees.filter((e) => !e.password).length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-amber-500 text-slate-950 font-extrabold rounded-full animate-pulse">
                  {employees.filter((e) => !e.password).length}
                </span>
              )}
            </button>
            <button
              onClick={() => handleLoginAll(true)}
              disabled={actionLoading === 'login-all'}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
              title="Login/Re-authenticate all users with saved passwords"
            >
              <Key className={`w-3.5 h-3.5 text-amber-400 ${actionLoading === 'login-all' ? 'animate-spin' : ''}`} />
              <span>{actionLoading === 'login-all' ? 'Logging in...' : 'Login All Users'}</span>
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

        {/* Missing Password Warning Banner */}
        {employees.filter((e) => !e.password).length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between text-xs transition-all shadow-lg shadow-amber-500/5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 flex-shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-amber-200 text-sm">
                  {employees.filter((e) => !e.password).length}{' '}
                  {employees.filter((e) => !e.password).length === 1 ? 'Employee has' : 'Employees have'} no saved password
                </h4>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  Missing password for:{' '}
                  <strong className="text-amber-200">
                    {employees
                      .filter((e) => !e.password)
                      .map((e) => e.name)
                      .join(', ')}
                  </strong>
                  . Save their passwords so automatic background re-authentication works seamlessly.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95 flex-shrink-0 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Save Passwords</span>
            </button>
          </div>
        )}

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
                          <div className="absolute right-0 top-8 z-20 w-48 rounded-xl bg-slate-900 border border-slate-800 shadow-xl py-1 text-xs text-slate-300">
                            <button
                              onClick={() => handleRefreshToken(emp.employeeId, false)}
                              className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2 text-slate-300"
                            >
                              <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Refresh Session</span>
                            </button>
                            {emp.password && (
                              <button
                                onClick={() => handleRefreshToken(emp.employeeId, true)}
                                className="w-full px-3 py-2 text-left hover:bg-amber-500/10 flex items-center gap-2 text-amber-300"
                              >
                                <Key className="w-3.5 h-3.5 text-amber-400" />
                                <span>Re-login with Password</span>
                              </button>
                            )}
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

                    {/* Token & Session Expiry Details */}
                    <div className="mt-3 pt-2.5 border-t border-slate-800/60 grid grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-2.5 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                          <span className="font-medium text-slate-300 flex items-center gap-1">
                            <Key className="w-3 h-3 text-indigo-400" /> Token Expiry
                          </span>
                        </div>
                        <span className="text-slate-300 font-mono text-[10px]">
                          {formatTokenExpiry(emp.tokenExpiry)}
                        </span>
                      </div>

                      <div className="bg-slate-950/40 border border-slate-800/50 rounded-xl p-2.5 flex flex-col justify-between">
                        <div className="flex items-center justify-between text-slate-400 mb-1">
                          <span className="font-medium text-slate-300 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" /> Refresh Expiry
                          </span>
                        </div>
                        <span className="text-slate-300 font-mono text-[10px]">
                          {formatTokenExpiry(emp.refreshTokenExpiry)}
                        </span>
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
            <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800 text-xs font-semibold gap-1">
              <button
                type="button"
                onClick={() => setImportTab('login')}
                className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  importTab === 'login' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>HROne Login</span>
              </button>
              <button
                type="button"
                onClick={() => setImportTab('curl')}
                className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  importTab === 'curl' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>Paste cURL</span>
              </button>
              <button
                type="button"
                onClick={() => setImportTab('manual')}
                className={`flex-1 py-1.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  importTab === 'manual' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Manual</span>
              </button>
            </div>

            {importTab === 'login' ? (
              <form onSubmit={handleDirectLogin} className="space-y-4">
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-300 mb-1 block font-medium">HROne Username / Employee Code</label>
                    <input
                      type="text"
                      required
                      value={loginForm.username}
                      onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                      placeholder="E1885 or 8112299688"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 mb-1 block font-medium">HROne Password</label>
                    <input
                      type="password"
                      required
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      placeholder="••••••••••••"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-slate-300 mb-1 block font-medium">Company Domain Code</label>
                    <input
                      type="text"
                      required
                      value={loginForm.companyDomainCode}
                      onChange={(e) => setLoginForm({ ...loginForm, companyDomainCode: e.target.value })}
                      placeholder="uharvest"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
                    ⚡ Authenticates directly with HROne Cloud, fetches your sliding refresh token, and configures 24/7 attendance auto-pilot automatically.
                  </p>
                </div>

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
                    disabled={actionLoading === 'login'}
                    className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
                  >
                    {actionLoading === 'login' ? (
                      <>
                        <RotateCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Authenticating...</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-3.5 h-3.5" />
                        <span>Log In & Enroll</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
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
            )}
          </div>
        </div>
      )}

      {/* WhatsApp Bot Connection Modal */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl relative">
            <button
              onClick={() => setShowWhatsAppModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">WhatsApp Attendance Bot</h3>
                <p className="text-xs text-slate-400">Control punches and receive automated alerts on WhatsApp</p>
              </div>
            </div>

            {whatsAppStatus?.status === 'CONNECTED' ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-semibold text-emerald-300">Bot Connected & Online</span>
                    </div>
                    <span className="text-xs font-mono font-medium text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/40">
                      {whatsAppStatus.phoneNumber || 'Active'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Your bot is active. You and your team can send messages to this WhatsApp number to interact with HROne!
                  </p>
                </div>

                <div className="space-y-2 text-xs text-slate-400 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800">
                  <span className="text-slate-200 font-semibold block">Available Chat Commands:</span>
                  <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] pt-1">
                    <div className="bg-slate-900 px-2 py-1 rounded text-indigo-300">• status</div>
                    <div className="bg-slate-900 px-2 py-1 rounded text-emerald-300">• in / punch in</div>
                    <div className="bg-slate-900 px-2 py-1 rounded text-rose-300">• out / punch out</div>
                    <div className="bg-slate-900 px-2 py-1 rounded text-amber-300">• refresh</div>
                    <div className="bg-slate-900 px-2 py-1 rounded text-cyan-300">• logs</div>
                    <div className="bg-slate-900 px-2 py-1 rounded text-purple-300">• team</div>
                  </div>
                </div>

                <div className="text-center text-xs text-slate-400 pt-1">
                  💡 Send <strong className="text-white">help</strong> on WhatsApp to get started.
                </div>
              </div>
            ) : whatsAppStatus?.status === 'PAIRING' && whatsAppStatus?.qrDataUrl ? (
              <div className="space-y-4 text-center">
                <div className="p-3 bg-white rounded-2xl inline-block shadow-lg border-4 border-emerald-500/30 mx-auto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={whatsAppStatus.qrDataUrl}
                    alt="WhatsApp QR Code"
                    className="w-56 h-56 object-contain rounded-lg"
                  />
                </div>

                <div className="space-y-1.5 text-xs text-slate-300">
                  <p className="font-semibold text-white">Scan this QR code with WhatsApp:</p>
                  <ol className="text-slate-400 space-y-1 text-left max-w-xs mx-auto list-decimal list-inside text-[11px]">
                    <li>Open WhatsApp on your phone (or 2nd SIM)</li>
                    <li>Tap <strong className="text-slate-200">Settings</strong> (or 3 dots) → <strong className="text-slate-200">Linked Devices</strong></li>
                    <li>Tap <strong className="text-emerald-400">Link a Device</strong> and point camera here</li>
                  </ol>
                </div>

                <div className="flex items-center justify-center gap-2 text-[11px] text-emerald-400/80">
                  <RotateCw className="w-3 h-3 animate-spin" />
                  <span>Waiting for scan... (updates automatically)</span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-slate-300 text-xs font-semibold">
                    <Smartphone className="w-4 h-4 text-indigo-400" />
                    <span>Start WhatsApp Worker</span>
                  </div>
                  <p className="text-xs text-slate-400">
                    To connect WhatsApp via UI, start the local worker in your terminal. It will instantly stream the QR code to this window:
                  </p>
                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-indigo-300 select-all">
                    npm run whatsapp
                  </div>
                </div>

                <div className="text-xs text-slate-500 text-center">
                  Once started, the QR code will appear on this screen automatically within 2 seconds.
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowWhatsAppModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save & Manage Passwords Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setShowPasswordModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Save & Manage Employee Passwords</h3>
                <p className="text-xs text-slate-400">
                  Save passwords to enable automated background re-authentication and bulk login
                </p>
              </div>
            </div>

            <div className="overflow-y-auto space-y-3.5 pr-1 flex-1 text-xs">
              {employees.length === 0 ? (
                <div className="text-center py-8 text-slate-500">No employees enrolled yet.</div>
              ) : (
                employees.map((emp) => {
                  const currentInput =
                    passwordInputs[emp.employeeId] !== undefined
                      ? passwordInputs[emp.employeeId]
                      : emp.password || '';
                  const isSaving = savingPasswordId === emp.employeeId;
                  const isVisible = !!showPasswordVisibility[emp.employeeId];
                  const statusMsg = passwordSaveStatus[emp.employeeId];

                  return (
                    <div
                      key={emp.employeeId}
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-indigo-300">
                            {emp.name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')
                              .toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{emp.name}</span>
                              <span className="text-[10px] font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                                #{emp.employeeId}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              Username: {emp.username || emp.employeeId}
                            </span>
                          </div>
                        </div>

                        <div>
                          {emp.password ? (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                              <CheckCircle2 className="w-3 h-3" /> Saved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-medium animate-pulse">
                              <Key className="w-3 h-3 text-amber-400" /> Missing
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type={isVisible ? 'text' : 'password'}
                            value={currentInput}
                            onChange={(e) =>
                              setPasswordInputs({ ...passwordInputs, [emp.employeeId]: e.target.value })
                            }
                            placeholder="Enter HROne Password"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 px-3 pr-9 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowPasswordVisibility({
                                ...showPasswordVisibility,
                                [emp.employeeId]: !isVisible,
                              })
                            }
                            className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                          >
                            {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={isSaving || !currentInput.trim()}
                          onClick={() => handleSavePassword(emp, currentInput)}
                          className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/20"
                        >
                          {isSaving ? (
                            <>
                              <RotateCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-3.5 h-3.5" />
                              <span>Save</span>
                            </>
                          )}
                        </button>
                      </div>

                      {statusMsg && (
                        <div
                          className={`text-[11px] font-medium pt-0.5 ${
                            statusMsg.includes('✅')
                              ? 'text-emerald-400'
                              : statusMsg.includes('⚠️')
                              ? 'text-amber-300'
                              : 'text-rose-400'
                          }`}
                        >
                          {statusMsg}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Passwords are used exclusively for automated HROne re-authentication.
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
                >
                  Done
                </button>
                <button
                  onClick={handleSaveAllPasswords}
                  disabled={actionLoading === 'save-all-passwords'}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-600/20 disabled:opacity-50"
                >
                  {actionLoading === 'save-all-passwords' ? (
                    <>
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving All...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Save All</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Modal */}
      <BroadcastModal
        isOpen={showBroadcastModal}
        onClose={() => setShowBroadcastModal(false)}
        employees={employees}
        whatsAppStatus={whatsAppStatus}
        onSuccessNotification={(msg) => setFeedback({ type: 'success', message: msg })}
      />
    </div>
  );
}
