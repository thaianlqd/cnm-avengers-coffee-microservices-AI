const REASONS={
  last_load_failed:'Lần nạp gần nhất thất bại; chờ đồng bộ thành công lại.',physical_schema_drift:'Cấu trúc cột hoặc khóa khác hợp đồng nguồn.',
  critical_quality_failed:'Kiểm tra chất lượng bắt buộc chưa đạt.',critical_quality_not_measured:'Chưa đo đủ kiểm tra chất lượng bắt buộc.',
  load_stale:'Lần nạp thành công đã vượt thời gian cập nhật cho phép.',governed_checkpoint_missing:'Thiếu dấu mốc nạp dữ liệu có kiểm chứng.',
  physical_schema_not_measured:'Chưa đo cấu trúc nguồn.',checkpoint_evidence_invalid_or_expired:'Bằng chứng đối soát đã hết hạn hoặc chưa hợp lệ.',
};
export const sourceReason=(code)=>REASONS[code]||`Mã kiểm tra: ${code}`;
export function sourceIssues(capabilities){
  const coverage=capabilities?.data_coverage||{},health=coverage.data_health||{};
  return Object.entries(health.views||{}).filter(([,view])=>view.status!=='healthy').map(([name,view])=>({
    name,label:coverage.facts?.[name]?.label||name,status:view.status,
    reasons:(view.reasons||[]).map(sourceReason),metrics:view.impacted_metrics||[],
    sources:(view.source_dependencies||[]).map(name=>({name,...health.datasets?.[name]})),
  }));
}
