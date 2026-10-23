import React, { useState, useMemo, useEffect, useRef } from 'react';
import { autocompletePlaces, resolveSuggestedPlace, placesConfigured } from '../../lib/storePlaces';
import { distanceKm } from '../../lib/maps/nearbyStores.mjs';
import { coordinates } from '../../lib/locationModel';
import LocationMap from '../../components/map/LocationMap';
import './style.css';
import {
  branchLocation,
  branchFilterOptions,
  filterBranches,
  normalizeLocationText,
  branchDisplayName,
  decodeHtmlEntities,
} from '../../lib/locationModel';
import { useLocationText } from '../../lib/locationText';
import { uiText as ui, useUiLanguage, uiLocale } from '../../lib/uiText';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  RiCupFill,
  RiMapPin2Fill,
  RiTimeLine,
  RiPhoneLine,
  RiStarFill,
  RiArrowRightUpLine,
  RiInformationLine,
  RiBuilding4Line,
  RiCommunityLine,
  RiStore2Line,
  RiSearchLine,
  RiArrowDownSLine,
  RiRestartLine,
  RiCloseLine,
  RiArrowLeftLine,
  RiChat1Line,
} from 'react-icons/ri';
import { apiClient } from '../../lib/apiClient';
import { Skeleton, StoreListSkeleton } from '../../components/common/Skeleton';

