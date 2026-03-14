export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const NAV_TABS = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'orders', label: 'Luồng đơn hàng' },
  { id: 'menu', label: 'Quản lý thực đơn' },
  { id: 'shift', label: 'Chốt ca' },
  { id: 'pos', label: 'POS tạo đơn nhanh' },
]

export const WORKFORCE_TAB = { id: 'workforce', label: 'Lịch làm nhân sự' }
export const MANAGER_SHIFT_APPROVAL_TAB = { id: 'shift-approval', label: 'Kiểm tra chốt ca' }
export const MANAGER_EMPLOYEE_MANAGEMENT_TAB = { id: 'employee-manage', label: 'Quản lý nhân viên' }
export const MANAGER_WORKFORCE_MANAGEMENT_TAB = { id: 'workforce-manage', label: 'Quản lý lịch làm nhân viên' }
export const DASHBOARD_ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
}

export const ORDER_STATUSES = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH', 'DA_HUY']

export const ORDER_STATUS_LABEL = {
  MOI_TAO: 'Mới tạo',
  DA_XAC_NHAN: 'Đã xác nhận',
  DANG_CHUAN_BI: 'Đang chuẩn bị',
  DANG_GIAO: 'Đang giao',
  HOAN_THANH: 'Hoàn thành',
  DA_HUY: 'Đã hủy',
}

export const PAYMENT_METHOD_LABEL = {
  THANH_TOAN_KHI_NHAN_HANG: 'COD',
  VNPAY: 'VNPAY',
  NGAN_HANG_QR: 'QR',
}

export const POS_ORDER_TYPE_OPTIONS = [
  { id: 'TAI_CHO', label: 'Dùng tại quầy' },
  { id: 'MANG_DI', label: 'Mang đi' },
]

export const POS_PAYMENT_OPTIONS = [
  { id: 'THANH_TOAN_KHI_NHAN_HANG', label: 'Tiền mặt' },
  { id: 'NGAN_HANG_QR', label: 'QR ngân hàng' },
  { id: 'VNPAY', label: 'VNPAY' },
]

export const STATUS_COLOR = {
  MOI_TAO: '#f97316',
  DA_XAC_NHAN: '#d65a12',
  DANG_CHUAN_BI: '#0ea5e9',
  DANG_GIAO: '#6366f1',
  HOAN_THANH: '#2d8f5c',
  DA_HUY: '#b91c1c',
}

export const PAYMENT_COLOR = {
  THANH_TOAN_KHI_NHAN_HANG: '#f97316',
  VNPAY: '#2d8f5c',
  NGAN_HANG_QR: '#2563eb',
}

export const OVERVIEW_TIME_RANGES = [
  { id: '24h', label: '24 giờ' },
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
]
