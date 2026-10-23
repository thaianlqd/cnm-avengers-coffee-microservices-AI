import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnalystChart } from '../Charts';
import { DashboardChartGrid, type ChartGridPlacement } from '../DashboardChartGrid';
import { chartAccent, conciseChartTitle, dashboardCharts, dashboardPrimaryCharts, dashboardChartTabs, dashboardHighlights, dashboardFindings, initialChartType, chartExplanation, businessCategory , scopeChip } from '../../utils/analystDashboardLayout.mjs';
import { formatChartValue } from '../../utils/aiChartConfig.mjs';
import { analysisChartGroups, analysisPlanLabel } from '../../utils/analysisPresentation.mjs';
import { groupDifference, kpiStrip, missionTabs, orderChartsByMission, reportContext } from '../../utils/workspacePresentation.mjs';
import { inspectedGroupDraft } from '../../utils/missionWorkspace.mjs';
import { coverageSummary, lensBadge } from '../../utils/analysisCoverage.mjs';
import { KpiStrip } from '../workspace/KpiStrip';
import { FollowUpChips } from '../workspace/FollowUpChips';
import { ForecastPanel } from '../ForecastPanel';
import { ChartInsight, ChartSource } from './ChartInsight';
import { ChartViewControls } from './ChartViewControls';
import { activeViewChart, defaultViewState, reportWithViewChoice, memberReportSelection } from '../../utils/chartViewModes.mjs';
import { VerificationPanel } from './VerificationPanel';
import { queueWorkspaceFilter, workspaceRevisionInput, workspaceRevisionController } from '../../utils/workspaceInteraction.mjs';

