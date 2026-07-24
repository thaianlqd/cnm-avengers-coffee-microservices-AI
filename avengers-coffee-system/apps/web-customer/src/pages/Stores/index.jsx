import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import {
  MagnifyingGlassIcon,
  MapPinIcon,
  PhoneIcon,
  ClockIcon,
  WifiIcon,
  CreditCardIcon,
  InformationCircleIcon,
  ArrowTopRightOnSquareIcon,
  XMarkIcon,
  ArrowLeftIcon,
  PencilSquareIcon,
  ChatBubbleLeftRightIcon,
  BuildingOffice2Icon,
  HomeModernIcon,
  BuildingStorefrontIcon,
} from '@heroicons/react/24/outline';
import { apiClient } from '../../lib/apiClient';
import BranchReviewModal from '../../components/BranchReviewModal';

// Helper functions
function normalizeLocationText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCityName(value) {
  const original = String(value || '').trim();
  const normalized = normalizeLocationText(original);

  if (!normalized) return 'Hồ Chí Minh';
  if (normalized.includes('ho chi minh') || normalized.includes('tp hcm') || normalized === 'hcm') return 'Hồ Chí Minh';
  if (normalized.includes('ha noi') || normalized === 'hn') return 'Hà Nội';
  if (normalized.includes('da nang')) return 'Đà Nẵng';
  if (normalized.includes('can tho')) return 'Cần Thơ';
  if (normalized.includes('hai phong')) return 'Hải Phòng';

  return original;
}

function buildMapEmbedUrl(address) {
  return `https://www.google.com/maps?q=${encodeURIComponent(String(address || ''))}&output=embed`;
}

