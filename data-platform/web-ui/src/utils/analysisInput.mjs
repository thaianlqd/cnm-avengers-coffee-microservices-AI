/** Natural input and compatibility payloads keep their boundaries explicit.
 * V3.1: the workspace sends question + time + scope + depth (+ optional mission
 * hint). Context/expectation remain accepted for compatibility callers only. */
export function analysisInputPayload({ question, prompt, context = '', expectation = '', moduleId, domain = 'auto', time = 'auto', start = '', end = '', scope = { mode: 'auto', filters: [] }, depth, mission }) {
  const text = question ?? prompt ?? '';
  if (!text.trim()) throw new Error('Vui lòng nhập câu hỏi phân tích.');
  if (time === 'custom' && (!start || !end || start > end)) throw new Error('Vui lòng chọn khoảng ngày hợp lệ.');
  if (scope?.mode === 'selected' && !scope.filters?.length) throw new Error('Vui lòng chọn giá trị phạm vi.');
  const period = time === 'custom' ? { mode: time, start, end } : { mode: time };
  if (question !== undefined) return { question: text.trim(), time: period,
    ...(depth ? { analysis_depth: depth } : {}),
    ...(scope && scope.mode !== 'auto' ? { analysis_scope: scope } : {}),
    ...(mission ? { analysis_mission: mission } : {}),
    ...(context.trim() ? { analysis_context: context.trim() } : {}),
    ...(expectation.trim() ? { analysis_expectation: expectation.trim() } : {}),
    ...(moduleId ? { analysis_module_id: moduleId } : {}) };
  // Server default depth is "deep" (registry dashboard_policy.default_depth).
  return { prompt: text.trim(), domain, time_range: period, analysis_scope: scope, analysis_depth: depth || 'deep' };
}
