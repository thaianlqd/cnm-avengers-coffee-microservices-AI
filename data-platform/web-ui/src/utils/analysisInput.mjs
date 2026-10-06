/** Structured user choices; the server/model owns analytical meaning. */
export function analysisInputPayload({ prompt, domain = 'auto', time = 'auto', start = '', end = '', scope = { mode: 'auto', filters: [] }, depth = 'deep' }) {
  if (!prompt.trim()) throw new Error('Vui lòng nhập câu hỏi phân tích.');
  if (time === 'custom' && (!start || !end || start > end)) throw new Error('Vui lòng chọn khoảng ngày hợp lệ.');
  if (scope.mode === 'selected' && !scope.filters?.length) throw new Error('Vui lòng chọn giá trị phạm vi.');
  return { prompt: prompt.trim(), domain, time_range: time === 'custom' ? { mode: time, start, end } : { mode: time }, analysis_scope: scope, analysis_depth: depth };
}
