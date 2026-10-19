import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnalystChart } from './Charts';
import { chartAccent, conciseChartTitle, dashboardCharts, dashboardPrimaryCharts, dashboardChartTabs, dashboardHighlights, dashboardFindings, initialChartType, chartExplanation, businessCategory } from '../utils/analystDashboardLayout.mjs';
import { formatChartValue } from '../utils/aiChartConfig.mjs';
import { analysisChartGroups, analysisChartSpan, analysisPlanLabel } from '../utils/analysisPresentation.mjs';
import { groupDifference, kpiStrip, missionTabs, orderChartsByMission, reportContext } from '../utils/workspacePresentation.mjs';
import { inspectedGroupDraft } from '../utils/missionWorkspace.mjs';
import { KpiStrip } from './workspace/KpiStrip';
import { FollowUpChips } from './workspace/FollowUpChips';
import { ForecastPanel } from './ForecastPanel';
import { ChartInsight, ChartSource } from './report/ChartInsight';
import { VerificationPanel } from './report/VerificationPanel';

/** "Xem dữ liệu": rows rendered only once opened (keeps paged charts honest). */
const ChartData: React.FC<{ chart: any }> = ({ chart }) => {
  const [open, setOpen] = useState(false);
  return <details className="text-xs text-slate-600" onToggle={e => setOpen(e.currentTarget.open)}><summary data-chart-data className="cursor-pointer">Xem dữ liệu</summary>
    {open && <table className="mt-1 text-[11px]"><tbody>{chart.data.slice(0, 50).map((r: any, i: number) => <tr key={i}><td className="pr-3 py-0.5">{businessCategory(r.label)}</td><td className="text-right tabular-nums">{formatChartValue(r.value, chart.unit ? ` ${chart.unit}` : '')}</td></tr>)}</tbody></table>}
  </details>;
};