const WorkspaceFilters: React.FC<{report: any; onPublish: (report: any) => void; selection: any; onBusy:(busy:boolean)=>void}> = ({report, onPublish, selection, onBusy}) => {
  const applied = report.interaction_state || {filters: [], drill_path: []};
  const [filters, setFilters] = useState<any[]>(applied.filters);
  const [drill, setDrill] = useState<any[]>(applied.drill_path);
  const [depth, setDepth] = useState(report.analysis_breadth);
  const [chartId, setChartId] = useState('');
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const controller = useRef(workspaceRevisionController());
  useEffect(()=>{onBusy(busy);},[busy,onBusy]);
  useEffect(() => {
    controller.current.invalidate(); setBusy(false); setError('');
    setFilters(applied.filters); setDrill(applied.drill_path); setDepth(report.analysis_breadth); setChartId(''); setChoice('');
    return () => controller.current.invalidate();
  }, [report.session_id, report.revision]);
  const entries = report.interaction_contract.charts || [];
  useEffect(() => { if (selection) setFilters(previous=>queueWorkspaceFilter(previous,selection)); }, [selection]);
  const entry = entries.find((c: any) => c.chart_id === chartId);
  const selected = entry?.options[Number(choice)];
  const dirty = JSON.stringify([filters,drill,depth]) !== JSON.stringify([applied.filters,applied.drill_path,report.analysis_breadth]);
  const apply = async (refresh = false) => {
    setError(''); setBusy(true);
    try {
      await controller.current.apply(workspaceRevisionInput(report, refresh ? applied.filters : filters, refresh ? applied.drill_path : drill,
        refresh ? report.analysis_breadth : depth, refresh), async (input, signal) => {
        const response = await fetch('/api/ai/workspace-revision', {method:'POST', credentials:'same-origin', signal,
          headers:{'Content-Type':'application/json'}, body:JSON.stringify(input)});
        const data = await response.json();
        if (!response.ok || data.status !== 'success') throw new Error(data.message || data.detail || 'Chưa áp dụng được bộ lọc.');
        return data;
      }, onPublish);
    } catch (e: any) { if (e.name !== 'AbortError') setError(e.message); }
    finally { setBusy(false); }
  };
  return <section data-workspace-filters aria-label="Bộ lọc tương tác" className="rounded-xl border bg-white p-3 space-y-2 text-xs min-w-0">
    <p data-applied-filters>Đã áp dụng: {applied.filters.length} bộ lọc · {applied.drill_path.length} cấp chi tiết · revision {report.revision}</p>
    <div className="flex flex-wrap items-end gap-2">
      <label>Chiều phân tích<select aria-label="Chiều lọc biểu đồ" disabled={busy} value={chartId} onChange={e=>{setChartId(e.target.value);setChoice('');}} className="block max-w-full w-52 border rounded-lg p-2">
        <option value="">Chọn chiều</option>{entries.map((c:any)=><option key={c.chart_id} value={c.chart_id}>{c.label}{c.selection_behavior !== 'population_filter' ? ' · chỉ xem' : ''}</option>)}</select></label>
      <label>Giá trị<select aria-label="Giá trị lọc biểu đồ" value={choice} disabled={busy || !entry || entry.selection_behavior !== 'population_filter'} onChange={e=>setChoice(e.target.value)} className="block max-w-full w-52 border rounded-lg p-2">
        <option value="">Chọn nhóm</option>{entry?.options.map((o:any,i:number)=><option key={i} value={String(i)}>{o.label}</option>)}</select></label>
      <button type="button" disabled={!selected || choice === '' || busy} onClick={()=>{setFilters(queueWorkspaceFilter(filters,selected.selection));setChoice('');}} className="border rounded-lg p-2 disabled:opacity-50">Thêm lọc chờ</button>
      <button type="button" disabled={!selected || choice === '' || !entry?.next_levels.length || busy} onClick={()=>{setDrill([...drill,{selection:selected.selection,target_dimension_id:entry.next_levels[0]}]);setChoice('');}} className="border rounded-lg p-2 disabled:opacity-50">Đi sâu một cấp</button>
      <label>Mức phân tích<select aria-label="Mức phân tích báo cáo" disabled={busy} value={depth} onChange={e=>setDepth(e.target.value)} className="block border rounded-lg p-2"><option value="focused">Tập trung</option><option value="deep">Sâu</option><option value="comprehensive">Toàn diện</option></select></label>
    </div>
    {entry && entry.selection_behavior !== 'population_filter' && <p role="status">Chiều này chỉ dùng xem/đối chiếu; không thể lọc quần thể của mọi chỉ số trong báo cáo.</p>}
    {entry && !entry.next_levels.length && <p>Cấp hiện tại không có drilldown phù hợp.</p>}
    {entry?.options_truncated && <p>Danh sách chọn chỉ hiển thị một phần nhóm; bảng kết quả giữ toàn bộ dữ liệu.</p>}
    <nav aria-label="Đường dẫn chi tiết" className="flex flex-wrap items-center gap-2"><span>Phạm vi gốc</span>{drill.map((d:any,i:number)=><span key={i}>› {d.selection.values.map((v:any)=>String(v.value)).join(', ')} → {d.target_dimension_id}</span>)}
      <button type="button" disabled={!drill.length || busy} onClick={()=>setDrill(drill.slice(0,-1))} className="underline disabled:opacity-50">Quay lại một cấp</button>
      <button type="button" disabled={!drill.length || busy} onClick={()=>setDrill([])} className="underline disabled:opacity-50">Đặt lại đường dẫn</button>
    </nav>
    <div data-pending-filters className="flex flex-wrap gap-2 items-center"><span>{dirty ? 'Bộ lọc chờ áp dụng' : 'Bộ lọc đang hiển thị'}</span>{filters.map((f:any,i:number)=><button type="button" disabled={busy} key={i} aria-label={`Xóa lọc ${f.dimension_id}`} onClick={()=>setFilters(filters.filter((_,j)=>j!==i))} className="border rounded-full px-2 py-1 break-all">{f.dimension_id}: {f.values.map((v:any)=>String(v.value)).join(', ')} ×</button>)}</div>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!dirty || busy} onClick={()=>void apply()} className="bg-emerald-800 text-white rounded-lg px-3 py-2 disabled:opacity-50">Áp dụng bộ lọc</button>
      <button type="button" disabled={!dirty || busy} onClick={()=>{setFilters(applied.filters);setDrill(applied.drill_path);setDepth(report.analysis_breadth);}} className="border rounded-lg p-2 disabled:opacity-50">Bỏ thay đổi chờ</button>
      <button type="button" disabled={busy} onClick={()=>{setFilters([]);setDrill([]);}} className="border rounded-lg p-2">Xóa toàn bộ lọc</button>
      <button type="button" disabled={busy || dirty} onClick={()=>void apply(true)} className="border rounded-lg p-2 disabled:opacity-50">Làm mới dữ liệu</button>
      {busy && <button type="button" onClick={()=>{controller.current.invalidate();setBusy(false);}} className="border rounded-lg p-2">Dừng chờ kết quả</button>}
    </div>
    {busy && <p data-report-stale role="status">Đang tạo revision mới. Toàn bộ số liệu bên dưới vẫn thuộc revision {report.revision} đã áp dụng.</p>}
    {error && <p role="alert" className="text-amber-800">{error}</p>}
  </section>;
};

/** "Xem dữ liệu": rows rendered only once opened (keeps paged charts honest). */
const ChartData: React.FC<{ chart: any }> = ({ chart }) => {
  const [open, setOpen] = useState(false);
  return <details className="text-xs text-slate-600" onToggle={e => setOpen(e.currentTarget.open)}><summary data-chart-data className="cursor-pointer">Xem dữ liệu</summary>
    {open && <table className="mt-1 text-[11px]">{chart.series?.length > 0 && <thead><tr><th className="pr-3 text-left font-medium">{chart.x_label || ''}</th>{chart.series.map((s: any) => <th key={s.key} className="pr-3 text-right font-medium">{s.label}</th>)}</tr></thead>}<tbody>{chart.data.slice(0, 50).map((r: any, i: number) => <tr key={i}><td className="pr-3 py-0.5">{businessCategory(r.label)}</td>{chart.series?.length > 0 ? chart.series.map((s: any) => <td key={s.key} className="pr-3 text-right tabular-nums">{r[s.key] == null ? '—' : formatChartValue(r[s.key], chart.unit ? ` ${chart.unit}` : '')}</td>) : <td className="text-right tabular-nums">{formatChartValue(r.value, chart.unit ? ` ${chart.unit}` : '')}</td>}</tr>)}</tbody></table>}
  </details>;
};

