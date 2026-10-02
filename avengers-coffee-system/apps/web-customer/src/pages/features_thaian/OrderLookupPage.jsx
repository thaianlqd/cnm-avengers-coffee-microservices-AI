import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../lib/apiClient';
import {
  MagnifyingGlassIcon,
  TruckIcon,
  ClockIcon,
  ArrowPathIcon,
  ChevronRightIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  DocumentDuplicateIcon,
  BuildingStorefrontIcon,
  MapPinIcon,
  PhoneIcon,
  UserIcon,
  CreditCardIcon,
  ShoppingBagIcon,
  TicketIcon,
  PrinterIcon,
  SparklesIcon,
  XCircleIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import { io } from 'socket.io-client';
import { resolveAddressCoordinates } from '../../lib/geocodingService';
import ShipperMapView from '../../components/features_thaian/ShipperMapView';


export default function OrderLookupPage({
  initialCode = '',
  onBack,
  onOrderMore,
  onNavigate,
  user: propUser,
  onOpenOrderHistory,
}) {
  const [currentUser, setCurrentUser] = useState(() => {
    if (propUser) return propUser;
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (propUser) {
      setCurrentUser(propUser);
    }
  }, [propUser]);

  const [code, setCode] = useState(initialCode || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [orderResult, setOrderResult] = useState(null);
  const [recentLookups, setRecentLookups] = useState([]);
  const [copiedCode, setCopiedCode] = useState(false);
  const [publicBranches, setPublicBranches] = useState([]);

  // Tải danh sách chi nhánh công khai để hiển thị chính xác tên cơ sở
  useEffect(() => {
    let isMounted = true;
    apiClient.get('/users/branches/public')
      .then(res => {
        const items = Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data) ? res.data : []);
        if (isMounted && items.length > 0) {
          setPublicBranches(items);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // Load recent lookups from localStorage on mount
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('avengers_recent_lookups') || '[]');
      if (Array.isArray(saved)) setRecentLookups(saved);
    } catch {}
  }, []);

  const saveRecentCode = (searchedCode) => {
    const clean = searchedCode.trim().toUpperCase();
    if (!clean) return;
    setRecentLookups((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const updated = [clean, ...list.filter((c) => c !== clean)].slice(0, 5);
      try {
        localStorage.setItem('avengers_recent_lookups', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const performLookup = async (targetCode) => {
    const cleanCode = String(targetCode || '').trim();
    if (!cleanCode) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(
        `/shippers/delivery/tracking/by-code/lookup?code=${encodeURIComponent(cleanCode)}`
      );
      if (res.data?.order) {
        setOrderResult(res.data);
        saveRecentCode(cleanCode);
      } else {
        throw new Error('Không tìm thấy dữ liệu đơn hàng');
      }
    } catch (err) {
      setOrderResult(null);
      if (err.response?.status === 404) {
        setError('Không tìm thấy đơn hàng tương ứng với mã này. Vui lòng kiểm tra lại mã tra cứu (VD: AC-FD2C0) hoặc mã đơn hàng.');
      } else if (err.response?.status >= 500 || err.code === 'ECONNABORTED' || !err.response) {
        setError('Kết nối máy chủ đang bận xử lý dữ liệu. Vui lòng bấm nút "Tra Cứu Ngay" để thử lại.');
      } else {
        setError(
          err.response?.data?.message ||
            'Không tìm thấy đơn hàng tương ứng. Vui lòng kiểm tra lại mã tra cứu (VD: AC-A1B2C) hoặc mã đơn hàng.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  // Real-time tracking qua WebSocket và Polling cập nhật vị trí shipper liên tục
  useEffect(() => {
    if (!orderResult?.order) return;

    const orderId = orderResult.order.ma_don_hang || orderResult.order.id;
    const trackingCode = orderResult.tracking?.tracking_code || orderResult.order.tracking_code || code;
    const isDangGiao = orderResult.order.trang_thai_don_hang === 'DANG_GIAO' || orderResult.tracking?.status === 'IN_TRANSIT';

    // 1. WebSocket kết nối tới namespace /notifications
    const socketBase = import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:3005`;
    const socket = io(`${socketBase}/notifications`, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => {
      socket.emit('tracking:subscribe', { maDonHang: orderId, trackingCode });
    });

    socket.on('shipper:location:update', (data) => {
      if (data?.latitude && data?.longitude) {
        const lat = Number(data.latitude);
        const lng = Number(data.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
          setOrderResult((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              shipper_location: {
                latitude: lat,
                longitude: lng,
                updated_at: data.thoiGianCapNhat || new Date().toISOString(),
              },
            };
          });
        }
      }
    });

    // 2. Polling phụ trợ: 3s nếu đang giao, 10s nếu trạng thái khác
    const pollInterval = setInterval(async () => {
      const targetQuery = trackingCode || code;
      if (!targetQuery) return;
      try {
        const res = await apiClient.get(
          `/shippers/delivery/tracking/by-code/lookup?code=${encodeURIComponent(targetQuery)}&t=${Date.now()}`
        );
        if (res.data?.order) {
          setOrderResult(res.data);
        }
      } catch {}
    }, isDangGiao ? 3000 : 10000);

    return () => {
      socket.disconnect();
      clearInterval(pollInterval);
    };
  }, [orderResult?.order?.ma_don_hang, orderResult?.order?.trang_thai_don_hang, code]);

  const searchedInitialCodeRef = useRef(null);

  // Auto trigger lookup if initialCode is passed
  useEffect(() => {
    const clean = String(initialCode || '').trim().toUpperCase();
    if (clean && searchedInitialCodeRef.current !== clean) {
      searchedInitialCodeRef.current = clean;
      setCode(clean);
      performLookup(clean);
    }
  }, [initialCode]);

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    performLookup(code);
  };

  const handleQuickLookup = (recentCode) => {
    setCode(recentCode);
    performLookup(recentCode);
  };

  const handleResetSearch = () => {
    setOrderResult(null);
    setError(null);
    setCode('');
  };

  const handleCopy = (textToCopy) => {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  // Helper formatting functions
  const formatCurrency = (amount) => {
    return (Number(amount) || 0).toLocaleString('vi-VN') + ' đ';
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Đang cập nhật';
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' - ' + d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Status mappings
  const getOrderStatusMeta = (status) => {
    const st = String(status || '').toUpperCase();
    if (st === 'DA_HUY' || st === 'CANCELLED') {
      return {
        label: 'Đã hủy đơn',
        colorClass: 'bg-red-100 text-red-700 border-red-200',
        badgeBg: 'bg-red-600',
        stepIndex: -1,
        desc: 'Đơn hàng đã được hủy theo yêu cầu hoặc do sự cố.'
      };
    }
    if (st === 'HOAN_THANH' || st === 'COMPLETED' || st === 'DELIVERED') {
      return {
        label: 'Giao hàng thành công',
        colorClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        badgeBg: 'bg-emerald-600',
        stepIndex: 4,
        desc: 'Đơn hàng đã được giao đến tay quý khách thành công.'
      };
    }
    if (st === 'DANG_GIAO' || st === 'PICKED_UP' || st === 'ON_GOING') {
      return {
        label: 'Đang giao hàng',
        colorClass: 'bg-blue-100 text-blue-800 border-blue-200',
        badgeBg: 'bg-blue-600',
        stepIndex: 3,
        desc: 'Shipper đang trên đường vận chuyển món ngon đến bạn.'
      };
    }
    if (st === 'DANG_CHUAN_BI' || st === 'DANG_PHA_CHE' || st === 'CONFIRMED' || st === 'DA_TIEP_NHAN' || st === 'PROCESSING' || st === 'PICKING_UP') {
      return {
        label: 'Đang pha chế và đóng gói',
        colorClass: 'bg-amber-100 text-amber-800 border-amber-200',
        badgeBg: 'bg-amber-600',
        stepIndex: 2,
        desc: 'Barista đang chuẩn bị đồ uống và đóng gói cẩn thận.'
      };
    }
    return {
      label: 'Đã tiếp nhận đơn',
      colorClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      badgeBg: 'bg-emerald-600',
      stepIndex: 1,
      desc: 'Hệ thống đã ghi nhận đơn hàng và chuyển đến quầy pha chế.'
    };
  };

  const getPaymentMethodText = (method) => {
    const m = String(method || '').toUpperCase();
    if (m === 'COD' || m === 'TIEN_MAT' || m === 'THANH_TOAN_KHI_NHAN_HANG') return 'Thanh toán tiền mặt khi nhận hàng (COD)';
    if (m === 'VNPAY') return 'Thanh toán trực tuyến VNPAY';
    if (m === 'MOMO') return 'Ví điện tử MoMo';
    if (m === 'CHUYEN_KHOAN' || m === 'BANKING' || m === 'NGAN_HANG_QR' || m === 'SEPAY' || m === 'VIETQR') return 'Chuyển khoản QR ngân hàng (VietQR)';
    if (m === 'VI_DIEN_TU' || m === 'WALLET') return 'Ví điện tử Avengers';
    return String(method || '').replace(/_/g, ' ') || 'Thanh toán khi nhận hàng';
  };

  const getPaymentStatusMeta = (status) => {
    const st = String(status || '').toUpperCase();
    if (st === 'DA_THANH_TOAN' || st === 'PAID' || st === 'SUCCESS') {
      return {
        label: 'Đã thanh toán',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
      };
    }
    return {
      label: 'Chờ thanh toán',
      className: 'bg-amber-50 text-amber-700 border-amber-200 font-bold'
    };
  };

  const getDeliveryModeText = (mode, order) => {
    const dm = String(mode || order?.loai_don_hang || '').toUpperCase();
    if (dm === 'TAKE_AWAY' || dm === 'MANG_VE' || dm === 'PICKUP') return 'Đến lấy tại cửa hàng (Mang về)';
    if (dm === 'DINE_IN' || dm === 'TAI_BAN' || order?.ma_ban) return `Dùng tại bàn (${order?.ma_ban || 'Tại quán'})`;
    return 'Giao hàng tận nơi';
  };

  // Branch lookup logic
  const getBranch = (branchCode) => {
    if (!branchCode) return null;
    const codeStr = String(branchCode).trim().toUpperCase();
    const codeNorm = codeStr.replace(/-/g, '_');

    // 1. Tìm khớp chính xác trong danh sách chi nhánh công khai
    let matched = publicBranches.find(b => {
      const bCode = String(b.ma_chi_nhanh || b.co_so_ma || b.branch_code || b.id || '').trim().toUpperCase();
      return bCode === codeStr || bCode === codeNorm || bCode.replace(/-/g, '_') === codeNorm;
    });
    if (matched) return matched;

    // 2. Tìm khớp tương đối trong danh sách
    matched = publicBranches.find(b => {
      const bCode = String(b.ma_chi_nhanh || b.co_so_ma || b.branch_code || '').trim().toUpperCase();
      return (bCode && (bCode.includes(codeNorm) || codeNorm.includes(bCode)));
    });
    return matched || null;
  };

  const getBranchName = (branchCode) => {
    if (!branchCode) return 'Cửa hàng Avengers Coffee tiếp nhận';
    const matched = getBranch(branchCode);
    if (matched) {
      return matched.ten_chi_nhanh || matched.name || matched.ten_co_so;
    }
    const cleanLabel = String(branchCode).replace(/^(HC_|HCM_|HN_|DN_)/i, '').replace(/_/g, ' ');
    return `Avengers Coffee - Chi nhánh ${cleanLabel}`;
  };

  const currentOrder = orderResult?.order;
  const currentTracking = orderResult?.tracking;
  const currentShipper = orderResult?.shipper;
  const currentStatusMeta = currentOrder ? getOrderStatusMeta(currentOrder.trang_thai_don_hang) : null;
  const paymentMeta = currentOrder ? getPaymentStatusMeta(currentOrder.trang_thai_thanh_toan) : null;

  return (
    <div className="w-full min-h-screen bg-[#fcfaf7] py-6 md:py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* ── BREADCRUMB & HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#ebdcd0]">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
              <button
                type="button"
                onClick={onBack || (() => onNavigate?.('order'))}
                className="hover:text-[#b22830] transition-colors cursor-pointer"
              >
                Trang chủ
              </button>
              <span>›</span>
              <button
                type="button"
                onClick={onBack || (() => onNavigate?.('order'))}
                className="hover:text-[#b22830] transition-colors cursor-pointer"
              >
                Đặt hàng
              </button>
              <span>›</span>
              <span className="text-[#b22830]">Tra cứu đơn hàng</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight text-[#1f1f1f] font-sans flex items-center gap-3">
              Tra Cứu Đơn Hàng
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-[#b22830] normal-case tracking-normal">
                <TruckIcon className="w-3.5 h-3.5" />
                Khách Vãng Lai &amp; Đơn Hàng
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <ArrowLeftIcon className="w-3.5 h-3.5" />
                <span>Quay lại</span>
              </button>
            )}
            <button
              type="button"
              onClick={onOrderMore || (() => onNavigate?.('order'))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#b22830] hover:bg-[#961c23] text-white text-xs font-bold transition-all shadow-md shadow-red-900/20 active:scale-95 cursor-pointer"
            >
              <ShoppingBagIcon className="w-3.5 h-3.5" />
              <span>Xem thực đơn đặt món</span>
            </button>
          </div>
        </div>

        {/* ── BANNER DÀNH CHO TÀI KHOẢN ĐÃ ĐĂNG NHẬP ── */}
        {currentUser && (
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white rounded-3xl p-5 md:p-6 border border-emerald-200/80 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-emerald-600/20">
                <UserIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-extrabold text-emerald-950">
                  Bạn đang đăng nhập tài khoản: <span className="text-emerald-700">{currentUser.ho_ten || currentUser.full_name || currentUser.username || currentUser.email || 'Hội viên Avengers'}</span>
                </p>
                <p className="text-xs text-emerald-800/80 mt-0.5 font-medium">
                  Mọi đơn hàng của bạn đều được lưu tự động trong Lịch sử đơn hàng, bạn có thể xem nhanh tại đây mà không cần nhập mã tra cứu.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onOpenOrderHistory) {
                  onOpenOrderHistory();
                } else if (onNavigate) {
                  onNavigate('order-history');
                }
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-bold transition-all shadow-md shadow-green-700/20 active:scale-95 cursor-pointer shrink-0"
            >
              <span>Xem Lịch Sử Đơn Hàng</span>
              <ArrowRightIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── SEARCH CARD ── */}
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#ede5dc]">
          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div>
              <label htmlFor="order-search-input" className="block text-xs font-extrabold text-gray-700 uppercase tracking-wider mb-2">
                Nhập mã tra cứu hoặc mã đơn hàng <span className="text-[#b22830]">*</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <input
                    id="order-search-input"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="Ví dụ: AC-A1B2C hoặc DH12345..."
                    className="w-full pl-12 pr-10 py-3.5 rounded-2xl border border-gray-300 focus:border-[#b22830] focus:ring-4 focus:ring-red-100 outline-none transition-all font-mono font-bold text-gray-800 text-sm placeholder:font-sans placeholder:font-normal placeholder:text-gray-400 bg-gray-50/50 focus:bg-white"
                    required
                  />
                  <MagnifyingGlassIcon className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {code && (
                    <button
                      type="button"
                      onClick={() => setCode('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 font-bold text-xs bg-gray-200 hover:bg-gray-300 rounded-full w-5 h-5 flex items-center justify-center transition-colors cursor-pointer"
                      title="Xóa mã"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || !code.trim()}
                  className="sm:w-auto px-8 py-3.5 rounded-2xl bg-[#16a34a] hover:bg-[#15803d] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-sm shadow-md shadow-green-700/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer flex-shrink-0"
                >
                  {loading ? (
                    <>
                      <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      <span>Đang tra cứu...</span>
                    </>
                  ) : (
                    <>
                      <MagnifyingGlassIcon className="w-5 h-5 stroke-[2.5]" />
                      <span>Tra Cứu Ngay</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error banner */}
            {error && (
              <div className="p-4 bg-red-50 text-red-700 text-xs md:text-sm font-semibold rounded-2xl border border-red-100 flex items-start gap-3 animate-fadeIn">
                <ExclamationCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p>{error}</p>
                  <p className="mt-1 text-xs text-red-600 font-normal">
                    Mẹo: Mã tra cứu thường có 8 ký tự dạng <span className="font-mono font-bold">AC-XXXXX</span> được gửi trong email xác nhận khi bạn đặt hàng thành công.
                  </p>
                </div>
              </div>
            )}

            {/* Recent Searches Pills */}
            {recentLookups.length > 0 && (
              <div className="pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">
                  <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
                  <span>Tra cứu gần đây:</span>
                </div>
                {recentLookups.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => handleQuickLookup(c)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-mono font-bold transition-all cursor-pointer ${
                      code === c
                        ? 'bg-red-50 border-red-300 text-[#b22830]'
                        : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-red-50 hover:border-red-200 hover:text-[#b22830]'
                    }`}
                  >
                    <span>{c}</span>
                    <ChevronRightIcon className="w-3 h-3 opacity-60" />
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>

        {/* ── CONDITIONAL CONTENT: RESULT OR EMPTY INSTRUCTION ── */}
        {orderResult && currentOrder ? (
          <div className="space-y-6 animate-fadeIn">
            
            {/* 1. ORDER STATUS & TIMELINE CARD */}
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#ede5dc] space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-gray-100">
                <div className="space-y-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Mã đơn hàng:</span>
                    <span className="font-mono font-black text-gray-900 text-base md:text-lg bg-gray-100 px-2.5 py-0.5 rounded-lg border border-gray-200">
                      #{currentOrder.ma_don_hang?.substring(0, 8).toUpperCase()}
                    </span>
                    {currentTracking?.tracking_code ? (
                      <span className="inline-flex items-center gap-1 font-mono font-bold text-xs bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-0.5 rounded-lg">
                        Mã tra cứu khách vãng lai: {currentTracking.tracking_code}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-sans font-bold text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                        Đơn hàng thành viên (Theo dõi qua Lịch sử đơn hàng)
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(currentOrder.ma_don_hang)}
                      className="text-gray-400 hover:text-gray-600 transition-colors p-1 cursor-pointer"
                      title="Sao chép mã đơn"
                    >
                      {copiedCode ? <CheckIcon className="w-4 h-4 text-green-600" /> : <DocumentDuplicateIcon className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs font-medium text-gray-500">
                    Thời gian đặt: <span className="font-bold text-gray-700">{formatDateTime(currentOrder.ngay_tao)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className={`px-4 py-2 rounded-2xl border flex items-center gap-2 ${currentStatusMeta.colorClass}`}>
                    <span className={`w-2.5 h-2.5 rounded-full ${currentStatusMeta.badgeBg} ${currentStatusMeta.stepIndex > 0 && currentStatusMeta.stepIndex < 4 ? 'animate-pulse' : ''}`} />
                    <span className="text-xs md:text-sm font-black uppercase tracking-wide">{currentStatusMeta.label}</span>
                  </div>
                </div>
              </div>

              {/* Status Explanation Banner */}
              <div className="bg-[#faf7f4] rounded-2xl p-4 border border-[#e8dfd5] flex items-center gap-3">
                <SparklesIcon className="w-5 h-5 text-[#b22830] flex-shrink-0" />
                <p className="text-xs md:text-sm font-semibold text-gray-700">
                  {currentStatusMeta.desc}
                </p>
              </div>

              {/* 4-Step Timeline (Visual) */}
              {currentStatusMeta.stepIndex >= 0 ? (
                <div className="pt-4 pb-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative">
                    {[
                      {
                        step: 1,
                        title: 'Đã nhận đơn',
                        desc: 'Hệ thống xác nhận',
                        icon: ShoppingBagIcon,
                      },
                      {
                        step: 2,
                        title: 'Đang pha chế',
                        desc: 'Barista chuẩn bị',
                        icon: BuildingStorefrontIcon,
                      },
                      {
                        step: 3,
                        title: 'Đang giao hàng',
                        desc: 'Shipper vận chuyển',
                        icon: TruckIcon,
                      },
                      {
                        step: 4,
                        title: 'Hoàn thành',
                        desc: 'Đã nhận đồ uống',
                        icon: CheckCircleIcon,
                      },
                    ].map((item, idx) => {
                      const isCompleted = currentStatusMeta.stepIndex >= item.step;
                      const isCurrent = currentStatusMeta.stepIndex === item.step;
                      const IconComp = item.icon;

                      return (
                        <div
                          key={item.step}
                          className={`relative flex flex-col items-center text-center p-4 rounded-2xl border transition-all ${
                            isCurrent
                              ? 'bg-amber-50/80 border-amber-300 shadow-sm ring-2 ring-amber-200/50'
                              : isCompleted
                              ? 'bg-emerald-50/60 border-emerald-200'
                              : 'bg-gray-50 border-gray-200 opacity-60'
                          }`}
                        >
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 ${
                              isCurrent
                                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30 animate-bounce'
                                : isCompleted
                                ? 'bg-emerald-600 text-white'
                                : 'bg-gray-200 text-gray-500'
                            }`}
                          >
                            {isCompleted && !isCurrent ? (
                              <CheckIcon className="w-5 h-5 stroke-[3]" />
                            ) : (
                              <IconComp className="w-5 h-5" />
                            )}
                          </div>
                          <span
                            className={`text-xs font-black uppercase tracking-wider mb-1 ${
                              isCurrent
                                ? 'text-amber-900'
                                : isCompleted
                                ? 'text-emerald-900'
                                : 'text-gray-500'
                            }`}
                          >
                            {item.title}
                          </span>
                          <span className="text-[11px] font-medium text-gray-500">
                            {item.desc}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700">
                  <XCircleIcon className="w-6 h-6 flex-shrink-0" />
                  <span className="text-xs md:text-sm font-bold">
                    Đơn hàng này đã bị hủy. Nếu có bất kỳ thắc mắc nào về hoàn tiền hoặc đơn hàng, vui lòng liên hệ hotline 1900 1755.
                  </span>
                </div>
              )}
            </div>

            {/* 2. TWO-COLUMN DETAILS: SHIPPING & ORDER INFO */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Shipping & Delivery Information */}
              <div className="bg-white rounded-3xl p-6 md:p-7 shadow-sm border border-[#ede5dc] space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-[#b22830] flex items-center justify-center">
                    <TruckIcon className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-gray-900">
                    Thông Tin Giao Nhận
                  </h2>
                </div>

                <div className="space-y-3.5 text-xs md:text-sm">
                  <div>
                    <span className="text-gray-500 font-medium block text-xs">Hình thức nhận hàng:</span>
                    <span className="font-extrabold text-gray-900 mt-0.5 block">
                      {getDeliveryModeText(currentTracking?.delivery_mode, currentOrder)}
                    </span>
                  </div>

                  <div>
                    <span className="text-gray-500 font-medium block text-xs">Địa chỉ nhận hàng:</span>
                    <div className="flex items-start gap-1.5 mt-0.5">
                      <MapPinIcon className="w-4 h-4 text-[#b22830] flex-shrink-0 mt-0.5" />
                      <span className="font-bold text-gray-800 leading-relaxed">
                        {currentOrder.dia_chi_giao_hang || 'Tại quầy cửa hàng'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-gray-500 font-medium block text-xs">Cơ sở xử lý:</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <BuildingStorefrontIcon className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      <span className="font-bold text-gray-800">
                        {getBranchName(currentOrder.co_so_ma || currentTracking?.branch_code)}
                      </span>
                    </div>
                  </div>

                  {/* Shipper info for delivery orders */}
                  {(currentTracking?.delivery_mode === 'GIAO_TAN_NOI' || currentOrder.loai_don_hang === 'GIAO_TAN_NOI') ? (
                    <div className="pt-2 border-t border-gray-100">
                      <span className="text-gray-500 font-medium block text-xs mb-1.5">Người giao hàng:</span>
                      {currentShipper?.full_name ? (
                        <div className="bg-gray-50 rounded-2xl p-3 border border-gray-200/80 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-full bg-[#b22830] text-white flex items-center justify-center font-black text-xs">
                              {currentShipper.full_name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-extrabold text-gray-900 text-xs md:text-sm">{currentShipper.full_name}</p>
                              <p className="text-[11px] font-medium text-gray-500">
                                {currentShipper.vehicle_plate ? `Biển số: ${currentShipper.vehicle_plate}` : 'Tài xế Avengers Coffee'}
                              </p>
                            </div>
                          </div>
                          {currentShipper.phone && (
                            <a
                              href={`tel:${currentShipper.phone}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold transition-colors"
                            >
                              <PhoneIcon className="w-3.5 h-3.5" />
                              <span>{currentShipper.phone}</span>
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="bg-amber-50/70 rounded-xl p-3 border border-amber-100/90 text-amber-900 text-xs font-medium flex items-center gap-2.5">
                          <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                          <span>
                            {currentStatusMeta.stepIndex >= 3
                              ? 'Đơn hàng đang trên đường vận chuyển.'
                              : 'Đơn hàng đang chờ cửa hàng xác nhận và điều phối tài xế giao hàng.'}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-gray-100">
                      <span className="text-gray-500 font-medium block text-xs mb-1.5">Hình thức phục vụ:</span>
                      <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 text-gray-700 text-xs font-medium">
                        {currentOrder.loai_don_hang === 'DUNG_TAI_CHO' || currentOrder.ma_ban
                          ? `Phục vụ tại bàn: Nhân viên sẽ mang thức uống ra tận Bàn ${currentOrder.ma_ban || 'quý khách'}.`
                          : 'Đến lấy tại quầy: Vui lòng đọc mã đơn hàng cho Barista tại quầy khi nhận món.'}
                      </div>
                    </div>
                  )}

                  {currentOrder.ghi_chu && (
                    <div className="pt-2 border-t border-gray-100">
                      <span className="text-gray-500 font-medium block text-xs">Ghi chú giao hàng:</span>
                      <p className="mt-1 p-2.5 bg-amber-50/70 border border-amber-100 rounded-xl text-amber-900 font-medium text-xs">
                        "{currentOrder.ghi_chu}"
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Recipient & Payment Information */}
              <div className="bg-white rounded-3xl p-6 md:p-7 shadow-sm border border-[#ede5dc] space-y-4">
                <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-gray-900">
                    Người Nhận & Thanh Toán
                  </h2>
                </div>

                <div className="space-y-3.5 text-xs md:text-sm">
                  <div>
                    <span className="text-gray-500 font-medium block text-xs">Khách hàng nhận:</span>
                    <span className="font-extrabold text-gray-900 mt-0.5 block">
                      {currentOrder.ten_khach_hang || 'Khách hàng Avengers Coffee'}
                    </span>
                  </div>

                  {currentOrder.guest_phone && (
                    <div>
                      <span className="text-gray-500 font-medium block text-xs">Số điện thoại:</span>
                      <span className="font-bold text-gray-800 mt-0.5 block font-mono">
                        {currentOrder.guest_phone}
                      </span>
                    </div>
                  )}

                  {currentOrder.guest_email && (
                    <div>
                      <span className="text-gray-500 font-medium block text-xs">Email nhận thông báo:</span>
                      <span className="font-medium text-gray-800 mt-0.5 block">
                        {currentOrder.guest_email}
                      </span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-gray-100">
                    <span className="text-gray-500 font-medium block text-xs">Phương thức thanh toán:</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <CreditCardIcon className="w-4 h-4 text-gray-600 flex-shrink-0" />
                      <span className="font-bold text-gray-800">
                        {getPaymentMethodText(currentOrder.phuong_thuc_thanh_toan)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-gray-500 font-medium block text-xs">Trạng thái thanh toán:</span>
                    <div className="mt-1">
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs border ${paymentMeta.className}`}>
                        {paymentMeta.label}
                      </span>
                    </div>
                  </div>

                  {currentOrder.ma_voucher && (
                    <div className="pt-2 border-t border-gray-100">
                      <span className="text-gray-500 font-medium block text-xs">Mã ưu đãi đã áp dụng:</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <TicketIcon className="w-4 h-4 text-[#b22830]" />
                        <span className="font-mono font-black text-xs text-[#b22830] bg-red-50 border border-red-200 px-2 py-0.5 rounded-md">
                          {currentOrder.ma_voucher}
                        </span>
                        {currentOrder.so_tien_giam > 0 && (
                          <span className="text-xs font-bold text-emerald-700">
                            (Giảm {formatCurrency(currentOrder.so_tien_giam)})
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* LIVE TRACKING MAP */}

            {(currentTracking?.delivery_mode === 'GIAO_TAN_NOI' || currentOrder?.loai_don_hang === 'GIAO_TAN_NOI') && (
              <div className="bg-white rounded-3xl p-6 md:p-7 shadow-sm border border-[#ede5dc] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-red-50 text-[#b22830] flex items-center justify-center">
                      <MapPinIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black uppercase tracking-wider text-gray-900">
                        Bản Đồ Theo Dõi Lộ Trình Giao Hàng
                      </h2>
                      <p className="text-[11px] font-medium text-gray-500">
                        Định vị vệ tinh hiển thị vị trí quán, tuyến đường di chuyển và tài xế trực tiếp
                      </p>
                    </div>
                  </div>
                  {currentShipper?.full_name && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 self-start sm:self-auto">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" />
                      Tài xế đang kết nối
                    </span>
                  )}
                </div>

                <div className="rounded-2xl overflow-hidden border border-gray-200/80 relative shadow-inner">
                  {(() => {
                    const matchedB = getBranch(currentOrder?.co_so_ma || currentTracking?.branch_code);
                    const storeLoc = currentTracking?.store_location || (matchedB?.vi_do && matchedB?.kinh_do ? { latitude: Number(matchedB.vi_do), longitude: Number(matchedB.kinh_do) } : { latitude: 10.80734, longitude: 106.717612 });

                    let destLoc = currentTracking?.destination_location || (currentOrder?.delivery_latitude ? { latitude: Number(currentOrder.delivery_latitude), longitude: Number(currentOrder.delivery_longitude) } : null);
                    if (!destLoc || !destLoc.latitude) {
                      const custAddr = currentTracking?.destination_address || currentOrder?.dia_chi_giao_hang || '';
                      const resolved = resolveAddressCoordinates(custAddr);
                      if (resolved) {
                        destLoc = { latitude: resolved.lat, longitude: resolved.lng };
                      } else {
                        destLoc = { latitude: storeLoc.latitude + 0.005, longitude: storeLoc.longitude + 0.005 };
                      }
                    }

                    const addr = currentTracking?.branch_address || matchedB?.dia_chi || getBranchName(currentOrder?.co_so_ma || currentTracking?.branch_code);

                    return (
                      <ShipperMapView
                        height="380px"
                        storeLocation={storeLoc}
                        destinationLocation={destLoc}
                        shipperLocation={orderResult?.shipper_location?.latitude ? orderResult.shipper_location : null}
                        shipperName={currentShipper?.full_name || 'Tài xế Avengers'}
                        deliveryStatus={currentOrder?.trang_thai_don_hang}
                        storeAddress={addr}
                      />
                    );
                  })()}
                </div>
              </div>
            )}

            {/* 3. ORDER ITEMS & BILL DETAILS */}

            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#ede5dc] space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
                    <ShoppingBagIcon className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm md:text-base font-black uppercase tracking-wider text-gray-900">
                    Chi Tiết Món Đã Đặt ({currentOrder.items?.length || 0} món)
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-800 transition-colors p-1 cursor-pointer"
                >
                  <PrinterIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">In biên nhận</span>
                </button>
              </div>

              {/* Items List */}
              <div className="divide-y divide-gray-100">
                {(currentOrder.items || []).map((item, index) => {
                  const itemTotal = (Number(item.gia_ban) || 0) * (Number(item.so_luong) || 1);
                  return (
                    <div key={index} className="py-4 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <img
                          src={item.hinh_anh_url || '/hc-assets/menu_icon_1.png'}
                          alt={item.ten_san_pham}
                          className="w-14 h-14 object-contain rounded-2xl bg-[#fbf8f5] p-1.5 border border-gray-100 flex-shrink-0"
                          onError={(e) => {
                            e.currentTarget.src = '/hc-assets/menu_icon_1.png';
                          }}
                        />
                        <div className="min-w-0">
                          <h3 className="font-black text-gray-900 text-sm md:text-base leading-tight truncate">
                            {item.ten_san_pham}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500 font-medium">
                            {item.kich_co && (
                              <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md font-bold text-[11px]">
                                Size {item.kich_co}
                              </span>
                            )}
                            <span>Số lượng: <strong className="text-gray-900">{item.so_luong}</strong></span>
                            <span>Đơn giá: {formatCurrency(item.gia_ban)}</span>
                          </div>
                          {item.tuy_chon && (
                            <p className="text-[11px] text-gray-500 mt-1 italic">
                              Tùy chọn: {typeof item.tuy_chon === 'string' ? item.tuy_chon : JSON.stringify(item.tuy_chon)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="font-black text-[#b22830] text-sm md:text-base">
                          {formatCurrency(itemTotal)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Price Calculation Summary */}
              <div className="pt-4 border-t border-gray-100 bg-[#faf7f4] rounded-2xl p-5 space-y-2.5">
                <div className="flex justify-between text-xs md:text-sm text-gray-600 font-medium">
                  <span>Tạm tính tiền món:</span>
                  <span className="font-bold text-gray-900">
                    {formatCurrency(
                      (currentOrder.items || []).reduce(
                        (sum, item) => sum + (Number(item.gia_ban) || 0) * (Number(item.so_luong) || 1),
                        0
                      )
                    )}
                  </span>
                </div>

                <div className="flex justify-between text-xs md:text-sm text-gray-600 font-medium">
                  <span>Phí giao hàng:</span>
                  <span className="font-bold text-gray-900">
                    {Number(currentTracking?.delivery_fee || 0) > 0
                      ? formatCurrency(currentTracking.delivery_fee)
                      : 'Miễn phí'}
                  </span>
                </div>

                {Number(currentOrder.so_tien_giam || 0) > 0 && (
                  <div className="flex justify-between text-xs md:text-sm text-emerald-700 font-bold">
                    <span>Giảm giá voucher:</span>
                    <span>-{formatCurrency(currentOrder.so_tien_giam)}</span>
                  </div>
                )}

                <div className="pt-3 border-t border-gray-200/80 flex justify-between items-center text-sm md:text-base">
                  <span className="font-black text-gray-900 uppercase tracking-wide">Tổng tiền thanh toán:</span>
                  <span className="font-black text-xl md:text-2xl text-[#b22830] font-sans">
                    {formatCurrency(currentOrder.tong_tien)}
                  </span>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleResetSearch}
                  className="w-full sm:w-auto px-6 py-3 rounded-2xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-bold text-xs md:text-sm transition-all shadow-xs cursor-pointer text-center"
                >
                  Tra cứu đơn hàng khác
                </button>

                <button
                  type="button"
                  onClick={onOrderMore || (() => onNavigate?.('order'))}
                  className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-[#b22830] hover:bg-[#961c23] text-white font-bold text-xs md:text-sm transition-all shadow-md shadow-red-900/20 active:scale-95 cursor-pointer text-center flex items-center justify-center gap-2"
                >
                  <ShoppingBagIcon className="w-4 h-4" />
                  <span>Tiếp tục đặt món</span>
                </button>
              </div>
            </div>

          </div>
        ) : (
          /* ── INITIAL STATE: GUIDE & INSTRUCTIONS ── */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
            
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#ede5dc] flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-[#b22830] flex items-center justify-center">
                <DocumentDuplicateIcon className="w-6 h-6" />
              </div>
              <h3 className="font-black text-sm uppercase tracking-wide text-gray-900">
                1. Lấy mã tra cứu
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Kiểm tra <strong>Email xác nhận đơn hàng</strong> hoặc tin nhắn biên nhận sau khi đặt hàng để lấy mã tra cứu (VD: AC-A1B2C).
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#ede5dc] flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-green-50 text-green-600 flex items-center justify-center">
                <MagnifyingGlassIcon className="w-6 h-6" />
              </div>
              <h3 className="font-black text-sm uppercase tracking-wide text-gray-900">
                2. Tra cứu tức thì
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Nhập mã vào khung tìm kiếm bên trên và nhấn <strong>"Tra cứu ngay"</strong> để kiểm tra tiến trình xử lý đơn hàng.
              </p>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-[#ede5dc] flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <ShieldCheckIcon className="w-6 h-6" />
              </div>
              <h3 className="font-black text-sm uppercase tracking-wide text-gray-900">
                3. Đảm bảo quyền lợi
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Mọi thông tin đơn hàng, hóa đơn và người giao hàng đều được bảo mật và cập nhật liên tục theo thời gian thực.
              </p>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
