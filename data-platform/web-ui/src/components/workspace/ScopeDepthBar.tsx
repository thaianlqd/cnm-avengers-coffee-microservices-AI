import React, { useEffect, useState } from 'react';

const field = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700';

/** TIME · SCOPE · DEPTH, from capability time_presets / scope_types / analysis_depths. */
export const ScopeDepthBar: React.FC<{ capabilities: any; time: string; start: string; end: string; scope: any; depth: string; disabled?: boolean;
  onTime: (v: string) => void; onStart: (v: string) => void; onEnd: (v: string) => void; onScope: (v: any) => void; onDepth: (v: string) => void }> = p => {
  const presets = (p.capabilities?.time_presets || [{ id: 'auto', label: 'Tự động' }]).map((t: any) => t.id === 'auto' ? { ...t, label: 'Theo câu hỏi' } : t);
  const types = p.capabilities?.scope_types || [];
  const [dimension, setDimension] = useState(p.scope?.filters?.[0]?.dimension || types[0]?.id || '');
  const [search, setSearch] = useState(''), [found, setFound] = useState<any[]>([]);
  const type = types.find((t: any) => t.id === dimension);
  const labels = Object.fromEntries((p.capabilities?.dimension_value_labels?.[dimension] || []).map((v: any) => [v.value, v.label]));
  const selected: any[] = p.scope?.filters?.find((f: any) => f.dimension === dimension)?.value || [];
  useEffect(() => {
    if (!type?.searchable || search.trim().length < 2) { setFound([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => fetch(`/api/ai/scope-values?dimension=${encodeURIComponent(dimension)}&search=${encodeURIComponent(search.trim())}`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : { values: [] }).then(d => setFound(d.values || [])).catch(() => {}), 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, dimension]);
  const toggle = (value: any) => {
    const others = (p.scope?.filters || []).filter((f: any) => f.dimension !== dimension);
    const values = selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value];
    const filters = [...others, ...(values.length ? [{ dimension, operator: 'in', value: values }] : [])];
    p.onScope(filters.length ? { mode: 'selected', filters } : { mode: 'auto', filters: [] });
  };
  return <div data-scope-depth-bar className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto] gap-3 rounded-2xl border border-slate-200/80 bg-white p-3">
    <div data-analysis-input="time" className="space-y-1"><label htmlFor="analysis-time" className="text-[11px] font-semibold text-slate-500">Thời gian</label>
      <select id="analysis-time" disabled={p.disabled} value={p.time} onChange={e => p.onTime(e.target.value)} className={`${field} w-full`}>{presets.map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
      {p.time === 'auto' && <p className="text-[10.5px] text-slate-400">Dùng thời gian nêu trong câu hỏi; không nêu thì phân tích toàn bộ dữ liệu.</p>}
      {p.time === 'custom' && <div className="flex gap-2"><input aria-label="Từ ngày" type="date" required value={p.start} max={p.end || undefined} onChange={e => p.onStart(e.target.value)} className={field} /><input aria-label="Đến ngày" type="date" required value={p.end} min={p.start || undefined} onChange={e => p.onEnd(e.target.value)} className={field} /></div>}
    </div>
    <div data-analysis-input="scope" className="space-y-1 min-w-0"><span className="text-[11px] font-semibold text-slate-500">Phạm vi</span>
      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label="Loại phạm vi" disabled={p.disabled} value={dimension} onChange={e => { setDimension(e.target.value); setSearch(''); }} className={field}>{types.map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        {type?.searchable ? <input aria-label="Tìm giá trị phạm vi" value={search} onChange={e => setSearch(e.target.value)} placeholder="Gõ ≥ 2 ký tự để tìm…" className={`${field} flex-1 min-w-[140px]`} /> : null}
        {p.scope?.mode === 'selected' && <button type="button" onClick={() => p.onScope({ mode: 'auto', filters: [] })} className="text-[11px] text-slate-500 hover:text-slate-800">Bỏ chọn</button>}
      </div>
      <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
        {[...(type?.searchable ? found.map((v: any) => v.value) : type?.values || []), ...selected.filter(v => !(type?.values || []).includes(v) && !found.some((f: any) => f.value === v))].map((v: any) =>
          <button key={String(v)} type="button" aria-pressed={selected.includes(v)} onClick={() => toggle(v)} className={`rounded-full border px-2 py-0.5 text-[11px] ${selected.includes(v) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>{labels[v] || String(v)}</button>)}
      </div>
      {p.scope?.mode === 'selected' && <p className="text-[10.5px] text-slate-500">{p.scope.filters.map((f: any) => `${types.find((t: any) => t.id === f.dimension)?.label}: ${f.value.length} giá trị`).join(' · ')}</p>}
    </div>
    <div data-analysis-input="depth" className="space-y-1"><span className="text-[11px] font-semibold text-slate-500">Độ sâu</span>
      <div role="radiogroup" aria-label="Độ sâu phân tích" className="flex rounded-xl bg-slate-100 p-1 gap-1">
        {(p.capabilities?.analysis_depths || []).map((d: any) => <button key={d.id} type="button" role="radio" aria-checked={p.depth === d.id} disabled={p.disabled} onClick={() => p.onDepth(d.id)}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-medium ${p.depth === d.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500'}`}>{d.label.replace('Phân tích toàn diện', 'Toàn diện')}</button>)}
      </div>
    </div>
  </div>;
};
