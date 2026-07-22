export function safeArray(value) {
  if (Array.isArray(value)) {
    return value
  }

  if (Array.isArray(value?.items)) {
    return value.items
  }

  if (Array.isArray(value?.orders)) {
    return value.orders
  }

  if (Array.isArray(value?.articles)) {
    return value.articles
  }

  if (Array.isArray(value?.branches)) {
    return value.branches
  }

  if (Array.isArray(value?.addresses)) {
    return value.addresses
  }

  return []
}

export function getUserId(user, fallbackId = '') {
  const id = String(user?.ma_nguoi_dung || user?.id || user?.sub || fallbackId || '').trim()
  return id || 'guest-customer'
}

export function getUserDisplayName(user) {
  return String(
    user?.ho_ten || user?.hoTen || user?.full_name || user?.fullName || user?.tenDangNhap || user?.email || 'Khách hàng',
  ).trim()
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

export function formatDateOnly(value) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return date.toLocaleDateString('vi-VN')
}

export function normalizeProduct(item) {
  return {
    id: String(item?.id ?? item?.ma_san_pham ?? item?.maSanPham ?? ''),
    ma_san_pham: item?.ma_san_pham ?? item?.id ?? item?.maSanPham ?? null,
    ten_san_pham: String(item?.ten_san_pham ?? item?.name ?? '').trim(),
    mo_ta: String(item?.mo_ta ?? item?.description ?? '').trim(),
    gia_ban: Number(item?.gia_ban ?? item?.price ?? 0),
    gia_niem_yet: item?.gia_niem_yet !== undefined && item?.gia_niem_yet !== null
      ? Number(item.gia_niem_yet)
      : item?.original_price !== undefined && item?.original_price !== null
        ? Number(item.original_price)
        : null,
    hinh_anh_url: String(item?.hinh_anh_url ?? item?.image ?? item?.image_url ?? '').trim(),
    danh_muc: String(item?.danh_muc ?? item?.category ?? item?.danhMuc?.ten_danh_muc ?? '').trim(),
    danh_muc_id: item?.danh_muc_id ?? item?.category_code ?? item?.danhMuc?.ma_danh_muc ?? null,
    la_hot: Boolean(item?.la_hot),
    la_moi: Boolean(item?.la_moi),
    dang_ban: item?.dang_ban !== undefined ? Boolean(item.dang_ban) : item?.status !== 'sold_out',
    status: item?.status || (item?.dang_ban === false ? 'sold_out' : 'available'),
    original_price: item?.original_price !== undefined && item?.original_price !== null
      ? Number(item.original_price)
      : null,
    is_discounted: Boolean(item?.is_discounted),
  }
}

export function normalizeCategory(item) {
  return {
    id: String(item?.id ?? item?.ma_danh_muc ?? item?.category_code ?? ''),
    code: String(item?.code ?? item?.ma_danh_muc ?? item?.category_code ?? ''),
    label: String(item?.label ?? item?.ten_danh_muc ?? item?.name ?? '').trim(),
    icon: item?.icon || item?.hinh_anh_icon || null,
    product_count: Number(item?.product_count ?? 0),
    cap_bac: Number(item?.cap_bac ?? 2),
    ma_danh_muc_cha: item?.ma_danh_muc_cha != null ? String(item.ma_danh_muc_cha) : null,
  }
}

export function normalizeOrder(item) {
  return {
    id: String(item?.id ?? item?.ma_don_hang ?? ''),
    ma_don_hang: String(item?.ma_don_hang ?? item?.id ?? '').trim(),
    tong_tien: Number(item?.tong_tien ?? item?.total ?? 0),
    so_tien_giam: Number(item?.so_tien_giam ?? 0),
    phuong_thuc_thanh_toan: String(item?.phuong_thuc_thanh_toan ?? item?.payment_method ?? '').trim(),
    trang_thai_don_hang: String(item?.trang_thai_don_hang ?? item?.status ?? '').trim(),
    trang_thai_thanh_toan: String(item?.trang_thai_thanh_toan ?? item?.payment_status ?? '').trim(),
    dia_chi_giao_hang: String(item?.dia_chi_giao_hang ?? item?.address ?? '').trim(),
    khung_gio_giao: String(item?.khung_gio_giao ?? item?.delivery_slot ?? '').trim(),
    ghi_chu: String(item?.ghi_chu ?? item?.note ?? '').trim(),
    ngay_tao: item?.ngay_tao ?? item?.created_at ?? null,
    ngay_cap_nhat: item?.ngay_cap_nhat ?? item?.updated_at ?? null,
    chi_tiet: safeArray(item?.chi_tiet).map((detail, index) => ({
      id: String(detail?.id ?? `${index}`),
      ma_san_pham: detail?.ma_san_pham ?? null,
      ten_san_pham: String(detail?.ten_san_pham ?? detail?.name ?? '').trim(),
      so_luong: Number(detail?.so_luong ?? detail?.quantity ?? 0),
      gia_ban: Number(detail?.gia_ban ?? detail?.price ?? 0),
      hinh_anh_url: String(detail?.hinh_anh_url ?? detail?.image ?? '').trim(),
      kich_co: String(detail?.kich_co ?? detail?.size ?? '').trim(),
    })),
  }
}

