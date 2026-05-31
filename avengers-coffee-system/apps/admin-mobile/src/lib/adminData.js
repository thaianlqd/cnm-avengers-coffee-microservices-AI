// adminData.js — Helper utilities for admin-mobile

// ─── Formatters ─────────────────────────────────────────────
export const formatCurrency = (value) => {
  const num = Number(value || 0)
  if (isNaN(num)) return '0đ'
  return num.toLocaleString('vi-VN') + 'đ'
}

export const formatDateTime = (value) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (isNaN(date.getTime())) return String(value)
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const formatDateOnly = (value) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export const formatTimeOnly = (value) => {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (isNaN(date.getTime())) return String(value)
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

// ─── Safe helpers ────────────────────────────────────────────
export const safeArray = (val) => (Array.isArray(val) ? val : [])

export const safeStr = (val, fallback = '') => (val != null ? String(val) : fallback)

// ─── Constants ───────────────────────────────────────────────
export const ROLES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  STAFF: 'STAFF',
}

export const ORDER_STATUS_LABELS = {
  MOI_TAO: 'Mới tạo',
  DA_XAC_NHAN: 'Đã xác nhận',
  DANG_CHUAN_BI: 'Đang chuẩn bị',
  DANG_GIAO: 'Đang giao',
  HOAN_THANH: 'Hoàn thành',
  DA_HUY: 'Đã hủy',
}

export const ORDER_STATUS_COLORS = {
  MOI_TAO: '#f97316',
  DA_XAC_NHAN: '#0ea5e9',
  DANG_CHUAN_BI: '#8b5cf6',
  DANG_GIAO: '#f59e0b',
  HOAN_THANH: '#22c55e',
  DA_HUY: '#ef4444',
}

export const ORDER_STATUS_BG = {
  MOI_TAO: 'rgba(249,115,22,0.12)',
  DA_XAC_NHAN: 'rgba(14,165,233,0.12)',
  DANG_CHUAN_BI: 'rgba(139,92,246,0.12)',
  DANG_GIAO: 'rgba(245,158,11,0.12)',
  HOAN_THANH: 'rgba(34,197,94,0.12)',
  DA_HUY: 'rgba(239,68,68,0.12)',
}

export const NEXT_ORDER_STATUSES = {
  MOI_TAO: ['DA_XAC_NHAN', 'DA_HUY'],
  DA_XAC_NHAN: ['DANG_CHUAN_BI', 'DA_HUY'],
  DANG_CHUAN_BI: ['DANG_GIAO', 'DA_HUY'],
  DANG_GIAO: ['HOAN_THANH', 'DA_HUY'],
  HOAN_THANH: [],
  DA_HUY: [],
}

export const PAYMENT_LABELS = {
  THANH_TOAN_KHI_NHAN_HANG: 'Tiền mặt',
  VNPAY: 'VNPAY',
  NGAN_HANG_QR: 'QR',
}

export const POS_ORDER_TYPES = [
  { value: 'TAI_CHO', label: 'Dùng tại quầy' },
  { value: 'MANG_DI', label: 'Mang đi' },
]

export const POS_PAYMENT_METHODS = [
  { value: 'THANH_TOAN_KHI_NHAN_HANG', label: 'Tiền mặt' },
  { value: 'NGAN_HANG_QR', label: 'QR ngân hàng' },
  { value: 'VNPAY', label: 'VNPAY' },
]

export const SHIFT_REQUEST_STATUSES = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
}

export const ATTENDANCE_STATUS = {
  CHUA_CHAM: 'Chưa chấm',
  DA_CHAM: 'Đã chấm công',
  VANG: 'Vắng mặt',
  TRE: 'Đi trễ',
}

// ─── Role helpers ─────────────────────────────────────────────
export const getUserRole = (session) => {
  const role =
    session?.vaiTro || session?.vai_tro ||
    session?.role ||
    session?.user?.vaiTro || session?.user?.vai_tro ||
    session?.user?.role ||
    ROLES.STAFF
  return String(role).toUpperCase()
}

export const isAdmin = (role) => role === ROLES.ADMIN
export const isManager = (role) => role === ROLES.MANAGER
export const isStaff = (role) => role === ROLES.STAFF

