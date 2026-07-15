import { XMarkIcon, TrashIcon, ArrowLongRightIcon, ArrowLongLeftIcon, TagIcon } from '@heroicons/react/24/outline';
import { useCart } from '../../context/CartContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import { buildAddressOptionsFromBranches, getAddressSelectionDefaults, normalizeAddressSelection } from '../../lib/addressOptions';
import CartEditModal from '../../components/CartEditModal';
import { PencilIcon } from '@heroicons/react/24/solid';

const AVAILABLE_SIZES = ['Nhỏ', 'Vừa'];

function taoDiaChiDayDu(addressForm) {
  const parts = [addressForm.street, addressForm.ward, addressForm.district, addressForm.city]
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return parts.join(', ');
}

function tachDiaChiDayDu(rawAddress) {
  const raw = String(rawAddress || '').trim();
  if (!raw) {
    return {
      city: '',
      district: '',
      ward: '',
      street: '',
    };
  }

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const city = parts[parts.length - 1] || '';
  const district = parts[parts.length - 2] || '';
  const ward = parts[parts.length - 3] || '';
  const street = parts.slice(0, Math.max(parts.length - 3, 0)).join(', ');

  return { city, district, ward, street: street || raw };
}

export default function CartPage({ products = [], onBackToHome }) {
  const { cart, removeFromCart, updateCartQuantity, activeUserId, refreshCart } = useCart();
  const [editingItem, setEditingItem] = useState(null);
  const queryClient = useQueryClient();
  const total = cart.reduce((sum, i) => sum + i.gia_ban * i.so_luong, 0);

  // 1: Cart Items, 2: Checkout Info Form
  const [step, setStep] = useState(1);

  const { data: publicBranchPayload } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      const response = await apiClient.get('/users/branches/public');
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 120 * 1000,
  });

  const addressOptions = useMemo(
    () => buildAddressOptionsFromBranches(publicBranchPayload?.items || []),
    [publicBranchPayload],
  );
  const defaultAddressSelection = useMemo(
    () => getAddressSelectionDefaults(addressOptions),
    [addressOptions],
  );

  const [phuongThuc, setPhuongThuc] = useState('VNPAY');
  const [addressForm, setAddressForm] = useState(() => ({ ...defaultAddressSelection, street: '' }));
  const [khungGio, setKhungGio] = useState('18:00 - 19:00');
  const [ghiChu, setGhiChu] = useState('');
  const [thongBao, setThongBao] = useState('');
  const [qrData, setQrData] = useState(null);
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [qrOrderId, setQrOrderId] = useState(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherResult, setVoucherResult] = useState(null);
  const [voucherError, setVoucherError] = useState('');
  const [isCheckingVoucher, setIsCheckingVoucher] = useState(false);

  const discountAmount = voucherResult?.so_tien_giam || 0;
  const tongTienSauGiam = Math.max(0, total - discountAmount);

  const maNguoiDung = useMemo(() => activeUserId || 'anonymous', [activeUserId]);
  const isLoggedInUser = useMemo(() => {
    const value = String(maNguoiDung || '');
    return Boolean(value && !value.startsWith('anon-') && value !== 'anonymous');
  }, [maNguoiDung]);
  const districtOptions = useMemo(() => Object.keys(addressOptions[addressForm.city] || {}), [addressForm.city, addressOptions]);
  const wardOptions = useMemo(
    () => (addressOptions[addressForm.city]?.[addressForm.district] || []),
    [addressForm.city, addressForm.district, addressOptions],
  );
  const diaChiDayDu = useMemo(() => taoDiaChiDayDu(addressForm), [addressForm]);

  const triggerAiRecommendationRefresh = useCallback(() => {
    if (!isLoggedInUser) return;
    queryClient.invalidateQueries({ queryKey: ['ai', 'recommend', maNguoiDung] });
    apiClient.post('/ai/recommend/train').catch(() => undefined);
  }, [isLoggedInUser, maNguoiDung, queryClient]);

  const { data: addressPayload } = useQuery({
    queryKey: queryKeys.userAddresses(maNguoiDung),
    queryFn: async () => {
      const response = await apiClient.get(`/users/${maNguoiDung}/addresses`);
      return response.data;
    },
    enabled: Boolean(isLoggedInUser),
    staleTime: 30 * 1000,
  });

  const savedAddresses = addressPayload?.items || [];
  const defaultAddress = savedAddresses.find((item) => item.mac_dinh) || null;

  useEffect(() => {
    if (!addressForm.city && defaultAddressSelection.city) {
      setAddressForm((prev) => ({ ...prev, ...defaultAddressSelection }));
    }
  }, [addressForm.city, defaultAddressSelection]);

  useEffect(() => {
    setVoucherResult(null);
    setVoucherError('');
  }, [total]);

  const apDungVoucher = async () => {
    const code = voucherCode.trim();
    if (!code) {
      setVoucherError('Vui lòng nhập mã voucher');
      return;
    }
    if (!cart.length) {
      setVoucherError('Giỏ hàng trống, chưa có sản phẩm để áp dụng voucher');
      return;
    }
    setIsCheckingVoucher(true);
    setVoucherError('');
    try {
      const response = await apiClient.post('/vouchers/kiem-tra', {
        ma_voucher: code,
        tong_tien: total,
        user_id: isLoggedInUser ? maNguoiDung : '',
      });
      setVoucherResult(response.data);
    } catch (err) {
      setVoucherResult(null);
      setVoucherError(err?.response?.data?.message || 'Mã voucher không hợp lệ');
    } finally {
      setIsCheckingVoucher(false);
    }
  };

  const xoaVoucher = () => {
    setVoucherCode('');
    setVoucherResult(null);
    setVoucherError('');
  };

  const khungGioHopLe = (value) => /^\s*\d{2}:\d{2}\s*-\s*\d{2}:\d{2}\s*$/.test(value || '');

  useEffect(() => {
    if (!defaultAddress) {
      return;
    }

    setAddressForm((current) => {
      if (current.street?.trim()) {
        return current;
      }

      const parsed = tachDiaChiDayDu(defaultAddress.dia_chi_day_du);
      const normalizedAddress = normalizeAddressSelection(parsed, addressOptions);

      return {
        city: normalizedAddress.city,
        district: normalizedAddress.district,
        ward: normalizedAddress.ward,
        street: normalizedAddress.street,
      };
    });
  }, [defaultAddress, addressOptions]);

  useEffect(() => {
    if (!districtOptions.length) {
      return;
    }

    if (!districtOptions.includes(addressForm.district)) {
      setAddressForm((prev) => ({
        ...prev,
        district: districtOptions[0],
        ward: (addressOptions[prev.city]?.[districtOptions[0]] || [])[0] || '',
      }));
    }
  }, [addressForm.city, addressForm.district, districtOptions, addressOptions]);

  useEffect(() => {
    if (!wardOptions.length) {
      return;
    }

    if (!wardOptions.includes(addressForm.ward)) {
      setAddressForm((prev) => ({ ...prev, ward: wardOptions[0] }));
    }
  }, [addressForm.ward, wardOptions]);

  const khoiTaoThanhToanMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/customers/${maNguoiDung}/thanh-toan/khoi-tao`, {
        phuong_thuc_thanh_toan: phuongThuc,
        dia_chi_giao_hang: diaChiDayDu,
        khung_gio_giao: khungGio,
        ghi_chu: ghiChu.trim() || 'Dat tu web-customer',
        ma_voucher: voucherResult?.ma_voucher || voucherResult?.ma_khuyen_mai || undefined,
      });
      return response.data;
    },
  });

  const { data: qrOrderStatus } = useQuery({
    queryKey: queryKeys.orderStatus(maNguoiDung, qrOrderId),
    queryFn: async () => {
      const response = await apiClient.get(`/customers/${maNguoiDung}/thanh-toan/don-hang/${qrOrderId}/trang-thai`);
      return response.data;
    },
    enabled: Boolean(qrOrderId && phuongThuc === 'NGAN_HANG_QR'),
    refetchInterval: (query) => {
      const current = query.state.data;
      if (current?.trang_thai_thanh_toan === 'DA_THANH_TOAN') {
        return false;
      }
      return 3000;
    },
  });

  useEffect(() => {
    if (qrOrderStatus?.trang_thai_thanh_toan === 'DA_THANH_TOAN') {
      setThongBao('Thanh toán QR thành công. Đơn hàng đã được xác nhận.');
      queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
      triggerAiRecommendationRefresh();
      refreshCart();
    }
  }, [qrOrderStatus, queryClient, refreshCart, triggerAiRecommendationRefresh]);

  const khoiTaoThanhToan = async () => {
    if (!cart.length) {
      setThongBao('Giỏ hàng đang trống. Vui lòng thêm sản phẩm trước khi thanh toán.');
      return;
    }

    if (!addressForm.city || !addressForm.district || !addressForm.ward || !addressForm.street?.trim()) {
      setThongBao('Vui lòng chọn thành phố, quận, phường và nhập số nhà/đường đầy đủ.');
      return;
    }

    if (diaChiDayDu.length < 16) {
      setThongBao('Địa chỉ giao hàng chưa đủ chi tiết. Vui lòng bổ sung số nhà và tên đường.');
      return;
    }

    if (!khungGioHopLe(khungGio)) {
      setThongBao('Khung giờ giao phải đúng định dạng HH:MM - HH:MM.');
      return;
    }

    setThongBao('');
    setQrData(null);
    setQrImageUrl('');
    setQrOrderId(null);

    try {
      const data = await khoiTaoThanhToanMutation.mutateAsync();

      if (phuongThuc === 'VNPAY' && data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }

      if (phuongThuc === 'NGAN_HANG_QR' && data.payment_details) {
        setQrData(data.payment_details);
        setQrImageUrl(data.payment_details.qr_img_url || data.payment_details.qr_fallback_url || '');
        setQrOrderId(data.payment_details.ma_don_hang);
        setThongBao('Đã tạo mã QR ngân hàng. Hệ thống đang tự động kiểm tra webhook thanh toán...');
        return;
      }

      setThongBao('Tạo đơn hàng COD thành công. Đơn sẽ được thu tiền khi nhận hàng.');
      queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
      triggerAiRecommendationRefresh();
      refreshCart();
      setGhiChu('');
      xoaVoucher();
    } catch (error) {
      setThongBao(error?.response?.data?.message || error?.message || 'Có lỗi khi khởi tạo thanh toán');
    }
  };

  const handleCheckoutClick = () => {
    if (!cart.length) {
      setThongBao('Giỏ hàng đang trống. Hãy thêm món ăn vào giỏ hàng trước.');
      return;
    }
    setStep(2);
    setThongBao('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="w-full bg-[#faf7f4] min-h-screen py-12 px-4 md:px-8">
      <div className="max-w-[1240px] mx-auto">
        {/* Breadcrumb */}
        <nav className="text-[13px] font-bold uppercase tracking-wider text-gray-400 mb-5 flex items-center gap-2">
          <button 
            onClick={() => onBackToHome?.()} 
            className="hover:text-[#c41230] transition-colors"
          >
            Trang chủ
          </button>
          <span className="text-gray-300">&gt;</span>
          <span className="text-gray-800">Giỏ hàng</span>
        </nav>

        {/* Title */}
        <h1 className="text-[44px] font-extrabold uppercase text-[#1a1a1a] tracking-tight mb-10 font-serif leading-none">
          GIỎ HÀNG CỦA BẠN
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Cột trái: Chi tiết Giỏ hàng HOẶC Form thông tin thanh toán */}
          <div className="lg:col-span-7 xl:col-span-8">
            
            {step === 1 ? (
              /* BƯỚC 1: DANH SÁCH GIỎ HÀNG (GIỐNG MOCKUP HÌNH ẢNH) */
              <div className="bg-white rounded-[24px] p-6 md:p-8 border border-[#e8e2da] shadow-sm space-y-6">
                {cart.length === 0 ? (
                  <div className="py-20 text-center space-y-4">
                    <p className="text-gray-400 font-bold text-[15px]">
                      Giỏ hàng trống. Hãy chọn món uống bạn thích! 🥤
                    </p>
                    <button
                      onClick={() => onBackToHome?.()}
                      className="px-6 py-3 bg-[#c41230] text-white font-extrabold text-xs uppercase tracking-widest rounded-full hover:bg-[#a30f28] transition-colors"
                    >
                      Quay lại Thực đơn
                    </button>
                  </div>
                ) : (
                  cart.map((item, idx) => (
                    <div 
                      key={`${item.ma_san_pham}-${item.size}`} 
                      className={`flex gap-5 items-start relative ${
                        idx < cart.length - 1 ? 'pb-6 border-b border-gray-100' : ''
                      }`}
                    >
                      {/* Khung ảnh nền xám nhạt bo tròn */}
                      <div className="w-24 h-24 sm:w-28 sm:h-28 bg-[#f4f0eb] rounded-[16px] overflow-hidden flex-shrink-0 flex items-center justify-center border border-[#e8e2da]">
                        <img 
                          src={item.hinh_anh_url} 
                          className="w-full h-full object-cover" 
                          alt={item.ten_san_pham} 
                        />
                      </div>
                      
                      {/* Chi tiết sản phẩm */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between h-24 sm:h-28 pr-6">
                        <div className="space-y-1">
                          <h4 className="font-extrabold text-[15px] sm:text-base text-[#1a1a1a] leading-tight truncate">
                            {item.ten_san_pham}
                          </h4>
                          {/* Options */}
                          <div className="flex flex-col gap-1 text-xs text-gray-500 font-semibold mt-1">
                            {item.size && (
                              <div><span className="text-gray-400">Size:</span> {item.size}</div>
                            )}
                            {item.loai_sua && (
                              <div><span className="text-gray-400">Sữa:</span> {item.loai_sua}</div>
                            )}
                            {item.luong_da && (
                              <div><span className="text-gray-400">Đá:</span> {item.luong_da}</div>
                            )}
                            {item.do_ngot && (
                              <div><span className="text-gray-400">Ngọt:</span> {item.do_ngot}</div>
                            )}
                            {item.toppings && item.toppings.length > 0 && (
                              <div><span className="text-gray-400">Topping:</span> {item.toppings.join(', ')}</div>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingItem(item)}
                              className="mt-1 flex items-center gap-1 text-[#b22830] font-bold text-xs hover:underline w-fit"
                            >
                              <PencilIcon className="w-3 h-3" /> Chỉnh sửa
                            </button>
                          </div>
                        </div>

                        {/* Giá tiền */}
                        <p className="text-[#1a1a1a] font-extrabold text-lg">
                          {Number(item.gia_ban).toLocaleString('vi-VN')}đ
                        </p>
                      </div>

                      {/* Bộ tăng giảm và nút Xóa xếp đúng góc y hệt mockup */}
                      <div className="absolute right-0 top-0 h-full flex flex-col justify-between items-end py-1">
                        {/* Nút xóa màu đỏ */}
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.ma_san_pham, item.size)}
                          className="text-red-500 hover:text-red-700 hover:scale-105 transition-all p-1"
                          aria-label={`Xóa ${item.ten_san_pham}`}
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>

                        {/* Bộ tăng giảm hình kẹo dẻo màu trắng viền xám */}
                        <div className="flex items-center justify-between bg-white border border-gray-200 rounded-full py-1 px-3 w-[90px] sm:w-[100px] shadow-sm select-none">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.ma_san_pham, item.size, -1)}
                            className="text-gray-400 hover:text-gray-700 font-extrabold text-[15px] px-1"
                          >
                            -
                          </button>
                          <span className="text-[13px] font-black text-gray-800">
                            {item.so_luong}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.ma_san_pham, item.size, 1)}
                            className="text-gray-400 hover:text-gray-700 font-extrabold text-[15px] px-1"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* BƯỚC 2: FORM THÔNG TIN THANH TOÁN (CHECKOUT FORM) */
              <div className="bg-white rounded-[24px] p-6 md:p-8 border border-[#e8e2da] shadow-sm space-y-6">
                {/* Back Link */}
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#c41230] transition-colors"
                >
                  <ArrowLongLeftIcon className="h-4 w-4" />
                  <span>Quay lại sửa giỏ hàng</span>
                </button>

                <h2 className="text-xl font-black text-[#1a1a1a] uppercase tracking-wide pb-4 border-b border-gray-100 font-serif">
                  Thông tin giao hàng &amp; Thanh toán
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Cột trái form: Địa chỉ */}
                  <div className="space-y-4">
                    <h3 className="text-[11px] font-black uppercase text-[#c41230] tracking-widest">Địa chỉ giao hàng</h3>
                    
                    {isLoggedInUser && savedAddresses.length ? (
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-gray-500">Địa chỉ đã lưu</label>
                        <select
                          value={savedAddresses.some((item) => item.dia_chi_day_du === diaChiDayDu) ? diaChiDayDu : ''}
                          onChange={(e) => {
                            const selected = savedAddresses.find((item) => item.dia_chi_day_du === e.target.value);
                            if (!selected) return;
                            const parsed = tachDiaChiDayDu(selected.dia_chi_day_du);
                            const normalizedAddress = normalizeAddressSelection(parsed, addressOptions);

                            setAddressForm({
                              city: normalizedAddress.city,
                              district: normalizedAddress.district,
                              ward: normalizedAddress.ward,
                              street: normalizedAddress.street,
                            });
                            if (selected.ghi_chu && !ghiChu.trim()) {
                              setGhiChu(selected.ghi_chu);
                            }
                          }}
                          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230]"
                        >
                          <option value="">Chọn địa chỉ đã lưu</option>
                          {savedAddresses.map((item) => (
                            <option key={item.id} value={item.dia_chi_day_du}>
                              {item.ten_dia_chi}{item.mac_dinh ? ' (mặc định)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}

                    {/* Thành phố */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-500">Thành phố</label>
                      <select
                        value={addressForm.city}
                        onChange={(e) => {
                          const nextCity = e.target.value;
                          const nextDistrict = Object.keys(addressOptions[nextCity] || {})[0] || '';
                          const nextWard = (addressOptions[nextCity]?.[nextDistrict] || [])[0] || '';
                          setAddressForm((prev) => ({ ...prev, city: nextCity, district: nextDistrict, ward: nextWard }));
                          if (thongBao) setThongBao('');
                        }}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230]"
                      >
                        {Object.keys(addressOptions).map((city) => (
                          <option key={city} value={city}>{city}</option>
                        ))}
                      </select>
                    </div>

                    {/* Quận */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-500">Quận</label>
                      <select
                        value={addressForm.district}
                        onChange={(e) => {
                          const nextDistrict = e.target.value;
                          const nextWard = (addressOptions[addressForm.city]?.[nextDistrict] || [])[0] || '';
                          setAddressForm((prev) => ({ ...prev, district: nextDistrict, ward: nextWard }));
                          if (thongBao) setThongBao('');
                        }}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230]"
                      >
                        {districtOptions.map((district) => (
                          <option key={district} value={district}>{district}</option>
                        ))}
                      </select>
                    </div>

                    {/* Phường */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-500">Phường</label>
                      <select
                        value={addressForm.ward}
                        onChange={(e) => {
                          setAddressForm((prev) => ({ ...prev, ward: e.target.value }));
                          if (thongBao) setThongBao('');
                        }}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230]"
                      >
                        {wardOptions.map((ward) => (
                          <option key={ward} value={ward}>{ward}</option>
                        ))}
                      </select>
                    </div>

                    {/* Số nhà, tên đường */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-500">Số nhà, tên đường</label>
                      <input
                        value={addressForm.street}
                        onChange={(e) => {
                          setAddressForm((prev) => ({ ...prev, street: e.target.value }));
                          if (thongBao) setThongBao('');
                        }}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230]"
                        placeholder="Ví dụ: 28 Mạc Đĩnh Chi"
                      />
                    </div>
                    <p className="text-[11px] font-bold text-gray-400">Địa chỉ đầy đủ: {diaChiDayDu || '---'}</p>
                  </div>

                  {/* Cột phải form: Thời gian & Ghi chú */}
                  <div className="space-y-4">
                    <h3 className="text-[11px] font-black uppercase text-[#c41230] tracking-widest">Thời gian &amp; Thanh toán</h3>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-500">Khung giờ giao hàng</label>
                      <input
                        value={khungGio}
                        onChange={(e) => {
                          setKhungGio(e.target.value);
                          if (thongBao) setThongBao('');
                        }}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230]"
                        placeholder="Ví dụ: 18:00 - 19:00"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-500">Ghi chú đơn hàng</label>
                      <textarea
                        value={ghiChu}
                        onChange={(e) => setGhiChu(e.target.value)}
                        rows={2}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#c41230] resize-none"
                        placeholder="Ví dụ: ít đá, gọi điện trước khi giao..."
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-500">Phương thức thanh toán</label>
                      <select
                        value={phuongThuc}
                        onChange={(e) => setPhuongThuc(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230]"
                      >
                        <option value="VNPAY">VNPAY (Thẻ / Mobile Banking)</option>
                        <option value="NGAN_HANG_QR">Ngân hàng QR</option>
                        <option value="THANH_TOAN_KHI_NHAN_HANG">Thanh toán khi nhận hàng (COD)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cột phải: Order Summary */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6 lg:sticky lg:top-24">
            <div className="bg-white rounded-[24px] p-6 md:p-8 border border-[#e8e2da] shadow-sm">
              <h2 className="text-lg font-black text-[#1a1a1a] uppercase mb-6 tracking-wide pb-4 border-b border-gray-100 font-serif">
                Tóm tắt đơn hàng
              </h2>

              <div className="space-y-4">
                {/* Tạm tính */}
                <div className="flex justify-between items-center text-sm font-semibold text-gray-500">
                  <span>Tạm tính</span>
                  <span className="text-[#1a1a1a] font-extrabold">{total.toLocaleString('vi-VN')}đ</span>
                </div>

                {/* Giảm giá voucher */}
                {discountAmount > 0 ? (
                  <div className="flex justify-between items-center text-sm font-semibold text-red-500">
                    <span>Giảm giá</span>
                    <span className="font-extrabold">-{discountAmount.toLocaleString('vi-VN')}đ</span>
                  </div>
                ) : (
                  <div className="flex justify-between items-center text-sm font-semibold text-gray-500">
                    <span>Giảm giá</span>
                    <span className="text-[#1a1a1a] font-extrabold">0đ</span>
                  </div>
                )}

                {/* Phí giao hàng */}
                <div className="flex justify-between items-center text-sm font-semibold text-gray-500">
                  <span>Phí giao hàng</span>
                  <span className="text-[#1a1a1a] font-extrabold">Miễn phí</span>
                </div>

                <div className="h-px bg-gray-100 my-4" />

                {/* Tổng cộng */}
                <div className="flex justify-between items-end">
                  <span className="text-sm font-black text-[#1a1a1a] uppercase">Tổng cộng</span>
                  <div className="text-right">
                    {discountAmount > 0 && (
                      <p className="text-xs font-semibold text-gray-400 line-through">
                        {total.toLocaleString('vi-VN')}đ
                      </p>
                    )}
                    <span className="text-2xl font-black text-[#c41230] tracking-tight">
                      {tongTienSauGiam.toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                </div>
              </div>

              {/* Promo code field */}
              <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
                {voucherResult ? (
                  <div className="flex items-center justify-between gap-3 p-3 bg-emerald-50 rounded-2xl border border-emerald-100">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-emerald-800 uppercase tracking-wide truncate">
                        {voucherResult.ma_voucher || voucherResult.ma_khuyen_mai}
                      </p>
                      <p className="text-[11px] font-bold text-emerald-600 truncate">
                        Giảm {discountAmount.toLocaleString('vi-VN')}đ
                      </p>
                    </div>
                    <button 
                      type="button" 
                      onClick={xoaVoucher} 
                      className="rounded-xl bg-white px-3 py-1.5 text-xs font-black text-red-500 border border-red-100 shadow-sm shrink-0 hover:bg-red-50 transition-colors"
                    >
                      Xóa
                    </button>
                  </div>
                ) : (
                  <div className="relative flex items-center bg-gray-50 rounded-full border border-gray-200 pr-1 pl-4 h-[48px] overflow-hidden focus-within:border-gray-400 transition-colors">
                    <TagIcon className="h-5 w-5 text-gray-400 shrink-0 mr-2" />
                    <input
                      value={voucherCode}
                      onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setVoucherError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && apDungVoucher()}
                      className="flex-1 h-full bg-transparent border-none outline-none text-sm font-semibold uppercase text-gray-800 placeholder-gray-400"
                      placeholder="Nhập mã giảm giá"
                    />
                    <button
                      type="button"
                      onClick={apDungVoucher}
                      disabled={isCheckingVoucher}
                      className="rounded-full bg-black hover:bg-gray-800 text-white font-extrabold text-xs uppercase px-5 h-[38px] flex items-center justify-center shrink-0 transition-colors disabled:opacity-60"
                    >
                      {isCheckingVoucher ? '...' : 'Áp dụng'}
                    </button>
                  </div>
                )}
                {voucherError ? (
                  <p className="text-xs font-semibold text-red-500 pl-1">{voucherError}</p>
                ) : null}
              </div>

              {/* Checkout Button */}
              {step === 1 ? (
                <button
                  type="button"
                  onClick={handleCheckoutClick}
                  className="w-full mt-6 py-4 bg-black hover:bg-gray-800 text-white rounded-full font-black uppercase text-[13px] tracking-widest shadow-md flex items-center justify-center gap-2 transition-all"
                >
                  <span>Tiến hành thanh toán</span>
                  <ArrowLongRightIcon className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={khoiTaoThanhToan}
                  disabled={khoiTaoThanhToanMutation.isPending}
                  className="w-full mt-6 py-4 bg-[#c41230] hover:bg-[#a30f28] text-white rounded-full font-black uppercase text-[13px] tracking-widest shadow-md transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {khoiTaoThanhToanMutation.isPending ? 'Đang xử lý...' : 'Xác nhận & Đặt hàng'}
                </button>
              )}

              {/* Error messages */}
              {thongBao && (
                <div className={`mt-4 p-3.5 rounded-2xl text-xs font-bold text-center border ${
                  thongBao.includes('thành công') 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                    : 'bg-red-50 text-red-600 border-red-100'
                }`}>
                  {thongBao}
                </div>
              )}
            </div>

            {/* dynamic QR Code panel (Step 2 only) */}
            {step === 2 && qrData ? (
              <div className="bg-white rounded-[24px] p-6 border border-[#e8e2da] shadow-sm text-center animate-in fade-in duration-300 space-y-4">
                <h3 className="text-sm font-black text-[#1a1a1a] uppercase tracking-wide pb-2 border-b border-gray-100 font-serif">
                  Quét QR để thanh toán
                </h3>
                
                <div className="relative inline-block p-2 border border-gray-100 rounded-2xl bg-white shadow-inner">
                  <img
                    src={qrImageUrl || qrData.qr_img_url}
                    alt="QR ngân hàng"
                    className="w-44 h-44 mx-auto"
                    onError={() => {
                      if (qrData?.qr_fallback_url && qrImageUrl !== qrData.qr_fallback_url) {
                        setQrImageUrl(qrData.qr_fallback_url);
                      }
                    }}
                  />
                </div>

                <div className="text-left space-y-1.5 text-xs text-gray-500 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="flex justify-between">
                    <span>Mã tham chiếu:</span> 
                    <span className="font-black text-gray-700">{qrData.ma_tham_chieu}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Số tiền:</span> 
                    <span className="font-black text-[#c41230]">{Number(qrData.so_tien).toLocaleString('vi-VN')}đ</span>
                  </p>
                </div>
                
                <p className="text-[11px] font-bold text-gray-400 leading-relaxed">
                  Hệ thống tự động đồng bộ qua Sepay. Bạn không cần click xác nhận.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* MODAL CHỈNH SỬA MÓN */}
      <CartEditModal
        cartItem={editingItem}
        product={editingItem ? products.find((p) => p.ma_san_pham === editingItem.ma_san_pham) : null}
        isOpen={Boolean(editingItem)}
        onClose={() => setEditingItem(null)}
      />
    </div>
  );
}
