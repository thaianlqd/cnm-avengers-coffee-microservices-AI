import { checkoutDraft, savePendingCheckout, clearPendingCheckout } from '../../lib/pendingCheckout';
import { coordinates } from '../../lib/locationModel';
import { uiText as ui, useUiLanguage, uiLocale } from "../../lib/uiText";
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
} from '../../components/common/icons';
import { useCart } from '../../context/CartContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { queryKeys } from '../../lib/queryKeys';
import { buildAddressOptionsFromBranches, getAddressSelectionDefaults, normalizeAddressSelection } from '../../lib/addressOptions';
import CartEditModal from '../../components/modals/CartEditModal';
import { PencilIcon, CheckCircleIcon, StarIcon } from '../../components/common/iconsSolid';
import DeliveryModeSelector from '../../components/delivery/DeliveryModeSelector';
import DeliveryMethodPicker from '../../components/delivery/DeliveryMethodPicker';
import BranchSelector from '../../components/delivery/BranchSelector';
import AddressAutocompleteInput from '../../components/delivery/AddressAutocompleteInput';
import SmartCombobox from '../../components/common/SmartCombobox';
import NearbyBranchChecker from '../../components/delivery/NearbyBranchChecker';
import { evaluateBranchAvailability, inventoryRows } from '../../lib/branchAvailability';
import { deliveryRegionWarning, regionOf } from '../../lib/deliveryRegion';

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
    return { city: '', ward: '', street: '' };
  }

  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    const city = parts[parts.length - 1] || '';
    const ward = parts[parts.length - 2] || '';
    const street = parts.slice(0, parts.length - 2).join(', ');
    return { city, ward, street: street || raw };
  } else if (parts.length === 2) {
    const city = parts[1] || '';
    const street = parts[0] || '';
    return { city, ward: '', street: street || raw };
  }

  return { city: '', ward: '', street: raw };
}

