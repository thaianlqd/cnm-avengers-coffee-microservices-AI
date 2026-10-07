import React, { useEffect, useState } from 'react';
import { AnalystChart } from './Charts';
import { chartAccent, conciseChartTitle, dashboardCharts, dashboardHighlights, dashboardFindings, initialChartType, chartExplanation } from '../utils/analystDashboardLayout.mjs';
import { formatChartValue } from '../utils/aiChartConfig.mjs';
import { analysisChartGroups, analysisChartSpan, analysisPlanLabel } from '../utils/analysisPresentation.mjs';

const ChartCard: React.FC<{ chart: any; compact?: boolean; span: string; editing?: boolean; onChartTypeChange?: (id: string, type: string) => void }> = ({ chart, compact, span, editing, onChartTypeChange }) => {
  const [type, setType] = useState(initialChartType(chart));
  useEffect(() => setType(initialChartType(chart)), [chart.id, chart.chart_type, chart.query_id]);
  const accent = chartAccent(chart);
  const types = ['bar', 'horizontal_bar'].includes(type) ? ['horizontal_bar', 'bar'] : ['line', 'area'].includes(type) ? ['area', 'line'] : [];
  return <article data-dashboard-chart className={`${span} bg-white rounded-2xl border border-slate-200 p-5 min-w-0 w-full h-full flex flex-col`}>
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="min-w-0"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} /><h5 className="text-sm font-semibold text-slate-900">{conciseChartTitle(chart)}</h5></div>
        <p className="text-[11px] text-slate-500 mt-1.5">{chart.x_label || chart.lens_label || chart.domain_label || 'Trong phạm vi đã chọn'}{chart.unit ? ` · ${chart.unit}` : ''}</p>
        <p data-chart-explanation className="text-xs text-slate-600 leading-relaxed mt-2">{chartExplanation({ ...chart, chart_type: type })}</p>
      </div>
      <details className="relative shrink-0 text-xs"><summary aria-label={`Tùy chọn ${conciseChartTitle(chart)}`} className="cursor-pointer list-none rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-50">•••</summary>
        <div className="absolute right-0 z-10 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg space-y-2">
          {chart.purpose && <p className="text-slate-500 leading-relaxed">{chart.purpose}</p>}
          {types.length > 0 && <label className="block text-slate-600">Cách trình bày<select aria-label={`Cách trình bày: ${chart.title}`} value={type} disabled={editing}
            onChange={e => { setType(e.target.value); onChartTypeChange?.(chart.id, e.target.value); }} className="mt-1 w-full border border-slate-200 rounded-lg p-2">{types.map(t => <option key={t} value={t}>{analysisPlanLabel({ chart_type: t })}</option>)}</select></label>}
        </div>
      </details>
    </div>
    <div className="min-h-[300px] flex-1 flex flex-col justify-center min-w-0"><AnalystChart chart={{ ...chart, chart_type: type, accent_color: accent }} /></div>
    {chart.time_note && <p className="text-[11px] leading-relaxed text-amber-700 mt-4">{chart.time_note}</p>}
    {chart.grouped_categories > 0 && <p className="text-[11px] leading-relaxed text-slate-500 mt-4">6 nhóm lớn nhất và Khác ({chart.grouped_categories} nhóm). Tổng và tỷ trọng tính trên toàn bộ {chart.population_count} nhóm; xem từng nhóm trong bảng dữ liệu.</p>}
    {(chart.selection === 'Top N' || chart.selection === 'limited' || chart.selection === 'display_subset') && <p className="text-[11px] text-slate-500 mt-4 border-t border-slate-100 pt-3">
      {chart.selection === 'Top N' ? 'Tập Top N được chọn; không phải cơ cấu toàn bộ.' : chart.selection === 'limited' ? 'Kết quả có giới hạn số dòng.' : `${chart.displayed_count}/${chart.population_count} nhóm · Bảng kết quả giữ đầy đủ; số liệu phân tích dùng đầy đủ các nhóm.`}
    </p>}
  </article>;
};

