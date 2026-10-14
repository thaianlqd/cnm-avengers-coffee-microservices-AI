const statuses = { MOI_TAO: 'vừa tạo', DA_XAC_NHAN: 'đã xác nhận', DANG_CHUAN_BI: 'đang chuẩn bị', DANG_GIAO: 'đang giao', HOAN_THANH: 'hoàn thành', DA_HUY: 'đã hủy' }
const titles = { 'Cap nhat trang thai don hang': 'Cập nhật đơn hàng', 'Don COD cho thu tien': 'Thanh toán khi nhận hàng', 'Don hang da duoc tao': 'Đơn hàng đã được tạo' }
export function notificationPresentation(notification) {
  let title = String(notification.tieu_de || notification.title || 'Thông báo')
  title = titles[title] || title
  let body = String(notification.noi_dung || notification.message || '')
  body = body.replace(/\b(?:MOI_TAO|DA_XAC_NHAN|DANG_CHUAN_BI|DANG_GIAO|HOAN_THANH|DA_HUY)\b/g, code => statuses[code])
    .replace(/#([a-f\d]{8})-[a-f\d-]{27,}/gi, '#$1')
    .replace(/^Don /, 'Đơn ').replace('da chuyen sang trang thai ', 'đã chuyển sang trạng thái ').replace('se duoc thu tien khi giao hang.', 'sẽ được thanh toán khi nhận hàng.').replace('da duoc tao thanh cong.', 'đã được tạo thành công.')
  const icon = /COD|thanh toán|Thanh toán/.test(title + body) ? 'card-outline' : /đơn|Đơn/.test(title + body) ? 'receipt-outline' : /ưu đãi|voucher/i.test(title + body) ? 'gift-outline' : 'notifications-outline'
  return { title, body, icon }
}
