import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { XMarkIcon, ClockIcon, CreditCardIcon } from '@heroicons/react/24/outline';
import { apiClient } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';
import ReviewForm from './ReviewForm';
import BranchReviewModal from './BranchReviewModal';
import OrderTrackingPage from '../pages/features_thaian/OrderTrackingPage';
import { useCart } from '../context/CartContext';
import CartEditModal from './CartEditModal';

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

const BRANCH_LABEL = {
  MAC_DINH_CHI: 'Chi nhánh hệ thống',
  THE_GRACE_TOWER: 'The Grace Tower',
  Q1: 'Highlands Coffee Indochina Riverside', // Fallback cho các đơn test
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

function fmtBranch(branchCode, branches = []) {
  if (!branchCode) return 'Đang cập nhật';
  const branch = branches.find(b => b.ma_chi_nhanh === branchCode || b.co_so_ma === branchCode || b.branch_code === branchCode);
  if (branch) return branch.ten_chi_nhanh || branch.ten_co_so || branch.name || branchCode;
  return BRANCH_LABEL[branchCode] || branchCode;
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
  return 'bg-amber-50 text-amber-700 border-amber-200/80';
}

function renderOrderTypeTag(type, method, table) {
  if (type === 'DUNG_TAI_CHO') {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80">Dùng tại bàn {table ? `(Bàn ${table})` : ''}</span>;
  }
  if (type === 'TAI_CHO') {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80">Tại quầy {table ? `- Bàn ${table}` : ''}</span>;
  }
  if (type === 'LAY_TAI_QUAN') {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80">Lấy tại quán</span>;
  }
  if (type === 'MANG_DI') {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80">Mang đi</span>;
  }
  if (type === 'GIAO_TAN_NOI') {
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${method === 'LALAMOVE' ? 'bg-purple-50 text-purple-700 border-purple-200/80' : 'bg-indigo-50 text-indigo-700 border-indigo-200/80'}`}>
        {method === 'LALAMOVE' ? 'Giao hàng Lalamove' : 'Giao tận nơi'}
      </span>
    );
  }
  return null;
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
  const [branchReviewOrder, setBranchReviewOrder] = useState(null);
  const [trackingOrderId, setTrackingOrderId] = useState(null);
  const [editingItemIndex, setEditingItemIndex] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
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

  const { data: publicBranchPayload } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      const response = await apiClient.get('/users/branches/public');
      return response.data;
    },
    enabled: Boolean(isOpen),
    staleTime: 60 * 1000,
  });
  const allBranches = publicBranchPayload?.items || [];

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
      setTrackingOrderId(null);
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
        toppings: item.toppings || [],
        luongDa: item.luong_da || '',
        doNgot: item.do_ngot || '',
        ghiChu: item.ghi_chu || '',
        loaiSua: item.loai_sua || '',
        custom_attributes: item.custom_attributes || {},
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
              kichCo: 'Nhỏ',
              toppings: [],
              luongDa: '',
              doNgot: '',
              ghiChu: '',
              loaiSua: '',
              custom_attributes: {},
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
          toppings: [],
          luongDa: '',
          doNgot: '',
          ghiChu: '',
          loaiSua: '',
          custom_attributes: {},
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

  const moBangSuaTuyChon = (idx, item) => {
    const product = menuProducts.find((p) => Number(p.ma_san_pham) === item.maSanPham);
    if (!product) return;
    setEditingProduct(product);
    setEditingItemIndex(idx);
  };

  const handleSaveEditItemOptions = (newItem) => {
    setEditForm((prev) => {
      const newItems = [...prev.items];
      const target = newItems[editingItemIndex];
      newItems[editingItemIndex] = {
        ...target,
        kichCo: newItem.size,
        luongDa: newItem.luong_da,
        doNgot: newItem.do_ngot,
        loaiSua: newItem.loai_sua,
        toppings: newItem.toppings,
        custom_attributes: newItem.custom_attributes,
        giaBan: newItem.gia_ban,
      };
      return { ...prev, items: newItems };
    });
    setEditingItemIndex(null);
    setEditingProduct(null);
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
        toppings: item.toppings || [],
        luong_da: item.luongDa || null,
        do_ngot: item.doNgot || null,
        loai_sua: item.loaiSua || null,
        ghi_chu: item.ghiChu || null,
        custom_attributes: item.custom_attributes || {},
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

  const { reorderItems, activeUserId, refreshCart } = useCart();

  const reorderMutation = useMutation({
    mutationFn: async (order) => {
      // 1. Thêm lại món vào giỏ
      await reorderItems(order.chi_tiet || []);
      
      // 2. Khởi tạo thanh toán ngay lập tức
      const payload = {
        phuong_thuc_thanh_toan: order.phuong_thuc_thanh_toan || 'THANH_TOAN_KHI_NHAN_HANG',
        dia_chi_giao_hang: order.dia_chi_giao_hang || 'Khách lấy tại quán',
        khung_gio_giao: order.khung_gio_giao || '',
        ghi_chu: order.ghi_chu || 'Dat lai tu lich su don hang',
        delivery_mode: order.loai_don_hang || 'GIAO_TAN_NOI',
        delivery_method: order.phuong_thuc_giao_hang || 'NOI_BO',
        branch_code: order.co_so_ma,
      };
      
      const response = await apiClient.post(`/customers/${activeUserId}/thanh-toan/khoi-tao`, payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
      refreshCart();
      alert('Tạo đơn hàng mới thành công!');
    },
    onError: (err) => {
      alert('Có lỗi khi tạo lại đơn hàng: ' + (err.response?.data?.message || err.message));
      console.error(err);
    }
  });

  const handleReorder = (order) => {
    reorderMutation.mutate(order);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose}></div>

      <div className="relative z-10 h-[88vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-2xl flex flex-col">
        {/* Sleek Header */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-white px-6 py-4.5">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-6 rounded-full bg-[#b22830]"></div>
              <h2 className="text-xl font-black tracking-tight text-gray-900 font-sans">LỊCH SỬ ĐƠN HÀNG</h2>
            </div>
            <p className="mt-0.5 text-xs font-semibold text-gray-500">Quản lý, theo dõi tiến trình đơn và thông tin thanh toán</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {!maNguoiDung ? (
          <div className="p-8 text-center">
            <p className="text-lg font-bold text-gray-700">Bạn cần đăng nhập để xem lịch sử đơn hàng.</p>
          </div>
        ) : trackingOrderId ? (
          <div className="flex h-[calc(88vh-86px)] flex-col bg-gray-50 overflow-y-auto">
            <OrderTrackingPage id={trackingOrderId} onBack={() => setTrackingOrderId(null)} />
          </div>
        ) : (
          <div className="flex flex-1 flex-col min-h-0 bg-gray-50/60">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 gap-3 border-b border-gray-100 bg-white px-6 py-3.5 md:grid-cols-4 shadow-2xs">
              <input
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setAppliedKeyword(searchKeyword.trim());
                  }
                }}
                className="rounded-xl border border-gray-200/90 px-3.5 py-2 text-xs font-semibold text-gray-800 outline-none focus:border-[#b22830] focus:ring-1 focus:ring-[#b22830] transition-all bg-gray-50/50"
                placeholder="Tìm mã đơn, tên món..."
              />

              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="rounded-xl border border-gray-200/90 px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-[#b22830] transition-all bg-gray-50/50 cursor-pointer"
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
                className="rounded-xl border border-gray-200/90 px-3 py-2 text-xs font-semibold text-gray-700 outline-none focus:border-[#b22830] transition-all bg-gray-50/50 cursor-pointer"
              >
                <option value="ALL">Tất cả phương thức thanh toán</option>
                <option value="VNPAY">VNPAY</option>
                <option value="NGAN_HANG_QR">Ngân hàng QR</option>
                <option value="THANH_TOAN_KHI_NHAN_HANG">COD</option>
              </select>

              <button
                type="button"
                onClick={() => setAppliedKeyword(searchKeyword.trim())}
                className="rounded-xl bg-[#b22830] hover:bg-[#8e1c23] px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-2xs transition-colors cursor-pointer"
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
                  {orders.map((order) => {
                    const timelineSteps = getTimeline(order);
                    return (
                      <div key={order.ma_don_hang} className="rounded-2xl border border-gray-200/80 bg-white p-5 shadow-2xs hover:shadow-md transition-all duration-300">
                        {/* Order Header Info */}
                        <div className="flex flex-col justify-between gap-3 border-b border-gray-100 pb-3.5 md:flex-row md:items-center">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono font-black text-[#b22830] bg-red-50 border border-red-100 px-2 py-0.5 rounded-md">
                                #{order.ma_don_hang}
                              </span>
                              {renderOrderTypeTag(order.loai_don_hang, order.phuong_thuc_giao_hang, order.ma_ban)}
                            </div>
                            <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 font-medium flex-wrap">
                              <span>Cơ sở: <strong className="text-gray-800 font-semibold">{fmtBranch(order.co_so_ma, allBranches)}</strong></span>
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

                        {/* Order Body: Details & Side Info */}
                        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-3">
                          <div className="lg:col-span-2">
                            {/* Horizontal Progress Timeline */}
                            <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50/70 p-3">
                              <div className="flex items-center justify-between relative">
                                {timelineSteps.map((step, idx) => (
                                  <div key={`${order.ma_don_hang}-${step.status}`} className="flex flex-col items-center text-center flex-1 relative z-10">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black transition-all ${
                                      step.reached ? 'bg-[#b22830] text-white shadow-2xs' : 'bg-gray-200 text-gray-400'
                                    }`}>
                                      {idx + 1}
                                    </div>
                                    <span className={`text-[10px] font-bold mt-1 line-clamp-1 ${step.reached ? 'text-gray-800' : 'text-gray-400'}`}>
                                      {step.label}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Product Items List */}
                            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Danh sách món đã đặt</p>
                            <div className="space-y-2">
                              {(order.chi_tiet || []).map((item) => (
                                <div key={item.id || `${item.ma_san_pham}-${item.ten_san_pham}`} className="rounded-xl bg-gray-50/70 border border-gray-100 p-2.5 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <img src={item.hinh_anh_url || '/hc-assets/caphe-1.png'} alt={item.ten_san_pham} className="h-11 w-11 rounded-lg object-cover bg-white border border-gray-100 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-xs font-bold text-gray-900 truncate">{item.ten_san_pham}</p>
                                      <p className="text-[11px] text-gray-500 font-medium">Size: {item.kich_co || 'Nhỏ'} • SL: {item.so_luong}</p>
                                      {item.toppings?.length > 0 && (
                                        <p className="text-[10px] text-gray-500 truncate">Topping: {item.toppings.join(', ')}</p>
                                      )}
                                      {(item.luong_da || item.do_ngot) && (
                                        <p className="text-[10px] text-gray-500">
                                          {item.luong_da ? `Đá: ${item.luong_da}` : ''} 
                                          {item.luong_da && item.do_ngot ? ' | ' : ''}
                                          {item.do_ngot ? `Ngọt: ${item.do_ngot}` : ''}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-end shrink-0 gap-1">
                                    <span className="text-xs font-extrabold text-[#b22830]">{fmtMoney(item.gia_ban * item.so_luong)}</span>
                                    {coTheDanhGiaDon(order) && (
                                      <button
                                        type="button"
                                        onClick={() => setReviewingProduct({ productId: item.ma_san_pham, productName: item.ten_san_pham, orderId: order.ma_don_hang })}
                                        className="text-[10px] font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                                      >
                                        Đánh giá món
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Order Summary & Actions Side Card */}
                          <div className="flex flex-col justify-between rounded-xl border border-gray-100 bg-gray-50/70 p-3.5">
                            <div className="space-y-2">
                              <p className="text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Thông tin thanh toán</p>
                              <div className="flex items-center justify-between text-xs text-gray-700">
                                <span className="font-medium text-gray-500">Phương thức:</span>
                                <span className="font-bold">{PAYMENT_METHOD_LABEL[order.phuong_thuc_thanh_toan] || order.phuong_thuc_thanh_toan}</span>
                              </div>
                              {order.dia_chi_giao_hang && (
                                <div className="text-xs text-gray-700">
                                  <span className="font-medium text-gray-500">Địa chỉ: </span>
                                  <span className="font-semibold text-gray-800 line-clamp-2">{order.dia_chi_giao_hang}</span>
                                </div>
                              )}
                              {order.ma_voucher && (
                                <div className="rounded-lg border border-amber-200/80 bg-amber-50 px-2.5 py-1.5 text-xs flex items-center justify-between">
                                  <span className="font-bold text-amber-800">Mã voucher: {order.ma_voucher}</span>
                                  {order.so_tien_giam > 0 && <span className="font-extrabold text-amber-900">(-{fmtMoney(order.so_tien_giam)})</span>}
                                </div>
                              )}
                              <div className="pt-2 border-t border-gray-200/80 flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-700">Tổng thanh toán:</span>
                                <span className="text-base font-black text-[#b22830]">{fmtMoney(order.tong_tien)}</span>
                              </div>
                            </div>

                            {/* Order Action Buttons */}
                            <div className="mt-4 pt-3 border-t border-gray-200/80 space-y-2">
                              {['DANG_GIAO', 'PICKING_UP', 'ASSIGNING_DRIVER', 'HOAN_THANH'].includes(order.trang_thai_don_hang) && order.loai_don_hang === 'GIAO_TAN_NOI' && (
                                <button
                                  type="button"
                                  onClick={() => setTrackingOrderId(order.ma_don_hang)}
                                  className="w-full rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 py-2 text-xs font-bold uppercase tracking-wider text-indigo-700 transition-colors cursor-pointer"
                                >
                                  {order.trang_thai_don_hang === 'HOAN_THANH' ? 'Xem & Đánh giá Shipper' : 'Theo dõi vận chuyển'}
                                </button>
                              )}

                              {order.trang_thai_don_hang === 'HOAN_THANH' && (
                                <button
                                  type="button"
                                  onClick={() => setBranchReviewOrder(order)}
                                  className="w-full rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 py-2 text-xs font-bold uppercase tracking-wider text-amber-800 transition-colors cursor-pointer"
                                >
                                  Đánh Giá Chi Nhánh
                                </button>
                              )}

                              {coTheHuyDon(order) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCancelOrderId(order.ma_don_hang);
                                    setCancelReason('');
                                    setActionMessage('');
                                  }}
                                  className="w-full rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 py-2 text-xs font-bold uppercase tracking-wider text-rose-600 transition-colors cursor-pointer"
                                >
                                  Hủy đơn hàng
                                </button>
                              )}

                              {/* Reorder Button */}
                              <button
                                type="button"
                                onClick={() => handleReorder(order)}
                                disabled={reorderMutation.isPending}
                                className="w-full rounded-xl bg-[#b22830] hover:bg-[#8e1c23] py-2 text-xs font-bold uppercase tracking-wider text-white transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                              >
                                {reorderMutation.isPending && reorderMutation.variables?.ma_don_hang === order.ma_don_hang
                                  ? 'Đang xử lý...'
                                  : 'Đặt lại đơn này'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
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

      {branchReviewOrder && (
        <BranchReviewModal
          isOpen={!!branchReviewOrder}
          onClose={() => setBranchReviewOrder(null)}
          orderData={branchReviewOrder}
          onSuccess={() => {
            setActionMessage('Cảm ơn bạn đã gửi đánh giá cho chi nhánh!');
            queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
          }}
        />
      )}

      {editingItemIndex !== null && editingProduct && (
        <CartEditModal
          cartItem={{
            size: editForm.items[editingItemIndex].kichCo,
            luong_da: editForm.items[editingItemIndex].luongDa,
            do_ngot: editForm.items[editingItemIndex].doNgot,
            loai_sua: editForm.items[editingItemIndex].loaiSua,
            toppings: editForm.items[editingItemIndex].toppings,
            custom_attributes: editForm.items[editingItemIndex].custom_attributes,
          }}
          product={editingProduct}
          isOpen={true}
          onClose={() => {
            setEditingItemIndex(null);
            setEditingProduct(null);
          }}
          onSave={handleSaveEditItemOptions}

        />
      )}
    </div>
  );
}
