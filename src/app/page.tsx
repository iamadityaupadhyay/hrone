'use client';

import { useState, useEffect, useCallback } from 'react';
import { EmployeeProfile, PunchLog } from '@/lib/types/employee';
import BroadcastModal from '@/components/BroadcastModal';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { MetricsCommandCenter } from '@/components/dashboard/MetricsCommandCenter';
import { EmployeeFilterBar } from '@/components/dashboard/EmployeeFilterBar';
import { EmployeeTable } from '@/components/dashboard/EmployeeTable';
import { EmployeeGrid } from '@/components/dashboard/EmployeeGrid';
import { PaginationControls } from '@/components/dashboard/PaginationControls';
import { ActivityLogSection } from '@/components/dashboard/ActivityLogSection';
import { AddEmployeeModal } from '@/components/dashboard/AddEmployeeModal';
import { PasswordManagementModal } from '@/components/dashboard/PasswordManagementModal';
import { WhatsAppBotModal } from '@/components/dashboard/WhatsAppBotModal';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface FleetCounts {
  total: number;
  activeCount: number;
  satCount: number;
  checkedInTodayCount: number;
  checkedOutTodayCount: number;
  pendingCheckInCount: number;
  pendingCheckOutCount: number;
  missingPasswordCount: number;
}

