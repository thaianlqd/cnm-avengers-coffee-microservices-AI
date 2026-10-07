import React from 'react';

export const AnalysisQualityScore: React.FC<{ assessment?: any }> = ({ assessment }) => {
  const q = assessment || {}, scored = Number.isInteger(q.score) && q.score >= 0 && q.score <= 100 && ['verified', 'partially_verified'].includes(q.status);
  const color = !scored ? 'bg-slate-400' : q.score >= 90 ? 'bg-emerald-500' : q.score >= 75 ? 'bg-blue-500' : 'bg-amber-500';
  const groups = [['Đã thực hiện', q.completed], ['Chưa thực hiện', q.missing], ['Chưa thể xác minh', q.unverified], ['Giới hạn dữ liệu', q.limitations]];
  const item = (i: any) => <li key={i.id} className="leading-relaxed">{i.label}{i.evidence_refs?.[0] && <a className="text-blue-600 ml-2 whitespace-nowrap" href={`#evidence-${encodeURIComponent(i.evidence_refs[0])}`}>Đối chiếu ↗</a>}</li>;
  return <section data-analysis-quality aria-label="Mức độ kiểm chứng" className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
    <div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold text-slate-900">Mức độ kiểm chứng</h3><p className="text-xs text-slate-500 mt-1 leading-relaxed">Đối chiếu phạm vi, số liệu và bằng chứng theo các kiểm tra của hệ thống. Điểm này không phải xác suất AI trả lời đúng.</p></div><strong className="text-2xl text-slate-900 whitespace-nowrap">{scored ? `${q.score}/100` : 'Chưa chấm'}</strong></div>
    {scored ? <div role="progressbar" aria-label="Điểm kiểm chứng" aria-valuemin={0} aria-valuemax={100} aria-valuenow={q.score} className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${color}`} style={{ width: `${q.score}%` }} /></div> : <p className="text-xs text-slate-600">{q.reason || 'Chưa đủ metadata để chấm theo V2.7.'}</p>}
    {groups.some(([, items]) => items?.length) && <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs text-slate-600">{groups.map(([label, items]) => !!items?.length && <div key={label}><h4 className="font-semibold text-slate-800 mb-2">{label}</h4><ul className="space-y-2">{items.map(item)}</ul></div>)}</div>}
    {!!q.components?.length && <details className="border-t border-slate-100 pt-3"><summary className="cursor-pointer text-xs font-medium text-slate-600">Chi tiết các kiểm tra</summary><div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">{q.components.map((c: any) => <div key={c.id} className="rounded-xl bg-slate-50 p-3 text-xs"><div className="flex justify-between gap-2 font-medium text-slate-800"><span>{c.label}</span><span>{c.status === 'not_applicable' ? 'Không áp dụng' : `${c.score}/${c.max_score}`}</span></div><p className="text-slate-500 mt-1 leading-relaxed">{c.summary}</p></div>)}</div></details>}
    {!!q.suggested_next_actions?.length && <div className="text-xs text-slate-600 border-t border-slate-100 pt-3"><h4 className="font-semibold text-slate-800 mb-2">Bước tiếp theo</h4><ul className="space-y-2">{q.suggested_next_actions.map(item)}</ul></div>}
    <p className="text-[10px] text-slate-400">Bộ kiểm tra {q.version || '2.7'} · Tính bằng quy tắc kiểm chứng dữ liệu</p>
  </section>;
};
