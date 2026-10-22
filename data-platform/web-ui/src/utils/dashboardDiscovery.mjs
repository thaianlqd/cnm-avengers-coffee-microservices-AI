export const foldSearch = value => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Discovery labels describe the existing governed presets. They never create metrics or queries.
const topics = {
  D01: ['Doanh thu', 'Hoàn tất đơn', 'Kênh bán', 'Top cửa hàng'], D02: ['Sản lượng', 'Top sản phẩm', 'Danh mục', 'Xu hướng'],
  D03: ['Bản đồ', 'Miền báo cáo', 'Top cửa hàng'], D04: ['Nhượng quyền', 'Kiosk vệ tinh', 'Xu hướng'],
  D05: ['Tỷ lệ giao thành công', 'Thời gian giao', 'Tài xế'], D06: ['Phương thức', 'Trạng thái giao dịch', 'Xu hướng'],
  D07: ['Voucher', 'Tiền giảm', 'Lượt sử dụng'], D08: ['Khách có tài khoản', 'Khách mua hàng', 'Điểm tích lũy'],
  D09: ['Khả dụng bán', 'Tạm ngừng bán', 'Danh mục'], D10: ['Ca làm', 'Chấm công', 'Đi trễ'],
  D11: ['Tiền mặt', 'Đối soát', 'Chênh lệch có dấu'], D12: ['Điểm đánh giá', 'Số phản hồi', 'Sản phẩm'],
  D13: ['Bản đồ', 'Điểm đánh giá', 'Cửa hàng'], D14: ['Bản đồ', 'Lượt khảo sát', 'Xu hướng'],
  D15: ['Yêu thích', 'Top sản phẩm', 'Xu hướng'], D16: ['Theo giờ', 'Ngày trong tuần', 'Chi nhánh'],
  D17: ['Công nợ', 'Phí nhượng quyền', 'Cảnh báo kiosk'], D18: ['Nạp ví', 'Chi tiêu ví', 'Thẻ quà'],
  D19: ['COD', 'Tiền chưa nộp', 'Ví shipper'], D20: ['Ca kiosk', 'Lệch tiền', 'Giá riêng'],
  D21: ['Hồ sơ nhượng quyền', 'Hợp đồng', 'Gói kiosk'], D22: ['Hội thoại hỗ trợ', 'Trạng thái chat', 'Tin nhắn'],
  D23: ['Bản đồ', 'Khách mua hàng', 'Chi tiêu'], D24: ['Bài viết', 'Lượt xem', 'Danh mục nội dung'],
  D25: ['Câu hỏi khảo sát', 'Số người trả lời', 'Điểm khảo sát'], D26: ['Topping', 'Tuỳ chọn món', 'Top sản phẩm'],
  D27: ['Tiền đã thanh toán', 'Chờ thu', 'Xu hướng'], D28: ['Ca lệch tiền lớn', 'Chênh lệch có dấu', 'Đối soát'],
  D29: ['Xu hướng', 'Cơ cấu danh mục', 'Top sản phẩm'], D30: ['Xu hướng', 'Voucher', 'Lượt sử dụng'],
  D31: ['Đi trễ', 'Tỷ lệ đi trễ', 'Ca làm'], D32: ['Kết quả chuyến', 'Điểm shipper', 'Top tài xế'],
  D33: ['Bản đồ', 'Kênh bán', 'Hủy đơn'], D34: ['Ví chủ kiosk', 'Giá riêng', 'Ca kiosk'],
  D35: ['Xu hướng', 'Lượng đơn', 'Doanh thu chi nhánh'], D36: ['Bản đồ', 'Doanh thu', 'Lượng đơn', 'AOV'],
  D37: ['Bản đồ', 'Điểm đánh giá', 'Số phản hồi'], D38: ['Bản đồ', 'Khả dụng bán', 'Tạm ngừng bán'],
  D39: ['Bản đồ', 'Tiền đã thanh toán', 'Phương thức'], D40: ['Bản đồ', 'Tỷ lệ giao thành công', 'Thời gian giao'],
  D41: ['Bản đồ', 'Hoàn tất đơn', 'Hủy đơn', 'Kênh bán'], D42: ['Top sản phẩm', 'Điểm đánh giá', 'Số phản hồi'],
  D43: ['Điểm thưởng', 'Loyalty', 'Hạng sau tích điểm'], D44: ['Bản đồ', 'Chấm công', 'Đi trễ', 'Khung ca'],
  D45: ['Thẻ quà', 'Phát hành', 'Thẻ đã đổi', 'Số dư'], D46: ['Cỡ ly', 'Mức đường', 'Mức đá'],
  D47: ['Bản đồ', 'Sản lượng', 'Giá trị dòng món', 'Danh mục'], D48: ['Bản đồ', 'Đối soát', 'Chênh lệch có dấu', 'Ca lệch lớn'],
  D49: ['Bản đồ', 'Kiosk nhượng quyền', 'Doanh thu', 'Lượng đơn', 'AOV', 'Top kiosk', 'Xu hướng'],
  D50: ['Bản đồ', 'Kiosk vệ tinh', 'Doanh thu', 'Lượng đơn', 'AOV', 'Top kiosk', 'Xu hướng'],
  D51: ['Bản đồ', 'Hai loại kiosk', 'So sánh', 'Nhượng quyền', 'Vệ tinh', 'Doanh thu', 'Xu hướng'],
  D52: ['Bản đồ', 'Kiosk nhượng quyền', 'Điểm đánh giá', 'Số phản hồi'],
  D53: ['Bản đồ', 'Kiosk vệ tinh', 'Khả dụng bán', 'Tạm ngừng bán'],
};
export function dashboardTopics(item) { return topics[item.id] || (item.custom ? ['Bài toán cá nhân'] : []); }
export function discoveryKinds(item) {
  const text = foldSearch([item.title, item.description, ...dashboardTopics(item)].join(' '));
  return [
    ...(/\bban do\b/.test(text) ? ['Bản đồ'] : []),
    ...(/xu huong|dien bien|theo thoi gian/.test(text) ? ['Xu hướng'] : []),
    ...(/top |xep hang|ban chay/.test(text) ? ['Xếp hạng'] : []),
    ...(/danh gia|phan hoi|khao sat/.test(text) ? ['Trải nghiệm khách hàng'] : []),
    ...(/thanh toan|tien|cong no|nap vi|cod/.test(text) ? ['Dòng tiền'] : []),
  ];
}
export function matchesDashboard(item, search) {
  const text = foldSearch([item.id, item.title, item.category, item.description, ...dashboardTopics(item), ...discoveryKinds(item)].join(' '));
  return foldSearch(search).split(' ').filter(Boolean).every(term => text.includes(term));
}
export function discoverDashboards(items, { search = '', category = 'Tất cả', kind = 'Tất cả', sort = 'default', custom = false } = {}) {
  const result = items.filter(item => (category === 'Tất cả' || item.category === category)
    && (kind === 'Tất cả' || discoveryKinds(item).includes(kind)) && (!custom || item.custom) && matchesDashboard(item, search));
  if (sort === 'name') result.sort((a,b) => a.title.localeCompare(b.title, 'vi'));
  if (sort === 'ready') result.sort((a,b) => Number(b.status === 'healthy') - Number(a.status === 'healthy'));
  if (sort === 'custom') result.sort((a,b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)));
  return result;
}
