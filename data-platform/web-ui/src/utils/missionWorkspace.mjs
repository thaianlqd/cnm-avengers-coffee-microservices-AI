// V3.2 mission workspace logic. Pure functions, no fetch: the server owns
// contracts, metrics, compatibility and validation; this module only keeps the
// UI state consistent with the selected mission and builds payloads.

import { missionMetrics, monthOptions } from './workspacePresentation.mjs';

export const FREE_TEXT = '__free_text__';

/** Mission switch never carries the old mission's question into the new one. */
export function switchMissionDraft(drafts = {}, from, to, current = {}) {
  const fromKey = from || FREE_TEXT, toKey = to || FREE_TEXT;
  const saved = { ...drafts, [fromKey]: { prompt: current.prompt || '', guided: current.guided || null } };
  const next = saved[toKey] || { prompt: '', guided: null };
  return { drafts: saved, prompt: next.prompt, guided: next.guided,
    // Everything derived from the old mission is stale and must be cleared.
    reset: { preflight: true, risk: true, plan: true, report: true, clarification: true } };
}

/** The mission's governed input contract (from /capabilities). */
export function missionContract(capabilities, missionId) {
  const mission = (capabilities?.missions || []).find(m => m.id === missionId);
  return mission?.input_contract || null;
}

/** Ordered controls a mission shows; only slots its contract declares. */
export function missionControls(capabilities, missionId) {
  const contract = missionContract(capabilities, missionId);
  if (!contract) return [];
  const slots = new Set([...(contract.required || []), ...(contract.optional || [])]);
  const order = ['direction', 'n', 'metric', 'metric_b', 'dimension', 'group_a', 'group_b', 'granularity', 'horizon', 'cadence', 'signals', 'time', 'scope'];
  return order.filter(s => slots.has(s)).map(id => ({ id, required: (contract.required || []).includes(id) }));
}

const lower = text => (text || '').charAt(0).toLowerCase() + (text || '').slice(1);

/** Guided period options → request time ranges (never free-form text). */
export function periodOptions(capabilities) {
  return [
    ...monthOptions(capabilities).map(m => {
      const [y, mo] = m.id.split('-').map(Number);
      const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      return { id: m.id, label: m.label, phrase: m.phrase, time: { mode: 'custom', start: `${m.id}-01`, end: `${m.id}-${String(last).padStart(2, '0')}` } };
    }),
    { id: '30d', label: '30 ngày gần nhất', phrase: '30 ngày gần nhất', time: { mode: '30d' } },
    { id: '7d', label: '7 ngày gần nhất', phrase: '7 ngày gần nhất', time: { mode: '7d' } },
    { id: 'all_time', label: 'Toàn bộ dữ liệu', phrase: 'toàn bộ thời gian', time: { mode: 'all_time' } },
  ];
}

/** Default slots for a mission, all from server metadata. */
export function defaultSlots(capabilities, missionId) {
  const metrics = missionMetrics(capabilities, missionId);
  const metric = metrics[0];
  const cadence = metric?.forecast?.cadences?.includes('month') ? 'month' : metric?.forecast?.cadences?.[0];
  const period = periodOptions(capabilities)[1] || periodOptions(capabilities)[0];
  return { metric: metric?.id || '', metric_b: '', dimension: '', group_a: '', group_b: '', n: 5, direction: 'top',
    granularity: 'week', cadence: cadence || '', horizon: cadence ? Math.min(3, metric.forecast.max_horizon[cadence]) : 3,
    period: period?.id || 'all_time', signals: (capabilities?.risk_signals || []).filter(s => s.available).map(s => s.id) };
}

/** Values a compare group may take for a dimension (labels or scope values). */
export function dimensionValues(capabilities, dimension) {
  const labelled = capabilities?.dimension_value_labels?.[dimension];
  if (labelled) return labelled.map(v => ({ value: String(v.value), label: v.label }));
  const scope = (capabilities?.scope_types || []).find(s => s.id === dimension);
  return (scope?.values || []).map(v => ({ value: String(v), label: String(v) }));
}

/**
 * Build the guided payload fragment + a human-readable echo, or a reason it
 * is incomplete. The echo is display only; the server validates the contract.
 */
