import React from 'react';
import { modeOptions, valueModeOptions, nextState, selectViewVariant, reasonLabel } from '../../utils/chartViewModes.mjs';

/** So sánh / Tổng gộp / Xem riêng for one chart. Local only ("Chỉ biểu đồ này"); applying a member to the whole
 * report goes through the existing server workspace revision (pending filter → Apply). */
export const ChartViewControls: React.FC<{ chart: any; state: any; onChange: (state: any) => void; disabled?: boolean; onApplyReport?: (memberKey: string) => void }> = ({ chart, state, onChange, disabled, onApplyReport }) => {
  const modes = chart.view_modes;
  const active = selectViewVariant(modes, state);
  const change = (patch: any) => onChange(nextState(modes, state, patch));
  const values = valueModeOptions(modes, state);
  const btn = (on: boolean) => `rounded-md px-2.5 py-1 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${on ? 'bg-blue-600 text-white' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'} disabled:cursor-not-allowed disabled:opacity-40`;
  const isDefault = active?.id === modes.default_variant;
  return <div data-view-controls className="mb-2 space-y-1.5 rounded-xl bg-slate-50 px-2.5 py-2">
    <div role="group" aria-label={`Chế độ xem: ${chart.title}`} className="flex flex-wrap items-center gap-1">
      {modeOptions(modes).map((m: any) => <button key={m.id} type="button" data-view-mode={m.id} aria-pressed={state.mode === m.id} disabled={disabled || !m.available}
        title={m.available ? undefined : reasonLabel(m.reason)} onClick={() => change({ mode: m.id })} className={btn(state.mode === m.id)}>{m.label}</button>)}
      {values.length > 1 && <select aria-label="Cách tính giá trị" data-value-mode value={state.valueMode} disabled={disabled} onChange={e => change({ valueMode: e.target.value })}
        className="ml-auto max-w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[11px]">{values.map((v: any) => <option key={v.id} value={v.id}>{v.label}</option>)}</select>}
    </div>
    {state.mode === 'single' && <div role="group" aria-label={`Chọn ${modes.axis_label}`} className="flex flex-wrap items-center gap-1">
      {modes.members.map((m: any) => <button key={m.key} type="button" data-view-member={m.key} aria-pressed={state.member === m.key} disabled={disabled}
        onClick={() => change({ member: m.key })} className={btn(state.member === m.key)}>{m.label}</button>)}
      {onApplyReport && <button type="button" data-apply-report disabled={disabled} onClick={() => onApplyReport(state.member)}
        className="ml-auto rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">Áp dụng cho toàn báo cáo (thêm lọc chờ)</button>}
    </div>}
    {modes.breakdown && state.mode === 'compare' && <label className="flex flex-wrap items-center gap-1 text-[11px] text-slate-600">{modes.breakdown.label}
      <select aria-label={modes.breakdown.label} data-view-breakdown value={state.breakdown ?? ''} disabled={disabled} onChange={e => change({ breakdown: e.target.value })}
        className="rounded-md border border-slate-200 bg-white px-1.5 py-1">{modes.breakdown.options.map((o: any) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>}
    <p data-view-caption className="flex flex-wrap items-center gap-x-2 text-[10.5px] text-slate-500">
      <span className="rounded bg-white px-1.5 py-0.5 font-medium text-slate-700">Chỉ biểu đồ này</span>
      <span>{active?.payload?.caption}</span>
      {!isDefault && <button type="button" data-view-reset disabled={disabled} onClick={() => onChange({ ...nextState(modes, state, {}), ...defaultFrom(modes) })} className="text-blue-700 underline">Đặt lại</button>}
    </p>
  </div>;
};

function defaultFrom(modes: any) {
  const v = modes.variants.find((x: any) => x.id === modes.default_variant);
  return { mode: v.spec.mode, member: v.spec.member ?? null, valueMode: v.spec.value_mode || 'absolute', breakdown: v.spec.breakdown ? v.spec.breakdown[1] : null };
}