// Reusable Clean Searchable Select for Province and Ward
function FilterSelectDropdown({
  label,
  icon: Icon,
  value,
  placeholder,
  allLabel,
  options = [],
  counts = {},
  disabled = false,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const query = normalizeLocationText(search);
    return options.filter((opt) => normalizeLocationText(opt).includes(query));
  }, [options, search]);

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 h-4">
        {Icon && <Icon className="w-3.5 h-3.5 text-[#b22830]" />}
        <span className="truncate">{label}</span>
      </label>

      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
          setSearch('');
        }}
        className="h-11 w-full flex items-center justify-between px-3.5 rounded-xl border border-gray-200/90 bg-white hover:border-gray-300 focus:border-[#b22830] focus:ring-2 focus:ring-red-100/50 text-xs font-semibold text-gray-800 transition-all cursor-pointer disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed shadow-2xs text-left"
      >
        <span className="truncate">{value || placeholder}</span>
        <RiArrowDownSLine
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ml-1.5 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && !disabled && (
        <div className="absolute top-full left-0 w-full min-w-[220px] mt-1.5 bg-white border border-gray-200/90 rounded-2xl shadow-2xl p-2 z-[100] animate-fade-in flex flex-col max-h-72">
          {/* Search box inside dropdown */}
          <div className="relative mb-2 shrink-0">
            <RiSearchLine className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              autoFocus
              type="text"
              placeholder="Tìm kiếm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-3 text-xs rounded-lg border border-gray-200 bg-gray-50/70 focus:bg-white focus:border-[#b22830] outline-none font-medium"
            />
          </div>

          {/* Option list */}
          <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-xs rounded-lg transition-colors flex items-center justify-between ${
                !value
                  ? 'bg-red-50 text-[#b22830] font-bold'
                  : 'text-gray-700 hover:bg-gray-50 font-medium'
              }`}
            >
              <span>{allLabel}</span>
              {!value && <span className="w-1.5 h-1.5 rounded-full bg-[#b22830]" />}
            </button>

            {filteredOptions.map((opt) => {
              const isSelected = value === opt;
              const count = counts[opt];
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs rounded-lg transition-colors flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'bg-red-50 text-[#b22830] font-bold'
                      : 'text-gray-700 hover:bg-gray-50 font-medium'
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {count !== undefined && (
                      <span className="text-[10px] text-gray-400 font-normal">
                        ({count})
                      </span>
                    )}
                    {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#b22830]" />}
                  </div>
                </button>
              );
            })}

            {filteredOptions.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-gray-400">
                Không có lựa chọn phù hợp
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Custom Styled Dropdown for Store Types
function StoreTypeDropdown({ value, onChange, counts = {} }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  const options = [
    { value: 'ALL', label: 'Tất cả loại điểm bán' },
    { value: 'CHI_NHANH_CHINH', label: 'Cửa hàng chuẩn' },
    { value: 'KIOSK_VE_TINH', label: 'Điểm bán take-away' },
    { value: 'XE_NUOC_FRUIT', label: 'Xe đẩy tiện lợi' },
  ];

  const currentOption = options.find((opt) => opt.value === value) || options[0];

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 h-4">
        <RiStore2Line className="w-3.5 h-3.5 text-[#b22830]" />
        <span className="truncate">Loại điểm bán</span>
      </label>

      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-11 w-full flex items-center justify-between px-3.5 rounded-xl border border-gray-200/90 bg-white hover:border-gray-300 focus:border-[#b22830] focus:ring-2 focus:ring-red-100/50 text-xs font-semibold text-gray-800 transition-all cursor-pointer shadow-2xs text-left"
      >
        <span className="truncate">{currentOption.label}</span>
        <RiArrowDownSLine
          className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ml-1.5 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 w-full min-w-[210px] mt-1.5 bg-white border border-gray-200/90 rounded-2xl shadow-2xl p-2 z-[100] animate-fade-in flex flex-col">
          {options.map((opt) => {
            const isSelected = value === opt.value;
            const count = opt.value === 'ALL' ? counts.total : counts[opt.value];
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2 text-left text-xs rounded-lg transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                  isSelected
                    ? 'bg-red-50 text-[#b22830] font-bold'
                    : 'text-gray-700 hover:bg-gray-50 font-medium'
                }`}
              >
                <span className="truncate">{opt.label}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {count !== undefined && (
                    <span className="text-[10px] text-gray-400 font-normal">
                      ({count})
                    </span>
                  )}
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-[#b22830]" />}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function StoresPage() {
  useUiLanguage();
  const locationText = useLocationText();
  const { t } = useTranslation();

  const { data: publicBranchPayload, isLoading: isStoresLoading, isError: isStoresError, refetch: refetchStores } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      const response = await apiClient.get('/users/branches/public');
      return response.data;
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: branchStatsPayload } = useQuery({
    queryKey: ['branch-reviews-stats'],
    queryFn: async () => {
      const res = await apiClient.get('/branch-reviews/stats');
      return res.data;
    },
    staleTime: 10 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
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
    return (Array.isArray(publicBranchPayload) ? publicBranchPayload : publicBranchPayload?.items || []).map(
      (branch, index) => {
        const openTime = String(branch?.gio_mo_cua || '').trim();
        const closeTime = String(branch?.gio_dong_cua || '').trim();
        const fallbackHours =
          openTime || closeTime ? `${openTime || '--:--'} - ${closeTime || '--:--'}` : locationText('unknownHours');
        const location = branchLocation(branch);
        const city = location.city;
        const code = String(branch?.ma_chi_nhanh || `branch-${index + 1}`);
        const stats = branchStatsMap[code.toUpperCase()];

        return {
          id: code,
          latitude: branch.latitude ?? branch.vi_do,
          longitude: branch.longitude ?? branch.kinh_do,
          code,
          ...location,
          city,
          name: branchDisplayName(branch?.ten_chi_nhanh),
          address: String(branch?.dia_chi || '').trim() || 'Đang cập nhật địa chỉ',
          hours: fallbackHours,
          phone: branch?.so_dien_thoai || '',
          rating: stats?.diem_trung_binh ?? 0,
          reviewCount: stats?.tong_luot_danh_gia || 0,
          type: branch?.loai_diem_ban || 'CHI_NHANH_CHINH',
        };
      }
    );
  }, [publicBranchPayload, branchStatsMap]);

  // Filters State
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedWard, setSelectedWard] = useState('');
  const [selectedType, setSelectedType] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [selectedStoreId, setSelectedStoreId] = useState(null);
  const [detailedStore, setDetailedStore] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef(null);
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [searchCenter, setSearchCenter] = useState(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [placeError, setPlaceError] = useState('');
  const [placeBusy, setPlaceBusy] = useState(false);
  const placeRequest = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    setPlaceSuggestions([]);
    if (!placesConfigured || !showSuggestions || searchQuery.trim().length < 3) return;
    const timer = setTimeout(() => {
      autocompletePlaces(searchQuery, { signal:controller.signal }).then(items => {
        if (!controller.signal.aborted) { setPlaceSuggestions(items); setPlaceError(''); }
      }).catch(() => { if (!controller.signal.aborted) setPlaceError('Gợi ý địa chỉ tạm thời chưa khả dụng. Bạn vẫn tìm cửa hàng theo tên được.'); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [searchQuery, showSuggestions]);
  useEffect(() => () => placeRequest.current?.abort(), []);
  const selectPlace = async item => {
    placeRequest.current?.abort();
    const controller = new AbortController(); placeRequest.current = controller;
    setPlaceBusy(true); setPlaceError(''); setShowSuggestions(false);
    try {
      const center = await resolveSuggestedPlace(item.value, { signal:controller.signal });
      if (controller.signal.aborted) return;
      setSelectedCity(''); setSelectedWard(''); setSearchQuery(''); setSelectedStoreId(null);
      setSearchCenter(center); setVisibleCount(20);
    } catch { if (!controller.signal.aborted) setPlaceError('Chưa lấy được vị trí địa điểm. Bạn vui lòng thử lại.'); }
    finally { if (!controller.signal.aborted) setPlaceBusy(false); }
  };

  const { data: detailedBranchReviews } = useQuery({
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
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter options: Cascading Wards based on selectedCity
  const { cities, wards } = useMemo(() => {
    return branchFilterOptions(stores, selectedCity);
  }, [stores, selectedCity]);

  // Counts for dropdown labels
  const cityCountMap = useMemo(() => {
    const map = {};
    stores.forEach((s) => {
      if (s.city) map[s.city] = (map[s.city] || 0) + 1;
    });
    return map;
  }, [stores]);

  const wardCountMap = useMemo(() => {
    const map = {};
    const relevant = selectedCity ? stores.filter((s) => s.city === selectedCity) : stores;
    relevant.forEach((s) => {
      if (s.ward) map[s.ward] = (map[s.ward] || 0) + 1;
    });
    return map;
  }, [stores, selectedCity]);

  const typeCountMap = useMemo(() => {
    const map = { total: stores.length };
    stores.forEach((s) => {
      if (s.type) map[s.type] = (map[s.type] || 0) + 1;
    });
    return map;
  }, [stores]);

  // Filtered stores
  const filteredStores = useMemo(() => {
    const matches = filterBranches(stores, {
      city: selectedCity,
      ward: selectedWard,
      query: searchQuery,
    }).filter((store) => selectedType === 'ALL' || store.type === selectedType);
    if (!searchCenter) return matches;
    return matches.map(store => ({ ...store, distanceKm:distanceKm(searchCenter,coordinates(store)) }))
      .filter(store => store.distanceKm != null && store.distanceKm <= radiusKm).sort((a,b) => a.distanceKm-b.distanceKm);
  }, [stores, selectedCity, selectedWard, selectedType, searchQuery, searchCenter, radiusKm]);

  // Smart suggestions
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = normalizeLocationText(searchQuery);

    const matchingCities = cities
      .filter((c) => normalizeLocationText(c).includes(query))
      .map((c) => ({ type: 'city', text: c, value: c }));

    const matchingStoreItems = stores
      .filter((s) => {
        const name = normalizeLocationText(s.name);
        const addr = normalizeLocationText(s.address);
        return name.includes(query) || addr.includes(query);
      })
      .slice(0, 5)
      .map((s) => ({ type: 'store', text: s.name, subtext: s.address, value: s }));

    return [...matchingCities.slice(0, 3), ...matchingStoreItems, ...placeSuggestions];
  }, [searchQuery, cities, stores, placeSuggestions]);

  const selectedStore =
    filteredStores.find((store) => store.id === selectedStoreId) || filteredStores[0] || null;
  const setSelectedStore = (store) => setSelectedStoreId(store?.id || null);

  const hasActiveFilter = Boolean(selectedCity || selectedWard || selectedType !== 'ALL' || searchQuery || searchCenter);

  const handleResetFilters = () => {
    placeRequest.current?.abort(); setPlaceBusy(false); setSearchCenter(null); setPlaceError('');
    setSelectedCity('');
    setSelectedWard('');
    setSelectedType('ALL');
    setSearchQuery('');
    setVisibleCount(20);
  };

  return (
    <div className="store-locator flex flex-col h-[calc(100vh-90px)] bg-white mt-0 font-sans">
      {/* Detailed Store View */}
      {detailedStore ? (
        <div className="flex-1 overflow-y-auto bg-gray-50 pb-16">
          <div
            className="bg-[#b22830] h-14 flex items-center px-6 w-full cursor-pointer hover:bg-red-800 transition-colors shadow-md"
            onClick={() => setDetailedStore(null)}
          >
            <span className="text-white text-sm font-bold flex items-center gap-2">
              <RiArrowLeftLine className="w-5 h-5 text-white" />
              {t('stores.backToStores', 'Quay lại hệ thống cửa hàng')}
            </span>
          </div>

          <div className="max-w-[1000px] mx-auto mt-8 space-y-6 px-4">
            {/* Store Banner & Meta */}
            <div className="bg-white p-8 shadow-sm rounded-2xl flex flex-col md:flex-row gap-10 border border-gray-100">
              <div className="bg-[#b22830] flex-1 flex items-center justify-center p-10 min-h-[260px] rounded-2xl">
                <img
                  src="/images/brand/logo-white.png"
                  alt="Avengers Coffee"
                  className="w-[80%] max-w-[240px] max-h-[180px] object-contain drop-shadow-sm"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    {(detailedBranchReviews?.tong_luot_danh_gia || detailedStore.reviewCount || 0) > 0 ? (
                      <>
                        <span className="bg-red-50 text-red-900 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-red-200">
                          <RiStarFill className="w-4 h-4 text-amber-500" />
                          {Number(detailedBranchReviews?.diem_trung_binh || detailedStore.rating || 5.0).toFixed(1)} / 5.0
                        </span>
                        <span className="text-xs text-gray-500 font-medium">
                          ({detailedBranchReviews?.tong_luot_danh_gia || detailedStore.reviewCount || 0}{' '}
                          {ui(' đánh giá)')}
                        </span>
                      </>
                    ) : (
                      <span className="bg-gray-100 text-gray-500 text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 border border-gray-200">
                        <RiStarFill className="w-4 h-4 text-gray-400" />
                        {ui('Chưa có đánh giá')}
                      </span>
                    )}
                  </div>
                  <h2 className="text-[22px] font-semibold text-[#333333] mb-4">
                    {decodeHtmlEntities(detailedStore.name)}
                  </h2>
                  <div className="space-y-3">
                    <div className="flex border-b border-gray-100 pb-3">
                      <span className="text-[#a51a1a] w-24 text-[13px] font-bold flex items-center gap-1.5">
                        <RiMapPin2Fill className="w-4 h-4 text-[#a51a1a]" />
                        {t('stores.address', 'Địa chỉ')}
                      </span>
                      <p className="text-[#333333] text-[14px] flex-1 font-medium">
                        {decodeHtmlEntities(detailedStore.address)}
                      </p>
                    </div>
                    <div className="flex border-b border-gray-100 pb-3">
                      <span className="text-[#a51a1a] w-24 text-[13px] font-bold flex items-center gap-1.5">
                        <RiPhoneLine className="w-4 h-4 text-[#a51a1a]" />
                        {t('stores.hotline', 'Hotline')}
                      </span>
                      <p className="text-[#333333] text-[14px] flex-1 font-medium">{detailedStore.phone}</p>
                    </div>
                    <div className="pt-2 flex flex-wrap gap-4 text-[13px] text-gray-700 font-medium">
                      <span className="flex items-center gap-1.5 text-red-700 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">
                        <RiTimeLine className="w-4 h-4 text-amber-600" /> {detailedStore.hours}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 flex gap-3">
                  <p className="flex-1 text-sm text-gray-600">{locationText('purchasedReview')}</p>
                  <a
                    href={
                      'https://www.google.com/maps/search/?api=1&query=' +
                      encodeURIComponent(detailedStore.address)
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 bg-stone-800 hover:bg-stone-900 text-white text-xs font-semibold py-3 rounded-full transition-all text-center flex items-center justify-center gap-2"
                  >
                    <RiArrowRightUpLine className="w-4 h-4 text-white" />
                    {t('stores.directions', 'Chỉ đường')}
                  </a>
                </div>
              </div>
            </div>

            {/* Criteria Breakdown & Reviews List */}
            <div className="bg-white p-8 shadow-sm rounded-2xl border border-gray-100 space-y-6">
              <h3 className="text-lg font-semibold text-gray-800 tracking-wide border-b border-gray-100 pb-3 flex items-center gap-2">
                <RiChat1Line className="w-6 h-6 text-[#b22830]" />
                {t('stores.customerReviews', 'Đánh giá từ khách hàng')}
              </h3>

              {detailedBranchReviews && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-red-50/50 p-4 rounded-2xl border border-red-100/60">
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500">
                      {t('stores.criteriaService', 'Phục vụ')}
                    </p>
                    <p className="text-xl font-semibold text-red-700 mt-1 flex items-center justify-center gap-1">
                      <RiStarFill className="w-5 h-5 text-amber-500" />
                      {detailedBranchReviews.tieu_chi_trung_binh?.phuc_vu ?? '—'}
                    </p>
                  </div>
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500">
                      {t('stores.criteriaCleanliness', 'Vệ sinh')}
                    </p>
                    <p className="text-xl font-semibold text-red-700 mt-1 flex items-center justify-center gap-1">
                      <RiStarFill className="w-5 h-5 text-amber-500" />
                      {detailedBranchReviews.tieu_chi_trung_binh?.ve_sinh ?? '—'}
                    </p>
                  </div>
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500">
                      {t('stores.criteriaSpeed', 'Tốc độ')}
                    </p>
                    <p className="text-xl font-semibold text-red-700 mt-1 flex items-center justify-center gap-1">
                      <RiStarFill className="w-5 h-5 text-amber-500" />
                      {detailedBranchReviews.tieu_chi_trung_binh?.toc_do ?? '—'}
                    </p>
                  </div>
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500">
                      {t('stores.criteriaQuality', 'Chất lượng món')}
                    </p>
                    <p className="text-xl font-semibold text-red-700 mt-1 flex items-center justify-center gap-1">
                      <RiStarFill className="w-5 h-5 text-amber-500" />
                      {detailedBranchReviews.tieu_chi_trung_binh?.chat_luong_mon ?? '—'}
                    </p>
                  </div>
                </div>
              )}

              {/* Reviews Items */}
              <div className="space-y-4">
                {(detailedBranchReviews?.items || []).length === 0 ? (
                  <div className="py-12 text-center text-gray-400 space-y-2">
                    <RiStarFill className="w-10 h-10 text-amber-300 mx-auto" />
                    <p className="text-sm font-medium">{t('stores.noReviews', 'Chưa có lượt đánh giá nào')}</p>
                  </div>
                ) : (
                  (detailedBranchReviews?.items || []).map((review) => (
                    <div
                      key={review.id}
                      className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2"
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-sm text-stone-600 font-bold"
                          >
                            {(review.ten_nguoi_dung || t('stores.customer', 'Khách hàng')).slice(0, 1)}
                          </span>
                          <span className="font-bold text-sm text-gray-900">
                            {review.ten_nguoi_dung || t('stores.customer', 'Khách hàng')}
                          </span>
                          <span className="bg-red-50 text-red-800 text-[11px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1">
                            <RiStarFill className="w-3.5 h-3.5 text-amber-500" />
                            {review.diem_tong_quan}/5
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 font-medium">
                          {new Date(review.ngay_tao).toLocaleDateString(uiLocale())}
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
          {/* Top Filter Bar — Ngay hàng thẳng lối & Cascading Wards */}
          <div className="w-full bg-white py-4 px-4 sm:px-6 border-b border-gray-200/80 shadow-2xs z-20">
            <div className="max-w-[1440px] mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
                {/* 1. Tỉnh / Thành phố */}
                <div className="lg:col-span-3">
                  <FilterSelectDropdown
                    label="Tỉnh / Thành phố"
                    icon={RiBuilding4Line}
                    value={selectedCity}
                    placeholder="Tất cả tỉnh / thành phố"
                    allLabel="Tất cả tỉnh / thành phố"
                    options={cities}
                    counts={cityCountMap}
                    onChange={(nextCity) => {
                      setSelectedCity(nextCity);
                      setSelectedWard('');
                      setVisibleCount(20);
                    }}
                  />
                </div>

                {/* 2. Phường / Xã (Lọc theo Tỉnh / Thành phố được chọn) */}
                <div className="lg:col-span-3">
                  <FilterSelectDropdown
                    label="Phường / Xã"
                    icon={RiCommunityLine}
                    value={selectedWard}
                    placeholder={selectedCity ? 'Tất cả phường / xã' : 'Chọn tỉnh / TP trước'}
                    allLabel={selectedCity ? `Tất cả phường / xã tại ${selectedCity}` : 'Tất cả phường / xã'}
                    options={wards}
                    counts={wardCountMap}
                    disabled={!selectedCity}
                    onChange={(nextWard) => {
                      setSelectedWard(nextWard);
                      setVisibleCount(20);
                    }}
                  />
                </div>

                {/* 3. Loại điểm bán */}
                <div className="lg:col-span-2">
                  <StoreTypeDropdown
                    value={selectedType}
                    counts={typeCountMap}
                    onChange={(nextType) => {
                      setSelectedType(nextType);
                      setVisibleCount(20);
                    }}
                  />
                </div>

                {/* 4. Tìm kiếm từ khóa */}
                <div className="lg:col-span-3 relative" ref={searchInputRef}>
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5 h-4">
                    <RiSearchLine className="w-3.5 h-3.5 text-[#b22830]" />
                    <span>Tìm kiếm cửa hàng</span>
                  </label>
                  <div className="flex items-center w-full h-11 bg-white rounded-xl border border-gray-200/90 hover:border-gray-300 focus-within:border-[#b22830] focus-within:ring-2 focus-within:ring-red-100/50 shadow-2xs transition-all overflow-hidden">
                    <input
                      type="text"
                      placeholder="Tên đường, phường, quán..."
                      value={searchQuery}
                      onFocus={() => setShowSuggestions(true)}
                      onChange={(e) => {
                        placeRequest.current?.abort(); setPlaceBusy(false);
                        setSearchQuery(e.target.value);
                        setVisibleCount(20);
                        setShowSuggestions(true);
                      }}
                      className="flex-1 h-full px-3.5 text-xs font-semibold text-gray-800 bg-transparent outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setVisibleCount(20);
                        }}
                        className="px-2.5 text-gray-400 hover:text-[#b22830] transition-colors cursor-pointer"
                        title="Xóa tìm kiếm"
                      >
                        <RiCloseLine className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {placeBusy && <p role="status" className="text-xs py-2">Đang tìm vị trí địa điểm…</p>}
                  {placeError && <p role="status" className="text-xs py-2 text-[#b22830]">{placeError}</p>}
                  {searchCenter && <div className="text-xs py-3 flex flex-wrap items-center gap-3" role="status">
                    <span>Quanh {searchCenter.label} · khoảng cách đường chim bay</span>
                    <label>Bán kính <select aria-label="Bán kính tìm cửa hàng" value={radiusKm} onChange={e => setRadiusKm(Number(e.target.value))}>{[1,3,5,10,20].map(km => <option key={km} value={km}>{km} km</option>)}</select></label>
                    <button type="button" onClick={() => setSearchCenter(null)}>Bỏ vị trí</button>
                  </div>}
                  {/* Dropdown Autocomplete Menu */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div className="absolute top-full left-0 w-full mt-1.5 bg-white border border-gray-200/90 shadow-2xl rounded-2xl overflow-hidden z-[100] max-h-[380px] overflow-y-auto animate-fade-in">
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        {t('stores.searchSuggestions', 'Gợi ý tìm kiếm')}
                      </div>
                      {suggestions.map((item, idx) => (
                        <div
                          key={idx}
                          role="button" tabIndex={0}
                          onKeyDown={event => { if (event.key==='Enter'||event.key===' ') { event.preventDefault(); event.currentTarget.click(); } }}
                          className="px-4 py-2.5 cursor-pointer hover:bg-red-50/50 border-b border-gray-50 last:border-none flex items-start gap-3 transition-colors"
                          onClick={() => {
                            if (item.type === 'place') { selectPlace(item); return; }
                            setSearchCenter(null);
                            if (item.type === 'city') {
                              setSelectedCity(item.value);
                              setSelectedWard('');
                              setSearchQuery('');
                            } else if (item.type === 'store') {
                              setSelectedCity(item.value.city);
                              setSelectedWard(item.value.ward || '');
                              setSearchQuery('');
                              setSelectedStore(item.value);
                            }
                            setVisibleCount(20);
                            setShowSuggestions(false);
                          }}
                        >
                          <div className="mt-0.5 shrink-0">
                            {item.type === 'city' && (
                              <RiBuilding4Line className="w-4 h-4 text-gray-400" />
                            )}
                            {['store','place'].includes(item.type) && (
                              <RiMapPin2Fill className="w-4 h-4 text-[#b22830]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-gray-900 truncate">
                              {decodeHtmlEntities(item.text)}
                            </div>
                            {item.subtext && (
                              <div className="text-[11px] text-gray-500 truncate">
                                {decodeHtmlEntities(item.subtext)}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 5. Nút Thao tác */}
                <div className="lg:col-span-1">
                  <div className="h-4 mb-1.5 flex items-center justify-between text-[11px] text-gray-400">
                    <span className="sr-only">Thao tác</span>
                  </div>
                  <div className="flex items-center gap-1.5 h-11">
                    <button
                      type="button"
                      onClick={() => setVisibleCount(20)}
                      className="h-11 flex-1 px-3 bg-[#b22830] hover:bg-red-800 text-white text-xs font-bold rounded-xl transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer whitespace-nowrap"
                      title="Tìm kiếm"
                    >
                      <RiSearchLine className="w-4 h-4 text-white" />
                      <span className="hidden xl:inline">Tìm</span>
                    </button>
                    {hasActiveFilter && (
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="h-11 px-2.5 bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-[#b22830] rounded-xl text-xs font-semibold transition-all flex items-center justify-center cursor-pointer border border-gray-200"
                        title="Đặt lại bộ lọc"
                      >
                        <RiRestartLine className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content (Split View: Sidebar Left, React Map Right) */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left Sidebar */}
            <div className="w-full md:w-[400px] max-h-[420px] md:max-h-none shrink-0 bg-white border-r border-gray-200 flex flex-col shadow-sm">
              <div className="bg-[#f8f9fa] px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <p className="text-gray-700 font-medium text-sm flex items-center gap-2">
                  <RiStore2Line className="w-4 h-4 text-[#b22830]" />
                  {isStoresLoading ? (
                    <Skeleton className="h-5 w-40" />
                  ) : (
                    <span>
                      Tìm được{' '}
                      <strong className="text-[#b22830] font-bold">
                        {filteredStores.length}
                      </strong>{' '}
                      quán
                      {selectedCity ? ` tại ${selectedCity}` : ''}
                      {selectedWard ? ` (${selectedWard})` : ''}
                    </span>
                  )}
                </p>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {isStoresLoading && <StoreListSkeleton />}
                {isStoresError && <div className="store-list-error" role="alert"><p>{ui('Chưa tải được danh sách cửa hàng. Bạn thử lại nhé.')}</p><button type="button" onClick={() => refetchStores()}>{ui('Thử lại')}</button></div>}
                {filteredStores.slice(0, visibleCount).map((store) => {
                  const isSelected = selectedStore?.id === store.id;
                  const storeName = decodeHtmlEntities(store.name);
                  const storeAddress = decodeHtmlEntities(store.address);

                  return (
                    <div
                      key={store.id}
                      onClick={() => setSelectedStore(store)}
                      className={`w-full text-left p-5 transition-all cursor-pointer relative ${
                        isSelected
                          ? 'bg-red-50/40 border-l-4 border-l-[#b22830] shadow-2xs'
                          : 'hover:bg-gray-50/80 border-l-4 border-l-transparent'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex flex-col gap-1 min-w-0">
                          <h3
                            className={`font-bold text-[14px] leading-snug line-clamp-2 ${
                              isSelected ? 'text-[#b22830]' : 'text-gray-900'
                            }`}
                          >
                            {storeName}
                          </h3>
                          {store.type === 'KIOSK_VE_TINH' && (
                            <span className="self-start text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold border border-blue-100">
                              Điểm Take-away
                            </span>
                          )}
                          {store.type === 'XE_NUOC_FRUIT' && (
                            <span className="self-start text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md font-semibold border border-orange-100">
                              Xe Đẩy
                            </span>
                          )}
                        </div>

                        {store.reviewCount > 0 ? (
                          <span className="bg-red-50 text-red-900 text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 border border-red-200 shrink-0">
                            <RiStarFill className="w-3.5 h-3.5 text-amber-500" />
                            {Number(store.rating).toFixed(1)} ({store.reviewCount})
                          </span>
                        ) : (
                          <span className="bg-gray-100 text-gray-500 text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 border border-gray-200 shrink-0">
                            <RiStarFill className="w-3.5 h-3.5 text-gray-400" />
                            Chưa có đánh giá
                          </span>
                        )}
                      </div>

                      {/* Store Address */}
                      <div className="flex items-start gap-2.5 mt-2.5">
                        <RiMapPin2Fill className="w-4 h-4 text-[#b22830] shrink-0 mt-0.5" />
                        <p className="text-gray-600 text-xs leading-relaxed font-medium">
                          {storeAddress}
                        </p>
                      </div>

                      {/* Store Phone */}
                      <div className="flex items-center gap-2.5 mt-2">
                        <RiPhoneLine className="w-4 h-4 text-gray-400 shrink-0" />
                        <a
                          href={`tel:${store.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-gray-600 hover:text-[#b22830] text-xs font-medium"
                        >
                          {store.phone}
                        </a>
                      </div>

                      {/* Store Hours */}
                      <div className="flex items-center gap-2.5 mt-2">
                        <RiTimeLine className="w-4 h-4 text-gray-400 shrink-0" />
                        <p className="text-gray-600 text-xs font-medium">{store.hours}</p>
                      </div>

                      {/* Expanded Details when selected */}
                      {isSelected && (
                        <div
                          className="mt-4 pt-3.5 border-t border-red-200/60 space-y-3 animate-fade-in"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Action Buttons */}
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setDetailedStore(store)}
                              className="flex-1 bg-[#b22830] hover:bg-red-800 text-white text-[11px] font-semibold py-2.5 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <RiInformationLine className="w-4 h-4 text-white" />
                              Chi tiết & Đánh giá
                            </button>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                store.address
                              )}`}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 bg-stone-800 hover:bg-stone-900 text-white text-[11px] font-semibold py-2.5 rounded-xl transition-all shadow-sm text-center flex items-center justify-center gap-1.5"
                            >
                              <RiArrowRightUpLine className="w-4 h-4 text-white" />
                              Tìm đường
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {filteredStores.length > visibleCount && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((n) => n + 20)}
                    className="w-full p-4 text-xs font-bold text-[#b22830] hover:bg-red-50/50 transition-colors cursor-pointer text-center"
                  >
                    Xem thêm cửa hàng
                  </button>
                )}

                {filteredStores.length === 0 && !isStoresLoading && !isStoresError && (
                  <div className="p-8 text-center text-gray-500 text-xs space-y-3">
                    <RiStore2Line className="w-12 h-12 text-gray-300 mx-auto" />
                    <p className="font-medium text-gray-600">
                      {locationText('noBranches', 'Chưa có cửa hàng phù hợp với khu vực này.')}
                    </p>
                    <button
                      type="button"
                      className="text-[#b22830] font-semibold underline hover:text-red-800 cursor-pointer"
                      onClick={handleResetFilters}
                    >
                      Xóa tất cả bộ lọc để xem toàn bộ quán
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Map View — Powered by React Map (react-map-gl) */}
            <div className="flex-1 min-h-[380px] bg-slate-100 relative">
              {isStoresLoading ? (
                <Skeleton
                  role="status"
                  aria-label={ui('Đang tải bản đồ cửa hàng')}
                  aria-busy="true"
                  className="h-full min-h-[380px] w-full rounded-none"
                />
              ) : selectedStore ? (
                <LocationMap
                  searchCenter={searchCenter}
                  searchRadiusKm={radiusKm}
                  branches={filteredStores}
                  selected={selectedStore}
                  onSelect={setSelectedStore}
                  onViewDetail={setDetailedStore}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400 bg-slate-100">
                  <div className="text-center space-y-2">
                    <RiMapPin2Fill className="w-12 h-12 text-gray-400 mx-auto animate-bounce" />
                    <p className="text-sm font-medium">
                      {ui('Vui lòng chọn cửa hàng từ danh sách để xem vị trí bản đồ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
