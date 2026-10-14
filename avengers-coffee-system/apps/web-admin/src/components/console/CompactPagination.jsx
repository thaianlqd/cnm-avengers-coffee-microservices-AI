import { useState } from 'react';
import { pageWindow, pageSlice } from './paginationModel';
import './CompactPagination.css';
export function PageNumbers({ page, totalPages, onChange }) {
  return <span className="console-page-numbers">{pageWindow(page, totalPages).map(value => typeof value === 'string' ? <span key={value} className="console-page-gap" aria-hidden="true">…</span> : <button type="button" key={value} aria-label={`Trang ${value}`} aria-current={value === page ? 'page' : undefined} onClick={() => onChange(value)}>{value}</button>)}</span>;
}
export function CompactPagination({ data, onChange, label = 'Phân trang danh sách' }) {
  if (data.totalPages <= 1) return null;
  return <nav className="console-pagination" aria-label={label}><small>Hiển thị {data.from}–{data.to} / {data.total}</small><div><button type="button" aria-label="Trang trước" disabled={data.page <= 1} onClick={() => onChange(data.page - 1)}>‹</button><PageNumbers page={data.page} totalPages={data.totalPages} onChange={onChange} /><button type="button" aria-label="Trang sau" disabled={data.page >= data.totalPages} onClick={() => onChange(data.page + 1)}>›</button></div></nav>;
}
// Render only the page while preserving the caller's row markup and all-data KPIs.
// A table footer is a real tr/td, so controls never become invalid tbody children.
export function PaginatedList({ items, children, resetKey = '', pageSize = 10, layout = 'list', columns = 1, label }) {
  const [cursor, setCursor] = useState({ key: resetKey, page: 1 });
  const data = pageSlice(items, cursor.key === resetKey ? cursor.page : 1, pageSize);
  const change = page => setCursor({ key: resetKey, page });
  const controls = <CompactPagination data={data} onChange={change} label={label} />;
  return <>{data.rows.map((item, index) => children(item, data.offset + index))}{data.totalPages > 1 && (layout === 'table' ? <tr><td colSpan={columns}>{controls}</td></tr> : <div className="console-pagination-slot">{controls}</div>)}</>;
}