export const getRoleBadge = (role) => {
  const map = {
    ADMIN: { label: 'Admin', color: '#f26b1d', bg: 'rgba(242,107,29,0.15)' },
    MANAGER: { label: 'Manager', color: '#0ea5e9', bg: 'rgba(14,165,233,0.15)' },
    STAFF: { label: 'Staff', color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  }
  return map[role] || map.STAFF
}

// ─── Normalizers ─────────────────────────────────────────────
export const normalizeOrder = (raw) => {
  if (!raw) return null
  return {
    id: raw.id || raw.ma_don_hang || String(Math.random()),
    ma_don_hang: raw.ma_don_hang || raw.id || '',
    trang_thai_don_hang: raw.trang_thai_don_hang || 'MOI_TAO',
    trang_thai_thanh_toan: raw.trang_thai_thanh_toan || '',
    phuong_thuc_thanh_toan: raw.phuong_thuc_thanh_toan || '',
    tong_tien: Number(raw.tong_tien || 0),
    dia_chi_giao_hang: raw.dia_chi_giao_hang || '',
    ten_khach_hang: raw.ten_khach_hang || raw.khach_hang?.ho_ten || '',
    ghi_chu: raw.ghi_chu || '',
    loai_don_hang: raw.loai_don_hang || 'ONLINE',
    ma_ban: raw.ma_ban || '',
    ngay_tao: raw.ngay_tao || raw.createdAt || null,
    chi_tiet: safeArray(raw.chi_tiet || raw.items || raw.OrderItems).map((item) => ({
      id: item.id || '',
      ma_san_pham: item.ma_san_pham || item.product_id || '',
      ten_san_pham: item.ten_san_pham || item.name || '',
      so_luong: Number(item.so_luong || item.quantity || 0),
      gia_ban: Number(item.gia_ban || item.price || 0),
      hinh_anh_url: item.hinh_anh_url || item.image_url || null,
      kich_co: item.kich_co || item.size || '',
    })),
  }
}

export const normalizeProduct = (raw) => {
  if (!raw) return null
  return {
    id: raw.id || raw.ma_san_pham || '',
    ma_san_pham: Number(raw.ma_san_pham || raw.id || 0),
    ten_san_pham: raw.ten_san_pham || raw.name || '',
    gia_ban: Number(raw.gia_ban || raw.price || 0),
    mo_ta: raw.mo_ta || raw.description || '',
    hinh_anh_url: raw.hinh_anh_url || raw.image_url || null,
    danh_muc: raw.danh_muc || raw.category || '',
    dang_ban: raw.dang_ban !== false && raw.available !== false,
    is_featured: Boolean(raw.is_featured || raw.noi_bat),
    stock: Number(raw.stock || raw.ton_kho || 0),
  }
}

export const normalizeShift = (raw) => {
  if (!raw) return null
  return {
    id: raw.id || raw.ma_ca || '',
    ma_ca: raw.ma_ca || raw.id || '',
    ten_ca: raw.ten_ca || raw.name || '',
    ngay: raw.ngay || raw.date || null,
    gio_bat_dau: raw.gio_bat_dau || raw.start_time || '',
    gio_ket_thuc: raw.gio_ket_thuc || raw.end_time || '',
    trang_thai: raw.trang_thai || 'CHUA_CHOT',
    tong_tien_mat: Number(raw.tong_tien_mat || 0),
    so_don_hang: Number(raw.so_don_hang || 0),
    nhan_vien: raw.nhan_vien || raw.staff_name || '',
    da_phe_duyet: Boolean(raw.da_phe_duyet),
  }
}

export const normalizeWorkShift = (raw) => {
  if (!raw) return null
  return {
    id: raw.id || raw.ma_ca_lam_viec || raw.ma_ca || '',
    ma_ca_lam_viec: raw.ma_ca_lam_viec || raw.ma_ca || raw.id || '',
    nhan_vien: raw.nhan_vien || raw.staff_name || raw.staff?.tenDangNhap || raw.staff?.username || '',
    staff_username: raw.staff_username || raw.ten_dang_nhap || raw.tenDangNhap || raw.username || raw.staff?.tenDangNhap || raw.staff?.username || '',
    staff_name: raw.staff_name || raw.ho_ten || raw.staff?.ho_ten || raw.staff?.full_name || '',
    nhan_vien_id: raw.nhan_vien_id || raw.staff_id || raw.ma_nguoi_dung || '',
    ca_lam: raw.ca_lam || raw.ten_ca || raw.shift_name || '',
    shift_code: raw.shift_code || raw.ma_ca || '',
    shift_codes: safeArray(raw.shift_codes),
    ngay: raw.ngay || raw.ngay_lam_viec || raw.shift_date || raw.date || '',
    ngay_lam_viec: raw.ngay_lam_viec || raw.shift_date || raw.ngay || '',
    gio_vao: raw.gio_vao || raw.check_in || raw.check_in_at || null,
    gio_ra: raw.gio_ra || raw.check_out || raw.check_out_at || null,
    trang_thai: raw.trang_thai || raw.trang_thai_cham_cong || 'CHUA_CHAM',
    trang_thai_cham_cong: raw.trang_thai_cham_cong || raw.trang_thai || 'CHUA_CHAM',
    check_in_at: raw.check_in_at || raw.gio_vao || null,
    check_out_at: raw.check_out_at || raw.gio_ra || null,
    note: raw.note || raw.ghi_chu || '',
    ghi_chu: raw.ghi_chu || raw.note || '',
  }
}

export const normalizeEmployee = (raw) => {
  if (!raw) return null
  return {
    id: raw.id || raw.ma_nhan_vien || '',
    ten: raw.ten || raw.ho_ten || raw.tenDangNhap || raw.full_name || '',
    email: raw.email || '',
    vai_tro: raw.vai_tro || raw.vaiTro || raw.role || 'STAFF',
    so_dien_thoai: raw.so_dien_thoai || raw.phone || '',
    ten_dang_nhap: raw.ten_dang_nhap || raw.tenDangNhap || raw.username || '',
    co_so_ten: raw.co_so_ten || raw.coSoTen || raw.branch_code || '',
    avatar_url: raw.avatar_url || null,
    active: raw.active !== false && raw.trang_thai !== 'INACTIVE',
  }
}

export const normalizeReview = (raw) => {
  if (!raw) return null
  return {
    id: raw.id || '',
    khach_hang: raw.khach_hang || raw.ten_nguoi_dung || raw.customer_name || raw.ho_ten || '',
    ten_nguoi_dung: raw.ten_nguoi_dung || raw.khach_hang || raw.customer_name || '',
    san_pham: raw.san_pham || raw.ten_san_pham || raw.product_name || '',
    ten_san_pham: raw.ten_san_pham || raw.san_pham || raw.product_name || '',
    hinh_anh_san_pham: raw.hinh_anh_san_pham || raw.image_url || '',
    so_sao: Number(raw.so_sao || raw.rating || 0),
    binh_luan: raw.binh_luan || raw.comment || '',
    phan_hoi: raw.phan_hoi || raw.phan_hoi_quan_ly || raw.reply || null,
    phan_hoi_quan_ly: raw.phan_hoi_quan_ly || raw.phan_hoi || raw.reply || null,
    ngay_tao: raw.ngay_tao || raw.createdAt || null,
    ngay_cap_nhat: raw.ngay_cap_nhat || raw.updatedAt || null,
    ma_san_pham: raw.ma_san_pham || raw.product_id || '',
    ma_nguoi_dung: raw.ma_nguoi_dung || raw.user_id || '',
  }
}

export const normalizeNewsArticle = (raw) => {
  if (!raw) return null
  return {
    id: raw.id || '',
    tieu_de: raw.tieu_de || raw.title || '',
    mo_ta: raw.mo_ta || raw.description || '',
    noi_dung: raw.noi_dung || raw.content || '',
    hinh_anh: raw.hinh_anh || raw.image_url || null,
    danh_muc: raw.danh_muc || raw.category || '',
    da_xuat_ban: raw.da_xuat_ban !== false,
    luot_xem: Number(raw.luot_xem || raw.views || 0),
    ngay_tao: raw.ngay_tao || raw.createdAt || null,
    ngay_cap_nhat: raw.ngay_cap_nhat || raw.updatedAt || null,
  }
}
