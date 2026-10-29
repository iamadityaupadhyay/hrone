'use client';

import {
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Search,
  LogIn,
  LogOut,
  Calendar,
  X,
} from 'lucide-react';
import { PunchLog } from '@/lib/types/employee';
import { PaginationControls } from './PaginationControls';

interface ActivityLogSectionProps {
  logs: PunchLog[];
  loading: boolean;
  page: number;
  totalPages: number;
  totalCount: number;
  limit: number;
  onPageChange: (newPage: number) => void;
  search: string;
  onSearchChange: (query: string) => void;
  dateFilter: string;
  onDateFilterChange: (date: string) => void;
  punchTypeFilter: 'ALL' | 'CHECK_IN' | 'CHECK_OUT';
  onPunchTypeFilterChange: (type: 'ALL' | 'CHECK_IN' | 'CHECK_OUT') => void;
  onRefresh: () => void;
}

export function ActivityLogSection({
  logs,
  loading,
  page,
  totalPages,
  totalCount,
  limit,
  onPageChange,
  search,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  punchTypeFilter,
  onPunchTypeFilterChange,
  onRefresh,
}: ActivityLogSectionProps) {
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date()
  );
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    yesterdayDate
  );

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 backdrop-blur-xl shadow-xl space-y-4">
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
              Live System Activity
            </h3>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
          <span className="text-[11px] text-zinc-500 font-mono">
            ({totalCount} records {dateFilter ? `on ${dateFilter}` : 'total'})
          </span>
        </div>

        {/* Search, Date Filter, Punch Type Filter & Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Quick Presets + Picker */}
          <div className="flex items-center rounded-lg bg-zinc-950 p-0.5 border border-zinc-800 text-[11px]">
            <button
              type="button"
              onClick={() => onDateFilterChange('')}
              className={`px-2 py-1 rounded-md transition-colors font-medium ${
                dateFilter === ''
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All Dates
            </button>
            <button
              type="button"
              onClick={() => onDateFilterChange(todayStr)}
              className={`px-2 py-1 rounded-md transition-colors font-medium ${
                dateFilter === todayStr
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => onDateFilterChange(yesterdayStr)}
              className={`px-2 py-1 rounded-md transition-colors font-medium ${
                dateFilter === yesterdayStr
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Yesterday
            </button>
          </div>

          {/* Custom Date Input */}
          <div className="relative flex items-center">
            <Calendar className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 pointer-events-none" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => onDateFilterChange(e.target.value)}
              className="pl-8 pr-7 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700 [color-scheme:dark]"
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => onDateFilterChange('')}
                className="absolute right-2 text-zinc-500 hover:text-zinc-200"
                title="Clear date filter"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Quick Punch Type Filter */}
          <div className="flex items-center rounded-lg bg-zinc-950 p-0.5 border border-zinc-800 text-[11px]">
            <button
              onClick={() => onPunchTypeFilterChange('ALL')}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium ${
                punchTypeFilter === 'ALL'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => onPunchTypeFilterChange('CHECK_IN')}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium flex items-center gap-1 ${
                punchTypeFilter === 'CHECK_IN'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LogIn className="w-3 h-3 text-emerald-400" />
              <span>In</span>
            </button>
            <button
              onClick={() => onPunchTypeFilterChange('CHECK_OUT')}
              className={`px-2.5 py-1 rounded-md transition-colors font-medium flex items-center gap-1 ${
                punchTypeFilter === 'CHECK_OUT'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LogOut className="w-3 h-3 text-zinc-400" />
              <span>Out</span>
            </button>
          </div>

          {/* Search Field */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search employee..."
              className="pl-8 pr-7 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 w-40 font-sans"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            title="Refresh logs"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-zinc-200' : ''}`} />
          </button>
        </div>
      </div>

      {/* Log Entries Table */}
      {logs.length === 0 ? (
        <div className="text-center py-10 text-xs text-zinc-500 bg-zinc-950/40 rounded-xl border border-zinc-800/60 font-mono">
          No attendance punch records found matching current query.
        </div>
      ) : (
        <div className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/60">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/90 text-[11px] font-medium text-zinc-400 uppercase tracking-wider font-mono">
                  <th className="py-2.5 px-3.5">Type</th>
                  <th className="py-2.5 px-3.5">Employee</th>
                  <th className="py-2.5 px-3.5">Timestamp (IST)</th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {logs.map((log) => {
                  const isSuccess = log.success;
                  const isIn = log.punchType === 'CHECK_IN';

                  return (
                    <tr
                      key={log._id || `${log.employeeId}-${log.executedAt}`}
                      className="hover:bg-zinc-900/50 transition-colors font-sans"
                    >
                      <td className="py-2.5 px-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            isIn
                              ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/25'
                              : 'bg-sky-500/10 text-sky-300 border border-sky-500/25'
                          }`}
                        >
                          {isIn ? (
                            <LogIn className="w-2.5 h-2.5 text-emerald-400" />
                          ) : (
                            <LogOut className="w-2.5 h-2.5 text-sky-400" />
                          )}
                          <span>{isIn ? 'PUNCH IN' : 'PUNCH OUT'}</span>
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-zinc-100">{log.employeeName}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            #{log.employeeId}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3.5 text-zinc-300 font-mono text-[11px]">
                        {log.punchTime ||
                          (log.executedAt
                            ? new Date(log.executedAt).toLocaleString('en-IN', {
                                timeZone: 'Asia/Kolkata',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })
                            : 'N/A')}
                      </td>

                      <td className="py-2.5 px-3.5">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                            isSuccess ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isSuccess ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="w-3 h-3 text-rose-400 flex-shrink-0" />
                          )}
                          <span>{isSuccess ? 'Success' : 'Failed'}</span>
                        </span>
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono text-[10px] text-zinc-500 truncate max-w-xs">
                        {log.error ? (
                          <span className="text-rose-400/90" title={log.error}>
                            {log.error}
                          </span>
                        ) : (
                          <span className="text-zinc-500">Auto-dispatched</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Bar */}
      <PaginationControls
        currentPage={page}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={limit}
        onPageChange={onPageChange}
      />
    </div>
  );
}
