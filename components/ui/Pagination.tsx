'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;           // 0-indexed
  totalPages: number;
  totalCount: number;
  pageSize: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
}

function getPageNumbers(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i);
  }

  const pages: (number | '…')[] = [];

  // Always show first page
  pages.push(0);

  const left = page - 2;
  const right = page + 2;

  if (left > 1) pages.push('…');

  for (let i = Math.max(1, left); i <= Math.min(totalPages - 2, right); i++) {
    pages.push(i);
  }

  if (right < totalPages - 2) pages.push('…');

  // Always show last page
  pages.push(totalPages - 1);

  return pages;
}

export default function Pagination({ page, totalPages, totalCount, pageSize, itemLabel = 'registros', onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, totalCount);
  const pageNumbers = getPageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
      <p className="text-xs text-gray-500">
        Mostrando{' '}
        <span className="font-bold text-primary">{from}</span>
        {' '}–{' '}
        <span className="font-bold text-primary">{to}</span>
        {' '}de{' '}
        <span className="font-bold text-primary">{totalCount}</span> {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold border border-gray-200 text-gray-600 hover:bg-primary hover:text-white hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={14} /> Anterior
        </button>

        <div className="flex items-center gap-1">
          {pageNumbers.map((p, idx) =>
            p === '…' ? (
              <span key={`ellipsis-${idx}`} className="w-8 h-8 flex items-center justify-center text-xs text-gray-400 select-none">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`w-8 h-8 text-xs font-bold border transition-colors ${p === page
                  ? 'bg-primary text-white border-primary'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p + 1}
              </button>
            )
          )}
        </div>

        <button
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold border border-gray-200 text-gray-600 hover:bg-primary hover:text-white hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Siguiente <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
