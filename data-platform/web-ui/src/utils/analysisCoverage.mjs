// FINAL 2026-10-19: business-readable analytical coverage of a report (P3/P5).
// The server computes `analysis_coverage` from the executed lens plan; this module only words it.
// Correct numbers ("Số liệu đã kiểm chứng") and breadth ("6/8 góc nhìn") are separate statements.

export const LENS_ROLE_LABELS = { core: 'Cốt lõi', diagnostic: 'Chẩn đoán', extended: 'Mở rộng' };
export const DEPTH_LABELS = { focused: 'Tập trung', deep: 'Phân tích sâu', comprehensive: 'Toàn diện' };

const REASONS = {
  no_time_axis: 'chỉ số không có lịch sử theo thời gian',
  insufficient_periods: 'chưa đủ từ 2 kỳ quan sát',
  singleton: 'dữ liệu chỉ có một nhóm',
  pinned_axis: 'chiều này đã bị cố định bởi phạm vi',
  requested_axis: 'đã có trong yêu cầu chính',
  missing_metric_component: 'chưa có tử/mẫu số được khai báo',
  no_eligible_axis: 'không còn chiều phân tích hợp lệ',
  non_additive_total: 'chỉ số không cộng được nên không vẽ cơ cấu',
  cost_budget: 'vượt ngân sách truy vấn của báo cáo',
  mission_grammar: 'ngoài phạm vi nhiệm vụ đã chọn',
  no_rows: 'không có dữ liệu trong phạm vi',
  insufficient_groups: 'quá ít nhóm để so sánh',
  source_unavailable: 'truy vấn không thực hiện được',
  renderer_unsupported: 'chưa có cách trình bày phù hợp',
  duplicate_meaning: 'trùng ý nghĩa với góc nhìn khác',
  capability_blocked: 'danh mục chưa cho phép tổ hợp này',
  unsupported_join: 'không có quan hệ dữ liệu hợp lệ',
  incompatible_population: 'khác quần thể với câu hỏi',
  zero_denominator: 'mẫu số bằng 0',
  signed_measure: 'chỉ số có thể âm nên không vẽ cơ cấu',
  constant_observations: 'các nhóm có cùng quy mô nên không so sánh được',
  invalid_composition_total: 'có kỳ không phát sinh nên không tính được cơ cấu',
  reserve_not_needed: 'không cần dùng góc nhìn dự phòng',
};

export function lensReason(reason) {
  return REASONS[reason] || 'chưa đủ điều kiện';
}

/** Short badge for one chart, or null for requested/legacy charts. */
export function lensBadge(chart) {
  return chart?.analysis_lens_role ? LENS_ROLE_LABELS[chart.analysis_lens_role] || null : null;
}

/** null for legacy reports (coverage was not evaluated — never shown as a failure). */
export function coverageSummary(report) {
  const c = report?.analysis_coverage;
  if (!c || !c.targets) return null;
  const total = Number(c.target_total) || 0, shown = Number(c.rendered_total) || 0;
  const roles = ['core', 'diagnostic', 'extended'].filter(r => (c.targets[r] || 0) > 0)
    .map(r => ({ role: r, label: LENS_ROLE_LABELS[r], rendered: Math.min(c.rendered?.[r] || 0, c.targets[r]), target: c.targets[r] }));
  const missing = (c.lenses || []).filter(l => l.status === 'rejected')
    .map(l => `${LENS_ROLE_LABELS[l.role] || ''}: ${l.question || l.kind} — ${lensReason(l.reason)}`.trim());
  const tone = c.status === 'complete' ? 'ok' : c.gap_kind === 'PLANNING_GAP' ? 'gap' : 'limited';
  const depth = DEPTH_LABELS[c.effective_depth] || '';
  const label = `${depth ? depth + ' · ' : ''}${Math.min(shown, total)}/${total} góc nhìn`
    + (tone === 'ok' ? '' : tone === 'gap' ? ' · chưa đầy đủ' : ' · giới hạn dữ liệu');
  return { label, tone, roles, missing, summary: c.summary || '', origin: c.selection_origin || null };
}
