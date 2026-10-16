import React from 'react';

/** 3–4 KPI cards from verified evidence; values formatted deterministically. */
export const KpiStrip: React.FC<{ cards: Array<{ label: string; value: string; comparison: string | null; direction: string | null; context: string; evidence_id?: string }> }> = ({ cards }) => {
  if (!cards.length) return null;
  return <div data-kpi-strip className={`grid grid-cols-1 sm:grid-cols-2 ${cards.length >= 4 ? 'xl:grid-cols-4' : cards.length === 3 ? 'xl:grid-cols-3' : ''} gap-3`}>
    {cards.map((c, i) => <section key={c.evidence_id || i} className="rounded-2xl border border-slate-200 bg-white p-4 min-w-0 shadow-2xs">
      <p className="text-[11px] font-medium text-slate-500 leading-snug min-h-[28px]">{c.label}</p>
      <p className="text-2xl font-semibold tracking-tight text-slate-900 mt-1 break-words">{c.value}</p>
      {c.comparison && <p className={`text-xs font-medium mt-1 ${c.direction === 'up' ? 'text-emerald-700' : 'text-rose-700'}`}>{c.comparison}</p>}
      <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5">{c.context}</p>
    </section>)}
  </div>;
};