export default function CartPage({
  products = [],
  onBackToHome,
  voucherItems: initialVouchers = [],
  suggestedPastries = [],
  onAddToCart,
  onLogin
}) {
  useUiLanguage();
  const { cart, cartWritePending, removeFromCart, updateCartQuantity, activeUserId, refreshCart } = useCart();
  const [editingItem, setEditingItem] = useState(null);
  const queryClient = useQueryClient();

  const draft = typeof window !== 'undefined' ? checkoutDraft() : {};
  const [deliveryMode, setDeliveryMode] = useState(() => {
    const storedTableId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('qr_tableId') : null;
    return storedTableId ? 'DUNG_TAI_CHO' : draft?.deliveryMode || null;
  });
  const [selectedBranch, setSelectedBranch] = useState(() => {
    const storedStoreId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('qr_storeId') : null;
    return storedStoreId || draft?.selectedBranch || '';
  });
  const checkoutRequestRef = useRef(null);
  const checkoutBusyRef = useRef(false);
  const handleDeliveryModeChange = (mode) => {
    if (mode !== deliveryMode) setSelectedBranch('');
    setDeliveryMode(mode);
  };

  const { data: kioskPrices, isFetching: isLoadingKioskPrices, error: kioskPricesError } = useQuery({
    queryKey: ['kiosk-prices', selectedBranch],
    queryFn: async () => {
      const response = await apiClient.get(`/orders/kiosk-prices?ma_kiosk=${selectedBranch}`);
      const items = response.data?.items || [];
      const priceMap = {};
      items.forEach(i => { priceMap[i.ma_san_pham] = i.gia_kiosk; });
      return priceMap;
    },
    enabled: deliveryMode === 'KIOSK' && Boolean(selectedBranch),
    staleTime: 60 * 1000,
  });

  const displayCart = useMemo(() => {
    if (deliveryMode === 'KIOSK') {
      return cart.map(item => ({
        ...item,
        gia_ban: Number.isFinite(Number(kioskPrices?.[item.ma_san_pham]))
          ? Number(kioskPrices[item.ma_san_pham]) : item.gia_ban
      }));
    }
    return cart;
  }, [cart, deliveryMode, kioskPrices]);

  const total = displayCart.reduce((sum, i) => sum + i.gia_ban * i.so_luong, 0);
  const kioskPriceUnavailable = deliveryMode === 'KIOSK' && Boolean(selectedBranch) && (
    isLoadingKioskPrices || Boolean(kioskPricesError) || !kioskPrices ||
    cart.some(item => !Number.isFinite(Number(kioskPrices[item.ma_san_pham])))
  );

  const [deliveryMethod, setDeliveryMethod] = useState('INTERNAL');
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
  const [step, setStep] = useState(draft?.step === 2 ? 2 : 1);

  const { data: inventoryData } = useQuery({
    queryKey: ['inventory', selectedBranch],
    queryFn: async () => {
      const response = await apiClient.get(`/inventory/items?branch_code=${selectedBranch}`);
      return response.data;
    },
    enabled: Boolean(selectedBranch),
    staleTime: 5 * 1000,
  });

  const selectedBranchAvailability = useMemo(() => evaluateBranchAvailability(
    cart, products, inventoryRows(inventoryData)), [cart, products, inventoryData]);
  const isAnyItemOutOfStock = ['LAY_TAI_QUAN', 'DUNG_TAI_CHO'].includes(deliveryMode) && selectedBranch
    && !selectedBranchAvailability.is_fully_available;

  const { data: publicBranchPayload } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      const response = await apiClient.get('/users/branches/public');
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 120 * 1000,
  });

  const { data: publicKioskPayload } = useQuery({
    queryKey: ['public-kiosks'],
    queryFn: async () => {
      const response = await apiClient.get('/franchise/kiosk/public');
      const data = response.data;
      return Array.isArray(data) ? data : data?.data || data?.items || [];
    },
    enabled: deliveryMode === 'KIOSK',
    staleTime: 60 * 1000,
  });

  const availableLocations = useMemo(() => {
    if (deliveryMode === 'KIOSK') {
      return (publicKioskPayload || []).map((k) => ({
        ma_chi_nhanh: k.ma_kiosk || k.id,
        ten_chi_nhanh: k.ten_kiosk || 'Kiosk ' + (k.ma_kiosk || k.id),
        dia_chi: k.dia_chi,
        phuong_xa: k.phuong_xa,
        quan_huyen: k.quan_huyen,
        thanh_pho: k.thanh_pho,
        is_kiosk: true
      }));
    }
    return publicBranchPayload?.items || [];
  }, [deliveryMode, publicKioskPayload, publicBranchPayload]);

  const { data: vietnamProvinces } = useQuery({
    queryKey: ['vietnam-provinces'],
    queryFn: async () => {
      const res = await fetch('/provinces.json');
      return res.json();
    },
    staleTime: Infinity,
  });

  const addressOptions = useMemo(() => {
    // Ưu tiên sử dụng full Tỉnh Thành Việt Nam từ API để người dùng thoải mái nhập
    if (vietnamProvinces && Array.isArray(vietnamProvinces) && vietnamProvinces.length > 0) {
      const options = {};
      vietnamProvinces.forEach(p => {
        options[p.name] = p.wards ? p.wards.map(w => w.name) : [];
      });
      return options;
    }
    // Fallback: Lấy từ danh sách cửa hàng nếu API lỗi
    return buildAddressOptionsFromBranches(publicBranchPayload?.items || []);
  }, [vietnamProvinces, publicBranchPayload]);
  const defaultAddressSelection = useMemo(
    () => getAddressSelectionDefaults(addressOptions),
    [addressOptions],
  );

  const computedKhungGio = 'Giao ngay (15-30 phút)';

  const [phuongThuc, setPhuongThuc] = useState(draft?.phuongThuc || null);
  const [addressForm, setAddressForm] = useState(() => draft?.addressForm || { city: '', district: '', ward: '', street: '' });
  const [userCoordinates, setUserCoordinates] = useState(() => coordinates(draft?.userCoordinates));
  const selectedDeliveryBranch = useMemo(() => (publicBranchPayload?.items || []).find(branch =>
    String(branch.ma_chi_nhanh || branch.co_so_ma || branch.branch_code) === String(selectedBranch)
  ), [publicBranchPayload, selectedBranch]);
  const deliveryWarning = deliveryMode === 'GIAO_TAN_NOI'
    ? deliveryRegionWarning(addressForm.city, selectedDeliveryBranch, userCoordinates) : '';
  const suggestedDeliveryBranch = useMemo(() => {
    const city = regionOf(addressForm.city);
    if (!city || !deliveryWarning) return null;
    return (publicBranchPayload?.items || []).find(branch => regionOf(branch.thanh_pho || branch.dia_chi) === city) || null;
  }, [addressForm.city, deliveryWarning, publicBranchPayload]);
  const [stockValidation, setStockValidation] = useState({
    canOrder: false,
    hasCoordinates: false,
    hasNearbyBranch: true,
    reason: '',
    message: '',
    missingItems: [],
  });
  const [ghiChu, setGhiChu] = useState(draft?.ghiChu || '');
  const [thongBao, setThongBao] = useState('');
  const runCartWrite = async action => {
    try { await action(); }
    catch (error) { setThongBao(error?.response?.data?.message || ui('Chưa cập nhật được giỏ hàng. Vui lòng thử lại.')); }
  };

  const [qrData, setQrData] = useState(null);
  const [qrImageUrl, setQrImageUrl] = useState('');
  const [qrOrderId, setQrOrderId] = useState(null);
  const [qrPaidSuccess, setQrPaidSuccess] = useState(false);
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherResult, setVoucherResult] = useState(null);
  const [voucherError, setVoucherError] = useState('');
  const [isCheckingVoucher, setIsCheckingVoucher] = useState(false);
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmailTouched, setGuestEmailTouched] = useState(false);
  const [guestPhoneTouched, setGuestPhoneTouched] = useState(false);
  const [guestSessionId, setGuestSessionId] = useState('');

  const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  const isValidPhone = (phone) => {
    const clean = String(phone || '').trim().replace(/[\s.-]/g, '');
    return /^(0)(3|5|7|8|9)[0-9]{8}$/.test(clean) || /^0[0-9]{9}$/.test(clean);
  };

  const showEmailError = guestEmailTouched && (!guestEmail.trim() || !isValidEmail(guestEmail));
  const emailErrorMessage = !guestEmail.trim()
    ? 'Vui lòng nhập Email nhận đơn'
    : (!isValidEmail(guestEmail) ? 'Định dạng Email chưa chính xác' : '');

  const showPhoneError = guestPhoneTouched && (!guestPhone.trim() || !isValidPhone(guestPhone));
  const phoneErrorMessage = !guestPhone.trim()
    ? 'Vui lòng nhập Số điện thoại'
    : (!isValidPhone(guestPhone) ? 'Số điện thoại cần 10 số (bắt đầu bằng 0)' : '');

  const handleAddressSelect = useCallback((item) => {
    setUserCoordinates(coordinates(item));

    let resolvedCity = item.city || '';
    let resolvedWard = item.ward || '';
    let resolvedStreet = item.street || item.title || '';

    // Tìm thành phố phù hợp nhất trong danh sách addressOptions (provinces)
    const availableCities = Object.keys(addressOptions || {});
    if (resolvedCity && availableCities.length > 0) {
      const cleanRes = resolvedCity.toLowerCase().replace(/^(thành phố|tỉnh)\s+/i, '').trim();
      const matchCity = availableCities.find((c) => {
        const cleanC = c.toLowerCase().replace(/^(thành phố|tỉnh)\s+/i, '').trim();
        return cleanC === cleanRes;
      }) || availableCities.find((c) => {
        const cleanC = c.toLowerCase().replace(/^(thành phố|tỉnh)\s+/i, '').trim();
        return cleanC.includes(cleanRes) || cleanRes.includes(cleanC);
      });
      if (matchCity) {
        resolvedCity = matchCity;
      }
    }

    // Tìm phường/xã phù hợp nhất trong danh sách của thành phố đó
    if (resolvedCity && resolvedWard) {
      const availableWards = addressOptions[resolvedCity] || [];
      const cleanResW = resolvedWard.toLowerCase().replace(/^(phường|xã|thị trấn|p\.|x\.)\s*/i, '').trim();

      // 1. Ưu tiên khớp chính xác tuyệt đối tên phường (tránh nhầm lẫn 'An Phú' với 'An Phú Đông', 'Tân Phú' với 'Tân Phú Trung')
      let matchWard = availableWards.find((w) => {
        const cleanW = w.toLowerCase().replace(/^(phường|xã|thị trấn|p\.|x\.)\s*/i, '').trim();
        return cleanW === cleanResW;
      });

      // 2. Nếu không có khớp chính xác, tìm theo tiền tố nguyên từ
      if (!matchWard) {
        matchWard = availableWards.find((w) => {
          const cleanW = w.toLowerCase().replace(/^(phường|xã|thị trấn|p\.|x\.)\s*/i, '').trim();
          return cleanW.startsWith(cleanResW + ' ') || cleanResW.startsWith(cleanW + ' ');
        });
      }

      if (matchWard) {
        resolvedWard = matchWard;
      }
    }

    setAddressForm((prev) => ({
      ...prev,
      city: resolvedCity || prev.city,
      district: item.district || '',
      ward: resolvedWard || prev.ward,
      street: resolvedStreet || prev.street,
    }));
    setThongBao('');
  }, [addressOptions]);

  const maNguoiDung = useMemo(() => activeUserId || 'anonymous', [activeUserId]);
  const isLoggedInUser = useMemo(() => {
    const value = String(maNguoiDung || '');
    if (!value || value.startsWith('anon-') || value === 'anonymous') return false;
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return true;
    return Boolean(localStorage.getItem('token') || value === 'user');
  }, [maNguoiDung]);

  useEffect(() => {
    if (isLoggedInUser) return;
    let gsid = localStorage.getItem('avengers_guest_session_id');
    if (!gsid) {
      gsid = `gsid_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
      localStorage.setItem('avengers_guest_session_id', gsid);
    }
    setGuestSessionId(gsid);
  }, [isLoggedInUser]);

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
    if (step !== 2 || deliveryMode !== 'GIAO_TAN_NOI') return 0;
    if (deliveryMethod === 'LALAMOVE') return 25000;
    return 15000;
  }, [step, deliveryMode, deliveryMethod]);

  const memberTierName = memData?.hang_hien_tai?.hang || 'Thành viên';
  const memberFreeshipVal = Number(memData?.quyen_loi_hien_tai?.freeship_value || 0);
  const memberFreeshipMinOrder = Number(memData?.quyen_loi_hien_tai?.freeship_min_order || 0);

  const isFreeshipEligible = useMemo(() => {
    if (step !== 2 || deliveryMode !== 'GIAO_TAN_NOI') return false;
    if (memberFreeshipVal <= 0) return false;
    if (memberFreeshipMinOrder > 0 && total < memberFreeshipMinOrder) return false;
    return true;
  }, [step, deliveryMode, memberFreeshipVal, memberFreeshipMinOrder, total]);

  const quoteMode = step === 2 ? deliveryMode : null;
  const { data: cartQuote, isFetching: isQuotingCart, error: cartQuoteError } = useQuery({
    queryKey: ['cart-checkout-quote', maNguoiDung, JSON.stringify(cart), voucherResult?.ma_voucher || voucherResult?.ma_khuyen_mai, quoteMode, deliveryMethod],
    queryFn: async () => {
      const response = await apiClient.post(`/cart/${maNguoiDung}/quote`, {
        voucher_code: voucherResult?.ma_voucher || voucherResult?.ma_khuyen_mai || undefined,
        delivery_mode: quoteMode || undefined,
        delivery_method: deliveryMethod,
      });
      return response.data;
    },
    enabled: Boolean(isLoggedInUser && cart.length && deliveryMode !== 'KIOSK'),
    retry: false,
  });
  const giamPhiShipHanh = cartQuote?.delivery_fee_discount ?? (isFreeshipEligible ? Math.min(phiGiaoHangGoc, memberFreeshipVal) : 0);
  const phiGiaoHangThucTe = step === 2 && deliveryMode === 'GIAO_TAN_NOI'
    ? (cartQuote?.delivery_fee ?? Math.max(0, phiGiaoHangGoc - giamPhiShipHanh)) : 0;
  const discountAmount = cartQuote?.discount_amount ?? (voucherResult?.so_tien_giam || 0);
  const tongTienSauGiamVoucher = Math.max(0, (cartQuote?.subtotal ?? total) - discountAmount);
  const tongTienSauGiam = cartQuote?.final_total ?? (tongTienSauGiamVoucher + phiGiaoHangThucTe);
  const cityOptions = useMemo(() => {
    const base = Object.keys(addressOptions || {});
    if (addressForm.city && !base.includes(addressForm.city)) {
      return [addressForm.city, ...base];
    }
    return base;
  }, [addressOptions, addressForm.city]);

  const wardOptions = useMemo(() => {
    const base = addressOptions[addressForm.city] || [];
    if (addressForm.ward && !base.includes(addressForm.ward)) {
      return [addressForm.ward, ...base];
    }
    return base;
  }, [addressForm.city, addressForm.ward, addressOptions]);

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
    if (voucherCode && cart && cart.length > 0) {
      apDungVoucher(voucherCode);
    } else {
      setVoucherResult(null);
      setVoucherError('');
    }
  }, [cart, total]);

  const apDungVoucher = async (overrideCode) => {
    if (!isLoggedInUser) { requestLogin(); return; }
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
    setVoucherResult(null);
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
    if (maNguoiDung) localStorage.removeItem(`avengers_ai_voucher_${maNguoiDung}`);
  };

  useEffect(() => {
    if (!maNguoiDung) return undefined;
    const applyFromChat = (event) => {
      const code = String(event?.detail?.code || '').trim().toUpperCase();
      if (code && cart?.length) {
        setVoucherCode(code);
        apDungVoucher(code);
      }
    };
    const removeFromChat = () => {
      setVoucherCode('');
      setVoucherResult(null);
      setVoucherError('');
    };
    window.addEventListener('ai-voucher-applied', applyFromChat);
    window.addEventListener('ai-voucher-removed', removeFromChat);
    return () => {
      window.removeEventListener('ai-voucher-applied', applyFromChat);
      window.removeEventListener('ai-voucher-removed', removeFromChat);
    };
  }, [maNguoiDung, cart?.length, total]);


  useEffect(() => {
    if (!defaultAddress || addressForm.street?.trim()) return;
    const parts = defaultAddress.dia_chi_cau_truc || tachDiaChiDayDu(defaultAddress.dia_chi_day_du);
    setAddressForm({ city: parts.city || defaultAddress.thanh_pho || '', district: parts.district || '',
      ward: parts.ward || '', street: parts.street || defaultAddress.dia_chi_day_du || '', savedAddressId: defaultAddress.id });
    setUserCoordinates(coordinates(defaultAddress));
  }, [defaultAddress]);

  useEffect(() => {
    if (publicBranchPayload?.items?.length > 0) {
      const allBranches = publicBranchPayload.items;

      // Lọc các chi nhánh cùng Thành phố với địa chỉ giao hàng
      const cityMatches = allBranches.filter(b => {
        const bCity = String(b.thanh_pho || b.dia_chi || '').toLowerCase();
        const userCity = String(addressForm.city || '').toLowerCase();
        if (!userCity) return false;

        if (bCity.includes(userCity)) return true;

        // Smarter matching for HCM and HN
        if ((userCity.includes('hồ chí minh') || userCity.includes('hcm')) &&
            (bCity.includes('hồ chí minh') || bCity.includes('hcm'))) {
          return true;
        }

        if ((userCity.includes('hà nội') || userCity.includes('ha noi')) &&
            (bCity.includes('hà nội') || bCity.includes('hn') || bCity.includes('ha noi'))) {
          return true;
        }

        return false;
      });

      // Nếu có chi nhánh cùng quận/huyện thì ưu tiên (nếu sau này có dữ liệu quận)
      let targetBranch = cityMatches.length > 0 ? cityMatches[0] : allBranches[0];

      if (cityMatches.length > 1 && addressForm.district) {
        const districtCoords = {
          'bình tân': { lat: 10.7653, lng: 106.6083 },
          'bình thạnh': { lat: 10.8106, lng: 106.7093 },
          'gò vấp': { lat: 10.8387, lng: 106.6661 },
          'phú nhuận': { lat: 10.7991, lng: 106.6781 },
          'tân bình': { lat: 10.8015, lng: 106.6526 },
          'tân phú': { lat: 10.7901, lng: 106.6262 },
          'thủ đức': { lat: 10.8494, lng: 106.7537 },
          'quận 1': { lat: 10.7756, lng: 106.7019 },
          'quận 2': { lat: 10.7876, lng: 106.7416 },
          'quận 3': { lat: 10.7834, lng: 106.6802 },
          'quận 4': { lat: 10.7588, lng: 106.7012 },
          'quận 5': { lat: 10.7540, lng: 106.6631 },
          'quận 6': { lat: 10.7481, lng: 106.6353 },
          'quận 7': { lat: 10.7340, lng: 106.7216 },
          'quận 8': { lat: 10.7249, lng: 106.6346 },
          'quận 9': { lat: 10.8277, lng: 106.8123 },
          'quận 10': { lat: 10.7743, lng: 106.6675 },
          'quận 11': { lat: 10.7628, lng: 106.6455 },
          'quận 12': { lat: 10.8671, lng: 106.6413 },
        };

        const haversine = (lat1, lon1, lat2, lon2) => {
          const p = 0.017453292519943295;
          const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 +
            Math.cos(lat1 * p) * Math.cos(lat2 * p) *
            (1 - Math.cos((lon2 - lon1) * p)) / 2;
          return 12742 * Math.asin(Math.sqrt(a));
        };

        const userDistKey = String(addressForm.district).toLowerCase().trim();
        let userCoord = null;
        for (const key of Object.keys(districtCoords)) {
          if (userDistKey.includes(key)) userCoord = districtCoords[key];
        }

        if (userCoord) {
          let minDist = Infinity;
          let bestBranch = targetBranch;
          for (const b of cityMatches) {
            const bAddr = String(b.dia_chi || '').toLowerCase();
            let bCoord = null;
            for (const key of Object.keys(districtCoords)) {
              if (bAddr.includes(key)) { bCoord = districtCoords[key]; break; }
            }
            if (bCoord) {
              const d = haversine(userCoord.lat, userCoord.lng, bCoord.lat, bCoord.lng);
              if (d < minDist) {
                minDist = d;
                bestBranch = b;
              }
            }
          }
          targetBranch = bestBranch;
        } else {
          // Fallback to string matching for nationwide districts without coordinates
          const exactMatch = cityMatches.find(b =>
            String(b.quan_huyen || '').toLowerCase() === userDistKey ||
            String(b.dia_chi || '').toLowerCase().includes(userDistKey)
          );
          if (exactMatch) {
            targetBranch = exactMatch;
          }
        }
      }

      const branchId = targetBranch.ma_chi_nhanh || targetBranch.co_so_ma || targetBranch.branch_code || '';

      // Tự động chuyển chi nhánh nếu chi nhánh hiện tại không nằm trong cùng thành phố
      // CHỈ ÁP DỤNG KHI GIAO TẬN NƠI
      if (deliveryMode === 'GIAO_TAN_NOI') {
        // Chỉ fallback theo thành phố nếu CHƯA có tọa độ GPS (khi đã có GPS thì NearbyBranchChecker tự chọn chi nhánh gần nhất)
        if (!userCoordinates) {
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
        }
      }
    }
  }, [publicBranchPayload, selectedBranch, addressForm.city, deliveryMode, userCoordinates]);

  const khoiTaoThanhToanMutation = useMutation({
    mutationFn: async () => {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const customerName = user.ho_ten || user.hoTen || user.ten_dang_nhap || user.username || undefined;
      const businessKey = JSON.stringify({
        customer: maNguoiDung, deliveryMode, deliveryMethod, selectedBranch, phuongThuc,
        address: deliveryMode === 'GIAO_TAN_NOI' ? diaChiDayDu : null,
        note: ghiChu.trim(), voucher: voucherResult?.ma_voucher || voucherResult?.ma_khuyen_mai
          || (!cart.length && checkoutRequestRef.current && !checkoutRequestRef.current.completed ? checkoutRequestRef.current.payload.ma_voucher : null) || null,
        table: deliveryMode === 'DUNG_TAI_CHO' ? tableNumber : null,
        email: isLoggedInUser ? (user.email || user.email_address) : guestEmail.trim(),
        phone: isLoggedInUser ? (user.so_dien_thoai || user.phone || user.sdt) : guestPhone.trim(),
        customerName, guestSessionId,
      });
      const cartKey = JSON.stringify(cart);
      const previous = checkoutRequestRef.current;
      if (previous && !previous.completed && (previous.businessKey !== businessKey || (cart.length && previous.cartKey !== cartKey))) {
        throw new Error('Đơn trước đã gửi nhưng chưa nhận được kết quả. Vui lòng kiểm tra đơn đó trước khi thay đổi thông tin checkout.');
      }
      if (previous && previous.businessKey === businessKey && (previous.cartKey === cartKey || (!previous.completed && !cart.length))) {
        const response = await apiClient.post(previous.path, previous.payload);
        previous.completed = true;
        return response.data;
      }

      let targetLat = userCoordinates?.lat ? Number(userCoordinates.lat) : undefined;
      let targetLng = userCoordinates?.lng ? Number(userCoordinates.lng) : undefined;

      // Nếu địa chỉ nhập tay chưa có tọa độ GPS, fallback về tọa độ chi nhánh được chọn để tính khoảng cách
      if (deliveryMode === 'GIAO_TAN_NOI' && (!targetLat || !targetLng)) {
        const branchMatch = (publicBranchPayload?.items || []).find(b => b.ma_chi_nhanh === selectedBranch);
        if (branchMatch?.vi_do && branchMatch?.kinh_do) {
          targetLat = Number(branchMatch.vi_do);
          targetLng = Number(branchMatch.kinh_do);
        }
      }


      const payload = {
        checkout_action_id: crypto.randomUUID(),
        phuong_thuc_giao: deliveryMode,
        expected_final_total: cartQuote?.final_total,
        phuong_thuc_thanh_toan: phuongThuc,
        khung_gio_giao: computedKhungGio,
        phi_giao_hang: deliveryMode === 'GIAO_TAN_NOI' ? phiGiaoHangThucTe : 0,
        dia_chi_giao_hang: deliveryMode === 'GIAO_TAN_NOI'
          ? diaChiDayDu
          : (deliveryMode === 'LAY_TAI_QUAN' ? 'Khách lấy tại quán' : (deliveryMode === 'KIOSK' ? 'Mua tại Kiosk' : 'Khách dùng tại chỗ')),
        ghi_chu: ghiChu.trim() || 'Dat tu web-customer',
        ma_voucher: voucherResult?.ma_voucher || voucherResult?.ma_khuyen_mai || undefined,
        delivery_mode: deliveryMode,
        delivery_method: deliveryMethod,
        destination_latitude: targetLat,
        destination_longitude: targetLng,
        branch_code: selectedBranch,
        ma_kiosk: deliveryMode === 'KIOSK' ? selectedBranch : undefined,
        table_number: deliveryMode === 'DUNG_TAI_CHO' ? tableNumber : undefined,
        guest_email: (isLoggedInUser ? (user.email || user.email_address || undefined) : guestEmail.trim()) || undefined,
        guest_phone: (isLoggedInUser ? (user.so_dien_thoai || user.phone || user.sdt || undefined) : guestPhone.trim()) || undefined,
        session_id: guestSessionId,
        ten_khach_hang: isLoggedInUser ? customerName : (guestEmail.trim() || guestPhone.trim() || undefined),
      };
      const request = { businessKey, cartKey, path: `/customers/${maNguoiDung}/thanh-toan/khoi-tao`, payload, completed: false };
      checkoutRequestRef.current = request;
      const response = await apiClient.post(request.path, request.payload);
      request.completed = true;
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
      setQrPaidSuccess(true);
      setThongBao('Thanh toán QR thành công. Đơn hàng đã được xác nhận.');
      queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
      triggerAiRecommendationRefresh();
      refreshCart();
      clearPendingCheckout();
      window.dispatchEvent(new CustomEvent('checkout-success', { detail: { orderId: qrOrderId } }));
    }
  }, [qrOrderStatus, queryClient, refreshCart, triggerAiRecommendationRefresh, qrOrderId]);

  const isQrPaid = qrPaidSuccess || qrOrderStatus?.trang_thai_thanh_toan === 'DA_THANH_TOAN';

  const requestLogin = (returnStep = step) => {
    savePendingCheckout({ cart, guestId: activeUserId, draft: { step: returnStep, deliveryMode, selectedBranch, phuongThuc, addressForm, userCoordinates, ghiChu } });
    if (onLogin) onLogin();
    else if (typeof window !== 'undefined' && window.location) {
      if (typeof window.location.assign === 'function') {
        window.location.assign('/?tab=login&redirect=cart');
      } else {
        window.location.href = '/?tab=login&redirect=cart';
      }
    }
  };

  const pendingCheckoutRetry = Boolean(checkoutRequestRef.current && !checkoutRequestRef.current.completed);
  const khoiTaoThanhToan = async () => {
    if (cartWritePending) return;
    if (!isLoggedInUser) { requestLogin(); return; }
    if (checkoutBusyRef.current) return;
    if (!deliveryMode || !phuongThuc) {
      setThongBao('Vui lòng chọn hình thức nhận hàng và phương thức thanh toán.');
      return;
    }
    if (!pendingCheckoutRetry && isLoggedInUser && deliveryMode !== 'KIOSK' && (isQuotingCart || cartQuoteError || !cartQuote)) {
      setThongBao('Chưa xác minh được tổng tiền từ Order Service. Vui lòng thử lại.');
      return;
    }
    if (!cart.length && !pendingCheckoutRetry) {
      setThongBao('Giỏ hàng đang trống. Vui lòng thêm sản phẩm trước khi thanh toán.');
      return;
    }
    if ((deliveryMode === 'LAY_TAI_QUAN' || deliveryMode === 'DUNG_TAI_CHO') && !selectedBranch) {
      setThongBao('Vui lòng chọn chi nhánh để nhận món trước khi thanh toán.');
      return;
    }
    if (deliveryMode === 'KIOSK' && (!selectedBranch || kioskPriceUnavailable)) {
      setThongBao(selectedBranch
        ? 'Kiosk này chưa có giá cho tất cả món trong giỏ. Vui lòng chọn món khác hoặc liên hệ kiosk.'
        : 'Vui lòng chọn kiosk trước khi thanh toán.');
      return;
    }
    if (deliveryWarning) {
      setThongBao(deliveryWarning);
      return;
    }

    if (!isLoggedInUser) {
      setGuestEmailTouched(true);
      setGuestPhoneTouched(true);

      const trimmedEmail = guestEmail.trim();
      const trimmedPhone = guestPhone.trim();

      if (!trimmedEmail && !trimmedPhone) {
        setThongBao('Vui lòng nhập đầy đủ cả Email và Số điện thoại để tiến hành đặt hàng.');
        return;
      }

      if (!trimmedEmail) {
        setThongBao('Vui lòng nhập Email nhận đơn.');
        return;
      }

      if (!isValidEmail(trimmedEmail)) {
        setThongBao('Địa chỉ Email không đúng định dạng. Ví dụ: nguyenvan@gmail.com');
        return;
      }

      if (!trimmedPhone) {
        setThongBao('Vui lòng nhập Số điện thoại liên hệ.');
        return;
      }

      if (!isValidPhone(trimmedPhone)) {
        setThongBao('Số điện thoại không hợp lệ. Vui lòng nhập đúng 10 số điện thoại di động.');
        return;
      }
    }

    if (deliveryMode === 'GIAO_TAN_NOI' && !pendingCheckoutRetry) {
      if (!stockValidation.canOrder) {
        setThongBao(stockValidation.message || 'Không thể đặt hàng do chi nhánh gần bạn đã hết món.');
        return;
      }

      if (!addressForm.city || !addressForm.ward || !addressForm.street?.trim()) {
        setThongBao('Vui lòng chọn thành phố, phường/xã và nhập số nhà/tên đường đầy đủ.');
        return;
      }

      if (diaChiDayDu.length < 8) {
        setThongBao('Địa chỉ giao hàng chưa đủ chi tiết. Vui lòng bổ sung số nhà và tên đường.');
        return;
      }
    }


    if (!pendingCheckoutRetry && deliveryMode !== 'KIOSK') {
      checkoutBusyRef.current = true;
      try {
        const [inventoryResponse, menuResponse] = await Promise.all([
          apiClient.get(`/inventory/items?branch_code=${selectedBranch}`),
          apiClient.get('/menu/san-pham'),
        ]);
        const availability = evaluateBranchAvailability(cart,
          Array.isArray(menuResponse.data) ? menuResponse.data : [], inventoryRows(inventoryResponse.data));
        if (!availability.is_fully_available) {
          checkoutBusyRef.current = false;
          setThongBao(availability.unverified_products.length
            ? 'Chưa xác minh được tình trạng món tại cửa hàng. Vui lòng thử lại.'
            : `Cửa hàng đang tạm ngưng: ${availability.unavailable_products.map(item => item.product_name).join(', ')}.`);
          return;
        }
      } catch {
        checkoutBusyRef.current = false;
        setThongBao('Chưa xác minh được tình trạng món tại cửa hàng. Vui lòng thử lại.');
        return;
      }
    }

    setThongBao('');
    setQrData(null);
    setQrImageUrl('');
    setQrOrderId(null);
    setQrPaidSuccess(false);

    try {
      checkoutBusyRef.current = true;
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

            if (isLoggedInUser) {
              setThongBao(
                deliveryMode === 'GIAO_TAN_NOI'
                  ? 'Đặt hàng thành công! Đơn hàng đã được lưu vào Lịch sử đơn hàng của bạn và sẽ thu tiền khi nhận hàng.'
                  : 'Đặt hàng thành công! Đơn hàng đã được lưu vào Lịch sử đơn hàng của bạn. Vui lòng thanh toán tại quầy khi nhận món.'
              );
            } else {
              const guestTrackingCode = data?.tracking_code;
              setThongBao(
                guestTrackingCode
                  ? `Đặt hàng thành công! Mã tra cứu của bạn là ${guestTrackingCode}. Quý khách vui lòng lưu lại mã này để theo dõi tiến độ tại trang Tra cứu đơn hàng.`
                  : 'Đặt hàng thành công! Đơn hàng của quý khách đã được hệ thống ghi nhận.'
              );
            }
            setTimeout(() => {
              queryClient.invalidateQueries({ queryKey: queryKeys.orderHistoryRoot });
              triggerAiRecommendationRefresh();
              refreshCart();
              const orderId = data?.order?.ma_don_hang || data?.payment_details?.ma_don_hang || '';
              clearPendingCheckout();
      window.dispatchEvent(new CustomEvent('checkout-success', { detail: { orderId } }));
              setGhiChu('');
              xoaVoucher();
            }, 0);
    } catch (error) {
      setThongBao(error?.response?.data?.message || error?.message || 'Có lỗi khi khởi tạo thanh toán');
      if (error?.response?.data?.checkout_not_created === true) {
        checkoutRequestRef.current = null;
        queryClient.invalidateQueries({ queryKey:['cart-checkout-quote', maNguoiDung] });
      }
    } finally {
      checkoutBusyRef.current = false;
    }
  };

  const handleCheckoutClick = () => {
    if (!isLoggedInUser) { requestLogin(2); return; }
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
        <nav className="text-[13px] font-bold  tracking-wider text-gray-400 mb-6 flex items-center gap-2">
          <button
            onClick={() => onBackToHome?.()}
            className="hover:text-[#c41230] transition-colors"
          >{ui("Trang chủ")}</button>
          <span className="text-gray-300">&gt;</span>
          <span className="text-gray-800">{step === 1 ? ui("Giỏ hàng") : ui("Thanh toán")}</span>
        </nav>

        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-semibold  text-[#1a1a1a] tracking-tight font-serif leading-none">
              {step === 1 ? ui("Giỏ hàng của bạn") : ui("Thông tin thanh toán")}
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-gray-500 mt-2">
              {step === 1
                ? ui("Bạn đang có {{v0}} món đồ uống & bánh trong giỏ", {v0:cart.reduce((s, i) => s + i.so_luong, 0)})
                : ui("Hoàn tất địa chỉ và chọn phương thức thanh toán phù hợp")}
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
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 shadow-sm ${
                step >= 1 ? 'bg-[#c41230] text-white ring-4 ring-[#c41230]/15' : 'bg-gray-100 text-gray-400'
              }`}>
                <ShoppingBagIcon className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className={`text-[11px] sm:text-xs font-semibold  tracking-wider ${step >= 1 ? 'text-[#c41230]' : 'text-gray-400'}`}>{ui("1. Giỏ hàng ")}{cart.length > 0 && `(${cart.reduce((sum, i) => sum + i.so_luong, 0)})`}
              </span>
            </button>

            {/* Step 2 */}
            <button
              type="button"
              onClick={handleCheckoutClick}
              disabled={cart.length === 0}
              className="flex flex-col items-center gap-2 relative z-10 group cursor-pointer disabled:cursor-not-allowed"
            >
              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-semibold text-sm transition-all duration-300 shadow-sm ${
                step >= 2 ? 'bg-[#c41230] text-white ring-4 ring-[#c41230]/15' : 'bg-gray-100 text-gray-400'
              }`}>
                <CreditCardIcon className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className={`text-[11px] sm:text-xs font-semibold  tracking-wider ${step >= 2 ? 'text-[#c41230]' : 'text-gray-400'}`}>{ui("2. Thanh toán")}</span>
            </button>

            {/* Step 3 */}
            <div className="flex flex-col items-center gap-2 relative z-10">
              <div className="w-11 h-11 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center font-semibold text-sm shadow-sm">
                <SparklesIcon className="w-5 h-5 stroke-[2.5]" />
              </div>
              <span className="text-[11px] sm:text-xs font-semibold  tracking-wider text-gray-400">{ui("3. Hoàn tất")}</span>
            </div>
          </div>
        </div>

        {/* FREESHIP & PRIVILEGE PROGRESS BAR */}
        {step === 2 && deliveryMode === 'GIAO_TAN_NOI' && (
          <div className="mb-8 bg-gradient-to-r from-red-50 via-white to-red-50 text-[#b22830] rounded-[24px] p-5 sm:p-6 shadow-xs border border-red-200/80 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-red-100/60 text-[#b22830] flex items-center justify-center shrink-0 border border-red-200 text-xs font-semibold tracking-wider ">
                  FREE
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs sm:text-sm font-semibold  tracking-wide text-red-950">{ui("Đặc quyền Freeship hạng ")}{memberTierName}
                    </h4>
                    <span className="text-[10px] font-semibold  px-2 py-0.5 bg-red-100 text-red-900 rounded-full border border-red-200/80">VIP</span>
                  </div>
                  <p className="text-xs font-semibold text-red-900/90 mt-1">
                    {isFreeshipEligible ? (
                      <span className="text-emerald-700 font-bold">{ui("Đã đủ điều kiện Freeship! Giảm ngay ")}{giamPhiShipHanh.toLocaleString(uiLocale())}{ui("đ phí giao hàng")}</span>
                    ) : memberFreeshipMinOrder > total ? (
                      <span>{ui("Mua thêm ")}<strong className="text-[#c41230] font-semibold">{(memberFreeshipMinOrder - total).toLocaleString(uiLocale())}{ui("đ")}</strong>{ui(" để được giảm ngay ")}<strong className="text-emerald-700 font-semibold">{memberFreeshipVal.toLocaleString(uiLocale())}{ui("đ")}</strong>{ui(" phí ship")}</span>
                    ) : (
                      <span>{ui("Đơn từ ")}{memberFreeshipMinOrder.toLocaleString(uiLocale())}{ui("đ sẽ nhận ưu đãi Freeship ")}{memberFreeshipVal.toLocaleString(uiLocale())}{ui("đ")}</span>
                    )}
                  </p>
                </div>
              </div>
              {memberFreeshipMinOrder > 0 && (
                <div className="w-full sm:w-56 shrink-0 space-y-1.5 bg-white/80 p-3 rounded-2xl border border-amber-200/80 shadow-xs">
                  <div className="flex justify-between text-[11px] font-bold text-red-900">
                    <span>{ui("Tiến trình Freeship")}</span>
                    <span className="text-emerald-700 font-semibold">{Math.min(100, Math.round((total / memberFreeshipMinOrder) * 100))}%</span>
                  </div>
                  <div className="h-2.5 w-full bg-red-100 rounded-full overflow-hidden border border-red-200">
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
                    <h3 className="text-xl font-bold text-gray-800 font-serif">{ui("Giỏ hàng của bạn đang trống")}</h3>
                    <p className="text-gray-500 text-sm max-w-sm mx-auto">{ui("Hãy khám phá thực đơn cà phê thơm nồng & bánh tươi ra lò để lấp đầy giỏ hàng nhé!")}</p>
                    <button
                      onClick={() => onBackToHome?.()}
                      className="mt-2 px-8 py-3.5 bg-[#c41230] text-white font-semibold text-xs  tracking-widest rounded-full hover:bg-[#a30f28] transition-all shadow-md hover:shadow-lg"
                    >{ui("Khám phá Thực đơn")}</button>
                  </div>
                ) : (
                  cart.map((item, idx) => {
                    const isOutOfStock = deliveryMode !== 'GIAO_TAN_NOI' && selectedBranchAvailability.unavailable_products
                      .some(product => product.product_id === String(item.ma_san_pham));

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
                          <h4 className="font-semibold text-base sm:text-lg text-[#1a1a1a] leading-tight truncate">
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
                              <span className="px-2.5 py-0.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-full text-[11px]">{ui("Sữa: ")}{item.loai_sua}
                              </span>
                            )}
                            {item.luong_da && (
                              <span className="px-2.5 py-0.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-full text-[11px]">{ui("Đá: ")}{item.luong_da}
                              </span>
                            )}
                            {item.do_ngot && (
                              <span className="px-2.5 py-0.5 bg-gray-50 text-gray-700 border border-gray-200 rounded-full text-[11px]">{ui("Ngọt: ")}{item.do_ngot}
                              </span>
                            )}
                            {item.toppings && item.toppings.length > 0 && (
                              <span className="px-2.5 py-0.5 bg-red-50 text-red-900 border border-red-200/80 rounded-full text-[11px]">
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
                            className="mt-2 inline-flex items-center gap-1.5 text-[#b22830] font-semibold text-xs hover:underline w-fit bg-[#b22830]/5 px-2.5 py-1 rounded-lg border border-[#b22830]/15"
                          >
                            <PencilIcon className="w-3.5 h-3.5" />{ui(" Chỉnh sửa tùy chọn")}</button>
                        </div>

                        {/* Giá tiền */}
                        <div className="mt-3">
                          <p className="text-[#1a1a1a] font-semibold text-xl">
                            {Number(item.gia_ban).toLocaleString(uiLocale())}{ui("đ")}</p>
                          {isOutOfStock && step === 2 && (
                            <div className="mt-1.5 text-[11px] font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100 inline-block">{ui("Tạm hết hàng tại chi nhánh này")}</div>
                          )}
                        </div>
                      </div>

                      {/* Bộ tăng giảm và nút Xóa xếp bên phải */}
                      <div className="w-full sm:w-auto sm:absolute sm:right-0 sm:top-0 sm:h-full flex sm:flex-col justify-between items-center sm:items-end py-1 mt-2 sm:mt-0 pt-3 sm:pt-1 border-t sm:border-t-0 border-gray-100">
                        {/* Nút xóa màu đỏ */}
                        <button
                          type="button"
                          disabled={cartWritePending}
                          onClick={() => runCartWrite(() => removeFromCart(item))}
                          className="text-gray-400 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50"
                          aria-label={ui("Xóa {{v0}}", {v0:item.ten_san_pham})}
                        >
                          <TrashIcon className="h-5 w-5 stroke-[2]" />
                        </button>

                        {/* Bộ tăng giảm hình kẹo dẻo màu trắng viền xám */}
                        <div className="flex items-center justify-between bg-[#faf7f4] border border-gray-200 rounded-full py-1.5 px-3 w-[100px] sm:w-[110px] shadow-xs select-none">
                          <button
                            type="button"
                            disabled={cartWritePending}
                            aria-label={ui("Giảm số lượng")}
                            onClick={() => runCartWrite(() => updateCartQuantity(item, -1))}
                            className="w-7 h-7 rounded-full bg-white text-gray-600 hover:text-[#c41230] font-semibold text-[15px] flex items-center justify-center shadow-xs transition-colors"
                          >
                            -
                          </button>
                          <span className="text-sm font-semibold text-gray-800">
                            {item.so_luong}
                          </span>
                          <button
                            type="button"
                            disabled={cartWritePending}
                            aria-label={ui("Tăng số lượng")}
                            onClick={() => runCartWrite(() => updateCartQuantity(item, 1))}
                            className="w-7 h-7 rounded-full bg-white text-gray-600 hover:text-[#c41230] font-semibold text-[15px] flex items-center justify-center shadow-xs transition-colors"
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
                      <h2 className="text-lg font-bold text-[#1a1a1a] tracking-wide">{ui("Gợi ý dùng kèm")}</h2>
                      <p className="text-xs text-gray-500 mt-0.5">{ui("Thêm bánh ngọt & đồ nhắm hợp khẩu vị cùng giỏ hàng")}</p>
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
                            <span className="text-xs font-semibold text-[#c41230]">
                              {Number(p.gia_ban || p.price || 0).toLocaleString(uiLocale())}{ui("đ")}</span>
                            <span className="px-3 py-1 bg-[#c41230] text-white text-[11px] font-semibold rounded-full flex items-center gap-1 hover:bg-[#a30f28] transition-colors shadow-xs">{ui("+ Thêm ❯")}</span>
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
                  <span>{ui("Quay lại sửa giỏ hàng")}</span>
                </button>

                <h2 className="text-xl font-semibold text-[#1a1a1a]  tracking-wide pb-4 border-b border-gray-100 font-serif">{ui("Thông tin giao hàng & Thanh toán")}</h2>

                <div className="mb-6">
                  <DeliveryModeSelector selectedMode={deliveryMode} onChange={handleDeliveryModeChange} />
                </div>

                {!deliveryMode && <p className="text-sm text-gray-600">{ui("Bạn chọn hình thức nhận hàng để tiếp tục nhé.")}</p>}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Cột trái form: Địa chỉ */}
                  <div className="space-y-4">
                    {deliveryMode === 'GIAO_TAN_NOI' && (
                      <div className="mb-6">
                        <DeliveryMethodPicker selectedMethod={deliveryMethod} onChange={setDeliveryMethod} lalamoveFee={25000} lalamoveLoading={false} />
                      </div>
                    )}

                    {!deliveryMode ? null : deliveryMode === 'GIAO_TAN_NOI' ? (
                      <>
                        <h3 className="text-xs font-semibold  text-[#c41230] tracking-widest">{ui("Địa chỉ giao hàng")}</h3>

                        {isLoggedInUser && savedAddresses.length ? (
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-500">{ui("Địa chỉ đã lưu")}</label>
                            <select
                              value={savedAddresses.find((item) => item.dia_chi_day_du === diaChiDayDu || String(item.id) === addressForm.savedAddressId)?.id || ''}
                              onChange={(e) => {
                                const selected = savedAddresses.find((item) => String(item.id) === e.target.value || item.dia_chi_day_du === e.target.value);
                                if (!selected) return;

                                let city = selected.dia_chi_cau_truc?.city || selected.thanh_pho || selected.city;
                                let ward = selected.dia_chi_cau_truc?.ward || selected.phuong_xa || selected.ward;
                                let street = selected.dia_chi_cau_truc?.street || selected.so_nha_ten_duong || selected.street;

                                if (!city || !ward || !street) {
                                  const parsed = tachDiaChiDayDu(selected.dia_chi_day_du);
                                  city = city || parsed.city;
                                  ward = ward || parsed.ward;
                                  street = street || parsed.street;
                                }

                                setAddressForm({
                                  city,
                                  ward,
                                  street,
                                  savedAddressId: selected.id,
                                });
                                setUserCoordinates(coordinates(selected));
                                if (selected.ghi_chu && !ghiChu.trim()) {
                                  setGhiChu(selected.ghi_chu);
                                }
                              }}
                              className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-[#c41230] focus:ring-2 focus:ring-[#c41230]/20 transition-all cursor-pointer"
                            >
                              <option value="">{ui("Chọn địa chỉ đã lưu")}</option>
                              {savedAddresses.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.ten_dia_chi || item.dia_chi_day_du}{item.mac_dinh ? ui(" (mặc định)") : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}

                        {/* Ô nhập Số nhà, tên đường thông minh (gợi ý dropdown bản đồ + nút lấy GPS) */}
                        <AddressAutocompleteInput
                          label={ui("Số nhà, tên đường / Địa chỉ nhận hàng")}
                          value={addressForm.street}
                          onChange={(street) => {
                            setUserCoordinates(null);
                            setAddressForm((prev) => ({ ...prev, street }));
                            if (thongBao) setThongBao('');
                          }}
                          onSelectAddress={handleAddressSelect}
                        />

                        {/* Chi tiết Tỉnh/Thành phố & Phường/Xã (Tự động điền khi chọn gợi ý hoặc gõ tìm kiếm) */}
                        <div className="grid grid-cols-1 gap-3">
                          {/* Thành phố */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-500">{ui("Tỉnh / Thành phố")}</label>
                            <SmartCombobox
                              options={cityOptions}
                              value={addressForm.city}
                              onChange={(nextCity) => {
                                setUserCoordinates(null);
                                setAddressForm((prev) => ({ ...prev, city: nextCity, ward: '' }));
                                if (thongBao) setThongBao('');
                              }}
                              placeholder={ui("Nhập hoặc chọn Tỉnh / TP...")}
                            />
                          </div>

                          {/* Phường / Xã */}
                          <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-bold text-gray-500">{ui("Phường / Xã")}</label>
                            <SmartCombobox
                              options={wardOptions}
                              value={addressForm.ward}
                              onChange={(nextWard) => {
                                setUserCoordinates(null);
                                setAddressForm((prev) => ({ ...prev, ward: nextWard }));
                                if (thongBao) setThongBao('');
                              }}
                              placeholder={addressForm.city ? ui("Nhập hoặc chọn Phường / Xã...") : ui("Chọn Tỉnh / TP trước")}
                              disabled={!addressForm.city}
                            />
                          </div>
                        </div>


                        {/* KIỂM TRA BÁN KÍNH 5KM VÀ TỒN KHO MÓN ĂN (CUỘN ĐỘC LẬP) */}
                        <NearbyBranchChecker
                          branches={publicBranchPayload?.items || []}
                          userCoordinates={userCoordinates}
                          cart={cart}
                          products={products}
                          selectedBranch={selectedBranch}
                          onSelectBranch={setSelectedBranch}
                          onStockStatusChange={setStockValidation}
                        />
                      </>
                    ) : (
                      <>
                        <h3 className="text-xs font-semibold  text-[#c41230] tracking-widest">{ui("Chọn cửa hàng nhận đồ")}</h3>
                        <BranchSelector
                          branches={availableLocations}
                          selectedBranch={selectedBranch}
                          onChange={setSelectedBranch}
                        />
                        {deliveryMode === 'DUNG_TAI_CHO' && (
                          <div className="flex flex-col gap-1.5 mt-4">
                            <label className="text-xs font-bold text-gray-500">{ui("Số bàn (không bắt buộc)")}</label>
                            <div className="relative">
                              <input
                                type="text"
                                value={tableNumber}
                                onChange={(e) => setTableNumber(e.target.value)}
                                placeholder={ui("Ví dụ: Bàn 12")}
                                className={`w-full rounded-xl border ${tableNumber ? 'border-emerald-600 bg-emerald-50/50 text-emerald-900' : 'border-gray-200 bg-white'} px-4 py-3 text-sm font-bold outline-none focus:border-[#c41230] transition-colors`}
                              />
                            </div>
                          </div>
                        )}
                        {deliveryMode === 'DUNG_TAI_CHO' && sessionStorage.getItem('qr_tableId') && tableNumber === sessionStorage.getItem('qr_tableId') && (
                          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900">
                            <span className="text-xl">📍</span>
                            <div>
                              <p className="text-xs font-bold  tracking-wider text-emerald-700">{ui("Đang phục vụ tại bàn")}</p>
                              <p className="text-xs font-semibold">{ui("Bạn đang ngồi tại ")}<strong>{ui("Bàn ")}{tableNumber}</strong>{ui(". Nhân viên sẽ mang nước ra tận bàn!")}</p>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Cột phải form: Thông tin liên hệ & Phương thức thanh toán */}
                  <div className="space-y-4">
                    {!isLoggedInUser && (
                      <div className="bg-gradient-to-br from-red-50/70 via-stone-50 to-amber-50/50 border border-red-200/80 rounded-2xl p-5 space-y-3.5 mb-2 shadow-sm">
                        <div className="flex items-start gap-3.5">
                          <div className="w-10 h-10 rounded-xl bg-[#c41230] text-white flex items-center justify-center shrink-0 shadow-md shadow-red-950/15">
                            <UserIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-gray-900">{ui("Yêu cầu đăng nhập để đặt hàng")}</h3>
                              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">{ui("Bắt buộc")}</span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                              {ui("Hệ thống chỉ hỗ trợ đặt hàng khi quý khách đã đăng nhập tài khoản để đảm bảo tích lũy điểm thưởng thành viên, lưu lịch sử đơn hàng và theo dõi lộ trình shipper.")}
                            </p>
                          </div>
                        </div>

                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => requestLogin()}
                            className="w-full py-2.5 px-4 rounded-xl bg-[#c41230] hover:bg-[#a30f28] text-white text-xs font-bold tracking-wide shadow-md shadow-red-950/10 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
                          >
                            <span>{ui("Đăng nhập hoặc Đăng ký tài khoản ngay")}</span>
                            <ArrowLongRightIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-gray-500">{ui("Ghi chú cho quầy pha chế / Shipper")}</label>
                      <textarea
                        value={ghiChu}
                        onChange={(e) => setGhiChu(e.target.value)}
                        rows={2}
                        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold outline-none focus:border-[#c41230] focus:ring-2 focus:ring-[#c41230]/20 resize-none transition-all"
                        placeholder={ui("Ví dụ: ít đá, ngọt vừa, giao trước 11h30...")}
                      />
                    </div>

                    {/* PAYMENT METHOD SELECTION CARDS GRID */}
                    <div className="space-y-2 pt-2">
                      <h3 className="text-xs font-semibold  text-[#c41230] tracking-widest">{ui("Phương thức thanh toán")}</h3>

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
                              <span className="text-xs font-semibold text-[#1a1a1a]">VNPAY</span>
                              <span className="text-[9px] font-semibold  tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">{ui("Thẻ / App")}</span>
                            </div>
                            <p className="text-[11px] font-semibold text-gray-500">{ui("ATM, Visa, QR Ngân Hàng")}</p>
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
                              <span className="text-xs font-semibold text-[#1a1a1a]">{ui("Ngân Hàng QR")}</span>
                              <span className="text-[9px] font-semibold  tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">VietQR</span>
                            </div>
                            <p className="text-[11px] font-semibold text-gray-500">{ui("Quét mã chuyển khoản tự động")}</p>
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
                                <span className="text-xs font-semibold text-[#1a1a1a]">{ui("Ví Avengers")}</span>
                                <span className="text-[9px] font-semibold text-[#b22830] bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                                  {Number(walletData?.wallet?.balance || 0).toLocaleString(uiLocale())}{ui("đ")}</span>
                              </div>
                              <p className="text-[11px] font-semibold text-gray-500">{ui("Trừ trực tiếp số dư ví")}</p>
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
                            <span className="text-xs font-semibold text-[#1a1a1a]">
                              {deliveryMode === 'GIAO_TAN_NOI' ? ui("Tiền mặt COD") : ui("Thanh toán tại quầy")}
                            </span>
                            <p className="text-[11px] font-semibold text-gray-500">
                              {deliveryMode === 'GIAO_TAN_NOI' ? ui("Thanh toán cho shipper khi nhận") : ui("Cà thẻ / tiền mặt tại quầy")}
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
              <h2 className="text-lg font-semibold text-[#1a1a1a]  mb-6 tracking-wide pb-4 border-b border-gray-100 font-serif">{ui("Tóm tắt đơn hàng")}</h2>

              <div className="space-y-4">
                {/* Tạm tính */}
                <div className="flex justify-between items-center text-sm font-semibold text-gray-600">
                  <span>{ui("Tạm tính (")}{cart.reduce((s, i) => s + i.so_luong, 0)}{ui(" món)")}</span>
                  <span className="text-[#1a1a1a] font-semibold">{(cartQuote?.subtotal ?? total).toLocaleString(uiLocale())}{ui("đ")}</span>
                </div>

                {/* Giảm giá voucher */}
                {discountAmount > 0 ? (
                  <div className="flex justify-between items-center text-sm font-semibold text-red-600">
                    <span>{ui("Voucher giảm giá")}</span>
                    <span className="font-semibold">-{discountAmount.toLocaleString(uiLocale())}{ui("đ")}</span>
                  </div>
                ) : (
                  <div className="flex justify-between items-center text-sm font-semibold text-gray-500">
                    <span>{ui("Voucher giảm giá")}</span>
                    <span className="text-[#1a1a1a] font-semibold">{ui("0đ")}</span>
                  </div>
                )}

                {/* Phí giao hàng chỉ thuộc checkout sau khi chọn hình thức nhận. */}
                {step === 2 && deliveryMode && <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-sm font-semibold text-gray-600">
                    <span>{ui("Phí giao hàng")}</span>
                    {deliveryMode !== 'GIAO_TAN_NOI' ? (
                      <span className="text-emerald-600 font-semibold">{ui("Miễn phí")}</span>
                    ) : (
                      <div className="text-right flex items-center gap-2">
                        {giamPhiShipHanh > 0 && (
                          <span className="text-xs font-semibold text-gray-400 line-through">
                            {phiGiaoHangGoc.toLocaleString(uiLocale())}{ui("đ")}</span>
                        )}
                        {phiGiaoHangThucTe === 0 ? (
                          <span className="text-emerald-600 font-semibold">{ui("Miễn phí")}</span>
                        ) : (
                          <span className="text-[#1a1a1a] font-semibold">{phiGiaoHangThucTe.toLocaleString(uiLocale())}{ui("đ")}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Freeship privilege badge */}
                  {deliveryMode === 'GIAO_TAN_NOI' && (
                    isFreeshipEligible ? (
                      <p className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 mt-1 flex items-center justify-between">
                        <span>{ui("Đã áp dụng Freeship hạng ")}{memberTierName}</span>
                        <span>-{giamPhiShipHanh.toLocaleString(uiLocale())}{ui("đ")}</span>
                      </p>
                    ) : (
                      memberFreeshipVal > 0 && memberFreeshipMinOrder > total && (
                        <p className="text-[11px] font-semibold text-[#b22830] bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 mt-1">{ui("Mua thêm ")}{(memberFreeshipMinOrder - total).toLocaleString(uiLocale())}{ui("đ để tự động Freeship ")}{memberFreeshipVal.toLocaleString(uiLocale())}{ui("đ hạng ")}{memberTierName}
                        </p>
                      )
                    )
                  )}
                </div>}

                <div className="h-px bg-gray-100 my-4" />

                {/* Tổng cộng */}
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-sm font-semibold text-[#1a1a1a]  block">{ui("Tổng thanh toán")}</span>
                    <span className="text-[11px] text-gray-400 font-semibold">{ui("(Đã bao gồm VAT & phí)")}</span>
                  </div>
                  <div className="text-right">
                    {discountAmount > 0 && (
                      <p className="text-xs font-semibold text-gray-400 line-through">
                        {total.toLocaleString(uiLocale())}{ui("đ")}</p>
                    )}
                    <span className="text-2xl sm:text-3xl font-semibold text-[#c41230] tracking-tight">
                      {tongTienSauGiam.toLocaleString(uiLocale())}{ui("đ")}</span>
                  </div>
                </div>
              </div>

              {/* Promo code field */}
              <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
                {voucherResult ? (
                  <div className="flex items-center justify-between gap-3 p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-emerald-800  tracking-wide truncate">
                          {voucherResult.ma_voucher || voucherResult.ma_khuyen_mai}
                        </span>
                        <span className="text-[9px] font-semibold  text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">{ui("Đã áp dụng")}</span>
                      </div>
                      <p className="text-[11px] font-bold text-emerald-700 truncate mt-0.5">{ui("Tiết kiệm ")}{discountAmount.toLocaleString(uiLocale())}{ui("đ cho đơn hàng")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={xoaVoucher}
                      className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-red-500 border border-red-200 shadow-xs shrink-0 hover:bg-red-50 transition-colors"
                    >{ui("Bỏ dùng")}</button>
                  </div>
                ) : (
                  <div className="relative flex items-center bg-[#faf7f4] rounded-full border border-gray-200 pr-1 pl-4 h-[48px] overflow-hidden focus-within:border-[#c41230] focus-within:ring-2 focus-within:ring-[#c41230]/20 transition-all">
                    <TagIcon className="h-5 w-5 text-gray-400 shrink-0 mr-2" />
                    <input
                      value={voucherCode}
                      onChange={(e) => { setVoucherCode(e.target.value.toUpperCase()); setVoucherError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && apDungVoucher()}
                      className="flex-1 h-full bg-transparent border-none outline-none text-xs sm:text-sm font-semibold  text-gray-800 placeholder-gray-400"
                      placeholder={ui("Mã giảm giá")}
                    />
                    <button
                      type="button"
                      onClick={apDungVoucher}
                      disabled={isCheckingVoucher}
                      className="rounded-full bg-[#1a1a1a] hover:bg-[#c41230] text-white font-semibold text-xs  px-5 h-[38px] flex items-center justify-center shrink-0 transition-colors disabled:opacity-60 cursor-pointer shadow-xs"
                    >
                      {isCheckingVoucher ? '...' : ui("Áp dụng")}
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
                  <h2 className="text-xs font-semibold  text-gray-700 tracking-wider">{ui("Mã giảm giá dành cho bạn")}</h2>
                </div>

                {(!voucherItems || voucherItems.length === 0) ? (
                  <div className="text-center py-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-xs text-gray-500 italic">{ui("Không có mã giảm giá khả dụng")}</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {/* Nhóm 1: Voucher cá nhân */}
                    {personalVouchers.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 px-0.5">
                          <span className="text-[11px] font-semibold  tracking-wider text-[#b22830]">{ui("Dành riêng cho bạn")}</span>
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
                              <div className="w-18 bg-[#b22830] text-white p-2.5 flex flex-col items-center justify-center shrink-0 text-center relative border-r border-dashed border-red-300">
                                <span className="text-[10px] font-semibold tracking-wider  leading-tight">{badgeLabel}</span>
                              </div>

                              {/* Content */}
                              <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="px-2 py-0.5 bg-red-100/80 text-[#b22830] text-[10px] font-semibold rounded  tracking-wider">{code}</span>
                                </div>
                                <h5 className="text-xs font-semibold text-gray-900 truncate leading-snug">{v.ten_khuyen_mai || v.mo_ta || ui("Voucher quà tặng", {})}</h5>
                                <p className="text-[10px] font-semibold text-[#b22830] mt-0.5">
                                  {v.ngay_ket_thuc || v.han_su_dung ? `HSD: ${new Date(v.ngay_ket_thuc || v.han_su_dung).toLocaleDateString(uiLocale())}` : ui("Hạn sử dụng dài")}
                                </p>
                              </div>

                              {/* Button */}
                              <div className="pr-3 flex items-center justify-center shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setVoucherCode(code); apDungVoucher(code); }}
                                  className="px-3 py-1 bg-[#b22830] hover:bg-[#8f1b23] text-white font-semibold text-[11px] rounded-full shadow-xs transition-colors"
                                >{ui("Dùng")}</button>
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
                          <span className="text-[11px] font-semibold  tracking-wider text-gray-700">{ui("Khuyến mãi hệ thống")}</span>
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
                                <span className="text-[10px] font-semibold tracking-wider  leading-tight">{badgeLabel}</span>
                              </div>

                              {/* Content */}
                              <div className="flex-1 p-3 flex flex-col justify-center min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className="px-2 py-0.5 bg-[#feeee3] text-[#e15923] text-[10px] font-semibold rounded  tracking-wider">{code}</span>
                                </div>
                                <h5 className="text-xs font-semibold text-[#282828] truncate leading-snug">{v.ten_khuyen_mai || v.mo_ta || ui("Giảm {{v0}}", {v0:valueText})}</h5>
                                <p className="text-[10px] font-semibold text-gray-500 mt-0.5">
                                  {v.ngay_ket_thuc || v.han_su_dung ? `HSD: ${new Date(v.ngay_ket_thuc || v.han_su_dung).toLocaleDateString(uiLocale())}` : ui("Không giới hạn")}
                                </p>
                              </div>

                              {/* Button */}
                              <div className="pr-3 flex items-center justify-center shrink-0">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setVoucherCode(code); apDungVoucher(code); }}
                                  className="px-3 py-1 bg-[#e15923] hover:bg-[#c44919] text-white font-semibold text-[11px] rounded-full shadow-xs transition-colors"
                                >{ui("Dùng")}</button>
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
                  disabled={cart.length === 0}
                  className="w-full mt-6 py-4 bg-[#1a1a1a] hover:bg-[#c41230] text-white rounded-full font-semibold  text-xs sm:text-sm tracking-widest shadow-md hover:shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{isLoggedInUser ? ui("Tiến hành thanh toán") : ui("Đăng nhập để thanh toán")}</span>
                  <ArrowLongRightIcon className="h-5 w-5 stroke-[2.5]" />
                </button>
              ) : (
                <>
                  {['LAY_TAI_QUAN', 'DUNG_TAI_CHO'].includes(deliveryMode) && selectedBranch
                    && selectedBranchAvailability.unverified_products.length > 0 && (
                    <p className="mt-4 text-xs text-amber-700">{ui("Chưa xác minh được tình trạng món tại cửa hàng. Vui lòng thử lại.")}</p>
                  )}
                  {deliveryMode === 'GIAO_TAN_NOI' && !stockValidation.canOrder && stockValidation.message && (
                    <div className="mt-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-center">
                      <p className="text-xs font-bold text-red-700">
                        {stockValidation.message}
                      </p>
                    </div>
                  )}
                  {deliveryWarning && <div role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
                    <p>{deliveryWarning}</p>
                    {suggestedDeliveryBranch && <button type="button" className="mt-2 underline underline-offset-4" onClick={() => setSelectedBranch(suggestedDeliveryBranch.ma_chi_nhanh || suggestedDeliveryBranch.co_so_ma || suggestedDeliveryBranch.branch_code)}>{ui(" Chọn ")}{suggestedDeliveryBranch.ten_chi_nhanh || suggestedDeliveryBranch.name}
                    </button>}
                  </div>}

                  {deliveryMode !== 'GIAO_TAN_NOI' && isAnyItemOutOfStock && (
                    <p className="mt-4 text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl border border-red-100 text-center">{ui("Có món trong giỏ hàng đã hết hàng tại chi nhánh này. Vui lòng kiểm tra lại giỏ hàng!")}</p>
                  )}

                  <button
                    onClick={khoiTaoThanhToan}
                    disabled={cartWritePending || Boolean(deliveryWarning) || !deliveryMode || !phuongThuc || ((deliveryMode === 'LAY_TAI_QUAN' || deliveryMode === 'DUNG_TAI_CHO') && !selectedBranch) || (deliveryMode === 'KIOSK' && (!selectedBranch || kioskPriceUnavailable)) || (!pendingCheckoutRetry && ((isLoggedInUser && deliveryMode !== 'KIOSK' && (isQuotingCart || cartQuoteError || !cartQuote)) || (deliveryMode !== 'GIAO_TAN_NOI' && isAnyItemOutOfStock) || (deliveryMode === 'GIAO_TAN_NOI' && !stockValidation.canOrder))) || khoiTaoThanhToanMutation.isPending}
                    className="w-full mt-6 py-4 bg-[#c41230] hover:bg-[#a30f28] text-white rounded-full font-semibold  text-xs sm:text-sm tracking-widest shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {khoiTaoThanhToanMutation.isPending ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>{ui("Đang tạo đơn hàng...")}</span>
                      </>
                    ) : (
                      <>
                        <span>
                          {!isLoggedInUser
                            ? ui("Đăng nhập để đặt hàng")
                            : pendingCheckoutRetry
                            ? ui("Thử lại đơn đã gửi")
                            : ui("Xác nhận & Đặt hàng")}
                        </span>
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
              isQrPaid ? (
                <div className="bg-gradient-to-b from-emerald-50 to-white rounded-[24px] p-6 border-2 border-emerald-500/50 shadow-xl text-center animate-in zoom-in-95 duration-400 space-y-4">
                  <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-emerald-200 ring-8 ring-emerald-100">
                    <CheckCircleIcon className="w-10 h-10" />
                  </div>

                  <div className="space-y-1">
                    <span className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-semibold tracking-wider  rounded-full">{ui("Giao dịch hoàn tất")}</span>
                    <h3 className="text-lg font-semibold text-emerald-900 tracking-tight">{ui("Thanh toán thành công!")}</h3>
                    <p className="text-xs text-gray-500 font-medium">{ui("Hệ thống đã nhận được tiền chuyển khoản SePay và tự động xác nhận đơn.")}</p>
                  </div>

                  <div className="text-left space-y-2.5 text-xs bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm">
                    <p className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-gray-500">{ui("Mã tham chiếu:")}</span>
                      <span className="font-semibold text-gray-800 font-mono tracking-wide">{qrData.ma_tham_chieu}</span>
                    </p>
                    <p className="flex justify-between items-center py-1 border-b border-gray-100">
                      <span className="text-gray-500">{ui("Số tiền đã nhận:")}</span>
                      <span className="font-semibold text-emerald-600 text-base">{Number(qrData.so_tien).toLocaleString(uiLocale())}{ui("đ")}</span>
                    </p>
                    <p className="flex justify-between items-center pt-1">
                      <span className="text-gray-500">{ui("Trạng thái đơn:")}</span>
                      <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>{ui("Đã xác nhận & Chờ pha chế")}</span>
                    </p>
                  </div>

                  <div className="pt-1 space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        window.location.href = '/?tab=history';
                      }}
                      className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white text-xs font-semibold  tracking-wider rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>{ui("Xem Lịch Sử Đơn Hàng")}</span>
                      <ArrowLongRightIcon className="w-4 h-4 stroke-[2.5]" />
                    </button>
                    <p className="text-[11px] text-gray-400">{ui("Đơn hàng đang được chuẩn bị tại chi nhánh")}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-[24px] p-6 border border-[#e8e2da] shadow-md text-center animate-in fade-in duration-300 space-y-4">
                  <h3 className="text-sm font-semibold text-[#1a1a1a]  tracking-wide pb-2 border-b border-gray-100 font-serif">{ui("Quét mã QR để thanh toán đơn hàng")}</h3>

                  <div className="relative inline-block p-3 border border-gray-200 rounded-2xl bg-white shadow-inner">
                    <img
                      src={qrImageUrl || qrData.qr_img_url}
                      alt={ui("QR ngân hàng")}
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
                      <span>{ui("Mã tham chiếu:")}</span>
                      <span className="font-semibold text-gray-800">{qrData.ma_tham_chieu}</span>
                    </p>
                    <p className="flex justify-between">
                      <span>{ui("Số tiền cần chuyển:")}</span>
                      <span className="font-semibold text-[#c41230] text-sm">{Number(qrData.so_tien).toLocaleString(uiLocale())}{ui("đ")}</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 py-2.5 px-3 rounded-xl border border-emerald-100">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>{ui("Hệ thống đang tự động xác thực thanh toán qua Sepay...")}</span>
                  </div>
                </div>
              )
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
