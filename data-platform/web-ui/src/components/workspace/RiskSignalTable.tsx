import React from 'react';
import { riskRows, riskBreachChart, riskSummary } from '../../utils/workspacePresentation.mjs';
import { toneDot } from './ui';

/** Server-classified traffic lights. No composite score is computed or shown. */
export const RiskSignalTable: React.FC<{ result: any; onAsk?: (question: string, mission: string, context?: any) => void }> = ({ result, onAsk }) => {
  if (!result?.signals) return null;
  const rows = riskRows(result), breaches = riskBreachChart(result), summary = riskSummary(result);
  const max = Math.max(1, ...breaches.map(b => b.value));
  return <section data-risk-table className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-2xs">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-900">Tín hiệu rủi ro theo ngưỡng</h3>
      <span className="text-[11px] text-slate-500">{result.counts?.red || 0} vượt · {result.counts?.yellow || 0} gần ngưỡng · {result.counts?.green || 0} trong ngưỡng · 0 lượt AI</span>
    </div>
    <p data-risk-applied-context className="text-[11px] text-slate-500">Phạm vi đã áp dụng: {result.scope_label || (result.scope?.length ? result.scope.map((f: any) => `${f.dimension}: ${[].concat(f.value).join(', ')}`).join(' · ') : 'Toàn hệ thống')}
      {result.resolved_time?.start ? ` · ${result.resolved_time.start} → ${result.resolved_time.end}` : ' · Toàn bộ dữ liệu thời gian phù hợp'}
      {result.signals.some((s: any) => s.historical === false) ? ' · Chỉ số hiện trạng được ghi riêng, không gán cho kỳ lịch sử.' : ''}</p>
    <div data-risk-summary className={`rounded-xl border px-3 py-2 text-xs ${summary.status === 'red' ? 'border-rose-200 bg-rose-50 text-rose-900' : summary.status === 'yellow' ? 'border-amber-200 bg-amber-50 text-amber-900' : summary.status === 'gray' ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>
      <p className="font-semibold">{summary.headline} · {summary.total}/{summary.selected} tín hiệu đủ dữ liệu · {summary.breached} tín hiệu vượt ngưỡng</p>
      {!!summary.entities.length && <p className="mt-1">Cần xem trước: {summary.entities.map(e => `${e.label} (${e.signal.toLowerCase()}: ${e.value})`).join(' · ')}</p>}
    </div>
    <div className="overflow-x-auto"><table className="w-full text-xs">
      <thead><tr className="text-left text-slate-500"><th className="py-2 pr-3">Tín hiệu</th><th className="py-2 pr-3">Chỉ số</th><th className="py-2 pr-3 text-right">Giá trị</th><th className="py-2 pr-3 text-right">Ngưỡng</th><th className="py-2">Trạng thái</th></tr></thead>
      <tbody>{rows.map((r: any) => <tr key={r.id} data-risk-signal={r.id} data-status={r.status} className="border-t border-slate-100 align-top">
        <td className="py-2 pr-3 font-medium text-slate-800">{r.label}{r.breach && <span className="block text-[11px] font-normal text-slate-500">{r.breach}</span>}</td>
        <td className="py-2 pr-3 text-slate-600"><details><summary className="cursor-pointer">{r.metric}</summary><p className="mt-1 text-[11px] text-slate-500 max-w-xs">{r.definition}</p></details></td>
        <td className="py-2 pr-3 text-right tabular-nums text-slate-800">{r.value}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{r.threshold}</td>
        <td className="py-2"><span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${toneDot[r.tone]}`} />{r.statusLabel}</span>{r.note && <span className="block text-[11px] text-slate-400">{r.note}</span>}</td>
      </tr>)}</tbody>
    </table></div>
    {!!breaches.length && <div className="space-y-2"><h4 className="text-xs font-semibold text-slate-700">Số nhóm vượt ngưỡng theo tín hiệu</h4>
      {breaches.map(b => <div key={b.label} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_3rem] items-center gap-3 text-xs"><span className="text-slate-600">{b.label}</span><span className="h-2.5 rounded-full bg-slate-100"><span className="block h-full rounded-full bg-rose-400" style={{ width: `${b.value / max * 100}%` }} /></span><span className="text-right tabular-nums">{b.value}</span></div>)}
    </div>}
    {!!summary.followUps.length && <div className="flex flex-wrap items-center gap-2 text-xs"><span className="text-slate-500">Điểm nên kiểm tra tiếp:</span>
      {summary.followUps.map(f => <button key={f.text} type="button" disabled={!onAsk} onClick={() => onAsk?.(f.text, f.mission, f)} className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-60">{f.text}</button>)}</div>}
    <p className="text-[11px] text-slate-500">{result.threshold_policy}</p>
  </section>;
};
