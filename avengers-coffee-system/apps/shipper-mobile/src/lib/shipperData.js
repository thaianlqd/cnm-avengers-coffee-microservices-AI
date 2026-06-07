export function safeArray(value) {
  if (Array.isArray(value)) {
    return value
  }
  return []
}

export function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`
}

export function formatDateTime(value) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export const deliveryStatusLabels = {
  PENDING: 'Chờ lấy hàng',
  CONFIRMED: 'Đã xác nhận',
  PICKING_UP: 'Đang lấy hàng',
  IN_TRANSIT: 'Đang giao hàng',
  DELIVERED: 'Đã giao thành công',
  FAILED: 'Giao thất bại',
  CANCELLED: 'Đã hủy',
}

export const deliveryStatusColors = {
  PENDING: '#f59e0b',
  CONFIRMED: '#3b82f6',
  PICKING_UP: '#8b5cf6',
  IN_TRANSIT: '#2563eb',
  DELIVERED: '#10b981',
  FAILED: '#ef4444',
  CANCELLED: '#64748b',
}

export const shipperStatusLabels = {
  ACTIVE: 'Sẵn sàng nhận đơn',
  INACTIVE: 'Ngoại tuyến',
  ON_BREAK: 'Đang nghỉ ngơi',
}