export default function StoresPage() {
  const { data: publicBranchPayload, isLoading: isStoresLoading } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      const response = await apiClient.get('/users/branches/public');
      return response.data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 120 * 1000,
  });

  const { data: branchStatsPayload } = useQuery({
    queryKey: ['branch-reviews-stats'],
    queryFn: async () => {
      const res = await apiClient.get('/branch-reviews/stats');
      return res.data;
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  const branchStatsMap = useMemo(() => {
    const map = {};
    (branchStatsPayload || []).forEach((item) => {
      if (item.ma_chi_nhanh) {
        map[item.ma_chi_nhanh.toUpperCase()] = item;
      }
    });
    return map;
  }, [branchStatsPayload]);

  const stores = useMemo(() => {
    return (publicBranchPayload?.items || []).map((branch, index) => {
      const openTime = String(branch?.gio_mo_cua || '').trim();
      const closeTime = String(branch?.gio_dong_cua || '').trim();
      const fallbackHours = openTime || closeTime ? `${openTime || '--:--'} - ${closeTime || '--:--'}` : '07:00 - 22:00';
      const city = normalizeCityName(branch?.thanh_pho || branch?.dia_chi);
      const code = String(branch?.ma_chi_nhanh || `branch-${index + 1}`);
      const stats = branchStatsMap[code.toUpperCase()];

      return {
        id: code,
        code,
        city,
        district: String(branch?.quan_huyen || '').trim() || 'Chưa phân loại',
        name: String(branch?.ten_chi_nhanh || '').trim() || `Chi nhánh ${index + 1}`,
        address: String(branch?.dia_chi || '').trim() || 'Đang cập nhật địa chỉ',
        hours: fallbackHours,
        phone: branch?.so_dien_thoai || '1900 1755',
        rating: stats?.diem_trung_binh || 5.0,
        reviewCount: stats?.tong_luot_danh_gia || 0,
      };
    });
  }, [publicBranchPayload, branchStatsMap]);

  const [selectedCity, setSelectedCity] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [detailedStore, setDetailedStore] = useState(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef(null);

  const { data: detailedBranchReviews, refetch: refetchDetailedReviews } = useQuery({
    queryKey: ['branch-reviews-detail', detailedStore?.code],
    queryFn: async () => {
      if (!detailedStore?.code) return null;
      const res = await apiClient.get(`/branch-reviews/branch/${detailedStore.code}`);
      return res.data;
    },
    enabled: !!detailedStore?.code,
  });

  useEffect(() => {
    function handleClickOutside(event) {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const cities = useMemo(() => {
    const citySet = new Set(stores.map(s => s.city).filter(Boolean));
    return ['ALL', ...Array.from(citySet).sort()];
  }, [stores]);

  const districts = useMemo(() => {
    if (selectedCity === 'ALL') return [];
    const districtSet = new Set(stores.filter(s => s.city === selectedCity).map(s => s.district).filter(Boolean));
    return ['ALL', ...Array.from(districtSet).sort()];
  }, [stores, selectedCity]);

  const filteredStores = useMemo(() => {
    return stores.filter(store => {
      if (selectedCity !== 'ALL' && store.city !== selectedCity) return false;
      if (selectedDistrict !== 'ALL' && store.district !== selectedDistrict) return false;
      if (searchQuery) {
        const query = normalizeLocationText(searchQuery);
        const name = normalizeLocationText(store.name);
        const address = normalizeLocationText(store.address);
        const city = normalizeLocationText(store.city);
        const district = normalizeLocationText(store.district);
        if (!name.includes(query) && !address.includes(query) && !city.includes(query) && !district.includes(query)) return false;
      }
      return true;
    });
  }, [stores, selectedCity, selectedDistrict, searchQuery]);

  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = normalizeLocationText(searchQuery);
    
    const matchingCities = cities
      .filter(c => c !== 'ALL' && normalizeLocationText(c).includes(query))
      .map(c => ({ type: 'city', text: c, value: c }));
    
    const allDistricts = Array.from(new Set(stores.map(s => s.district).filter(Boolean)));
    const matchingDistricts = allDistricts
      .filter(d => normalizeLocationText(d).includes(query))
      .map(d => ({ type: 'district', text: d, value: d }));

    const matchingStoreItems = stores.filter(s => {
      const name = normalizeLocationText(s.name);
      const addr = normalizeLocationText(s.address);
      return name.includes(query) || addr.includes(query);
    }).slice(0, 5).map(s => ({ type: 'store', text: s.name, subtext: s.address, value: s }));

    return [...matchingCities.slice(0, 2), ...matchingDistricts.slice(0, 3), ...matchingStoreItems];
  }, [searchQuery, cities, stores]);

  // Set default selected store ONLY when filtered stores change (not on manual deselect)
  useEffect(() => {
    if (filteredStores.length > 0 && (!selectedStore || !filteredStores.find(s => s.id === selectedStore.id))) {
      setSelectedStore(filteredStores[0]);
    } else if (filteredStores.length === 0 && selectedStore !== null) {
      setSelectedStore(null);
    }
  }, [filteredStores]);

  return (
    <div className="flex flex-col h-[calc(100vh-84px)] bg-white mt-[84px]">
      {/* Detailed Store View */}
      {detailedStore ? (
        <div className="flex-1 overflow-y-auto bg-gray-50 pb-16">
          <div 
            className="bg-[#b22830] h-14 flex items-center px-6 w-full cursor-pointer hover:bg-red-800 transition-colors shadow-md"
            onClick={() => setDetailedStore(null)}
          >
            <span className="text-white text-sm font-bold flex items-center gap-2">
              <ArrowLeftIcon className="w-5 h-5 text-white" />
              Quay lại danh sách cửa hàng
            </span>
          </div>

          <div className="max-w-[1000px] mx-auto mt-8 space-y-6 px-4">
            {/* Store Banner & Meta */}
            <div className="bg-white p-8 shadow-sm rounded-2xl flex flex-col md:flex-row gap-10 border border-gray-100">
              <div className="bg-[#b22830] flex-1 flex items-center justify-center p-10 min-h-[260px] rounded-2xl">
                <img 
                  src="/hc-assets/red_BG_logo800.png" 
                  alt="Avengers Coffee" 
                  className="w-[80%] max-w-[260px] object-contain" 
                  onError={(e) => e.currentTarget.style.display = 'none'} 
                />
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-amber-100 text-amber-900 text-xs font-black px-3 py-1 rounded-full flex items-center gap-1.5 border border-amber-200">
                      <StarIconSolid className="w-4 h-4 text-amber-500" />
                      {detailedBranchReviews?.diem_trung_binh || detailedStore.rating || 5.0} / 5.0
                    </span>
                    <span className="text-xs text-gray-500 font-medium">
                      ({detailedBranchReviews?.tong_luot_danh_gia || detailedStore.reviewCount || 0} đánh giá)
                    </span>
                  </div>
                  <h2 className="text-[22px] font-black uppercase text-[#333333] mb-4">{detailedStore.name}</h2>
                  <div className="space-y-3">
                    <div className="flex border-b border-gray-100 pb-3">
                      <span className="text-[#a51a1a] w-24 text-[13px] font-bold flex items-center gap-1.5">
                        <MapPinIcon className="w-4 h-4 text-[#a51a1a]" />
                        Địa chỉ
                      </span>
                      <p className="text-[#333333] text-[14px] flex-1 font-medium">{detailedStore.address}</p>
                    </div>
                    <div className="flex border-b border-gray-100 pb-3">
                      <span className="text-[#a51a1a] w-24 text-[13px] font-bold flex items-center gap-1.5">
                        <PhoneIcon className="w-4 h-4 text-[#a51a1a]" />
                        Hotline
                      </span>
                      <p className="text-[#333333] text-[14px] flex-1 font-medium">{detailedStore.phone}</p>
                    </div>
                    <div className="pt-2 flex flex-wrap gap-4 text-[13px] text-gray-700 font-medium">
                      <span className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                        <WifiIcon className="w-4 h-4 text-blue-600" /> Wifi Miễn Phí
                      </span>
                      <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                        <CreditCardIcon className="w-4 h-4 text-emerald-600" /> Thanh toán thẻ
                      </span>
                      <span className="flex items-center gap-1.5 text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100">
                        <ClockIcon className="w-4 h-4 text-amber-600" /> {detailedStore.hours}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsReviewModalOpen(true)}
                    className="flex-1 bg-[#b22830] hover:bg-red-800 text-white text-xs font-black uppercase py-3 rounded-full transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    <PencilSquareIcon className="w-4 h-4 text-white" />
                    Viết Đánh Giá Chi Nhánh
                  </button>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailedStore.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 bg-[#5c3a21] hover:bg-[#4a2e1a] text-white text-xs font-black uppercase py-3 rounded-full transition-all text-center flex items-center justify-center gap-2"
                  >
                    <ArrowTopRightOnSquareIcon className="w-4 h-4 text-white" />
                    Xem Chỉ Đường
                  </a>
                </div>
              </div>
            </div>

            {/* Criteria Breakdown & Reviews List */}
            <div className="bg-white p-8 shadow-sm rounded-2xl border border-gray-100 space-y-6">
              <h3 className="text-lg font-black uppercase text-gray-800 tracking-wide border-b border-gray-100 pb-3 flex items-center gap-2">
                <ChatBubbleLeftRightIcon className="w-6 h-6 text-[#b22830]" />
                Đánh giá & Nhận xét của Khách hàng ({detailedBranchReviews?.tong_luot_danh_gia || 0})
              </h3>

              {/* Criteria Scores */}
              {detailedBranchReviews && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-amber-50/50 p-4 rounded-2xl border border-amber-100/60">
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500 uppercase">Thái độ phục vụ</p>
                    <p className="text-xl font-black text-amber-700 mt-1 flex items-center justify-center gap-1">
                      <StarIconSolid className="w-5 h-5 text-amber-500" />
                      {detailedBranchReviews.tieu_chi_trung_binh?.phuc_vu || 5.0}
                    </p>
                  </div>
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500 uppercase">Không gian & Vệ sinh</p>
                    <p className="text-xl font-black text-amber-700 mt-1 flex items-center justify-center gap-1">
                      <StarIconSolid className="w-5 h-5 text-amber-500" />
                      {detailedBranchReviews.tieu_chi_trung_binh?.ve_sinh || 5.0}
                    </p>
                  </div>
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500 uppercase">Tốc độ lên món</p>
                    <p className="text-xl font-black text-amber-700 mt-1 flex items-center justify-center gap-1">
                      <StarIconSolid className="w-5 h-5 text-amber-500" />
                      {detailedBranchReviews.tieu_chi_trung_binh?.toc_do || 5.0}
                    </p>
                  </div>
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500 uppercase">Chất lượng đồ uống</p>
                    <p className="text-xl font-black text-amber-700 mt-1 flex items-center justify-center gap-1">
                      <StarIconSolid className="w-5 h-5 text-amber-500" />
                      {detailedBranchReviews.tieu_chi_trung_binh?.chat_luong_mon || 5.0}
                    </p>
                  </div>
                </div>
              )}

              {/* Reviews Items */}
              <div className="space-y-4">
                {(detailedBranchReviews?.items || []).length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <StarIconSolid className="w-10 h-10 text-amber-300 mx-auto" />
                    <p className="text-sm font-medium">Chưa có đánh giá nào cho chi nhánh này. Hãy là người đầu tiên để lại đánh giá!</p>
                  </div>
                ) : (
                  (detailedBranchReviews?.items || []).map((review) => (
                    <div key={review.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-gray-900">{review.ten_nguoi_dung || 'Khách hàng'}</span>
                          <span className="bg-amber-100 text-amber-800 text-[11px] font-black px-2 py-0.5 rounded-md flex items-center gap-1">
                            <StarIconSolid className="w-3.5 h-3.5 text-amber-500" />
                            {review.diem_tong_quan}/5
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 font-medium">
                          {new Date(review.ngay_tao).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                      {review.nhan_xet && (
                        <p className="text-xs font-medium text-gray-700 leading-relaxed italic bg-white p-3 rounded-xl border border-gray-100">
                          "{review.nhan_xet}"
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
      <>
      {/* Top Filter Bar */}
      <div className="w-full bg-[#f9f9f9] py-4 px-6 shadow-sm border-b border-gray-200 z-10">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-center gap-3">
          <select 
            className="h-10 px-4 bg-white border border-gray-300 rounded-[3px] text-[13px] text-[#333] font-medium outline-none focus:border-[#5c3a21] min-w-[140px] appearance-none"
            disabled
          >
            <option value="ALL">Việt Nam</option>
          </select>
          <select 
            className="h-10 px-4 bg-white border border-gray-300 rounded-[3px] text-[13px] text-[#333] font-medium outline-none focus:border-[#5c3a21] min-w-[160px]"
            value={selectedCity}
            onChange={(e) => {
              setSelectedCity(e.target.value);
              setSelectedDistrict('ALL');
            }}
          >
            <option value="ALL">Chọn Thành phố</option>
            {cities.filter(c => c !== 'ALL').map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select 
            className="h-10 px-4 bg-white border border-gray-300 rounded-[3px] text-[13px] text-[#333] font-medium outline-none focus:border-[#5c3a21] min-w-[160px]"
            value={selectedDistrict}
            onChange={(e) => setSelectedDistrict(e.target.value)}
            disabled={selectedCity === 'ALL'}
          >
            <option value="ALL">Chọn Quận/Huyện</option>
            {districts.filter(d => d !== 'ALL').map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select className="h-10 px-4 bg-white border border-gray-300 rounded-[3px] text-[13px] text-[#333] font-medium outline-none focus:border-[#5c3a21] min-w-[120px]">
            <option value="ALL">Tiện ích</option>
          </select>

          <div className="relative flex items-center w-[300px] ml-2" ref={searchInputRef}>
            <div className="flex items-center w-full bg-white rounded-[3px] border border-gray-300 overflow-hidden focus-within:border-[#5c3a21] shadow-sm">
              <input 
                type="text" 
                placeholder="Nhập địa chỉ, tên đường, quận, thành phố..."
                value={searchQuery}
                onFocus={() => setShowSuggestions(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                className="flex-1 h-10 px-4 text-[13px] font-medium text-[#333] outline-none"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')} 
                  className="px-3 text-gray-400 hover:text-[#a51a1a] transition-colors flex items-center justify-center" 
                  title="Xóa"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {/* Dropdown Autocomplete Menu */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 shadow-2xl rounded-md overflow-hidden z-[100] max-h-[400px] overflow-y-auto animate-fade-in">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  Gợi ý tìm kiếm
                </div>
                {suggestions.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="px-4 py-3 cursor-pointer hover:bg-red-50 border-b border-gray-50 last:border-none flex items-start gap-3 transition-colors"
                    onClick={() => {
                      if (item.type === 'city') {
                        setSelectedCity(item.value);
                        setSelectedDistrict('ALL');
                        setSearchQuery('');
                      } else if (item.type === 'district') {
                        const storeWithDistrict = stores.find(s => s.district === item.value);
                        if (storeWithDistrict) {
                          setSelectedCity(storeWithDistrict.city);
                          setSelectedDistrict(item.value);
                        }
                        setSearchQuery('');
                      } else if (item.type === 'store') {
                        setSelectedCity(item.value.city);
                        setSelectedDistrict(item.value.district);
                        setSelectedStore(item.value);
                      }
                      setShowSuggestions(false);
                    }}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {item.type === 'city' && <BuildingOffice2Icon className="w-5 h-5 text-gray-400" />}
                      {item.type === 'district' && <HomeModernIcon className="w-5 h-5 text-gray-400" />}
                      {item.type === 'store' && <MapPinIcon className="w-5 h-5 text-[#b22830]" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-bold text-[#333]">{item.text}</div>
                      {item.subtext && <div className="text-[12px] text-gray-500 mt-0.5 line-clamp-1">{item.subtext}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="h-10 px-6 bg-[#5c3a21] text-white text-[13px] font-bold rounded-[3px] hover:bg-[#4a2e1a] transition-colors whitespace-nowrap flex items-center gap-2">
            <MagnifyingGlassIcon className="w-4 h-4 text-white" />
            Tìm kiếm
          </button>
        </div>
      </div>

      {/* Main Content (Split View: Sidebar Left, Clean Map Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[420px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col shadow-sm">
          <div className="bg-[#f2f2f2] px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <p className="text-gray-600 font-medium italic text-[15px] flex items-center gap-2">
              <BuildingStorefrontIcon className="w-4 h-4 text-gray-500" />
              {isStoresLoading ? 'Đang tải danh sách...' : `Tìm được ${filteredStores.length} quán`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filteredStores.map(store => {
              const isSelected = selectedStore?.id === store.id;
              return (
                <div
                  key={store.id}
                  onClick={() => setSelectedStore(store)}
                  className={`w-full text-left p-6 transition-all cursor-pointer relative ${
                    isSelected 
                      ? 'bg-red-50/40 border-l-4 border-l-[#b22830] shadow-sm' 
                      : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h3 className={`uppercase font-bold text-[15px] mb-2 leading-snug ${isSelected ? 'text-[#b22830]' : 'text-[#333333]'}`}>
                      {store.name}
                    </h3>
                    <span className="bg-amber-100 text-amber-800 text-[11px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-200 flex-shrink-0 ml-2">
                      <StarIconSolid className="w-3.5 h-3.5 text-amber-500" />
                      {store.rating} ({store.reviewCount})
                    </span>
                  </div>

                  <div className="flex items-start gap-2.5 mt-2">
                    <MapPinIcon className="w-4 h-4 text-[#a51a1a] flex-shrink-0 mt-0.5" />
                    <p className="text-[#666666] text-[13px] leading-relaxed">{store.address}</p>
                  </div>

                  <div className="flex items-center gap-2.5 mt-2">
                    <PhoneIcon className="w-4 h-4 text-[#a51a1a] flex-shrink-0" />
                    <a href={`tel:${store.phone}`} onClick={(e) => e.stopPropagation()} className="text-[#666666] hover:text-[#b22830] text-[13px] font-medium">
                      {store.phone}
                    </a>
                  </div>

                  <div className="flex items-center gap-2.5 mt-2.5">
                    <span className="bg-[#a51a1a] text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">OPEN</span>
                    <ClockIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <p className="text-[#666666] text-[13px] font-medium">{store.hours}</p>
                  </div>

                  {/* Expanded Store Details right inside Left Sidebar when Selected */}
                  {isSelected && (
                    <div className="mt-4 pt-4 border-t border-red-200/60 space-y-3 animate-fade-in" onClick={(e) => e.stopPropagation()}>
                      {/* Amenities Pills */}
                      <div className="flex flex-wrap gap-2">
                        <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50/80 px-2.5 py-1 rounded-md border border-blue-100">
                          <WifiIcon className="w-3.5 h-3.5 text-blue-600" /> Wifi Miễn Phí
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50/80 px-2.5 py-1 rounded-md border border-emerald-100">
                          <CreditCardIcon className="w-3.5 h-3.5 text-emerald-600" /> Thanh toán bằng thẻ
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-2.5 pt-1">
                        <button 
                          type="button"
                          onClick={() => setDetailedStore(store)}
                          className="flex-1 bg-[#b22830] hover:bg-red-800 text-white text-[11px] font-black uppercase py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
                        >
                          <InformationCircleIcon className="w-4 h-4 text-white" />
                          Xem chi tiết & Đánh giá
                        </button>
                        <a 
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 bg-[#5c3a21] hover:bg-[#4a2e1a] text-white text-[11px] font-black uppercase py-2.5 rounded-xl transition-all shadow-sm text-center flex items-center justify-center gap-1.5"
                        >
                          <ArrowTopRightOnSquareIcon className="w-4 h-4 text-white" />
                          Tìm đường
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredStores.length === 0 && !isStoresLoading && (
              <div className="p-8 text-center text-gray-500 text-sm space-y-2">
                <BuildingStorefrontIcon className="w-10 h-10 text-gray-300 mx-auto" />
                <p>Không tìm thấy cửa hàng nào phù hợp với tìm kiếm của bạn.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Map View — 100% Clean Google Map without any overlapping popups */}
        <div className="flex-1 bg-gray-100 relative">
          {selectedStore ? (
            <iframe
              key={selectedStore.id}
              title={`Bản đồ ${selectedStore.name}`}
              src={buildMapEmbedUrl(selectedStore.address)}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="w-full h-full border-none"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 bg-[#e5e3df]">
              <div className="text-center space-y-2">
                <MapPinIcon className="w-12 h-12 text-gray-400 mx-auto animate-bounce" />
                <p className="text-sm font-medium">Vui lòng chọn cửa hàng từ danh sách để xem vị trí bản đồ</p>
              </div>
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* Review Modal */}
      {detailedStore && (
        <BranchReviewModal
          isOpen={isReviewModalOpen}
          onClose={() => setIsReviewModalOpen(false)}
          branchData={detailedStore}
          onSuccess={() => {
            refetchDetailedReviews();
          }}
        />
      )}
    </div>
  );
}
