// Demo products for customer mobile
export const demoProducts = [
  {
    id: 'prod-001',
    ma_san_pham: 'CF001',
    ten_san_pham: 'Cà phê Espresso',
    mo_ta: 'Cà phê espresso nguyên bản',
    gia_ban: 35000,
    gia_niem_yet: 40000,
    hinh_anh_url: 'https://via.placeholder.com/200?text=Espresso',
    danhMuc: { id: 1, ten_danh_muc: 'Cà phê' },
    la_hot: true,
    la_moi: false,
  },
  {
    id: 'prod-002',
    ma_san_pham: 'CF002',
    ten_san_pham: 'Cà phê Capuccino',
    mo_ta: 'Capuccino với sữa mịn',
    gia_ban: 42000,
    gia_niem_yet: 50000,
    hinh_anh_url: 'https://via.placeholder.com/200?text=Capuccino',
    danhMuc: { id: 1, ten_danh_muc: 'Cà phê' },
    la_hot: false,
    la_moi: true,
  },
  {
    id: 'prod-003',
    ma_san_pham: 'TEA001',
    ten_san_pham: 'Trà xanh lạnh',
    mo_ta: 'Trà xanh tươi mát',
    gia_ban: 25000,
    gia_niem_yet: 30000,
    hinh_anh_url: 'https://via.placeholder.com/200?text=Tra+Xanh',
    danhMuc: { id: 2, ten_danh_muc: 'Trà' },
    la_hot: false,
    la_moi: false,
  },
]

// Demo orders for customer mobile
export const demoOrders = [
  {
    id: 'order-001',
    ma_don_hang: 'ORD001',
    trang_thai_don_hang: 'HOAN_THANH',
    trang_thai_thanh_toan: 'DA_THANH_TOAN',
    phuong_thuc_thanh_toan: 'VNPAY',
    tong_tien: 67000,
    ngay_tao: '2026-05-29',
  },
  {
    id: 'order-002',
    ma_don_hang: 'ORD002',
    trang_thai_don_hang: 'DANG_GIAO',
    trang_thai_thanh_toan: 'CHO_THANH_TOAN',
    phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG',
    tong_tien: 92000,
    ngay_tao: '2026-05-30',
  },
]

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