const ChartCard: React.FC<{ chart: any; placement: ChartGridPlacement; editing?: boolean; onChartTypeChange?: (id: string, type: string) => void; definition?: string; onInspect?: (chart: any, row: any) => void; interaction?: any; memberInteraction?: any; onViewChange?: (id: string, state: any) => void; onSelect?: (selection:any)=>void }> = ({ chart: reportChart, placement, editing, onChartTypeChange, definition, onInspect, interaction, memberInteraction, onViewChange, onSelect }) => {
  // Local view state (Chỉ biểu đồ này): selects a server-verified variant; data, caption and insight switch together.
  const [view, setView] = useState<any>(() => defaultViewState(reportChart.view_modes, reportChart.view_ref));
  useEffect(() => setView(defaultViewState(reportChart.view_modes, reportChart.view_ref)), [reportChart.id, reportChart.view_ref, reportChart.view_modes?.default_variant]);
  const chart = reportChart.view_modes ? activeViewChart(reportChart, view) : reportChart;
  const memberSelection = memberReportSelection(reportChart.view_modes, view?.member, memberInteraction);
  const [type, setType] = useState(initialChartType(chart));
  useEffect(() => setType(initialChartType(chart)), [chart.id, chart.chart_type, chart.query_id, chart.view_ref]);
  const accent = chartAccent(chart);
  // Two-group comparison: deterministic difference from the verified chart rows.
  const difference = !chart.series && ['bar', 'horizontal_bar'].includes(type) && chart.data?.length === 2 && !['Top N', 'Bottom N'].includes(chart.selection) ? groupDifference(chart.data, 'label', 'value', chart.unit) : null;
  const types = chart.value_transform ? [] : ['bar', 'horizontal_bar'].includes(type) ? ['horizontal_bar', 'bar'] : ['line', 'area'].includes(type) ? ['area', 'line'] : [];
  return <article data-dashboard-chart data-chart-type={type} data-chart-rows={chart.data?.length||0} data-chart-row={placement.row} data-chart-span={placement.span}
    style={{ '--chart-span': Math.round(placement.span * 5), '--chart-height': `${placement.height}px` } as React.CSSProperties}
    className="dashboard-chart-card bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 min-w-0 w-full flex flex-col shadow-sm shadow-slate-100/40">
    <div data-chart-header className="flex items-start justify-between gap-3 mb-2">
      <div className="min-w-0"><div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: accent }} /><h5 className="text-xs font-semibold text-slate-900">{conciseChartTitle(chart)}</h5></div>
        <p className="text-[11px] text-slate-500 mt-1">{chart.x_label || chart.lens_label || chart.domain_label || 'Trong phạm vi đã chọn'}{chart.unit ? ` · ${chart.unit}` : ''}</p>
        {difference && <p data-group-difference className="text-xs font-medium text-slate-700 mt-1.5">{difference.text}</p>}
        {scopeChip(chart) && <span data-scope-chip={scopeChip(chart)!.tone} className={`inline-block mt-2 mr-1 rounded-full px-2 py-1 text-[10px] font-semibold ${scopeChip(chart)!.tone === 'cohort' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800'}`}>{scopeChip(chart)!.text}</span>}
        {chart.role === 'supporting' && <span data-lens-role={chart.analysis_lens_role || undefined} className="inline-block mt-2 rounded-full bg-teal-50 px-2 py-1 text-[10px] font-medium text-teal-700">{lensBadge(chart) ? `Góc nhìn ${lensBadge(chart)!.toLowerCase()}` : 'Góc nhìn bổ sung'}</span>}
      </div>
      <details className="relative shrink-0 text-xs"><summary aria-label={`Tùy chọn ${conciseChartTitle(chart)}`} className="cursor-pointer list-none rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-50">•••</summary>
        <div className="absolute right-0 z-10 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg space-y-2">
          {(chart.analysis_lens_question || chart.purpose) && <p className="text-slate-500 leading-relaxed">{chart.analysis_lens_question || chart.purpose}</p>}
          {types.length > 0 && <label className="block text-slate-600">Cách trình bày<select aria-label={`Cách trình bày: ${chart.title}`} value={type} disabled={editing}
            onChange={e => { if(onChartTypeChange)onChartTypeChange(chart.id,e.target.value);else setType(e.target.value); }} className="mt-1 w-full border border-slate-200 rounded-lg p-2">{types.map(t => <option key={t} value={t}>{analysisPlanLabel({ chart_type: t })}</option>)}</select></label>}
        </div>
      </details>
    </div>
    {reportChart.view_modes && view && <ChartViewControls chart={reportChart} state={view} onChange={state => { setView(state); onViewChange?.(reportChart.id, state); }} disabled={editing}
      onApplyReport={memberSelection && onSelect ? () => onSelect(memberSelection) : undefined} />}
    {chart.ranking_census?.note && <p data-ranking-ties role="note" className="my-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">{chart.ranking_census.note}</p>}
    {chart.data?.some((r: any) => r.denominator != null) && <details data-chart-exposure open={Boolean(chart.ranking_census)} className="my-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600">
      <summary className="cursor-pointer font-medium">Tử số / mẫu số theo từng đối tượng</summary>
      <p className="mt-1">Cùng tỷ lệ có thể dựa trên số mẫu khác nhau. Tỷ lệ quan sát chưa chứng minh độ ổn định hoặc khác biệt thống kê.</p>
      <div className="max-h-52 overflow-auto"><table className="mt-1 w-full"><thead><tr><th className="text-left">Đối tượng</th><th className="text-right">Giá trị</th><th className="text-right">Tử số / mẫu số</th></tr></thead><tbody>{chart.data.filter((r: any) => r.denominator != null).map((r: any, i: number) => <tr key={i}><td className="py-1 pr-3 break-all">{businessCategory(r.label)}</td><td className="text-right px-2 tabular-nums">{formatChartValue(r.value, chart.unit ? ` ${chart.unit}` : '')}</td><td className="text-right tabular-nums">{r.numerator == null ? '—' : formatChartValue(r.numerator)} / {formatChartValue(r.denominator)}</td></tr>)}</tbody></table></div>
    </details>}
    <div data-chart-viewport className="dashboard-chart-viewport flex flex-col justify-center min-w-0"><div className="w-full"><AnalystChart chart={{ ...chart, chart_type: type, accent_color: accent }} onInspect={onInspect ? row => onInspect(chart, row) : undefined} /></div></div>
    <div data-chart-footer className="min-w-0"><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-2">
    {interaction && onSelect && <select aria-label={`Lọc nhóm từ ${conciseChartTitle(chart)}`} value="" disabled={editing || interaction.selection_behavior!=='population_filter'}
      onChange={e=>{if(e.target.value!=='')onSelect(interaction.options[Number(e.target.value)].selection);}} className="max-w-full min-w-0 rounded border p-1 text-xs">
      <option value="">{interaction.selection_behavior==='population_filter' ? 'Chọn nhóm để thêm lọc chờ' : 'Chỉ xem · không lọc quần thể'}</option>
      {interaction.options.map((o:any,i:number)=><option key={i} value={String(i)}>{o.label}</option>)}</select>}
    <details data-chart-details className="text-[11px] text-slate-600 open:w-full"><summary className="cursor-pointer font-medium focus-visible:outline-blue-500">Chi tiết biểu đồ</summary>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        <details className="text-xs text-slate-600 leading-relaxed"><summary data-chart-explanation className="cursor-pointer">Cách đọc biểu đồ</summary><p className="mt-1 max-w-md">{chartExplanation({ ...chart, chart_type: type })}</p></details>
        {definition && <details className="text-xs text-slate-600 leading-relaxed"><summary data-metric-definition className="cursor-pointer">Định nghĩa chỉ số</summary><p className="mt-1 max-w-md">{definition}</p></details>}
        {!!chart.data?.length && <ChartData chart={chart} />}
        <ChartSource chart={chart} />
        </div>
    {chart.time_note && <p className="text-[11px] leading-relaxed text-amber-700 mt-2">{chart.time_note}</p>}
    {chart.ranking_note && <p className="text-[11px] leading-relaxed text-slate-600 mt-2">{chart.ranking_note}</p>}
    {chart.value_transform === 'contribution_share' && chart.evidence_refs?.[0] && <a className="text-xs text-blue-600 mt-2" href={`#evidence-${encodeURIComponent(chart.evidence_refs[0])}`}>Đối chiếu tử số và mẫu số ↗</a>}
    {chart.grouped_categories > 0 && <p className="text-[11px] leading-relaxed text-slate-500 mt-2">6 nhóm lớn nhất và Khác ({chart.grouped_categories} nhóm). Tổng và tỷ trọng tính trên toàn bộ {chart.population_count} nhóm; xem từng nhóm trong bảng dữ liệu.</p>}

    </details>
    <ChartInsight insight={chart.insight} scopeNote={chart.scope_note} />
    </div>
    {(chart.selection === 'Top N' || chart.selection === 'Bottom N' || chart.selection === 'limited' || chart.selection === 'display_subset') && <p className="text-[10px] text-slate-500 mt-2">
      {chart.selection === 'Top N' || chart.selection === 'Bottom N' ? `Tập ${chart.ranking_direction === 'ASC' || chart.selection === 'Bottom N' ? 'Bottom' : 'Top'} N được chọn; không phải cơ cấu toàn bộ.` : chart.selection === 'limited' ? 'Kết quả có giới hạn số dòng.' : `${chart.displayed_count}/${chart.population_count} nhóm · Bảng kết quả giữ đầy đủ; số liệu phân tích dùng đầy đủ các nhóm.`}
    </p>}
    </div>
  </article>;
};