const ChartCard: React.FC<{ chart: any; compact?: boolean; span: string; editing?: boolean; onChartTypeChange?: (id: string, type: string) => void; definition?: string; onInspect?: (chart: any, row: any) => void }> = ({ chart, compact, span, editing, onChartTypeChange, definition, onInspect }) => {
  const [type, setType] = useState(initialChartType(chart));
  useEffect(() => setType(initialChartType(chart)), [chart.id, chart.chart_type, chart.query_id]);
  const accent = chartAccent(chart);
  // Two-group comparison: deterministic difference from the verified chart rows.
  const difference = !chart.series && ['bar', 'horizontal_bar'].includes(type) && chart.data?.length === 2 && chart.selection !== 'Top N' ? groupDifference(chart.data, 'label', 'value', chart.unit) : null;
  const types = chart.value_transform ? [] : ['bar', 'horizontal_bar'].includes(type) ? ['horizontal_bar', 'bar'] : ['line', 'area'].includes(type) ? ['area', 'line'] : [];
  return <article data-dashboard-chart className={`${span} bg-white rounded-2xl border border-slate-200 p-5 min-w-0 w-full h-full flex flex-col`}>
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="min-w-0"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} /><h5 className="text-sm font-semibold text-slate-900">{conciseChartTitle(chart)}</h5></div>
        <p className="text-[11px] text-slate-500 mt-1.5">{chart.x_label || chart.lens_label || chart.domain_label || 'Trong phạm vi đã chọn'}{chart.unit ? ` · ${chart.unit}` : ''}</p>
        {difference && <p data-group-difference className="text-xs font-medium text-slate-700 mt-1.5">{difference.text}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        <details className="text-xs text-slate-600 leading-relaxed"><summary data-chart-explanation className="cursor-pointer">Cách đọc biểu đồ</summary><p className="mt-1 max-w-md">{chartExplanation({ ...chart, chart_type: type })}</p></details>
        {definition && <details className="text-xs text-slate-600 leading-relaxed"><summary data-metric-definition className="cursor-pointer">Định nghĩa chỉ số</summary><p className="mt-1 max-w-md">{definition}</p></details>}
        {!!chart.data?.length && <ChartData chart={chart} />}
        <ChartSource chart={chart} />
        </div>
        {chart.role === 'supporting' && <span className="inline-block mt-2 rounded-full bg-teal-50 px-2 py-1 text-[10px] font-medium text-teal-700">Góc nhìn bổ sung</span>}
      </div>
      <details className="relative shrink-0 text-xs"><summary aria-label={`Tùy chọn ${conciseChartTitle(chart)}`} className="cursor-pointer list-none rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-50">•••</summary>
        <div className="absolute right-0 z-10 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg space-y-2">
          {chart.purpose && <p className="text-slate-500 leading-relaxed">{chart.purpose}</p>}
          {types.length > 0 && <label className="block text-slate-600">Cách trình bày<select aria-label={`Cách trình bày: ${chart.title}`} value={type} disabled={editing}
            onChange={e => { setType(e.target.value); onChartTypeChange?.(chart.id, e.target.value); }} className="mt-1 w-full border border-slate-200 rounded-lg p-2">{types.map(t => <option key={t} value={t}>{analysisPlanLabel({ chart_type: t })}</option>)}</select></label>}
        </div>
      </details>
    </div>
    <div className="h-[320px] overflow-auto flex-1 flex flex-col justify-center min-w-0"><AnalystChart chart={{ ...chart, chart_type: type, accent_color: accent }} onInspect={onInspect ? row => onInspect(chart, row) : undefined} /></div>
    <ChartInsight insight={chart.insight} />
    {chart.time_note && <p className="text-[11px] leading-relaxed text-amber-700 mt-4">{chart.time_note}</p>}
    {chart.ranking_note && <p className="text-[11px] leading-relaxed text-slate-600 mt-4">{chart.ranking_note}</p>}
    {chart.value_transform === 'contribution_share' && chart.evidence_refs?.[0] && <a className="text-xs text-blue-600 mt-4" href={`#evidence-${encodeURIComponent(chart.evidence_refs[0])}`}>Đối chiếu tử số và mẫu số ↗</a>}
    {chart.grouped_categories > 0 && <p className="text-[11px] leading-relaxed text-slate-500 mt-4">6 nhóm lớn nhất và Khác ({chart.grouped_categories} nhóm). Tổng và tỷ trọng tính trên toàn bộ {chart.population_count} nhóm; xem từng nhóm trong bảng dữ liệu.</p>}
    {(chart.selection === 'Top N' || chart.selection === 'limited' || chart.selection === 'display_subset') && <p className="text-[11px] text-slate-500 mt-4 border-t border-slate-100 pt-3">
      {chart.selection === 'Top N' ? 'Tập Top N được chọn; không phải cơ cấu toàn bộ.' : chart.selection === 'limited' ? 'Kết quả có giới hạn số dòng.' : `${chart.displayed_count}/${chart.population_count} nhóm · Bảng kết quả giữ đầy đủ; số liệu phân tích dùng đầy đủ các nhóm.`}
    </p>}
  </article>;
};

export const AnalystViews: React.FC<{ charts?: any[]; onChartTypeChange?: (id: string, type: string) => void; editing?: boolean; compact?: boolean; definitions?: Record<string, string>; onInspect?: (chart: any, row: any) => void }> = ({ charts = [], onChartTypeChange, editing = false, compact = false, definitions = {}, onInspect }) => compact ? <div data-dashboard-grid className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
  {charts.map((chart, index) => <ChartCard key={chart.id || index} chart={chart} compact span="col-span-1" editing={editing} onChartTypeChange={onChartTypeChange} definition={definitions[chart.metric]} onInspect={onInspect} />)}
</div> : <div className="space-y-5">
  {analysisChartGroups(charts).map(group => <section key={group.role} aria-label={group.title} className="space-y-3">
    <h4 className="text-xs font-semibold text-slate-500">{group.title}</h4>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
      {group.charts.map((chart: any, index: number) => <ChartCard key={chart.id || index} chart={chart} span={analysisChartSpan(chart, index, group.charts.length)} editing={editing} onChartTypeChange={onChartTypeChange} onInspect={onInspect} />)}
    </div>
  </section>)}
