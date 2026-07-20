import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon, CheckBadgeIcon } from '@heroicons/react/24/solid';


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
  const [profileForm, setProfileForm] = useState({ hoTen: '', soDienThoai: '', avatarUrl: '' });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
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
    membership: <IdentificationIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    'lucky-wheel': <GiftIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    addresses: <MapPinIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    reviews: <StarOutlineIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
    password: <KeyIcon className="w-4.5 h-4.5" strokeWidth={2.5} />,
  };

  return (
    <div className="flex flex-col w-full bg-[#faf8f5]">
      <div className="mx-auto w-full max-w-[1240px] px-4 md:px-6 py-6 md:py-10 space-y-6 min-h-[500px]">
        {/* Header Greeting */}
        <div className="border-b border-gray-200/80 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black uppercase text-[#2b2b2b] tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>Trang tài khoản</h2>
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
              { id: 'membership', label: 'Hạng thành viên', iconId: 'membership' },
              { id: 'lucky-wheel', label: 'Vòng quay', iconId: 'lucky-wheel' },
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

                  <form onSubmit={handleUpdateProfile} className="space-y-5">
                    {/* Avatar preview and edit url field */}
                    <div className="flex flex-col sm:flex-row items-center gap-6 p-5 rounded-2xl bg-gray-50/70 border border-gray-200/50">
                      <div className="relative group shrink-0">
                        <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-md relative bg-gradient-to-tr from-[#c41230] to-[#c89a58] flex items-center justify-center text-white text-3xl font-black">
                          {profileForm.avatarUrl ? (
                            <img src={profileForm.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <span>{(profileForm.hoTen || profileUser?.username || 'B')[0].toUpperCase()}</span>
                          )}
                        </div>
                        <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <CameraIcon className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 w-full space-y-2">
                        <h4 className="text-xs font-black uppercase text-gray-700 tracking-wider">Ảnh đại diện tài khoản</h4>
                        <p className="text-[11px] font-semibold text-gray-400">Dán link (URL) hình ảnh từ mạng xã hội hoặc internet để cập nhật ảnh đại diện.</p>
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="https://example.com/avatar.png"
                            value={profileForm.avatarUrl}
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                            className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-2.5 text-xs font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                          />
                          <CameraIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Tên đăng nhập</p>
                        <div className="relative">
                          <input
                            type="text"
                            disabled
                            value={profile?.ten_dang_nhap || ''}
                            className="w-full rounded-xl border border-gray-200/60 bg-gray-50/70 pl-10 pr-10 py-3.5 text-sm font-semibold text-gray-400 outline-none"
                          />
                          <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <LockClosedIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Email</p>
                        <div className="relative">
                          <input
                            type="email"
                            disabled
                            value={profile?.email || ''}
                            className="w-full rounded-xl border border-gray-200/60 bg-gray-50/70 pl-10 pr-10 py-3.5 text-sm font-semibold text-gray-400 outline-none"
                          />
                          <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <LockClosedIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Họ và tên</p>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            value={profileForm.hoTen}
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, hoTen: e.target.value }))}
                            className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3.5 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                          />
                          <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Số điện thoại</p>
                        <div className="relative">
                          <input
                            type="tel"
                            value={profileForm.soDienThoai}
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, soDienThoai: e.target.value }))}
                            className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3.5 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                          />
                          <PhoneIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        </div>
                      </div>
                    </div>

                    {profileError ? (
                      <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                        <ExclamationTriangleIcon className="w-5 h-5" />
                        <span>{profileError}</span>
                      </div>
                    ) : null}

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={updateProfileMutation.isPending}
                        className="rounded-xl bg-[#b22830] hover:bg-[#8f1d24] px-6 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-red-950/10 hover:shadow-lg transition-all duration-200 disabled:bg-gray-300 cursor-pointer active:scale-95 transform"
                      >
                        {updateProfileMutation.isPending ? 'Đang xử lý...' : 'Lưu thay đổi'}
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
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-md shadow-gray-100/50">
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-3 mb-4">
                  <LockClosedIcon className="w-5 h-5 text-[#b22830]" />
                  <h3 className="text-base font-black uppercase text-gray-800 tracking-wide">Đổi mật khẩu tài khoản</h3>
                </div>
                
                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Mật khẩu hiện tại</p>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      placeholder="Nhập mật khẩu hiện tại của bạn"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3.5 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                    />
                    <KeyIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Mật khẩu mới</p>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      placeholder="Mật khẩu mới ít nhất 6 ký tự"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3.5 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                    />
                    <KeyIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">Xác nhận mật khẩu mới</p>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      placeholder="Xác nhận lại mật khẩu mới"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 pl-10 pr-4 py-3.5 text-sm font-semibold outline-none focus:border-[#b22830] focus:ring-2 focus:ring-[#b22830]/10 transition-all duration-200 bg-white"
                    />
                    <KeyIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  </div>
                </div>

                {passwordError ? (
                  <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                    <ExclamationTriangleIcon className="w-5 h-5" />
                    <span>{passwordError}</span>
                  </div>
                ) : null}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={changePasswordMutation.isPending}
                    className="rounded-xl bg-[#b22830] hover:bg-[#8f1d24] px-6 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-md shadow-red-950/10 hover:shadow-lg transition-all duration-200 disabled:bg-gray-300 cursor-pointer active:scale-95 transform"
                  >
                    {changePasswordMutation.isPending ? 'Đang xử lý...' : 'Đổi mật khẩu'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
