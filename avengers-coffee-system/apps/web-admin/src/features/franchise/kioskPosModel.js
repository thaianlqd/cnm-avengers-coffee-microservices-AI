export const kioskMoney = value => `${Number(value || 0).toLocaleString('vi-VN')}đ`
export function kioskCategory(item) {
  const value = item.danh_muc || item.danhMuc || item.category
  return (typeof value === 'string' ? value : value?.ten_danh_muc || value?.tenDanhMuc || value?.name || value?.ten)?.trim() || 'Khác'
}
export function kioskPaymentLabel(value) {
  return ({ TIEN_MAT: 'Tiền mặt', THANH_TOAN_KHI_NHAN_HANG: 'Tiền mặt', NGAN_HANG_QR: 'Chuyển khoản QR', VNPAY: 'VNPay', THE: 'Thẻ' })[value] || 'Chưa xác định'
}
export function kioskSaleStatus(order) {
  if (order.trang_thai_thanh_toan === 'DA_HOAN_TIEN') return { status: 'DA_HUY', label: 'Đã hoàn tiền' }
  if (order.trang_thai_don_hang === 'DA_HUY') return { status: 'DA_HUY', label: 'Đã hủy' }
  if (order.trang_thai_thanh_toan === 'DA_THANH_TOAN' || order.trang_thai_don_hang === 'HOAN_THANH') return { status: 'HOAN_THANH', label: 'Hoàn tất' }
  if (order.trang_thai_thanh_toan === 'THAT_BAI') return { status: 'FAILED', label: 'Thanh toán thất bại' }
  if (order.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' && order.trang_thai_thanh_toan === 'CHO_THANH_TOAN_KHI_NHAN_HANG') return { status:'PENDING', label:'Cần đối soát' }
  if (order.trang_thai_thanh_toan === 'CAN_DOI_SOAT') return { status: 'PENDING', label: 'Cần đối soát' }
  return { status: 'PENDING', label: 'Chờ thanh toán' }
}
export function kioskCheckoutResult(response, { total, method, cash }) {
  const order = response.order || response.data?.order || response.data || response
  return {
    success: true,
    ma_don: order.ma_don_hang || response.ma_don_hang || response.id,
    tong: Number(order.tong_tien ?? total),
    method,
    cash: Number(order.tien_khach_dua ?? cash ?? 0),
    change: Number(order.tien_thoi ?? Math.max(0, Number(cash || 0) - total)),
    order,
    payment_details: response.payment_details || response.paymentDetails || response.data?.payment_details,
    vnpay_url: response.redirect_url || response.vnpay_url || response.data?.vnpay_url,
  }
}
