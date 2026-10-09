export const jobStages = {
  accepted: 'Đã nhận bài toán', planning: 'Đang đọc yêu cầu', repairing: 'Đang kiểm tra cách diễn giải',
  validating: 'Đang kiểm chứng kế hoạch', executing: 'Đang lấy dữ liệu', verifying: 'Đang kiểm chứng báo cáo',
};
const terminal = new Set(['completed', 'needs_input', 'partial_available', 'insufficient_data', 'unsupported', 'failed', 'cancelled']);
export const jobStorageKey = 'avengers.analysis-job.v1';

export async function runAnalysisJob(record, { fetcher = fetch, onUpdate = () => {}, onCheckpoint = () => {}, signal,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const check = () => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };
  const json = async (url, options = {}) => {
    check();
    const response = await fetcher(url, { ...options, signal });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.detail || 'Chưa kết nối được với tác vụ phân tích.');
    }
    const data = await response.json();
    check();
    return data;
  };
  let job;
  // Record is persisted BEFORE submit. Lost submit responses are retried with
  // the same input/key, rather than starting a second paid interpretation.
  onCheckpoint(record);
  if (!record.job_id) {
    job = await json('/api/ai/analysis-jobs', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': record.key },
      body: JSON.stringify(record.input) });
    record = { ...record, job_id: job.job_id };
    onCheckpoint(record);
  }
  let failures = 0, polls = 0;
  while (true) {
    check();
    if (job) {
      onUpdate(job);
      if (terminal.has(job.state)) return job;
    }
    await wait(Math.min(1500, 350 + polls++ * 100));
    check();
    try {
      job = await json(`/api/ai/analysis-jobs/${record.job_id}`);
      failures = 0;
    } catch (error) {
      check();
      if (++failures >= 3) throw error;
    }
  }
}
