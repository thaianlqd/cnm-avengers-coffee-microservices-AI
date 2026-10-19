import React, { useEffect, useRef, useState } from 'react';
import { AnalystDashboard } from '../components/AnalystDashboardSummary';
import { useReportActions } from '../hooks/useReportActions';
import { useAnalysisLifecycle } from '../hooks/useAnalysisLifecycle';
import { jobStages } from '../utils/analysisJobs.mjs';
import { usePlatformStore } from '../store/usePlatformStore';

type Dashboard = { id: string; version: string; title: string; category: string; description: string;
  limitation: string; default_time: string; status: string; panel_count: number; source_views: string[]; time_filter_enabled?: boolean; scope_types?: {id: string; label: string; values: (string|number)[]; searchable: boolean}[] };
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
  const { showToast, setAnalyticsSubTab } = usePlatformStore();
  const cancel = () => { cancelOwnedJob(); setStage(''); };
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
  const visible = items.filter(item => (category === 'Tất cả' || item.category === category)
    && `${item.title} ${item.description}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  if (selected) return <div className="space-y-3" data-dashboard-id={selected.id}>
    <button className="text-sm font-medium text-emerald-800 hover:underline" onClick={() => { cancel(); setSelected(null); selectedRef.current = null; setReport(null); currentReport.current = null; setError(''); }}>← Tất cả dashboard</button>
    <header className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="text-lg font-semibold tracking-tight">{selected.title}</h1><p className="text-[10px] font-medium text-emerald-700">{selected.category} / {selected.id}</p></div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1"><p className="text-xs text-slate-500">{selected.description}</p><details className="text-[11px] text-slate-500 open:w-full"><summary className="cursor-pointer">Định nghĩa & phạm vi</summary><p className="mt-1 leading-5">{selected.limitation}</p></details></div></div>
      <form className=" flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void run(selected, period); }}>
        <label className="text-xs font-medium text-slate-600">Kỳ báo cáo<select aria-label="Kỳ báo cáo dashboard" value={period} disabled={selected.time_filter_enabled === false} onChange={event => { cancel(); setReport(null); currentReport.current = null; setPeriod(event.target.value); }} className="mt-1 block rounded-xl border bg-white px-3 py-2 text-xs"><option value="30d">30 ngày gần nhất</option><option value="7d">7 ngày gần nhất</option><option value="previous_month">Tháng trước</option><option value="current_month">Tháng này</option><option value="all_time">Toàn bộ dữ liệu</option><option value="custom">Tùy chọn</option></select></label>
        {period === 'custom' && <><label className="text-xs text-slate-600">Từ ngày<input aria-label="Từ ngày dashboard" required type="date" value={start} max={end || undefined} onChange={event => { cancel(); setReport(null); currentReport.current = null; setStart(event.target.value); }} className="mt-1 block rounded-xl border px-3 py-2 text-xs" /></label><label className="text-xs text-slate-600">Đến ngày<input aria-label="Đến ngày dashboard" required type="date" value={end} min={start || undefined} onChange={event => { cancel(); setReport(null); currentReport.current = null; setEnd(event.target.value); }} className="mt-1 block rounded-xl border px-3 py-2 text-xs" /></label></>}
        {Boolean(selected.scope_types?.length) && <><label className="text-xs font-medium text-slate-600">Phạm vi<select aria-label="Loại phạm vi dashboard" value={scopeDimension} onChange={event=>{cancel();setReport(null);currentReport.current=null;setScopeDimension(event.target.value);setScopeValue('');setScopeSearch('');setScopeOptions([]);}} className="mt-1 block rounded-xl border bg-white px-3 py-2 text-xs"><option value="">Toàn bộ phạm vi được cấp</option>{selected.scope_types?.map(scope=><option key={scope.id} value={scope.id}>{scope.label}</option>)}</select></label>
        {scopeDimension && <label className="text-xs text-slate-600">Giá trị<select aria-label="Giá trị phạm vi dashboard" required value={scopeValue} onChange={event=>{cancel();setReport(null);currentReport.current=null;setScopeValue(event.target.value);}} className="mt-1 block max-w-56 rounded-xl border bg-white px-3 py-2 text-xs"><option value="">Chọn giá trị</option>{[...(selected.scope_types?.find(scope=>scope.id===scopeDimension)?.values || []).map(value=>({value:String(value),label:String(value)})),...scopeOptions].filter((value,index,all)=>all.findIndex(item=>item.value===value.value)===index).map(value=><option key={value.value} value={value.value}>{value.label}</option>)}</select></label>}
        {selected.scope_types?.find(scope=>scope.id===scopeDimension)?.searchable && <div className="flex gap-2"><input aria-label="Tìm phạm vi dashboard" value={scopeSearch} onChange={event=>setScopeSearch(event.target.value)} placeholder="Nhập ít nhất 2 ký tự" className="w-48 rounded-xl border px-3 py-2 text-xs"/><button type="button" disabled={Boolean(stage)} onClick={searchScope} className="rounded-xl border px-3 text-sm">Tìm</button></div>}</>}
        <button disabled={Boolean(stage)} className="rounded-xl bg-emerald-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Cập nhật dashboard</button>
        {stage && <button type="button" onClick={cancel} className="rounded-xl border px-3 py-2 text-xs">Hủy</button>}
      </form>
    </header>
    {stage && <section role="status" className="rounded-2xl border bg-white p-8"><div className="mb-4 h-1.5 w-36 animate-pulse rounded-full bg-emerald-200" /><p className="text-sm font-medium">{jobStages[stage] || 'Đang xử lý dashboard…'}</p><p className="mt-2 text-xs text-slate-500">Đang kiểm tra dữ liệu cho bài toán bạn đã chọn.</p></section>}
    {error && <section role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><p>{error}</p><button onClick={() => void run(selected, period, { start, end }, pendingJob.current)} className="mt-3 font-medium underline">Thử lại</button></section>}
    {notice && <p role="status" className="rounded-xl border bg-white p-3 text-sm">{notice}</p>}
    {report && <AnalystDashboard key={`${report.session_id}:${report.revision}`} report={report} onSave={save} onExport={exportDocx} />}
  </div>;
  return <section className="space-y-6" data-dashboard-hub>
    <header className="relative overflow-hidden rounded-3xl bg-[#143d32] p-7 text-white sm:p-9"><div className="absolute -right-8 -top-12 h-56 w-56 rounded-full border-[32px] border-white/5" aria-hidden="true" /><p className="text-xs font-medium uppercase tracking-[.2em] text-emerald-200">Avengers Intelligence</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Báo cáo & Phân tích</h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/75">Một không gian cho từng bài toán. Khám phá kinh doanh, vận hành và trải nghiệm khách hàng qua các dashboard chuyên biệt.</p><p className="mt-6 text-xs text-emerald-100">{items.length ? `${items.length} dashboard nghiệp vụ` : 'Danh mục dashboard'} · Chọn một bài toán để bắt đầu</p></header>
    <button onClick={()=>setAnalyticsSubTab('revenue')} className="text-sm font-medium text-emerald-800 hover:underline">Báo cáo tổng hợp</button>
    <div className="flex flex-col justify-between gap-4 xl:flex-row"><div className="flex flex-wrap gap-2" aria-label="Nhóm dashboard">{['Tất cả', ...new Set(items.map(item => item.category))].map(value => <button key={value} aria-pressed={category === value} onClick={() => setCategory(value)} className={`rounded-full px-4 py-2 text-xs font-medium ${category === value ? 'bg-slate-900 text-white' : 'border bg-white text-slate-600 hover:border-slate-400'}`}>{value}</button>)}</div><input type="search" aria-label="Tìm dashboard" placeholder="Tìm đơn hàng, giao hàng, kiosk…" value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-xl border bg-white px-3 py-2 text-xs outline-none focus:border-emerald-700 xl:w-80" /></div>
    {loading && <p role="status" className="p-6 text-sm text-slate-500">Đang tải danh mục dashboard…</p>}
    {error && <p role="alert" className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {!loading && !visible.length && <p className="rounded-xl border bg-white p-6 text-sm text-slate-500">Không có dashboard phù hợp với bộ lọc.</p>}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visible.map((item, index) => <button key={item.id} onClick={() => open(item)} className="group flex min-h-[225px] flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-lg focus-visible:outline-emerald-700">
      <div className="mb-5 flex w-full items-center justify-between"><span className={`grid h-11 w-11 place-items-center rounded-2xl text-sm font-semibold ${themes[item.category] || 'bg-slate-100 text-slate-700'}`}>{String(index + 1).padStart(2,'0')}</span><span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{item.category}</span></div>
      <h2 className="text-base font-semibold text-slate-900 group-hover:text-emerald-800">{item.title}</h2><p className="mb-5 mt-2 text-xs leading-5 text-slate-500">{item.description}</p><div className="mt-auto flex w-full items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className={`text-[10px] ${item.status === 'healthy' ? 'text-emerald-700' : item.status === 'blocked' ? 'text-amber-700' : 'text-slate-500'}`}>{statusLabel[item.status] || statusLabel.unknown}</span><span aria-hidden="true" className="text-emerald-800">↗</span></div>
    </button>)}</div>
  </section>;
};
