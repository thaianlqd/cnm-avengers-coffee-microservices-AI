import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { XMarkIcon, ClockIcon, CreditCardIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';
import ReviewForm from './ReviewForm';

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
};

const BRANCH_LABEL = {
  MAC_DINH_CHI: 'Mạc Đĩnh Chi',
  THE_GRACE_TOWER: 'The Grace Tower',
};

const ORDER_FLOW = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH'];

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

    // Khi don dang o mot trang thai trong flow, chi hien thi cac moc den trang thai hien tai.
    // Neu don da huy (ngoai flow), giu lai nhung moc tung dat theo lich su.
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

function fmtBranch(branchCode) {
  if (!branchCode) return 'Đang cập nhật';
  return BRANCH_LABEL[branchCode] || branchCode;
}

function badgeClass(status) {
  if (status === 'DA_THANH_TOAN' || status === 'THANH_CONG') return 'bg-emerald-50 text-emerald-700 border-emerald-100';
  if (status === 'THAT_BAI' || status === 'DA_HUY') return 'bg-red-50 text-red-700 border-red-100';
  return 'bg-amber-50 text-amber-700 border-amber-100';
}

function coTheHuyDon(order) {
  return ['MOI_TAO', 'DA_XAC_NHAN'].includes(order?.trang_thai_don_hang);
}

function coTheSuaDon(order) {
  return order?.trang_thai_don_hang === 'MOI_TAO' && order?.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG';
}

function coTheDanhGiaDon(order) {
  return order?.trang_thai_don_hang === 'HOAN_THANH';
}

