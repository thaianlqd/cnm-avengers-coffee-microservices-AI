// V3.1 Analyst Workspace presentation. Every capability, limit, mission,
// template and threshold comes from /api/ai/capabilities; nothing here is a
// separate catalog. Numbers shown are server-verified; this module only
// formats them and computes presentation-level differences from verified rows.

const viNumber = (value, digits = 1) => Number(value).toLocaleString('vi-VN', { maximumFractionDigits: digits });

export function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
}

/** Compact vi-VN magnitude without truncation ("777,4 triệu", "1,2 tỷ"). */
export function formatMagnitude(value, unit = '') {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value), abs = Math.abs(n);
  const scaled = abs >= 1e9 ? `${viNumber(n / 1e9)} tỷ` : abs >= 1e6 ? `${viNumber(n / 1e6)} triệu` : abs >= 1e4 ? `${viNumber(n / 1e3)} nghìn` : viNumber(n, 2);
  return unit && unit !== 'VND' ? `${scaled} ${unit}` : unit === 'VND' ? `${scaled} đ` : scaled;
}

export function formatValue(value, unit = '') {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  if (unit === '%') return `${viNumber(value)}%`;
  if (unit === 'VND') return `${Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} đ`;
  return `${viNumber(value, 2)}${unit ? ' ' + unit : ''}`;
}

export function coverageSummary(capabilities) {
  const c = capabilities?.data_coverage;
  if (!c || c.status === 'loading') return { status: 'loading', range: 'Đang tải phạm vi dữ liệu…', freshness: 'Cập nhật theo đợt', lastSync: '—', stale: false, facts: [] };
  if (c.status !== 'ready') return { status: 'unavailable', range: 'Chưa xác định phạm vi dữ liệu', freshness: c.freshness?.label || 'Cập nhật theo đợt', lastSync: '—', stale: false, facts: [] };
  const facts = Object.values(c.facts || {}).filter(f => f.max_date).map(f => ({ label: f.label, range: `${formatDate(f.min_date)} → ${formatDate(f.max_date)}`, max: f.max_date }));
  const lagging = facts.filter(f => c.overall.max_date && f.max < c.overall.max_date);
  return { status: 'ready', range: `${formatDate(c.overall.min_date)} → ${formatDate(c.overall.max_date)}`,
    freshness: c.freshness?.label || 'Cập nhật theo đợt', lastSync: formatDateTime(c.freshness?.last_sync), stale: Boolean(c.freshness?.stale),
    facts, lagging: lagging.map(f => `${f.label} đến ${formatDate(f.max)}`) };
}

/** V3.3: seven product modes = free form + the server-visible missions. Hidden ones stay resolvable. */
export function missionCards(capabilities) {
  return (capabilities?.missions || []).filter(m => m.visible !== false).map(m => ({ id: m.id, label: m.label, description: m.description, status: m.status,
    disabled: m.status === 'unavailable', reason: m.reason, caveat: m.caveat, examples: m.examples || [] }));
}

export function metricIndex(capabilities) {
  return Object.fromEntries((capabilities?.metrics || []).map(m => [m.id, m]));
}

/** Metrics a mission may use (server-computed eligibility) with their compatible dimensions. */
export function missionMetrics(capabilities, missionId) {
  const mission = (capabilities?.missions || []).find(m => m.id === missionId);
  const index = metricIndex(capabilities);
  return (mission?.metrics || []).map(id => index[id]).filter(Boolean);
}

