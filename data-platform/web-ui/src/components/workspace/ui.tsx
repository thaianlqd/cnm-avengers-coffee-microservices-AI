import React from 'react';

/** Small V3.1-local primitives; the rest of the app is intentionally untouched. */
export const Card: React.FC<{ className?: string; children: React.ReactNode; as?: 'section' | 'div' | 'article'; label?: string }> = ({ className = '', children, as = 'section', label }) =>
  React.createElement(as, { 'aria-label': label, className: `bg-white rounded-2xl border border-slate-200/80 shadow-xs ${className}` }, children);

const TONES: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200/70', amber: 'bg-amber-50 text-amber-800 border-amber-200/70',
  red: 'bg-rose-50 text-rose-700 border-rose-200/70', slate: 'bg-slate-100 text-slate-600 border-slate-200', indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200/70', yellow: 'bg-amber-50 text-amber-800 border-amber-200/70', gray: 'bg-slate-100 text-slate-500 border-slate-200',
};
export const Badge: React.FC<{ tone?: string; children: React.ReactNode; title?: string }> = ({ tone = 'slate', children, title }) =>
  <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${TONES[tone] || TONES.slate}`}>{children}</span>;

export const toneDot: Record<string, string> = { red: 'bg-rose-500', yellow: 'bg-amber-400', green: 'bg-emerald-500', gray: 'bg-slate-300' };
