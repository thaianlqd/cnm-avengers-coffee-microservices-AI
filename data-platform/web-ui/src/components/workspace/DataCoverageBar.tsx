import React,{useEffect,useState} from 'react';
import { SourceOperations } from './SourceOperations';
import { coverageSummary } from '../../utils/workspacePresentation.mjs';
import { sourceIssues } from '../../utils/sourceHealth.mjs';

/** Data range and batch freshness from the cached capability snapshot. */
export const DataCoverageBar: React.FC<{ capabilities: any; onCoverage?:(coverage:any)=>void }> = ({ capabilities,onCoverage }) => {
  const [updatedCoverage,setUpdatedCoverage]=useState<any>(null);
  useEffect(()=>setUpdatedCoverage(null),[capabilities]);
  const shown=updatedCoverage?{...capabilities,data_coverage:updatedCoverage}:capabilities;
  const c = coverageSummary(shown);
  const health=shown?.data_coverage?.data_health;
  const sourceStates=Object.values(health?.views||{}) as Array<{status?:string;completeness?:string}>;
  const proven=sourceStates.filter(s=>s.status==='healthy'&&(s.completeness==='complete'||s.completeness==='reconciled')).length;
  const blocked=sourceStates.filter(s=>s.status==='blocked').length;
  const unknown=sourceStates.filter(s=>s.status==='unknown').length;
  const issues=sourceIssues(shown);
  return <div data-coverage-bar role="status" className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-2xl border px-4 py-2.5 text-xs ${c.stale ? 'border-amber-200 bg-amber-50/70 text-amber-900' : 'border-slate-200/80 bg-white text-slate-600'}`}>
    <span><span className="text-slate-400">Dữ liệu:</span> <strong className="font-semibold text-slate-800">{c.range}</strong></span>
    {blocked>0&&<span data-source-health="blocked" className="font-medium text-red-800">{blocked} nguồn bị chặn; phân tích dùng nguồn này chưa thể chạy.</span>}
    {unknown>0&&<span data-source-health="unknown">{unknown} nguồn chưa có đủ bằng chứng tải/schema.</span>}
    {health&&sourceStates.length>0&&<span data-source-completeness className={proven===sourceStates.length?'text-emerald-800':''}>Đối soát nguồn: {proven}/{sourceStates.length} nguồn đã khớp với hệ thống gốc.</span>}
    <span className="font-medium text-slate-700">{c.freshness}</span>
    <span><span className="text-slate-400">Đồng bộ gần nhất:</span> {c.lastSync}</span>
    {c.stale && <span className="font-medium">Một số nguồn có ngày phát sinh cũ hoặc đồng bộ trễ</span>}
    {issues.length>0&&<details className="w-full border-t border-amber-100 pt-2" data-source-issues><summary className="cursor-pointer font-medium text-slate-700">Xem nguồn bị ảnh hưởng & lý do ({issues.length})</summary><div className="mt-2 grid gap-2 md:grid-cols-2">{issues.map((source:any)=><div key={source.name} className="rounded-xl border border-slate-200 bg-white p-3 text-slate-600"><strong className={source.status==='blocked'?'text-red-800':'text-amber-800'}>{source.label}</strong><p className="mt-1 text-[10px] text-slate-400">{source.name} · {source.status==='blocked'?'Tạm chặn phân tích nguồn này':source.status==='degraded'?'Chậm cập nhật':'Chưa đủ bằng chứng'}</p>{source.reasons.map((reason:string)=><p key={reason} className="mt-1 text-[11px]">{reason}</p>)}<p className="mt-1 text-[10px] text-slate-400">{source.metrics.length} chỉ số nguồn có thể bị ảnh hưởng. Các nguồn khác được xét độc lập.</p></div>)}</div><p className="mt-2 text-[11px] text-slate-500">Chặn nguồn là lớp bảo vệ số liệu; sau khi nạp/kiểm tra thành công, trạng thái được cập nhật ở lần đo tiếp theo.</p></details>}
    {!!c.lagging?.length && <details className="text-[11px] text-slate-500"><summary className="cursor-pointer">Ngày phát sinh cuối theo nguồn</summary><p className="mt-1">{c.lagging.join(' · ')}. Ngày phát sinh cũ không tự chứng minh đồng bộ bị lỗi; đối chiếu riêng trạng thái nạp/kiểm tra nguồn ở trên.</p></details>}
    <SourceOperations onCoverage={coverage=>{setUpdatedCoverage(coverage);onCoverage?.(coverage);}}/>
  </div>;
};
