import { XMarkIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useCart } from '../context/CartContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';
import { buildAddressOptionsFromBranches, getAddressSelectionDefaults, normalizeAddressSelection } from '../lib/addressOptions';

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

export default function CartDrawer({ isOpen, onClose }) {
  const { cart, removeFromCart, updateCartQuantity, changeCartItemSize, activeUserId, refreshCart } = useCart();
  const queryClient = useQueryClient();
  const total = cart.reduce((sum, i) => sum + i.gia_ban * i.so_luong, 0);

  const { data: publicBranchPayload } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      const response = await apiClient.get('/users/branches/public');
      return response.data;
    },
    enabled: Boolean(isOpen),
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
    enabled: Boolean(isOpen && isLoggedInUser),
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
    // Khi tổng tiền thay đổi (thêm/xóa sản phẩm), reset voucher đã áp dụng
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
    if (!isOpen || !defaultAddress) {
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
  }, [defaultAddress, isOpen, addressOptions]);

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
    enabled: Boolean(isOpen && qrOrderId && phuongThuc === 'NGAN_HANG_QR'),
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex justify-end">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col p-6 animate-in slide-in-from-right duration-300 overflow-hidden">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-2xl font-black uppercase">Giỏ hàng</h2>
          <button onClick={onClose}><XMarkIcon className="h-8 w-8 text-gray-400" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <div className="space-y-6 pb-6">
          {cart.length === 0 ? <p className="text-center text-gray-400 font-bold py-10">Giỏ hàng trống. Hãy chọn món bạn thích! 🥤</p> : 
            cart.map((item) => (
              <div key={`${item.ma_san_pham}-${item.size}`} className="flex gap-4 items-center">
                <img src={item.hinh_anh_url} className="w-20 h-20 object-cover rounded-2xl" alt={item.ten_san_pham} />
                <div className="flex-1">
                  <h4 className="font-bold text-gray-800">{item.ten_san_pham}</h4>
                  <div className="mt-1 flex items-center gap-2">
                    <label
                      className="text-xs font-bold uppercase tracking-wide text-gray-400"
                      htmlFor={`cart-size-${item.id || `${item.ma_san_pham}-${item.size || 'Nho'}`}`}
                    >
                      Size
                    </label>
                    <select
                      id={`cart-size-${item.id || `${item.ma_san_pham}-${item.size || 'Nho'}`}`}
                      value={item.size || 'Nhỏ'}
                      onChange={async (e) => {
                        await changeCartItemSize(item.ma_san_pham, item.size || 'Nhỏ', e.target.value);
                        if (thongBao) {
                          setThongBao('');
                        }
                      }}
                      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-bold text-gray-600 outline-none transition-colors focus:border-tch-orange"
                    >
                      {AVAILABLE_SIZES.map((sizeOption) => (
                        <option key={sizeOption} value={sizeOption}>
                          {sizeOption}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-tch-orange font-black">{Number(item.gia_ban).toLocaleString('vi-VN')}đ x {item.so_luong}</p>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2 py-1">
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(item.ma_san_pham, item.size, -1)}
                      className="h-7 w-7 rounded-lg bg-white text-gray-700 border border-gray-200 font-black hover:border-tch-orange hover:text-tch-orange transition-colors"
                      aria-label={`Giảm số lượng ${item.ten_san_pham}`}
                    >
                      -
                    </button>
                    <span className="min-w-6 text-center text-sm font-black text-gray-700">{item.so_luong}</span>
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(item.ma_san_pham, item.size, 1)}
                      className="h-7 w-7 rounded-lg bg-white text-gray-700 border border-gray-200 font-black hover:border-tch-orange hover:text-tch-orange transition-colors"
                      aria-label={`Tăng số lượng ${item.ten_san_pham}`}
                    >
                      +
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFromCart(item.ma_san_pham, item.size)}
                  className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  aria-label={`Xóa ${item.ten_san_pham} size ${item.size}`}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))
          }
          </div>

          <div className="pt-6 border-t">
          <div className="flex justify-between mb-6">
            <span className="font-bold text-gray-400 uppercase text-xs">Tổng tiền</span>
            <span className="text-lg font-black text-gray-600">{total.toLocaleString()}đ</span>
          </div>

          {/* Section Voucher */}
          <div className="mb-4 rounded-2xl border border-orange-100 bg-orange-50/60 p-3">
            <p className="mb-2 text-xs font-black uppercase tracking-wide text-tch-orange">🎟 Mã giảm giá</p>
            {voucherResult ? (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-emerald-700">{voucherResult.ma_voucher || voucherResult.ma_khuyen_mai}</p>
                  <p className="text-xs font-semibold text-emerald-600">{voucherResult.mo_ta || voucherResult.ten_khuyen_mai || 'Áp dụng thành công'} — Giảm {discountAmount.toLocaleString('vi-VN')}đ</p>
                </div>
                <button type="button" onClick={xoaVoucher} className="rounded-lg bg-white px-3 py-1 text-xs font-black text-red-500 border border-red-100">
                  Xóa
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={voucherCode}
                  onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setVoucherError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && apDungVoucher()}
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-tch-orange uppercase"
                  placeholder="Nhập mã voucher"
                />
                <button
                  type="button"
                  onClick={apDungVoucher}
                  disabled={isCheckingVoucher}
                  className="rounded-xl bg-tch-orange px-4 py-2 text-xs font-black uppercase text-white shadow-sm disabled:opacity-60"
                >
                  {isCheckingVoucher ? '...' : 'Áp dụng'}
                </button>
              </div>
            )}
            {voucherError ? <p className="mt-2 text-xs font-semibold text-red-600">{voucherError}</p> : null}
          </div>

          <div className="flex justify-between mb-6">
            <span className="font-bold text-gray-400 uppercase text-xs">Tổng thanh toán</span>
            <div className="text-right">
              {discountAmount > 0 ? (
                <p className="text-xs font-semibold text-emerald-600 line-through">{total.toLocaleString()}đ</p>
              ) : null}
              <span className="text-2xl font-black text-tch-orange">{tongTienSauGiam.toLocaleString()}đ</span>
            </div>
          </div>

          <div className="space-y-3 mb-4">
            {isLoggedInUser && savedAddresses.length ? (
              <>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Địa chỉ đã lưu</label>
                <select
                  value={savedAddresses.some((item) => item.dia_chi_day_du === diaChiDayDu) ? diaChiDayDu : ''}
                  onChange={(e) => {
                    const selected = savedAddresses.find((item) => item.dia_chi_day_du === e.target.value);
                    if (!selected) {
                      return;
                    }
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
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
                >
                  <option value="">Chọn địa chỉ đã lưu</option>
                  {savedAddresses.map((item) => (
                    <option key={item.id} value={item.dia_chi_day_du}>
                      {item.ten_dia_chi}{item.mac_dinh ? ' (mặc định)' : ''}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Thành phố</label>
            <select
              value={addressForm.city}
              onChange={(e) => {
                const nextCity = e.target.value;
                const nextDistrict = Object.keys(addressOptions[nextCity] || {})[0] || '';
                const nextWard = (addressOptions[nextCity]?.[nextDistrict] || [])[0] || '';
                setAddressForm((prev) => ({ ...prev, city: nextCity, district: nextDistrict, ward: nextWard }));
                if (thongBao) setThongBao('');
              }}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
            >
              {Object.keys(addressOptions).map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>

            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Quận</label>
            <select
              value={addressForm.district}
              onChange={(e) => {
                const nextDistrict = e.target.value;
                const nextWard = (addressOptions[addressForm.city]?.[nextDistrict] || [])[0] || '';
                setAddressForm((prev) => ({ ...prev, district: nextDistrict, ward: nextWard }));
                if (thongBao) setThongBao('');
              }}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
            >
              {districtOptions.map((district) => (
                <option key={district} value={district}>{district}</option>
              ))}
            </select>

            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Phường</label>
            <select
              value={addressForm.ward}
              onChange={(e) => {
                setAddressForm((prev) => ({ ...prev, ward: e.target.value }));
                if (thongBao) setThongBao('');
              }}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
            >
              {wardOptions.map((ward) => (
                <option key={ward} value={ward}>{ward}</option>
              ))}
            </select>

            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Số nhà, tên đường</label>
            <input
              value={addressForm.street}
              onChange={(e) => {
                setAddressForm((prev) => ({ ...prev, street: e.target.value }));
                if (thongBao) setThongBao('');
              }}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
              placeholder="Vi du: 28 Ter B Mạc Đĩnh Chi"
            />
            <p className="-mt-1 text-[11px] font-semibold text-gray-500">Địa chỉ đầy đủ: {diaChiDayDu || '---'}</p>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Khung giờ giao</label>
            <input
              value={khungGio}
              onChange={(e) => {
                setKhungGio(e.target.value);
                if (thongBao) setThongBao('');
              }}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
              placeholder="Ví dụ: 18:00 - 19:00"
            />
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Ghi chú đơn hàng</label>
            <textarea
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange resize-none"
              placeholder="Ví dụ: ít đá, giao trước cổng, gọi điện trước khi giao..."
            />
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Phương thức thanh toán</label>
            <select
              value={phuongThuc}
              onChange={(e) => setPhuongThuc(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold outline-none focus:border-tch-orange"
            >
              <option value="VNPAY">VNPAY (thẻ/ngân hàng)</option>
              <option value="NGAN_HANG_QR">Ngân hàng QR</option>
              <option value="THANH_TOAN_KHI_NHAN_HANG">Thanh toán khi nhận hàng</option>
            </select>
          </div>

          <button
            onClick={khoiTaoThanhToan}
            disabled={khoiTaoThanhToanMutation.isPending}
            className="w-full py-5 bg-tch-orange text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-orange-200 disabled:opacity-70"
          >
            {khoiTaoThanhToanMutation.isPending ? 'Đang xử lý...' : 'Thanh toán ngay'}
          </button>

          {thongBao ? <p className="mt-3 text-sm font-semibold text-gray-600">{thongBao}</p> : null}

          {qrData ? (
            <div className="mt-4 rounded-2xl border border-gray-200 p-4 bg-gray-50">
              <p className="text-sm font-black text-gray-700 mb-2">Quét QR để chuyển khoản</p>
              <img
                src={qrImageUrl || qrData.qr_img_url}
                alt="QR ngân hàng"
                className="w-48 h-48 mx-auto rounded-xl border border-gray-200 bg-white"
                onError={() => {
                  if (qrData?.qr_fallback_url && qrImageUrl !== qrData.qr_fallback_url) {
                    setQrImageUrl(qrData.qr_fallback_url);
                  }
                }}
              />
              <p className="mt-3 text-xs text-gray-600">Mã tham chiếu: <span className="font-black">{qrData.ma_tham_chieu}</span></p>
              <p className="text-xs text-gray-600">Số tiền: <span className="font-black">{Number(qrData.so_tien).toLocaleString('vi-VN')}đ</span></p>
              <p className="mt-3 text-xs text-gray-500">Không cần bấm xác nhận. Sau khi tiền vào tài khoản, webhook Sepay sẽ cập nhật tự động.</p>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}