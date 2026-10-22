// Presentation validation only. The server still resolves meaning, permissions,
// scope and chart compatibility; this guard does not pretend to understand prose.
export function refinementInputError(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > 1000) return 'Yêu cầu tối đa 1.000 ký tự. Hãy chia thành từng điều chỉnh.';
  if (!/\p{L}/u.test(text)) return 'Hãy mô tả điều bạn muốn thay đổi, ví dụ: Nhóm theo tỉnh/thành.';
  if (text.split(/\s+/).length === 1 && !/^(donut|bar|line|area|scatter|heatmap|pie|ngày|tuần|tháng|quý|năm)$/iu.test(text))
    return 'Yêu cầu chưa rõ. Hãy viết cụ thể, ví dụ: Chỉ lọc chi nhánh Hà Nội hoặc Nhóm theo tỉnh/thành.';
  return '';
}
