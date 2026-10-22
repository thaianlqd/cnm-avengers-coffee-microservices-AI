import React, { useEffect, useState } from 'react';
import { depthOptions, detectedScope } from '../../utils/missionWorkspace.mjs';

const field = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700';

/**
 * V3.2 scope & depth. Scope is recognized from the question by the server
 * preflight (no default "Sản phẩm" picker); narrowing manually is optional.
 * Depth shows what each level really adds (governed depth budgets).
 */
export const AnalysisScopePanel: React.FC<{ capabilities: any; preflight: any; showTime: boolean; time: string; start: string; end: string;
  scope: any; depth: string; showDepth: boolean; disabled?: boolean; onTime: (v: string) => void; onStart: (v: string) => void; onEnd: (v: string) => void;
  onScope: (v: any) => void; onDepth: (v: string) => void }> = p => {
  const presets = (p.capabilities?.time_presets || [{ id: 'auto', label: 'Tự động' }]).map((t: any) => t.id === 'auto' ? { ...t, label: 'Theo câu hỏi' } : t);
  const types = p.capabilities?.scope_types || [];
  const manual = p.scope?.mode === 'selected';
  const [open, setOpen] = useState(manual);
  const [dimension, setDimension] = useState(p.scope?.filters?.[0]?.dimension || '');
  const [search, setSearch] = useState(''), [found, setFound] = useState<any[]>([]);
  const type = types.find((t: any) => t.id === dimension);
  const labels = Object.fromEntries((p.capabilities?.dimension_value_labels?.[dimension] || []).map((v: any) => [v.value, v.label]));
  const selectedValue = p.scope?.filters?.find((f: any) => f.dimension === dimension)?.value;
  const selected: any[] = selectedValue == null ? [] : Array.isArray(selectedValue) ? selectedValue : [selectedValue];
  const detected = detectedScope(p.preflight);
  const depths = depthOptions(p.capabilities);
  const activeDepth = depths.find(d => d.id === p.depth);
  useEffect(() => {
    if (!type?.searchable || search.trim().length < 2) { setFound([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => fetch(`/api/ai/scope-values?dimension=${encodeURIComponent(dimension)}&search=${encodeURIComponent(search.trim())}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : { values: [] }).then(d => { if (!controller.signal.aborted) setFound(d.values || []); }).catch(() => {}), 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, dimension]);
  const toggle = (value: any) => {
    const others = (p.scope?.filters || []).filter((f: any) => f.dimension !== dimension);
    const values = selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value];
    const filters = [...others, ...(values.length ? [{ dimension, operator: 'in', value: values }] : [])];
    p.onScope(filters.length ? { mode: 'selected', filters } : { mode: 'auto', filters: [] });
  };
  return <div data-scope-panel className={`grid grid-cols-1 ${p.showTime ? 'md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)_auto]' : 'md:grid-cols-[minmax(0,1.6fr)_auto]'} gap-3 rounded-2xl border border-slate-200/80 bg-white p-3`}>
    {p.showTime && <div data-analysis-input="time" className="space-y-1"><label htmlFor="analysis-time" className="text-[11px] font-semibold text-slate-500">Thời gian</label>
      <select id="analysis-time" disabled={p.disabled} value={p.time} onChange={e => p.onTime(e.target.value)} className={`${field} w-full`}>{presets.map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
      {p.time === 'auto' && <p className="text-[10.5px] text-slate-400">Dùng thời gian nêu trong câu hỏi; không nêu thì phân tích toàn bộ dữ liệu.</p>}
      {p.time === 'custom' && <div className="flex gap-2"><input aria-label="Từ ngày" type="date" required value={p.start} max={p.end || undefined} onChange={e => p.onStart(e.target.value)} className={field} /><input aria-label="Đến ngày" type="date" required value={p.end} min={p.start || undefined} onChange={e => p.onEnd(e.target.value)} className={field} /></div>}
    </div>}
    <div data-analysis-input="scope" className="space-y-1 min-w-0">
      {p.capabilities?.authorized_scope?.national===false&&<p data-authorized-scope className="rounded border border-blue-100 bg-blue-50 p-2 text-[11px] text-blue-900">Phạm vi theo quyền tài khoản: {(p.capabilities.authorized_scope.store_ids||[]).join(' · ')}. Mọi kết quả đều giới hạn trong các mã cửa hàng được cấp.</p>}
      <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold text-slate-500">Phạm vi</span>
        <button type="button" disabled={p.disabled} onClick={() => { if (open && manual) p.onScope({ mode: 'auto', filters: [] }); setOpen(!open); }} className="text-[11px] text-slate-500 hover:text-slate-800">{open ? (manual ? 'Bỏ thu hẹp' : 'Đóng') : 'Thu hẹp thủ công'}</button></div>
      {!manual && <div data-detected-scope className="flex flex-wrap gap-1.5 items-center text-[11px]">
        <span className="text-slate-400">Tự nhận diện từ câu hỏi:</span>
        {detected.filters.length ? detected.filters.map((f, i) => <span key={i} className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-800">{f.label}</span>)
          : <span className="text-slate-600">{p.capabilities?.authorized_scope?.national===false?'Trong phạm vi tài khoản được cấp':detected.summary}</span>}
        {detected.axes.map((a, i) => <span key={`a${i}`} className="rounded-full border border-slate-200 px-2 py-0.5 text-slate-600">{a.label}</span>)}
      </div>}
      {!manual && p.preflight?.scope_resolution?.state === 'resolved' && <details data-scope-provenance className="text-[10.5px] text-slate-500">
        <summary className="cursor-pointer">Xem thành viên và quy ước phạm vi</summary>
        {(p.preflight.scope_resolution.bindings || []).map((b: any) => <p key={b.dimension}>{b.members.join(' · ')}{b.excluded_members?.length ? ` · Đã loại: ${b.excluded_members.join(', ')}` : ''}</p>)}
        {(p.preflight.scope_resolution.source || []).map((s: any) => <p key={s.id}>{s.label} · {s.source} · phiên bản {s.version}</p>)}
        <p>Phân vùng báo cáo nội bộ trên các tỉnh/thành có trong dữ liệu; không đại diện toàn bộ địa bàn ngoài danh mục.</p>
      </details>}
      {open && <div className="space-y-1.5">
        <div className="flex flex-wrap gap-2 items-center">
          <select aria-label="Loại phạm vi" disabled={p.disabled} value={dimension} onChange={e => { setDimension(e.target.value); setSearch(''); }} className={field}>
            <option value="">Chọn loại phạm vi…</option>{types.map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
          {type?.searchable ? <input aria-label="Tìm giá trị phạm vi" value={search} onChange={e => setSearch(e.target.value)} placeholder="Gõ ≥ 2 ký tự để tìm…" className={`${field} flex-1 min-w-[140px]`} /> : null}
        </div>
        {dimension && <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
          {[...(type?.searchable ? found.map((v: any) => v.value) : type?.values || []), ...selected.filter(v => !(type?.values || []).includes(v) && !found.some((f: any) => f.value === v))].map((v: any) =>
            <button key={String(v)} type="button" aria-pressed={selected.includes(v)} onClick={() => toggle(v)} className={`rounded-full border px-2 py-0.5 text-[11px] ${selected.includes(v) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>{labels[v] || String(v)}</button>)}
        </div>}
        {manual && <p className="text-[10.5px] text-slate-500">{p.scope.filters.map((f: any) => `${types.find((t: any) => t.id === f.dimension)?.label || p.capabilities?.metrics?.flatMap((m: any) => m.dimensions || []).find((d: any) => d.id === f.dimension)?.label || f.dimension}: ${(Array.isArray(f.value) ? f.value : [f.value]).map((value: any) => p.capabilities?.dimension_value_labels?.[f.dimension]?.find((v: any) => v.value === value)?.label || String(value)).join(', ')}`).join(' · ')}</p>}
      </div>}
    </div>
    {p.showDepth && <div data-analysis-input="depth" className="space-y-1 max-w-xs"><span className="text-[11px] font-semibold text-slate-500">Độ sâu</span>
      <div role="radiogroup" aria-label="Độ sâu phân tích" className="flex rounded-xl bg-slate-100 p-1 gap-1">
        {depths.map((d: any) => <button key={d.id} type="button" role="radio" aria-checked={p.depth === d.id} disabled={p.disabled} title={d.description} onClick={() => p.onDepth(d.id)}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${p.depth === d.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}>{d.short}</button>)}
      </div>
      {activeDepth?.description && <p data-depth-description className="text-[10.5px] leading-snug text-slate-500">{activeDepth.description}</p>}
    </div>}
  </div>;
};
