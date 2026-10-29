'use client';

import { Search, X, ArrowUpDown, List, LayoutGrid } from 'lucide-react';

interface EmployeeFilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  sortBy: string;
  onSortByChange: (sort: string) => void;
  viewMode: 'table' | 'grid';
  onViewModeChange: (mode: 'table' | 'grid') => void;
  pageSize: string;
  onPageSizeChange: (size: string) => void;
  counts: {
    total: number;
    activeCount: number;
    satCount: number;
    checkedInTodayCount: number;
    checkedOutTodayCount: number;
    pendingCheckInCount: number;
    pendingCheckOutCount: number;
    missingPasswordCount: number;
  };
  totalFiltered: number;
}

export function EmployeeFilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  viewMode,
  onViewModeChange,
  pageSize,
  onPageSizeChange,
  counts,
  totalFiltered,
}: EmployeeFilterBarProps) {
  const hasActiveFilter = searchQuery.trim() !== '' || statusFilter !== 'all';

  return (
    <div className="space-y-3">
      {/* Top Search & Display Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search name, ID, username..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-8 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-all font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* View Mode & Sorting Controls */}
        <div className="flex items-center gap-2">
          {/* Page size dropdown */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-zinc-400">
            <span>Show:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(e.target.value)}
              className="bg-transparent text-zinc-200 text-xs focus:outline-none cursor-pointer pr-1"
            >
              <option value="15" className="bg-zinc-900 text-white">15</option>
              <option value="25" className="bg-zinc-900 text-white">25</option>
              <option value="50" className="bg-zinc-900 text-white">50</option>
              <option value="all" className="bg-zinc-900 text-white">All</option>
            </select>
          </div>

          {/* Sort dropdown */}
          <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-400">
            <ArrowUpDown className="w-3 h-3 text-zinc-400" />
            <select
              value={sortBy}
              onChange={(e) => onSortByChange(e.target.value)}
              className="bg-transparent text-zinc-200 text-xs focus:outline-none cursor-pointer pr-1"
            >
              <option value="pending_first" className="bg-zinc-900 text-white">Pending first</option>
              <option value="name_asc" className="bg-zinc-900 text-white">Name (A–Z)</option>
              <option value="name_desc" className="bg-zinc-900 text-white">Name (Z–A)</option>
              <option value="id_asc" className="bg-zinc-900 text-white">ID (asc)</option>
              <option value="id_desc" className="bg-zinc-900 text-white">ID (desc)</option>
              <option value="token_expiry" className="bg-zinc-900 text-white">Token expiry</option>
            </select>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center rounded-lg bg-zinc-900 border border-zinc-800 p-0.5">
            <button
              onClick={() => onViewModeChange('table')}
              className={`p-1.5 rounded-md text-xs transition-all ${
                viewMode === 'table' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewModeChange('grid')}
              className={`p-1.5 rounded-md text-xs transition-all ${
                viewMode === 'grid' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
              }`}
              title="Cards View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <button
          onClick={() => onStatusFilterChange('all')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            statusFilter === 'all'
              ? 'bg-zinc-100 text-zinc-950 font-semibold shadow-sm'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700'
          }`}
        >
          All ({counts.total})
        </button>

        <button
          onClick={() => onStatusFilterChange('pending_in')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
            statusFilter === 'pending_in'
              ? 'bg-amber-500/20 border border-amber-500/40 text-amber-200 font-semibold'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-amber-500/30'
          }`}
        >
          <span>Pending In</span>
          <span className="font-mono text-amber-400 font-bold">{counts.pendingCheckInCount}</span>
        </button>

        <button
          onClick={() => onStatusFilterChange('checked_in')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
            statusFilter === 'checked_in'
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 font-semibold'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-emerald-500/30'
          }`}
        >
          <span>In Today</span>
          <span className="font-mono text-emerald-400 font-bold">{counts.checkedInTodayCount}</span>
        </button>

        <button
          onClick={() => onStatusFilterChange('pending_out')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
            statusFilter === 'pending_out'
              ? 'bg-sky-500/20 border border-sky-500/40 text-sky-200 font-semibold'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-sky-500/30'
          }`}
        >
          <span>Pending Out</span>
          <span className="font-mono text-sky-400 font-bold">{counts.pendingCheckOutCount}</span>
        </button>

        <button
          onClick={() => onStatusFilterChange('checked_out')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
            statusFilter === 'checked_out'
              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 font-semibold'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-emerald-500/30'
          }`}
        >
          <span>Out Today</span>
          <span className="font-mono text-emerald-400 font-bold">{counts.checkedOutTodayCount}</span>
        </button>

        <button
          onClick={() => onStatusFilterChange('saturday')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
            statusFilter === 'saturday'
              ? 'bg-amber-500/20 border border-amber-500/40 text-amber-200 font-semibold'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span>Sat Active</span>
          <span className="font-mono text-amber-400 font-bold">{counts.satCount}</span>
        </button>

        <button
          onClick={() => onStatusFilterChange('paused')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
            statusFilter === 'paused'
              ? 'bg-rose-500/20 border border-rose-500/40 text-rose-200 font-semibold'
              : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <span>Paused</span>
          <span className="font-mono text-rose-400 font-bold">{counts.total - counts.activeCount}</span>
        </button>

        {counts.missingPasswordCount > 0 && (
          <button
            onClick={() => onStatusFilterChange('missing_pw')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === 'missing_pw'
                ? 'bg-amber-500 text-zinc-950 font-bold shadow-sm'
                : 'bg-zinc-900 border border-amber-500/30 text-amber-300 hover:border-amber-500/50'
            }`}
          >
            <span>Missing PW</span>
            <span className="font-mono font-bold">{counts.missingPasswordCount}</span>
          </button>
        )}

        {hasActiveFilter && (
          <button
            onClick={() => {
              onSearchChange('');
              onStatusFilterChange('all');
            }}
            className="text-[11px] text-zinc-400 hover:text-white px-2 py-0.5 ml-auto flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Reset ({totalFiltered} matching)
          </button>
        )}
      </div>
    </div>
  );
}

