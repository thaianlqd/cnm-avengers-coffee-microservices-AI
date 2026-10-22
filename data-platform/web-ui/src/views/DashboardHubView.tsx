import { SearchableSelect } from '../components/SearchableSelect';
import { GeographicReportPanel } from '../components/report/GeographicReportPanel';
import { dashboardTopics, discoveryKinds, discoverDashboards } from '../utils/dashboardDiscovery.mjs';
import { geographicCharts } from '../utils/reportGeography.mjs';
import { PaginatedGrid } from '../components/Pagination';
import React, { useEffect, useRef, useState } from 'react';
import { AnalystDashboard } from '../components/AnalystDashboardSummary';
import { useReportActions } from '../hooks/useReportActions';
import { useAnalysisLifecycle } from '../hooks/useAnalysisLifecycle';
import { jobStages } from '../utils/analysisJobs.mjs';
import { usePlatformStore } from '../store/usePlatformStore';

type Dashboard = { id: string; version: string; title: string; category: string; description: string;
  limitation: string; default_time: string; status: string; panel_count: number; custom?: boolean; source_views: string[]; time_filter_enabled?: boolean; scope_types?: {id: string; label: string; values: (string|number)[]; searchable: boolean}[] };
const statusLabel: Record<string, string> = { healthy: 'Nguồn sẵn sàng', blocked: 'Nguồn cần kiểm tra', degraded: 'Nguồn cập nhật chậm', unknown: 'Chưa xác minh nguồn' };
const themes: Record<string, string> = { 'Kinh doanh': 'bg-emerald-50 text-emerald-800', 'Vận hành': 'bg-sky-50 text-sky-800', 'Tài chính': 'bg-amber-50 text-amber-800', 'Khách hàng': 'bg-violet-50 text-violet-800', 'Nhân sự': 'bg-rose-50 text-rose-800' };

