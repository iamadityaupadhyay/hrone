'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  totalCount?: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  totalCount,
  pageSize,
  onPageChange,
}: PaginationControlsProps) {
  const count = totalItems ?? totalCount ?? 0;
  if (totalPages <= 1) return null;

  const startItem = count === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, count);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400 py-3 px-1 border-t border-zinc-800/80">
      <div>
        Showing <span className="font-mono text-zinc-200 font-semibold">{startItem}</span> to{' '}
        <span className="font-mono text-zinc-200 font-semibold">{endItem}</span> of{' '}
        <span className="font-mono text-zinc-200 font-semibold">{count}</span> results
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700 disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:text-zinc-300 transition-colors"
          title="Previous Page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            if (
              totalPages > 7 &&
              p !== 1 &&
              p !== totalPages &&
              Math.abs(p - currentPage) > 1
            ) {
              if (p === 2 || p === totalPages - 1) {
                return <span key={p} className="px-1 text-zinc-600">…</span>;
              }
              return null;
            }

            return (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`min-w-7 h-7 rounded-lg text-xs font-mono font-medium transition-colors ${
                  p === currentPage
                    ? 'bg-zinc-200 text-zinc-950 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700 disabled:opacity-40 disabled:hover:border-zinc-800 disabled:hover:text-zinc-300 transition-colors"
          title="Next Page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
