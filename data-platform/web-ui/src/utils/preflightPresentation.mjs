// Presentation of the server's deterministic preflight. The UI never decides
// what is supported: it renders findings and applies the server's fixes.

const TONES = { block: 'red', warn: 'amber', info: 'slate' };

export function preflightView(result, { pending = false, error = '' } = {}) {
  if (error) return { tone: 'slate', status: 'unavailable', label: 'Chưa kiểm tra được câu hỏi; vẫn có thể gửi, máy chủ sẽ kiểm tra lại.', blocked: false, chips: [], findings: [] };
  if (pending || !result) return { tone: 'slate', status: pending ? 'checking' : 'idle', label: pending ? 'Đang kiểm tra câu hỏi…' : '', blocked: false, chips: [], findings: [] };
  const u = result.understood || {};
  const chips = [
    // A canonical metric is THE meaning of a generic phrase; only genuinely
    // ambiguous phrases list same-name alternatives (V3.2 alias priority).
    ...(u.metrics || []).map(m => ({ kind: 'metric', label: m.label,
      hint: m.canonical ? 'chỉ số chuẩn' : m.alternatives?.length ? `${m.alternatives.length} cách hiểu khác` : '' })),
    ...(u.dimensions || []).map(d => ({ kind: 'dimension', label: `Theo ${d.label.toLowerCase()}` })),
    ...(u.filters || []).map(f => ({ kind: 'filter', label: `${f.label}: ${f.display}` })),
    ...(u.time?.start ? [{ kind: 'time', label: `${u.time.start} → ${u.time.end}` }] : []),
    ...(u.forecast?.requested ? [{ kind: 'forecast', label: u.forecast.horizon ? `Dự báo ${u.forecast.horizon} ${({ day: 'ngày', week: 'tuần', month: 'tháng', year: 'năm' })[u.forecast.unit] || 'kỳ'}` : 'Dự báo' }] : []),
    ...(u.mission ? [{ kind: 'mission', label: `Nhiệm vụ: ${u.mission.label}` }] : []),
  ];
  const findings = (result.findings || []).map(f => ({ ...f, tone: TONES[f.level] || 'slate' }));
  const blocked = result.can_submit === false;
  const warnings = findings.filter(f => f.level === 'warn').length;
  // V3.2 honest states: READY_GUIDED / READY_FOR_AI / NEEDS_INPUT / BLOCKED.
  // "Có thể gửi để AI diễn giải" is not a claim that the meaning is valid.
  const state = result.state || (blocked ? 'BLOCKED' : 'READY_FOR_AI');
  const base = result.state_label || ({ READY_GUIDED: 'Đã đủ thông tin để phân tích', READY_FOR_AI: 'Có thể gửi để AI diễn giải',
    NEEDS_INPUT: 'Cần bổ sung thông tin', BLOCKED: 'Chưa thể gửi yêu cầu này' })[state];
  const tone = state === 'BLOCKED' ? 'red' : state === 'NEEDS_INPUT' ? 'amber' : warnings ? 'amber' : state === 'READY_GUIDED' ? 'emerald' : 'slate';
  return { tone, status: result.status, state, blocked, chips, findings,
    guided: result.guided_contract || null,
    label: !blocked && warnings ? `${base} · ${warnings} cảnh báo` : base };
}

/** Apply a server fix. Returns the new UI state fragment, or null for advice-only fixes. */
export function applyFix(question, fix, maxChars) {
  if (!fix) return null;
  if (fix.kind === 'replace_question' && typeof fix.question === 'string') return { question: fix.question };
  if (fix.kind === 'truncate') return { question: question.slice(0, fix.max_chars || maxChars || question.length) };
  if (fix.kind === 'set_time' && fix.time) return { time: fix.time };
  // Mission mismatch: move the question to its mission, or clear it to rewrite.
  if (fix.kind === 'switch_mission' && fix.mission) return { mission: fix.mission, question };
  if (fix.kind === 'rewrite_for_mission') return { question: '' };
  return null;
}

/**
 * Debounced preflight client. Each call cancels the previous in-flight
 * request; a response is delivered only if it belongs to the latest input, so
 * stale results never overwrite newer text.
 */
export function createPreflightClient({ fetchImpl, debounceMs = 400, onResult, onPending, setTimer = setTimeout, clearTimer = clearTimeout, url = '/api/ai/preflight' }) {
  let timer = null, controller = null, sequence = 0;
  const cancel = () => { if (timer) clearTimer(timer); timer = null; controller?.abort(); controller = null; };
  return {
    request(payload) {
      cancel();
      const id = ++sequence;
      if (!payload?.question?.trim()) { onPending?.(false); onResult?.(null, null, id); return; }
      onPending?.(true);
      timer = setTimer(async () => {
        timer = null;
        const own = typeof AbortController !== 'undefined' ? new AbortController() : null;
        controller = own;
        try {
          const response = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: own?.signal });
          const data = await response.json();
          if (id !== sequence) return;
          if (!response.ok) onResult?.(null, data?.detail || 'Chưa kiểm tra được câu hỏi.', id);
          else onResult?.(data, null, id);
        } catch (error) {
          if (id !== sequence || error?.name === 'AbortError') return;
          onResult?.(null, 'Chưa kiểm tra được câu hỏi.', id);
        } finally {
          if (id === sequence) onPending?.(false);
        }
      }, debounceMs);
    },
    cancel,
    get sequence() { return sequence; },
  };
}
