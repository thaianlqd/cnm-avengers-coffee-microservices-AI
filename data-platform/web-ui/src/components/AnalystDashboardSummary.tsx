import React, { useState } from 'react';
import { AnalystChart } from './Charts';
import { analysisChartGroups, analysisChartSpan, analysisPlanLabel } from '../utils/analysisPresentation.mjs';

export const AnalystViews: React.FC<{ charts?: any[]; onChartTypeChange?: (id: string, type: string) => void; editing?: boolean }> = ({ charts = [], onChartTypeChange, editing = false }) => <div className="space-y-6">
  {analysisChartGroups(charts).map(group => <section key={group.role} aria-label={group.title} className="space-y-3">
    <h4 className="text-sm font-semibold text-slate-800">{group.title}</h4>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
      {group.charts.map((chart: any, index: number) => <article key={chart.id || index}
        className={`${analysisChartSpan(chart, index, group.charts.length)} bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 min-w-0`}>
        <div className="border-b border-slate-100 pb-3 mb-4 space-y-1">
          <h5 className="text-sm font-semibold text-slate-900">{chart.title}</h5>
          <p className="text-xs text-slate-500">{chart.purpose}</p>
          {chart.lens_label && <p className="text-xs text-indigo-700">Góc nhìn: {chart.lens_label}</p>}
          <p className="text-xs text-slate-500">{chart.chart_type_label}{chart.unit ? ` · ${chart.unit}` : ''}</p>
          {onChartTypeChange && ['bar', 'horizontal_bar', 'line', 'area'].includes(chart.chart_type) && <label className="flex items-center gap-2 text-xs text-slate-600">
            Cách trình bày
            <select aria-label={`Cách trình bày: ${chart.title}`} value={chart.chart_type} disabled={editing}
              onChange={event => onChartTypeChange(chart.id, event.target.value)} className="border border-slate-200 rounded-lg p-1 bg-white">
              {(['line', 'area'].includes(chart.chart_type) ? ['line', 'area'] : ['horizontal_bar', 'bar']).map(type => <option key={type} value={type}>{analysisPlanLabel({ chart_type: type })}</option>)}
            </select>
          </label>}
          {chart.selection === 'Top N' && <p className="text-xs text-amber-700">Tập Top N được chọn; không phải cơ cấu toàn bộ.</p>}
          {chart.selection === 'limited' && <p className="text-xs text-amber-700">Kết quả có giới hạn số dòng.</p>}
        </div>
        <AnalystChart chart={chart} />
      </article>)}
    </div>
  </section>)}
</div>;