export const DashboardHubView: React.FC = () => {
  const { saveReport, exportDocx: downloadDocx } = useReportActions();
  const { accountJobStorageKey, pendingJob, beginRequest, invalidate, executeJob, clearJob, cancelOwnedJob } = useAnalysisLifecycle('dashboards');
  const [items, setItems] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('Tất cả');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('Tất cả');
  const [sort, setSort] = useState('default');
  const [customOnly, setCustomOnly] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [selected, setSelected] = useState<Dashboard | null>(null);
  const [period, setPeriod] = useState('30d');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [scopeDimension,setScopeDimension] = useState('');
  const [scopeValue,setScopeValue] = useState('');
  const [scopeSearch,setScopeSearch] = useState('');
  const [scopeOptions,setScopeOptions] = useState<{value: string; label: string}[]>([]);
  const [report, setReport] = useState<any>(null);
  const [stage, setStage] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedRef = useRef<Dashboard | null>(null);
  const currentReport = useRef<any>(null);
  const { showToast, setAnalyticsSubTab, setActiveTab, dashboardSearch } = usePlatformStore();
  const externalSearch = useRef(dashboardSearch?.request || 0);
  const cancel = () => { cancelOwnedJob(); setStage(''); };
  useEffect(() => {
    if (!dashboardSearch) return;
    externalSearch.current = dashboardSearch.request;
    cancel(); setSelected(null); selectedRef.current = null; setReport(null); currentReport.current = null;
    setError(''); setSearch(dashboardSearch.text); setCategory('Tất cả'); setKind('Tất cả'); setCustomOnly(false);
  }, [dashboardSearch?.request]);
  const run = async (item: Dashboard, time: string, bounds = { start, end }, recovered?: any, resetScope = false) => {
    if (recovered) invalidate(); else cancel();
    const ticket = beginRequest();
    setError(''); setNotice(''); setReport(null); currentReport.current = null;
    setStage('accepted');
    const record = recovered || { key: crypto.randomUUID(), input: {
      dashboard_id: item.id, dashboard_version: item.version, analysis_depth: 'focused',
      time: time === 'custom' ? { mode: 'custom', start: bounds.start, end: bounds.end } : { mode: time },
      analysis_scope: !resetScope && scopeDimension && scopeValue ? {mode:'selected',filters:[{dimension:scopeDimension,operator:'in',value:[scopeValue]}]} : { mode: 'all', filters: [] } } };
    try {
      const job = await executeJob(record,ticket,value=>setStage(value.state));
      if (!ticket.current()) return;
      clearJob(); setStage('');
      if (job.result?.status === 'success') { setReport(job.result); currentReport.current = job.result; }
      else setError(job.result?.message || (job.state === 'partial_available'
        ? 'Một phần dữ liệu chưa khả dụng. Kiểm tra nguồn trước khi chạy lại dashboard.' : 'Dashboard chưa hoàn tất. Hãy kiểm tra nguồn dữ liệu hoặc thử lại.'));
    } catch (failure: any) {
      if (!ticket.current()) return;
      setStage(''); setError(failure.message || 'Chưa tải được dashboard.');
      // Preserve the same key on a lost response; retry never starts a second job.
      if ([400, 401, 403, 404, 409, 422].includes(failure.status)) clearJob();
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/ai/dashboards', { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('Chưa tải được danh mục dashboard.'); return response.json(); })
      .then(data => {
        if (controller.signal.aborted) return;
        setItems(data.dashboards || []);
        if (externalSearch.current) return; // Explicit catalog search never resumes an old analysis.
        try {
          const saved = JSON.parse(sessionStorage.getItem(accountJobStorageKey) || 'null');
          const item = (data.dashboards || []).find((candidate: Dashboard) => candidate.id === saved?.input?.dashboard_id && candidate.version === saved?.input?.dashboard_version);
          if (item && saved?.key) {
            setSelected(item); selectedRef.current = item;
            const time = saved.input.time || saved.input.time_range;
            setPeriod(time.mode); setStart(time.start || ''); setEnd(time.end || '');
            const filter=saved.input.analysis_scope?.filters?.[0];
            setScopeDimension(filter?.dimension || ''); setScopeValue(filter?.value?.[0] || '');
            if(filter?.value?.[0]) setScopeOptions([{value:filter.value[0],label:filter.value[0]}]);
            void run(item, time.mode, { start: time.start, end: time.end }, saved);
          }
        } catch { /* An unreadable checkpoint is never replayed. */ }
      }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); invalidate(); };
  }, []);
  const open = (item: Dashboard) => {
    setShowMap(discoveryKinds(item).includes('Bản đồ'));
    setSelected(item); selectedRef.current = item; setPeriod(item.default_time); setStart(''); setEnd(''); setScopeDimension(''); setScopeValue(''); setScopeSearch(''); setScopeOptions([]);
    void run(item, item.default_time, { start: '', end: '' }, undefined, true);
  };
  const searchScope = async () => {
    const dimension=scopeDimension, text=scopeSearch.trim();
    if (!dimension || text.length<2) return;
    const ticket=beginRequest();
    try {
      const response=await fetch(`/api/ai/scope-values?dimension=${encodeURIComponent(dimension)}&search=${encodeURIComponent(text)}`,{signal:ticket.signal});
      if(!response.ok) throw new Error('Chưa tìm được phạm vi.');
      const data=await response.json();
      if(ticket.current()) setScopeOptions(data.values || []);
    } catch(failure:any) { if(ticket.current()) setNotice(failure.message); }
  };
  const save = async () => {
    const target = currentReport.current;
    if (!target || saving) return;
    setSaving(true); setNotice('');
    try {
      await saveReport({ title: target.title || selectedRef.current?.title, category: 'ai_module', query_type: 'sql',
        sql_query: target.sql_query || '', visualization_type: 'table', module_config: target });
      if (currentReport.current === target) { setNotice('Đã lưu vào Quản lý Báo cáo.'); showToast('Đã lưu dashboard.', 'success'); }
    } catch (failure: any) { if (currentReport.current === target) setNotice(failure.message); }
    finally { setSaving(false); }
  };
  const exportDocx = async () => {
    const target = currentReport.current;
    if (!target) return;
    try {
      await downloadDocx(target, { saveToDb: false, filename: `${selectedRef.current?.id || 'dashboard'}.docx`, current: () => currentReport.current === target });
    } catch (failure: any) { if (currentReport.current === target) setNotice(failure.message); }
  };
  const visible = discoverDashboards(items, { search, category, kind, sort, custom: customOnly });
  const kinds = ['Bản đồ', 'Xu hướng', 'Xếp hạng', 'Trải nghiệm khách hàng', 'Dòng tiền'].filter(value => items.some(item => discoveryKinds(item).includes(value)));
  const resetFilters = () => { setSearch(''); setCategory('Tất cả'); setKind('Tất cả'); setCustomOnly(false); };
  if (selected) return <div className="space-y-3" data-dashboard-id={selected.id}>
    <button className="text-sm font-medium text-emerald-800 hover:underline" onClick={() => { cancel(); setSelected(null); selectedRef.current = null; setReport(null); currentReport.current = null; setError(''); }}>← Tất cả dashboard</button>
    <header className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="text-lg font-semibold tracking-tight">{selected.title}</h1><p className="text-[10px] font-medium text-emerald-700">{selected.category} / {selected.id}</p></div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="text-xs text-slate-500">{selected.description}</p><details className="text-[11px] text-slate-500 open:w-full"><summary className="cursor-pointer">Định nghĩa & phạm vi</summary><p className="mt-1 leading-5">{selected.limitation}</p></details></div></div>
      <form className=" flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if(scopeDimension&&!scopeValue){setNotice('Chọn một giá trị phạm vi trong danh sách trước khi cập nhật.');return;} void run(selected, period); }}>
        <label className="text-xs font-medium text-slate-600">Kỳ báo cáo<select aria-label="Kỳ báo cáo dashboard" value={period} disabled={selected.time_filter_enabled === false} onChange={event => { cancel(); setReport(null); currentReport.current = null; setPeriod(event.target.value); }} className="mt-1 block rounded-xl border bg-white px-3 py-2 text-xs"><option value="30d">30 ngày gần nhất</option><option value="7d">7 ngày gần nhất</option><option value="previous_month">Tháng trước</option><option value="current_month">Tháng này</option><option value="all_time">Toàn bộ dữ liệu</option><option value="custom">Tùy chọn</option></select></label>
        {period === 'custom' && <><label className="text-xs text-slate-600">Từ ngày<input aria-label="Từ ngày dashboard" required type="date" value={start} max={end || undefined} onChange={event => { cancel(); setReport(null); currentReport.current = null; setStart(event.target.value); }} className="mt-1 block rounded-xl border px-3 py-2 text-xs" /></label><label className="text-xs text-slate-600">Đến ngày<input aria-label="Đến ngày dashboard" required type="date" value={end} min={start || undefined} onChange={event => { cancel(); setReport(null); currentReport.current = null; setEnd(event.target.value); }} className="mt-1 block rounded-xl border px-3 py-2 text-xs" /></label></>}
        {Boolean(selected.scope_types?.length) && <><label className="text-xs font-medium text-slate-600">Phạm vi<select aria-label="Loại phạm vi dashboard" value={scopeDimension} onChange={event=>{cancel();setReport(null);currentReport.current=null;setScopeDimension(event.target.value);setScopeValue('');setScopeSearch('');setScopeOptions([]);}} className="mt-1 block rounded-xl border bg-white px-3 py-2 text-xs"><option value="">Toàn bộ phạm vi được cấp</option>{selected.scope_types?.map(scope=><option key={scope.id} value={scope.id}>{scope.label}</option>)}</select></label>
        {scopeDimension && <div className="min-w-[200px] max-w-72 text-xs text-slate-600"><span>Giá trị</span><SearchableSelect label="Giá trị phạm vi dashboard" value={scopeValue} placeholder="Gõ để tìm phạm vi…" onChange={value=>{cancel();setReport(null);currentReport.current=null;setScopeValue(value);}} options={[{value:'',label:'Chọn giá trị'},...[...(selected.scope_types?.find(scope=>scope.id===scopeDimension)?.values||[]).map(value=>({value:String(value),label:String(value)})),...scopeOptions].filter((v,i,all)=>all.findIndex(item=>item.value===v.value)===i)]}/></div>}
        {selected.scope_types?.find(scope=>scope.id===scopeDimension)?.searchable && <div className="flex gap-2"><input aria-label="Tìm phạm vi dashboard" value={scopeSearch} onChange={event=>setScopeSearch(event.target.value)} placeholder="Nhập ít nhất 2 ký tự" className="w-48 rounded-xl border px-3 py-2 text-xs"/><button type="button" disabled={Boolean(stage)} onClick={searchScope} className="rounded-xl border px-3 text-sm">Tìm</button></div>}</>}
        <button disabled={Boolean(stage)} className="rounded-xl bg-emerald-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Cập nhật dashboard</button>
        {stage && <button type="button" onClick={cancel} className="rounded-xl border px-3 py-2 text-xs">Hủy</button>}
      </form>
    </header>
    {stage && <section role="status" className="rounded-2xl border bg-white p-8"><div className="mb-4 h-1.5 w-36 animate-pulse rounded-full bg-emerald-200" /><p className="text-sm font-medium">{jobStages[stage] || 'Đang xử lý dashboard…'}</p><p className="mt-2 text-xs text-slate-500">Đang kiểm tra dữ liệu cho bài toán bạn đã chọn.</p></section>}
    {error && <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><p>{error}</p><button onClick={() => void run(selected, period, { start, end }, pendingJob.current)} className="mt-3 font-medium underline">Thử lại</button></section>}
    {notice && <p role="status" className="rounded-xl border bg-white p-3 text-sm">{notice}</p>}
    {report && geographicCharts(report).length > 0 && <button type="button" aria-pressed={showMap} onClick={() => setShowMap(!showMap)} className={`rounded-xl border px-3 py-2 text-xs font-medium ${showMap ? 'border-blue-200 bg-blue-50 text-blue-700' : 'bg-white text-slate-600'}`}>{showMap ? 'Ẩn bản đồ khu vực' : 'Hiện bản đồ khu vực'}</button>}
    {report && <AnalystDashboard key={`${report.session_id}:${report.revision}`} report={report} geographicView={showMap ? <GeographicReportPanel report={report} scopeValues={selected.scope_types?.find(scope => scope.id === 'city')?.values.map(String)} onScope={selected.scope_types?.some(scope => scope.id === 'city') ? city => {
      setScopeDimension('city'); setScopeValue(city); setScopeOptions([{ value: city, label: city }]);
      setNotice(`Đã chọn ${city}. Bấm “Cập nhật dashboard” để áp dụng phạm vi này cho toàn bộ báo cáo.`);
    } : undefined} /> : undefined} onSave={save} onExport={exportDocx} onReportChange={data=>{invalidate();setReport(data);currentReport.current=data;}} />}
  </div>;
  return <section className="space-y-5" data-dashboard-hub>
    <header className="relative overflow-hidden rounded-3xl bg-[#101f3d] p-6 text-white sm:p-7">
      <div className="absolute -right-8 -top-12 h-56 w-56 rounded-full border-[32px] border-white/5" aria-hidden="true" />
      <p className="text-[10px] font-medium uppercase tracking-[.2em] text-blue-200">Avengers Intelligence</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Báo cáo & Phân tích</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">Từ câu hỏi kinh doanh đến góc nhìn dữ liệu. Khám phá doanh thu, khách hàng, dòng tiền, vận hành và mạng lưới điểm bán.</p>
      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-blue-100">
        <span><strong className="mr-1 text-lg font-semibold text-white">{items.length || '—'}</strong> bài toán nghiệp vụ</span>
        <span><strong className="mr-1 text-lg font-semibold text-white">{new Set(items.map(item => item.category)).size || '—'}</strong> nhóm chức năng</span>
        <span><strong className="mr-1 text-lg font-semibold text-white">{items.filter(item => discoveryKinds(item).includes('Bản đồ')).length}</strong> góc nhìn địa lý</span>
      </div>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button onClick={()=>setAnalyticsSubTab('revenue')} className="text-xs font-medium text-blue-700 hover:underline">Báo cáo tổng hợp</button>
      <button type="button" onClick={() => setActiveTab('saved_reports')} className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50">+ Thêm bài toán từ báo cáo đã lưu</button>
    </div>
    <section aria-label="Tìm kiếm và khám phá bài toán" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1"><span className="text-sm font-semibold text-slate-900">Bạn muốn phân tích điều gì?</span>
          <div className="relative mt-2"><span className="pointer-events-none absolute left-3 top-2.5 text-slate-400" aria-hidden="true">⌕</span><input type="search" aria-label="Tìm dashboard" placeholder="Tìm bài toán, chỉ số: doanh thu, đánh giá, topping, ví kiosk…" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50/60 py-2.5 pl-8 pr-3 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></div>
        </label>
        <label className="shrink-0 text-[11px] text-slate-500">Sắp xếp<select aria-label="Sắp xếp bài toán" value={sort} onChange={e => setSort(e.target.value)} className="mt-2 block w-full rounded-xl border bg-white px-3 py-2.5 text-xs text-slate-600"><option value="default">Theo danh mục</option><option value="name">Tên A–Z</option><option value="ready">Nguồn sẵn sàng trước</option><option value="custom">Bài toán cá nhân trước</option></select></label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Nhóm dashboard">{['Tất cả', ...new Set(items.map(item => item.category))].map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${category === value ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-300'}`}>{value}<span className={`ml-1.5 text-[10px] ${category === value ? 'text-slate-300' : 'text-slate-400'}`}>{value === 'Tất cả' ? items.length : items.filter(item => item.category === value).length}</span></button>)}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3" aria-label="Loại góc nhìn">
        <span className="mr-1 text-[11px] text-slate-400">Khám phá theo</span>
        {kinds.map(value => <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(kind === value ? 'Tất cả' : value)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${kind === value ? 'border-blue-200 bg-blue-50 font-medium text-blue-700' : 'border-slate-200 text-slate-500 hover:text-blue-700'}`}>{value}</button>)}
        <button type="button" aria-pressed={customOnly} onClick={() => setCustomOnly(!customOnly)} className={`rounded-lg border px-2.5 py-1.5 text-[11px] ${customOnly ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>Bài toán của tôi</button>
      </div>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" aria-live="polite" className="text-xs text-slate-500">{loading ? 'Đang tải danh mục…' : `${visible.length} bài toán phù hợp / ${items.length} bài toán`}{kind !== 'Tất cả' ? ` · ${kind}` : ''}</p>{(search || category !== 'Tất cả' || kind !== 'Tất cả' || customOnly) && <button onClick={resetFilters} className="text-xs font-medium text-blue-700">Xóa bộ lọc</button>}</div>
    {loading && <p role="status" className="p-6 text-sm text-slate-500">Đang tải danh mục dashboard…</p>}
    {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {!loading && !visible.length && <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center"><p className="text-sm font-medium text-slate-700">Chưa có bài toán khớp lựa chọn.</p><p className="mt-2 text-xs text-slate-500">Thử từ khóa khác, bỏ bộ lọc hoặc thêm bài toán từ báo cáo cá nhân.</p><button onClick={resetFilters} className="mt-4 text-xs font-medium text-blue-700">Xem toàn bộ bài toán</button></div>}
    <PaginatedGrid resetKey={`${category}:${search}:${kind}:${sort}:${customOnly}`} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visible.map(item => <button key={item.id} onClick={() => open(item)} className="group flex min-h-[245px] flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg focus-visible:outline-blue-600">
      <div className="mb-4 flex w-full items-center justify-between"><span className={`grid h-10 w-10 place-items-center rounded-xl text-xs font-semibold ${themes[item.category] || 'bg-blue-50 text-blue-700'}`}>{discoveryKinds(item).includes('Bản đồ') ? '◎' : item.custom ? '+' : item.id.replace(/^D/, '')}</span><span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{item.category}</span></div>
      <h2 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700">{item.title}</h2>
      {item.custom && <span data-hub-custom className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">Bài toán đã thêm</span>}
      <p className="mb-3 mt-2 text-xs leading-5 text-slate-500">{item.description}</p>
      <div className="mb-4 flex flex-wrap gap-1.5">{dashboardTopics(item).map((topic:string) => <span key={topic} className="rounded-md bg-slate-50 px-2 py-1 text-[10px] text-slate-500">{topic}</span>)}</div>
      <div className="mt-auto flex w-full items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className={`text-[10px] ${item.status === 'healthy' ? 'text-blue-700' : item.status === 'blocked' ? 'text-amber-700' : 'text-slate-500'}`}>{statusLabel[item.status] || statusLabel.unknown}</span><span className="text-[10px] text-slate-400">{item.panel_count} phần phân tích ↗</span></div>
    </button>)}</PaginatedGrid>
  </section>;
};
