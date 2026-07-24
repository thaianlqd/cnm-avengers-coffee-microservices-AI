import { 
  XMarkIcon, 
  TrashIcon, 
  ArrowLongRightIcon, 
  ArrowLongLeftIcon, 
  TagIcon,
  ShoppingBagIcon,
  CreditCardIcon,
  SparklesIcon,
  CheckIcon,
  TruckIcon,
  BuildingStorefrontIcon,
  UserIcon,
  ShieldCheckIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';
import { useCart } from '../../context/CartContext';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import { buildAddressOptionsFromBranches, getAddressSelectionDefaults, normalizeAddressSelection } from '../../lib/addressOptions';
import CartEditModal from '../../components/CartEditModal';
import { PencilIcon, CheckCircleIcon, StarIcon } from '@heroicons/react/24/solid';
import DeliveryModeSelector from '../../components/features_thaian/DeliveryModeSelector';
import DeliveryMethodPicker from '../../components/features_thaian/DeliveryMethodPicker';
import BranchSelector from '../../components/features_thaian/BranchSelector';

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
    return { city: '', district: '', ward: '', street: '' };
  }

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 4) {
    const city = parts[parts.length - 1] || '';
    const district = parts[parts.length - 2] || '';
    const ward = parts[parts.length - 3] || '';
    const street = parts.slice(0, parts.length - 3).join(', ');
    return { city, district, ward, street: street || raw };
  } else if (parts.length === 3) {
    const city = parts[2] || '';
    const district = parts[1] || '';
    const street = parts[0] || '';
    return { city, district, ward: '', street: street || raw };
  } else if (parts.length === 2) {
    const city = parts[1] || '';
    const street = parts[0] || '';
    return { city, district: '', ward: '', street: street || raw };
  }

  return { city: '', district: '', ward: '', street: raw };
}

