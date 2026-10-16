import React, { useEffect, useMemo, useState } from 'react';
import { missionCards, missionMetrics, buildQuestion, timeOptions, templateDefaults } from '../../utils/workspacePresentation.mjs';

const ICONS: Record<string, string> = { overview: '◎', compare: '⇄', ranking: '≡', trend: '↗', composition: '◔', forecast: '⌁', risk_watch: '⚑', relationship: '⋰' };

/** Eight governed missions; availability and reasons come from the server. */
export const MissionPicker: React.FC<{ capabilities: any; value: string | null; onChange: (id: string | null) => void; disabled?: boolean }> = ({ capabilities, value, onChange, disabled }) => {
  const cards = missionCards(capabilities);
  if (!cards.length) return null;
  return <div role="radiogroup" aria-label="Nhiệm vụ phân tích" className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
    {cards.map(card => <button key={card.id} type="button" role="radio" aria-checked={value === card.id} disabled={disabled || card.disabled}
      title={card.reason || card.description} onClick={() => onChange(value === card.id ? null : card.id)} data-mission={card.id}
      className={`text-left rounded-xl border px-3 py-2.5 transition-colors min-h-[64px] ${value === card.id ? 'border-emerald-300 bg-emerald-50 text-emerald-900 shadow-2xs' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'} disabled:opacity-45 disabled:cursor-not-allowed`}>
      <div className="flex items-center gap-1.5 text-xs font-semibold"><span aria-hidden className="text-slate-400">{ICONS[card.id] || '•'}</span>{card.label}</div>
      <div className="mt-1 text-[10.5px] leading-snug text-slate-500 line-clamp-2">{card.disabled ? card.reason : card.status === 'partial' ? card.reason : card.description}</div>
    </button>)}
  </div>;
};

const select = 'rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 max-w-full';

/** Guided template: only server-compatible metric/dimension combinations. */
export const QuestionTemplateBuilder: React.FC<{ capabilities: any; mission: string; onFill: (question: string) => void; disabled?: boolean }> = ({ capabilities, mission, onFill, disabled }) => {
  const metrics = useMemo(() => missionMetrics(capabilities, mission), [capabilities, mission]);
  const missionDef = (capabilities?.missions || []).find((m: any) => m.id === mission);
  const slots: string[] = [...(missionDef?.template?.slots || []), ...(missionDef?.template?.selectors || [])];
  const initial = () => { const d = templateDefaults(capabilities, mission, metrics[0]); return { ...d, dimension: '', value_a: '', value_b: '', time: d.timeId }; };
  const [state, setState] = useState<Record<string, any>>(initial);
  useEffect(() => { setState(initial()); }, [mission, metrics]);
  const metric = metrics.find((m: any) => m.id === state.metric);
  const dims = metric?.dimensions || [];
  const scopeType = (capabilities?.scope_types || []).find((s: any) => s.id === state.dimension);
  const labelled = capabilities?.dimension_value_labels?.[state.dimension];
  const values: string[] = labelled ? labelled.map((v: any) => v.label) : (scopeType?.values || []).map(String);
  const cadences: string[] = metric?.forecast?.cadences || [];
  const maxHorizon = metric?.forecast?.max_horizon?.[state.cadence] || 1;
  const times = timeOptions(capabilities);
  const set = (key: string, value: any) => setState(prev => ({ ...prev, [key]: value }));
  const label = (dim: string, v: any) => (capabilities?.dimension_value_labels?.[dim] || []).find((x: any) => x.value === v)?.label || String(v);
  const scopes = (capabilities?.scope_types || []).flatMap((s: any) => (s.values || []).slice(0, 12).map((v: any) => ({ id: `${s.id}:${v}`, label: `${s.label}: ${label(s.id, v)}`, phrase: label(s.id, v) })));
  const question = buildQuestion(capabilities, mission, { ...state, time: times.find(t => t.id === state.time)?.phrase || '', scope: scopes.find((s: any) => s.id === state.scope)?.phrase || 'toàn hệ thống' });
  if (!metrics.length && mission !== 'risk_watch') return <p className="text-xs text-slate-500">Nhiệm vụ này chưa có chỉ số phù hợp.</p>;
  return <div data-template-builder className="flex flex-wrap items-center gap-2 text-xs text-slate-600 rounded-xl bg-slate-50 border border-slate-200/80 p-3">
    {slots.includes('n') && <><span>Top</span><select aria-label="Số nhóm" className={select} value={state.n} onChange={e => set('n', Number(e.target.value))}>{[3, 5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}</select></>}
    {slots.includes('metric') && <select aria-label="Chỉ số" className={select} value={state.metric || ''} onChange={e => set('metric', e.target.value)}>{metrics.map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>}
    {slots.includes('metric_b') && <><span>và</span><select aria-label="Chỉ số thứ hai" className={select} value={state.metric_b || ''} onChange={e => set('metric_b', e.target.value)}><option value="">Chọn chỉ số</option>{metrics.filter((m: any) => m.id !== state.metric).map((m: any) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></>}
    {slots.includes('dimension') && <><span>theo</span><select aria-label="Chiều phân tích" className={select} value={state.dimension || ''} onChange={e => setState(prev => ({ ...prev, dimension: e.target.value, value_a: '', value_b: '' }))}><option value="">Chọn chiều</option>{dims.map((d: any) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></>}
    {slots.includes('value_a') && <><span>giữa</span><select aria-label="Nhóm A" className={select} value={state.value_a || ''} onChange={e => set('value_a', e.target.value)}><option value="">Nhóm A</option>{values.map(v => <option key={v} value={v}>{v}</option>)}</select>
      <span>và</span><select aria-label="Nhóm B" className={select} value={state.value_b || ''} onChange={e => set('value_b', e.target.value)}><option value="">Nhóm B</option>{values.filter(v => v !== state.value_a).map(v => <option key={v} value={v}>{v}</option>)}</select></>}
    {slots.includes('granularity') && <select aria-label="Chu kỳ" className={select} value={state.granularity} onChange={e => set('granularity', e.target.value)}>{Object.entries(capabilities?.phrases?.granularity || {}).map(([id, label]: any) => <option key={id} value={id}>{label}</option>)}</select>}
    {slots.includes('horizon') && <><select aria-label="Tầm dự báo" className={select} value={Math.min(state.horizon, maxHorizon)} onChange={e => set('horizon', Number(e.target.value))}>{Array.from({ length: maxHorizon }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}</select>
      <select aria-label="Đơn vị dự báo" className={select} value={state.cadence} onChange={e => set('cadence', e.target.value)}>{cadences.map(c => <option key={c} value={c}>{capabilities?.phrases?.cadence?.[c] || c}</option>)}</select><span>tới (tối đa {maxHorizon})</span></>}
    {slots.includes('scope') && <select aria-label="Phạm vi rủi ro" className={select} value={state.scope || ''} onChange={e => set('scope', e.target.value)}><option value="">Toàn hệ thống</option>{scopes.map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>}
    {slots.includes('time') && <><span>trong</span><select aria-label="Thời gian mẫu" className={select} value={state.time} onChange={e => set('time', e.target.value)}>{times.map(t => <option key={t.id} value={t.id === 'none' ? '' : t.id}>{t.label}</option>)}</select></>}
    <button type="button" disabled={disabled || !question} onClick={() => onFill(question)} className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-40">Điền vào câu hỏi</button>
    {question && <p className="basis-full text-[11px] text-slate-500">Câu hỏi sẽ là: “{question}”</p>}
  </div>;
};
