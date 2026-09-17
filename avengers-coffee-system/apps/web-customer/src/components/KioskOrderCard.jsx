import { ClockIcon } from '@heroicons/react/24/outline';

const ORDER_STATUS_LABEL = {
  MOI_TAO: 'Mới tạo',
  DA_XAC_NHAN: 'Đã xác nhận',
  DANG_CHUAN_BI: 'Đang chuẩn bị',
  DANG_GIAO: 'Đang giao',
  HOAN_THANH: 'Hoàn thành',
  DA_HUY: 'Đã hủy',
};

const PAYMENT_STATUS_LABEL = {
  CHO_XU_LY: 'Chờ xử lý',
  CHO_THANH_TOAN: 'Chờ thanh toán',
  CHO_THANH_TOAN_KHI_NHAN_HANG: 'Thu tiền khi nhận hàng',
  CHO_THU_TIEN: 'Chờ thu tiền',
  DA_THANH_TOAN: 'Đã thanh toán',
  THAT_BAI: 'Thất bại',
};

const PAYMENT_METHOD_LABEL = {
  VNPAY: 'VNPAY',
  NGAN_HANG_QR: 'Ngân hàng QR',
  THANH_TOAN_KHI_NHAN_HANG: 'COD',
  VI_DIEN_TU: 'Ví điện tử',
};

const ORDER_FLOW = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH'];
const DEFAULT_PRODUCT_FALLBACK_IMG = '/hc-assets/phin-sua-da-eae59734-6d54-471e-a34f-7ffe0fb68e6c.jpg';

function getTimeline(order) {
  const history = Array.isArray(order?.lich_su_trang_thai) ? order.lich_su_trang_thai : [];
  const orderHistory = history.filter((item) => item?.loai === 'ORDER' && item?.trang_thai);
  const latestByStatus = new Map();

  orderHistory.forEach((item) => {
    const status = item.trang_thai;
    const current = latestByStatus.get(status);
    const nextTime = new Date(item?.thoi_gian || 0).getTime();
    const currentTime = new Date(current?.thoi_gian || 0).getTime();

    if (!current || nextTime >= currentTime) {
      latestByStatus.set(status, item);
    }
  });

  const currentIndex = ORDER_FLOW.indexOf(order?.trang_thai_don_hang);

  return ORDER_FLOW.map((status, index) => {
    const matched = latestByStatus.get(status) || null;
    const reached = currentIndex >= 0 ? index <= currentIndex : Boolean(matched);

    return {
      status,
      label: ORDER_STATUS_LABEL[status] || status,
      reached,
      time: reached ? matched?.thoi_gian || null : null,
    };
  });
}

function fmtDate(dateValue) {
  if (!dateValue) return '---';
  return new Date(dateValue).toLocaleString('vi-VN');
}

function fmtMoney(value) {
  return `${Number(value || 0).toLocaleString('vi-VN')}đ`;
}

function resolveProductImage(item, menuProducts = []) {
  if (!item) return DEFAULT_PRODUCT_FALLBACK_IMG;
  const rawUrl = String(item.hinh_anh_url || item.hinhAnhUrl || item.img || '').trim();
  if (rawUrl && rawUrl !== '/hc-assets/caphe-1.png') return rawUrl;
  return DEFAULT_PRODUCT_FALLBACK_IMG;
}

function badgeClass(status) {
  if (['DA_THANH_TOAN', 'THANH_CONG', 'HOAN_THANH'].includes(status)) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200/80';
  }
  if (['THAT_BAI', 'DA_HUY'].includes(status)) {
    return 'bg-rose-50 text-rose-700 border-rose-200/80';
  }
  if (['DANG_GIAO', 'DANG_CHUAN_BI', 'DA_XAC_NHAN'].includes(status)) {
    return 'bg-sky-50 text-sky-700 border-sky-200/80';
  }
  return 'bg-orange-50 text-orange-700 border-orange-200/80';
}

function coTheHuyDon(order) {
  return ['MOI_TAO', 'DA_XAC_NHAN'].includes(order?.trang_thai_don_hang);
}

function coTheDanhGiaDon(order) {
  return order?.trang_thai_don_hang === 'HOAN_THANH';
}

