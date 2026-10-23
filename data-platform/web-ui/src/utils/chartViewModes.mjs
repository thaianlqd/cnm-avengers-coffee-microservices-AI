// Server-owned chart view modes (So sánh / Tổng gộp / Xem riêng). The client only SELECTS a variant the
// server already rendered and verified: no aggregation, no query, no model call happens on switch.

export const MODE_LABELS = { compare: 'So sánh', total: 'Tổng gộp', single: 'Xem riêng' };
export const VALUE_MODE_LABELS = { absolute: 'Giá trị thực', member_share: '% trong từng đối tượng', scope_share: '% trên tổng phạm vi' };

const valueMode = (spec) => spec.value_mode || 'absolute';

export function defaultViewState(viewModes, activeId) {
  const variant = (viewModes?.variants || []).find((v) => v.id === (activeId || viewModes?.default_variant));
  if (!variant) return null;
  const s = variant.spec;
  return { mode: s.mode, member: s.member ?? null, valueMode: valueMode(s), breakdown: s.breakdown ? s.breakdown[1] : null };
}

function matches(v, state, ignoreValue = false) {
  const s = v.spec;
  if (s.mode !== state.mode) return false;
  if (s.mode === 'single' && s.member !== state.member) return false;
  if (!ignoreValue && valueMode(s) !== state.valueMode) return false;
  if (s.breakdown && state.breakdown != null && String(s.breakdown[1]) !== String(state.breakdown)) return false;
  return true;
}

/** The available variant for a state; falls back to the absolute variant of the same mode/member, never to another mode. */
export function selectViewVariant(viewModes, state) {
  const variants = (viewModes?.variants || []).filter((v) => v.availability === 'available');
  if (!state) return null;
  return variants.find((v) => matches(v, state)) || variants.find((v) => matches(v, { ...state, valueMode: 'absolute' })) || null;
}

/** Mode buttons with availability + the server's typed reason when a mode cannot be shown. */
export function modeOptions(viewModes) {
  const variants = viewModes?.variants || [];
  return ['compare', 'total', 'single'].map((id) => {
    const mine = variants.filter((v) => v.spec.mode === id);
    const ok = mine.some((v) => v.availability === 'available');
    return { id, label: MODE_LABELS[id], available: ok, reason: ok ? null : (mine.find((v) => v.reason)?.reason || 'not_offered') };
  });
}

export function valueModeOptions(viewModes, state) {
  const variants = (viewModes?.variants || []).filter((v) => v.availability === 'available' && matches(v, state, true));
  return [...new Set(variants.map((v) => valueMode(v.spec)))].map((id) => ({ id, label: VALUE_MODE_LABELS[id] || id }));
}

export function nextState(viewModes, state, change) {
  const next = { ...state, ...change };
  if (change.mode === 'single' && !next.member) next.member = viewModes?.members?.[0]?.key ?? null;
  if (change.mode && change.mode !== 'single') next.member = null;
  const exact = (viewModes?.variants || []).some((v) => v.availability === 'available' && matches(v, next));
  if (!exact) next.valueMode = 'absolute';
  return next;
}

/** Chart object to render for the active variant: data, labels and insight always come from ONE variant. */
export function activeViewChart(chart, state) {
  const variant = selectViewVariant(chart?.view_modes, state);
  if (!variant) return chart;
  return { ...chart, ...variant.payload, insight: variant.insight, view_ref: variant.id, active_view: variant.spec };
}

export function reportWithViewChoice(report, chartId, state) {
  const chart = (report.charts || []).find(c => c.id === chartId);
  const variant = selectViewVariant(chart?.view_modes, state);
  if (!variant) return report;
  return { ...report, chart_view_choices: { ...report.chart_view_choices, [chartId]: variant.id },
    charts: report.charts.map(c => c.id === chartId ? activeViewChart(c, state) : c) };
}

/** Turn a governed member (possibly a union) into existing typed filter options.
 * Never send the display label as an entity key or silently apply only part of a union. */
export function memberReportSelection(modes, memberKey, interaction) {
  const member = modes?.members?.find(m => m.key === memberKey);
  if (!member || !interaction || interaction.selection_behavior !== 'population_filter') return null;
  const keys = [...new Set((member.values || [member.key]).map(String))];
  const selections = keys.map(key => interaction.options?.find(o => o.selection?.values?.length === 1 &&
    String(o.selection.values[0].value) === key)?.selection);
  if (selections.some(s => !s)) return null;
  const first = selections[0];
  if (!first || selections.some(s => s.dimension_id !== first.dimension_id || s.query_id !== first.query_id)) return null;
  return { ...first, operator: keys.length === 1 ? 'eq' : 'in', values: selections.map(s => s.values[0]) };
}

export const REASON_LABELS = {
  distinct_requires_identity_union: 'Không cộng được số đếm không trùng giữa các đối tượng',
  overlapping_members_share_unavailable: 'Các nhóm giao nhau nên không chia tỷ trọng theo tổng cộng các nhóm',
  ratio_components_missing: 'Thiếu tử/mẫu để tính tổng tỷ lệ',
  average_components_missing: 'Thiếu tử/mẫu để tính trung bình chung',
  renderer_unsupported: 'Chế độ này không có cách trình bày phù hợp',
  member_without_rows: 'Đối tượng không có dữ liệu',
  not_offered: 'Không áp dụng cho biểu đồ này',
};
export const reasonLabel = (code) => REASON_LABELS[String(code || '').split(':').pop()] || 'Không áp dụng cho biểu đồ này';