function taoMaDongTam() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function OrderHistoryModal({ isOpen, onClose, user }) {
  const queryClient = useQueryClient();
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('ALL');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [cancelOrderId, setCancelOrderId] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editOrderId, setEditOrderId] = useState(null);
  const [reviewingProduct, setReviewingProduct] = useState(null);
  const [editForm, setEditForm] = useState({
    diaChi: '',
    khungGio: '',
    ghiChu: '',
    items: [],
  });
  const [actionMessage, setActionMessage] = useState('');

  const maNguoiDung = useMemo(() => user?.ma_nguoi_dung || null, [user]);

  const currentFilters = useMemo(
    () => ({
      paymentStatus: paymentStatusFilter,
      paymentMethod: paymentMethodFilter,
      keyword: appliedKeyword,
    }),
    [paymentStatusFilter, paymentMethodFilter, appliedKeyword],
  );

  const {
    data: orders = [],
    isLoading: loading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.orderHistory(maNguoiDung, currentFilters),
    queryFn: async () => {
      const params = new URLSearchParams();

      if (paymentStatusFilter !== 'ALL') {
        params.set('payment_status', paymentStatusFilter);
      }
      if (paymentMethodFilter !== 'ALL') {
        params.set('payment_method', paymentMethodFilter);
      }
      if (appliedKeyword) {
        params.set('q', appliedKeyword);
      }

      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await apiClient.get(`/customers/${maNguoiDung}/orders${query}`);
      return response.data?.orders || [];
    },
    enabled: Boolean(maNguoiDung && isOpen),
    staleTime: 30 * 1000,
    refetchInterval: 10 * 1000,
  });

  const { data: menuProducts = [] } = useQuery({
    queryKey: queryKeys.menuProducts,
    queryFn: async () => {
      const response = await apiClient.get('/menu/san-pham');
      return response.data || [];
    },
    enabled: Boolean(isOpen),
    staleTime: 60 * 1000,
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }) => {
      const response = await apiClient.patch(`/customers/${maNguoiDung}/orders/${orderId}/cancel`, {
        reason,
      });
      return response.data;
    },
    onSuccess: () => {
      setActionMessage('Đã gửi yêu cầu hủy đơn thành công.');
      setCancelOrderId(null);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationsByUser(maNguoiDung) });
    },
    onError: (mutationError) => {
      setActionMessage(mutationError?.response?.data?.message || 'Không thể hủy đơn lúc này.');
    },
  });

  const editOrderMutation = useMutation({
    mutationFn: async ({ orderId, payload }) => {
      const response = await apiClient.patch(`/customers/${maNguoiDung}/orders/${orderId}`, payload);
      return response.data;
    },
    onSuccess: () => {
      setActionMessage('Đã cập nhật đơn hàng thành công.');
      setEditOrderId(null);
      setEditForm({ diaChi: '', khungGio: '', ghiChu: '', items: [] });
      queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationsByUser(maNguoiDung) });
    },
    onError: (mutationError) => {
      setActionMessage(mutationError?.response?.data?.message || 'Không thể cập nhật đơn hàng lúc này.');
    },
  });

  useEffect(() => {
    if (!isOpen) {
      setSearchKeyword('');
      setAppliedKeyword('');
      setCancelOrderId(null);
      setCancelReason('');
      setEditOrderId(null);
      setEditForm({ diaChi: '', khungGio: '', ghiChu: '', items: [] });
      setActionMessage('');
    }
  }, [isOpen]);

  const batDauSuaDon = (order) => {
    setEditOrderId(order.ma_don_hang);
    setCancelOrderId(null);
    setCancelReason('');
    setActionMessage('');
    setEditForm({
      diaChi: order.dia_chi_giao_hang || '',
      khungGio: order.khung_gio_giao || '',
      ghiChu: order.ghi_chu || '',
      items: (order.chi_tiet || []).map((item) => ({
        lineId: String(item.id || taoMaDongTam()),
        id: item.id || null,
        maSanPham: Number(item.ma_san_pham),
        tenSanPham: item.ten_san_pham,
        giaBan: Number(item.gia_ban || 0),
        soLuong: Number(item.so_luong || 0),
        kichCo: item.kich_co || 'Nhỏ',
        hinhAnhUrl: item.hinh_anh_url || '',
      })),
    });
  };

  const capNhatSoLuongSuaDon = (lineId, delta) => {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.lineId === lineId
          ? { ...item, soLuong: Math.max(0, Number(item.soLuong || 0) + delta) }
          : item,
      ),
    }));
  };

  const capNhatMonSuaDon = (lineId, productIdRaw) => {
    const productId = Number(productIdRaw);
    const product = menuProducts.find((p) => Number(p.ma_san_pham) === productId);
    if (!product) {
      return;
    }

    setEditForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.lineId === lineId
          ? {
              ...item,
              maSanPham: productId,
              tenSanPham: product.ten_san_pham,
              giaBan: Number(product.gia_ban || 0),
              hinhAnhUrl: product.hinh_anh_url || '',
            }
          : item,
      ),
    }));
  };

  const themDongSuaDon = () => {
    const fallbackProduct = menuProducts[0];
    if (!fallbackProduct) {
      setActionMessage('Không tải được danh sách món để thêm vào đơn.');
      return;
    }

    setEditForm((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          lineId: taoMaDongTam(),
          id: null,
          maSanPham: Number(fallbackProduct.ma_san_pham),
          tenSanPham: fallbackProduct.ten_san_pham,
          giaBan: Number(fallbackProduct.gia_ban || 0),
          soLuong: 1,
          kichCo: 'Nhỏ',
          hinhAnhUrl: fallbackProduct.hinh_anh_url || '',
        },
      ],
    }));
  };

  const xoaDongSuaDon = (lineId) => {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.lineId !== lineId),
    }));
  };

  const luuSuaDon = () => {
    const normalizedItems = editForm.items
      .map((item) => ({
        ma_san_pham: Number(item.maSanPham),
        ten_san_pham: String(item.tenSanPham || '').trim(),
        so_luong: Number(item.soLuong || 0),
        gia_ban: Number(item.giaBan || 0),
        kich_co: String(item.kichCo || '').trim() || null,
        hinh_anh_url: String(item.hinhAnhUrl || '').trim() || null,
      }))
      .filter((item) => item.so_luong > 0);

    const hasItem = normalizedItems.length > 0;
    if (!hasItem) {
      setActionMessage('Đơn hàng phải còn ít nhất 1 sản phẩm. Nếu không muốn nhận đơn, vui lòng hủy đơn.');
      return;
    }

    if (normalizedItems.some((item) => Number.isNaN(item.ma_san_pham) || !item.ten_san_pham || Number.isNaN(item.gia_ban))) {
      setActionMessage('Vui lòng chọn món hợp lệ trước khi lưu cập nhật đơn.');
      return;
    }

    editOrderMutation.mutate({
      orderId: editOrderId,
      payload: {
        dia_chi_giao_hang: editForm.diaChi,
        khung_gio_giao: editForm.khungGio,
        ghi_chu: editForm.ghiChu,
        items: normalizedItems,
      },
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose}></div>

      <div className="relative z-10 h-[88vh] w-full max-w-5xl overflow-hidden rounded-[28px] border border-orange-100 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-orange-50 bg-gradient-to-r from-orange-50 to-amber-50 px-6 py-5">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tight text-gray-800">Lịch sử đơn hàng</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">Theo dõi trạng thái thanh toán và phương thức thanh toán từng đơn</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-500 hover:bg-white">
            <XMarkIcon className="h-7 w-7" />
          </button>
        </div>

        {!maNguoiDung ? (
          <div className="p-8 text-center">
            <p className="text-lg font-bold text-gray-700">Bạn cần đăng nhập để xem lịch sử đơn hàng.</p>
          </div>
        ) : (
          <div className="flex h-[calc(88vh-86px)] flex-col">
            <div className="grid grid-cols-1 gap-3 border-b border-gray-100 bg-white px-6 py-4 md:grid-cols-4">
              <input
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setAppliedKeyword(searchKeyword.trim());
                  }
                }}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-tch-orange"
                placeholder="Tìm theo mã đơn, mã tham chiếu, tên món..."
              />

              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-tch-orange"
              >
                <option value="ALL">Tất cả trạng thái thanh toán</option>
                <option value="CHO_XU_LY">Chờ xử lý</option>
                <option value="CHO_THANH_TOAN">Chờ thanh toán</option>
                <option value="CHO_THANH_TOAN_KHI_NHAN_HANG">Thu tiền khi nhận hàng</option>
                <option value="DA_THANH_TOAN">Đã thanh toán</option>
                <option value="THAT_BAI">Thất bại</option>
              </select>

              <select
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-tch-orange"
              >
                <option value="ALL">Tất cả phương thức thanh toán</option>
                <option value="VNPAY">VNPAY</option>
                <option value="NGAN_HANG_QR">Ngân hàng QR</option>
                <option value="THANH_TOAN_KHI_NHAN_HANG">COD</option>
              </select>

              <button
                type="button"
                onClick={() => setAppliedKeyword(searchKeyword.trim())}
                className="rounded-xl bg-tch-orange px-4 py-2 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-orange-200"
              >
                Tìm kiếm
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#fffdf9] px-6 py-5">
              {actionMessage ? (
                <div className="mb-4 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-semibold text-gray-700">
                  {actionMessage}
                </div>
              ) : null}

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((x) => (
                    <div key={x} className="h-28 animate-pulse rounded-2xl bg-orange-100/60"></div>
                  ))}
                </div>
              ) : null}

              {!loading && isError ? (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {error?.response?.data?.message || error?.message || 'Có lỗi khi tải lịch sử đơn hàng'}
                </div>
              ) : null}

              {!loading && !isError && orders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
                  <p className="text-lg font-black text-gray-600">Chưa có đơn hàng nào</p>
                  <p className="mt-1 text-sm font-semibold text-gray-400">Hãy đặt món và quay lại để theo dõi tiến trình thanh toán.</p>
                </div>
              ) : null}

              {!loading && !isError ? (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.ma_don_hang} className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
                      <div className="flex flex-col justify-between gap-4 border-b border-gray-100 pb-4 md:flex-row md:items-start">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Mã đơn hàng</p>
                          <p className="mt-1 text-sm font-black text-gray-800">{order.ma_don_hang}</p>
                          <p className="mt-1 text-xs font-bold text-gray-500">Cơ sở xử lý: {fmtBranch(order.co_so_ma)}</p>
                          <div className="mt-2 flex items-center gap-2 text-xs font-semibold text-gray-500">
                            <ClockIcon className="h-4 w-4" />
                            {fmtDate(order.ngay_tao)}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2 md:gap-3">
                          <span className={`rounded-full border px-3 py-1 text-center text-xs font-black uppercase ${badgeClass(order.trang_thai_thanh_toan)}`}>
                            {PAYMENT_STATUS_LABEL[order.trang_thai_thanh_toan] || order.trang_thai_thanh_toan}
                          </span>
                          <span className={`rounded-full border px-3 py-1 text-center text-xs font-black uppercase ${badgeClass(order.giao_dich?.trang_thai || order.trang_thai_don_hang)}`}>
                            {ORDER_STATUS_LABEL[order.trang_thai_don_hang] || order.trang_thai_don_hang}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <div className="lg:col-span-2">
                          <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Tiến trình đơn hàng</p>
                          <div className="mb-4 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
                            <div className="space-y-2">
                              {getTimeline(order).map((step) => (
                                <div key={`${order.ma_don_hang}-${step.status}`} className="flex items-start gap-3">
                                  <div className={`mt-1 h-2.5 w-2.5 rounded-full ${step.reached ? 'bg-tch-orange' : 'bg-gray-300'}`}></div>
                                  <div className="flex-1">
                                    <p className={`text-xs font-black uppercase tracking-wide ${step.reached ? 'text-gray-700' : 'text-gray-400'}`}>
                                      {step.label}
                                    </p>
                                    {step.time ? <p className="text-[11px] font-semibold text-gray-500">{fmtDate(step.time)}</p> : null}
                                  </div>
                                </div>
                              ))}
                              {order.trang_thai_don_hang === 'DA_HUY' ? (
                                <div className="flex items-start gap-3">
                                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-red-500"></div>
                                  <div className="flex-1">
                                    <p className="text-xs font-black uppercase tracking-wide text-red-600">Đã hủy</p>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Món đã đặt</p>
                          <div className="space-y-2">
                            {(order.chi_tiet || []).map((item) => (
                              <div key={item.id || `${item.ma_san_pham}-${item.ten_san_pham}`} className="rounded-xl bg-gray-50 px-3 py-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <img src={item.hinh_anh_url} alt={item.ten_san_pham} className="h-10 w-10 rounded-lg object-cover" />
                                    <div>
                                      <p className="text-sm font-bold text-gray-700">{item.ten_san_pham}</p>
                                      <p className="text-xs font-semibold text-gray-500">Size: {item.kich_co || 'Nhỏ'} • SL: {item.so_luong}</p>
                                    </div>
                                  </div>
                                  <span className="text-sm font-black text-tch-orange">{fmtMoney(item.gia_ban * item.so_luong)}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!coTheDanhGiaDon(order)) {
                                      setActionMessage('Bạn chỉ có thể đánh giá sau khi đơn hàng đã giao thành công.');
                                      return;
                                    }
                                    setReviewingProduct({ productId: item.ma_san_pham, productName: item.ten_san_pham, orderId: order.ma_don_hang });
                                  }}
                                  disabled={!coTheDanhGiaDon(order)}
                                  className={`mt-2 w-full rounded-lg border px-2 py-1 text-[11px] font-black uppercase tracking-wide ${
                                    coTheDanhGiaDon(order)
                                      ? 'border-blue-200 bg-white text-blue-600'
                                      : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                  }`}
                                >
                                  {coTheDanhGiaDon(order) ? 'Đánh giá' : 'Chờ giao hàng để đánh giá'}
                                </button>
                              </div>
                            ))}
                          </div>

                          {editOrderId === order.ma_don_hang ? (
                            <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
                              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Chỉnh sửa đơn COD trước khi xác nhận</p>
                              <div className="mt-3 space-y-3">
                                {editForm.items.map((item) => (
                                  <div key={item.lineId} className="space-y-2 rounded-xl bg-white px-3 py-3">
                                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_120px_80px_auto] md:items-center">
                                      <select
                                        value={item.maSanPham}
                                        onChange={(e) => capNhatMonSuaDon(item.lineId, e.target.value)}
                                        className="rounded-lg border border-gray-200 px-2 py-2 text-xs font-bold text-gray-700 outline-none focus:border-tch-orange"
                                      >
                                        {menuProducts.map((product) => (
                                          <option key={product.ma_san_pham} value={product.ma_san_pham}>
                                            {product.ten_san_pham}
                                          </option>
                                        ))}
                                      </select>
                                      <select
                                        value={item.kichCo}
                                        onChange={(e) =>
                                          setEditForm((prev) => ({
                                            ...prev,
                                            items: prev.items.map((x) =>
                                              x.lineId === item.lineId ? { ...x, kichCo: e.target.value } : x,
                                            ),
                                          }))
                                        }
                                        className="rounded-lg border border-gray-200 px-2 py-2 text-xs font-bold text-gray-700 outline-none focus:border-tch-orange"
                                      >
                                        <option value="Nhỏ">Size Nhỏ</option>
                                        <option value="Vừa">Size Vừa</option>
                                      </select>
                                      <div className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-2 py-1">
                                        <button
                                          type="button"
                                          onClick={() => capNhatSoLuongSuaDon(item.lineId, -1)}
                                          className="h-7 w-7 rounded-lg border border-gray-200 text-sm font-black text-gray-700"
                                        >
                                          -
                                        </button>
                                        <span className="min-w-6 text-center text-sm font-black text-gray-700">{item.soLuong}</span>
                                        <button
                                          type="button"
                                          onClick={() => capNhatSoLuongSuaDon(item.lineId, 1)}
                                          className="h-7 w-7 rounded-lg border border-gray-200 text-sm font-black text-gray-700"
                                        >
                                          +
                                        </button>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => xoaDongSuaDon(item.lineId)}
                                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-red-600"
                                      >
                                        Xóa
                                      </button>
                                    </div>
                                    <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
                                      <span>{item.tenSanPham}</span>
                                      <span>{fmtMoney(Number(item.giaBan || 0) * Number(item.soLuong || 0))}</span>
                                    </div>
                                  </div>
                                ))}

                                <button
                                  type="button"
                                  onClick={themDongSuaDon}
                                  className="w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-tch-orange"
                                >
                                  Thêm món/size
                                </button>

                                <div className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-500">
                                  Tổng tạm tính: {fmtMoney(editForm.items.reduce((sum, item) => sum + Number(item.giaBan || 0) * Number(item.soLuong || 0), 0))}
                                </div>

                                <input
                                  value={editForm.diaChi}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, diaChi: e.target.value }))}
                                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-tch-orange"
                                  placeholder="Địa chỉ giao hàng"
                                />
                                <input
                                  value={editForm.khungGio}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, khungGio: e.target.value }))}
                                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-tch-orange"
                                  placeholder="Khung giờ giao"
                                />
                                <textarea
                                  value={editForm.ghiChu}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, ghiChu: e.target.value }))}
                                  rows={3}
                                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-tch-orange resize-none"
                                  placeholder="Ghi chú đơn hàng"
                                />

                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={luuSuaDon}
                                    disabled={editOrderMutation.isPending}
                                    className="flex-1 rounded-xl bg-tch-orange px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:bg-orange-300"
                                  >
                                    {editOrderMutation.isPending ? 'Đang lưu...' : 'Lưu cập nhật'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditOrderId(null);
                                      setEditForm({ diaChi: '', khungGio: '', ghiChu: '', items: [] });
                                      setActionMessage('');
                                    }}
                                    className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-black uppercase tracking-wide text-gray-600"
                                  >
                                    Bỏ qua
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
                          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Thông tin thanh toán</p>
                          <p className="flex items-center gap-2 text-sm font-bold text-gray-700">
                            <CreditCardIcon className="h-4 w-4" />
                            {PAYMENT_METHOD_LABEL[order.phuong_thuc_thanh_toan] || order.phuong_thuc_thanh_toan}
                          </p>
                          <p className="text-xs font-semibold text-gray-500">Địa chỉ: {order.dia_chi_giao_hang || '---'}</p>
                          <p className="text-xs font-semibold text-gray-500">Cơ sở xử lý: {fmtBranch(order.co_so_ma)}</p>
                          <p className="text-xs font-semibold text-gray-500">Khung giờ: {order.khung_gio_giao || '---'}</p>
                          <p className="text-xs font-semibold text-gray-500">Ghi chú: {order.ghi_chu || '---'}</p>
                          <p className="text-xs font-semibold text-gray-500">Trạng thái GD: {order.giao_dich?.trang_thai || '---'}</p>
                          <p className="text-xs font-semibold text-gray-500">Mã GD cổng: {order.giao_dich?.ma_giao_dich_cong || '---'}</p>
                          <p className="text-xs font-semibold text-gray-500">Mã tham chiếu: {order.giao_dich?.ma_tham_chieu || '---'}</p>
                          <p className="pt-2 text-base font-black text-tch-orange">Tổng: {fmtMoney(order.tong_tien)}</p>
                          {order.ma_voucher ? (
                            <div className="mt-1 rounded-lg border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs">
                              <span className="font-bold text-orange-600">Voucher: {order.ma_voucher}</span>
                              {order.so_tien_giam > 0 && (
                                <span className="ml-2 text-gray-600">(-{fmtMoney(order.so_tien_giam)})</span>
                              )}
                            </div>
                          ) : null}

                          {coTheSuaDon(order) && editOrderId !== order.ma_don_hang ? (
                            <button
                              type="button"
                              onClick={() => batDauSuaDon(order)}
                              className="w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-tch-orange"
                            >
                              Sửa đơn hàng
                            </button>
                          ) : null}

                          {order.trang_thai_don_hang === 'HOAN_THANH' ? (
                            <p className="pt-2 text-xs font-semibold text-emerald-700">Đơn đã hoàn thành, không thể hủy.</p>
                          ) : null}

                          {coTheHuyDon(order) ? (
                            <div className="pt-3">
                              {cancelOrderId === order.ma_don_hang ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={cancelReason}
                                    onChange={(e) => setCancelReason(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-red-300 resize-none"
                                    placeholder="Nhập lý do hủy đơn (không bắt buộc)"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => cancelOrderMutation.mutate({ orderId: order.ma_don_hang, reason: cancelReason.trim() })}
                                      disabled={cancelOrderMutation.isPending}
                                      className="flex-1 rounded-xl bg-red-500 px-3 py-2 text-xs font-black uppercase tracking-wide text-white disabled:bg-red-300"
                                    >
                                      {cancelOrderMutation.isPending ? 'Đang hủy...' : 'Xác nhận hủy'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCancelOrderId(null);
                                        setCancelReason('');
                                        setActionMessage('');
                                      }}
                                      className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-black uppercase tracking-wide text-gray-600"
                                    >
                                      Bỏ qua
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancelOrderId(order.ma_don_hang);
                                    setCancelReason('');
                                    setActionMessage('');
                                  }}
                                  className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black uppercase tracking-wide text-red-600"
                                >
                                  Hủy đơn hàng
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {reviewingProduct && (
        <ReviewForm
          productId={reviewingProduct.productId}
          productName={reviewingProduct.productName}
          userId={maNguoiDung}
          orderId={reviewingProduct.orderId}
          onSaved={(message) => setActionMessage(message)}
          onDeleted={(message) => setActionMessage(message)}
          onClose={() => setReviewingProduct(null)}
        />
      )}
    </div>
  );
}
