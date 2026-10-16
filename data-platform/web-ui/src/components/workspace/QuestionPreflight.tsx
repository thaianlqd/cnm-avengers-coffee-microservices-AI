import React from 'react';
import { preflightView } from '../../utils/preflightPresentation.mjs';

const TONE: Record<string, string> = { red: 'border-rose-200 bg-rose-50 text-rose-800', amber: 'border-amber-200 bg-amber-50 text-amber-900', slate: 'border-slate-200 bg-slate-50 text-slate-600', emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800' };

/** Deterministic preflight result: understood chips, findings and quick fixes. */
export const QuestionPreflight: React.FC<{ result: any; pending?: boolean; error?: string; onFix: (fix: any) => void }> = ({ result, pending, error, onFix }) => {
  const v = preflightView(result, { pending, error });
  if (!v.label && !v.findings.length) return null;
  return <div data-preflight={v.status} aria-live="polite" className="space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className={`rounded-full border px-2 py-0.5 font-medium ${TONE[v.tone] || TONE.slate}`}>{v.label}</span>
      {!!v.chips.length && <span className="text-slate-400">Hệ thống hiểu:</span>}
      {v.chips.map((c, i) => <span key={i} title={c.hint} className="rounded-full bg-white border border-slate-200 px-2 py-0.5 text-slate-700">{c.label}{c.hint ? <span className="text-slate-400"> · {c.hint}</span> : null}</span>)}
    </div>
    {v.findings.map((f: any, i: number) => <div key={i} data-finding={f.code} role={f.level === 'block' ? 'alert' : undefined} className={`rounded-xl border px-3 py-2 text-xs ${TONE[f.tone]}`}>
      <p className={f.level === 'block' ? 'font-semibold' : ''}>{f.message}</p>
      {!!f.fixes?.length && <div className="flex flex-wrap gap-1.5 mt-1.5">{f.fixes.map((fix: any, j: number) => fix.kind === 'advice'
        ? <span key={j} className="text-[11px] opacity-80">Gợi ý: {fix.label}</span>
        : <button key={j} type="button" onClick={() => onFix(fix)} className="rounded-lg border border-current/20 bg-white/70 px-2 py-0.5 text-[11px] font-medium hover:bg-white">{fix.label}</button>)}</div>}
    </div>)}
  </div>;
};