export function buildGuided(capabilities, missionId, slots = {}) {
  const contract = missionContract(capabilities, missionId);
  if (!contract) return { ready: false, missing: ['mission'] };
  const metrics = Object.fromEntries((capabilities?.metrics || []).map(m => [m.id, m]));
  const required = (contract.required || []).filter(s => s !== 'time' && s !== 'scope');
  const missing = required.filter(s => slots[s] === undefined || slots[s] === '' || slots[s] === null || (Array.isArray(slots[s]) && !slots[s].length));
  if (missionId === 'compare' && slots.group_a && slots.group_a === slots.group_b) missing.push('group_b');
  if (missing.length) return { ready: false, missing };
  const period = periodOptions(capabilities).find(p => p.id === slots.period) || periodOptions(capabilities).at(-1);
  const metric = metrics[slots.metric], metricB = metrics[slots.metric_b];
  const dimension = (metric?.dimensions || []).find(d => d.id === slots.dimension);
  const label = id => (dimensionValues(capabilities, slots.dimension).find(v => v.value === id) || {}).label || id;
  const contractOut = {};
  for (const s of [...(contract.required || []), ...(contract.optional || [])]) {
    if (['time', 'scope', 'period'].includes(s) || slots[s] === undefined || slots[s] === '' || slots[s] === null) continue;
    contractOut[s] = slots[s];
  }
  const time = (contract.time_control || 'period') === 'period' ? period.phrase : '';
  const g = capabilities?.phrases?.granularity?.[slots.granularity] || '';
  const cad = capabilities?.phrases?.cadence?.[slots.cadence] || slots.cadence;
  const m = lower(metric?.label), d = lower(dimension?.label);
  const text = {
    overview: `Tình hình ${m} ${time}`,
    compare: `So sánh ${m} theo ${d} giữa ${label(slots.group_a)} và ${label(slots.group_b)} ${time}`,
    ranking: `${slots.direction === 'bottom' ? 'Bottom' : 'Top'} ${slots.n} ${d} theo ${m} ${time}`,
    trend: `Xu hướng ${m} ${g} ${time}`,
    composition: `Cơ cấu ${m} theo ${d} ${time}`,
    forecast: `Dự báo ${m} ${slots.horizon} ${cad} tới`,
    risk_watch: `Kiểm tra rủi ro vận hành ${time}`,
    relationship: `Liên hệ giữa ${m} và ${lower(metricB?.label)} theo ${d} ${time}`,
  }[missionId] || '';
  return { ready: true, question: text.replace(/\s+/g, ' ').trim(), contract: contractOut,
    time: (contract.time_control || 'period') === 'period' ? period.time : { mode: 'auto' } };
}

/** A guided contract is valid only while the visible question is its own echo. */
export function guidedActive(guided, prompt) {
  return Boolean(guided?.contract && guided.question && (prompt || '').trim() === guided.question);
}

/** Request fragment for the V3.2 workspace (guided or free text). */
export function workspaceRequestFields(guided, prompt) {
  return guidedActive(guided, prompt)
    ? { input_mode: 'guided', guided_contract: guided.contract, allow_deterministic_upgrade: true }
    : { input_mode: 'free_text', allow_deterministic_upgrade: true };
}

/** Scope recognized from the question (server preflight), shown instead of a default picker. */
export function detectedScope(preflight) {
  const u = preflight?.understood || {};
  const resolution = preflight?.scope_resolution;
  if (resolution?.state === 'resolved') {
    const bindings = resolution.bindings || [];
    const groups = resolution.source || [];
    const filters = bindings.map(b => ({kind:'filter',label: `${groups.map(g => g.label || g.id).join(' · ') || 'Phạm vi đã nhận diện'} · ${b.members.length} tỉnh/thành trong danh mục kho`}));
    return {filters,axes:(u.dimensions || []).map(d => ({kind:'axis',label:`Theo ${String(d.label).toLowerCase()}`})),summary:filters.map(f=>f.label).join(' · ')};
  }
  if (resolution && ['needs_interpretation','needs_clarification','unsupported'].includes(resolution.state))
    return {filters:[],axes:[],summary:`Phạm vi đang cần xác minh: ${resolution.requested_phrase || resolution.message || ''}`};
  const filters = (u.filters || []).map(f => ({ kind: 'filter', label: `${f.label}: ${f.display}` }));
  const axes = (u.dimensions || []).map(d => ({ kind: 'axis', label: `Theo ${String(d.label).toLowerCase()}` }));
  return { filters, axes, summary: filters.length ? filters.map(f => f.label).join(' · ') : 'Toàn hệ thống (chưa nêu phạm vi trong câu hỏi)' };
}

export function depthOptions(capabilities) {
  return (capabilities?.analysis_depths || []).map(d => ({ ...d, short: String(d.label).replace('Phân tích toàn diện', 'Toàn diện') }));
}

// --- V3.3 state isolation: one pure place decides what a workspace edit invalidates ---
const SEMANTIC_KEYS = ['mission', 'prompt', 'guided', 'time', 'start', 'end', 'scope', 'depth'];

/**
 * An edit that changes the meaning of the request (question, mission, period, scope, depth)
 * invalidates any proposed plan, clarification and report, and every in-flight response.
 * Returns { invalidate: boolean, clearReport: boolean }.
 */
