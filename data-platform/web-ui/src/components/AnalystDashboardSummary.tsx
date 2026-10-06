import React from 'react';

export const AnalystReportReady: React.FC<{ report: any; onOpen: () => void }> = ({ report, onOpen }) => {
  if (report?.status !== 'success') return null;
  return <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
    <div className="flex items-center space-x-3">
      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
      <div>
        <div className="text-xs font-semibold text-slate-900">Bản xem trực quan đã sẵn sàng: {report.title || 'Báo cáo mới'}</div>
        <div className="text-[11px] text-slate-500">Chuyển sang Bước 3 để xem Dashboard trực quan hoặc xuất file Word (.docx).</div>
      </div>
    </div>
    <button onClick={onOpen} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-all shadow-xs cursor-pointer self-start sm:self-auto">Xem báo cáo (Bước 3)</button>
  </div>;
};

export const AnalystDashboardSummary: React.FC<{ report: any }> = ({ report }) => {
  const plan = report.dashboard_plan || {};
  const omitted = plan.omitted_visuals || [];
  return <div className="text-xs text-slate-500 space-y-1">
    <p>{report.dashboard_description || `${(report.charts || []).length} biểu đồ và bảng kết quả theo phạm vi đã chọn.`}</p>
    {typeof plan.requested_chart_count === 'number' && <p>{plan.requested_chart_count} biểu đồ theo yêu cầu · {plan.supporting_chart_count || 0} biểu đồ hỗ trợ</p>}
    {omitted.length > 0 && <p>{omitted.length} đề xuất trực quan không được hiển thị do giới hạn hoặc không phù hợp với dữ liệu. Các bảng kết quả vẫn có bên dưới.</p>}
  </div>;
};

export const AnalystOptionalNarrative: React.FC<{ report: any }> = ({ report }) => {
  const conclusions = report.conclusions || [], recommendations = report.recommendations || [];
  if (!conclusions.length && !recommendations.length) return null;
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
    {conclusions.length > 0 && <section className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="text-sm font-semibold">Kết luận phân tích</h3><p className="text-xs text-slate-600 mt-2">{Array.isArray(conclusions) ? conclusions.join(' ') : conclusions}</p></section>}
    {recommendations.length > 0 && <section className="bg-white rounded-2xl border border-slate-200 p-6"><h3 className="text-sm font-semibold">Khuyến nghị từ bằng chứng</h3><ul className="text-xs text-slate-600 mt-2 space-y-2">{recommendations.map((r: any, i: number) => <li key={i}>{typeof r === 'string' ? r : r.text || r.recommendation}</li>)}</ul></section>}
  </div>;
};


export const AnalystEvidence: React.FC<{ report: any }> = ({ report }) => {
  const operations = report.analysis_explanation || [];
  if (!operations.length) return null;
  return <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
    <h3 className="text-sm font-semibold">Cơ sở phân tích và dữ liệu sử dụng</h3>
    <p className="text-xs text-slate-500">Đối chiếu phạm vi, chỉ số, nguồn và bằng chứng của từng phần phân tích.</p>
    {operations.map((op: any, index: number) => <details key={op.query_id} open={index === 0} className="border border-slate-200 rounded-xl p-3">
      <summary className="text-sm font-semibold cursor-pointer">{op.subject} · {op.objective} · {op.role === 'supporting' ? 'Hỗ trợ' : 'Theo yêu cầu'}</summary>
      <div className="text-xs text-slate-600 mt-3 space-y-2">
        <p>Nguồn: {(op.data_sources || []).join(' · ')}</p>
        <p>Chỉ số: {(op.metrics || []).map((m: any) => `${m.label} (${m.unit})`).join(' · ') || 'Các trường chi tiết'}</p>
        <p>Phân nhóm: {(op.dimensions || []).join(' · ') || 'Toàn phạm vi đã chọn'}</p>
        <p>Bộ lọc: {(op.filters || []).map((f: any) => `${f.label}: ${Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}`).join(' · ') || 'Không có bộ lọc bổ sung'}</p>
        <p>Thời gian: {op.period?.start ? `${op.period.start} → ${op.period.end}` : 'Toàn bộ dữ liệu hiện có'} · {op.period?.timezone}</p>
        {op.metrics?.some((m: any) => m.business_filters?.length) && <p>Điều kiện chỉ số: {op.metrics.map((m: any) => (m.business_filters || []).map((f: any) => `${m.label}: ${f.dimension} ${f.operator} ${Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}`).join('; ')).filter(Boolean).join(' · ')}</p>}
        <p>{op.rows_returned == null ? 'Kế hoạch chưa chạy truy vấn.' : `${op.rows_returned} dòng kết quả đã kiểm chứng.`} {op.selection === 'Top N' ? 'Tập Top N không đại diện toàn bộ cơ cấu.' : op.selection === 'limited' ? 'Kết quả có giới hạn số dòng.' : ''}</p>
        {(op.visuals || []).map((v: any) => <p key={v.id}>Lý do chọn biểu đồ: {v.reason}</p>)}
        {!!op.evidence_refs?.length && <div className="flex flex-wrap gap-2">{op.evidence_refs.map((id: string, i: number) => <a key={id} className="text-blue-700 underline" href={`#evidence-${encodeURIComponent(id)}`}>Bằng chứng {i + 1}</a>)}</div>}
      </div>
    </details>)}
    {!!report.evidence?.length && <details className="border-t pt-3"><summary className="text-xs font-semibold cursor-pointer">Các phép tính và bằng chứng kiểm chứng</summary><div className="mt-3 space-y-3">{report.evidence.map((e: any) => <div key={e.id} id={`evidence-${encodeURIComponent(e.id)}`} className="text-xs text-slate-600 scroll-mt-24">
      <p className="font-semibold">{e.statement}</p>
      <p>Phạm vi kết quả: {e.scope_ref} · Đơn vị: {e.unit || 'Bản ghi'}</p>
      <pre className="whitespace-pre-wrap break-words bg-slate-50 rounded p-2 mt-1">{JSON.stringify(e.values, null, 2)}</pre>
    </div>)}</div></details>}
  </section>;
};
