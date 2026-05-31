// Demo data for admin mobile
export const demoOrders = [
  {
    id: 'order-001',
    ma_don_hang: 'ORD001',
    trang_thai_don_hang: 'DANG_CHUAN_BI',
    trang_thai_thanh_toan: 'DA_THANH_TOAN',
    phuong_thuc_thanh_toan: 'VNPAY',
    tong_tien: 92000,
    so_luong_san_pham: 4,
    ngay_tao: '2026-05-30',
  },
  {
    id: 'order-002',
    ma_don_hang: 'ORD002',
    trang_thai_don_hang: 'DA_XAC_NHAN',
    trang_thai_thanh_toan: 'CHO_THANH_TOAN_KHI_NHAN_HANG',
    phuong_thuc_thanh_toan: 'THANH_TOAN_KHI_NHAN_HANG',
    tong_tien: 67000,
    so_luong_san_pham: 3,
    ngay_tao: '2026-05-30',
  },
]

export const demoInventory = [
  {
    id: 'inv-001',
    ten_san_pham: 'Cà phê Espresso',
    ton_kho: 150,
    tong_ton: 200,
    trang_thai: 'AVAILABLE',
  },
  {
    id: 'inv-002',
    ten_san_pham: 'Cà phê Capuccino',
    ton_kho: 80,
    tong_ton: 150,
    trang_thai: 'AVAILABLE',
  },
  {
    id: 'inv-003',
    ten_san_pham: 'Trà xanh',
    ton_kho: 5,
    tong_ton: 100,
    trang_thai: 'LOW_STOCK',
  },
]

export const demoShifts = [
  {
    id: 'shift-001',
    nhan_vien: 'Nguyễn Văn A',
    ca_lam: 'SANG',
    gio_bat_dau: '07:00',
    gio_ket_thuc: '14:00',
    trang_thai: 'DANG_LHAM',
  },
  {
    id: 'shift-002',
    nhan_vien: 'Trần Thị B',
    ca_lam: 'CHIEU',
    gio_bat_dau: '14:00',
    gio_ket_thuc: '21:00',
    trang_thai: 'CHUA_BAT_DAU',
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
