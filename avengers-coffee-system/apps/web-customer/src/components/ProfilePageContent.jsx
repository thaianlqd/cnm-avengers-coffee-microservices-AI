import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MyGiftCardsTab from './MyGiftCardsTab';
import { apiClient } from '../lib/apiClient';
import { queryKeys } from '../lib/queryKeys';
import { normalizeAddressSelection } from '../lib/addressOptions';
import MembershipPage from '../pages/Membership';
import LuckyWheelPage from '../pages/LuckyWheel';
import {
  UserIcon,
  ShoppingBagIcon,
  IdentificationIcon,
  GiftIcon,
  MapPinIcon,
  StarIcon as StarOutlineIcon,
  KeyIcon,
  EnvelopeIcon,
  PhoneIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckIcon,
  SparklesIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  CameraIcon,
  BookmarkIcon,
  ChevronRightIcon,
  HeartIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon, CheckBadgeIcon, HeartIcon as HeartSolidIcon } from '@heroicons/react/24/solid';
import { useCart } from '../context/CartContext';


const DEFAULT_ADDRESS_FORM = {
  tenDiaChi: '',
  city: '',
  district: '',
  ward: '',
  street: '',
  ghiChu: '',
};

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

export default function ProfilePageContent({
  user: profileUser,
  onUserUpdated: onProfileUpdated,
  addressOptions,
  defaultAddressSelection,
  isOrderHistoryOpen,
  setIsOrderHistoryOpen,
  onNavigate,
}) {
  const [activeTab, setActiveTab] = useState('profile');
  const [profileForm, setProfileForm] = useState({ hoTen: '', soDienThoai: '', avatarUrl: '', gioiTinh: 'Nam', ngaySinh: '' });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [addressForm, setAddressForm] = useState(() => ({
    ...DEFAULT_ADDRESS_FORM,
    ...defaultAddressSelection,
  }));
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [addressError, setAddressError] = useState('');
  const [editingAddressId, setEditingAddressId] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  const userId = profileUser?.ma_nguoi_dung || profileUser?.maNguoiDung || null;
  const queryClient = useQueryClient();
  const { addToCart, setIsCartOpen } = useCart();

  const {
    data: profile,
    isLoading,
    isError: profileIsError,
    error: profileError2,
  } = useQuery({
    queryKey: queryKeys.userProfile(userId),
    queryFn: async () => {
      const response = await apiClient.get(`/users/${userId}/profile`);
      return response.data;
    },
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  });

  const {
    data: addressPayload,
  } = useQuery({
    queryKey: queryKeys.userAddresses(userId),
    queryFn: async () => {
      const response = await apiClient.get(`/users/${userId}/addresses`);
      return response.data;
    },
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  });

  const {
    data: reviewHistoryPayload,
    isLoading: isReviewsLoading,
    isError: isReviewsError,
    error: reviewsError,
  } = useQuery({
    queryKey: queryKeys.userReviews(userId),
    queryFn: async () => {
      const response = await apiClient.get(`/customers/${userId}/reviews`);
      return response.data;
    },
    enabled: Boolean(userId) && activeTab === 'reviews',
    staleTime: 30 * 1000,
  });

  const { data: loyaltyData } = useQuery({
    queryKey: queryKeys.loyaltyByUser(userId),
    queryFn: async () => {
      const response = await apiClient.get(`/users/${userId}/loyalty`);
      return response.data;
    },
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
  });

  const { data: walletData, isLoading: isWalletLoading, refetch: refetchWallet } = useQuery({
    queryKey: ['userWallet', userId],
    queryFn: async () => {
      const response = await apiClient.get(`/customers/${userId}/wallet`);
      return response.data;
    },
    enabled: Boolean(userId) && activeTab === 'wallet',
    staleTime: 30 * 1000,
  });

  const { data: allOrdersData, isLoading: isAllOrdersLoading } = useQuery({
    queryKey: ['allUserOrders', userId],
    queryFn: async () => {
      const response = await apiClient.get(`/customers/${userId}/orders?limit=1000`);
      return response.data?.orders || [];
    },
    enabled: Boolean(userId) && activeTab === 'favourite-orders',
    staleTime: 60 * 1000,
  });

  const favouriteOrders = useMemo(() => {
    if (!allOrdersData || allOrdersData.length === 0) return [];
    
    const combinationCounts = new Map();
    
    allOrdersData.forEach(order => {
      if (!order.chi_tiet || order.chi_tiet.length === 0) return;
      
      const items = [...order.chi_tiet].sort((a, b) => String(a.ma_san_pham).localeCompare(String(b.ma_san_pham)));
      
      const hash = JSON.stringify(items.map(item => ({
        id: item.ma_san_pham,
        size: item.size,
        qty: item.so_luong,
        // Normalize tuy_chon to ignore order of options when hashing
        opts: Array.isArray(item.tuy_chon) ? [...item.tuy_chon].sort().join('|') : String(item.tuy_chon || '')
      })));
      
      if (!combinationCounts.has(hash)) {
        combinationCounts.set(hash, {
          hash,
          count: 0,
          items: order.chi_tiet,
          total: order.tong_tien_hang || 0,
          lastOrderedAt: order.ngay_tao,
          sampleOrderId: order.ma_don_hang
        });
      }
      
      const record = combinationCounts.get(hash);
      record.count += 1;
      if (new Date(order.ngay_tao) > new Date(record.lastOrderedAt)) {
        record.lastOrderedAt = order.ngay_tao;
        // Keep the latest items just in case prices/names changed
        record.items = order.chi_tiet;
        record.total = order.tong_tien_hang || 0;
      }
    });
    
    return Array.from(combinationCounts.values())
      .filter(record => record.count >= 5) // NGƯỠNG 5 LẦN
      .sort((a, b) => b.count - a.count);
  }, [allOrdersData]);

  const handleReorderFavourite = (items) => {
    items.forEach(item => {
      addToCart({
        ma_san_pham: item.ma_san_pham,
        ten_san_pham: item.ten_san_pham,
        gia_ban: item.don_gia,
        hinh_anh_url: item.hinh_anh_url,
        size: item.size,
        so_luong: item.so_luong,
        tuy_chon: item.tuy_chon
      });
    });
    alert('Đã thêm các món trong đơn hàng yêu thích vào giỏ!');
    setIsCartOpen(true);
  };

  const topUpMutation = useMutation({
    mutationFn: async (amount) => {
      const response = await apiClient.post(`/customers/${userId}/wallet/topup`, { amount });
      return response.data;
    },
    onSuccess: (data) => {
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        alert(data.message || 'Nạp tiền thành công!');
        queryClient.invalidateQueries({ queryKey: ['userWallet', userId] });
        setTopUpAmount('');
      }
    },
    onError: (err) => {
      alert(err?.response?.data?.message || 'Không thể nạp tiền lúc này.');
    },
  });

  const [topUpAmount, setTopUpAmount] = useState('');
  const [giftCardCode, setGiftCardCode] = useState('');

  const redeemGiftCardMutation = useMutation({
    mutationFn: async (code) => {
      const response = await apiClient.post('/gift-cards/redeem', { code, customer_id: userId });
      return response.data;
    },
    onSuccess: (data) => {
      alert(data.message || 'Nạp thẻ thành công!');
      queryClient.invalidateQueries({ queryKey: ['userWallet', userId] });
      setGiftCardCode('');
    },
    onError: (error) => {
      alert(error.response?.data?.message || 'Mã thẻ không hợp lệ hoặc đã được sử dụng');
    }
  });

  const savedAddresses = addressPayload?.items || [];
  const myReviews = reviewHistoryPayload?.items || [];
  const diemLoyalty = loyaltyData?.diem || 0;
  const districtOptions = useMemo(() => Object.keys(addressOptions[addressForm.city] || {}), [addressForm.city, addressOptions]);
  const wardOptions = useMemo(
    () => (addressOptions[addressForm.city]?.[addressForm.district] || []),
    [addressForm.city, addressForm.district, addressOptions],
  );
  const diaChiDayDu = useMemo(() => taoDiaChiDayDu(addressForm), [addressForm]);

  useEffect(() => {
    setProfileForm({ hoTen: '', soDienThoai: '', avatarUrl: '' });
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setAddressForm({ ...DEFAULT_ADDRESS_FORM, ...defaultAddressSelection });
    setProfileError('');
    setPasswordError('');
    setAddressError('');
    setEditingAddressId(null);
  }, [defaultAddressSelection, userId]);

  useEffect(() => {
    if (!addressForm.city && defaultAddressSelection.city) {
      setAddressForm((prev) => ({ ...prev, ...defaultAddressSelection }));
    }
  }, [addressForm.city, defaultAddressSelection]);

  useEffect(() => {
    if (profile) {
      setProfileForm({
        hoTen: profile.ho_ten || '',
        soDienThoai: profile.so_dien_thoai || '',
        avatarUrl: profile.avatar_url || '',
        gioiTinh: profile.gioi_tinh || profile.gioitinh || 'Nam',
        ngaySinh: profile.ngay_sinh || profile.ngaysinh || '',
      });
    }
  }, [profile]);

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

  const updateProfileMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await apiClient.patch(`/users/${userId}/profile`, payload);
      return response.data;
    },
    onSuccess: (data) => {
      setProfileError('');
      const updatedUser = {
        ...profileUser,
        ho_ten: data?.user?.ho_ten,
        hoTen: data?.user?.ho_ten,
        email: data?.user?.email,
        avatar_url: data?.user?.avatar_url || null,
        avatarUrl: data?.user?.avatar_url || null,
      };
      onProfileUpdated(updatedUser);
      queryClient.invalidateQueries({ queryKey: queryKeys.userProfile(userId) });
      alert('Cập nhật thông tin thành công!');
    },
    onError: (err) => {
      setProfileError(err?.response?.data?.message || 'Không thể cập nhật thông tin.');
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await apiClient.post(`/users/${userId}/change-password`, payload);
      return response.data;
    },
    onSuccess: () => {
      setPasswordError('');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      alert('Đổi mật khẩu thành công!');
    },
    onError: (err) => {
      setPasswordError(err?.response?.data?.message || 'Không thể đổi mật khẩu.');
    },
  });

  const saveAddressMutation = useMutation({
    mutationFn: async (payload) => {
      if (editingAddressId) {
        const response = await apiClient.patch(`/users/${userId}/addresses/${editingAddressId}`, payload);
        return response.data;
      }

      const response = await apiClient.post(`/users/${userId}/addresses`, payload);
      return response.data;
    },
    onSuccess: () => {
      setAddressError('');
      setEditingAddressId(null);
      setAddressForm({ ...DEFAULT_ADDRESS_FORM, ...defaultAddressSelection });
      queryClient.invalidateQueries({ queryKey: queryKeys.userAddresses(userId) });
    },
    onError: (err) => {
      setAddressError(err?.response?.data?.message || 'Không thể lưu địa chỉ.');
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: async (addressId) => {
      await apiClient.delete(`/users/${userId}/addresses/${addressId}`);
    },
    onSuccess: () => {
      setAddressError('');
      if (editingAddressId) {
        setEditingAddressId(null);
        setAddressForm({ ...DEFAULT_ADDRESS_FORM, ...defaultAddressSelection });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.userAddresses(userId) });
    },
    onError: (err) => {
      setAddressError(err?.response?.data?.message || 'Không thể xóa địa chỉ.');
    },
  });

  const setDefaultAddressMutation = useMutation({
    mutationFn: async (addressId) => {
      await apiClient.patch(`/users/${userId}/addresses/${addressId}/default`);
    },
    onSuccess: () => {
      setAddressError('');
      queryClient.invalidateQueries({ queryKey: queryKeys.userAddresses(userId) });
    },
    onError: (err) => {
      setAddressError(err?.response?.data?.message || 'Không thể đặt địa chỉ mặc định.');
    },
  });

  const handleUpdateProfile = (e) => {
    e.preventDefault();
    setProfileError('');
    updateProfileMutation.mutate({
      hoTen: profileForm.hoTen,
      soDienThoai: profileForm.soDienThoai,
      avatarUrl: profileForm.avatarUrl,
    });
  };

  const handleChangePassword = (e) => {
    e.preventDefault();
    setPasswordError('');

    if (passwordForm.newPassword.length < 6) {
      setPasswordError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('Xác nhận mật khẩu không khớp.');
      return;
    }

    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setAddressError('Trình duyệt của bạn không hỗ trợ định vị.');
      return;
    }

    setIsLocating(true);
    setAddressError('');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          // Gọi API Nominatim (OpenStreetMap) với ngôn ngữ tiếng Việt
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=vi`
          );
          
          if (!res.ok) throw new Error('Không thể lấy địa chỉ từ tọa độ này.');
          
          const data = await res.json();
          const addr = data.address;
          
          const rawCity = addr.city || addr.municipality || addr.province || addr.state || addr.region || addr.town || '';
          const rawDistrict = addr.county || addr.district || addr.suburb || addr.town || addr.city_district || '';
          const rawWard = addr.village || addr.ward || addr.suburb || addr.quarter || addr.hamlet || '';
          const rawStreet = [addr.house_number, addr.road].filter(Boolean).join(' ') || data.display_name;
          
          const removeAccents = (str) => String(str || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
            
          const findBestMatch = (optionsArray, targetStr) => {
            if (!targetStr) return null;
            let target = removeAccents(targetStr).replace(/(thanh pho|tinh|quan|huyen|thi xa|phuong|xa|thi tran)\s+/gi, '').replace(/\s+city/gi, '').trim();
            if (target.includes('ho chi minh') || target.includes('hcm')) target = 'ho chi minh';
            
            return optionsArray.find(opt => {
                let optNorm = removeAccents(opt).replace(/(thanh pho|tinh|quan|huyen|thi xa|phuong|xa|thi tran)\s+/gi, '').replace(/\s+city/gi, '').trim();
                if (optNorm.includes('ho chi minh')) optNorm = 'ho chi minh';
                return optNorm === target || optNorm.includes(target) || target.includes(optNorm);
            });
          };

          const cityOptions = Object.keys(addressOptions);
          let matchedCity = findBestMatch(cityOptions, rawCity) || findBestMatch(cityOptions, data.display_name);
          if (!matchedCity) matchedCity = cityOptions[0];

          const districtOptions = Object.keys(addressOptions[matchedCity] || {});
          let matchedDistrict = findBestMatch(districtOptions, rawDistrict) || findBestMatch(districtOptions, data.display_name);
          if (!matchedDistrict) matchedDistrict = districtOptions[0] || '';

          const wardOptions = addressOptions[matchedCity]?.[matchedDistrict] || [];
          let matchedWard = findBestMatch(wardOptions, rawWard) || findBestMatch(wardOptions, data.display_name);
          if (!matchedWard) matchedWard = wardOptions[0] || '';

          setAddressForm((prev) => ({
            ...prev,
            city: matchedCity || prev.city,
            district: matchedDistrict || prev.district,
            ward: matchedWard || prev.ward,
            street: rawStreet || prev.street,
          }));
          
        } catch (err) {
          setAddressError(err.message || 'Có lỗi xảy ra khi lấy vị trí.');
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        switch(error.code) {
          case error.PERMISSION_DENIED:
            setAddressError('Vui lòng cấp quyền truy cập vị trí trong cài đặt trình duyệt.');
            break;
          case error.POSITION_UNAVAILABLE:
            setAddressError('Thông tin vị trí hiện không khả dụng.');
            break;
          case error.TIMEOUT:
            setAddressError('Quá thời gian yêu cầu lấy vị trí.');
            break;
          default:
            setAddressError('Lỗi không xác định khi lấy vị trí.');
            break;
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  };

  const handleSaveAddress = (e) => {
    e.preventDefault();
    setAddressError('');

    if (!addressForm.street.trim()) {
      setAddressError('Vui lòng nhập số nhà, tên đường cho địa chỉ giao hàng.');
      return;
    }

    saveAddressMutation.mutate({
      tenDiaChi: addressForm.tenDiaChi,
      diaChiDayDu: diaChiDayDu,
      ghiChu: addressForm.ghiChu,
    });
  };

  const handleEditAddress = (address) => {
    setAddressError('');
    setEditingAddressId(address.id);
    const parsed = tachDiaChiDayDu(address.dia_chi_day_du);
    const normalizedAddress = normalizeAddressSelection(parsed, addressOptions);

    setAddressForm({
      tenDiaChi: address.ten_dia_chi || '',
      city: normalizedAddress.city,
      district: normalizedAddress.district,
      ward: normalizedAddress.ward,
      street: normalizedAddress.street,
      ghiChu: address.ghi_chu || '',
    });
    setActiveTab('addresses');
  };

  const resetAddressEditor = () => {
    setEditingAddressId(null);
    setAddressError('');
    setAddressForm({ ...DEFAULT_ADDRESS_FORM, ...defaultAddressSelection });
  };

  const TAB_ICONS = {
    profile: <UserIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    orders: <ShoppingBagIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    'favourite-orders': <HeartIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    membership: <IdentificationIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    'lucky-wheel': <GiftIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    'gift-cards': <BookmarkIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    addresses: <MapPinIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    reviews: <StarOutlineIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    password: <KeyIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    wallet: <CheckBadgeIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
  };

  return (
    <div className="flex flex-col w-full bg-[#faf8f5]">
      <div className="mx-auto w-full max-w-[1240px] px-4 md:px-6 py-6 md:py-10 space-y-6 min-h-[500px]">
        {/* Header Greeting */}
        <div className="border-b border-gray-200/80 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black uppercase text-[#2b2b2b] tracking-tight font-sans">Trang tài khoản</h2>
            <p className="text-xs md:text-sm text-gray-500 mt-1 font-semibold">
              Xin chào, <span className="text-[#b22830] font-black">{profileUser?.ho_ten || profileUser?.hoTen || profileUser?.username || 'Bạn'}</span>! Quản lý hồ sơ, đơn hàng và các đặc quyền thành viên của bạn.
            </p>
          </div>
          {profile?.avatar_url && (
            <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl border border-gray-100 shadow-sm self-start md:self-auto">
              <img src={profile.avatar_url} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-gray-200" />
              <div>
                <p className="text-xs font-black text-gray-800 leading-none">{profileUser?.ho_ten || profileUser?.hoTen}</p>
                <span className="text-[9px] font-black text-[#c89a58] uppercase tracking-wider leading-none mt-1 inline-block">
                  {loyaltyData?.hang_thanh_vien?.hang || 'Thành viên'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modern Horizontal Navigation Bar */}
        <div className="flex overflow-x-auto pb-3 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none border-b border-gray-200/60">
          <div className="flex space-x-2 min-w-max">
            {[
              { id: 'profile', label: 'Thông tin', iconId: 'profile' },
              { id: 'orders', label: 'Đơn hàng', iconId: 'orders' },
              { id: 'favourite-orders', label: 'Đơn yêu thích', iconId: 'favourite-orders', count: favouriteOrders.length || undefined },
              { id: 'membership', label: 'Hạng thành viên', iconId: 'membership' },
              { id: 'lucky-wheel', label: 'Vòng quay', iconId: 'lucky-wheel' },
              { id: 'wallet', label: 'Ví điện tử', iconId: 'wallet' },
              { id: 'gift-cards', label: 'Thẻ quà tặng', iconId: 'gift-cards' },
              { id: 'addresses', label: 'Địa chỉ', iconId: 'addresses', count: savedAddresses.length },
              { id: 'reviews', label: 'Đánh giá', iconId: 'reviews' },
              { id: 'password', label: 'Đổi mật khẩu', iconId: 'password' },
            ].map((tab) => {
              const isActive = tab.id === 'orders' ? isOrderHistoryOpen : (!isOrderHistoryOpen && activeTab === tab.id);
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === 'orders') {
                      setIsOrderHistoryOpen(true);
                    } else {
                      setIsOrderHistoryOpen(false);
                      setActiveTab(tab.id);
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex items-center gap-2 px-5 py-3 rounded-full text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer border-none active:scale-95 transform hover:-translate-y-0.5 ${
                    isActive
                      ? 'bg-[#b22830] text-white shadow-md shadow-red-950/20'
                      : 'bg-white hover:bg-gray-50 text-gray-600 border border-gray-200/60 shadow-sm hover:shadow'
                  }`}
                >
                  <span className={isActive ? 'text-white' : 'text-gray-400'}>{TAB_ICONS[tab.iconId]}</span>
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black ${isActive ? 'bg-white text-[#b22830]' : 'bg-gray-100 text-gray-600 border border-gray-200/50'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="w-full">
          {isOrderHistoryOpen ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-[#b22830]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <p className="text-sm font-black uppercase tracking-wide text-gray-700">Lịch sử đơn hàng đang hiển thị ở bảng điều khiển chung</p>
              <p className="mt-2 text-xs font-semibold text-gray-400 max-w-sm mx-auto">Bạn có thể quản lý và xem tất cả trạng thái đơn hàng của mình tại đây.</p>
            </div>
          ) : activeTab === 'profile' ? (
            <div className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-md shadow-gray-100/50">
              {isLoading ? (
                <div className="space-y-4">
                  <div className="h-16 animate-pulse rounded-2xl bg-gray-100"></div>
                  <div className="h-12 animate-pulse rounded-2xl bg-gray-100"></div>
                  <div className="h-12 animate-pulse rounded-2xl bg-gray-100"></div>
                </div>
              ) : profileIsError ? (
                <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {profileError2?.response?.data?.message || 'Không thể tải thông tin cá nhân.'}
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Loyalty Points Card (Physical Member Card Design) */}
                  {(() => {
                    const hang = loyaltyData?.hang_thanh_vien;
                    const maHang = hang?.ma_hang || 'MEMBER';
                    const batDau = hang?.diem_bat_dau_hang ?? 0;
                    const canLen = hang?.diem_can_len_hang ?? null;
                    const phanTram = canLen != null
                      ? Math.min(100, Math.round(((diemLoyalty - batDau) / (canLen - batDau)) * 100))
                      : 100;
                    const HANG_STYLE = {
                      MEMBER: { 
                        bg: 'from-[#3e2723] via-[#b22830] to-[#2d1b18] shadow-red-950/20', 
                        border: 'border-white/10', 
                        text: 'text-white', 
                        textMuted: 'text-[#d7ccc8]',
                        bar: 'bg-white', 
                        icon: (
                          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/20 shadow-md shrink-0">
                            <SparklesIcon className="w-6 h-6 text-[#c89a58]" />
                          </div>
                        )
                      },
                      SILVER: { 
                        bg: 'from-[#4f5d75] via-[#687b9c] to-[#3a4750] shadow-slate-900/20', 
                        border: 'border-white/10', 
                        text: 'text-white', 
                        textMuted: 'text-slate-200',
                        bar: 'bg-slate-300', 
                        icon: (
                          <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center border-2 border-white/35 shadow-md shrink-0">
                            <CheckBadgeIcon className="w-6 h-6 text-slate-100" />
                          </div>
                        )
                      },
                      GOLD: { 
                        bg: 'from-[#8a6421] via-[#c89a58] to-[#5d4037] shadow-yellow-900/20', 
                        border: 'border-white/10', 
                        text: 'text-white', 
                        textMuted: 'text-amber-100',
                        bar: 'bg-yellow-400', 
                        icon: (
                          <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center border-2 border-white/35 shadow-md shrink-0">
                            <SparklesIcon className="w-6 h-6 text-yellow-300" />
                          </div>
                        )
                      },
                      DIAMOND: { 
                        bg: 'from-[#1a237e] via-[#2a5298] to-[#0d47a1] shadow-blue-900/20', 
                        border: 'border-white/10', 
                        text: 'text-white', 
                        textMuted: 'text-blue-100',
                        bar: 'bg-cyan-400', 
                        icon: (
                          <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center border-2 border-white/35 shadow-md shrink-0">
                            <SparklesIcon className="w-6 h-6 text-cyan-300 animate-pulse" />
                          </div>
                        )
                      },
                    };
                    const s = HANG_STYLE[maHang] || HANG_STYLE.MEMBER;
                    return (
                      <div className={`relative overflow-hidden rounded-3xl border ${s.border} bg-gradient-to-br ${s.bg} p-6 text-white shadow-xl`}>
                        {/* Metallic gloss watermark */}
                        <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-48 h-48 bg-white/5 rounded-full blur-3xl pointer-events-none" />
                        <div className="absolute -top-10 -left-10 w-32 h-32 bg-white/5 rounded-full blur-xl pointer-events-none" />
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {s.icon}
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-white/50 leading-none">Hạng tài khoản</p>
                              <span className={`text-[11px] font-black uppercase px-2.5 py-0.5 rounded-full ${s.text} bg-white/10 border border-white/20 mt-1.5 inline-block shadow-sm`}>
                                {hang?.hang || 'Thành viên'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="text-right">
                            <p className="text-[9px] font-black text-white/50 uppercase tracking-widest leading-none">Điểm hiện có</p>
                            <p className="text-3xl font-black mt-1 tracking-tight">{diemLoyalty.toLocaleString('vi-VN')} <span className="text-sm font-bold text-white/70">PTS</span></p>
                          </div>
                        </div>

                        <div className="mt-6 pt-4 border-t border-white/10">
                          <div className="mb-2 flex justify-between text-xs font-semibold text-white/80">
                            {canLen != null ? (
                              <>
                                <span>{diemLoyalty.toLocaleString('vi-VN')} / {canLen.toLocaleString('vi-VN')} điểm</span>
                                <span>Cần tích lũy thêm {(canLen - diemLoyalty).toLocaleString('vi-VN')} điểm để thăng hạng</span>
                              </>
                            ) : (
                              <span className="font-black text-yellow-300 flex items-center gap-1">
                                <SparklesIcon className="w-4 h-4 text-yellow-300" />
                                Bạn đang ở hạng cao nhất ✨
                              </span>
                            )}
                          </div>
                          <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden shadow-inner">
                            <div className={`h-full rounded-full ${s.bar} transition-all duration-700`} style={{ width: `${phanTram}%` }} />
                          </div>
                        </div>

                        <div className="mt-4 flex justify-between items-center text-[10px] font-black tracking-widest text-white/40 uppercase">
                          <span>Avengers Coffee Club</span>
                          <span>1 PTS = 1.000đ</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Quick Stat Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-amber-50/50 to-orange-50/30 p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-amber-700/70 tracking-wider">Đơn hàng</span>
                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center">
                          <ShoppingBagIcon className="w-4 h-4 text-amber-600" />
                        </div>
                      </div>
                      <p className="text-2xl font-black text-gray-900 mt-2">{allOrdersData?.length || 0}</p>
                      <p className="text-[10px] font-bold text-gray-400 mt-0.5">Đã hoàn thành</p>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-red-50/50 to-rose-50/30 p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-rose-700/70 tracking-wider">Điểm tích lũy</span>
                        <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center">
                          <SparklesIcon className="w-4 h-4 text-[#b22830]" />
                        </div>
                      </div>
                      <p className="text-2xl font-black text-gray-900 mt-2">{diemLoyalty.toLocaleString('vi-VN')}</p>
                      <p className="text-[10px] font-bold text-gray-400 mt-0.5">PTS khả dụng</p>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-blue-50/50 to-cyan-50/30 p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-blue-700/70 tracking-wider">Sổ địa chỉ</span>
                        <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center">
                          <MapPinIcon className="w-4 h-4 text-blue-600" />
                        </div>
                      </div>
                      <p className="text-2xl font-black text-gray-900 mt-2">{savedAddresses?.length || 0}</p>
                      <p className="text-[10px] font-bold text-gray-400 mt-0.5">Địa chỉ giao hàng</p>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gradient-to-br from-emerald-50/50 to-teal-50/30 p-4 transition-all hover:shadow-md hover:-translate-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-emerald-700/70 tracking-wider">Đơn yêu thích</span>
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                          <HeartIcon className="w-4 h-4 text-emerald-600" />
                        </div>
                      </div>
                      <p className="text-2xl font-black text-gray-900 mt-2">{favouriteOrders?.length || 0}</p>
                      <p className="text-[10px] font-bold text-gray-400 mt-0.5">Món đặt thường xuyên</p>
                    </div>
                  </div>

                  <form onSubmit={handleUpdateProfile} className="space-y-6">
                    {/* Avatar preview, presets and edit url field */}
                    <div className="rounded-2xl border border-gray-100 bg-gradient-to-r from-gray-50/80 via-white to-gray-50/80 p-5 space-y-4 shadow-sm">
                      <div className="flex flex-col sm:flex-row items-center gap-6">
                        <div className="relative group shrink-0">
                          <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-xl relative bg-gradient-to-tr from-[#b22830] via-[#c89a58] to-amber-600 flex items-center justify-center text-white text-3xl font-black transition-transform duration-300 group-hover:scale-105">
                            {profileForm.avatarUrl ? (
                              <img src={profileForm.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <span>{(profileForm.hoTen || profileUser?.username || 'B')[0].toUpperCase()}</span>
                            )}
                          </div>
                          <div className="absolute -bottom-1 -right-1 bg-emerald-500 w-6 h-6 rounded-full border-2 border-white shadow flex items-center justify-center title='Tài khoản hoạt động'">
                            <CheckIcon className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                          </div>
                        </div>

                        <div className="flex-1 w-full space-y-3">
                          <div>
                            <h4 className="text-sm font-black uppercase text-gray-800 tracking-wide flex items-center gap-2">
                              <CameraIcon className="w-4 h-4 text-[#b22830]" />
                              Ảnh đại diện tài khoản
                            </h4>
                            <p className="text-xs font-medium text-gray-400 mt-0.5">Dán link (URL) ảnh đại diện của bạn hoặc chọn nhanh avatar bên dưới.</p>
                          </div>

                          <div className="relative">
                            <input
                              type="text"
                              placeholder="https://example.com/avatar.png"
                              value={profileForm.avatarUrl}
                              onChange={(e) => setProfileForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                              className="w-full rounded-xl border border-gray-200/80 pl-10 pr-4 py-3 text-xs font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                            />
                            <CameraIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          </div>

                          {/* Quick Preset Avatars */}
                          <div className="flex items-center gap-2 pt-1">
                            <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">Avatar mẫu:</span>
                            {[
                              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
                              'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
                              'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
                              'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=150&q=80',
                            ].map((url, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setProfileForm((prev) => ({ ...prev, avatarUrl: url }))}
                                className="w-7 h-7 rounded-full overflow-hidden border border-gray-200 hover:border-[#b22830] hover:scale-110 transition-all cursor-pointer"
                              >
                                <img src={url} alt="preset" className="w-full h-full object-cover" />
                              </button>
                            ))}
                            {profileForm.avatarUrl && (
                              <button
                                type="button"
                                onClick={() => setProfileForm((prev) => ({ ...prev, avatarUrl: '' }))}
                                className="text-[10px] font-bold text-gray-400 hover:text-red-600 underline ml-1 cursor-pointer"
                              >
                                Xóa ảnh
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 1: Personal Details */}
                    <div className="rounded-2xl border border-gray-100 bg-white p-5 space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-widest text-[#b22830] border-b border-gray-100 pb-2.5 flex items-center gap-2">
                        <UserIcon className="w-4 h-4 text-[#b22830]" />
                        Thông tin cá nhân
                      </h4>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block mb-1.5 text-xs font-bold text-gray-700">
                            Họ và tên <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              required
                              value={profileForm.hoTen}
                              onChange={(e) => setProfileForm((prev) => ({ ...prev, hoTen: e.target.value }))}
                              placeholder="Nhập họ và tên"
                              className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                            />
                            <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          </div>
                        </div>

                        <div>
                          <label className="block mb-1.5 text-xs font-bold text-gray-700">
                            Số điện thoại
                          </label>
                          <div className="relative">
                            <input
                              type="tel"
                              value={profileForm.soDienThoai}
                              onChange={(e) => setProfileForm((prev) => ({ ...prev, soDienThoai: e.target.value }))}
                              placeholder="0901234567"
                              className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                            />
                            <PhoneIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2 pt-1">
                        <div>
                          <label className="block mb-1.5 text-xs font-bold text-gray-700">Giới tính</label>
                          <div className="flex gap-2">
                            {['Nam', 'Nữ', 'Khác'].map((gender) => (
                              <button
                                key={gender}
                                type="button"
                                onClick={() => setProfileForm((prev) => ({ ...prev, gioiTinh: gender }))}
                                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                                  profileForm.gioiTinh === gender
                                    ? 'bg-[#b22830] text-white border-[#b22830] shadow-sm'
                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                }`}
                              >
                                {gender}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block mb-1.5 text-xs font-bold text-gray-700">Ngày sinh</label>
                          <div className="relative">
                            <input
                              type="date"
                              value={profileForm.ngaySinh}
                              onChange={(e) => setProfileForm((prev) => ({ ...prev, ngaySinh: e.target.value }))}
                              className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-xs font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 2: Account & Security Information */}
                    <div className="rounded-2xl border border-gray-100 bg-gray-50/50 p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-gray-200/60 pb-2.5">
                        <h4 className="text-xs font-black uppercase tracking-widest text-gray-600 flex items-center gap-2">
                          <LockClosedIcon className="w-4 h-4 text-gray-500" />
                          Tài khoản & Xác thực
                        </h4>
                        <span className="flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                          <CheckBadgeIcon className="w-3.5 h-3.5 text-emerald-600" />
                          Đã xác thực
                        </span>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="block mb-1.5 text-xs font-bold text-gray-500">Tên đăng nhập</label>
                          <div className="relative">
                            <input
                              type="text"
                              disabled
                              value={profile?.ten_dang_nhap || profileUser?.username || ''}
                              className="w-full rounded-xl border border-gray-200 bg-gray-100/80 pl-10 pr-10 py-3 text-xs font-bold text-gray-500 outline-none cursor-not-allowed"
                            />
                            <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <LockClosedIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          </div>
                        </div>

                        <div>
                          <label className="block mb-1.5 text-xs font-bold text-gray-500">Địa chỉ Email</label>
                          <div className="relative">
                            <input
                              type="email"
                              disabled
                              value={profile?.email || profileUser?.email || ''}
                              className="w-full rounded-xl border border-gray-200 bg-gray-100/80 pl-10 pr-10 py-3 text-xs font-bold text-gray-500 outline-none cursor-not-allowed"
                            />
                            <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <LockClosedIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                          </div>
                        </div>
                      </div>
                    </div>

                    {profileError ? (
                      <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs font-bold text-red-600">
                        <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
                        <span>{profileError}</span>
                      </div>
                    ) : null}

                    {/* Primary CTA */}
                    <div className="pt-2 flex items-center justify-end gap-3">
                      <button
                        type="submit"
                        disabled={updateProfileMutation.isPending}
                        className="flex items-center gap-2 rounded-xl bg-[#b22830] hover:bg-[#8f1d24] px-8 py-3.5 text-xs font-black uppercase tracking-wider text-white shadow-lg shadow-red-950/20 hover:shadow-xl transition-all duration-200 disabled:bg-gray-300 cursor-pointer active:scale-95 transform"
                      >
                        {updateProfileMutation.isPending ? (
                          <>
                            <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span>Đang lưu...</span>
                          </>
                        ) : (
                          <>
                            <CheckIcon className="w-4 h-4 text-white" strokeWidth={3} />
                            <span>Lưu thay đổi hồ sơ</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          ) : activeTab === 'addresses' ? (
            <div className="grid gap-6 lg:grid-cols-12 items-start">
              {/* Address List (Left Side) */}
              <div className="lg:col-span-7 rounded-2xl border border-gray-200/60 bg-white p-6 space-y-4 shadow-md shadow-gray-100/50">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3">
                  <MapPinIcon className="w-5 h-5 text-[#b22830]" />
                  <h3 className="text-base font-black uppercase text-gray-800 tracking-wide">Sổ địa chỉ của bạn</h3>
                </div>
                
                {savedAddresses.length === 0 ? (
                  <div className="text-center py-8">
                    <MapPinIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm font-semibold text-gray-500">Bạn chưa thêm địa chỉ nhận hàng nào.</p>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {savedAddresses.map((address) => (
                      <div
                        key={address.id}
                        className={`group rounded-2xl border p-4.5 transition-all duration-200 ${
                          address.la_mac_dinh 
                            ? 'border-[#b22830] bg-[#b22830]/[0.01] shadow-sm' 
                            : 'border-gray-100 bg-gray-50/40 hover:border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <MapPinIcon className={`w-4 h-4 ${address.la_mac_dinh ? 'text-[#b22830]' : 'text-gray-400'}`} />
                            <p className="text-sm font-black text-gray-800">{address.ten_dia_chi}</p>
                          </div>
                          {address.la_mac_dinh ? (
                            <span className="flex items-center gap-1 rounded-full bg-[#b22830] px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow-sm">
                              <CheckIcon className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                              Mặc định
                            </span>
                          ) : null}
                        </div>
                        
                        <p className="mt-2 text-xs font-bold text-gray-600 leading-relaxed pl-6">{address.dia_chi_day_du}</p>
                        
                        {address.ghi_chu ? (
                          <div className="mt-1.5 flex items-start gap-1 text-[11px] text-gray-400 font-semibold pl-6">
                            <span className="text-[10px] text-gray-400 italic font-black uppercase shrink-0 mt-0.5">Ghi chú:</span>
                            <span>{address.ghi_chu}</span>
                          </div>
                        ) : null}

                        <div className="mt-4 flex gap-2 border-t border-gray-100 pt-3 pl-6">
                          {!address.la_mac_dinh ? (
                            <button
                              type="button"
                              onClick={() => setDefaultAddressMutation.mutate(address.id)}
                              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 hover:text-[#b22830] transition-all cursor-pointer shadow-sm"
                            >
                              <CheckIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                              Đặt mặc định
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handleEditAddress(address)}
                            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-blue-600 hover:text-blue-700 transition-all cursor-pointer shadow-sm"
                          >
                            <PencilSquareIcon className="w-3.5 h-3.5" />
                            Sửa
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Bạn có chắc muốn xóa địa chỉ này?')) {
                                deleteAddressMutation.mutate(address.id);
                              }
                            }}
                            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-red-50 text-red-600 hover:text-red-700 transition-all ml-auto cursor-pointer shadow-sm"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                            Xóa
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Address Form (Right Side) */}
              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-md shadow-gray-100/50">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <PencilSquareIcon className="w-5 h-5 text-[#b22830]" />
                      <h3 className="text-base font-black uppercase text-gray-800 tracking-wide">
                        {editingAddressId ? 'Sửa địa chỉ' : 'Thêm địa chỉ'}
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleGetLocation}
                      disabled={isLocating}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-[#b22830] bg-[#fdf5f6] px-3 py-1.5 rounded-full hover:bg-[#fbdcde] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <MapPinIcon className="w-3.5 h-3.5" />
                      {isLocating ? 'Đang định vị...' : 'Vị trí hiện tại'}
                    </button>
                  </div>

                  <form onSubmit={handleSaveAddress} className="space-y-4">
                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Tên gợi nhớ địa chỉ</p>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          placeholder="ví dụ: Nhà riêng, Văn phòng"
                          value={addressForm.tenDiaChi}
                          onChange={(e) => setAddressForm((prev) => ({ ...prev, tenDiaChi: e.target.value }))}
                          className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                        />
                        <BookmarkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      </div>
                    </div>

                    <div className="grid gap-3 grid-cols-1">
                      <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Tỉnh / Thành phố</p>
                        <div className="relative">
                          <select
                            value={addressForm.city}
                            onChange={(e) => {
                              const newCity = e.target.value;
                              const newDistricts = Object.keys(addressOptions[newCity] || {});
                              const defaultDistrict = newDistricts[0] || '';
                              const defaultWards = addressOptions[newCity]?.[defaultDistrict] || [];
                              const defaultWard = defaultWards[0] || '';

                              setAddressForm((prev) => ({
                                ...prev,
                                city: newCity,
                                district: defaultDistrict,
                                ward: defaultWard,
                              }));
                            }}
                            className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white appearance-none cursor-pointer"
                          >
                            {Object.keys(addressOptions).map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <MapPinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                        </div>
                      </div>

                      <div className="grid gap-3 grid-cols-2">
                        <div>
                          <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Quận / Huyện</p>
                          <div className="relative">
                            <select
                              value={addressForm.district}
                              onChange={(e) => {
                                const newDistrict = e.target.value;
                                const defaultWards = addressOptions[addressForm.city]?.[newDistrict] || [];
                                const defaultWard = defaultWards[0] || '';

                                setAddressForm((prev) => ({
                                  ...prev,
                                  district: newDistrict,
                                  ward: defaultWard,
                                }));
                              }}
                              className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white appearance-none cursor-pointer"
                            >
                              {districtOptions.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                            <MapPinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                          </div>
                        </div>

                        <div>
                          <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Phường / Xã</p>
                          <div className="relative">
                            <select
                              value={addressForm.ward}
                              onChange={(e) => setAddressForm((prev) => ({ ...prev, ward: e.target.value }))}
                              className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white appearance-none cursor-pointer"
                            >
                              {wardOptions.map((w) => (
                                <option key={w} value={w}>
                                  {w}
                                </option>
                              ))}
                            </select>
                            <MapPinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Số nhà, tên đường</p>
                      <div className="relative">
                        <input
                          type="text"
                          required
                          placeholder="ví dụ: 123 Đường Nguyễn Trãi"
                          value={addressForm.street}
                          onChange={(e) => setAddressForm((prev) => ({ ...prev, street: e.target.value }))}
                          className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                        />
                        <MapPinIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Ghi chú (hướng dẫn giao hàng)</p>
                      <div className="relative">
                        <textarea
                          rows={2}
                          placeholder="ví dụ: Gần tòa nhà ABC, gọi trước khi đến..."
                          value={addressForm.ghiChu}
                          onChange={(e) => setAddressForm((prev) => ({ ...prev, ghiChu: e.target.value }))}
                          className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                        />
                        <PencilSquareIcon className="absolute left-3.5 top-3 w-5 h-5 text-gray-400" />
                      </div>
                    </div>

                    {addressError ? (
                      <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                        <ExclamationTriangleIcon className="w-5 h-5" />
                        <span>{addressError}</span>
                      </div>
                    ) : null}

                    <div className="flex gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={saveAddressMutation.isPending}
                        className="rounded-xl bg-[#b22830] hover:bg-[#8f1d24] px-5 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-red-950/10 hover:shadow-lg transition-all duration-200 disabled:bg-gray-300 cursor-pointer active:scale-95 transform"
                      >
                        {saveAddressMutation.isPending ? 'Đang xử lý...' : editingAddressId ? 'Cập nhật' : 'Thêm địa chỉ'}
                      </button>
                      {editingAddressId ? (
                        <button
                          type="button"
                          onClick={resetAddressEditor}
                          className="rounded-xl border border-gray-200 hover:bg-gray-50 px-5 py-3 text-sm font-black uppercase tracking-wide text-gray-500 transition-colors cursor-pointer"
                        >
                          Hủy sửa
                        </button>
                      ) : null}
                    </div>
                  </form>
                </div>
              </div>
            </div>
          ) : activeTab === 'favourite-orders' ? (
            <div className="rounded-2xl border border-gray-200/60 bg-white p-6 shadow-md shadow-gray-100/50">
              <div className="flex items-center gap-3 border-b border-gray-100 pb-4 mb-6">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
                  <HeartSolidIcon className="w-5 h-5 text-[#b22830]" />
                </div>
                <div>
                  <h3 className="text-lg font-black uppercase text-[#2b2b2b] tracking-tight">Đơn đặt hàng yêu thích của tôi</h3>
                  <p className="text-xs font-semibold text-gray-500">Các tổ hợp món ăn bạn đã đặt từ 5 lần trở lên</p>
                </div>
              </div>

              {isAllOrdersLoading ? (
                <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin"></div></div>
              ) : favouriteOrders.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <ShoppingBagIcon className="w-8 h-8 text-gray-300" />
                  </div>
                  <h4 className="text-gray-900 font-bold mb-2">Chưa có đơn hàng yêu thích nào</h4>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">Khi bạn đặt cùng một danh sách các món ăn từ 5 lần trở lên, đơn hàng đó sẽ tự động xuất hiện ở đây để bạn dễ dàng đặt lại!</p>
                  <button onClick={() => window.location.href = '/order'} className="mt-6 px-6 py-2.5 bg-[#b22830] text-white rounded-full font-bold text-sm hover:bg-[#8a1f25] transition-colors shadow-md shadow-red-900/20">
                    Bắt đầu đặt món ngay
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {favouriteOrders.map((fav, index) => (
                    <div key={fav.hash} className="border border-gray-200 rounded-xl p-4 flex flex-col justify-between hover:border-red-300 hover:shadow-md transition-all group bg-white">
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-[#b22830] text-xs font-bold border border-red-100">
                            <HeartSolidIcon className="w-3.5 h-3.5" /> Đã đặt {fav.count} lần
                          </span>
                          <span className="text-xs text-gray-400 font-medium">Lần cuối: {new Date(fav.lastOrderedAt).toLocaleDateString('vi-VN')}</span>
                        </div>
                        
                        <div className="space-y-2 mb-4">
                          {fav.items.map((item, i) => (
                            <div key={i} className="flex gap-3">
                              <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden flex-shrink-0 border border-gray-200">
                                {item.hinh_anh_url ? (
                                  <img src={item.hinh_anh_url} alt={item.ten_san_pham} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No img</div>
                                )}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-bold text-gray-800 leading-tight mb-0.5">{item.so_luong}x {item.ten_san_pham}</p>
                                <p className="text-xs text-gray-500">Size: {item.size}{item.tuy_chon ? ` | ${item.tuy_chon}` : ''}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5 font-medium">Tổng tiền ước tính</p>
                          <p className="text-base font-black text-[#b22830]">{Number(fav.total).toLocaleString('vi-VN')}đ</p>
                        </div>
                        <button
                          onClick={() => handleReorderFavourite(fav.items)}
                          className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-full hover:bg-gray-800 transition-colors shadow-sm active:scale-95"
                        >
                          Đặt lại đơn này
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'wallet' ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-md shadow-gray-100/50">
              <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                  <BookmarkIcon className="w-5 h-5 text-[#b22830]" />
                  <h3 className="text-base font-black uppercase text-gray-800 tracking-wide">Ví điện tử</h3>
                </div>
              </div>

              {isWalletLoading ? (
                <div className="space-y-4">
                  <div className="h-24 animate-pulse rounded-2xl bg-gray-100"></div>
                  <div className="h-12 animate-pulse rounded-2xl bg-gray-100"></div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Balance Card */}
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#b22830] to-[#8f1d24] p-6 shadow-lg shadow-red-900/20">
                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-white/80 uppercase tracking-widest mb-1">Số dư khả dụng</p>
                        <p className="text-3xl font-black text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                          {Number(walletData?.wallet?.balance || 0).toLocaleString('vi-VN')} đ
                        </p>
                      </div>
                    </div>
                    {/* Background Pattern */}
                    <div className="absolute top-0 right-0 -mt-10 -mr-10 opacity-10">
                      <svg className="w-48 h-48" viewBox="0 0 100 100" fill="currentColor">
                        <circle cx="50" cy="50" r="50" fill="white" />
                      </svg>
                    </div>
                  </div>



                  {/* Top-up Form */}
                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-5">
                    <h4 className="text-sm font-black uppercase tracking-wide text-gray-800 mb-3">Nạp tiền vào ví</h4>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const amount = Number(topUpAmount);
                        if (amount >= 10000 && amount <= 5000000) {
                          topUpMutation.mutate(amount);
                        } else {
                          alert('Số tiền nạp phải từ 10,000đ đến 5,000,000đ');
                        }
                      }}
                      className="flex flex-col md:flex-row gap-3"
                    >
                      <div className="flex-1 relative">
                        <input
                          type="number"
                          placeholder="Nhập số tiền cần nạp..."
                          value={topUpAmount}
                          onChange={(e) => setTopUpAmount(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 pl-4 pr-10 py-3 text-sm font-bold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all bg-white"
                          min="10000"
                          max="5000000"
                          step="1000"
                          required
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">đ</span>
                      </div>
                      <button
                        type="submit"
                        disabled={topUpMutation.isPending}
                        className="rounded-xl bg-[#b22830] hover:bg-[#8f1d24] px-6 py-3 text-sm font-black uppercase tracking-wide text-white shadow-md transition-all cursor-pointer whitespace-nowrap"
                      >
                        {topUpMutation.isPending ? 'Đang xử lý...' : 'Nạp qua VNPAY'}
                      </button>
                    </form>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {[50000, 100000, 200000, 500000].map(amount => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setTopUpAmount(amount.toString())}
                          className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:border-[#b22830] hover:text-[#b22830] transition-colors cursor-pointer"
                        >
                          {amount.toLocaleString('vi-VN')} đ
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Transactions History */}
                  <div>
                    <h4 className="text-sm font-black uppercase tracking-wide text-gray-800 mb-4">Lịch sử giao dịch</h4>
                    <div className="space-y-3">
                      {walletData?.transactions?.length > 0 ? (
                        walletData.transactions.map((tx) => (
                          <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white hover:border-gray-200 transition-colors">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${['TOP_UP', 'REFUND'].includes(tx.type) ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                {['TOP_UP', 'REFUND'].includes(tx.type) ? (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" /></svg>
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-bold text-gray-800">
                                  {tx.type === 'TOP_UP' ? 'Nạp tiền vào ví' : tx.type === 'REFUND' ? 'Hoàn tiền đơn hàng' : 'Thanh toán đơn hàng'}
                                </p>
                                <p className="text-xs font-medium text-gray-500 mt-0.5">
                                  {new Date(tx.created_at).toLocaleString('vi-VN')}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-black ${['TOP_UP', 'REFUND'].includes(tx.type) ? 'text-green-600' : 'text-gray-800'}`}>
                                {['TOP_UP', 'REFUND'].includes(tx.type) ? '+' : '-'}{Number(tx.amount).toLocaleString('vi-VN')} đ
                              </p>
                              <span className={`inline-block mt-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                tx.status === 'SUCCESS' ? 'bg-green-50 text-green-700' : tx.status === 'PENDING' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                              }`}>
                                {tx.status === 'SUCCESS' ? 'Thành công' : tx.status === 'PENDING' ? 'Đang chờ' : 'Thất bại'}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-6">Chưa có giao dịch nào.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === 'gift-cards' ? (
            <MyGiftCardsTab />
          ) : activeTab === 'reviews' ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-md shadow-gray-100/50">
              <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                  <StarOutlineIcon className="w-5 h-5 text-amber-500" />
                  <h3 className="text-base font-black uppercase text-gray-800 tracking-wide">Lịch sử đánh giá</h3>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-100/30 px-3.5 py-1.5 text-xs font-black uppercase tracking-wide text-[#b22830] shadow-sm">
                  {myReviews.length} đánh giá
                </div>
              </div>

              {isReviewsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((item) => (
                    <div key={item} className="h-20 animate-pulse rounded-2xl bg-gray-50"></div>
                  ))}
                </div>
              ) : isReviewsError ? (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
                  {reviewsError?.response?.data?.message || 'Không thể tải lịch sử đánh giá.'}
                </div>
              ) : myReviews.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
                  <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                    <StarOutlineIcon className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm font-black uppercase tracking-wide text-gray-600">Bạn chưa có đánh giá nào</p>
                  <p className="mt-2 text-xs font-semibold text-gray-400 max-w-xs mx-auto">Hãy đánh giá sản phẩm từ lịch sử đơn hàng để theo dõi tại đây.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myReviews.map((review) => (
                    <div key={review.id} className="rounded-2xl border border-gray-100 bg-white p-5 hover:border-gray-200 hover:shadow-sm transition-all duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3 mb-3">
                        <div className="flex items-center gap-2">
                          <ShoppingBagIcon className="w-4 h-4 text-gray-400" />
                          <p className="text-xs font-black uppercase tracking-wider text-gray-700">Sản phẩm #{review.ma_san_pham}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-400 font-semibold">
                          <ClockIcon className="w-3.5 h-3.5" />
                          <span>{new Date(review.ngay_cap_nhat || review.ngay_tao).toLocaleString('vi-VN')}</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-0.5 mb-2.5">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const isFilled = i < Number(review.so_sao || 0);
                          return isFilled ? (
                            <StarSolidIcon key={i} className="w-4.5 h-4.5 text-amber-400" />
                          ) : (
                            <StarOutlineIcon key={i} className="w-4.5 h-4.5 text-gray-200" />
                          );
                        })}
                      </div>
                      
                      <p className="text-sm font-semibold text-gray-600 bg-gray-50/50 border border-gray-200/40 rounded-2xl p-4 shadow-inner">
                        {review.binh_luan || 'Không có bình luận.'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'membership' ? (
            <MembershipPage user={profileUser} onNavigate={(tab) => setActiveTab(tab)} />
          ) : activeTab === 'lucky-wheel' ? (
            <LuckyWheelPage user={profileUser} onNavigate={(tab) => setActiveTab(tab)} />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Form */}
              <div className="lg:col-span-7 rounded-2xl border border-gray-200/90 bg-white p-6 shadow-2xs">
                <form onSubmit={handleChangePassword} className="space-y-5">
                  <div className="flex items-center gap-2.5 border-b border-gray-100 pb-4 mb-2">
                    <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center text-[#b22830] border border-red-100 shrink-0">
                      <ShieldCheckIcon className="w-5 h-5 text-[#b22830]" />
                    </div>
                    <div>
                      <h3 className="text-base font-black uppercase text-gray-900 tracking-wide font-sans">Đổi mật khẩu tài khoản</h3>
                      <p className="text-xs font-semibold text-gray-500 mt-0.5">Đặt mật khẩu mạnh để bảo vệ thông tin tài khoản của bạn</p>
                    </div>
                  </div>
                  
                  {/* Current Password */}
                  <div>
                    <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-gray-700">
                      Mật khẩu hiện tại <span className="text-[#b22830]">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPassword ? "text" : "password"}
                        required
                        placeholder="Nhập mật khẩu hiện tại của bạn"
                        value={passwordForm.currentPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200/90 pl-10 pr-11 py-3 text-xs font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-red-100 transition-all duration-200 bg-white text-gray-800"
                      />
                      <KeyIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-0.5"
                        title={showCurrentPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showCurrentPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div>
                    <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-gray-700">
                      Mật khẩu mới <span className="text-[#b22830]">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPassword ? "text" : "password"}
                        required
                        placeholder="Mật khẩu mới (tối thiểu 6 ký tự)"
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200/90 pl-10 pr-11 py-3 text-xs font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-red-100 transition-all duration-200 bg-white text-gray-800"
                      />
                      <KeyIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-0.5"
                        title={showNewPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showNewPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Password Strength Meter */}
                    {passwordForm.newPassword && (
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-gray-500 font-semibold">Độ mạnh mật khẩu:</span>
                          <span className={`font-bold ${
                            passwordForm.newPassword.length < 6 
                              ? 'text-rose-600' 
                              : passwordForm.newPassword.length < 8 || !/[0-9]/.test(passwordForm.newPassword)
                              ? 'text-amber-600' 
                              : 'text-emerald-600'
                          }`}>
                            {passwordForm.newPassword.length < 6 ? 'Yếu' : passwordForm.newPassword.length < 8 || !/[0-9]/.test(passwordForm.newPassword) ? 'Trung bình' : 'Mạnh'}
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full transition-all duration-300 rounded-full ${
                            passwordForm.newPassword.length < 6 
                              ? 'w-1/3 bg-rose-500' 
                              : passwordForm.newPassword.length < 8 || !/[0-9]/.test(passwordForm.newPassword)
                              ? 'w-2/3 bg-amber-500' 
                              : 'w-full bg-emerald-500'
                          }`}></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wider text-gray-700">
                      Xác nhận mật khẩu mới <span className="text-[#b22830]">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        placeholder="Xác nhận lại mật khẩu mới"
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        className="w-full rounded-xl border border-gray-200/90 pl-10 pr-11 py-3 text-xs font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-red-100 transition-all duration-200 bg-white text-gray-800"
                      />
                      <KeyIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-0.5"
                        title={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showConfirmPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Security Requirements Checklist */}
                  <div className="rounded-xl bg-gray-50/80 border border-gray-100 p-3 space-y-1.5 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      {passwordForm.newPassword.length >= 6 ? (
                        <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                      <span className={passwordForm.newPassword.length >= 6 ? 'text-emerald-700 font-semibold' : 'text-gray-500'}>Mật khẩu dài ít nhất 6 ký tự</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {passwordForm.confirmPassword && passwordForm.newPassword === passwordForm.confirmPassword ? (
                        <CheckCircleIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <XCircleIcon className="w-4 h-4 text-gray-400 shrink-0" />
                      )}
                      <span className={passwordForm.confirmPassword && passwordForm.newPassword === passwordForm.confirmPassword ? 'text-emerald-700 font-semibold' : 'text-gray-500'}>Mật khẩu xác nhận trùng khớp</span>
                    </div>
                  </div>

                  {passwordError ? (
                    <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                      <ExclamationTriangleIcon className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{passwordError}</span>
                    </div>
                  ) : null}

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={changePasswordMutation.isPending}
                      className="w-full sm:w-auto rounded-xl bg-[#b22830] hover:bg-[#8f1d24] px-7 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:shadow-md transition-all duration-200 disabled:bg-gray-300 cursor-pointer active:scale-95 flex items-center justify-center gap-2"
                    >
                      <ShieldCheckIcon className="w-4 h-4" />
                      {changePasswordMutation.isPending ? 'Đang xử lý...' : 'Cập nhật mật khẩu'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: Security Tips Card */}
              <div className="lg:col-span-5 space-y-4">
                <div className="rounded-2xl border border-gray-200/90 bg-white p-6 shadow-2xs">
                  <div className="flex items-center gap-2 border-b border-gray-100 pb-3.5 mb-4">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-200/60 shrink-0">
                      <LockClosedIcon className="w-4 h-4 text-amber-600" />
                    </div>
                    <h3 className="text-sm font-extrabold uppercase text-gray-900 tracking-wide font-sans">Khuyên dùng bảo mật</h3>
                  </div>

                  <ul className="space-y-3.5 text-xs text-gray-600 font-medium">
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-red-50 text-[#b22830] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">1</span>
                      <span>Mật khẩu nên chứa cả <strong>chữ cái, chữ số & ký tự đặc biệt</strong> (!@#$) để đạt độ bảo mật tối đa.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-red-50 text-[#b22830] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">2</span>
                      <span>Không sử dụng lại mật khẩu giống với các tài khoản mạng xã hội hoặc email cá nhân khác.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-red-50 text-[#b22830] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">3</span>
                      <span>Thay đổi mật khẩu định kỳ <strong>3 - 6 tháng/lần</strong> để giữ an toàn cho ví quà tặng và điểm thưởng.</span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-red-50 text-[#b22830] flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">4</span>
                      <span>Không chia sẻ mã OTP hoặc mật khẩu đăng nhập cho bất kỳ ai, kể cả nhân viên hỗ trợ.</span>
                    </li>
                  </ul>
                </div>

                {/* Account Protection Status */}
                <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0 border border-emerald-200">
                    <CheckCircleIcon className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase text-emerald-900">Tài khoản được bảo vệ</p>
                    <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">Chưa phát hiện hoạt động đăng nhập bất thường nào</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