export function normalizeCartItem(item) {
  let toppings = item?.toppings || []
  if (typeof toppings === 'string') {
    try { toppings = JSON.parse(toppings) } catch (e) { toppings = [toppings] }
  }
  if (!Array.isArray(toppings)) toppings = []
  return {
    id: String(item?.id ?? item?.ma_san_pham ?? '').trim(),
    ma_nguoi_dung: String(item?.ma_nguoi_dung ?? '').trim(),
    ma_san_pham: Number(item?.ma_san_pham ?? item?.product_id ?? item?.itemId ?? 0),
    ten_san_pham: String(item?.ten_san_pham ?? item?.name ?? '').trim(),
    gia_ban: Number(item?.gia_ban ?? item?.price ?? 0),
    hinh_anh_url: String(item?.hinh_anh_url ?? item?.image_url ?? item?.image ?? '').trim(),
    size: String(item?.size ?? item?.kich_co ?? 'Nhỏ').trim(),
    so_luong: Number(item?.so_luong ?? item?.quantity ?? 1),
    toppings: toppings.map(t => typeof t === 'object' && t ? (t.name || t.ten_topping || '') : String(t)).filter(Boolean),
    luong_da: String(item?.luong_da ?? item?.luongDa ?? 'Bình thường').trim(),
    do_ngot: String(item?.do_ngot ?? item?.doNgot ?? 'Bình thường').trim(),
    ghi_chu: String(item?.ghi_chu ?? item?.ghiChu ?? item?.note ?? '').trim(),
  }
}

export function normalizeAddress(item) {
  return {
    id: String(item?.id ?? item?.addressId ?? ''),
    ten_dia_chi: String(item?.ten_dia_chi ?? item?.tenDiaChi ?? '').trim(),
    dia_chi_day_du: String(item?.dia_chi_day_du ?? item?.diaChiDayDu ?? item?.dia_chi ?? '').trim(),
    ghi_chu: String(item?.ghi_chu ?? item?.ghiChu ?? '').trim(),
    mac_dinh: Boolean(item?.mac_dinh ?? item?.macDinh),
  }
}

export function normalizeBranch(item) {
  return {
    id: String(item?.id ?? item?.ma_chi_nhanh ?? '').trim(),
    ma_chi_nhanh: String(item?.ma_chi_nhanh ?? item?.code ?? item?.id ?? '').trim(),
    ten_chi_nhanh: String(item?.ten_chi_nhanh ?? item?.name ?? '').trim(),
    dia_chi: String(item?.dia_chi ?? item?.address ?? '').trim(),
    thanh_pho: String(item?.thanh_pho ?? item?.city ?? '').trim(),
    quan_huyen: String(item?.quan_huyen ?? item?.district ?? '').trim(),
    so_dien_thoai: String(item?.so_dien_thoai ?? item?.phone ?? '').trim(),
    hinh_anh_url: String(item?.hinh_anh_url ?? item?.image ?? '').trim(),
    gio_mo_cua: String(item?.gio_mo_cua ?? item?.open_time ?? '').trim(),
    gio_dong_cua: String(item?.gio_dong_cua ?? item?.close_time ?? '').trim(),
    map_url: String(item?.map_url ?? '').trim(),
  }
}

export function normalizeNewsArticle(item) {
  return {
    id: String(item?.id ?? '').trim(),
    title: String(item?.title ?? '').trim(),
    description: String(item?.description ?? '').trim(),
    content: String(item?.content ?? '').trim(),
    category: String(item?.category ?? '').trim(),
    image_url: String(item?.image_url ?? '').trim(),
    views: Number(item?.views ?? 0),
    created_at: item?.created_at ?? null,
  }
}

export function canCancelOrder(status) {
  return ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI'].includes(String(status || '').trim())
}

export const orderStatusLabels = {
  MOI_TAO: 'Vừa tạo',
  DA_XAC_NHAN: 'Đã xác nhận',
  DANG_CHUAN_BI: 'Đang chuẩn bị',
  DANG_GIAO: 'Đang giao',
  HOAN_THANH: 'Hoàn thành',
  DA_HUY: 'Đã hủy',
}

export const paymentStatusLabels = {
  CHO_XU_LY: 'Chờ xử lý',
  CHO_THANH_TOAN: 'Chờ thanh toán',
  CHO_THANH_TOAN_KHI_NHAN_HANG: 'Chờ thanh toán khi nhận',
  DA_THANH_TOAN: 'Đã thanh toán',
  THAT_BAI: 'Thất bại',
}

export const paymentMethodLabels = {
  THANH_TOAN_KHI_NHAN_HANG: 'Thanh toán khi nhận hàng',
  NGAN_HANG_QR: 'QR ngân hàng',
  VNPAY: 'VNPAY',
  VI_DIEN_TU: 'Ví điện tử',
}

export const paymentMethodOptions = [
  { value: 'THANH_TOAN_KHI_NHAN_HANG', label: 'COD', description: 'Thanh toán khi nhận hàng' },
  { value: 'NGAN_HANG_QR', label: 'QR ngân hàng', description: 'Quét mã QR để chuyển khoản' },
  { value: 'VNPAY', label: 'VNPAY', description: 'Thanh toán online qua VNPAY' },
  { value: 'VI_DIEN_TU', label: 'Ví điện tử', description: 'Thanh toán bằng ví điện tử' },
]