export const AnalystViews: React.FC<{ charts?: any[]; onChartTypeChange?: (id: string, type: string) => void; editing?: boolean; compact?: boolean; dashboardLayout?: boolean; definitions?: Record<string, string>; onInspect?: (chart: any, row: any) => void; interactions?:any[]; onViewChange?: (id: string, state: any) => void; onSelect?:(selection:any)=>void }> = ({ charts = [], onChartTypeChange, editing = false, compact = false, definitions = {}, onInspect, interactions, onViewChange, onSelect }) => {
  const [columns, setColumns] = useState(3);
  const renderGrid = (items: any[]) => <DashboardChartGrid charts={items} maxColumns={columns}>
    {(chart, placement) => <ChartCard key={chart.id || placement.index} chart={chart} placement={placement} editing={editing} onChartTypeChange={onChartTypeChange} definition={definitions[chart.metric]} onViewChange={onViewChange} onInspect={onInspect} interaction={interactions?.find(c=>c.chart_id===chart.id)} memberInteraction={chart.view_modes ? interactions?.find(c=>c.dimension_id===(chart.view_modes.member_key_dimension || chart.view_modes.axis_dimension_id) && c.selection_behavior==='population_filter') : undefined} onSelect={onSelect} />}
  </DashboardChartGrid>;
  return <div className="space-y-3" data-analyst-views>
    {charts.length > 1 && <nav aria-label="Bố cục biểu đồ" className="flex flex-wrap items-center justify-end gap-1 text-[11px] text-slate-500"><span className="mr-2">Bố cục</span>{[[3,'Tự động · 2–3 ô'],[2,'Hai ô mỗi hàng'],[1,'Toàn chiều rộng']].map(([value,label])=><button key={value} type="button" aria-pressed={columns===value} onClick={()=>setColumns(Number(value))} className={`rounded-lg border px-2.5 py-1.5 ${columns===value?'border-blue-200 bg-blue-50 text-blue-700':'border-slate-200 bg-white'}`}>{label}</button>)}</nav>}
    {compact ? renderGrid(charts) : <div className="space-y-3">
    {analysisChartGroups(charts).map(group => <section key={group.role} aria-label={group.title} className="space-y-3">
      <h4 className="text-xs font-semibold text-slate-500">{group.title}</h4>
      {renderGrid(group.charts)}
    </section>)}
  </div>}
  </div>;
};

