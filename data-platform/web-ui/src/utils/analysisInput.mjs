/** Natural input and compatibility payloads keep their boundaries explicit. */
export function analysisInputPayload({ question, prompt, context = '', expectation = '', moduleId, domain = 'auto', time = 'auto', start = '', end = '', scope = { mode: 'auto', filters: [] }, depth = 'deep' }) {
  const text = question ?? prompt ?? '';
  if (!text.trim()) throw new Error('Vui lòng nhập câu hỏi phân tích.');
  if (time === 'custom' && (!start || !end || start > end)) throw new Error('Vui lòng chọn khoảng ngày hợp lệ.');
  const period = time === 'custom' ? { mode: time, start, end } : { mode: time };
  if (question !== undefined) return { question: text.trim(), time: period,
    ...(context.trim() ? { analysis_context: context.trim() } : {}),
    ...(expectation.trim() ? { analysis_expectation: expectation.trim() } : {}),
    ...(moduleId ? { analysis_module_id: moduleId } : {}) };
  if (scope.mode === 'selected' && !scope.filters?.length) throw new Error('Vui lòng chọn giá trị phạm vi.');
  return { prompt: text.trim(), domain, time_range: period, analysis_scope: scope, analysis_depth: depth };
}
