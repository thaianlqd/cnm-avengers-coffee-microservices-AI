import React, { useEffect, useRef, useState } from 'react';

const buttonClass = 'rounded-lg border border-slate-200 px-3 py-1.5 text-xs bg-white disabled:opacity-50';
export type AnalysisModuleSummary = { module_id: string; name: string; description?: string; domains?: { label: string }[]; compatibility: string; last_run_at?: string; last_report_id?: string };

export const AnalysisModules: React.FC<{
  active: AnalysisModuleSummary | null; report?: any; disabled: boolean; rerunTime?: any;
  onUpdate: (inputs: any) => void; onSelect: (module: AnalysisModuleSummary | null) => void; onReport: (report: any) => void; onEdit: () => void;
}> = p => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [modules, setModules] = useState<AnalysisModuleSummary[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scopeEditable, setScopeEditable] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [refresh, setRefresh] = useState(0);
  const [renaming, setRenaming] = useState<AnalysisModuleSummary | null>(null);
  const [rename, setRename] = useState('');
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/ai/modules?search=${encodeURIComponent(search)}`, { signal: abort.signal }).then(async r => {
        const data = await r.json();
        if (!r.ok || data.status !== 'success') throw new Error(data.message || 'Chưa thể tải bài toán đã lưu.');
        setModules(data.modules || []); setError('');
      }).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    }, 250);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [open, search, refresh]);
  const mutate = async (path: string, method: string, body?: any) => {
    if (lock.current || p.disabled) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const r = await fetch(`/api/ai/modules${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await r.json();
      if (!r.ok || data.status !== 'success') {
        if (data.issue) p.onReport(data);
        throw new Error(data.message || 'Chưa thể hoàn tất thao tác.');
      }
      if (data.result_sets) p.onReport(data);
      if (method === 'POST' && !path) { p.onSelect(data.module); setSaving(false); }
      if (method === 'PATCH') { setRenaming(null); if (p.active?.module_id === data.module.module_id) p.onSelect(data.module); }
      if (method === 'DELETE' && p.active?.module_id === path.slice(1)) p.onSelect(null);
      setRefresh(v => v + 1);
    } catch (e: any) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  };
  const approved = p.report?.status === 'success' && p.report?.session_id;
  return <section aria-label="Bài toán phân tích đã lưu" className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
    <div className="flex flex-wrap gap-2 items-center">
      <button type="button" className={buttonClass} disabled={p.disabled || busy} onClick={() => setOpen(v => !v)}>Bài toán đã lưu {open ? '▴' : '▾'}</button>
      {approved && <button type="button" className={buttonClass} disabled={p.disabled || busy} onClick={() => { setSaving(true); setName(p.active?.name || p.report.title || ''); }}>Lưu thành bài toán mới</button>}
      {p.active && <span className="text-xs rounded-lg bg-indigo-100 px-3 py-2">Đang dùng: {p.active.name} <button type="button" aria-label="Bỏ bài toán đang chọn" disabled={p.disabled || busy} onClick={() => p.onSelect(null)}>×</button></span>}
      {p.report?.module_provenance && <span className="text-xs text-slate-500">{p.report.module_provenance.name} · {p.report.module_provenance.mode === 'rerun' ? 'Chạy lại với dữ liệu hiện tại' : p.report.module_provenance.mode === 'previous_run' ? `Báo cáo lần chạy trước · ${new Date(p.report.created_at).toLocaleString('vi-VN')}` : 'Tham chiếu cho phân tích mới'}</span>}
    </div>
    {error && <p role="alert" className="text-xs text-amber-800">{error}</p>}
    {busy && <p role="status" className="text-xs">Đang xử lý bài toán…</p>}
    {open && <div className="space-y-3">
      <input aria-label="Tìm bài toán theo tên hoặc miền" maxLength={120} value={search} onChange={e => setSearch(e.target.value)} className="rounded-lg border px-3 py-2 text-sm w-full" placeholder="Tìm bài toán theo tên hoặc miền" />
      {modules.length === 0 && !error && <p className="text-xs text-slate-500">Chưa có bài toán phù hợp. Bạn có thể lưu sau khi duyệt và chạy phân tích.</p>}
      {modules.map(m => <div key={m.module_id} className="rounded-lg border p-3 space-y-2 bg-white">
        <p className="text-sm font-medium">{m.name}</p><p className="text-xs text-slate-500">{(m.domains || []).map(d => d.label).join(', ')}{m.last_run_at ? ` · Chạy lần cuối: ${new Date(m.last_run_at).toLocaleDateString('vi-VN')}` : ''}</p>
        {m.compatibility === 'needs_review' && <p className="text-xs text-amber-800">Danh mục đã thay đổi. Cần cập nhật và duyệt lại bài toán.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} disabled={p.disabled || busy || m.compatibility !== 'ready'} onClick={() => { p.onSelect(m); p.onEdit(); }}>Sử dụng</button>
          <button type="button" className={buttonClass} disabled={p.disabled || busy || m.compatibility !== 'ready' || !p.rerunTime} onClick={() => mutate(`/${m.module_id}/rerun`, 'POST', { time: p.rerunTime })}>Chạy lại theo thời gian đang chọn</button>
          {m.last_report_id && <button type="button" className={buttonClass} disabled={p.disabled || busy} onClick={() => mutate(`/${m.module_id}/runs/${m.last_report_id}`, 'GET')}>Xem lần chạy trước</button>}
          <button type="button" className={buttonClass} disabled={p.disabled || busy} onClick={() => { setRenaming(m); setRename(m.name); }}>Đổi tên</button>
          <button type="button" className={buttonClass} disabled={p.disabled || busy} onClick={() => mutate(`/${m.module_id}`, 'DELETE')}>Lưu trữ</button>
          {m.compatibility === 'needs_review' && <button type="button" className={buttonClass} disabled={p.disabled || busy} onClick={async () => {
            try { const r = await fetch(`/api/ai/modules/${m.module_id}`); const data = await r.json();
              if (!r.ok || data.status !== 'success') throw new Error(data.message || 'Chưa thể tải bài toán.');
              p.onSelect(null); p.onUpdate(data.module.definition); p.onEdit();
            } catch (e: any) { setError(e.message); }
          }}>Cập nhật bài toán</button>}
        </div>
      </div>)}
    </div>}
    {renaming && <form aria-label="Đổi tên bài toán" onSubmit={e => { e.preventDefault(); mutate(`/${renaming.module_id}`, 'PATCH', { name: rename.trim() }); }} className="flex gap-2">
      <input required maxLength={120} aria-label="Tên mới" value={rename} onChange={e => setRename(e.target.value)} className="border rounded-lg p-2 text-sm" />
      <button disabled={busy || !rename.trim()} className={buttonClass}>Lưu tên</button><button type="button" className={buttonClass} onClick={() => setRenaming(null)}>Hủy</button>
    </form>}
    {saving && <div role="dialog" aria-label="Lưu bài toán phân tích" className="rounded-xl border bg-white p-4">
      <form onSubmit={e => { e.preventDefault(); mutate('', 'POST', { session_id: p.report.session_id, revision: p.report.revision, name: name.trim(), description: description.trim(), parameterizable_scope: scopeEditable }); }} className="space-y-3">
        <h3 className="text-sm font-semibold">Lưu bài toán phân tích</h3>
        <input required maxLength={120} aria-label="Tên bài toán" value={name} onChange={e => setName(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
        <textarea maxLength={500} aria-label="Mô tả bài toán" value={description} onChange={e => setDescription(e.target.value)} className="w-full border rounded-lg p-2 text-sm" />
        <label className="text-xs flex gap-2"><input type="checkbox" checked={scopeEditable} onChange={e => setScopeEditable(e.target.checked)} />Cho phép đổi phạm vi tổng hợp đã chọn khi chạy lại</label>
        <p className="text-xs text-slate-500">Lưu cách phân tích đã duyệt. Mỗi lần chạy lại sẽ đọc dữ liệu hiện tại.</p>
        <div className="flex gap-2"><button className={buttonClass} disabled={busy || !name.trim()}>Lưu bài toán</button><button type="button" className={buttonClass} onClick={() => setSaving(false)}>Hủy</button></div>
      </form>
    </div>}
  </section>;
};
