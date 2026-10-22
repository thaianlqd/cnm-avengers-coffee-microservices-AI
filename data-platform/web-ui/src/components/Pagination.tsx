import React, { useEffect, useState } from 'react';

/** Local pagination only. Counts describe the received dataset, never unseen server rows. */
export function usePagination<T>(items: T[], initialSize = 10, resetKey: unknown = '') {
  const [state, setState] = useState({ page: 1, size: initialSize, key: resetKey });
  useEffect(() => { setState(previous => ({ ...previous, page: 1, key: resetKey })); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(items.length / state.size));
  const page = state.key === resetKey ? Math.min(state.page, pages) : 1;
  const offset = (page - 1) * state.size;
  return {
    items: items.slice(offset, offset + state.size), total: items.length, page, pages,
    pageSize: state.size, offset,
    onPage: (next: number) => setState({ ...state, key: resetKey, page: Math.max(1, Math.min(next, pages)) }),
    onPageSize: (size: number) => setState({ key: resetKey, page: 1, size }),
  };
}

type Props = {
  total: number; page: number; pageSize: number; onPage: (page: number) => void;
  onPageSize?: (size: number) => void; sizes?: number[]; label: string; noun?: string;
};

export function Pagination({ total, page, pageSize, onPage, onPageSize, sizes = [10, 25, 50], label, noun = 'mục' }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.max(1, Math.min(page, pages));
  const numbered = [...new Set([1, current - 1, current, current + 1, pages].filter(n => n >= 1 && n <= pages))].sort((a,b) => a-b);
  if (!total) return null;
  const button = 'h-8 min-w-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-blue-600';
  return <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
    <p role="status" className="text-[11px] text-slate-500">{(current-1)*pageSize+1}–{Math.min(current*pageSize,total)} / {total} {noun}</p>
    <div className="flex flex-wrap items-center gap-1.5">
      {onPageSize && <label className="mr-2 flex items-center gap-2 text-[11px] text-slate-500">Mỗi trang<select aria-label={`${label}: số mục mỗi trang`} value={pageSize} onChange={e=>onPageSize(Number(e.target.value))} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 focus-visible:outline-blue-600">{[...new Set([...sizes,pageSize])].sort((a,b)=>a-b).map(n=><option key={n} value={n}>{n}</option>)}</select></label>}
      <button type="button" aria-label={`${label}: trang trước`} disabled={current===1} onClick={()=>onPage(current-1)} className={button}>←</button>
      {numbered.map((n,i)=><React.Fragment key={n}>{i>0 && n-numbered[i-1]>1 && <span className="px-1 text-slate-400">…</span>}<button type="button" aria-label={`${label}: trang ${n}`} aria-current={current===n?'page':undefined} onClick={()=>onPage(n)} className={current===n?'h-8 min-w-8 rounded-lg bg-blue-600 px-2 text-xs font-medium text-white focus-visible:outline-blue-600':button}>{n}</button></React.Fragment>)}
      <button type="button" aria-label={`${label}: trang sau`} disabled={current===pages} onClick={()=>onPage(current+1)} className={button}>→</button>
    </div>
  </nav>;
}

export function PaginatedGrid({ children, resetKey, className, label = 'Danh mục dashboard' }: { children: React.ReactNode; resetKey: string; className: string; label?: string }) {
  const page = usePagination(React.Children.toArray(children),12,resetKey);
  return <div><div className={className}>{page.items}</div>{page.total>12 && <div className="mt-5 rounded-xl border border-slate-200 bg-white"><Pagination {...page} label={label} sizes={[12,24,48]} /></div>}</div>;
}
