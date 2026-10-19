import React from 'react';

/**
 * V3.2 "Nhận định từ biểu đồ": server-computed, evidence-referenced statements
 * (0 AI calls). The UI never invents numbers or causes; it only renders them.
 */
export const ChartInsight: React.FC<{ insight?: any }> = ({ insight }) => {
  if (!insight) return null;
  return <details data-chart-insight className="text-[11px] text-slate-600 open:w-full">
    <summary className="cursor-pointer font-medium text-slate-700 focus-visible:outline-blue-500">Nhận định từ biểu đồ</summary>
    <div className="mt-3 rounded-xl bg-slate-50 p-3 leading-relaxed space-y-1.5">
    {insight.why_relevant && <p data-insight-why><span className="text-slate-400">Vì sao có biểu đồ này: </span>{insight.why_relevant}</p>}
    {insight.what_it_shows && <p><span className="text-slate-400">Thể hiện: </span>{insight.what_it_shows}</p>}
    {!!insight.key_facts?.length && <ul className="space-y-0.5">{insight.key_facts.map((f: any, i: number) =>
      <li key={i} data-insight-fact={f.evidence_ref} className="flex gap-1.5"><span aria-hidden className="mt-1.5 w-1 h-1 rounded-full bg-emerald-500 shrink-0" /><span>{f.text}</span></li>)}</ul>}
    {insight.interpretation && <p><span className="text-slate-400">Diễn giải: </span>{insight.interpretation}</p>}
    {!!insight.caveats?.length && <p data-insight-caveat className="text-amber-800"><span className="text-amber-600">Lưu ý: </span>{insight.caveats.join(' ')}</p>}
    {!!insight.next_checks?.length && <div className="pt-1"><span className="text-slate-400">Điểm nên kiểm tra tiếp: </span>{insight.next_checks.join(' · ')}</div>}
    </div>
  </details>;
};

/** "Nguồn & phạm vi" disclosure for one chart (requirement mapping + source rows). */
export const ChartSource: React.FC<{ chart: any }> = ({ chart }) => {
  if (!chart?.requirement_id && !chart?.insight?.source) return null;
  return <details className="text-xs text-slate-600 leading-relaxed"><summary data-chart-source className="cursor-pointer">Nguồn &amp; phạm vi</summary>
    <ul className="mt-1 space-y-0.5 max-w-md">
      {chart.requirement_goal && <li>Yêu cầu: {chart.requirement_goal}</li>}
      <li>Vai trò: {chart.relevance_role === 'supporting' ? 'Góc nhìn hỗ trợ' : 'Trả lời trực tiếp'}</li>
      {chart.insight?.source && <li>Kết quả kiểm chứng: {chart.insight.source.rows} dòng · truy vấn {String(chart.insight.source.query_id).slice(0, 12)}…</li>}
      {!!chart.evidence_refs?.length && <li>{chart.evidence_refs.length} bằng chứng liên kết</li>}
    </ul>
  </details>;
};
