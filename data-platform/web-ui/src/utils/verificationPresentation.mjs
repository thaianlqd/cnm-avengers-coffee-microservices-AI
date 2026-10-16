// V3.2 verification presentation. Separate evidence metrics only: no blended
// "AI accuracy" number is ever computed or displayed here.

const vi = (value, digits = 2) => Number(value).toLocaleString('vi-VN', { maximumFractionDigits: digits });

export function verificationMetrics(verification) {
  return (verification?.metrics || []).map(m => ({ ...m,
    text: m.total ? `${m.passed}/${m.total}` : 'Không áp dụng',
    tone: !m.total ? 'slate' : m.passed === m.total ? 'emerald' : 'amber' }));
}

/** Merge an on-demand independent reconciliation into the report verification. */
export function mergeReconciliation(verification, oracle) {
  if (!verification) return null;
  if (!oracle) return verification;
  const measured = (oracle.numeric || []).filter(c => ['matched', 'mismatch'].includes(c.status));
  const ranked = (oracle.ranking || []).filter(r => ['matched', 'mismatch'].includes(r.status));
  const metrics = (verification.metrics || []).map(m => m.id === 'numeric_reconciliation'
    ? { ...m, passed: measured.filter(c => c.status === 'matched').length, total: measured.length }
    : m.id === 'ranking_reconciliation' ? { ...m, passed: ranked.filter(r => r.status === 'matched').length, total: ranked.length } : m);
  const independent = oracle.independent_oracle || null;
  return { ...verification, metrics, numeric: oracle.numeric || [], ranking: oracle.ranking || [], independent_oracle: independent,
    independent_oracle_label: independent ? `${vi(independent.accuracy_pct, 1)}% trên ${independent.eligible} phép đối chiếu số liệu` : 'Chưa đo đối chiếu độc lập',
    oracle_measured_at: oracle.measured_at };
}

export function numericRows(verification) {
  return (verification?.numeric || []).filter(c => c.status !== 'not_measured').map(c => ({
    label: c.label, expected: c.expected_value == null ? '—' : vi(c.expected_value), reported: c.reported_value == null ? '—' : vi(c.reported_value),
    error: c.absolute_error == null ? '—' : vi(c.absolute_error, 6), status: c.status === 'matched' ? 'Khớp' : 'Lệch', ok: c.status === 'matched' }));
}

export function rankingRows(verification) {
  return (verification?.ranking || []).map(r => r.status === 'not_measured' || r.status === 'not_applicable'
    ? { status: r.status === 'not_applicable' ? 'Không áp dụng' : 'Chưa đo', detail: r.reason || '', ok: null }
    : { status: r.status === 'matched' ? 'Khớp' : 'Lệch', ok: r.status === 'matched',
        detail: `Top-${r.k}: độ chính xác tập ${vi(r.precision * 100, 0)}%, Jaccard ${r.jaccard == null ? '—' : vi(r.jaccard)}, ${r.order_agreement ? 'đúng thứ tự' : 'sai thứ tự'}${r.kendall_tau == null ? '' : `, Kendall τ ${vi(r.kendall_tau)}`}` });
}

export function forecastRows(verification) {
  return (verification?.forecast_backtest || []).map(f => ({ metric: f.metric_id, method: f.method || '—',
    errors: Object.entries(f.error_metrics || {}).map(([k, v]) => `${k.toUpperCase()} ${vi(v)}`).join(' · ') || 'Chưa đủ điểm kiểm tra lùi',
    coverage: f.interval_coverage == null ? 'Chưa đủ điểm để đo' : `${vi(f.interval_coverage * 100, 0)}%` }));
}