export const AnalystViews: React.FC<{ charts?: any[]; onChartTypeChange?: (id: string, type: string) => void; editing?: boolean; compact?: boolean }> = ({ charts = [], onChartTypeChange, editing = false, compact = false }) => compact ? <div data-dashboard-grid className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
  {[...charts.filter(c => c.role !== 'supporting'), ...charts.filter(c => c.role === 'supporting')].map((chart, index) => <ChartCard key={chart.id || index} chart={chart} compact span="col-span-1" editing={editing} onChartTypeChange={onChartTypeChange} />)}
</div> : <div className="space-y-5">
  {analysisChartGroups(charts).map(group => <section key={group.role} aria-label={group.title} className="space-y-3">
    <h4 className="text-xs font-semibold text-slate-500">{compact ? group.charts[0]?.domain_label || group.title : group.title}</h4>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      {group.charts.map((chart: any, index: number) => <ChartCard key={chart.id || index} chart={chart} compact={compact} span={compact ? (['multi_line', 'heatmap'].includes(chart.chart_type) ? 'col-span-1 lg:col-span-2' : 'col-span-1') : analysisChartSpan(chart, index, group.charts.length)} editing={editing} onChartTypeChange={onChartTypeChange} />)}
    </div>
  </section>)}
</div>;

export const AnalystDashboard: React.FC<{ report: any; editing?: boolean; onChartTypeChange?: (id: string, type: string) => void }> = ({ report, editing, onChartTypeChange }) => {
  const [showAll, setShowAll] = useState(false);
  const selected = dashboardCharts(report.charts || [], report);
  const highlights = dashboardHighlights(report), findings = dashboardFindings(report);
  const results = Object.entries(report.result_sets || {});
  return <div className="space-y-5">
    {!!report.data_warnings?.length && <details className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><summary className="cursor-pointer font-medium">{report.data_warnings.length} lưu ý về dữ liệu · Xem chi tiết</summary><ul className="mt-2 space-y-1">{report.data_warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></details>}
    {!!highlights.length && <div className={`grid grid-cols-1 ${highlights.length === 1 ? 'sm:grid-cols-1' : highlights.length === 3 ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'} gap-3`}>{highlights.map((card: any, i: number) => <section key={card.evidence_id || i} className="rounded-xl border border-slate-200 bg-white p-4 min-w-0">
      <p className="text-xs text-slate-500 leading-relaxed min-h-[32px]">{card.label}</p>
      <p className="text-2xl font-semibold tracking-tight text-slate-900 mt-2">{card.unit === '%' ? card.value.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : formatChartValue(card.value)} <span className="text-xs font-medium text-slate-400">{card.unit}</span></p>
      <p className="text-[11px] text-slate-500 leading-relaxed mt-2">{card.sub_text || 'Trong phạm vi phân tích'}</p>
    </section>)}</div>}
    {!!findings.length && <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-semibold text-slate-900 mb-3">Điểm nổi bật</h3><div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">{findings.map((f: any, i: number) => <div key={i} className="text-xs text-slate-600 leading-relaxed"><span className="inline-block w-1.5 h-1.5 bg-teal-500 rounded-full mr-2" />{f.text}{f.evidence_id && <a href={`#evidence-${encodeURIComponent(f.evidence_id)}`} className="block text-blue-600 mt-1">Đối chiếu dữ liệu ↗</a>}</div>)}</div></section>}
    <div className="flex flex-wrap gap-2 items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">Các góc nhìn phân tích</h3><span className="text-xs text-slate-400">{selected.charts.length} biểu đồ{selected.duplicateCount ? ` · ${selected.duplicateCount} góc nhìn trùng đã gộp` : ''}</span></div>
    <AnalystViews charts={showAll ? selected.charts : selected.charts.slice(0, 8)} compact editing={editing} onChartTypeChange={onChartTypeChange} />
    {selected.charts.length > 8 && <button onClick={() => setShowAll(!showAll)} className="w-full rounded-xl border border-slate-200 py-3 text-xs text-slate-600 hover:bg-white">{showAll ? 'Thu gọn biểu đồ' : `Xem thêm ${selected.charts.length - 8} biểu đồ`}</button>}
    {!!results.length && <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer flex justify-between text-sm font-semibold text-slate-700">Bảng dữ liệu<span className="text-xs font-normal text-slate-400">{results.length} bảng · Mở để tra cứu</span></summary><div className="space-y-3 mt-4">{results.map(([id, data]) => <AnalystResultTable key={id} result={data} title={report.analysis_explanation?.find((op: any) => op.query_id === id)?.lens_label || report.analysis_explanation?.find((op: any) => op.query_id === id)?.subject} />)}</div></details>}
    <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Diễn giải đầy đủ</summary><div className="text-sm text-slate-600 leading-relaxed mt-4"><p>{report.executive_summary}</p><AnalystOptionalNarrative report={report} /></div></details>
    <AnalystEvidence report={report} />
  </div>;
};

export const AnalystResultTable: React.FC<{ result: any; title?: string }> = ({ result, title }) => {
  const [page, setPage] = useState(1), [search, setSearch] = useState('');
  const allRows = result.rows || [];
  const rows = allRows.filter((row: any) => !search || Object.values(row).some(value => String(value ?? '').toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))));
  const pageSize = 15, pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const activePage = Math.min(page, pages);
  const download = () => {
    const cell = (value: any) => {
      let text = String(value ?? '');
      if (typeof value === 'string' && /^\s*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const csv = [result.columns.map((c: string) => cell(result.column_labels?.[c] || c)).join(','), ...allRows.map((r: any) => result.columns.map((c: string) => cell(r[c])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'ket-qua-phan-tich.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  return <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
    <h3 className="font-semibold text-sm">{title || (result.role === 'supporting' ? 'Kết quả hỗ trợ' : 'Kết quả theo yêu cầu')}</h3>
    <div className="flex gap-2"><input aria-label={`Tìm trong bảng ${title || 'kết quả'}`} placeholder="Tìm trong bảng…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2 text-xs" /><button onClick={download} className="rounded-lg border border-slate-200 px-3 text-xs text-slate-600">Tải CSV đầy đủ</button></div>
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
    <p>AI đã lập kế hoạch. Bạn xác nhận phạm vi trước khi tạo báo cáo.</p>
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
  const operations = report.analysis_explanation || [], evidence = report.evidence || [];
  const [open, setOpen] = useState(false), [search, setSearch] = useState(''), [scope, setScope] = useState(''), [page, setPage] = useState(1);
  useEffect(() => {
    const followAnchor = () => {
      if (!window.location.hash.startsWith('#evidence-')) return;
      let id = ''; try { id = decodeURIComponent(window.location.hash.slice(10)); } catch { return; }
      const index = evidence.findIndex((e: any) => e.id === id);
      if (index < 0) return;
      setOpen(true); setSearch(''); setScope(''); setPage(Math.floor(index / 8) + 1);
      setTimeout(() => document.getElementById(`evidence-${encodeURIComponent(id)}`)?.scrollIntoView({ block: 'center' }), 0);
    };
    followAnchor(); window.addEventListener('hashchange', followAnchor);
    return () => window.removeEventListener('hashchange', followAnchor);
  }, [report]);
  if (!operations.length) return null;
  const filtered = evidence.filter((e: any) => (!scope || e.scope_ref === scope) && (!search || String(e.statement).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))));
  const pages = Math.max(1, Math.ceil(filtered.length / 8)), activePage = Math.min(page, pages);
  return <details open={open} onToggle={e => setOpen(e.currentTarget.open)} className="bg-white rounded-2xl border border-slate-200 p-4">
    <summary className="cursor-pointer flex justify-between gap-3 text-sm font-semibold text-slate-700">Cơ sở phân tích và dữ liệu sử dụng<span className="text-xs font-normal text-slate-400">{evidence.length} phép tính · Tra cứu</span></summary>
    <div className="mt-4 space-y-4">
      <p className="text-xs text-slate-500">Đối chiếu phạm vi, chỉ số và nguồn dữ liệu. Các phép tính được tìm kiếm và phân trang.</p>
      {operations.map((op: any) => <details key={op.query_id} className="border border-slate-100 rounded-xl p-3">
        <summary className="text-xs font-medium cursor-pointer">{op.lens_label || op.subject} · {op.objective} · {op.role === 'supporting' ? 'Hỗ trợ' : 'Theo yêu cầu'}</summary>
        <div className="text-xs text-slate-600 mt-3 space-y-2">
          <p>Nguồn: {(op.data_sources || []).join(' · ')}</p><p>{op.population_note}</p>
          {(op.caveats || []).map((note: string) => <p key={note} className="text-amber-700">{note}</p>)}
          <p>Chỉ số: {(op.metrics || []).map((m: any) => `${m.label} (${m.unit})`).join(' · ') || 'Các trường chi tiết'}</p>
          {(op.metrics || []).map((m: any) => <p key={m.id}>{m.business_meaning} {m.additive === false ? 'Không cộng các nhóm để suy ra tổng toàn phạm vi.' : ''} {(m.population_requirements || []).join(' · ')}</p>)}
          <p>Phân nhóm: {(op.dimensions || []).join(' · ') || 'Toàn phạm vi đã chọn'}</p>
          <p>Bộ lọc: {(op.filters || []).map((f: any) => `${f.label}: ${Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}`).join(' · ') || 'Không có bộ lọc bổ sung'}</p>
          <p>Thời gian: {op.period?.start ? `${op.period.start} → ${op.period.end}` : 'Toàn bộ dữ liệu hiện có'} · {op.period?.timezone}</p>
          {op.metrics?.some((m: any) => m.historical === false) && <p>Chỉ số hiện trạng: không thể suy ra diễn biến quá khứ.</p>}
          <p>{op.rows_returned == null ? 'Kế hoạch chưa chạy truy vấn.' : `${op.rows_returned} dòng kết quả đã kiểm chứng.`} {op.selection === 'Top N' ? 'Tập Top N không đại diện toàn bộ cơ cấu.' : op.selection === 'limited' ? 'Kết quả có giới hạn số dòng.' : ''}</p>
          <details><summary className="cursor-pointer">Điều kiện chỉ số và cách trình bày</summary><div className="space-y-2 mt-2">
            {(op.metrics || []).map((m: any) => <p key={m.id}>{(m.business_filters || []).map((f: any) => `${m.label}: ${f.dimension} ${f.operator} ${Array.isArray(f.value) ? f.value.join(', ') : String(f.value)}`).join('; ')}</p>)}
            {(op.visuals || []).map((v: any) => <p key={v.id}>{v.reason}</p>)}
          </div></details>
          {!!op.evidence_refs?.length && <button className="text-blue-600" onClick={() => { setScope(op.query_id); setSearch(''); setPage(1); }}>Tra cứu {op.evidence_refs.length} phép tính của phần này</button>}
        </div>
      </details>)}
      {!!evidence.length && <section className="border-t border-slate-100 pt-4 space-y-3">
        <div className="flex flex-wrap gap-2"><input aria-label="Tìm bằng chứng" placeholder="Tìm theo nội dung phép tính…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="border border-slate-200 rounded-lg p-2 text-xs flex-1 min-w-0" /><select aria-label="Phạm vi bằng chứng" value={scope} onChange={e => { setScope(e.target.value); setPage(1); }} className="border border-slate-200 rounded-lg p-2 text-xs"><option value="">Tất cả phần phân tích</option>{operations.map((op: any) => <option value={op.query_id} key={op.query_id}>{op.lens_label || op.subject}</option>)}</select></div>
        {filtered.slice((activePage - 1) * 8, activePage * 8).map((e: any) => <details key={e.id} id={`evidence-${encodeURIComponent(e.id)}`} className="text-xs rounded-lg bg-slate-50 p-3 scroll-mt-24"><summary className="cursor-pointer text-slate-600 leading-relaxed">{e.statement}</summary><p className="text-slate-500 mt-2">Đơn vị: {e.unit || 'Bản ghi'}</p><pre className="whitespace-pre-wrap break-words mt-2">{JSON.stringify(e.values, null, 2)}</pre></details>)}
        {!filtered.length && <p className="text-xs text-slate-400">Không có phép tính phù hợp.</p>}
        <div className="flex justify-between items-center text-xs text-slate-500"><span>{filtered.length} phép tính · Trang {activePage}/{pages}</span><div className="flex gap-3"><button disabled={activePage === 1} onClick={() => setPage(activePage - 1)} className="disabled:opacity-30">Trang trước</button><button disabled={activePage === pages} onClick={() => setPage(activePage + 1)} className="disabled:opacity-30">Trang sau</button></div></div>
      </section>}
    </div>
  </details>;
};