export function monthOptions(capabilities, count = 12) {
  const max = capabilities?.data_coverage?.overall?.max_date, min = capabilities?.data_coverage?.overall?.min_date;
  const pattern = capabilities?.phrases?.time?.month;
  if (!max || !pattern) return [];
  const out = [];
  let [y, m] = max.split('-').map(Number);
  for (let i = 0; i < count; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (min && key < min.slice(0, 7)) break;
    out.push({ id: key, label: `Tháng ${m}/${y}`, phrase: pattern.replace('{month}', m).replace('{year}', y) });
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

export function timeOptions(capabilities) {
  const rolling = capabilities?.phrases?.time?.rolling_days;
  return [{ id: 'none', label: 'Theo câu hỏi', phrase: '' },
    ...(rolling ? [7, 30, 90].map(n => ({ id: `r${n}`, label: `${n} ngày gần nhất`, phrase: rolling.replace('{n}', n) })) : []),
    ...monthOptions(capabilities)];
}

const lower = text => (text || '').charAt(0).toLowerCase() + (text || '').slice(1);

/** Fill the governed Vietnamese template. Returns '' when a required slot is missing. */
export function buildQuestion(capabilities, missionId, slots = {}) {
  const mission = (capabilities?.missions || []).find(m => m.id === missionId);
  if (!mission?.template) return '';
  const index = metricIndex(capabilities);
  const metric = index[slots.metric], metricB = index[slots.metric_b];
  const dimension = metric?.dimensions?.find(d => d.id === slots.dimension) || (capabilities?.metrics || []).flatMap(m => m.dimensions).find(d => d.id === slots.dimension);
  const cadence = capabilities?.phrases?.cadence?.[slots.cadence];
  const values = {
    metric: metric ? (mission.template.text.startsWith('{metric}') ? metric.label : lower(metric.label)) : '',
    metric_b: metricB ? lower(metricB.label) : '', dimension: dimension ? lower(dimension.label) : '',
    value_a: slots.value_a || '', value_b: slots.value_b || '', time: slots.time || '', n: slots.n ? String(slots.n) : '',
    granularity: capabilities?.phrases?.granularity?.[slots.granularity] || '', horizon: slots.horizon ? String(slots.horizon) : '',
    cadence: cadence || '', scope: slots.scope || '',
  };
  const required = (mission.template.slots || []).filter(s => s !== 'time' && s !== 'scope');
  if (required.some(s => !values[s])) return '';
  return mission.template.text.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '').replace(/\s+/g, ' ').replace(/\s+([?.,])/g, '$1').trim();
}

/** Default slot values for a mission/metric, all from server metadata. */
export function templateDefaults(capabilities, missionId, metric) {
  const month = monthOptions(capabilities, 2)[1] || monthOptions(capabilities, 1)[0];
  const dimension = metric?.dimensions?.[0];
  const labels = capabilities?.dimension_value_labels?.[dimension?.id];
  const values = labels ? labels.map(v => v.label) : ((capabilities?.scope_types || []).find(t => t.id === dimension?.id)?.values || []).map(String);
  const cadence = metric?.forecast?.cadences?.includes('month') ? 'month' : metric?.forecast?.cadences?.[0];
  return { metric: metric?.id, dimension: dimension?.id, value_a: values[0], value_b: values[1], n: 5, granularity: 'week',
    cadence, horizon: cadence ? Math.min(3, metric.forecast.max_horizon[cadence]) : 3, time: month?.phrase || '', timeId: month?.id || '' };
}

/** Real example questions: mission examples plus governed template questions. */
export function suggestionChips(capabilities, missionId, limit = 6) {
  const missions = capabilities?.missions || [];
  const selected = missions.find(m => m.id === missionId);
  if (!selected) return [...new Set(missions.filter(m => m.status !== 'unavailable').flatMap(m => (m.examples || []).slice(0, 1)))].slice(0, limit);
  const generated = missionMetrics(capabilities, missionId).slice(0, limit * 2)
    .map(m => buildQuestion(capabilities, missionId, templateDefaults(capabilities, missionId, m))).filter(Boolean);
  return [...new Set([...(selected.examples || []), ...generated])].slice(0, limit);
}

/** Searchable "Hỏi được gì?" groups: domains → metrics with badges and dimensions. */
export function capabilityGroups(capabilities, search = '') {
  const term = search.trim().toLocaleLowerCase('vi');
  const match = text => !term || String(text || '').toLocaleLowerCase('vi').includes(term);
  return (capabilities?.domains || []).map(d => ({
    id: d.id, label: d.label, purpose: d.purpose, caveats: d.caveats || [],
    metrics: (d.metrics || []).filter(m => match(d.label) || match(m.label) || match(m.definition) || (m.dimensions || []).some(x => match(x.label)))
      .map(m => ({ ...m, badges: [m.historical ? 'Có xu hướng' : 'Hiện tại', ...(m.forecastable ? ['Dự báo được'] : []),
        ...((capabilities?.risk_signals || []).some(s => s.metric === m.id) ? ['Tín hiệu rủi ro'] : []),
        ...(m.dimensions && !m.dimensions.length ? ['Chỉ toàn phạm vi'] : []),
        ...additivityBadges(m.capability)] })),
    examples: d.example_questions || [],
  })).filter(g => g.metrics.length);
}

export function unsupportedItems(capabilities, search = '') {
  const term = search.trim().toLocaleLowerCase('vi');
  return (capabilities?.unsupported || []).filter(u => !term || u.concepts.some(c => c.toLocaleLowerCase('vi').includes(term)) || (u.limitation || '').toLocaleLowerCase('vi').includes(term));
}

// --- Result dashboard -------------------------------------------------------

const TAB_LABELS = { all: 'Tất cả', trend: 'Diễn biến', composition: 'Cơ cấu', comparison: 'So sánh', ranking: 'Xếp hạng', forecast: 'Dự báo', risk: 'Rủi ro' };

/** Reorder existing chart tabs by mission priority; adds Dự báo/Rủi ro when present. */
export function missionTabs(tabs = [], layout, extras = {}) {
  const all = [...tabs];
  if (extras.forecast) all.push({ id: 'forecast', label: TAB_LABELS.forecast, charts: [] });
  if (extras.risk) all.push({ id: 'risk', label: TAB_LABELS.risk, charts: [] });
  if (!layout?.tab_order) return all;
  const rank = id => { const i = layout.tab_order.indexOf(id); return i < 0 ? layout.tab_order.length + 1 : i; };
  return [...all].sort((a, b) => rank(a.id) - rank(b.id));
}

export function orderChartsByMission(charts = [], layout) {
  if (!layout?.chart_order?.length) return charts;
  const position = new Map(layout.chart_order.map((id, i) => [id, i]));
  return [...charts].sort((a, b) => (position.get(a.id) ?? 999) - (position.get(b.id) ?? 999));
}

/** A vs B difference from verified rows (presentation arithmetic only). */
export function groupDifference(rows = [], labelField, valueField, unit = '') {
  const valid = rows.filter(r => Number.isFinite(Number(r[valueField])));
  if (valid.length !== 2) return null;
  const [a, b] = [...valid].sort((x, y) => Number(y[valueField]) - Number(x[valueField]));
  const high = Number(a[valueField]), low = Number(b[valueField]);
  const label = r => String(r[labelField] ?? '—');
  if (unit === '%') return { high: label(a), low: label(b), text: `${label(a)} cao hơn ${viNumber(high - low)} điểm %`, points: high - low };
  if (!low) return { high: label(a), low: label(b), text: `${label(a)} cao hơn ${label(b)}`, pct: null };
  const pct = (high - low) / Math.abs(low) * 100;
  return { high: label(a), low: label(b), pct, text: `${label(a)} cao hơn ${viNumber(pct)}%` };
}

export function kpiStrip(highlights = [], report = {}) {
  const period = (report.analysis_explanation || [])[0]?.period;
  const context = period?.start ? `${formatDate(period.start)} → ${formatDate(period.end)}` : 'Toàn bộ dữ liệu hiện có';
  return highlights.slice(0, 4).map(card => ({ label: card.label, value: formatValue(card.value, card.unit), unit: card.unit,
    comparison: card.feature === 'change' ? `${card.value >= 0 ? '▲' : '▼'} ${viNumber(Math.abs(card.value))}%` : null,
    direction: card.feature === 'change' ? (card.value >= 0 ? 'up' : 'down') : null,
    context: card.sub_text || context, evidence_id: card.evidence_id }));
}

export function reportContext(report = {}, capabilities) {
  const op = (report.analysis_explanation || [])[0] || {};
  const mission = (capabilities?.missions || []).find(m => m.id === report.analysis_mission);
  const filters = (op.filters || []).map(f => `${f.label}: ${Array.isArray(f.value) ? f.value.join(', ') : f.value}`);
  return { question: report.prompt || '', mission: mission?.label || null,
    scope: filters.length ? filters.join(' · ') : 'Toàn hệ thống',
    time: op.period?.start ? `${formatDate(op.period.start)} → ${formatDate(op.period.end)}` : 'Toàn bộ dữ liệu hiện có',
    sources: [...new Set((report.analysis_explanation || []).flatMap(o => o.data_sources || []))] };
}

export function metricDefinition(capabilities, metricId) {
  const m = metricIndex(capabilities)[metricId];
  return m ? { label: m.label, unit: m.unit, definition: m.definition } : null;
}

// --- Risk Watch ---------------------------------------------------------------

const RISK_TONES = { red: 'red', yellow: 'yellow', green: 'green', no_data: 'gray', insufficient_sample: 'gray', not_applicable: 'gray', execution_error: 'gray' };

export function riskRows(result) {
  return (result?.signals || []).map(s => ({ id: s.id, label: s.label, metric: s.metric_label, definition: s.definition,
    value: s.value == null ? '—' : formatValue(s.value, s.unit), threshold: `${s.operator_symbol} ${formatValue(s.threshold, s.unit)}`,
    status: s.status, statusLabel: s.status_label, tone: RISK_TONES[s.status] || 'gray', note: s.note,
    breach: s.breakdown ? `${s.breakdown.groups_in_breach}/${s.breakdown.groups_evaluable ?? s.breakdown.groups_total} ${String(s.breakdown.dimension_label).toLowerCase()} vượt ngưỡng` : null,
    worst: s.breakdown?.worst || [] }));
}

export function riskBreachChart(result) {
  return (result?.signals || []).filter(s => s.breakdown?.groups_in_breach).map(s => ({ label: s.label, value: s.breakdown.groups_in_breach }));
}

/** V3.2 Risk report summary: status, top entities and deterministic drill-downs (0 AI calls). */
export function riskSummary(result) {
  const signals = result?.signals || [];
  const breached = signals.filter(s => s.status === 'red');
  // A healthy whole-scope value must not hide groups in breach.
  const entities = signals.filter(s => s.breakdown?.groups_in_breach).flatMap(s => (s.breakdown?.worst || []).map(w => ({ signal: s.label, label: w.label ?? w.group ?? w.value_label, value: formatValue(w.value, s.unit) })))
    .filter(e => e.label != null).slice(0, 3);
  const followUps = signals.filter(s => s.status === 'red' || s.breakdown?.groups_in_breach).slice(0, 2).flatMap(s => [
    { scope: result.scope || [], time: result.time, mission: 'ranking', text: `Top 5 ${String(s.breakdown?.dimension_label || 'chi nhánh').toLowerCase()} có ${String(s.metric_label).toLowerCase()} ${(s.bad_direction === 'below' || ['lt','lte'].includes(s.operator)) ? 'thấp' : 'cao'} nhất` },
    ...(s.historical ? [{ scope: result.scope || [], time: result.time, mission: 'trend', text: `Xu hướng ${String(s.metric_label).toLowerCase()} theo tuần` }] : []),
  ]);
  const failed = signals.filter(s => s.status === 'execution_error').length;
  const measured = signals.filter(s => ['red','yellow','green'].includes(s.status));
  const unavailable = signals.length - measured.length;
  const status = breached.length ? 'red' : entities.length || signals.some(s => s.status === 'yellow') ? 'yellow' : unavailable || !measured.length ? 'gray' : 'green';
  return { status, breached: breached.length, total: measured.length, selected: signals.length, unavailable, failed,
    headline: breached.length ? `${breached.length} tín hiệu vượt ngưỡng cần kiểm tra` : entities.length ? 'Toàn phạm vi trong ngưỡng nhưng có nhóm vượt ngưỡng' : failed ? `${failed} tín hiệu chưa tính được; chưa thể kết luận trong ngưỡng` : signals.some(s => s.status === 'yellow') ? 'Không vượt ngưỡng, có tín hiệu sát ngưỡng' : unavailable || !measured.length ? 'Chưa đủ dữ liệu/quan sát để kết luận toàn phạm vi trong ngưỡng' : 'Các tín hiệu đều trong ngưỡng',
    entities, followUps: [...new Map(followUps.map(f => [f.text, f])).values()].slice(0, 4) };
}

/** A stored/legacy mission id that is no longer a visible mode maps to its visible target (null = free form). */
export function visibleMissionId(capabilities, missionId) {
  if (!missionId) return null;
  const m = (capabilities?.missions || []).find(x => x.id === missionId);
  if (!m || m.visible !== false) return missionId;
  return m.maps_to || null;
}

/** Server-owned additivity (V3.3 metric capability) as user-readable badges; the UI never infers it. */
export function additivityBadges(capability) {
  if (!capability) return [];
  const out = [];
  if (capability.semantics === 'average' || capability.semantics === 'ratio') out.push('Không cộng giữa các nhóm');
  else if ((capability.non_additive_over || []).includes('time')) out.push('Không cộng qua thời gian');
  return out;
}
