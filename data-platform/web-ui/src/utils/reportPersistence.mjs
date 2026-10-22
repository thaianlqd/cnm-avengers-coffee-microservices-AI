// V3.3: fields a saved report must keep so reopening/exporting it shows the same conclusion, caveats, evidence and
// verification state. Older saved reports simply lack them and are shown as legacy / "not measured" (never upgraded).
export const V33_SAVED_FIELDS = ['answer_requirements', 'scope_resolution', 'short_answer', 'conclusion', 'forecasts', 'verification', 'view_coverage', 'chart_insights',
  'analysis_mission', 'mission_layout', 'mission_evidence', 'follow_up_questions', 'input_mode', 'data_warnings',
  'authorized_scope','provenance','data_health', 'analysis_breadth', 'analysis_coverage', 'interaction_state', 'interaction_contract',
  'session_id', 'revision', 'semantic_intent', 'resolved_requirement_coverage', 'derived_feature_bindings', 'request_anchors',
  'quality_context', 'result_sets', 'result_contracts', 'analytical_queries', 'query_plans', 'sql_by_query', 'dashboard_plan_input', 'source_completeness'];

export function savedV33Fields(report) {
  const out = {};
  for (const key of V33_SAVED_FIELDS) if (report && report[key] !== undefined) out[key] = report[key];
  return out;
}

/** Round trip used by tests: what save keeps, reopen restores. */
export function reopenSavedReport(config) {
  return { ...(config || {}), status: 'success' };
}

/** Display only; backend ownership predicates remain authoritative. */
export function savedReportOwnership(report) {
  const owned = report?.owner_type === 'account' || /^account:[a-f0-9]{64}$/.test(String(report?.created_by || ''));
  return { owned, label: owned ? 'Báo cáo cá nhân' : 'Lưu trữ cũ · chỉ đọc, chưa xác minh' };
}