export default function AttendanceDashboard() {
  // Fleet & Employee State
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState<boolean>(true);
  const [employeePage, setEmployeePage] = useState<number>(1);
  const [employeeLimit, setEmployeeLimit] = useState<string>('15');
  const [employeeTotalCount, setEmployeeTotalCount] = useState<number>(0);
  const [employeeTotalPages, setEmployeeTotalPages] = useState<number>(1);
  const [fleetCounts, setFleetCounts] = useState<FleetCounts>({
    total: 0,
    activeCount: 0,
    satCount: 0,
    checkedInTodayCount: 0,
    checkedOutTodayCount: 0,
    pendingCheckInCount: 0,
    pendingCheckOutCount: 0,
    missingPasswordCount: 0,
  });

  // Search, Filter, Sort & View Modes
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('pending_first');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);

  // Live Activity Logs State
  const [logs, setLogs] = useState<PunchLog[]>([]);
  const [logsLoading, setLogsLoading] = useState<boolean>(false);
  const [logPage, setLogPage] = useState<number>(1);
  const [logLimit] = useState<number>(15);
  const [logTotalCount, setLogTotalCount] = useState<number>(0);
  const [logTotalPages, setLogTotalPages] = useState<number>(1);
  const [logSearch, setLogSearch] = useState<string>('');
  const [logDate, setLogDate] = useState<string>('');
  const [logPunchType, setLogPunchType] = useState<'ALL' | 'CHECK_IN' | 'CHECK_OUT'>('ALL');

  // WhatsApp State
  const [whatsAppStatus, setWhatsAppStatus] = useState<{
    status: string;
    phoneNumber?: string;
    qrDataUrl?: string;
    updatedAt?: string;
  } | null>(null);

  // Global Actions, UI & Clock State
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [istClock, setIstClock] = useState('');

  // Modals Visibility
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);

  // Add Employee Form State
  const [importTab, setImportTab] = useState<'login' | 'curl' | 'manual'>('login');
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: '',
    companyDomainCode: 'uharvest',
  });
  const [rawCurl, setRawCurl] = useState('');
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

  // Password Management State
  const [passwordInputs, setPasswordInputs] = useState<Record<number, string>>({});
  const [showPasswordVisibility, setShowPasswordVisibility] = useState<Record<number, boolean>>({});
  const [savingPasswordId, setSavingPasswordId] = useState<number | null>(null);
  const [passwordSaveStatus, setPasswordSaveStatus] = useState<Record<number, string>>({});

  // 1. Live IST Clock
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

  // 2. Fetch Employees (Server-side Paginated & Filtered)
  const fetchEmployees = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(employeePage),
        limit: employeeLimit,
        search: searchQuery,
        status: statusFilter,
        sortBy,
      });

      const res = await fetch(`/api/employees?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();

      if (data.success) {
        setEmployees(data.employees || []);
        if (data.pagination) {
          setEmployeeTotalCount(data.pagination.totalCount ?? data.pagination.total ?? 0);
          setEmployeeTotalPages(data.pagination.totalPages || 1);
        }
        if (data.counts) {
          setFleetCounts({
            total: data.counts.total ?? 0,
            activeCount: data.counts.activeCount ?? data.counts.active ?? 0,
            satCount: data.counts.satCount ?? data.counts.saturday ?? 0,
            checkedInTodayCount: data.counts.checkedInTodayCount ?? data.counts.checkedIn ?? 0,
            checkedOutTodayCount: data.counts.checkedOutTodayCount ?? data.counts.checkedOut ?? 0,
            pendingCheckInCount: data.counts.pendingCheckInCount ?? data.counts.pendingIn ?? 0,
            pendingCheckOutCount: data.counts.pendingCheckOutCount ?? data.counts.pendingOut ?? 0,
            missingPasswordCount: data.counts.missingPasswordCount ?? data.counts.missingPw ?? 0,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch employees:', err);
    } finally {
      setEmployeeLoading(false);
    }
  }, [employeePage, employeeLimit, searchQuery, statusFilter, sortBy]);

  // 3. Fetch Activity Logs (Server-side Paginated)
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(logPage),
        limit: String(logLimit),
        search: logSearch,
        date: logDate,
        punchType: logPunchType,
      });

      const res = await fetch(`/api/logs?${params.toString()}`, { cache: 'no-store' });
      const data = await res.json();

      if (data.success) {
        setLogs(data.logs || []);
        if (data.pagination) {
          setLogTotalCount(data.pagination.totalCount ?? data.pagination.total ?? 0);
          setLogTotalPages(data.pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }, [logPage, logLimit, logSearch, logDate, logPunchType]);

  // 4. Fetch WhatsApp Status
  const fetchWhatsAppStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status', { cache: 'no-store' });
      const data = await res.json();
      setWhatsAppStatus(data);
    } catch (err) {
      console.error('Failed to fetch WhatsApp status:', err);
    }
  }, []);

  // Initial and Periodic Fetching
  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchWhatsAppStatus();
    const interval = setInterval(() => {
      fetchWhatsAppStatus();
    }, 12000);
    return () => clearInterval(interval);
  }, [fetchWhatsAppStatus]);

  // Auto-refresh fleet every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchEmployees();
      fetchLogs();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchEmployees, fetchLogs]);

  // Reset pagination when search query or status filter changes
  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
    setEmployeePage(1);
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setEmployeePage(1);
  };

  const handlePageSizeChange = (size: string) => {
    setEmployeeLimit(size);
    setEmployeePage(1);
  };

  const handleLogSearchChange = (q: string) => {
    setLogSearch(q);
    setLogPage(1);
  };

  const handleLogDateChange = (date: string) => {
    setLogDate(date);
    setLogPage(1);
  };

  const handleLogPunchTypeChange = (type: 'ALL' | 'CHECK_IN' | 'CHECK_OUT') => {
    setLogPunchType(type);
    setLogPage(1);
  };

  // -------------------------------------------------------------
  // Dashboard Action Handlers
  // -------------------------------------------------------------
  const handleLogout = async () => {
    if (!confirm('Sign out from the HROne Attendance Dashboard?')) return;
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    }
  };

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
          message: `${punchType === 'CHECK_IN' ? 'Punch-In' : 'Punch-Out'} recorded successfully (${data.punchTime})`,
        });
        fetchEmployees();
        fetchLogs();
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

  const handleCheckinAll = async (force = false) => {
    if (!confirm('Check in all active employees pending check-in today?')) return;
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
      fetchEmployees();
      fetchLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bulk check-in failed';
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckoutAll = async (force = false) => {
    if (!confirm('Punch out all active employees pending checkout today?')) return;
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
      fetchEmployees();
      fetchLogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bulk check-out failed';
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
      fetchEmployees();
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
          message:
            data.message ||
            `All autopilots ${action === 'resume' ? 'resumed' : 'paused'} successfully!`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.message || data.error || `Failed to ${action} autopilots.`,
        });
      }
      fetchEmployees();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to ${action} autopilots`;
      setFeedback({ type: 'error', message: msg });
    } finally {
      setActionLoading(null);
    }
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
        fetchEmployees();
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
        fetchEmployees();
      }
    } catch (err) {
      console.error('Failed to toggle Saturday status:', err);
    }
  };

  const handleToggleSuperAdmin = async (employee: EmployeeProfile) => {
    const nextSuper = !employee.isSuperAdmin;
    const actionText = nextSuper ? 'promote to Super Admin' : 'remove Super Admin role from';
    if (!confirm(`Are you sure you want to ${actionText} ${employee.name}?`)) return;

    setActionLoading(`role-${employee.employeeId}`);
    try {
      const res = await fetch(`/api/employees/${employee.employeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isSuperAdmin: nextSuper,
          role: nextSuper ? 'SUPER_ADMIN' : 'EMPLOYEE',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          message: `${employee.name} is now ${nextSuper ? 'promoted to Super Admin 🛡️' : 'a standard Employee'}.`,
        });
        fetchEmployees();
      } else {
        setFeedback({ type: 'error', message: data.error || 'Failed to update admin role' });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error updating role';
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
          message: data.message || 'Session refreshed successfully.',
        });
        fetchEmployees();
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

  const handleDeleteEmployee = async (id: string, name: string) => {
    setMenuOpenId(null);
    if (!confirm(`Remove ${name} from automated attendance?`)) return;
    try {
      const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setFeedback({ type: 'success', message: `${name} removed.` });
        fetchEmployees();
      }
    } catch (err) {
      console.error('Failed to delete employee:', err);
    }
  };

  const handleSavePassword = async (employee: EmployeeProfile, passToSave?: string) => {
    const pwd = passToSave !== undefined ? passToSave : passwordInputs[employee.employeeId];
    if (!pwd || !pwd.trim()) {
      setPasswordSaveStatus((prev) => ({
        ...prev,
        [employee.employeeId]: '⚠️ Password cannot be blank',
      }));
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
        setPasswordSaveStatus((prev) => ({
          ...prev,
          [employee.employeeId]: `❌ Failed: ${data.error}`,
        }));
        return;
      }

      setPasswordSaveStatus((prev) => ({ ...prev, [employee.employeeId]: '✅ Password saved!' }));
      fetchEmployees();
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
        setIsAddModalOpen(false);
        setLoginForm({ username: '', password: '', companyDomainCode: 'uharvest' });
        fetchEmployees();
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
        setIsAddModalOpen(false);
        setRawCurl('');
        fetchEmployees();
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

  const todayDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date()
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pb-16 antialiased selection:bg-zinc-800 selection:text-white">
      {/* 1. Monochromatic Navigation Header */}
      <DashboardHeader
        istClock={istClock}
        loading={employeeLoading}
        missingPasswordCount={fleetCounts.missingPasswordCount}
        whatsAppConnected={whatsAppStatus?.status === 'CONNECTED'}
        onRefresh={() => {
          fetchEmployees();
          fetchLogs();
          fetchWhatsAppStatus();
        }}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenWhatsAppModal={() => setShowWhatsAppModal(true)}
        onOpenBroadcastModal={() => setShowBroadcastModal(true)}
        onOpenPasswordModal={() => setShowPasswordModal(true)}
        onLogout={handleLogout}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {/* Feedback Alert Pill */}
        {feedback && (
          <div
            className={`p-3 rounded-xl border flex items-center justify-between transition-all text-xs font-mono animate-in fade-in ${
              feedback.type === 'success'
                ? 'bg-zinc-900 border-zinc-700 text-zinc-200'
                : 'bg-zinc-900 border-rose-900/60 text-rose-300'
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
              className="text-zinc-400 hover:text-white p-1 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 2. Executive Metrics & Fleet Command Center */}
        <MetricsCommandCenter
          totalCount={fleetCounts.total}
          activeCount={fleetCounts.activeCount}
          satCount={fleetCounts.satCount}
          checkedInTodayCount={fleetCounts.checkedInTodayCount}
          checkedOutTodayCount={fleetCounts.checkedOutTodayCount}
          pendingCheckInCount={fleetCounts.pendingCheckInCount}
          pendingCheckOutCount={fleetCounts.pendingCheckOutCount}
          actionLoading={actionLoading}
          onCheckinAll={() => handleCheckinAll()}
          onCheckoutAll={() => handleCheckoutAll()}
          onLoginAll={() => handleLoginAll(true)}
          onAutopilotAll={handleAutopilotAll}
        />

        {/* 3. Server-side Filter & Search Bar */}
        <EmployeeFilterBar
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          statusFilter={statusFilter}
          onStatusFilterChange={handleStatusFilterChange}
          sortBy={sortBy}
          onSortByChange={setSortBy}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          pageSize={employeeLimit}
          onPageSizeChange={handlePageSizeChange}
          counts={fleetCounts}
          totalFiltered={employeeTotalCount}
        />

        {/* 4. Employee Table or Grid (Server Paginated) */}
        {viewMode === 'table' ? (
          <EmployeeTable
            employees={employees}
            todayDateStr={todayDateStr}
            actionLoading={actionLoading}
            menuOpenId={menuOpenId}
            onSetMenuOpenId={setMenuOpenId}
            onToggleActive={handleToggleActive}
            onToggleSaturday={handleToggleSaturday}
            onToggleSuperAdmin={handleToggleSuperAdmin}
            onManualPunch={handleManualPunch}
            onRefreshToken={handleRefreshToken}
            onDeleteEmployee={handleDeleteEmployee}
          />
        ) : (
          <EmployeeGrid
            employees={employees}
            todayDateStr={todayDateStr}
            actionLoading={actionLoading}
            menuOpenId={menuOpenId}
            onSetMenuOpenId={setMenuOpenId}
            onToggleActive={handleToggleActive}
            onToggleSaturday={handleToggleSaturday}
            onToggleSuperAdmin={handleToggleSuperAdmin}
            onManualPunch={handleManualPunch}
            onRefreshToken={handleRefreshToken}
            onDeleteEmployee={handleDeleteEmployee}
          />
        )}

        {/* 5. Employee Server Pagination Bar */}
        <PaginationControls
          currentPage={employeePage}
          totalPages={employeeTotalPages}
          totalCount={employeeTotalCount}
          pageSize={employeeLimit === 'all' ? employeeTotalCount : Number(employeeLimit)}
          onPageChange={setEmployeePage}
        />

        {/* 6. Live System Activity Log (Server Paginated) */}
        <ActivityLogSection
          logs={logs}
          loading={logsLoading}
          page={logPage}
          totalPages={logTotalPages}
          totalCount={logTotalCount}
          limit={logLimit}
          onPageChange={setLogPage}
          search={logSearch}
          onSearchChange={handleLogSearchChange}
          dateFilter={logDate}
          onDateFilterChange={handleLogDateChange}
          punchTypeFilter={logPunchType}
          onPunchTypeFilterChange={handleLogPunchTypeChange}
          onRefresh={fetchLogs}
        />
      </main>

      {/* 7. Modular Modals */}
      <AddEmployeeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        actionLoading={actionLoading}
        importTab={importTab}
        setImportTab={setImportTab}
        loginForm={loginForm}
        setLoginForm={setLoginForm}
        rawCurl={rawCurl}
        setRawCurl={setRawCurl}
        manualForm={manualForm}
        setManualForm={setManualForm}
        onDirectLogin={handleDirectLogin}
        onOnboardSubmit={handleOnboardSubmit}
      />

      <PasswordManagementModal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        employees={employees}
        passwordInputs={passwordInputs}
        setPasswordInputs={setPasswordInputs}
        showPasswordVisibility={showPasswordVisibility}
        setShowPasswordVisibility={setShowPasswordVisibility}
        savingPasswordId={savingPasswordId}
        passwordSaveStatus={passwordSaveStatus}
        actionLoading={actionLoading}
        onSavePassword={handleSavePassword}
        onSaveAllPasswords={handleSaveAllPasswords}
      />

      <WhatsAppBotModal
        isOpen={showWhatsAppModal}
        onClose={() => setShowWhatsAppModal(false)}
        whatsAppStatus={whatsAppStatus}
      />

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