export const AnalystResultTable: React.FC<{ result: any; title?: string }> = ({ result, title }) => {
  const [page, setPage] = useState(1);
  const rows = result.rows || [], pageSize = 15, pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const activePage = Math.min(page, pages);
  return <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
    <h3 className="font-semibold text-sm">{title || (result.role === 'supporting' ? 'Kết quả hỗ trợ' : 'Kết quả theo yêu cầu')}</h3>
    {result.as_of && <p className="text-xs text-slate-500">Dữ liệu quan sát lúc {result.as_of}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-xs">
      <thead><tr>{result.columns.map((column: string) => <th className="p-2" key={column}>{result.column_labels?.[column] || 'Trường dữ liệu'}</th>)}</tr></thead>
      <tbody>{rows.slice((activePage - 1) * pageSize, activePage * pageSize).map((row: any, index: number) => <tr key={index}>{result.columns.map((column: string) => <td className="p-2 border-t border-slate-100" key={column}>{row[column] == null ? '—' : String(row[column])}</td>)}</tr>)}</tbody>
    </table></div>
    {!rows.length && <p className="text-slate-500 text-xs">Không có dữ liệu trong phạm vi này.</p>}
    <div className="flex items-center gap-3 text-xs text-slate-600">
      <span>{rows.length} dòng đã kiểm chứng · Trang {activePage}/{pages}</span>
      {pages > 1 && <><button disabled={activePage === 1} onClick={() => setPage(activePage - 1)}>Trang trước</button><button disabled={activePage === pages} onClick={() => setPage(activePage + 1)}>Trang sau</button></>}
    </div>
  </section>;
};

export const AnalystPlanningSummary: React.FC<{ diagnostics?: any }> = ({ diagnostics }) => {
  if (diagnostics?.planning_mode !== 'one_shot') return null;
  const omitted = Number.isInteger(diagnostics.omitted_supporting_operation_count) ? diagnostics.omitted_supporting_operation_count : 0;
  return <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
    <p>Kế hoạch được lập trong một lượt AI. Bạn xác nhận phạm vi trước khi tạo báo cáo.</p>
    {diagnostics.analysis_depth === 'deep' && <p>Phân tích sâu: mục tiêu 5–6 góc nhìn hữu ích theo dữ liệu và phạm vi đã chọn.</p>}
    {diagnostics.analysis_depth === 'comprehensive' && <p>Phân tích toàn diện: mở rộng các miền liên quan, hướng đến 6–8 góc nhìn khi dữ liệu cho phép.</p>}
    {diagnostics.depth_coverage?.status === 'limited' && <p>Dữ liệu hoặc phạm vi hiện tại cung cấp ít góc nhìn hơn mục tiêu; báo cáo giữ các kết quả đã kiểm chứng.</p>}
    <p>{diagnostics.requested_operation_count || diagnostics.registered_requested_operations || 0} phần theo yêu cầu · {diagnostics.supporting_operation_count || diagnostics.registered_supporting_operations || 0} phần hỗ trợ</p>
    {omitted > 0 && <p>{omitted} phần hỗ trợ đã được bỏ qua vì chưa hợp lệ hoặc vượt giới hạn. Các phần theo yêu cầu đã vượt qua kiểm chứng.</p>}
  </div>;
};

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
    {!!report.domain_summary?.length && <p>Miền dữ liệu đã phân tích: {report.domain_summary.map((d: any) => d.label).join(' · ')}</p>}
    {typeof plan.requested_chart_count === 'number' && <p>{plan.requested_chart_count} biểu đồ theo yêu cầu · {plan.supporting_chart_count || 0} biểu đồ hỗ trợ</p>}
    {omitted.length > 0 && <p>{omitted.length} đề xuất trực quan không được hiển thị do giới hạn hoặc không phù hợp với dữ liệu. Các bảng kết quả vẫn có bên dưới.</p>}
    {report.diagnostics?.omitted_supporting_operation_count > 0 && <p>{report.diagnostics.omitted_supporting_operation_count} phần phân tích hỗ trợ đã được bỏ qua; báo cáo giữ các kết quả đã kiểm chứng.</p>}
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
        {op.domain_label && <p>Miền dữ liệu: {op.domain_label}{op.lens_label ? ` · Góc nhìn: ${op.lens_label}` : ''}</p>}
        {op.supporting_reason && <p>Mục đích hỗ trợ: {op.supporting_reason}</p>}
        {op.population_note && <p>{op.population_note}</p>}
        {(op.caveats || []).map((note: string) => <p key={note} className="text-amber-700">{note}</p>)}
        <p>Chỉ số: {(op.metrics || []).map((m: any) => `${m.label} (${m.unit})`).join(' · ') || 'Các trường chi tiết'}</p>
        {(op.metrics || []).map((m: any) => <p key={m.id}>{m.business_meaning} {m.additive === false ? 'Không cộng các nhóm để suy ra tổng toàn phạm vi.' : ''}</p>)}
        {!!op.comparison_baselines?.length && <p>So sánh nhóm dùng trung bình hoặc trung vị của các nhóm đầy đủ trong cùng phạm vi; chênh lệch không tự xác định hiệu quả tốt/xấu.</p>}
        {op.metrics?.some((m: any) => m.population_requirements?.length) && <p>Phạm vi chỉ số: {op.metrics.map((m: any) => (m.population_requirements || []).join(', ')).filter(Boolean).join(' · ')}</p>}
        <p>Phân nhóm: {(op.dimensions || []).join(' · ') || 'Toàn phạm vi đã chọn'}</p>
        <p>Bộ lọc: {(op.filters || []).map((f: any) => `${f.label}: ${Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}`).join(' · ') || 'Không có bộ lọc bổ sung'}</p>
        <p>Thời gian: {op.period?.start ? `${op.period.start} → ${op.period.end}` : 'Toàn bộ dữ liệu hiện có'} · {op.period?.timezone}</p>
        {op.metrics?.some((m: any) => m.historical === false) && <p>Chỉ số hiện trạng: dữ liệu hiện có tại thời điểm quan sát; không thể suy ra diễn biến quá khứ.</p>}
        {op.metrics?.some((m: any) => m.business_filters?.length) && <p>Điều kiện chỉ số: {op.metrics.map((m: any) => (m.business_filters || []).map((f: any) => `${m.label}: ${f.dimension} ${f.operator} ${Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}`).join('; ')).filter(Boolean).join(' · ')}</p>}
        <p>{op.rows_returned == null ? 'Kế hoạch chưa chạy truy vấn.' : `${op.rows_returned} dòng kết quả đã kiểm chứng.`} {op.selection === 'Top N' ? 'Tập Top N không đại diện toàn bộ cơ cấu.' : op.selection === 'limited' ? 'Kết quả có giới hạn số dòng.' : ''}</p>
        {(op.visuals || []).map((v: any) => <p key={v.id}>Lý do chọn biểu đồ: {v.reason}</p>)}
        {!!op.evidence_refs?.length && <div className="flex flex-wrap gap-2">{op.evidence_refs.map((id: string, i: number) => <a key={id} className="text-blue-700 underline" href={`#evidence-${encodeURIComponent(id)}`}>Bằng chứng {i + 1}</a>)}</div>}
      </div>
    </details>)}
    {!!report.evidence?.length && <details className="border-t pt-3"><summary className="text-xs font-semibold cursor-pointer">Các phép tính và bằng chứng kiểm chứng</summary><div className="mt-3 space-y-3">{report.evidence.map((e: any) => <div key={e.id} id={`evidence-${encodeURIComponent(e.id)}`} className="text-xs text-slate-600 scroll-mt-24">
      <p className="font-semibold">{e.statement}</p>
      <p>Phạm vi kết quả: {operations.find((op: any) => op.query_id === e.scope_ref)?.subject || 'Phạm vi đã chọn'} · Đơn vị: {e.unit || 'Bản ghi'}</p>
      <pre className="whitespace-pre-wrap break-words bg-slate-50 rounded p-2 mt-1">{JSON.stringify(e.values, null, 2)}</pre>
    </div>)}</div></details>}
  </section>;
};
