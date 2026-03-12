import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { XMarkIcon, ClockIcon, CreditCardIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';
import ReviewForm from './ReviewForm';

const ORDER_STATUS_LABEL = {
  MOI_TAO: 'Moi tao',
  DA_XAC_NHAN: 'Da xac nhan',
  DANG_CHUAN_BI: 'Dang chuan bi',
  DANG_GIAO: 'Dang giao',
  HOAN_THANH: 'Hoan thanh',
  DA_HUY: 'Da huy',
};

const PAYMENT_STATUS_LABEL = {
  CHO_XU_LY: 'Cho xu ly',
  CHO_THANH_TOAN: 'Cho thanh toan',
  CHO_THANH_TOAN_KHI_NHAN_HANG: 'Thu tien khi nhan hang',
  CHO_THU_TIEN: 'Cho thu tien',
  DA_THANH_TOAN: 'Da thanh toan',
  THAT_BAI: 'That bai',
};

const PAYMENT_METHOD_LABEL = {
  VNPAY: 'VNPAY',
  NGAN_HANG_QR: 'Ngan hang QR',
  THANH_TOAN_KHI_NHAN_HANG: 'COD',
};

const ORDER_FLOW = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH'];

function getTimeline(order) {
  const history = Array.isArray(order?.lich_su_trang_thai) ? order.lich_su_trang_thai : [];

  return ORDER_FLOW.map((status, index) => {
    const matched = history.find((item) => item?.loai === 'ORDER' && item?.trang_thai === status);
    const currentIndex = ORDER_FLOW.indexOf(order?.trang_thai_don_hang);
    const reached = matched ? true : currentIndex >= index;
    return {
      status,
      label: ORDER_STATUS_LABEL[status] || status,
      reached,
      time: matched?.thoi_gian || null,
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
  });

  const cancelOrderMutation = useMutation({
    mutationFn: async ({ orderId, reason }) => {
      const response = await apiClient.patch(`/customers/${maNguoiDung}/orders/${orderId}/cancel`, {
        reason,
      });
      return response.data;
    },
    onSuccess: () => {
      setActionMessage('Da gui yeu cau huy don thanh cong.');
      setCancelOrderId(null);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationsByUser(maNguoiDung) });
    },
    onError: (mutationError) => {
      setActionMessage(mutationError?.response?.data?.message || 'Khong the huy don luc nay.');
    },
  });

  const editOrderMutation = useMutation({
    mutationFn: async ({ orderId, payload }) => {
      const response = await apiClient.patch(`/customers/${maNguoiDung}/orders/${orderId}`, payload);
      return response.data;
    },
    onSuccess: () => {
      setActionMessage('Da cap nhat don hang thanh cong.');
      setEditOrderId(null);
      setEditForm({ diaChi: '', khungGio: '', ghiChu: '', items: [] });
      queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
      queryClient.invalidateQueries({ queryKey: queryKeys.notificationsByUser(maNguoiDung) });
    },
    onError: (mutationError) => {
      setActionMessage(mutationError?.response?.data?.message || 'Khong the cap nhat don hang luc nay.');
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
        id: item.id,
        tenSanPham: item.ten_san_pham,
        soLuong: Number(item.so_luong || 0),
      })),
    });
  };

  const capNhatSoLuongSuaDon = (itemId, delta) => {
    setEditForm((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? { ...item, soLuong: Math.max(0, Number(item.soLuong || 0) + delta) }
          : item,
      ),
    }));
  };

  const luuSuaDon = () => {
    const hasItem = editForm.items.some((item) => Number(item.soLuong) > 0);
    if (!hasItem) {
      setActionMessage('Don hang phai con it nhat 1 san pham. Neu khong muon nhan don, vui long huy don.');
      return;
    }

    editOrderMutation.mutate({
      orderId: editOrderId,
      payload: {
        dia_chi_giao_hang: editForm.diaChi,
        khung_gio_giao: editForm.khungGio,
        ghi_chu: editForm.ghiChu,
        items: editForm.items.map((item) => ({
          id: item.id,
          so_luong: Number(item.soLuong || 0),
        })),
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
            <h2 className="text-2xl font-black uppercase tracking-tight text-gray-800">Lich su don hang</h2>
            <p className="mt-1 text-sm font-semibold text-gray-500">Theo doi trang thai thanh toan va phuong thuc thanh toan tung don</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-500 hover:bg-white">
            <XMarkIcon className="h-7 w-7" />
          </button>
        </div>

        {!maNguoiDung ? (
          <div className="p-8 text-center">
            <p className="text-lg font-bold text-gray-700">Ban can dang nhap de xem lich su don hang.</p>
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
                placeholder="Tim theo ma don, ma tham chieu, ten mon..."
              />

              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-tch-orange"
              >
                <option value="ALL">Tat ca trang thai thanh toan</option>
                <option value="CHO_XU_LY">Cho xu ly</option>
                <option value="CHO_THANH_TOAN">Cho thanh toan</option>
                <option value="CHO_THANH_TOAN_KHI_NHAN_HANG">Thu tien khi nhan hang</option>
                <option value="DA_THANH_TOAN">Da thanh toan</option>
                <option value="THAT_BAI">That bai</option>
              </select>

              <select
                value={paymentMethodFilter}
                onChange={(e) => setPaymentMethodFilter(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-tch-orange"
              >
                <option value="ALL">Tat ca phuong thuc thanh toan</option>
                <option value="VNPAY">VNPAY</option>
                <option value="NGAN_HANG_QR">Ngan hang QR</option>
                <option value="THANH_TOAN_KHI_NHAN_HANG">COD</option>
              </select>

              <button
                type="button"
                onClick={() => setAppliedKeyword(searchKeyword.trim())}
                className="rounded-xl bg-tch-orange px-4 py-2 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-orange-200"
              >
                Tim kiem
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
                  {error?.response?.data?.message || error?.message || 'Co loi khi tai lich su don hang'}
                </div>
              ) : null}

              {!loading && !isError && orders.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
                  <p className="text-lg font-black text-gray-600">Chua co don hang nao</p>
                  <p className="mt-1 text-sm font-semibold text-gray-400">Hay dat mon va quay lai de theo doi tien trinh thanh toan.</p>
                </div>
              ) : null}

              {!loading && !isError ? (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <div key={order.ma_don_hang} className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm">
                      <div className="flex flex-col justify-between gap-4 border-b border-gray-100 pb-4 md:flex-row md:items-start">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Ma don hang</p>
                          <p className="mt-1 text-sm font-black text-gray-800">{order.ma_don_hang}</p>
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
                          <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Tien trinh don hang</p>
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
                                    <p className="text-xs font-black uppercase tracking-wide text-red-600">Da huy</p>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>

                          <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Mon da dat</p>
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
                                  onClick={() => setReviewingProduct({ productId: item.ma_san_pham, productName: item.ten_san_pham, orderId: order.ma_don_hang })}
                                  className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-2 py-1 text-[11px] font-black uppercase tracking-wide text-blue-600"
                                >
                                  Danh gia
                                </button>
                              </div>
                            ))}
                          </div>

                          {editOrderId === order.ma_don_hang ? (
                            <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/50 p-4">
                              <p className="text-xs font-black uppercase tracking-widest text-gray-500">Chinh sua don COD truoc khi xac nhan</p>
                              <div className="mt-3 space-y-3">
                                {editForm.items.map((item) => (
                                  <div key={item.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                                    <p className="text-sm font-bold text-gray-700">{item.tenSanPham}</p>
                                    <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-2 py-1">
                                      <button
                                        type="button"
                                        onClick={() => capNhatSoLuongSuaDon(item.id, -1)}
                                        className="h-7 w-7 rounded-lg border border-gray-200 text-sm font-black text-gray-700"
                                      >
                                        -
                                      </button>
                                      <span className="min-w-6 text-center text-sm font-black text-gray-700">{item.soLuong}</span>
                                      <button
                                        type="button"
                                        onClick={() => capNhatSoLuongSuaDon(item.id, 1)}
                                        className="h-7 w-7 rounded-lg border border-gray-200 text-sm font-black text-gray-700"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </div>
                                ))}

                                <input
                                  value={editForm.diaChi}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, diaChi: e.target.value }))}
                                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-tch-orange"
                                  placeholder="Dia chi giao hang"
                                />
                                <input
                                  value={editForm.khungGio}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, khungGio: e.target.value }))}
                                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-tch-orange"
                                  placeholder="Khung gio giao"
                                />
                                <textarea
                                  value={editForm.ghiChu}
                                  onChange={(e) => setEditForm((prev) => ({ ...prev, ghiChu: e.target.value }))}
                                  rows={3}
                                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold outline-none focus:border-tch-orange resize-none"
                                  placeholder="Ghi chu don hang"
                                />

                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={luuSuaDon}
                                    disabled={editOrderMutation.isPending}
                                    className="flex-1 rounded-xl bg-tch-orange px-4 py-2 text-xs font-black uppercase tracking-wide text-white disabled:bg-orange-300"
                                  >
                                    {editOrderMutation.isPending ? 'Dang luu...' : 'Luu cap nhat'}
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
                                    Bo qua
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
                          <p className="text-xs font-black uppercase tracking-widest text-gray-400">Thong tin thanh toan</p>
                          <p className="flex items-center gap-2 text-sm font-bold text-gray-700">
                            <CreditCardIcon className="h-4 w-4" />
                            {PAYMENT_METHOD_LABEL[order.phuong_thuc_thanh_toan] || order.phuong_thuc_thanh_toan}
                          </p>
                          <p className="text-xs font-semibold text-gray-500">Dia chi: {order.dia_chi_giao_hang || '---'}</p>
                          <p className="text-xs font-semibold text-gray-500">Khung gio: {order.khung_gio_giao || '---'}</p>
                          <p className="text-xs font-semibold text-gray-500">Ghi chu: {order.ghi_chu || '---'}</p>
                          <p className="text-xs font-semibold text-gray-500">Trang thai GD: {order.giao_dich?.trang_thai || '---'}</p>
                          <p className="text-xs font-semibold text-gray-500">Ma GD cong: {order.giao_dich?.ma_giao_dich_cong || '---'}</p>
                          <p className="text-xs font-semibold text-gray-500">Ma tham chieu: {order.giao_dich?.ma_tham_chieu || '---'}</p>
                          <p className="pt-2 text-base font-black text-tch-orange">Tong: {fmtMoney(order.tong_tien)}</p>
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
                              Sua don hang
                            </button>
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
                                    placeholder="Nhap ly do huy don (khong bat buoc)"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={() => cancelOrderMutation.mutate({ orderId: order.ma_don_hang, reason: cancelReason.trim() })}
                                      disabled={cancelOrderMutation.isPending}
                                      className="flex-1 rounded-xl bg-red-500 px-3 py-2 text-xs font-black uppercase tracking-wide text-white disabled:bg-red-300"
                                    >
                                      {cancelOrderMutation.isPending ? 'Dang huy...' : 'Xac nhan huy'}
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
                                      Bo qua
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
                                  Huy don hang
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
