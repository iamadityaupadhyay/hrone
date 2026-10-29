'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  Save,
  Megaphone,
  Calendar,
  Play,
  Pause,
  Search,
  LayoutGrid,
  List,
  ArrowUpDown,
  Filter,
  Shield,
  Sparkles,
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

function getTokenExpiryColor(isoString?: string) {
  if (!isoString) return 'text-slate-400 border-slate-800 bg-slate-900/60';
  const diffMs = new Date(isoString).getTime() - Date.now();
  if (diffMs <= 0) return 'text-rose-400 border-rose-500/30 bg-rose-500/10';
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 24) return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
  return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
}

export default function AttendanceDashboard() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [logs, setLogs] = useState<PunchLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Search, Filter, Sort & View Modes
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'checked_in' | 'pending_in' | 'checked_out' | 'pending_out' | 'paused' | 'saturday' | 'missing_pw'
  >('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [sortBy, setSortBy] = useState<
    'pending_first' | 'name_asc' | 'name_desc' | 'id_asc' | 'id_desc' | 'token_expiry'
  >('pending_first');
  const [istClock, setIstClock] = useState('');

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
    checkOutMax: '19:30',
    includeSaturday: false,
    geoLocation: '210-211, altF, Sector 142, Noida, Uttar Pradesh 201304, India',
    latitude: '28.5004327',
    longitude: '77.4150811',
    geoAccuracy: '12.126',
  });

  // Live IST Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setIstClock(
        now.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [empRes, logsRes, waRes] = await Promise.all([
        fetch('/api/employees', { cache: 'no-store' }),
        fetch('/api/logs?limit=20', { cache: 'no-store' }),
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

  // Fast-poll WhatsApp status when modal is open
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

  const handleAutopilotAll = async (action: 'resume' | 'pause') => {
    const actionKey = `autopilot-all-${action}`;
    setActionLoading(actionKey);
    setFeedback(null);
    try {
      const res = await fetch('/api/employees/autopilot-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: data.message || `All autopilots ${action === 'resume' ? 'resumed' : 'paused'} successfully!`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.message || data.error || `Failed to ${action} autopilots.`,
        });
      }
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to ${action} autopilots`;
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckinAll = async (force = false) => {
    setActionLoading('checkin-all');
    setFeedback(null);
    try {
      const res = await fetch('/api/employees/checkin-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: data.message || 'All employees checked in successfully!',
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.message || data.error || 'Some check-ins failed.',
        });
      }
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bulk check-in failed';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckoutAll = async (force = false) => {
    setActionLoading('checkout-all');
    setFeedback(null);
    try {
      const res = await fetch('/api/employees/checkout-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: data.message || 'All employees checked out successfully!',
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.message || data.error || 'Some check-outs failed.',
        });
      }
      fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bulk check-out failed';
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
      const nextActive = !employee.schedule.active;
      const updatedSchedule = {
        ...employee.schedule,
        active: nextActive,
      };
      const res = await fetch(`/api/employees/${employee.employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule: updatedSchedule,
          status: nextActive ? 'ACTIVE' : 'PAUSED',
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  const handleToggleSaturday = async (employee: EmployeeProfile) => {
    try {
      const currentDays = employee.schedule?.workingDays?.length
        ? employee.schedule.workingDays
        : [1, 2, 3, 4, 5];
      const hasSaturday = currentDays.includes(6);
      const newWorkingDays = hasSaturday
        ? currentDays.filter((d) => d !== 6)
        : [...currentDays.filter((d) => d !== 6), 6].sort((a, b) => a - b);

      const updatedSchedule = {
        ...employee.schedule,
        workingDays: newWorkingDays,
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
      console.error('Failed to toggle Saturday status:', err);
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
            workingDays: manualForm.includeSaturday ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5],
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

  const todayDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  const activeCount = employees.filter((e) => e.status === 'ACTIVE' && e.schedule.active).length;
  const satCount = employees.filter((e) => (e.schedule?.workingDays || [1, 2, 3, 4, 5]).includes(6)).length;
  const missingPasswordCount = employees.filter((e) => !e.password).length;

  const checkedInTodayCount = employees.filter(
    (e) => e.todayPunch?.date === todayDateStr && e.todayPunch?.checkInStatus === 'SUCCESS'
  ).length;

  const checkedOutTodayCount = employees.filter(
    (e) => e.todayPunch?.date === todayDateStr && e.todayPunch?.checkOutStatus === 'SUCCESS'
  ).length;

  const pendingCheckInCount = employees.filter(
    (e) => e.status === 'ACTIVE' && e.schedule.active && (!e.todayPunch || e.todayPunch.date !== todayDateStr || e.todayPunch.checkInStatus !== 'SUCCESS')
  ).length;

  const pendingCheckOutCount = employees.filter(
    (e) => e.status === 'ACTIVE' && e.schedule.active && e.todayPunch?.date === todayDateStr && e.todayPunch?.checkInStatus === 'SUCCESS' && e.todayPunch?.checkOutStatus !== 'SUCCESS'
  ).length;

  const checkInPercentage = employees.length > 0 ? Math.round((checkedInTodayCount / employees.length) * 100) : 0;
  const checkOutPercentage = employees.length > 0 ? Math.round((checkedOutTodayCount / employees.length) * 100) : 0;

  // Filtered & Sorted Employees Memo
  const filteredEmployees = useMemo(() => {
    return employees
      .filter((emp) => {
        // 1. Text Search
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = emp.name.toLowerCase().includes(q);
          const matchId = String(emp.employeeId).includes(q);
          const matchUsername = (emp.username || '').toLowerCase().includes(q);
          const matchPhone = (emp.mobileNumber || '').includes(q);
          if (!matchName && !matchId && !matchUsername && !matchPhone) return false;
        }

        // 2. Status Filter
        const isCheckedIn = emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkInStatus === 'SUCCESS';
        const isCheckedOut = emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkOutStatus === 'SUCCESS';
        const isPendingIn = emp.status === 'ACTIVE' && emp.schedule.active && !isCheckedIn;
        const isPendingOut = emp.status === 'ACTIVE' && emp.schedule.active && isCheckedIn && !isCheckedOut;
        const isPaused = emp.status !== 'ACTIVE' || !emp.schedule.active;
        const hasSaturday = (emp.schedule?.workingDays || [1, 2, 3, 4, 5]).includes(6);
        const hasMissingPw = !emp.password;

        switch (statusFilter) {
          case 'checked_in': return isCheckedIn;
          case 'pending_in': return isPendingIn;
          case 'checked_out': return isCheckedOut;
          case 'pending_out': return isPendingOut;
          case 'paused': return isPaused;
          case 'saturday': return hasSaturday;
          case 'missing_pw': return hasMissingPw;
          default: return true;
        }
      })
      .sort((a, b) => {
        if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
        if (sortBy === 'id_asc') return a.employeeId - b.employeeId;
        if (sortBy === 'id_desc') return b.employeeId - a.employeeId;
        if (sortBy === 'token_expiry') {
          const tA = a.tokenExpiry ? new Date(a.tokenExpiry).getTime() : 0;
          const tB = b.tokenExpiry ? new Date(b.tokenExpiry).getTime() : 0;
          return tA - tB;
        }
        if (sortBy === 'pending_first') {
          const aIn = a.todayPunch?.date === todayDateStr && a.todayPunch?.checkInStatus === 'SUCCESS';
          const bIn = b.todayPunch?.date === todayDateStr && b.todayPunch?.checkInStatus === 'SUCCESS';
          if (!aIn && bIn) return -1;
          if (aIn && !bIn) return 1;

          const aOut = a.todayPunch?.date === todayDateStr && a.todayPunch?.checkOutStatus === 'SUCCESS';
          const bOut = b.todayPunch?.date === todayDateStr && b.todayPunch?.checkOutStatus === 'SUCCESS';
          if (!aOut && bOut) return -1;
          if (aOut && !bOut) return 1;

          return a.name.localeCompare(b.name);
        }
        return 0;
      });
  }, [employees, searchQuery, statusFilter, sortBy, todayDateStr]);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 selection:bg-indigo-500 selection:text-white pb-20">
      {/* Ambient Radial Lights */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-6xl h-80 bg-gradient-to-b from-indigo-900/20 via-transparent to-transparent blur-3xl pointer-events-none -z-10" />

      {/* Top Professional Sticky Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo & Live Status */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-indigo-600/30 border border-indigo-400/20">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-extrabold text-white tracking-tight">HROne Fleet Console</h1>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Auto-Pilot 24/7
                </span>
              </div>
            </div>
          </div>

          {/* Clock & Action Utilities */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live IST Clock */}
            {istClock && (
              <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800/90 text-xs font-mono text-slate-300">
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                <span>{istClock} IST</span>
              </div>
            )}

            {/* WhatsApp Bot Connection Pill */}
            <button
              onClick={() => setShowWhatsAppModal(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                whatsAppStatus?.status === 'CONNECTED'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 shadow-sm shadow-emerald-500/5'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
              }`}
              title="WhatsApp Attendance Bot status"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Bot</span>
              {whatsAppStatus?.status === 'CONNECTED' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              )}
            </button>

            {/* Broadcast Button */}
            <button
              onClick={() => setShowBroadcastModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600/15 hover:bg-violet-600/25 border border-violet-500/30 text-violet-200 text-xs font-semibold shadow-sm transition-all active:scale-95"
              title="Broadcast Announcement via WhatsApp"
            >
              <Megaphone className="w-3.5 h-3.5 text-violet-400" />
              <span className="hidden sm:inline">Broadcast</span>
            </button>

            {/* Passwords Modal Trigger */}
            <button
              onClick={() => setShowPasswordModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-semibold transition-all active:scale-95 relative"
              title="Manage Passwords"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Passwords</span>
              {missingPasswordCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] bg-amber-500 text-slate-950 font-extrabold rounded-full animate-pulse">
                  {missingPasswordCount}
                </span>
              )}
            </button>

            {/* Refresh Dashboard */}
            <button
              onClick={() => fetchData()}
              disabled={loading}
              className="p-2 rounded-xl border border-slate-800 bg-slate-900/60 text-slate-400 hover:text-white hover:border-slate-700 transition-colors"
              title="Refresh Dashboard"
            >
              <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
            </button>

            {/* Add Employee CTA */}
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/25 transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Employee</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between transition-all text-xs font-medium animate-in fade-in ${
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

        {/* ======================================================== */}
        {/* EXECUTIVE METRICS & COMMAND CENTER                       */}
        {/* ======================================================== */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-xl shadow-xl space-y-5">
          {/* Action Row */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Bulk Punches */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-indigo-400" />
                Fleet Attendance Actions
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    if (confirm('Check in all active employees pending check-in today?')) {
                      handleCheckinAll();
                    }
                  }}
                  disabled={actionLoading !== null}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                  title="Check IN all active employees pending check-in today"
                >
                  {actionLoading === 'checkin-all' ? (
                    <RotateCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  ) : (
                    <LogIn className="w-3.5 h-3.5 text-emerald-400" />
                  )}
                  <span>Check In All</span>
                  {pendingCheckInCount > 0 ? (
                    <span className="px-1.5 py-0.2 text-[10px] bg-emerald-500/25 text-emerald-200 border border-emerald-500/40 font-bold rounded-md">
                      {pendingCheckInCount} pending
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-400/90 font-semibold">✓ Done</span>
                  )}
                </button>

                <button
                  onClick={() => {
                    if (confirm('Punch out all active employees pending checkout today?')) {
                      handleCheckoutAll();
                    }
                  }}
                  disabled={actionLoading !== null}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                  title="Punch OUT all active employees pending check-out today"
                >
                  {actionLoading === 'checkout-all' ? (
                    <RotateCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                  ) : (
                    <LogOut className="w-3.5 h-3.5 text-rose-400" />
                  )}
                  <span>Punch Out All</span>
                  {pendingCheckOutCount > 0 ? (
                    <span className="px-1.5 py-0.2 text-[10px] bg-rose-500/25 text-rose-200 border border-rose-500/40 font-bold rounded-md">
                      {pendingCheckOutCount} pending
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-400/90 font-semibold">✓ Done</span>
                  )}
                </button>
              </div>
            </div>

            {/* Fleet Controls */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sliders className="w-3 h-3 text-indigo-400" />
                Fleet Operations & Auth
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleLoginAll(true)}
                  disabled={actionLoading === 'login-all'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
                  title="Login/Re-authenticate all users with saved passwords"
                >
                  <Key className={`w-3.5 h-3.5 text-amber-400 ${actionLoading === 'login-all' ? 'animate-spin' : ''}`} />
                  <span>{actionLoading === 'login-all' ? 'Logging in...' : 'Login All Users'}</span>
                </button>

                <div className="flex items-center rounded-xl bg-slate-950/90 border border-slate-800 p-0.5">
                  <button
                    onClick={() => handleAutopilotAll('resume')}
                    disabled={actionLoading?.startsWith('autopilot-all')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 ${
                      activeCount < employees.length
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                        : 'text-slate-300 hover:text-emerald-300 hover:bg-emerald-500/10'
                    }`}
                    title="Resume autopilot for all employees"
                  >
                    {actionLoading === 'autopilot-all-resume' ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    ) : (
                      <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                    )}
                    <span>Resume All</span>
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Pause auto-pilot for all employees?')) {
                        handleAutopilotAll('pause');
                      }
                    }}
                    disabled={actionLoading?.startsWith('autopilot-all')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all active:scale-95 disabled:opacity-50"
                    title="Pause autopilot for all employees"
                  >
                    {actionLoading === 'autopilot-all-pause' ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin text-rose-400" />
                    ) : (
                      <Pause className="w-3 h-3 text-slate-400" />
                    )}
                    <span>Pause</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Metric Cards with Visual Progress */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-slate-800/60">
            {/* Total Enrolled */}
            <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Fleet</span>
              <div className="text-2xl font-black text-white mt-1">{employees.length}</div>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                <span>🟢 {activeCount} active</span>
                {employees.length - activeCount > 0 && <span className="text-amber-400">⏸️ {employees.length - activeCount} paused</span>}
              </div>
            </div>

            {/* Check In Today */}
            <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Check-In Today</span>
                <span className="text-xs font-bold text-emerald-400">{checkInPercentage}%</span>
              </div>
              <div className="text-2xl font-black text-emerald-400 mt-1">
                {checkedInTodayCount} <span className="text-xs font-normal text-slate-500">/ {employees.length}</span>
              </div>
              {/* Visual Progress Bar */}
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${checkInPercentage}%` }}
                />
              </div>
            </div>

            {/* Check Out Today */}
            <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Check-Out Today</span>
                <span className="text-xs font-bold text-indigo-400">{checkOutPercentage}%</span>
              </div>
              <div className="text-2xl font-black text-indigo-400 mt-1">
                {checkedOutTodayCount} <span className="text-xs font-normal text-slate-500">/ {employees.length}</span>
              </div>
              {/* Visual Progress Bar */}
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-2">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${checkOutPercentage}%` }}
                />
              </div>
            </div>

            {/* Saturday & Date */}
            <div className="bg-slate-950/50 border border-slate-800/60 rounded-xl p-3.5 flex flex-col justify-between">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Schedule & Sat</span>
              <div className="text-sm font-bold text-slate-200 mt-1 truncate">
                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
              <div className="text-[11px] text-amber-300/90 mt-1 flex items-center justify-between font-medium">
                <span>Saturday ON: {satCount}</span>
                <span className="text-slate-400 text-[10px]">Auto-Pilot</span>
              </div>
            </div>
          </div>
        </div>

        {/* Missing Password Banner */}
        {missingPasswordCount > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between text-xs transition-all shadow-md">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 flex-shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-amber-200 text-sm">
                  {missingPasswordCount} {missingPasswordCount === 1 ? 'Employee has' : 'Employees have'} no saved password
                </h4>
                <p className="text-[11px] text-amber-300/80 mt-0.5">
                  Missing password for:{' '}
                  <strong className="text-amber-200">
                    {employees
                      .filter((e) => !e.password)
                      .slice(0, 5)
                      .map((e) => e.name)
                      .join(', ')}
                    {missingPasswordCount > 5 ? ` +${missingPasswordCount - 5} more` : ''}
                  </strong>
                  . Save passwords so background token re-authentication succeeds seamlessly.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowPasswordModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition-all active:scale-95 flex-shrink-0 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Save Passwords</span>
            </button>
          </div>
        )}

        {/* ======================================================== */}
        {/* DEVELOPER SEARCH, FILTER, SORT & VIEW SWITCHER BAR       */}
        {/* ======================================================== */}
        <div className="space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Live Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, ID (#2357), username (E1885), or phone..."
                className="w-full bg-slate-900/80 border border-slate-800/90 rounded-xl pl-9 pr-9 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Dropdown & View Mode Switcher */}
            <div className="flex items-center gap-2">
              {/* Sort Selector */}
              <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300">
                <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer pr-1"
                >
                  <option value="pending_first" className="bg-slate-900 text-white">Pending First</option>
                  <option value="name_asc" className="bg-slate-900 text-white">Name (A-Z)</option>
                  <option value="name_desc" className="bg-slate-900 text-white">Name (Z-A)</option>
                  <option value="id_asc" className="bg-slate-900 text-white">ID (Low to High)</option>
                  <option value="id_desc" className="bg-slate-900 text-white">ID (High to Low)</option>
                  <option value="token_expiry" className="bg-slate-900 text-white">Token Expiry</option>
                </select>
              </div>

              {/* View Mode Toggle: Table vs Cards */}
              <div className="flex items-center rounded-xl bg-slate-900/80 border border-slate-800 p-0.5">
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                    viewMode === 'table'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Developer High-Density Table View"
                >
                  <List className="w-4 h-4" />
                  <span className="hidden sm:inline pr-1">Table</span>
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                    viewMode === 'grid'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  title="Card Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span className="hidden sm:inline pr-1">Cards</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Filter Pills Bar */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                statusFilter === 'all'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-semibold'
                  : 'bg-slate-900/60 border border-slate-800/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              All ({employees.length})
            </button>

            <button
              onClick={() => setStatusFilter('pending_in')}
              className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === 'pending_in'
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : 'bg-slate-900/60 border border-slate-800/80 text-amber-300 hover:border-amber-500/40'
              }`}
            >
              <span>⏳ Pending In</span>
              <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-xs font-bold font-mono">
                {pendingCheckInCount}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('checked_in')}
              className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === 'checked_in'
                  ? 'bg-emerald-600 text-white font-bold shadow-sm'
                  : 'bg-slate-900/60 border border-slate-800/80 text-emerald-300 hover:border-emerald-500/40'
              }`}
            >
              <span>🟢 In Today</span>
              <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-xs font-bold font-mono">
                {checkedInTodayCount}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('pending_out')}
              className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === 'pending_out'
                  ? 'bg-rose-500 text-white font-bold shadow-sm'
                  : 'bg-slate-900/60 border border-slate-800/80 text-rose-300 hover:border-rose-500/40'
              }`}
            >
              <span>⏳ Pending Out</span>
              <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-xs font-bold font-mono">
                {pendingCheckOutCount}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('checked_out')}
              className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === 'checked_out'
                  ? 'bg-indigo-600 text-white font-bold shadow-sm'
                  : 'bg-slate-900/60 border border-slate-800/80 text-indigo-300 hover:border-indigo-500/40'
              }`}
            >
              <span>🔴 Out Today</span>
              <span className="px-1.5 py-0.2 rounded bg-indigo-500/20 text-xs font-bold font-mono">
                {checkedOutTodayCount}
              </span>
            </button>

            <button
              onClick={() => setStatusFilter('saturday')}
              className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === 'saturday'
                  ? 'bg-amber-600 text-white font-bold shadow-sm'
                  : 'bg-slate-900/60 border border-slate-800/80 text-slate-400 hover:text-amber-300'
              }`}
            >
              <span>📅 Sat Active</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-xs font-mono">{satCount}</span>
            </button>

            <button
              onClick={() => setStatusFilter('paused')}
              className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === 'paused'
                  ? 'bg-slate-600 text-white font-bold shadow-sm'
                  : 'bg-slate-900/60 border border-slate-800/80 text-slate-400 hover:text-white'
              }`}
            >
              <span>⏸️ Paused</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 text-xs font-mono">
                {employees.length - activeCount}
              </span>
            </button>

            {missingPasswordCount > 0 && (
              <button
                onClick={() => setStatusFilter('missing_pw')}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${
                  statusFilter === 'missing_pw'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'bg-slate-900/60 border border-slate-800/80 text-amber-400 hover:border-amber-500/40'
                }`}
              >
                <span>⚠️ Missing Passwords</span>
                <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-xs font-bold font-mono">
                  {missingPasswordCount}
                </span>
              </button>
            )}

            {/* Active Filters Clear Button */}
            {(searchQuery || statusFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                }}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold px-2 py-0.5 ml-auto flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear filters ({filteredEmployees.length} shown)
              </button>
            )}
          </div>
        </div>

        {/* ======================================================== */}
        {/* EMPLOYEE LISTING: TABLE VIEW & GRID VIEW                 */}
        {/* ======================================================== */}
        {filteredEmployees.length === 0 ? (
          <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center mx-auto text-slate-400">
              <Filter className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">No employees match your filter criteria</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Try adjusting your search terms or status filter to view more enrolled team members.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all"
            >
              Reset Filters
            </button>
          </div>
        ) : viewMode === 'table' ? (
          /* DEVELOPER HIGH-DENSITY TABLE VIEW */
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800/90 bg-slate-950/70 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Autopilot</th>
                    <th className="py-3 px-4">Today Check-In</th>
                    <th className="py-3 px-4">Today Check-Out</th>
                    <th className="py-3 px-4">Saturday</th>
                    <th className="py-3 px-4">Session & Token</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredEmployees.map((emp) => {
                    const isCheckedIn = emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkInStatus === 'SUCCESS';
                    const isCheckedOut = emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkOutStatus === 'SUCCESS';
                    const hasSaturday = (emp.schedule?.workingDays || [1, 2, 3, 4, 5]).includes(6);
                    const isSuperAdmin = Boolean(emp.isSuperAdmin || emp.employeeId === 2357);
                    const isCheckInAction = actionLoading === `punch-${emp.employeeId}-CHECK_IN`;
                    const isCheckOutAction = actionLoading === `punch-${emp.employeeId}-CHECK_OUT`;
                    const isMenuOpen = menuOpenId === emp.employeeId;

                    return (
                      <tr
                        key={emp.employeeId}
                        className="hover:bg-indigo-500/[0.03] transition-colors group"
                      >
                        {/* Employee Column */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 flex items-center justify-center font-bold text-xs text-indigo-300 shadow-sm flex-shrink-0">
                              {emp.name
                                .split(' ')
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join('')
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-white text-xs truncate">{emp.name}</span>
                                {isSuperAdmin && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold" title="Super Admin">
                                    <Shield className="w-2.5 h-2.5" /> Super
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                                <span className="text-slate-300 font-semibold">#{emp.employeeId}</span>
                                <span>•</span>
                                <span>{emp.username || emp.mobileNumber || 'N/A'}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Autopilot Column */}
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleToggleActive(emp)}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                              emp.schedule.active
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
                            }`}
                            title="Click to toggle autopilot"
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                emp.schedule.active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                              }`}
                            />
                            <span>{emp.schedule.active ? 'Active' : 'Paused'}</span>
                          </button>
                        </td>

                        {/* Today Check-In Column */}
                        <td className="py-3 px-4">
                          {isCheckedIn ? (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-medium text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Done</span>
                              {emp.todayPunch?.checkedInAt && (
                                <span className="text-emerald-400/80 text-[10px] font-mono">
                                  ({new Date(emp.todayPunch.checkedInAt).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })})
                                </span>
                              )}
                            </div>
                          ) : emp.todayPunch?.plannedCheckIn ? (
                            <div className="inline-flex items-center gap-1 text-slate-300 font-mono text-[11px]">
                              <span className="text-slate-400">At</span>
                              <span className="font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                {emp.todayPunch.plannedCheckIn}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-[10px]">
                              {emp.schedule.checkInMin} - {emp.schedule.checkInMax}
                            </span>
                          )}
                        </td>

                        {/* Today Check-Out Column */}
                        <td className="py-3 px-4">
                          {isCheckedOut ? (
                            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 font-medium text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Done</span>
                              {emp.todayPunch?.checkedOutAt && (
                                <span className="text-emerald-400/80 text-[10px] font-mono">
                                  ({new Date(emp.todayPunch.checkedOutAt).toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })})
                                </span>
                              )}
                            </div>
                          ) : emp.todayPunch?.plannedCheckOut ? (
                            <div className="inline-flex items-center gap-1 text-slate-300 font-mono text-[11px]">
                              <span className="text-slate-400">At</span>
                              <span className="font-bold text-indigo-300 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                                {emp.todayPunch.plannedCheckOut}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 font-mono text-[10px]">
                              {emp.schedule.checkOutMin} - {emp.schedule.checkOutMax}
                            </span>
                          )}
                        </td>

                        {/* Saturday Toggle Column */}
                        <td className="py-3 px-4">
                          <button
                            onClick={() => handleToggleSaturday(emp)}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all flex items-center gap-1 ${
                              hasSaturday
                                ? 'bg-amber-500/15 border-amber-500/35 text-amber-300 hover:bg-amber-500/25'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                            }`}
                            title="Toggle Saturday auto-punch for this employee"
                          >
                            <Calendar className="w-2.5 h-2.5" />
                            <span>{hasSaturday ? 'Sat ON' : 'Sat OFF'}</span>
                          </button>
                        </td>

                        {/* Session & Password Health */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-md border font-mono text-[10px] ${getTokenExpiryColor(
                                emp.tokenExpiry
                              )}`}
                              title={`Token Expiry: ${emp.tokenExpiry || 'Active'}`}
                            >
                              {formatTokenExpiry(emp.tokenExpiry)}
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

                        {/* Action Buttons */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 relative">
                            {/* Fast Punch In */}
                            <button
                              onClick={() => handleManualPunch(emp.employeeId, 'CHECK_IN')}
                              disabled={!!actionLoading}
                              className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition-all disabled:opacity-40"
                              title="Trigger immediate Check-In"
                            >
                              {isCheckInAction ? (
                                <RotateCw className="w-3 h-3 animate-spin text-emerald-400" />
                              ) : (
                                'In'
                              )}
                            </button>

                            {/* Fast Punch Out */}
                            <button
                              onClick={() => handleManualPunch(emp.employeeId, 'CHECK_OUT')}
                              disabled={!!actionLoading}
                              className="px-2 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold transition-all disabled:opacity-40"
                              title="Trigger immediate Check-Out"
                            >
                              {isCheckOutAction ? (
                                <RotateCw className="w-3 h-3 animate-spin text-indigo-400" />
                              ) : (
                                'Out'
                              )}
                            </button>

                            {/* Menu Trigger */}
                            <button
                              onClick={() => setMenuOpenId(isMenuOpen ? null : emp.employeeId)}
                              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>

                            {/* Dropdown Menu */}
                            {isMenuOpen && (
                              <div className="absolute right-0 top-8 z-30 w-52 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-1 text-xs text-slate-300 text-left">
                                <button
                                  onClick={() => {
                                    handleToggleSaturday(emp);
                                    setMenuOpenId(null);
                                  }}
                                  className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2 text-slate-300"
                                >
                                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                                  <span>{hasSaturday ? 'Turn Off Saturday' : 'Enable Saturday Punch'}</span>
                                </button>
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* MODERN PRO CARD GRID VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map((emp) => {
              const isCheckedIn = emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkInStatus === 'SUCCESS';
              const isCheckedOut = emp.todayPunch?.date === todayDateStr && emp.todayPunch?.checkOutStatus === 'SUCCESS';
              const hasSaturday = (emp.schedule?.workingDays || [1, 2, 3, 4, 5]).includes(6);
              const isSuperAdmin = Boolean(emp.isSuperAdmin || emp.employeeId === 2357);
              const isCheckInAction = actionLoading === `punch-${emp.employeeId}-CHECK_IN`;
              const isCheckOutAction = actionLoading === `punch-${emp.employeeId}-CHECK_OUT`;
              const isMenuOpen = menuOpenId === emp.employeeId;

              return (
                <div
                  key={emp.employeeId}
                  className="bg-slate-900/50 border border-slate-800/80 hover:border-slate-700/80 rounded-2xl p-4.5 backdrop-blur-md transition-all flex flex-col justify-between space-y-3.5 shadow-lg relative group"
                >
                  <div>
                    {/* Header: Name, Avatar, ID, Status */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 rounded-xl bg-slate-800 border border-slate-700/90 flex items-center justify-center font-bold text-sm text-indigo-300 shadow-sm flex-shrink-0">
                          {emp.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-bold text-white text-sm truncate max-w-[140px] sm:max-w-[170px]">
                              {emp.name}
                            </h3>
                            {isSuperAdmin && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-bold">
                                Super
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            #{emp.employeeId} • {emp.username || emp.mobileNumber || 'Employee'}
                          </span>
                        </div>
                      </div>

                      {/* Autopilot Badge & More Menu */}
                      <div className="flex items-center gap-1.5 relative">
                        <button
                          onClick={() => handleToggleActive(emp)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-colors flex items-center gap-1 ${
                            emp.schedule.active
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-400'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${emp.schedule.active ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                          {emp.schedule.active ? 'Active' : 'Paused'}
                        </button>

                        <button
                          onClick={() => setMenuOpenId(isMenuOpen ? null : emp.employeeId)}
                          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                          <div className="absolute right-0 top-8 z-30 w-52 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-1 text-xs text-slate-300 text-left">
                            <button
                              onClick={() => {
                                handleToggleSaturday(emp);
                                setMenuOpenId(null);
                              }}
                              className="w-full px-3 py-2 text-left hover:bg-slate-800 flex items-center gap-2 text-slate-300"
                            >
                              <Calendar className="w-3.5 h-3.5 text-amber-400" />
                              <span>{hasSaturday ? 'Turn Off Saturday' : 'Enable Saturday Punch'}</span>
                            </button>
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

                    {/* Today Punch Stat Boxes */}
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {/* In Box */}
                      <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/70">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                          <span className="font-semibold text-slate-300 flex items-center gap-1">
                            <LogIn className="w-2.5 h-2.5 text-emerald-400" /> In
                          </span>
                          <span className="font-mono text-slate-500">{emp.schedule.checkInMin}</span>
                        </div>
                        <div className="text-xs">
                          {isCheckedIn ? (
                            <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          ) : emp.todayPunch?.plannedCheckIn ? (
                            <span className="text-amber-300 font-mono font-semibold text-[11px]">
                              At {emp.todayPunch.plannedCheckIn}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Scheduled</span>
                          )}
                        </div>
                      </div>

                      {/* Out Box */}
                      <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800/70">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                          <span className="font-semibold text-slate-300 flex items-center gap-1">
                            <LogOut className="w-2.5 h-2.5 text-indigo-400" /> Out
                          </span>
                          <span className="font-mono text-slate-500">{emp.schedule.checkOutMin}</span>
                        </div>
                        <div className="text-xs">
                          {isCheckedOut ? (
                            <span className="text-emerald-400 font-semibold inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          ) : emp.todayPunch?.plannedCheckOut ? (
                            <span className="text-indigo-300 font-mono font-semibold text-[11px]">
                              At {emp.todayPunch.plannedCheckOut}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Scheduled</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Metadata Pill Row */}
                    <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px]">
                      <span className={`px-2 py-0.5 rounded border font-mono ${getTokenExpiryColor(emp.tokenExpiry)}`}>
                        {formatTokenExpiry(emp.tokenExpiry)}
                      </span>
                      <button
                        onClick={() => handleToggleSaturday(emp)}
                        className={`px-2 py-0.5 rounded-full font-medium transition-all ${
                          hasSaturday ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {hasSaturday ? '📅 Sat ON' : '📅 Sat OFF'}
                      </button>
                    </div>
                  </div>

                  {/* Manual Punch Quick Action Buttons */}
                  <div className="pt-2 border-t border-slate-800/60 flex items-center gap-2">
                    <button
                      onClick={() => handleManualPunch(emp.employeeId, 'CHECK_IN')}
                      disabled={!!actionLoading}
                      className="flex-1 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/25 text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <LogIn className="w-3 h-3" />
                      <span>{isCheckInAction ? 'Marking...' : 'Punch In'}</span>
                    </button>
                    <button
                      onClick={() => handleManualPunch(emp.employeeId, 'CHECK_OUT')}
                      disabled={!!actionLoading}
                      className="flex-1 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/25 text-xs font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-1"
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

        {/* ======================================================== */}
        {/* LIVE SYSTEM RECENT PUNCH ACTIVITY LOG                    */}
        {/* ======================================================== */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-xl shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Live System Activity</h3>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Real-time attendance punch feed</span>
          </div>

          {logs.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              No recent attendance punch records yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/60 text-xs">
              {logs.slice(0, 10).map((log) => (
                <div key={log._id} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.punchType === 'CHECK_IN'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      {log.punchType === 'CHECK_IN' ? 'IN' : 'OUT'}
                    </span>
                    <span className="font-bold text-white">{log.employeeName}</span>
                    <span className="text-slate-400 font-mono text-[11px]">{log.punchTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
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

      {/* ======================================================== */}
      {/* MODALS                                                   */}
      {/* ======================================================== */}

      {/* Add Employee Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
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
                    <label className="text-xs text-slate-300 block">Paste HROne cURL from DevTools:</label>
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
                    <div className="col-span-2 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-xs">
                        <input
                          type="checkbox"
                          checked={manualForm.includeSaturday}
                          onChange={(e) => setManualForm({ ...manualForm, includeSaturday: e.target.checked })}
                          className="rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                        />
                        <span>Enable Saturday Auto-Punch (Mon–Sat)</span>
                      </label>
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

      {/* WhatsApp Bot Modal */}
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
                    <div className="bg-slate-900 px-2 py-1 rounded text-purple-300">• broadcast</div>
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
