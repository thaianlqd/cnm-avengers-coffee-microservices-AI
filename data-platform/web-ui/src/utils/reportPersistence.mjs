// V3.3: fields a saved report must keep so reopening/exporting it shows the same conclusion, caveats, evidence and
// verification state. Older saved reports simply lack them and are shown as legacy / "not measured" (never upgraded).
export const V33_SAVED_FIELDS = ['answer_requirements', 'scope_resolution', 'short_answer', 'conclusion', 'forecasts', 'verification', 'view_coverage', 'chart_insights',
  'analysis_mission', 'mission_layout', 'mission_evidence', 'follow_up_questions', 'input_mode', 'data_warnings'];

export function savedV33Fields(report) {
  const out = {};
  for (const key of V33_SAVED_FIELDS) if (report && report[key] !== undefined) out[key] = report[key];
  return out;
}

/** Round trip used by tests: what save keeps, reopen restores. */
export function reopenSavedReport(config) {
  return { ...(config || {}), status: 'success' };
}