const REPORT_TABS = [['report', 'Báo cáo'], ['verification', 'Kiểm chứng & nguồn'], ['data', 'Dữ liệu / SQL'], ['export', 'Lưu & xuất']] as const;

/**
 * V3.2 report: the business report is clean (answer → KPIs → relevant charts →
 * limitations → next questions); verification/provenance, data/SQL and
 * save/export live in their own tabs.
 */
export const ReportWorkspace: React.FC<{ report: any; editing?: boolean; onChartTypeChange?: (id: string, type: string) => void; capabilities?: any; onFollowUp?: (question: string) => void; onGroupAnalysis?: (draft: any) => void;
  geographicView?: React.ReactNode; initialTab?: 'report' | 'verification' | 'data' | 'export'; onSave?: () => void; onExport?: () => void; onReportChange?: (report: any) => void }> = ({ report, editing, onChartTypeChange, capabilities, onFollowUp, onGroupAnalysis, initialTab = 'report', onSave, onExport, onReportChange, geographicView }) => {
  const [showAll, setShowAll] = useState(false);
  const [view, setView] = useState('all');
  const [tab, setTab] = useState<string>(initialTab);
  const [selection, setSelection] = useState<any>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
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
  const curated = Boolean(report.provenance?.dashboard_template);
  const ordered = orderChartsByMission(selected.charts, report.mission_layout);
  if (curated) ordered.sort((a: any, b: any) => Number(['area','line','multi_line'].includes(b.chart_type)) - Number(['area','line','multi_line'].includes(a.chart_type)));
  const primary = dashboardPrimaryCharts(ordered);
  const highlights = dashboardHighlights(report), findings = dashboardFindings(report).slice(0, 3);
  const results = Object.entries(report.result_sets || {});
  const activeResult = results.find(([id]) => id === resultId) || results.find(([,data]: any) => (data.total_rows ?? data.rows?.length) > 1) || results[0];
  const forecasts = (report.forecasts || []).length > 0;
  const tabs = missionTabs(dashboardChartTabs(ordered), report.mission_layout, { forecast: forecasts });
  const activeTab = tabs.find(t => t.id === view) || tabs[0];

  // FINAL P5: a lens-governed report shows every counted view of the chosen depth in "Tất cả" (no hidden diagnostics).
  const coverage = coverageSummary(report);
  const visibleCharts = view === 'all' ? [...(curated || showAll || coverage ? ordered : primary)] : activeTab.charts;
  const context = reportContext(report, capabilities);
  const definitions: Record<string, string> = Object.fromEntries((report.analysis_explanation || []).flatMap((o: any) => (o.metrics || []).map((m: any) => [m.id, m.business_meaning])));
  const caveats = [...new Set((report.charts || []).flatMap((c: any) => c.insight?.caveats || []))].slice(0, 4) as string[];
  const sql = report.sql ? Object.entries(report.sql).map(([name, text]) => `-- ${name}\n${text}`).join('\n\n') : report.sql_query;
  return <div className="space-y-3">
    {report.interaction_contract && onReportChange && <fieldset disabled={Boolean(editing)} aria-label="Tương tác báo cáo" className="min-w-0"><WorkspaceFilters report={report} onPublish={onReportChange} selection={selection} onBusy={setWorkspaceBusy} /></fieldset>}
    {report.source_completeness?.status === 'limited' && <p data-source-limitation role="status" className="text-xs text-amber-800">Nguồn chưa chứng minh đầy đủ hoặc đang trễ; số liệu theo snapshot đã ghi nhận, báo cáo chưa hoàn tất về dữ liệu.</p>}
    {report.source_completeness?.status === 'unknown' && <p data-source-limitation role="status" className="text-xs text-amber-800">Độ đầy đủ dữ liệu nguồn chưa được chứng nhận; hoàn tất phân tích không chứng minh nguồn đầy đủ.</p>}
    {report.source_completeness?.status === 'reconciled' && <p data-source-verified="reconciled" role="status" className="text-xs text-slate-600">Nguồn đã đối soát đầy đủ với hệ thống gốc ở lần đối soát toàn bộ gần nhất; thay đổi sau đó được nạp tăng dần.</p>}
    {report.source_completeness?.status === 'complete' && <p data-source-verified="complete" role="status" className="text-xs text-emerald-800">Nguồn đã đối soát đầy đủ với hệ thống gốc (khớp từng dòng).</p>}
    <section data-report-context className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-600 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
      {context.mission && <p><span className="text-slate-400">Nhiệm vụ:</span> <strong className="text-slate-800">{context.mission}</strong></p>}
      <p><span className="text-slate-400">Phạm vi:</span> {context.scope}</p>
      <p><span className="text-slate-400">Thời gian:</span> {context.time}</p>
      {!!context.sources.length && <p className="truncate" title={context.sources.join(' · ')}><span className="text-slate-400">Nguồn:</span> {context.sources.join(' · ')}</p>}
    </section>
    <div role="tablist" aria-label="Phần báo cáo" className="flex flex-wrap gap-1 border-b border-slate-200">{REPORT_TABS.map(([id, label]) =>
      <button key={id} type="button" role="tab" id={`report-tab-${id}`} aria-selected={tab === id} aria-controls={`report-panel-${id}`} onClick={() => setTab(id)} data-report-tab={id}
        className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${tab === id ? 'border-emerald-500 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div>
    {tab === 'report' && <div id="report-panel-report" role="tabpanel" aria-labelledby="report-tab-report" className="space-y-3">
    <KpiStrip cards={kpiStrip(highlights, report)} />
    <div data-report-notes className="flex flex-wrap gap-2">
    {(report.comparison_frames || []).filter((f: any) => f.selection).map((f: any) => <details key={f.id} data-selection-receipt open className="rounded-xl border border-indigo-200 bg-indigo-50/40 px-3 py-2 text-xs">
      <summary className="cursor-pointer font-medium text-indigo-900">Cách chọn nhóm: {f.selection.summary}</summary>
      <p className="mt-1 text-slate-600">{f.selection.formula}. Mỗi nhóm cần ít nhất {f.selection.min_complete_buckets} kỳ đầy đủ; kỳ chưa đủ ngày không tính.{Object.keys(f.selection.excluded || {}).length ? ` Bị loại: ${Object.entries(f.selection.excluded).map(([k, v]) => `${v} (${({ missing_buckets: 'thiếu kỳ', insufficient_history: 'lịch sử ngắn', non_positive_mean: 'trung bình ≤ 0', non_positive_baseline: 'kỳ đầu ≤ 0' } as any)[k] || k})`).join(', ')}.` : ''}{f.selection.boundary_ties?.length ? ` Đồng hạng ở ngưỡng: ${f.selection.boundary_ties.length} nhóm.` : ''}</p>
      <table className="mt-1 text-[11px]"><thead><tr><th className="pr-3 text-left">{f.axis_label}</th><th className="pr-3 text-right">{f.selection.score_label}</th></tr></thead><tbody>{f.selection.eligible.slice(0, 10).map((e: any) => <tr key={e.key} className={f.selection.selected.includes(e.key) ? 'font-semibold' : ''}><td className="pr-3">{e.label}</td><td className="pr-3 text-right tabular-nums">{e.score.toLocaleString('vi-VN', { maximumFractionDigits: 4 })}</td></tr>)}</tbody></table>
    </details>)}
    {!!report.short_answer?.length && <details data-short-answer className="open:w-full rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-2 text-xs"><summary className="cursor-pointer font-medium text-emerald-900">Trả lời ngắn</summary>
      <ul className="mt-2 space-y-1 text-xs text-slate-700 leading-relaxed">{report.short_answer.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul></details>}

    {report.mission_layout?.caveat && <details className="open:w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><summary className="cursor-pointer font-medium">Lưu ý về phạm vi</summary><p className="mt-2">{report.mission_layout.caveat}</p></details>}
    {!!report.data_warnings?.length && <details className="open:w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"><summary className="cursor-pointer font-medium">{report.data_warnings.length} lưu ý về dữ liệu · Xem chi tiết</summary><ul className="mt-2 space-y-1">{report.data_warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul></details>}

    {!!findings.length && <details className="open:w-full rounded-xl border border-slate-200 bg-white px-3 py-2"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Điểm nổi bật · {findings.length} nhận định</summary><div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 mt-4">{findings.map((f: any, i: number) => <div key={i} className="text-xs text-slate-600 leading-relaxed"><span className="inline-block w-1.5 h-1.5 bg-teal-500 rounded-full mr-2" />{f.text}{f.evidence_id && <a href={`#evidence-${encodeURIComponent(f.evidence_id)}`} className="block text-blue-600 mt-1">Đối chiếu dữ liệu ↗</a>}</div>)}</div></details>}
    </div>
    {report.view_coverage?.some((v:any)=>v.required && v.status==='missing') && <div data-requirement-gaps role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
      {report.view_coverage.filter((v:any)=>v.required && v.status==='satisfied').length}/{report.view_coverage.filter((v:any)=>v.required).length} yêu cầu bằng chứng đã đáp ứng; báo cáo chưa đầy đủ.
      {report.view_coverage.filter((v:any)=>v.required && v.status==='missing').map((v:any,i:number)=><p key={i}>{v.requirement_id}: {v.reason || 'Chưa có bằng chứng phù hợp'}</p>)}
    </div>}
    {geographicView}
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold text-slate-900">Các góc nhìn phân tích <span className="font-normal text-slate-400">· {selected.charts.length} biểu đồ</span></h3>
    {coverage && <details data-analysis-coverage={coverage.tone} className={`text-[11px] rounded-full border px-2 py-1 open:rounded-xl ${coverage.tone === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : coverage.tone === 'gap' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
      <summary className="cursor-pointer">{coverage.label}</summary>
      <div className="mt-2 space-y-1 text-slate-700 max-w-md">
        {coverage.summary && <p>{coverage.summary}</p>}
        <p>{coverage.roles.map(r => `${r.label} ${r.rendered}/${r.target}`).join(' · ')}</p>
        {!!coverage.missing.length && <ul className="space-y-0.5">{coverage.missing.map((m, i) => <li key={i}>• {m}</li>)}</ul>}
        {coverage.origin === 'legacy_auto' && <p className="text-slate-500">Mức phân tích do máy chủ tự chọn vì yêu cầu không gửi mức.</p>}
      </div></details>}
    {tabs.length > 1 && <div role="tablist" aria-label="Góc nhìn biểu đồ" className="flex flex-wrap gap-1">{tabs.map(t => <button key={t.id} id={`chart-tab-${t.id}`} role="tab" aria-selected={activeTab.id === t.id} aria-controls="analysis-chart-panel" onClick={() => setView(t.id)} className={`rounded-lg border px-2 py-1.5 text-[11px] ${activeTab.id === t.id ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>{t.label}{t.id === 'forecast' ? '' : ` · ${t.charts.length}`}</button>)}</div>}
    </div>
    <div id="analysis-chart-panel" role={tabs.length > 1 ? 'tabpanel' : undefined} aria-labelledby={tabs.length > 1 ? `chart-tab-${activeTab.id}` : undefined} className="space-y-4">
    {(view === 'forecast' || (view === 'all' && report.analysis_mission === 'forecast')) && <ForecastPanel forecasts={report.forecasts} coverage={capabilities?.data_coverage} />}
    {view !== 'forecast' && <AnalystViews charts={visibleCharts} compact dashboardLayout={curated} editing={editing || workspaceBusy} onChartTypeChange={onChartTypeChange} definitions={definitions}
      onViewChange={onReportChange ? (id, state) => onReportChange(reportWithViewChoice(report, id, state)) : undefined}
      interactions={onReportChange ? report.interaction_contract?.charts : undefined} onSelect={s=>setSelection({...s})}
      onInspect={(chart, row) => { inspectTrigger.current = document.activeElement as HTMLElement; setInspect({ chart, row }); }} />}
    {view === 'all' && forecasts && report.analysis_mission !== 'forecast' && <ForecastPanel forecasts={report.forecasts} coverage={capabilities?.data_coverage} />}
    </div>
    {!selected.charts.length && !forecasts && <div role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 leading-relaxed">Chưa có biểu đồ phù hợp được kiểm chứng cho kết quả này. Xem bảng dữ liệu trong tab “Dữ liệu / SQL” và mục “Kiểm chứng & nguồn”.</div>}
    {view === 'all' && !curated && !coverage && selected.charts.length > primary.length && <button onClick={() => setShowAll(!showAll)} className="w-full rounded-xl border border-slate-200 py-3 text-xs text-slate-600 hover:bg-white">{showAll ? 'Thu gọn biểu đồ' : `Xem thêm ${selected.charts.length - primary.length} góc nhìn chi tiết`}</button>}
    {!report.view_coverage && <details data-coverage-legacy className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"><summary className="cursor-pointer font-medium">Độ đầy đủ bằng chứng · Chưa đo</summary><p className="mt-2">Báo cáo legacy: Chưa đo độ đầy đủ yêu cầu theo chính sách bằng chứng hiện tại.</p></details>}
    {!!caveats.length && <details data-report-limitations className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600"><summary className="cursor-pointer font-medium text-slate-700">Giới hạn quan trọng</summary><ul className="mt-2 space-y-1">{caveats.map((c, i) => <li key={i}>• {c}</li>)}</ul></details>}
    {report.conclusion?.answer && <details data-conclusion className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"><summary className="cursor-pointer font-medium text-slate-700">Kết luận phân tích</summary><div className="mt-2 space-y-2">
      <p className="text-xs text-slate-700 leading-relaxed">{report.conclusion.answer}</p>
      {!!report.conclusion.findings?.length && <ul className="space-y-1 text-xs text-slate-700">{report.conclusion.findings.map((f: any, i: number) => <li key={i} data-evidence-id={f.evidence_id}>• {f.statement}</li>)}</ul>}
      {!!report.conclusion.view_findings?.length && <ul data-view-findings className="space-y-1 text-xs text-slate-700">{report.conclusion.view_findings.map((f: any, i: number) => <li key={i} data-lens-id={f.lens_id}>• {f.statement}{f.question && <span className="block text-[11px] text-slate-400">Góc nhìn: {f.question}</span>}</li>)}</ul>}
      {!!report.conclusion.unanswered?.length && <p data-conclusion-unanswered className="text-[11px] text-rose-700"><span className="font-medium">Chưa trả lời được:</span> {report.conclusion.unanswered.join(' · ')}</p>}
      {!!report.conclusion.caveats?.length && <p className="text-[11px] text-amber-800"><span className="font-medium">Lưu ý:</span> {report.conclusion.caveats.join(' · ')}</p>}
      {!!report.conclusion.actions?.length && <p className="text-[11px] text-slate-600"><span className="font-medium">Nên làm tiếp:</span> {report.conclusion.actions.join(' · ')}</p>}</div></details>}
    {onFollowUp && <FollowUpChips items={report.follow_up_questions} onPick={onFollowUp} disabled={editing} />}
    
    </div>}
    {tab === 'verification' && <div id="report-panel-verification" role="tabpanel" aria-labelledby="report-tab-verification"><VerificationPanel report={report} /></div>}
    {tab === 'data' && <div id="report-panel-data" role="tabpanel" aria-labelledby="report-tab-data" className="space-y-3">
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
      <p>Chế độ xem đã chọn của từng biểu đồ được giữ khi lưu và xuất. KPI và kết luận toàn báo cáo vẫn theo phạm vi báo cáo; bộ lọc cục bộ chỉ đổi biểu đồ tương ứng.</p>
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
    {conclusions.length > 0 && <details className="bg-white rounded-xl border border-slate-200 px-3 py-2"><summary className="cursor-pointer text-xs font-medium">Kết luận phân tích</summary><p className="text-xs text-slate-600 mt-2">{Array.isArray(conclusions) ? conclusions.join(' ') : conclusions}</p></details>}
    {recommendations.length > 0 && <details className="bg-white rounded-xl border border-slate-200 px-3 py-2"><summary className="cursor-pointer text-xs font-medium">Khuyến nghị từ bằng chứng</summary><ul className="text-xs text-slate-600 mt-2 space-y-2">{recommendations.map((r: any, i: number) => <li key={i}>{typeof r === 'string' ? r : r.text || r.recommendation}</li>)}</ul></details>}
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