export default function CartPage({ 
  products = [], 
  onBackToHome, 
  voucherItems: initialVouchers = [], 
  suggestedPastries = [], 
  onAddToCart 
}) {
  const { cart, removeFromCart, updateCartQuantity, activeUserId, refreshCart } = useCart();
  const [editingItem, setEditingItem] = useState(null);
  const queryClient = useQueryClient();
  const total = cart.reduce((sum, i) => sum + i.gia_ban * i.so_luong, 0);

  const [deliveryMode, setDeliveryMode] = useState(() => {
    const storedTableId = sessionStorage.getItem('qr_tableId');
    return storedTableId ? 'DUNG_TAI_CHO' : 'GIAO_TAN_NOI';
  });
  const [deliveryMethod, setDeliveryMethod] = useState('INTERNAL');
  const [selectedBranch, setSelectedBranch] = useState(() => {
    return sessionStorage.getItem('qr_storeId') || '';
  });
  const [tableNumber, setTableNumber] = useState(() => {
    return sessionStorage.getItem('qr_tableId') || '';
  });

  // Đảm bảo trạng thái được cập nhật kể cả khi Vite HMR giữ lại state cũ
  useEffect(() => {
    const qrTable = sessionStorage.getItem('qr_tableId');
    const qrStore = sessionStorage.getItem('qr_storeId');
    if (qrTable) {
      setDeliveryMode('DUNG_TAI_CHO');
      setTableNumber(qrTable);
      if (qrStore) {
        setSelectedBranch(qrStore);
      }
    }
  }, []);

  // 1: Cart Items, 2: Checkout Info Form
  const [step, setStep] = useState(1);

  const { data: inventoryData } = useQuery({
    queryKey: ['inventory', selectedBranch],
    queryFn: async () => {
      const response = await apiClient.get(`/inventory/items?branch_code=${selectedBranch}`);
      return response.data;
    },
    enabled: Boolean(selectedBranch),
    staleTime: 5 * 1000,
  });

  const isAnyItemOutOfStock = useMemo(() => {
    if (!inventoryData) return false;
    const arr = Array.isArray(inventoryData) ? inventoryData : (inventoryData.items || []);
    return cart.some(item => {
      const invItem = arr.find(i => String(i.ma_san_pham) === String(item.ma_san_pham));
      return invItem && (invItem.dang_kinh_doanh === false || invItem.dang_kinh_doanh === 0 || invItem.dang_kinh_doanh === 'false');
    });
  }, [cart, inventoryData]);

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

  const computedKhungGio = 'Giao ngay (15-30 phút)';

  const [phuongThuc, setPhuongThuc] = useState('VNPAY');
  const [addressForm, setAddressForm] = useState(() => ({ ...defaultAddressSelection, street: '' }));
  const [ghiChu, setGhiChu] = useState('');
  const [thongBao, setThongBao] = useState('');
  const [qrData, setQrData] = useState(null);
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [qrOrderId, setQrOrderId] = useState(null);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherResult, setVoucherResult] = useState(null);
  const [voucherError, setVoucherError] = useState('');
  const [isCheckingVoucher, setIsCheckingVoucher] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestSessionId, setGuestSessionId] = useState('');

  useEffect(() => {
    let gsid = localStorage.getItem('avengers_guest_session_id');
    if (!gsid) {
      gsid = `gsid_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      localStorage.setItem('avengers_guest_session_id', gsid);
    }
    setGuestSessionId(gsid);
  }, []);

  const maNguoiDung = useMemo(() => activeUserId || 'anonymous', [activeUserId]);
  const isLoggedInUser = useMemo(() => {
    const value = String(maNguoiDung || '');
    return Boolean(value && !value.startsWith('anon-') && value !== 'anonymous');
  }, [maNguoiDung]);

  const { data: memData } = useQuery({
    queryKey: queryKeys.membershipByUser(maNguoiDung),
    queryFn: async () => {
      const response = await apiClient.get(`/users/${maNguoiDung}/membership`);
      return response.data;
    },
    enabled: Boolean(isLoggedInUser),
    staleTime: 60 * 1000,
  });

  const phiGiaoHangGoc = useMemo(() => {
    if (deliveryMode !== 'GIAO_TAN_NOI') return 0;
    if (deliveryMethod === 'LALAMOVE') return 25000;
    return 15000;
  }, [deliveryMode, deliveryMethod]);

  const memberTierName = memData?.hang_hien_tai?.hang || 'Thành viên';
  const memberFreeshipVal = Number(memData?.quyen_loi_hien_tai?.freeship_value || 0);
  const memberFreeshipMinOrder = Number(memData?.quyen_loi_hien_tai?.freeship_min_order || 0);

  const isFreeshipEligible = useMemo(() => {
    if (deliveryMode !== 'GIAO_TAN_NOI') return false;
    if (memberFreeshipVal <= 0) return false;
    if (memberFreeshipMinOrder > 0 && total < memberFreeshipMinOrder) return false;
    return true;
  }, [deliveryMode, memberFreeshipVal, memberFreeshipMinOrder, total]);

  const giamPhiShipHanh = isFreeshipEligible ? Math.min(phiGiaoHangGoc, memberFreeshipVal) : 0;
  const phiGiaoHangThucTe = Math.max(0, phiGiaoHangGoc - giamPhiShipHanh);

  const discountAmount = voucherResult?.so_tien_giam || 0;
  const tongTienSauGiamVoucher = Math.max(0, total - discountAmount);
  const tongTienSauGiam = tongTienSauGiamVoucher + phiGiaoHangThucTe;
  const cityOptions = useMemo(() => {
    const base = Object.keys(addressOptions || {});
    if (addressForm.city && !base.includes(addressForm.city)) {
      return [addressForm.city, ...base];
    }
    return base;
  }, [addressOptions, addressForm.city]);

  const districtOptions = useMemo(() => {
    const base = Object.keys(addressOptions[addressForm.city] || {});
    if (addressForm.district && !base.includes(addressForm.district)) {
      return [addressForm.district, ...base];
    }
    return base;
  }, [addressForm.city, addressForm.district, addressOptions]);

  const wardOptions = useMemo(() => {
    const base = addressOptions[addressForm.city]?.[addressForm.district] || [];
    if (addressForm.ward && !base.includes(addressForm.ward)) {
      return [addressForm.ward, ...base];
    }
    return base;
  }, [addressForm.city, addressForm.district, addressForm.ward, addressOptions]);

  const diaChiDayDu = useMemo(() => taoDiaChiDayDu(addressForm), [addressForm]);

  const triggerAiRecommendationRefresh = useCallback(() => {
    if (!isLoggedInUser) return;
    queryClient.invalidateQueries({ queryKey: ['ai', 'recommend', maNguoiDung] });
    apiClient.post('/ai/recommend/train').catch(() => undefined);
  }, [isLoggedInUser, maNguoiDung, queryClient]);

  const { data: walletData } = useQuery({
    queryKey: ['userWallet', maNguoiDung],
    queryFn: async () => {
      const response = await apiClient.get(`/customers/${maNguoiDung}/wallet`);
      return response.data;
    },
    enabled: isLoggedInUser,
    staleTime: 10 * 1000,
  });

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

  const { data: voucherPayload } = useQuery({
    queryKey: ['cart-vouchers', maNguoiDung],
    queryFn: async () => {
      const q = isLoggedInUser ? `?user_id=${encodeURIComponent(maNguoiDung)}` : '';
      const response = await apiClient.get(`/promotions/vouchers${q}`);
      const data = response?.data || response;
      return Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    },
    staleTime: 15 * 1000,
  });

  const voucherItems = useMemo(() => {
    if (voucherPayload && voucherPayload.length > 0) return voucherPayload;
    return initialVouchers || [];
  }, [voucherPayload, initialVouchers]);

  const isPersonalVoucher = useCallback((v) => {
    if (!v) return false;
    if (v.loai_phan_phoi === 'PERSONAL') return true;
    if (v.ma_nguoi_dung && String(v.ma_nguoi_dung).trim() !== '') return true;
    if (v.loai_su_kien && v.loai_su_kien !== 'PUBLIC') return true;
    const code = String(v.ma_khuyen_mai || v.ma_voucher || '').toUpperCase();
    if (
      code.startsWith('LW_') ||
      code.startsWith('WHEEL_') ||
      code.startsWith('BD_') ||
      code.startsWith('TIER_') ||
      code.startsWith('UP_') ||
      code.startsWith('USER_') ||
      code.startsWith('KS') ||
      code.startsWith('SURVEY_')
    ) return true;
    return false;
  }, []);

  const personalVouchers = useMemo(() => {
    return (voucherItems || [])
      .filter(isPersonalVoucher)
      .filter((v) => v.co_the_dung !== false && (v.da_dung_boi_ban === undefined || v.da_dung_boi_ban < (v.gioi_han_moi_nguoi || 1)));
  }, [voucherItems, isPersonalVoucher]);

  const publicVouchers = useMemo(() => {
    return (voucherItems || [])
      .filter((v) => !isPersonalVoucher(v))
      .filter((v) => v.co_the_dung !== false && (v.da_dung_boi_ban === undefined || v.da_dung_boi_ban < (v.gioi_han_moi_nguoi || 1)));
  }, [voucherItems, isPersonalVoucher]);

  useEffect(() => {
    if (!addressForm.city && defaultAddressSelection.city) {
      setAddressForm((prev) => ({ ...prev, ...defaultAddressSelection }));
    }
  }, [addressForm.city, defaultAddressSelection]);

  useEffect(() => {
    if (voucherCode && cart && cart.length > 0) {
      apDungVoucher(voucherCode);
    } else {
      setVoucherResult(null);
      setVoucherError('');
    }
  }, [cart, total]);

  const apDungVoucher = async (overrideCode) => {
    const codeStr = typeof overrideCode === 'string' ? overrideCode : voucherCode;
    const code = String(codeStr || '').trim();
    if (!code) {
      setVoucherError('Vui lòng nhập mã voucher');
      return;
    }
    if (!cart || !cart.length) {
      setVoucherError('Giỏ hàng trống, chưa có sản phẩm để áp dụng voucher');
      return;
    }
    setIsCheckingVoucher(true);
    setVoucherError('');
    try {
      const hasToppings = cart.some(item => item.toppings && item.toppings.length > 0);
      let toppingPrice = 0;
      cart.forEach(item => {
        // 1. Kiểm tra topping_prices đính kèm trên item
        if (Array.isArray(item.topping_prices) && item.topping_prices.length > 0) {
          const validPrices = item.topping_prices.map(Number).filter(p => p > 0);
          if (validPrices.length > 0) {
            const maxInItem = Math.max(...validPrices);
            if (maxInItem > toppingPrice) toppingPrice = maxInItem;
          }
        }
        // 2. Tra cứu danh sách tên topping với prop products để lấy giá chính xác
        if (item.toppings && item.toppings.length > 0) {
          item.toppings.forEach(tpName => {
            (products || []).forEach(prod => {
              if (prod.toppings && prod.toppings[tpName] !== undefined) {
                const p = Number(prod.toppings[tpName]);
                if (p > toppingPrice) toppingPrice = p;
              }
            });
          });
        }
      });
      if (hasToppings && toppingPrice === 0) {
        toppingPrice = 5000;
      }

      const response = await apiClient.post('/vouchers/kiem-tra', {
        ma_voucher: code,
        tong_tien: total,
        user_id: isLoggedInUser ? maNguoiDung : '',
        has_toppings: hasToppings,
        topping_price: toppingPrice,
      });
      const d = response?.data || response;
      if (d && (d.hop_le || d.so_tien_giam !== undefined)) {
        setVoucherCode(code);
        setVoucherResult(d);
        setVoucherError('');
      } else {
        setVoucherResult(null);
        setVoucherError('Mã voucher không hợp lệ');
      }
    } catch (err) {
      setVoucherResult(null);
      let rawMsg = err?.response?.data?.message || 'Mã voucher không hợp lệ hoặc đã hết hạn';
      if (Array.isArray(rawMsg)) {
        rawMsg = rawMsg.join(', ');
      }
      const cleanMsg = String(rawMsg)
        .replace(/^[A-Za-z0-9_]+Exception:\s*/i, '')
        .replace(/^[A-Za-z0-9_]+Error:\s*/i, '')
        .trim();
      setVoucherError(cleanMsg || 'Mã voucher không hợp lệ hoặc đã hết hạn');
    } finally {
      setIsCheckingVoucher(false);
    }
  };

  const xoaVoucher = () => {
    setVoucherCode('');
    setVoucherResult(null);
    setVoucherError('');
  };


  useEffect(() => {
    if (!defaultAddress) {
      return;
    }

    setAddressForm((current) => {
      if (current.street?.trim()) {
        return current;
      }

      let city = defaultAddress.thanh_pho || defaultAddress.city;
      let district = defaultAddress.quan_huyen || defaultAddress.district;
      let ward = defaultAddress.phuong_xa || defaultAddress.ward;
      let street = defaultAddress.so_nha_ten_duong || defaultAddress.street;

      if (!city || !district || !ward || !street) {
        const parsed = tachDiaChiDayDu(defaultAddress.dia_chi_day_du);
        city = city || parsed.city;
        district = district || parsed.district;
        ward = ward || parsed.ward;
        street = street || parsed.street;
      }

      return {
        city: city || 'Đà Nẵng',
        district: district || 'Quận Hải Châu',
        ward: ward || 'Phường Nam Dương',
        street: street || defaultAddress.dia_chi_day_du || '',
        savedAddressId: defaultAddress.id,
      };
    });
  }, [defaultAddress]);

  useEffect(() => {
    if (publicBranchPayload?.items?.length > 0) {
      const allBranches = publicBranchPayload.items;
      
      // Lọc các chi nhánh cùng Thành phố với địa chỉ giao hàng
      const cityMatches = allBranches.filter(b => {
        const bCity = String(b.thanh_pho || b.dia_chi || '').toLowerCase();
        const userCity = String(addressForm.city || '').toLowerCase();
        return userCity && bCity.includes(userCity);
      });
      
      // Nếu có chi nhánh cùng quận/huyện thì ưu tiên (nếu sau này có dữ liệu quận)
      // Hiện tại lấy chi nhánh đầu tiên trong cùng thành phố
      const targetBranch = cityMatches.length > 0 ? cityMatches[0] : allBranches[0];
      const branchId = targetBranch.ma_chi_nhanh || targetBranch.co_so_ma || targetBranch.branch_code || '';

      // Tự động chuyển chi nhánh nếu chi nhánh hiện tại không nằm trong cùng thành phố
      // CHỈ ÁP DỤNG KHI GIAO TẬN NƠI
      if (deliveryMode === 'GIAO_TAN_NOI') {
        if (!selectedBranch) {
          setSelectedBranch(branchId);
        } else {
          const currentBranch = allBranches.find(b => (b.ma_chi_nhanh || b.co_so_ma || b.branch_code) === selectedBranch);
          const currentBranchCity = String(currentBranch?.thanh_pho || currentBranch?.dia_chi || '').toLowerCase();
          const userCity = String(addressForm.city || '').toLowerCase();
          
          if (userCity && !currentBranchCity.includes(userCity)) {
            setSelectedBranch(branchId);
          }
        }
      } else {
        // Lấy tại quán / Dùng tại chỗ: Chỉ set mặc định nếu chưa có
        if (!selectedBranch) {
          setSelectedBranch(allBranches[0]?.ma_chi_nhanh || allBranches[0]?.co_so_ma || allBranches[0]?.branch_code || '');
        }
      }
    }
  }, [publicBranchPayload, selectedBranch, addressForm.city, deliveryMode]);

  const khoiTaoThanhToanMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post(`/customers/${maNguoiDung}/thanh-toan/khoi-tao`, {
        phuong_thuc_giao: deliveryMode,
        phuong_thuc_thanh_toan: phuongThuc,
        khung_gio_giao: computedKhungGio,
        phi_giao_hang: deliveryMode === 'GIAO_TAN_NOI' ? phiGiaoHangThucTe : 0,
        dia_chi_giao_hang: deliveryMode === 'GIAO_TAN_NOI' ? diaChiDayDu : (deliveryMode === 'LAY_TAI_QUAN' ? 'Khách lấy tại quán' : 'Khách dùng tại chỗ'),
        ghi_chu: ghiChu.trim() || 'Dat tu web-customer',
        ma_voucher: voucherResult?.ma_voucher || voucherResult?.ma_khuyen_mai || undefined,
        delivery_mode: deliveryMode,
        delivery_method: deliveryMethod,
        branch_code: selectedBranch,
        table_number: deliveryMode === 'DUNG_TAI_CHO' ? tableNumber : undefined,
        guest_email: isLoggedInUser ? undefined : guestEmail.trim(),
        guest_phone: isLoggedInUser ? undefined : guestPhone.trim(),
        session_id: guestSessionId,
        ten_khach_hang: isLoggedInUser ? (JSON.parse(localStorage.getItem('user') || '{}')?.ho_ten || undefined) : (guestEmail.trim() || guestPhone.trim()),
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
      window.dispatchEvent(new CustomEvent('checkout-success', { detail: { orderId: qrOrderId } }));
    }
  }, [qrOrderStatus, queryClient, refreshCart, triggerAiRecommendationRefresh, qrOrderId]);

  const khoiTaoThanhToan = async () => {
    if (!cart.length) {
      setThongBao('Giỏ hàng đang trống. Vui lòng thêm sản phẩm trước khi thanh toán.');
      return;
    }

    if (!isLoggedInUser) {
      if (!guestEmail.trim() && !guestPhone.trim()) {
        setThongBao('Vui lòng nhập ít nhất Email hoặc Số điện thoại để tiến hành đặt hàng.');
        return;
      }
    }

    if (deliveryMode === 'GIAO_TAN_NOI') {
      if (!addressForm.city || !addressForm.district || !addressForm.ward || !addressForm.street?.trim()) {
        setThongBao('Vui lòng chọn thành phố, quận, phường và nhập số nhà/đường đầy đủ.');
        return;
      }

      if (diaChiDayDu.length < 16) {
        setThongBao('Địa chỉ giao hàng chưa đủ chi tiết. Vui lòng bổ sung số nhà và tên đường.');
        return;
      }
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

if (deliveryMode === 'GIAO_TAN_NOI') {
              setThongBao('Tạo đơn hàng COD thành công. Đơn sẽ được thu tiền khi nhận hàng.');
            } else {
              setThongBao('Tạo đơn hàng thành công. Vui lòng thanh toán tại quầy.');
            }
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
              triggerAiRecommendationRefresh();
              refreshCart();
              const orderId = data?.order?.ma_don_hang || data?.payment_details?.ma_don_hang || '';
              window.dispatchEvent(new CustomEvent('checkout-success', { detail: { orderId } }));
              setGhiChu('');
              xoaVoucher();
            }, 0);
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
    <div className="w-full bg-[#faf7f4] min-h-screen py-8 sm:py-12 px-4 md:px-8">
      <div className="max-w-[1240px] mx-auto">
        {/* Breadcrumb */}
        <nav className="text-[13px] font-bold uppercase tracking-wider text-gray-400 mb-6 flex items-center gap-2">
          <button 
            onClick={() => onBackToHome?.()} 
            className="hover:text-[#c41230] transition-colors"
          >
            Trang chủ
          </button>
          <span className="text-gray-300">&gt;</span>
          <span className="text-gray-800">{step === 1 ? 'Giỏ hàng' : 'Thanh toán'}</span>
        </nav>

        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold uppercase text-[#1a1a1a] tracking-tight font-serif leading-none">
              {step === 1 ? 'Giỏ hàng của bạn' : 'Thông tin thanh toán'}
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-gray-500 mt-2">
              {step === 1 
                ? `Bạn đang có ${cart.reduce((s, i) => s + i.so_luong, 0)} món đồ uống & bánh trong giỏ` 
                : 'Hoàn tất địa chỉ và chọn phương thức thanh toán phù hợp'}
            </p>
          </div>
        </div>

        {/* STEP STEPPER HEADER */}
        <div className="mb-8 bg-white rounded-[24px] p-4 sm:p-6 border border-[#e8e2da] shadow-xs">
          <div className="flex items-center justify-between max-w-2xl mx-auto relative">
            {/* Background Line */}
            <div className="absolute top-1/2 left-8 right-8 h-1 bg-gray-100 -translate-y-1/2 z-0 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#c41230] to-amber-500 transition-all duration-500 ease-out" 
                style={{ width: step === 1 ? '0%' : '50%' }}
              />
            </div>

            {/* Step 1 */}
            <button 
              type="button"
              onClick={() => setStep(1)}
              className="flex flex-col items-center gap-2 relative z-10 group cursor-pointer"
            >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-sm transition-all duration-300 shadow-sm ${
                step >= 1 ? 'bg-[#c41230] text-white ring-4 ring-[#c41230]/15' : 'bg-gray-100 text-gray-400'
              }`}>
                <ShoppingBagIcon className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className={`text-[11px] sm:text-xs font-black uppercase tracking-wider ${step >= 1 ? 'text-[#c41230]' : 'text-gray-400'}`}>
                1. Giỏ hàng {cart.length > 0 && `(${cart.reduce((sum, i) => sum + i.so_luong, 0)})`}
              </span>
            </button>

            {/* Step 2 */}
            <button 
              type="button"
              onClick={() => cart.length > 0 && setStep(2)}
              disabled={cart.length === 0}
              className="flex flex-col items-center gap-2 relative z-10 group cursor-pointer disabled:cursor-not-allowed"
            >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-extrabold text-sm transition-all duration-300 shadow-sm ${
                step >= 2 ? 'bg-[#c41230] text-white ring-4 ring-[#c41230]/15' : 'bg-gray-100 text-gray-400'
              }`}>
                <CreditCardIcon className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className={`text-[11px] sm:text-xs font-black uppercase tracking-wider ${step >= 2 ? 'text-[#c41230]' : 'text-gray-400'}`}>
                2. Thanh toán
              </span>
            </button>

            {/* Step 3 */}
            <div className="flex flex-col items-center gap-2 relative z-10">
              <div className="w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center font-extrabold text-sm shadow-sm">
                <SparklesIcon className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-gray-400">
                3. Hoàn tất
              </span>
            </div>
          </div>
        </div>

        {/* FREESHIP & PRIVILEGE PROGRESS BAR */}
        {deliveryMode === 'GIAO_TAN_NOI' && (
          <div className="mb-8 bg-gradient-to-r from-[#fffbeb] via-[#fff7ed] to-[#fef3c7] text-[#78350f] rounded-[24px] p-5 sm:p-6 shadow-xs border border-amber-200/80 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-200/60 text-amber-900 flex items-center justify-center shrink-0 border border-amber-300 text-xs font-black tracking-wider uppercase">
                  FREE
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-amber-950">
                      Đặc quyền Freeship hạng {memberTierName}
                    </h4>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-amber-200/70 text-amber-900 rounded-full border border-amber-300/80">VIP</span>
                  </div>
                  <p className="text-xs font-semibold text-amber-900/90 mt-1">
                    {isFreeshipEligible ? (
                      <span className="text-emerald-700 font-bold">Đã đủ điều kiện Freeship! Giảm ngay {giamPhiShipHanh.toLocaleString('vi-VN')}đ phí giao hàng</span>
                    ) : memberFreeshipMinOrder > total ? (
                      <span>Mua thêm <strong className="text-[#c41230] font-extrabold">{(memberFreeshipMinOrder - total).toLocaleString('vi-VN')}đ</strong> để được giảm ngay <strong className="text-emerald-700 font-extrabold">{memberFreeshipVal.toLocaleString('vi-VN')}đ</strong> phí ship</span>
                    ) : (
                      <span>Đơn từ {memberFreeshipMinOrder.toLocaleString('vi-VN')}đ sẽ nhận ưu đãi Freeship {memberFreeshipVal.toLocaleString('vi-VN')}đ</span>
                    )}
                  </p>
                </div>
              </div>
              {memberFreeshipMinOrder > 0 && (
                <div className="w-full sm:w-56 shrink-0 space-y-1.5 bg-white/80 p-3 rounded-2xl border border-amber-200/80 shadow-xs">
                  <div className="flex justify-between text-[11px] font-bold text-amber-900">
                    <span>Tiến trình Freeship</span>
                    <span className="text-emerald-700 font-black">{Math.min(100, Math.round((total / memberFreeshipMinOrder) * 100))}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-amber-100 rounded-full overflow-hidden border border-amber-200">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (total / memberFreeshipMinOrder) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Cột trái: Chi tiết Giỏ hàng HOẶC Form thông tin thanh toán */}
          <div className="lg:col-span-7 xl:col-span-8">
            
            {step === 1 ? (
              <>
              {/* BƯỚC 1: DANH SÁCH GIỎ HÀNG */}
              <div className="bg-white rounded-[24px] p-6 md:p-8 border border-[#e8e2da] shadow-xs space-y-6">
                {cart.length === 0 ? (
                  <div className="py-20 text-center space-y-4">
                    <h3 className="text-xl font-bold text-gray-800 font-serif">Giỏ hàng của bạn đang trống</h3>
                    <p className="text-gray-500 text-sm max-w-sm mx-auto">
                      Hãy khám phá thực đơn cà phê thơm nồng & bánh tươi ra lò để lấp đầy giỏ hàng nhé!
                    </p>
                    <button
                      onClick={() => onBackToHome?.()}
                      className="mt-2 px-8 py-3.5 bg-[#c41230] text-white font-extrabold text-xs uppercase tracking-widest rounded-full hover:bg-[#a30f28] transition-all shadow-md hover:shadow-lg"
                    >
                      Khám phá Thực đơn
                    </button>
                  </div>
                ) : (
                  cart.map((item, idx) => {
                    const inventoryItem = inventoryData?.find(i => String(i.ma_san_pham) === String(item.ma_san_pham));
                    const isOutOfStock = inventoryData && inventoryItem && inventoryItem.dang_kinh_doanh === false;

                    return (
                    <div 
                      key={`${item.ma_san_pham}-${item.size}`} 
                      className={`flex flex-col sm:flex-row gap-5 items-start relative ${
                        idx < cart.length - 1 ? 'pb-6 border-b border-gray-100' : ''
                      }`}
                    >
                      {/* Khung ảnh nền xám nhạt bo tròn */}
                      <div className="w-24 h-24 sm:w-28 sm:h-28 bg-[#f4f0eb] rounded-[20px] overflow-hidden flex-shrink-0 flex items-center justify-center border border-[#e8e2da] shadow-inner group">
                        <img 
                          src={item.hinh_anh_url} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                          alt={item.ten_san_pham} 
                        />
                      </div>
                      
                      {/* Chi tiết sản phẩm */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between min-h-[6rem] sm:min-h-[7rem] pr-0 sm:pr-24">
                        <div className="space-y-1.5">
                          <h4 className="font-extrabold text-base sm:text-lg text-[#1a1a1a] leading-tight truncate">
                            {item.ten_san_pham}
                          </h4>

                          {/* Option Pills Badges */}
                          <div className="flex flex-wrap gap-1.5 text-xs text-gray-600 font-semibold mt-1">
                            {item.size && (
                              <span className="px-2.5 py-0.5 bg-[#fdf8f3] text-[#b22830] border border-[#f3e5d8] rounded-full text-[11px] font-bold">
                                Size {item.size}
                              </span>
                            )}
                            {item.loai_sua && (
                              <span className="px-2.5 py-0.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-full text-[11px]">
                                Sữa: {item.loai_sua}
                              </span>
                            )}
                            {item.luong_da && (
                              <span className="px-2.5 py-0.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-full text-[11px]">
                                Đá: {item.luong_da}
                              </span>
                            )}
                            {item.do_ngot && (
                              <span className="px-2.5 py-0.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-full text-[11px]">
                                Ngọt: {item.do_ngot}
                              </span>
                            )}
                            {item.toppings && item.toppings.length > 0 && (
                              <span className="px-2.5 py-0.5 bg-amber-50 text-amber-900 border border-amber-200/80 rounded-full text-[11px]">
                                Topping: {item.toppings.join(', ')}
                              </span>
                            )}
                            {item.custom_attributes && Object.entries(item.custom_attributes).map(([attrName, selection]) => {
                              if (attrName === 'Kích thước' || attrName === 'Topping' || attrName === 'Loại sữa' || attrName === 'Lượng đá' || attrName === 'Độ ngọt') {
                                return null;
                              }
                              const textVal = Array.isArray(selection) ? selection.join(', ') : selection;
                              if (!textVal) return null;
                              return (
                                <span key={attrName} className="px-2.5 py-0.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-full text-[11px]">
                                  {attrName}: {textVal}
                                </span>
                              );
                            })}
                          </div>

                          <button
                            type="button"
                            onClick={() => setEditingItem(item)}
                            className="mt-2 inline-flex items-center gap-1.5 text-[#b22830] font-extrabold text-xs hover:underline w-fit bg-[#b22830]/5 px-2.5 py-1 rounded-lg border border-[#b22830]/15"
                          >
                            <PencilIcon className="w-3.5 h-3.5" /> Chỉnh sửa tùy chọn
                          </button>
                        </div>

                        {/* Giá tiền */}
                        <div className="mt-3">
                          <p className="text-[#1a1a1a] font-black text-xl">
                            {Number(item.gia_ban).toLocaleString('vi-VN')}đ
                          </p>
                          {isOutOfStock && (
                            <div className="mt-1.5 text-[11px] font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100 inline-block">
                              Tạm hết hàng tại chi nhánh này
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bộ tăng giảm và nút Xóa xếp bên phải */}
                      <div className="w-full sm:w-auto sm:absolute sm:right-0 sm:top-0 sm:h-full flex sm:flex-col justify-between items-center sm:items-end py-1 mt-2 sm:mt-0 pt-3 sm:pt-1 border-t sm:border-t-0 border-gray-100">
                        {/* Nút xóa màu đỏ */}
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.ma_san_pham, item.size)}
                          className="text-gray-400 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50"
                          aria-label={`Xóa ${item.ten_san_pham}`}
                        >
                          <TrashIcon className="h-5 w-5 stroke-[2]" />
                        </button>

                        {/* Bộ tăng giảm hình kẹo dẻo màu trắng viền xám */}
                        <div className="flex items-center justify-between bg-[#faf7f4] border border-gray-200 rounded-full py-1.5 px-3 w-[100px] sm:w-[110px] shadow-xs select-none">
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.ma_san_pham, item.size, -1)}
                            className="w-7 h-7 rounded-full bg-white text-gray-600 hover:text-[#c41230] font-extrabold text-[15px] flex items-center justify-center shadow-xs transition-colors"
                          >
                            -
                          </button>
                          <span className="text-sm font-black text-gray-800">
                            {item.so_luong}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartQuantity(item.ma_san_pham, item.size, 1)}
                            className="w-7 h-7 rounded-full bg-white text-gray-600 hover:text-[#c41230] font-extrabold text-[15px] flex items-center justify-center shadow-xs transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )})
                )}
              </div>

              {/* GỢI Ý DÙNG KÈM */}
              {suggestedPastries && suggestedPastries.length > 0 && (
                <div className="bg-white rounded-[24px] p-6 md:p-8 border border-[#e8e2da] shadow-xs mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-bold text-[#1a1a1a] tracking-wide">
                        Gợi ý dùng kèm
                      </h2>
                      <p className="text-xs text-gray-500 mt-0.5">Thêm bánh ngọt &amp; đồ nhắm hợp khẩu vị cùng giỏ hàng</p>
                    </div>
                  </div>
                  
                  <div className="flex overflow-x-auto gap-4 pb-2 custom-scrollbar">
                    {suggestedPastries.map((p) => (
                      <div 
                        key={p.ma_san_pham || p.id} 
                        className="w-[280px] sm:w-[310px] flex-shrink-0 flex items-center p-3.5 rounded-[20px] border border-gray-200 hover:border-[#c41230] transition-all bg-white cursor-pointer group shadow-xs hover:shadow-md"
                        onClick={() => onAddToCart?.(p)}
                      >
                        {/* Ảnh */}
                        <div className="w-18 h-18 rounded-2xl bg-[#faf7f4] flex items-center justify-center p-1.5 flex-shrink-0 overflow-hidden border border-gray-100">
                          <img src={p.hinh_anh_url || p.img} alt={p.ten_san_pham || p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        </div>
                        
                        {/* Thông tin */}
                        <div className="flex flex-col justify-between h-full flex-1 min-w-0 pl-3">
                          <h3 className="text-xs sm:text-sm font-bold text-[#282828] line-clamp-2 leading-tight mb-1">
                            {p.ten_san_pham || p.name}
                          </h3>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs font-black text-[#c41230]">
                              {Number(p.gia_ban || p.price || 0).toLocaleString('vi-VN')}đ
                            </span>
                            <span className="px-3 py-1 bg-[#c41230] text-white text-[11px] font-extrabold rounded-full flex items-center gap-1 hover:bg-[#a30f28] transition-colors shadow-xs">
                              + Thêm ❯
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              </>
            ) : (
              /* BƯỚC 2: FORM THÔNG TIN THANH TOÁN (CHECKOUT FORM) */
              <div className="bg-white rounded-[24px] p-6 md:p-8 border border-[#e8e2da] shadow-xs space-y-6">
                {/* Back Link */}
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-[#c41230] transition-colors bg-gray-50 px-3 py-1.5 rounded-full border border-gray-200"
                >
                  <ArrowLongLeftIcon className="h-4 w-4" />
                  <span>Quay lại sửa giỏ hàng</span>
                </button>

                <h2 className="text-xl font-black text-[#1a1a1a] uppercase tracking-wide pb-4 border-b border-gray-100 font-serif">
                  Thông tin giao hàng &amp; Thanh toán
                </h2>
                
                <div className="mb-6">
                  <DeliveryModeSelector selectedMode={deliveryMode} onChange={setDeliveryMode} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Cột trái form: Địa chỉ */}
                  <div className="space-y-4">
                    {deliveryMode === 'GIAO_TAN_NOI' && (
                      <div className="mb-6">
                        <DeliveryMethodPicker selectedMethod={deliveryMethod} onChange={setDeliveryMethod} lalamoveFee={25000} lalamoveLoading={false} />
                      </div>
                    )}

                    {deliveryMode === 'GIAO_TAN_NOI' ? (
                      <>
                        <h3 className="text-xs font-black uppercase text-[#c41230] tracking-widest">
                          Địa chỉ giao hàng
                        </h3>

                        {isLoggedInUser && savedAddresses.length ? (
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-500">Địa chỉ đã lưu</label>
                            <select
                              value={savedAddresses.find((item) => item.dia_chi_day_du === diaChiDayDu || String(item.id) === addressForm.savedAddressId)?.id || ''}
                              onChange={(e) => {
                                const selected = savedAddresses.find((item) => String(item.id) === e.target.value || item.dia_chi_day_du === e.target.value);
                                if (!selected) return;

                                let city = selected.thanh_pho || selected.city;
                                let district = selected.quan_huyen || selected.district;
                                let ward = selected.phuong_xa || selected.ward;
                                let street = selected.so_nha_ten_duong || selected.street;

                                if (!city || !district || !ward || !street) {
                                  const parsed = tachDiaChiDayDu(selected.dia_chi_day_du);
                                  city = city || parsed.city;
                                  district = district || parsed.district;
                                  ward = ward || parsed.ward;
                                  street = street || parsed.street;
                                }

                                setAddressForm({
                                  city,
                                  district,
                                  ward,
                                  street,
                                  savedAddressId: selected.id,
                                });
                                if (selected.ghi_chu && !ghiChu.trim()) {
                                  setGhiChu(selected.ghi_chu);
                                }
                              }}
                              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] focus:ring-2 focus:ring-[#c41230]/20 transition-all cursor-pointer"
                            >
                              <option value="">Chọn địa chỉ đã lưu</option>
                              {savedAddresses.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.ten_dia_chi || item.dia_chi_day_du}{item.mac_dinh ? ' (mặc định)' : ''}
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
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] focus:ring-2 focus:ring-[#c41230]/20 transition-all"
                          >
                            {cityOptions.map((city) => (
                              <option key={city} value={city}>{city}</option>
                            ))}
                          </select>
                        </div>

                        {/* Quận */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-gray-500">Quận / Huyện</label>
                          <select
                            value={addressForm.district}
                            onChange={(e) => {
                              const nextDistrict = e.target.value;
                              const nextWard = (addressOptions[addressForm.city]?.[nextDistrict] || [])[0] || '';
                              setAddressForm((prev) => ({ ...prev, district: nextDistrict, ward: nextWard }));
                              if (thongBao) setThongBao('');
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] focus:ring-2 focus:ring-[#c41230]/20 transition-all"
                          >
                            {districtOptions.map((district) => (
                              <option key={district} value={district}>{district}</option>
                            ))}
                          </select>
                        </div>

                        {/* Phường */}
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-gray-500">Phường / Xã</label>
                          <select
                            value={addressForm.ward}
                            onChange={(e) => {
                              setAddressForm((prev) => ({ ...prev, ward: e.target.value }));
                              if (thongBao) setThongBao('');
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] focus:ring-2 focus:ring-[#c41230]/20 transition-all"
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
                            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] focus:ring-2 focus:ring-[#c41230]/20 transition-all"
                            placeholder="Ví dụ: 28 Nguyễn Văn Linh"
                          />
                        </div>
                        <p className="text-[11px] font-bold text-gray-500 bg-gray-50 p-2.5 rounded-lg border border-gray-200/60">📍 Địa chỉ nhận: {diaChiDayDu || '---'}</p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-xs font-black uppercase text-[#c41230] tracking-widest">
                          Chọn cửa hàng nhận đồ
                        </h3>
                        <BranchSelector 
                          branches={publicBranchPayload?.items} 
                          selectedBranch={selectedBranch} 
                          onChange={setSelectedBranch} 
                        />
                        {deliveryMode === 'DUNG_TAI_CHO' && (
                          <div className="flex flex-col gap-1.5 mt-4">
                            <label className="text-xs font-bold text-gray-500">Số bàn (không bắt buộc)</label>
                            <div className="relative">
                              <input
                                type="text"
                                value={tableNumber}
                                onChange={(e) => setTableNumber(e.target.value)}
                                placeholder="Ví dụ: Bàn 12"
                                className={`w-full rounded-xl border ${tableNumber ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900' : 'border-gray-200 bg-white'} px-4 py-3 text-sm font-bold outline-none focus:border-[#c41230] transition-colors`}
                              />
                            </div>
                          </div>
                        )}
                        {deliveryMode === 'DUNG_TAI_CHO' && sessionStorage.getItem('qr_tableId') && tableNumber === sessionStorage.getItem('qr_tableId') && (
                          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900">
                            <span className="text-xl">📍</span>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Đang phục vụ tại bàn</p>
                              <p className="text-xs font-semibold">Bạn đang ngồi tại <strong>Bàn {tableNumber}</strong>. Nhân viên sẽ mang nước ra tận bàn!</p>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Cột phải form: Thông tin liên hệ & Phương thức thanh toán */}
                  <div className="space-y-4">
                    {!isLoggedInUser && (
                      <div className="bg-[#faf7f4] border border-[#e8e2da] rounded-[20px] p-5 space-y-4 mb-2">
                        <h3 className="text-xs font-black uppercase text-[#c41230] tracking-widest">
                          Thông tin khách hàng
                        </h3>
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-gray-600">Email nhận đơn</label>
                            <input
                              type="email"
                              value={guestEmail}
                              onChange={(e) => setGuestEmail(e.target.value)}
                              placeholder="VD: nguyenvan@gmail.com"
                              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#c41230] focus:ring-2 focus:ring-[#c41230]/20 transition-all"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold text-gray-600">Số điện thoại</label>
                            <input
                              type="tel"
                              value={guestPhone}
                              onChange={(e) => setGuestPhone(e.target.value)}
                              placeholder="VD: 0987654321"
                              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#c41230] focus:ring-2 focus:ring-[#c41230]/20 transition-all"
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 font-bold leading-relaxed">
                          * Nhập Email/SĐT để hệ thống thông báo trạng thái đơn và đồng bộ lịch sử.
                        </p>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-500">Ghi chú cho quầy pha chế / Shipper</label>
                      <textarea
                        value={ghiChu}
                        onChange={(e) => setGhiChu(e.target.value)}
                        rows={2}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#c41230] focus:ring-2 focus:ring-[#c41230]/20 resize-none transition-all"
                        placeholder="Ví dụ: ít đá, ngọt vừa, giao trước 11h30..."
                      />
                    </div>

                    {/* PAYMENT METHOD SELECTION CARDS GRID */}
                    <div className="space-y-2 pt-2">
                      <h3 className="text-xs font-black uppercase text-[#c41230] tracking-widest">
                        Phương thức thanh toán
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {/* VNPAY */}
                        <button
                          type="button"
                          onClick={() => setPhuongThuc('VNPAY')}
                          className={`p-3.5 rounded-[16px] border text-left flex items-start justify-between transition-all cursor-pointer ${
                            phuongThuc === 'VNPAY'
                              ? 'border-[#c41230] bg-[#c41230]/5 ring-2 ring-[#c41230]/20 shadow-xs'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-[#1a1a1a]">VNPAY</span>
                              <span className="text-[9px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">Thẻ / App</span>
                            </div>
                            <p className="text-[11px] font-semibold text-gray-500">ATM, Visa, QR Ngân Hàng</p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${phuongThuc === 'VNPAY' ? 'border-[#c41230] bg-[#c41230] text-white' : 'border-gray-300'}`}>
                            {phuongThuc === 'VNPAY' && <CheckIcon className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </button>

                        {/* NGAN_HANG_QR */}
                        <button
                          type="button"
                          onClick={() => setPhuongThuc('NGAN_HANG_QR')}
                          className={`p-3.5 rounded-[16px] border text-left flex items-start justify-between transition-all cursor-pointer ${
                            phuongThuc === 'NGAN_HANG_QR'
                              ? 'border-[#c41230] bg-[#c41230]/5 ring-2 ring-[#c41230]/20 shadow-xs'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-black text-[#1a1a1a]">Ngân Hàng QR</span>
                              <span className="text-[9px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">VietQR</span>
                            </div>
                            <p className="text-[11px] font-semibold text-gray-500">Quét mã chuyển khoản tự động</p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${phuongThuc === 'NGAN_HANG_QR' ? 'border-[#c41230] bg-[#c41230] text-white' : 'border-gray-300'}`}>
                            {phuongThuc === 'NGAN_HANG_QR' && <CheckIcon className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </button>

                        {/* VI_DIEN_TU */}
                        {isLoggedInUser && (
                          <button
                            type="button"
                            disabled={!walletData || Number(walletData?.wallet?.balance || 0) < tongTienSauGiam}
                            onClick={() => setPhuongThuc('VI_DIEN_TU')}
                            className={`p-3.5 rounded-[16px] border text-left flex items-start justify-between transition-all ${
                              phuongThuc === 'VI_DIEN_TU'
                                ? 'border-[#c41230] bg-[#c41230]/5 ring-2 ring-[#c41230]/20 shadow-xs'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            } ${(!walletData || Number(walletData?.wallet?.balance || 0) < tongTienSauGiam) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-[#1a1a1a]">Ví Avengers</span>
                                <span className="text-[9px] font-extrabold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  {Number(walletData?.wallet?.balance || 0).toLocaleString('vi-VN')}đ
                                </span>
                              </div>
                              <p className="text-[11px] font-semibold text-gray-500">Trừ trực tiếp số dư ví</p>
                            </div>
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${phuongThuc === 'VI_DIEN_TU' ? 'border-[#c41230] bg-[#c41230] text-white' : 'border-gray-300'}`}>
                              {phuongThuc === 'VI_DIEN_TU' && <CheckIcon className="w-3 h-3 stroke-[3]" />}
                            </div>
                          </button>
                        )}

                        {/* COD / Cash */}
                        <button
                          type="button"
                          onClick={() => setPhuongThuc('THANH_TOAN_KHI_NHAN_HANG')}
                          className={`p-3.5 rounded-[16px] border text-left flex items-start justify-between transition-all cursor-pointer ${
                            phuongThuc === 'THANH_TOAN_KHI_NHAN_HANG'
                              ? 'border-[#c41230] bg-[#c41230]/5 ring-2 ring-[#c41230]/20 shadow-xs'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="space-y-1">
                            <span className="text-xs font-black text-[#1a1a1a]">
                              {deliveryMode === 'GIAO_TAN_NOI' ? 'Tiền mặt COD' : 'Thanh toán tại quầy'}
                            </span>
                            <p className="text-[11px] font-semibold text-gray-500">
                              {deliveryMode === 'GIAO_TAN_NOI' ? 'Thanh toán cho shipper khi nhận' : 'Cà thẻ / tiền mặt tại quầy'}
                            </p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${phuongThuc === 'THANH_TOAN_KHI_NHAN_HANG' ? 'border-[#c41230] bg-[#c41230] text-white' : 'border-gray-300'}`}>
                            {phuongThuc === 'THANH_TOAN_KHI_NHAN_HANG' && <CheckIcon className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Cột phải: Order Summary Sticky Sidebar */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6 lg:sticky lg:top-24">
            <div className="bg-white rounded-[24px] p-6 md:p-8 border border-[#e8e2da] shadow-sm">
              <h2 className="text-lg font-black text-[#1a1a1a] uppercase mb-6 tracking-wide pb-4 border-b border-gray-100 font-serif">
                Tóm tắt đơn hàng
              </h2>

              <div className="space-y-4">
                {/* Tạm tính */}
                <div className="flex justify-between items-center text-sm font-semibold text-gray-600">
                  <span>Tạm tính ({cart.reduce((s, i) => s + i.so_luong, 0)} món)</span>
                  <span className="text-[#1a1a1a] font-extrabold">{total.toLocaleString('vi-VN')}đ</span>
                </div>

                {/* Giảm giá voucher */}
                {discountAmount > 0 ? (
                  <div className="flex justify-between items-center text-sm font-semibold text-red-600">
                    <span>Voucher giảm giá</span>
                    <span className="font-extrabold">-{discountAmount.toLocaleString('vi-VN')}đ</span>
                  </div>
                ) : (
                  <div className="flex justify-between items-center text-sm font-semibold text-gray-500">
                    <span>Voucher giảm giá</span>
                    <span className="text-[#1a1a1a] font-extrabold">0đ</span>
                  </div>
                )}

                {/* Phí giao hàng */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-sm font-semibold text-gray-600">
                    <span>Phí giao hàng</span>
                    {deliveryMode !== 'GIAO_TAN_NOI' ? (
                      <span className="text-emerald-600 font-extrabold">Miễn phí</span>
                    ) : (
                      <div className="text-right flex items-center gap-2">
                        {giamPhiShipHanh > 0 && (
                          <span className="text-xs font-semibold text-gray-400 line-through">
                            {phiGiaoHangGoc.toLocaleString('vi-VN')}đ
                          </span>
                        )}
                        {phiGiaoHangThucTe === 0 ? (
                          <span className="text-emerald-600 font-extrabold">Miễn phí</span>
                        ) : (
                          <span className="text-[#1a1a1a] font-extrabold">{phiGiaoHangThucTe.toLocaleString('vi-VN')}đ</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Freeship privilege badge */}
                  {deliveryMode === 'GIAO_TAN_NOI' && (
                    isFreeshipEligible ? (
                      <p className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 mt-1 flex items-center justify-between">
                        <span>Đã áp dụng Freeship hạng {memberTierName}</span>
                        <span>-{giamPhiShipHanh.toLocaleString('vi-VN')}đ</span>
                      </p>
                    ) : (
                      memberFreeshipVal > 0 && memberFreeshipMinOrder > total && (
                        <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 mt-1">
                          Mua thêm {(memberFreeshipMinOrder - total).toLocaleString('vi-VN')}đ để tự động Freeship {memberFreeshipVal.toLocaleString('vi-VN')}đ hạng {memberTierName}
                        </p>
                      )
                    )
                  )}
                </div>

                <div className="h-px bg-gray-100 my-4" />

                {/* Tổng cộng */}
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-sm font-black text-[#1a1a1a] uppercase block">Tổng thanh toán</span>
                    <span className="text-[11px] text-gray-400 font-semibold">(Đã bao gồm VAT & phí)</span>
                  </div>
                  <div className="text-right">
                    {discountAmount > 0 && (
                      <p className="text-xs font-semibold text-gray-400 line-through">
                        {total.toLocaleString('vi-VN')}đ
                      </p>
                    )}
                    <span className="text-2xl sm:text-3xl font-black text-[#c41230] tracking-tight">
                      {tongTienSauGiam.toLocaleString('vi-VN')}đ
                    </span>
                  </div>
                </div>
              </div>

              {/* Promo code field */}
              <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
                {voucherResult ? (
                  <div className="flex items-center justify-between gap-3 p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-emerald-800 uppercase tracking-wide truncate">
                          {voucherResult.ma_voucher || voucherResult.ma_khuyen_mai}
                        </span>
                        <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Đã áp dụng</span>
                      </div>
                      <p className="text-[11px] font-bold text-emerald-700 truncate mt-0.5">
                        Tiết kiệm {discountAmount.toLocaleString('vi-VN')}đ cho đơn hàng
                      </p>
                    </div>
                    <button 
                      type="button" 
                      onClick={xoaVoucher} 
                      className="rounded-xl bg-white px-3 py-1.5 text-xs font-black text-red-500 border border-red-200 shadow-xs shrink-0 hover:bg-red-50 transition-colors"
                    >
                      Bỏ dùng
                    </button>
                  </div>
                ) : (
                  <div className="relative flex items-center bg-[#faf7f4] rounded-full border border-gray-200 pr-1 pl-4 h-[48px] overflow-hidden focus-within:border-[#c41230] focus-within:ring-2 focus-within:ring-[#c41230]/20 transition-all">
                    <TagIcon className="h-5 w-5 text-gray-400 shrink-0 mr-2" />
                    <input
                      value={voucherCode}
                      onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setVoucherError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && apDungVoucher()}
                      className="flex-1 h-full bg-transparent border-none outline-none text-xs sm:text-sm font-semibold uppercase text-gray-800 placeholder-gray-400"
                      placeholder="MÃ GIẢM GIÁ"
                    />
                    <button
                      type="button"
                      onClick={apDungVoucher}
                      disabled={isCheckingVoucher}
                      className="rounded-full bg-[#1a1a1a] hover:bg-[#c41230] text-white font-black text-xs uppercase px-5 h-[38px] flex items-center justify-center shrink-0 transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
                    >
                      {isCheckingVoucher ? '...' : 'Áp dụng'}
                    </button>
                  </div>
                )}
                {voucherError ? (
                  <p className="text-xs font-semibold text-red-600 pl-1">{voucherError}</p>
                ) : null}
              </div>

              {/* MÃ GIẢM GIÁ KHẢ DỤNG - TICKET STUB CARDS DESIGN */}
              <div className="mt-6">
                <div className="flex justify-between items-center mb-3 px-1">
                  <h2 className="text-xs font-black uppercase text-gray-700 tracking-wider">
                    Mã giảm giá dành cho bạn
                  </h2>
                </div>
                
                {(!voucherItems || voucherItems.length === 0) ? (
                  <div className="text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-xs text-gray-500 italic">Không có mã giảm giá khả dụng</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Nhóm 1: Voucher cá nhân */}
                    {personalVouchers.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 px-0.5">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-800">Dành riêng cho bạn</span>
                        </div>
                        {personalVouchers.map((v) => {
                          const code = v.ma_khuyen_mai || v.ma_voucher || v.code;
                          const type = String(v.loai_khuyen_mai || v.loai_giam_gia || v.loai || '').toUpperCase();
                          const isPercent = type.includes('PERCENT');
                          const rawVal = Number(v.gia_tri || v.val || 0);
                          const valueText = isPercent ? `${rawVal}%` : (rawVal >= 1000 ? `${Math.round(rawVal / 1000)}K` : `${rawVal || 10}K`);
                          
                          let badgeLabel = `GIẢM ${valueText}`;
                          if (type.includes('FREE_ITEM') || String(code).toUpperCase().includes('TOPPING') || String(v.ten_khuyen_mai).toUpperCase().includes('TOPPING')) {
                            badgeLabel = 'FREE TOPPING';
                          }

                          return (
                            <div 
                              key={code} 
                              className="relative flex bg-gradient-to-r from-amber-50/80 to-amber-100/50 border border-amber-200 rounded-[16px] overflow-hidden shadow-xs hover:shadow-md hover:border-amber-400 transition-all cursor-pointer group" 
                              onClick={() => { setVoucherCode(code); apDungVoucher(code); }}
                            >
                              {/* Left Badge */}
                              <div className="w-18 bg-amber-500 text-white p-2.5 flex flex-col items-center justify-center shrink-0 text-center relative border-r border-dashed border-amber-300">
                                <span className="text-[10px] font-black tracking-wider uppercase leading-tight">{badgeLabel}</span>
                              </div>
                              
                              {/* Content */}
                              <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="px-2 py-0.5 bg-amber-200/80 text-amber-900 text-[10px] font-black rounded uppercase tracking-wider">{code}</span>
                                </div>
                                <h5 className="text-xs font-extrabold text-gray-900 truncate leading-snug">{v.ten_khuyen_mai || v.mo_ta || `Voucher quà tặng`}</h5>
                                <p className="text-[10px] font-semibold text-amber-800 mt-0.5">
                                  {v.ngay_ket_thuc || v.han_su_dung ? `HSD: ${new Date(v.ngay_ket_thuc || v.han_su_dung).toLocaleDateString('vi-VN')}` : 'Hạn sử dụng dài'}
                                </p>
                              </div>

                              {/* Button */}
                              <div className="pr-3 flex items-center justify-center shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setVoucherCode(code); apDungVoucher(code); }}
                                  className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] rounded-full shadow-xs transition-colors"
                                >
                                  Dùng
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Nhóm 2: Khuyến mãi chung */}
                    {publicVouchers.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 px-0.5">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-700">Khuyến mãi hệ thống</span>
                        </div>
                        {publicVouchers.map((v) => {
                          const code = v.ma_khuyen_mai || v.ma_voucher || v.code;
                          const type = String(v.loai_khuyen_mai || v.loai_giam_gia || v.loai || '').toUpperCase();
                          const isPercent = type.includes('PERCENT');
                          const rawVal = Number(v.gia_tri || v.val || 0);
                          const valueText = isPercent ? `${rawVal}%` : (rawVal >= 1000 ? `${Math.round(rawVal / 1000)}K` : `${rawVal || 10}K`);
                          
                          let badgeLabel = `GIẢM ${valueText}`;
                          if (type.includes('FREE_ITEM') || String(code).toUpperCase().includes('TOPPING') || String(v.ten_khuyen_mai).toUpperCase().includes('TOPPING')) {
                            badgeLabel = 'FREE TOPPING';
                          }

                          return (
                            <div 
                              key={code} 
                              className="relative flex bg-white border border-[#f5cbb8] rounded-[16px] overflow-hidden shadow-xs hover:shadow-md hover:border-[#e15923] transition-all cursor-pointer group" 
                              onClick={() => { setVoucherCode(code); apDungVoucher(code); }}
                            >
                              {/* Left Badge */}
                              <div className="w-18 bg-[#fff6f0] text-[#e15923] p-2.5 flex flex-col items-center justify-center shrink-0 text-center relative border-r border-dashed border-[#fcdbc7]">
                                <span className="text-[10px] font-black tracking-wider uppercase leading-tight">{badgeLabel}</span>
                              </div>
                              
                              {/* Content */}
                              <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="px-2 py-0.5 bg-[#feeee3] text-[#e15923] text-[10px] font-black rounded uppercase tracking-wider">{code}</span>
                                </div>
                                <h5 className="text-xs font-extrabold text-[#282828] truncate leading-snug">{v.ten_khuyen_mai || v.mo_ta || `Giảm ${valueText}`}</h5>
                                <p className="text-[10px] font-semibold text-gray-500 mt-0.5">
                                  {v.ngay_ket_thuc || v.han_su_dung ? `HSD: ${new Date(v.ngay_ket_thuc || v.han_su_dung).toLocaleDateString('vi-VN')}` : 'Không giới hạn'}
                                </p>
                              </div>

                              {/* Button */}
                              <div className="pr-3 flex items-center justify-center shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setVoucherCode(code); apDungVoucher(code); }}
                                  className="px-3 py-1 bg-[#e15923] hover:bg-[#c44919] text-white font-extrabold text-[11px] rounded-full shadow-xs transition-colors"
                                >
                                  Dùng
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Checkout Button */}
              {step === 1 ? (
                <button
                  type="button"
                  onClick={handleCheckoutClick}
                  disabled={isAnyItemOutOfStock || cart.length === 0}
                  className="w-full mt-6 py-4 bg-[#1a1a1a] hover:bg-[#c41230] text-white rounded-full font-black uppercase text-xs sm:text-sm tracking-widest shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Tiến hành thanh toán</span>
                  <ArrowLongRightIcon className="h-5 w-5 stroke-[2.5]" />
                </button>
              ) : (
                <>
                  {isAnyItemOutOfStock && (
                    <p className="mt-4 text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100 text-center">
                      Có món trong giỏ hàng đã hết hàng tại chi nhánh này. Vui lòng kiểm tra lại giỏ hàng!
                    </p>
                  )}
                  <button
                    onClick={khoiTaoThanhToan}
                    disabled={khoiTaoThanhToanMutation.isPending || isAnyItemOutOfStock}
                    className="w-full mt-6 py-4 bg-[#c41230] hover:bg-[#a30f28] text-white rounded-full font-black uppercase text-xs sm:text-sm tracking-widest shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {khoiTaoThanhToanMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Đang tạo đơn hàng...</span>
                      </>
                    ) : (
                      <>
                        <span>Xác nhận &amp; Đặt hàng</span>
                        <CheckIcon className="w-5 h-5 stroke-[3]" />
                      </>
                    )}
                  </button>
                </>
              )}

              {/* Error messages */}
              {thongBao && (
                <div className={`mt-4 p-3.5 rounded-2xl text-xs font-bold text-center border ${
                  thongBao.includes('thành công') 
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                    : 'bg-red-50 text-red-700 border-red-200'
                }`}>
                  {thongBao}
                </div>
              )}
            </div>

            {/* Dynamic QR Code panel (Step 2 only) */}
            {step === 2 && qrData ? (
              <div className="bg-white rounded-[24px] p-6 border border-[#e8e2da] shadow-md text-center animate-in fade-in duration-300 space-y-4">
                <h3 className="text-sm font-black text-[#1a1a1a] uppercase tracking-wide pb-2 border-b border-gray-100 font-serif">
                  Quét mã QR để thanh toán đơn hàng
                </h3>
                
                <div className="relative inline-block p-3 border border-gray-200 rounded-2xl bg-white shadow-inner">
                  <img
                    src={qrImageUrl || qrData.qr_img_url}
                    alt="QR ngân hàng"
                    className="w-48 h-48 mx-auto rounded-xl"
                    onError={() => {
                      if (qrData?.qr_fallback_url && qrImageUrl !== qrData.qr_fallback_url) {
                        setQrImageUrl(qrData.qr_fallback_url);
                      }
                    }}
                  />
                </div>

                <div className="text-left space-y-2 text-xs text-gray-600 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <p className="flex justify-between">
                    <span>Mã tham chiếu:</span> 
                    <span className="font-black text-gray-800">{qrData.ma_tham_chieu}</span>
                  </p>
                  <p className="flex justify-between">
                    <span>Số tiền cần chuyển:</span> 
                    <span className="font-black text-[#c41230] text-sm">{Number(qrData.so_tien).toLocaleString('vi-VN')}đ</span>
                  </p>
                </div>
                
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 py-2.5 px-3 rounded-xl border border-emerald-100">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Hệ thống đang tự động xác thực thanh toán qua Sepay...</span>
                </div>
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
