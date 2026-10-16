import React, { useEffect, useMemo, useState } from 'react';
import { missionMetrics } from '../../utils/workspacePresentation.mjs';
import { buildGuided, defaultSlots, dimensionValues, missionControls, periodOptions } from '../../utils/missionWorkspace.mjs';

const select = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 max-w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400';
const MISSING: Record<string, string> = { metric: 'chỉ số', metric_b: 'chỉ số thứ hai', dimension: 'chiều phân tích', group_a: 'nhóm A', group_b: 'nhóm B khác nhóm A',
  n: 'số nhóm', granularity: 'chu kỳ', horizon: 'tầm dự báo', cadence: 'đơn vị dự báo', signals: 'tín hiệu rủi ro' };

/**
 * V3.2 mission builder: only the controls the mission's governed contract
 * declares. It produces canonical IDs (guided contract) plus a readable echo;
 * the server re-validates and executes it without an AI interpretation call.
 */
export const MissionInputBuilder: React.FC<{ capabilities: any; mission: string; disabled?: boolean;
  onApply: (guided: { question: string; contract: Record<string, any>; time: any; mission: string }) => void }> = ({ capabilities, mission, disabled, onApply }) => {
  const metrics = useMemo(() => missionMetrics(capabilities, mission), [capabilities, mission]);
  const controls = useMemo(() => missionControls(capabilities, mission), [capabilities, mission]);
  const [slots, setSlots] = useState<Record<string, any>>(() => defaultSlots(capabilities, mission));
  useEffect(() => { setSlots(defaultSlots(capabilities, mission)); }, [mission, capabilities]);
  const set = (key: string, value: any) => setSlots(prev => ({ ...prev, [key]: value }));
  const metric = metrics.find((m: any) => m.id === slots.metric);
  const dims = metric?.dimensions || [];
  const values = slots.dimension ? dimensionValues(capabilities, slots.dimension) : [];
  const cadences: string[] = metric?.forecast?.cadences || [];
  const maxHorizon = metric?.forecast?.max_horizon?.[slots.cadence] || 1;
  const periods = periodOptions(capabilities);
  const has = (id: string) => controls.some(c => c.id === id);
  const built = buildGuided(capabilities, mission, slots);
  if (!controls.length) return null;
  if (!metrics.length && has('metric')) return <p className="text-xs text-slate-500">Nhiệm vụ này chưa có chỉ số phù hợp trong danh mục.</p>;
  return <div data-mission-builder={mission} className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 space-y-2">
    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
      {has('direction') && <select aria-label="Chiều xếp hạng" className={select} value={slots.direction} onChange={e => set('direction', e.target.value)}><option value="top">Cao nhất</option><option value="bottom">Thấp nhất</option></select>}
      {has('n') && <select aria-label="Số nhóm" className={select} value={slots.n} onChange={e => set('n', Number(e.target.value))}>{[3, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}</select>}
      {has('metric') && <select aria-label="Chỉ số" className={select} value={slots.metric} onChange={e => setSlots(prev => ({ ...prev, metric: e.target.value, dimension: '', group_a: '', group_b: '' }))}>{metrics.map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>}
      {has('metric_b') && <><span>và</span><select aria-label="Chỉ số thứ hai" className={select} value={slots.metric_b} onChange={e => set('metric_b', e.target.value)}><option value="">Chọn chỉ số</option>{metrics.filter((m: any) => m.id !== slots.metric).map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></>}
      {has('dimension') && <><span>theo</span><select aria-label="Chiều phân tích" className={select} value={slots.dimension} onChange={e => setSlots(prev => ({ ...prev, dimension: e.target.value, group_a: '', group_b: '' }))}><option value="">Chọn chiều</option>{dims.map((d: any) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></>}
      {has('group_a') && <><span>giữa</span><select aria-label="Nhóm A" className={select} value={slots.group_a} disabled={!slots.dimension} onChange={e => set('group_a', e.target.value)}><option value="">Nhóm A</option>{values.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}</select>
        <span>và</span><select aria-label="Nhóm B" className={select} value={slots.group_b} disabled={!slots.dimension} onChange={e => set('group_b', e.target.value)}><option value="">Nhóm B</option>{values.filter(v => v.value !== slots.group_a).map(v => <option key={v.value} value={v.value}>{v.label}</option>)}</select></>}
      {has('granularity') && <select aria-label="Chu kỳ" className={select} value={slots.granularity} onChange={e => set('granularity', e.target.value)}>{Object.entries(capabilities?.phrases?.granularity || {}).map(([id, label]: any) => <option key={id} value={id}>{label}</option>)}</select>}
      {has('horizon') && <><select aria-label="Tầm dự báo" className={select} value={Math.min(slots.horizon, maxHorizon)} onChange={e => set('horizon', Number(e.target.value))}>{Array.from({ length: maxHorizon }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select>
        <select aria-label="Đơn vị dự báo" className={select} value={slots.cadence} onChange={e => set('cadence', e.target.value)}>{cadences.map(c => <option key={c} value={c}>{capabilities?.phrases?.cadence?.[c] || c}</option>)}</select><span>tới (tối đa {maxHorizon})</span></>}
      {has('time') && <><span>trong</span><select aria-label="Thời gian" className={select} value={slots.period} onChange={e => set('period', e.target.value)}>{periods.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></>}
    </div>
    {has('signals') && <fieldset className="flex flex-wrap gap-1.5 text-[11px]"><legend className="sr-only">Tín hiệu rủi ro</legend>
      {(capabilities?.risk_signals || []).filter((s: any) => s.available).map((s: any) => <label key={s.id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 cursor-pointer ${slots.signals.includes(s.id) ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>
        <input type="checkbox" className="sr-only" checked={slots.signals.includes(s.id)} onChange={() => set('signals', slots.signals.includes(s.id) ? slots.signals.filter((x: string) => x !== s.id) : [...slots.signals, s.id])} />{s.label}</label>)}
    </fieldset>}
    <div className="flex flex-wrap items-center gap-2">
      <p className="flex-1 min-w-0 text-[11px] text-slate-500">{built.ready ? <>Câu hỏi: “{built.question}” · <span className="text-emerald-700">không cần AI diễn giải</span></> : `Cần chọn: ${(built.missing || []).map(m => MISSING[m] || m).join(', ')}`}</p>
      <button type="button" disabled={disabled || !built.ready} onClick={() => built.ready && onApply({ question: built.question!, contract: built.contract!, time: built.time, mission })}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Dùng cấu hình này</button>
    </div>
  </div>;
};
