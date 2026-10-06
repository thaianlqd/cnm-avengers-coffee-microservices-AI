import React, { useEffect, useState } from 'react';

const selectClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700';
const depths = [
  ['focused', 'Tập trung', 'Trả lời trực tiếp, bổ sung khi cần.'],
  ['deep', 'Phân tích sâu', 'Nhiều góc nhìn hữu ích trong phạm vi đã chọn.'],
  ['comprehensive', 'Phân tích toàn diện', 'Mở rộng các domain liên quan khi dữ liệu cho phép.'],
];

export const AnalysisInputForm: React.FC<{ capabilities: any; prompt: string; domain: string; time: string; depth: string; start: string; end: string; scope: any; disabled: boolean; onPrompt: (v: string) => void; onDomain: (v: string) => void; onTime: (v: string) => void; onDepth: (v: string) => void; onStart: (v: string) => void; onEnd: (v: string) => void; onScope: (v: any) => void; onSubmit: () => void }> = p => {
  const [dimension, setDimension] = useState('');
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<any[]>([]);
  const [lookupError, setLookupError] = useState('');
  const selected = (p.capabilities?.scope_types || []).find((s: any) => s.id === dimension);
  useEffect(() => {
    setMatches([]); setLookupError('');
    if (p.scope.mode !== 'selected' || !selected?.searchable || search.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ai/scope-values?dimension=${encodeURIComponent(dimension)}&search=${encodeURIComponent(search.trim())}`, { signal: controller.signal });
        if (!res.ok) throw new Error();
        const data = await res.json(); setMatches(data.values || []);
      } catch (e: any) { if (e.name !== 'AbortError') setLookupError('Chưa thể tra cứu. Hãy thử lại hoặc chọn Tự động.'); }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [dimension, search, selected?.searchable, p.scope.mode]);
  const addValue = (value: any) => {
    const filters = p.scope.filters || [];
    const current = filters.find((f: any) => f.dimension === dimension);
    const values = [...new Set([...(current ? (Array.isArray(current.value) ? current.value : [current.value]) : []), value])];
    p.onScope({ mode: 'selected', filters: [...filters.filter((f: any) => f.dimension !== dimension), { dimension, operator: values.length > 1 ? 'in' : 'eq', value: values.length > 1 ? values : values[0] }] });
  };
  return <fieldset aria-label="Đầu vào phân tích" disabled={p.disabled} className="space-y-4 min-w-0">
    <div data-analysis-input="question"><label htmlFor="analysis-question" className="text-sm font-semibold">Câu hỏi phân tích</label>
      <textarea id="analysis-question" required value={p.prompt} disabled={p.disabled} onChange={e => p.onPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !p.disabled && p.prompt.trim()) { e.preventDefault(); p.onSubmit(); } }} rows={3} placeholder="Bạn muốn tìm hiểu điều gì từ dữ liệu?" className={`${selectClass} mt-1 resize-none`} />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div data-analysis-input="domain"><label htmlFor="analysis-domain" className="text-xs font-semibold">Miền dữ liệu</label>
        <select id="analysis-domain" disabled={p.disabled} value={p.domain} onChange={e => p.onDomain(e.target.value)} className={selectClass}>
          <option value="auto">Tự động</option><option value="multi">Nhiều miền dữ liệu</option>
          {(p.capabilities?.domains || []).map((d: any) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        {!p.capabilities && <p className="text-xs text-slate-500 mt-1">Danh mục chưa sẵn sàng; bạn vẫn có thể dùng Tự động.</p>}
      </div>
      <div data-analysis-input="time"><label htmlFor="analysis-time" className="text-xs font-semibold">Thời gian</label>
        <select id="analysis-time" disabled={p.disabled} value={p.time} onChange={e => p.onTime(e.target.value)} className={selectClass}>
          {(p.capabilities?.time_presets || [{ id: 'auto', label: 'Tự động' }, { id: 'all_time', label: 'Toàn bộ thời gian' }, { id: 'custom', label: 'Tùy chọn' }]).map((t: any) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {p.time === 'custom' && <div className="flex gap-2 mt-2"><input aria-label="Từ ngày" type="date" required value={p.start} max={p.end || undefined} onChange={e => p.onStart(e.target.value)} className={selectClass} /><input aria-label="Đến ngày" type="date" required value={p.end} min={p.start || undefined} onChange={e => p.onEnd(e.target.value)} className={selectClass} /></div>}
      </div>
      <div data-analysis-input="scope"><label htmlFor="analysis-scope" className="text-xs font-semibold">Phạm vi phân tích</label>
        <select id="analysis-scope" disabled={p.disabled} value={p.scope.mode} onChange={e => p.onScope({ mode: e.target.value, filters: [] })} className={selectClass}>
          <option value="auto">Tự động</option><option value="all">Toàn hệ thống</option><option value="selected" disabled={!p.capabilities?.scope_types?.length}>Chọn phạm vi cụ thể</option>
        </select>
        {p.scope.mode === 'selected' && <div className="space-y-2 mt-2">
          <select aria-label="Loại phạm vi" value={dimension} onChange={e => { setDimension(e.target.value); setSearch(''); }} className={selectClass}><option value="">Chọn loại phạm vi</option>{(p.capabilities?.scope_types || []).map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          {selected?.values?.length > 0 && <select aria-label="Giá trị phạm vi" value="" onChange={e => { if (e.target.value) addValue(selected.values[Number(e.target.value) - 1]); }} className={selectClass}><option value="">Thêm giá trị</option>{selected.values.map((v: any, i: number) => <option key={i} value={i + 1}>{String(v)}</option>)}</select>}
          {selected?.searchable && <input aria-label="Tìm giá trị phạm vi" maxLength={80} value={search} onChange={e => setSearch(e.target.value)} placeholder="Nhập ít nhất 2 ký tự để tra cứu" className={selectClass} />}
          {matches.map((m: any, i: number) => <button type="button" key={i} onClick={() => addValue(m.value)} className="text-xs rounded border px-2 py-1 mr-1">{m.label}</button>)}
          {lookupError && <p role="status" className="text-xs text-amber-700">{lookupError}</p>}
          {(p.scope.filters || []).map((f: any) => <button type="button" key={f.dimension} onClick={() => p.onScope({ mode: 'selected', filters: p.scope.filters.filter((v: any) => v.dimension !== f.dimension) })} className="text-xs rounded bg-indigo-50 px-2 py-1 mr-1">{p.capabilities?.scope_types?.find((s: any) => s.id === f.dimension)?.label}: {Array.isArray(f.value) ? f.value.join(', ') : String(f.value)} ×</button>)}
        </div>}
      </div>
      <div data-analysis-input="depth"><label htmlFor="analysis-depth" className="text-xs font-semibold">Độ sâu phân tích</label>
        <select id="analysis-depth" disabled={p.disabled} value={p.depth} onChange={e => p.onDepth(e.target.value)} className={selectClass}>{depths.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <p className="text-xs text-slate-500 mt-1">{depths.find(([id]) => id === p.depth)?.[2]}</p>
      </div>
    </div>
  </fieldset>;
};
