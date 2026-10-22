import React from 'react';

/** 3–4 KPI cards from verified evidence; values formatted deterministically. */
export const KpiStrip: React.FC<{ cards: Array<{ label: string; value: string; comparison: string | null; direction: string | null; context: string; evidence_id?: string }> }> = ({ cards }) => {
  if (!cards.length) return null;
  return <div data-kpi-strip className={`grid grid-cols-1 sm:grid-cols-2 ${cards.length >= 4 ? 'xl:grid-cols-4' : cards.length === 3 ? 'xl:grid-cols-3' : ''} gap-3`}>
    {cards.map((c, i) => <section key={`${c.evidence_id || 'card'}:${i}`} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 min-w-0 shadow-2xs">
      <p className="text-[11px] font-medium text-slate-500 leading-snug">{c.label}</p>
      <p className="text-xl sm:text-[22px] font-semibold tracking-tight text-slate-900 mt-1 break-words">{c.value}</p>
      {c.comparison && <p className={`text-xs font-medium mt-1 ${c.direction === 'up' ? 'text-emerald-700' : 'text-rose-700'}`}>{c.comparison}</p>}
      {c.context && <details className="mt-1.5 text-[10px] text-slate-500"><summary className="cursor-pointer">Chi tiết chỉ số</summary><p className="mt-1 leading-relaxed">{c.context}</p></details>}
    </section>)}
  </div>;
};
