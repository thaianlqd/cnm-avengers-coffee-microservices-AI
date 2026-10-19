import React from 'react';
import { coverageSummary } from '../../utils/workspacePresentation.mjs';

/** Data range and batch freshness from the cached capability snapshot. */
export const DataCoverageBar: React.FC<{ capabilities: any }> = ({ capabilities }) => {
  const c = coverageSummary(capabilities);
  const health=capabilities?.data_coverage?.data_health;
  const sourceStates=Object.values(health?.views||{}) as Array<{status?:string}>;
  const blocked=sourceStates.filter(s=>s.status==='blocked').length;
  const unknown=sourceStates.filter(s=>s.status==='unknown').length;
  return <div data-coverage-bar role="status" className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-2xl border px-4 py-2.5 text-xs ${c.stale ? 'border-amber-200 bg-amber-50/70 text-amber-900' : 'border-slate-200/80 bg-white text-slate-600'}`}>
    <span><span className="text-slate-400">Dữ liệu:</span> <strong className="font-semibold text-slate-800">{c.range}</strong></span>
    {blocked>0&&<span data-source-health="blocked" className="font-medium text-red-800">{blocked} nguồn bị chặn; phân tích dùng nguồn này chưa thể chạy.</span>}
    {unknown>0&&<span data-source-health="unknown">{unknown} nguồn chưa có đủ bằng chứng tải/schema.</span>}
    {health&&<span data-source-completeness>Độ đầy đủ nguồn: chưa được chứng nhận.</span>}
    <span className="font-medium text-slate-700">{c.freshness}</span>
    <span><span className="text-slate-400">Đồng bộ gần nhất:</span> {c.lastSync}</span>
    {c.stale && <span className="font-medium">Dữ liệu đang trễ so với hiện tại</span>}
    {!!c.lagging?.length && <details className="text-[11px] text-slate-500"><summary className="cursor-pointer">Một số nguồn dừng sớm hơn</summary><p className="mt-1">{c.lagging.join(' · ')}</p></details>}
  </div>;
};