</div>;

const REPORT_TABS = [['report', 'Báo cáo'], ['verification', 'Kiểm chứng & nguồn'], ['data', 'Dữ liệu / SQL'], ['export', 'Lưu & xuất']] as const;

/**
 * V3.2 report: the business report is clean (answer → KPIs → relevant charts →
 * limitations → next questions); verification/provenance, data/SQL and
 * save/export live in their own tabs.
 */
export const AnalystDashboard: React.FC<{ report: any; editing?: boolean; onChartTypeChange?: (id: string, type: string) => void; capabilities?: any; onFollowUp?: (question: string) => void; onGroupAnalysis?: (draft: any) => void;
  initialTab?: 'report' | 'verification' | 'data' | 'export'; onSave?: () => void; onExport?: () => void }> = ({ report, editing, onChartTypeChange, capabilities, onFollowUp, onGroupAnalysis, initialTab = 'report', onSave, onExport }) => {
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState('all');
  const [tab, setTab] = useState<string>(initialTab);
  useEffect(() => { setView('all'); setShowAll(false); setTab(initialTab); }, [report.session_id, report.revision]);
  const [resultId, setResultId] = useState<string | null>(null);
  const [inspect, setInspect] = useState<any>(null);
  const [inspectPage, setInspectPage] = useState<any>(null);
  const [inspectError, setInspectError] = useState('');
  const inspectTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!inspect) return;
    return () => { if (inspectTrigger.current?.isConnected) inspectTrigger.current.focus(); };
  }, [inspect]);
  const inspectLabels = Object.fromEntries((capabilities?.metrics || []).flatMap((metric: any) =>
    [[metric.id, metric.label], ...(metric.dimensions || []).map((dimension: any) => [dimension.id, dimension.label])]));
  useEffect(() => { setInspect(null); setInspectPage(null); }, [report.session_id, report.revision]);
  useEffect(() => {
    if (!inspect) return;
    const controller = new AbortController();
    setInspectPage(null); setInspectError('');
    const queryId = inspect.row.entity_ref.query_id;
    const reference = report.result_sets?.[queryId]?.artifact_ref;
    if (!reference) { setInspectError('Báo cáo này chưa có artifact để mở nhóm.'); return; }
    const params = new URLSearchParams({ filters: JSON.stringify(inspect.row.entity_ref.filters), revision: String(report.revision), limit: '50' });
    fetch(`/api/ai/sessions/${encodeURIComponent(report.session_id)}/results/${encodeURIComponent(queryId)}?${params}`, { signal: controller.signal, credentials: 'same-origin' })
      .then(async response => {
        const page = await response.json();
        if (!response.ok) throw new Error(response.status === 403 ? 'Bạn không còn quyền xem nhóm này.' : page.detail || 'Chưa mở được nhóm.');
        if (page.revision !== report.revision || page.artifact_id !== reference.artifact_id) throw new Error('Báo cáo đã thay đổi; hãy mở lại nhóm.');
        if (!controller.signal.aborted) setInspectPage(page);
      }).catch(error => { if (!controller.signal.aborted) setInspectError(error.message); });
    return () => controller.abort();
  }, [inspect, report.session_id, report.revision]);
  const groupDraft = inspect && inspectPage && !inspectError ? inspectedGroupDraft(report, inspect.chart, inspect.row, capabilities) : null;
  // Governed value labels (e.g. ISO weekday 1 → "Thứ Hai") come from capabilities.
  const valueLabels = capabilities?.dimension_value_labels || {};
  const labelled = (report.charts || []).map((c: any) => valueLabels[c.x_field] ? { ...c, data: (c.data || []).map((r: any) => ({ ...r, label: valueLabels[c.x_field].find((v: any) => String(v.value) === String(Number(r.label)))?.label ?? r.label })) } : c);
  const selected = dashboardCharts(labelled, report);
  const ordered = orderChartsByMission(selected.charts, report.mission_layout);
  const primary = dashboardPrimaryCharts(ordered);
  const highlights = dashboardHighlights(report), findings = dashboardFindings(report).slice(0, 3);
  const results = Object.entries(report.result_sets || {});
  const activeResult = results.find(([id]) => id === resultId) || results.find(([,data]: any) => (data.total_rows ?? data.rows?.length) > 1) || results[0];
  const forecasts = (report.forecasts || []).length > 0;
  const tabs = missionTabs(dashboardChartTabs(ordered), report.mission_layout, { forecast: forecasts });
  const activeTab = tabs.find(t => t.id === view) || tabs[0];
  const visibleCharts = view === 'all' ? [...(showAll ? ordered : primary)] : activeTab.charts;
  const context = reportContext(report, capabilities);
  const definitions: Record<string, string> = Object.fromEntries((report.analysis_explanation || []).flatMap((o: any) => (o.metrics || []).map((m: any) => [m.id, m.business_meaning])));
  const caveats = [...new Set((report.charts || []).flatMap((c: any) => c.insight?.caveats || []))].slice(0, 4) as string[];
  const sql = report.sql ? Object.entries(report.sql).map(([name, text]) => `-- ${name}\n${text}`).join('\n\n') : report.sql_query;
  return <div className="space-y-5">
    <section data-report-context className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
      {context.mission && <p><span className="text-slate-400">Nhiệm vụ:</span> <strong className="text-slate-800">{context.mission}</strong></p>}
      <p><span className="text-slate-400">Phạm vi:</span> {context.scope}</p>
      <p><span className="text-slate-400">Thời gian:</span> {context.time}</p>
      {!!context.sources.length && <p className="truncate" title={context.sources.join(' · ')}><span className="text-slate-400">Nguồn:</span> {context.sources.join(' · ')}</p>}
    </section>
    <div role="tablist" aria-label="Phần báo cáo" className="flex flex-wrap gap-1 border-b border-slate-200">{REPORT_TABS.map(([id, label]) =>
      <button key={id} type="button" role="tab" id={`report-tab-${id}`} aria-selected={tab === id} aria-controls={`report-panel-${id}`} onClick={() => setTab(id)} data-report-tab={id}
        className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${tab === id ? 'border-emerald-500 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div>
    {tab === 'report' && <div id="report-panel-report" role="tabpanel" aria-labelledby="report-tab-report" className="space-y-5">
    {!!report.short_answer?.length && <section data-short-answer className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"><h3 className="text-xs font-semibold text-emerald-900 mb-1.5">Trả lời ngắn</h3>
      <ul className="space-y-1 text-sm text-slate-800 leading-relaxed">{report.short_answer.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></section>}

    {report.mission_layout?.caveat && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{report.mission_layout.caveat}</p>}
    {!!report.data_warnings?.length && <details className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800"><summary className="cursor-pointer font-medium">{report.data_warnings.length} lưu ý về dữ liệu · Xem chi tiết</summary><ul className="mt-2 space-y-1">{report.data_warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></details>}
    <KpiStrip cards={kpiStrip(highlights, report)} />
    {!!findings.length && <section className="rounded-xl border border-slate-200 bg-white p-4"><h3 className="text-xs font-semibold text-slate-900 mb-3">Điểm nổi bật</h3><div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">{findings.map((f: any, i: number) => <div key={i} className="text-xs text-slate-600 leading-relaxed"><span className="inline-block w-1.5 h-1.5 bg-teal-500 rounded-full mr-2" />{f.text}{f.evidence_id && <a href={`#evidence-${encodeURIComponent(f.evidence_id)}`} className="block text-blue-600 mt-1">Đối chiếu dữ liệu ↗</a>}</div>)}</div></section>}
    <div className="flex flex-wrap gap-2 items-center justify-between"><h3 className="text-sm font-semibold text-slate-900">Các góc nhìn phân tích</h3><span className="text-xs text-slate-400">{selected.charts.length} biểu đồ{selected.duplicateCount ? ` · ${selected.duplicateCount} góc nhìn trùng đã gộp` : ''}{report.mission_evidence?.dropped?.length ? ` · ${report.mission_evidence.dropped.length} góc nhìn không liên quan đã lọc` : ''}</span></div>
    {report.view_coverage?.some((v:any)=>v.required && v.status==='missing') && <div data-requirement-gaps role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      {report.view_coverage.filter((v:any)=>v.required && v.status==='satisfied').length}/{report.view_coverage.filter((v:any)=>v.required).length} yêu cầu bằng chứng đã đáp ứng; báo cáo chưa đầy đủ.
      {report.view_coverage.filter((v:any)=>v.required && v.status==='missing').map((v:any,i:number)=><p key={i}>{v.requirement_id}: {v.reason || 'Chưa có bằng chứng phù hợp'}</p>)}
    </div>}
    {!report.view_coverage && <p data-coverage-legacy className="text-xs text-slate-500">Báo cáo legacy: Chưa đo độ đầy đủ yêu cầu theo chính sách bằng chứng hiện tại.</p>}
    {tabs.length > 1 && <div role="tablist" aria-label="Góc nhìn biểu đồ" className="flex flex-wrap gap-2">{tabs.map(t => <button key={t.id} id={`chart-tab-${t.id}`} role="tab" aria-selected={activeTab.id === t.id} aria-controls="analysis-chart-panel" onClick={() => setView(t.id)} className={`rounded-lg border px-3 py-2 text-xs ${activeTab.id === t.id ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>{t.label}{t.id === 'forecast' ? '' : ` · ${t.charts.length}`}</button>)}</div>}
    <div id="analysis-chart-panel" role={tabs.length > 1 ? 'tabpanel' : undefined} aria-labelledby={tabs.length > 1 ? `chart-tab-${activeTab.id}` : undefined} className="space-y-4">
    {(view === 'forecast' || (view === 'all' && report.analysis_mission === 'forecast')) && <ForecastPanel forecasts={report.forecasts} coverage={capabilities?.data_coverage} />}
    {view !== 'forecast' && <AnalystViews charts={visibleCharts} compact editing={editing} onChartTypeChange={onChartTypeChange} definitions={definitions} onInspect={(chart, row) => { inspectTrigger.current = document.activeElement as HTMLElement; setInspect({ chart, row }); }} />}
    {view === 'all' && forecasts && report.analysis_mission !== 'forecast' && <ForecastPanel forecasts={report.forecasts} coverage={capabilities?.data_coverage} />}
    </div>
    {!selected.charts.length && !forecasts && <div role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 leading-relaxed">Chưa có biểu đồ phù hợp được kiểm chứng cho kết quả này. Xem bảng dữ liệu trong tab “Dữ liệu / SQL” và mục “Kiểm chứng & nguồn”.</div>}
    {view === 'all' && selected.charts.length > primary.length && <button onClick={() => setShowAll(!showAll)} className="w-full rounded-xl border border-slate-200 py-3 text-xs text-slate-600 hover:bg-white">{showAll ? 'Thu gọn biểu đồ' : `Xem thêm ${selected.charts.length - primary.length} góc nhìn chi tiết`}</button>}
    {!!caveats.length && <section data-report-limitations className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600"><h3 className="font-semibold text-slate-900 mb-2">Giới hạn quan trọng</h3><ul className="space-y-1">{caveats.map((c, i) => <li key={i}>• {c}</li>)}</ul></section>}
    {report.conclusion?.answer && <section data-conclusion className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2"><h3 className="text-xs font-semibold text-slate-900">KẾT LUẬN PHÂN TÍCH</h3>
      <p className="text-sm text-slate-800 leading-relaxed">{report.conclusion.answer}</p>
      {!!report.conclusion.findings?.length && <ul className="space-y-1 text-xs text-slate-700">{report.conclusion.findings.map((f: any, i: number) => <li key={i} data-evidence-id={f.evidence_id}>• {f.statement}</li>)}</ul>}
      {!!report.conclusion.unanswered?.length && <p data-conclusion-unanswered className="text-[11px] text-rose-700"><span className="font-medium">Chưa trả lời được:</span> {report.conclusion.unanswered.join(' · ')}</p>}
      {!!report.conclusion.caveats?.length && <p className="text-[11px] text-amber-800"><span className="font-medium">Lưu ý:</span> {report.conclusion.caveats.join(' · ')}</p>}
      {!!report.conclusion.actions?.length && <p className="text-[11px] text-slate-600"><span className="font-medium">Nên làm tiếp:</span> {report.conclusion.actions.join(' · ')}</p>}</section>}
    {onFollowUp && <FollowUpChips items={report.follow_up_questions} onPick={onFollowUp} disabled={editing} />}
    <p className="text-[11px] text-slate-400">Chi tiết kiểm chứng, nguồn và SQL nằm ở các tab bên trên; báo cáo chỉ hiển thị góc nhìn gắn với yêu cầu của bạn.</p>
    </div>}
    {tab === 'verification' && <div id="report-panel-verification" role="tabpanel" aria-labelledby="report-tab-verification"><VerificationPanel report={report} /></div>}
    {tab === 'data' && <div id="report-panel-data" role="tabpanel" aria-labelledby="report-tab-data" className="space-y-5">
    {!!results.length && <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
      <div className="flex justify-between gap-3"><h3 className="text-sm font-semibold text-slate-900">Bảng dữ liệu đối chiếu</h3><span className="text-xs text-slate-400">{results.length} phần phân tích</span></div>
      <div role="tablist" aria-label="Bảng kết quả phân tích" className="flex flex-wrap gap-2">{results.map(([id], index) => {
        const op = report.analysis_explanation?.find((o: any) => o.query_id === id);
        return <button key={id} role="tab" aria-selected={activeResult?.[0] === id} onClick={() => setResultId(id)} className={`rounded-lg px-3 py-2 text-xs border ${activeResult?.[0] === id ? 'bg-blue-50 text-blue-700 border-blue-200' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{op ? `${(op.metrics || []).map((m: any) => m.label).join(' · ') || op.lens_label || 'Chi tiết'} — ${op.granularity ? 'Theo ' + ({day:'ngày',week:'tuần',month:'tháng'} as any)[op.granularity] : op.dimensions?.join(' · ') || 'Toàn phạm vi'}` : `Bảng ${index+1}`}</button>;
      })}</div>
      {activeResult && <div role="tabpanel"><AnalystResultTable key={activeResult[0]} result={activeResult[1]} valueLabels={valueLabels} sessionId={report.session_id} queryId={activeResult[0]} title={report.analysis_explanation?.find((o: any) => o.query_id === activeResult[0])?.lens_label} /></div>}
    </section>}
    {sql && <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">SQL do máy chủ biên dịch (read-only)</summary><pre className="mt-3 bg-slate-900 text-slate-200 p-4 rounded-xl text-xs overflow-auto">{sql}</pre></details>}
    <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-700">Diễn giải đầy đủ</summary><div className="text-sm text-slate-600 leading-relaxed mt-4"><p>{report.executive_summary}</p><AnalystOptionalNarrative report={report} /></div></details>
    <AnalystEvidence report={report} />
    </div>}
    {tab === 'export' && <div id="report-panel-export" role="tabpanel" aria-labelledby="report-tab-export" className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3 text-xs text-slate-600">
      <p>Bản Word gồm câu hỏi, phạm vi, thời gian, KPI, nhận định có bằng chứng, biểu đồ liên quan kèm nhận định và các giới hạn; chi tiết kiểm chứng nằm ở phụ lục.</p>
      <p>Báo cáo lưu kèm dấu vân tay danh mục, phiên bản kiểm chứng, định nghĩa chỉ số và ánh xạ biểu đồ → yêu cầu để xem lại về sau.</p>
      <div className="flex flex-wrap gap-2">{onSave && <button type="button" onClick={onSave} className="rounded-lg bg-slate-900 px-3 py-2 font-semibold text-white">Lưu báo cáo</button>}
        {onExport && <button type="button" onClick={onExport} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700">Xem & xuất Word</button>}</div>
    </div>}
    {inspect && createPortal(<div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30" onClick={() => setInspect(null)}>
      <aside role="dialog" aria-modal="true" aria-label={`Nhóm ${inspect.row.label}`} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setInspect(null);
          if (event.key === 'Tab') {
            const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], summary, input, select, [tabindex="0"]'));
            const first = items[0], last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          } }} className="w-full max-w-xl bg-white p-6 shadow-xl overflow-y-auto">
        <button autoFocus onClick={() => setInspect(null)} className="float-right rounded-lg border px-3 py-1">Đóng nhóm</button>
        <h3 className="text-lg font-semibold">{inspect.row.label}</h3>
        <p className="mt-2 text-sm text-slate-600">{inspect.chart.title} · {inspect.chart.unit}</p>
        <p className="mt-2 text-xs text-slate-500">Dữ liệu nhóm từ kết quả báo cáo đã duyệt. Tổng của báo cáo giữ nguyên.</p>
        {!inspectPage && !inspectError && <p role="status" className="mt-4">Đang mở dữ liệu nhóm…</p>}
        {inspectError && <p role="alert" className="mt-4 text-red-700">{inspectError}</p>}
        {inspectPage && <><p className="mt-3 text-xs text-slate-500">{inspectPage.total_rows} dòng trong nhóm · Phiên bản {inspectPage.revision}</p><div className="mt-4 overflow-x-auto"><table className="text-xs"><thead><tr>{inspectPage.columns.map((column: string) => <th key={column} className="p-2 text-left">{inspectLabels[column] || column}</th>)}</tr></thead><tbody>{inspectPage.rows.map((row: any, index: number) => <tr key={index}>{inspectPage.columns.map((column: string) => <td key={column} className="p-2">{String(row[column] ?? 'Chưa có giá trị')}</td>)}</tr>)}</tbody></table></div>
          <details className="mt-4 text-xs text-slate-500"><summary>Nguồn đối chiếu</summary><p className="break-all">Artifact: {inspectPage.artifact_id}</p><p className="break-all">Kế hoạch: {inspectPage.plan_fingerprint}</p></details></>}
        {onGroupAnalysis && groupDraft && <div className="mt-5 border-t border-slate-200 pt-4 text-xs text-slate-600">
          <p>Mở yêu cầu mới với đúng nhóm và kỳ này. Bạn kiểm tra phạm vi trước khi bấm Phân tích; hệ thống sẽ tính lại từ nguồn.</p>
          <button disabled={editing} onClick={() => { onGroupAnalysis(groupDraft); setInspect(null); }} className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 font-semibold text-blue-800">Phân tích riêng nhóm</button>
        </div>}
      </aside>
    </div>, document.body)}
  </div>;
};

export const AnalystResultTable: React.FC<{ result: any; title?: string; sessionId?: string; queryId?: string; valueLabels?: Record<string, any[]> }> = ({ result, title, sessionId, queryId, valueLabels = {} }) => {
  const cellLabel = (column: string, value: any) => valueLabels[column]?.find((v: any) => String(v.value) === String(Number(value)))?.label;
  const [page, setPage] = useState(1), [search, setSearch] = useState('');
  const [remote, setRemote] = useState<any>(null), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [dimension, setDimension] = useState(''), [value, setValue] = useState('');
  const paged = Boolean(sessionId && queryId && result.artifact_ref && result.total_rows > (result.rows?.length || 0));
  const allRows = remote?.rows || result.rows || [];
  const totalRows = remote?.total_rows ?? result.total_rows ?? allRows.length;
  const load = async (offset: number) => {
    if (!sessionId || !queryId || loading) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ offset: String(offset), limit: '50' });
      if (dimension && value) { params.set('dimension', dimension); params.set('value', value); }
      const response = await fetch(`/api/ai/sessions/${encodeURIComponent(sessionId)}/results/${encodeURIComponent(queryId)}?${params}`, { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Chưa tải được trang kết quả.');
      if (data.artifact_id !== result.artifact_ref.artifact_id) throw new Error('Báo cáo đã thay đổi; hãy mở lại kết quả hiện tại.');
      setRemote(data); setPage(1);
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  };
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
    <div className="flex gap-2"><input aria-label={`Tìm trong bảng ${title || 'kết quả'}`} placeholder="Tìm trong phần hiển thị…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="min-w-0 flex-1 rounded-lg border border-slate-200 p-2 text-xs" /><button onClick={download} className="rounded-lg border border-slate-200 px-3 text-xs text-slate-600">{totalRows > allRows.length ? 'Tải CSV phần hiển thị' : 'Tải CSV đầy đủ'}</button></div>
    {result.artifact_ref && <p className="text-xs text-slate-500">Hiển thị {allRows.length}/{totalRows} nhóm. Các chỉ số và mẫu số dùng toàn bộ phạm vi phân tích.</p>}
    {paged && <div className="flex flex-wrap gap-2 text-xs"><select aria-label="Chiều xem chi tiết" value={dimension} onChange={e => setDimension(e.target.value)}><option value="">Toàn bộ nhóm</option>{(result.artifact_ref.provenance?.dimensions || []).map((d: string) => <option key={d} value={d}>{result.column_labels?.[d] || d}</option>)}</select><input aria-label="Giá trị nhóm" value={value} onChange={e => setValue(e.target.value)} placeholder="Giá trị hoặc mã nhóm" /><button disabled={loading} onClick={() => load(0)}>Xem nhóm</button><button disabled={loading || !(remote?.offset > 0)} onClick={() => load(Math.max(0, remote.offset - 50))}>Phần trước</button><button disabled={loading || (remote ? remote.next_offset == null : allRows.length >= totalRows)} onClick={() => load(remote?.next_offset ?? allRows.length)}>Xem thêm</button>{loading && <span>Đang tải…</span>}</div>}
    {error && <p role="alert" className="text-xs text-amber-700">{error}</p>}
    {result.as_of && <p className="text-xs text-slate-500">Dữ liệu quan sát lúc {result.as_of}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-xs">
      <thead><tr>{result.columns.map((column: string) => <th className="p-2" key={column}>{result.column_labels?.[column] || 'Trường dữ liệu'}</th>)}</tr></thead>
      <tbody>{rows.slice((activePage - 1) * pageSize, activePage * pageSize).map((row: any, index: number) => <tr key={index}>{result.columns.map((column: string) => <td className="p-2 border-t border-slate-100" key={column}>{row[column] == null ? '—' : cellLabel(column, row[column]) ?? (typeof row[column] === 'number' ? row[column].toLocaleString('vi-VN', { maximumFractionDigits: 2 }) : businessCategory(row[column]))}</td>)}</tr>)}</tbody>
    </table></div>
    {!rows.length && <p className="text-slate-500 text-xs">Không có dữ liệu trong phạm vi này.</p>}
    <div className="flex items-center gap-3 text-xs text-slate-600">
      <span>{rows.length} dòng đã kiểm chứng · Trang {activePage}/{pages}</span>
      {pages > 1 && <><button disabled={activePage === 1} onClick={() => setPage(activePage - 1)}>Trang trước</button><button disabled={activePage === pages} onClick={() => setPage(activePage + 1)}>Trang sau</button></>}
    </div>
  </section>;
};

export const AnalystPlanningSummary: React.FC<{ diagnostics?: any }> = ({ diagnostics }) => {
  if (!['one_shot','hybrid_verifiable'].includes(diagnostics?.planning_mode)) return null;
  const omitted = Number.isInteger(diagnostics.omitted_supporting_operation_count) ? diagnostics.omitted_supporting_operation_count : 0;
  return <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-1">
    <p>AI đã lập kế hoạch. Bạn xác nhận phạm vi trước khi tạo báo cáo.</p>
    {diagnostics.analysis_depth === 'deep' && <p>Phân tích sâu: mục tiêu 4–6 góc nhìn hữu ích theo dữ liệu và phạm vi đã chọn.</p>}
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
      </div>
    </div>
    <button onClick={onOpen} className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-all shadow-xs cursor-pointer self-start sm:self-auto">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
      Xem báo cáo
    </button>
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
