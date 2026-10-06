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
