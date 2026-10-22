import { useState } from 'react';
import { pageWindow, pageSlice } from './paginationModel';

export function PageNumbers({ page, totalPages, onChange }) {
  return (
    <span className="console-page-numbers inline-flex gap-1 items-center flex-wrap max-w-full">
      {pageWindow(page, totalPages).map((value) =>
        typeof value === 'string' ? (
          <span key={value} className="console-page-gap text-slate-400 text-xs px-1 select-none" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            type="button"
            key={value}
            aria-label={`Trang ${value}`}
            aria-current={value === page ? 'page' : undefined}
            onClick={() => onChange(value)}
            className={`w-8 h-8 p-0 rounded-lg border text-xs font-medium transition-colors cursor-pointer flex items-center justify-center ${
              value === page
                ? 'bg-blue-600 border-blue-600 text-white font-semibold shadow-sm'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
            }`}
          >
            {value}
          </button>
        )
      )}
    </span>
  );
}

export function CompactPagination({ data, onChange, label = 'Phân trang danh sách' }) {
  if (data.totalPages <= 1) return null;
  return (
    <nav
      className="console-pagination flex items-center justify-between gap-3 flex-wrap w-full py-3 text-slate-500 border-t border-slate-100 mt-2 text-xs"
      aria-label={label}
    >
      <small className="text-xs text-slate-500">
        Hiển thị {data.from}–{data.to} / {data.total}
      </small>
      <div className="flex items-center gap-1.5 max-w-full">
        <button
          type="button"
          aria-label="Trang trước"
          disabled={data.page <= 1}
          onClick={() => onChange(data.page - 1)}
          className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-sm font-semibold transition-colors cursor-pointer"
        >
          ‹
        </button>
        <PageNumbers page={data.page} totalPages={data.totalPages} onChange={onChange} />
        <button
          type="button"
          aria-label="Trang sau"
          disabled={data.page >= data.totalPages}
          onClick={() => onChange(data.page + 1)}
          className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-sm font-semibold transition-colors cursor-pointer"
        >
          ›
        </button>
      </div>
    </nav>
  );
}

// Render only the page while preserving the caller's row markup and all-data KPIs.
// A table footer is a real tr/td, so controls never become invalid tbody children.
export function PaginatedList({ items, children, resetKey = '', pageSize = 10, layout = 'list', columns = 1, label }) {
  const [cursor, setCursor] = useState({ key: resetKey, page: 1 });
  const data = pageSlice(items, cursor.key === resetKey ? cursor.page : 1, pageSize);
  const change = (page) => setCursor({ key: resetKey, page });
  const controls = <CompactPagination data={data} onChange={change} label={label} />;
  return (
    <>
      {data.rows.map((item, index) => children(item, data.offset + index))}
      {data.totalPages > 1 && (
        layout === 'table' ? (
          <tr>
            <td colSpan={columns}>{controls}</td>
          </tr>
        ) : (
          <div className="console-pagination-slot w-full flex-basis-full">{controls}</div>
        )
      )}
    </>
  );
}