export default function KioskOrderCard({
  order,
  allBranches = [],
  menuProducts = [],
  onCancelClick,
  onReviewProductClick,
}) {
  const timelineSteps = getTimeline(order);
  const branchName = order.co_so_ma || 'Kiosk';

  return (
    <div className="rounded-2xl border-2 border-orange-200 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-300">
      {/* KIOSK Header Info */}
      <div className="flex flex-col justify-between gap-3 border-b border-orange-100 pb-3.5 md:flex-row md:items-center">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-black text-orange-700 bg-orange-100 border border-orange-200 px-2 py-0.5 rounded-md">
              #{order.ma_don_hang}
            </span>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-sm">
              🚀 Đơn Nhượng Quyền Kiosk
            </span>
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-600 font-medium flex-wrap">
            <span>Kiosk: <strong className="text-orange-900 font-bold">{branchName}</strong></span>
            <span>•</span>
            <div className="flex items-center gap-1">
              <ClockIcon className="h-3.5 w-3.5 text-gray-400" />
              {fmtDate(order.ngay_tao)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`rounded-lg border px-2.5 py-1 text-center text-[11px] font-extrabold uppercase ${badgeClass(order.trang_thai_thanh_toan)}`}>
            {PAYMENT_STATUS_LABEL[order.trang_thai_thanh_toan] || order.trang_thai_thanh_toan}
          </span>
          <span className={`rounded-lg border px-2.5 py-1 text-center text-[11px] font-extrabold uppercase ${badgeClass(order.giao_dich?.trang_thai || order.trang_thai_don_hang)}`}>
            {ORDER_STATUS_LABEL[order.trang_thai_don_hang] || order.trang_thai_don_hang}
          </span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Horizontal Progress Timeline */}
          <div className="mb-4 rounded-xl border border-orange-100 bg-orange-50/50 p-3">
            <div className="flex items-center justify-between relative">
              {timelineSteps.map((step, idx) => (
                <div key={`${order.ma_don_hang}-${step.status}`} className="flex flex-col items-center text-center flex-1 relative z-10">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black transition-all ${step.reached ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-200 text-gray-400'
                    }`}>
                    {idx + 1}
                  </div>
                  <span className={`text-[10px] font-bold mt-1 line-clamp-1 ${step.reached ? 'text-orange-900' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-orange-500">Món Nhượng Quyền</p>
          <div className="space-y-2">
            {(order.chi_tiet || []).map((item) => (
              <div key={item.id || `${item.ma_san_pham}-${item.ten_san_pham}`} className="rounded-xl bg-orange-50/30 border border-orange-100 p-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={resolveProductImage(item, menuProducts)}
                    alt={item.ten_san_pham || 'Sản phẩm'}
                    className="h-11 w-11 rounded-lg object-cover bg-white border border-gray-100 shrink-0"
                    onError={(e) => {
                      e.target.onerror = null;
                      e.target.src = DEFAULT_PRODUCT_FALLBACK_IMG;
                    }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{item.ten_san_pham}</p>
                    <p className="text-[11px] text-gray-500 font-medium">SL: {item.so_luong}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0 gap-1">
                  <span className="text-xs font-extrabold text-orange-600">{fmtMoney(item.gia_ban * item.so_luong)}</span>
                  {coTheDanhGiaDon(order) && (
                    <button
                      type="button"
                      onClick={() => onReviewProductClick?.({ productId: item.ma_san_pham, productName: item.ten_san_pham, orderId: order.ma_don_hang })}
                      className="text-[10px] font-bold text-orange-600 hover:text-orange-800 underline cursor-pointer"
                    >
                      Đánh giá món
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col justify-between rounded-xl border border-orange-100 bg-orange-50/50 p-3.5">
          <div className="space-y-2">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-orange-500">Thanh toán (Tại Kiosk)</p>
            <div className="flex items-center justify-between text-xs text-gray-700">
              <span className="font-medium text-gray-500">Phương thức:</span>
              <span className="font-bold">{PAYMENT_METHOD_LABEL[order.phuong_thuc_thanh_toan] || order.phuong_thuc_thanh_toan}</span>
            </div>
            <div className="pt-2 border-t border-orange-200 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700">Tổng cộng:</span>
              <span className="text-base font-black text-orange-600">{fmtMoney(order.tong_tien)}</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-orange-200/80 space-y-2">
            {coTheHuyDon(order) && (
              <button
                type="button"
                onClick={() => onCancelClick?.(order.ma_don_hang)}
                className="w-full rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 py-2 text-xs font-bold uppercase tracking-wider text-rose-600 transition-colors cursor-pointer"
              >
                Hủy Đơn Hàng
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