export function invalidationFor(patch = {}) {
  const semantic = SEMANTIC_KEYS.some(k => k in patch);
  return { invalidate: semantic, clearReport: semantic };
}

/** A response may only be applied while the epoch it was started under is still current. */
export const isCurrentEpoch = (started, current) => started === current;

/** Active state after "new question": everything resets, saved history is kept by the caller. */
export function resetActive(epoch = 0) {
  return { epoch: epoch + 1, prompt: '', guided: null, plan: null, report: null, clarification: null,
    versions: [], activeVersion: 0, chat: [], followUp: '', step: 1, generating: false };
}

/**
 * A clarification choice is a controlled edit of the question, never an auto-submitted concatenation:
 * the clause replaces a previous clarification of the same choice, the user sees the edited question and
 * preflight re-runs before anything is sent. Returns the new question text.
 */
export function applyClarificationChoice(question = '', choice = '') {
  const clause = String(choice || '').trim().replace(/[.?!\s]+$/, '');
  const base = String(question || '').trim().replace(/[.?!\s]+$/, '');
  if (!clause) return base;
  if (!base) return clause;
  if (base.toLocaleLowerCase('vi').includes(clause.toLocaleLowerCase('vi'))) return base;  // idempotent: picking twice adds nothing
  return `${base}, ${clause.charAt(0).toLocaleLowerCase('vi')}${clause.slice(1)}`;
}

/** New request from an owned artifact group; totals/rows never become input.
 * Missing lineage, a null key or an unrepresentable scope keeps inspection read-only.
 * The server still validates the guided slots, permissions and scope on preflight/run.
 */
export function inspectedGroupDraft(report, chart, row, capabilities) {
  const ref = row?.entity_ref;
  const query = report?.analytical_queries?.find(q => q.id === ref?.query_id);
  const explained = report?.analysis_explanation?.find(q => q.query_id === ref?.query_id);
  const metric = capabilities?.metrics?.find(m => m.id === chart?.metric);
  const contract = missionContract(capabilities, 'overview');
  if (!report?.session_id || !Number.isInteger(report.revision) || !query || !explained || !metric || !contract ||
      chart.query_id !== ref.query_id || !query.metrics?.includes(metric.id) || !ref.filters ||
      !report.result_sets?.[ref.query_id]?.artifact_ref) return null;
  const keys = Object.entries(ref.filters);
  const dimensions = report.query_plans?.find(plan => plan.id === query.id)?.dimensions || query.group_by;
  if (!keys.length || keys.length !== dimensions?.length ||
      keys.some(([dimension, value]) => !dimensions.includes(dimension) ||
        !metric.dimensions?.some(d => d.id === dimension) ||
        !['string', 'number', 'boolean'].includes(typeof value) ||
        (typeof value === 'number' && !Number.isFinite(value)))) return null;
  // Retain every existing restriction. Equality for the clicked key may replace
  // an in/eq restriction only when it selects an existing member, never a wider set.
  const filters = structuredClone(query.filters || []);
  for (const [dimension, value] of keys) {
    const previous = filters.filter(f => f.dimension === dimension);
    if (previous.some(f => f.operator === 'eq' ? f.value !== value :
      f.operator === 'in' ? !Array.isArray(f.value) || !f.value.includes(value) : true)) return null;
    for (let i = filters.length - 1; i >= 0; i--) if (filters[i].dimension === dimension) filters.splice(i, 1);
    filters.push({ dimension, operator: 'eq', value });
  }
  if (filters.length > contract.max_scope_filters) return null;
  const period = explained.period;
  const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDay(period?.start) || !validDay(period?.end) || period.start > period.end) return null;
  const question = `Tình hình ${metric.label.toLocaleLowerCase('vi-VN')} từ ${period.start} đến ${period.end}`;
  return { question, mission: 'overview', guided: { question, mission: 'overview', contract: { metric: metric.id } },
    scope: { mode: 'selected', filters }, time: { mode: 'custom', start: period.start, end: period.end },
    source: { session_id: report.session_id, revision: report.revision, query_id: ref.query_id,
      artifact_id: report.result_sets[ref.query_id].artifact_ref.artifact_id, filters: structuredClone(ref.filters) } };
}

/** A lineage reference applies only while the group draft's meaning is intact. */
export function sourceAnalysisPayload(draft, input) {
  if (!draft?.source || input.moduleId || draft.question !== input.question ||
      JSON.stringify(draft.guided) !== JSON.stringify(input.guided) ||
      JSON.stringify(draft.scope) !== JSON.stringify(input.scope) ||
      JSON.stringify(draft.time) !== JSON.stringify(input.time)) return {};
  return { source_analysis: structuredClone(draft.source) };
}
