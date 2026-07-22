import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';

// Helper functions (could be imported if they were exported, but for now we'll duplicate the necessary ones or just simplify)
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

  const stores = useMemo(() => {
    return (publicBranchPayload?.items || []).map((branch, index) => {
      const openTime = String(branch?.gio_mo_cua || '').trim();
      const closeTime = String(branch?.gio_dong_cua || '').trim();
      const fallbackHours = openTime || closeTime ? `${openTime || '--:--'} - ${closeTime || '--:--'}` : '07:00 - 22:00';
      const city = normalizeCityName(branch?.thanh_pho || branch?.dia_chi);
      return {
        id: String(branch?.ma_chi_nhanh || `branch-${index + 1}`),
        city,
        district: String(branch?.quan_huyen || '').trim() || 'Chưa phân loại',
        name: String(branch?.ten_chi_nhanh || '').trim() || `Chi nhánh ${index + 1}`,
        address: String(branch?.dia_chi || '').trim() || 'Đang cập nhật địa chỉ',
        hours: fallbackHours,
        phone: branch?.so_dien_thoai || '1900 1755',
      };
    });
  }, [publicBranchPayload]);

  const [selectedCity, setSelectedCity] = useState('ALL');
  const [selectedDistrict, setSelectedDistrict] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStore, setSelectedStore] = useState(null);
  const [detailedStore, setDetailedStore] = useState(null); // For detailed view (Screenshot 4)
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchInputRef = useRef(null);

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
    
    // Cấp Thành phố
    const matchingCities = cities
      .filter(c => c !== 'ALL' && normalizeLocationText(c).includes(query))
      .map(c => ({ type: 'city', text: c, value: c }));
    
    // Cấp Quận / Huyện
    const allDistricts = Array.from(new Set(stores.map(s => s.district).filter(Boolean)));
    const matchingDistricts = allDistricts
      .filter(d => normalizeLocationText(d).includes(query))
      .map(d => ({ type: 'district', text: d, value: d }));

    // Cấp Cửa hàng
    const matchingStoreItems = stores.filter(s => {
      const name = normalizeLocationText(s.name);
      const addr = normalizeLocationText(s.address);
      return name.includes(query) || addr.includes(query);
    }).slice(0, 5).map(s => ({ type: 'store', text: s.name, subtext: s.address, value: s }));

    return [...matchingCities.slice(0, 2), ...matchingDistricts.slice(0, 3), ...matchingStoreItems];
  }, [searchQuery, cities, stores]);

  // Set default selected store to the first one in the filtered list
  useEffect(() => {
    if (filteredStores.length > 0 && (!selectedStore || !filteredStores.find(s => s.id === selectedStore.id))) {
      setSelectedStore(filteredStores[0]);
    } else if (filteredStores.length === 0 && selectedStore !== null) {
      setSelectedStore(null);
    }
  }, [filteredStores, selectedStore]);

  return (
    <div className="flex flex-col h-[calc(100vh-84px)] bg-white mt-[84px]">
      {/* Detailed Store View (Screenshot 4) */}
      {detailedStore ? (
        <div className="flex-1 overflow-y-auto bg-gray-50 pb-16">
          <div className="bg-[#b22830] h-14 flex items-center px-4 w-full cursor-pointer hover:bg-red-800 transition-colors" onClick={() => setDetailedStore(null)}>
            <span className="text-white text-sm font-bold ml-4">← Quay lại danh sách</span>
          </div>
          <div className="max-w-[1000px] mx-auto mt-8 bg-white p-8 shadow-sm rounded-lg flex flex-col md:flex-row gap-10">
            <div className="bg-[#b22830] flex-1 flex items-center justify-center p-10 min-h-[300px]">
              <img src="/hc-assets/red_BG_logo800.png" alt="Highlands Coffee" className="w-[80%] max-w-[300px] object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <h2 className="text-[22px] font-black uppercase text-[#333333] mb-6">{detailedStore.name}</h2>
              <div className="space-y-4">
                <div className="flex border-b border-gray-100 pb-4">
                  <span className="text-[#a51a1a] w-20 text-[13px] font-bold">Địa chỉ</span>
                  <p className="text-[#333333] text-[14px] flex-1 font-medium">{detailedStore.address}</p>
                </div>
                <div className="flex border-b border-gray-100 pb-4">
                  <span className="text-[#a51a1a] w-20 text-[13px] font-bold">Hotline</span>
                  <p className="text-[#333333] text-[14px] flex-1 font-medium">{detailedStore.phone}</p>
                </div>
                <div className="pt-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-[#333333] text-[13px] font-medium">
                    <span className="text-gray-500"><i className="fa fa-wifi"></i> 📶</span> Wifi Miễn Phí
                  </div>
                  <div className="flex items-center gap-2 text-[#333333] text-[13px] font-medium">
                    <span className="text-gray-500"><i className="fa fa-credit-card"></i> 💳</span> Thanh toán bằng thẻ
                  </div>
                </div>
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
                <button onClick={() => setSearchQuery('')} className="px-3 text-gray-400 hover:text-[#a51a1a] transition-colors text-[16px] font-bold" title="Xóa">
                  ✕
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
                      {item.type === 'city' && <span className="text-gray-400 text-lg">🏙️</span>}
                      {item.type === 'district' && <span className="text-gray-400 text-lg">🏘️</span>}
                      {item.type === 'store' && <span className="text-[#a51a1a] text-lg">📍</span>}
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
            <span className="text-[14px]">🔍</span> Tìm kiếm
          </button>
        </div>
      </div>

      {/* Main Content (Split View) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[380px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
          <div className="bg-[#f2f2f2] px-6 py-4 border-b border-gray-200">
            <p className="text-gray-600 font-medium italic text-[15px]">
              {isStoresLoading ? 'Đang tải danh sách...' : `Tìm được ${filteredStores.length} quán`}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredStores.map(store => {
              const isSelected = selectedStore?.id === store.id;
              return (
                <button
                  key={store.id}
                  onClick={() => setSelectedStore(store)}
                  className={`w-full text-left p-6 border-b border-gray-100 transition-colors cursor-pointer ${isSelected ? 'bg-gray-50' : 'hover:bg-gray-50'}`}
                >
                  <h3 className="uppercase text-[#333333] font-bold text-[15px] mb-2">{store.name}</h3>
                  <div className="flex items-start gap-3 mt-2">
                    <span className="text-[#a51a1a] mt-0.5">📍</span>
                    <p className="text-[#666666] text-[13px] leading-relaxed">{store.address}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-[#a51a1a]">📞</span>
                    <p className="text-[#666666] text-[13px]">{store.phone}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="bg-[#a51a1a] text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">OPEN</span>
                    <p className="text-[#666666] text-[13px] font-medium">{store.hours}</p>
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex mt-4 items-center gap-2 text-[#1f6fb2] hover:text-[#15548a] text-[13px] font-medium transition-colors"
                  >
                    Xem chỉ đường trên bản đồ <span className="text-[10px]">▶</span>
                  </a>
                </button>
              );
            })}
            {filteredStores.length === 0 && !isStoresLoading && (
              <div className="p-8 text-center text-gray-500 text-sm">
                Không tìm thấy cửa hàng nào phù hợp với tìm kiếm của bạn.
              </div>
            )}
          </div>
        </div>

        {/* Right Map */}
        <div className="flex-1 bg-gray-100 relative">
          {selectedStore ? (
            <>
              <iframe
                key={selectedStore.id}
                title={`Bản đồ ${selectedStore.name}`}
                src={buildMapEmbedUrl(selectedStore.address)}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="w-full h-full border-none"
              />
              {/* Map Popup Overlay */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white shadow-2xl rounded-sm w-[400px] flex overflow-hidden z-20 animate-fade-in">
                <button 
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 text-lg leading-none z-30" 
                  onClick={() => setSelectedStore(null)}
                >×</button>
                <div className="bg-[#b22830] w-[140px] flex items-center justify-center p-4 flex-shrink-0">
                  <img src="/hc-assets/red_BG_logo800.png" alt="Highlands Coffee" className="w-full max-w-[100px] object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h4 className="text-[14px] font-black text-[#333333] uppercase leading-tight mb-2">{selectedStore.name}</h4>
                    <p className="text-[12px] text-gray-500 mb-1">{selectedStore.address}</p>
                    <p className="text-[12px] text-[#a51a1a] font-bold mb-1 flex items-center gap-1">📞 {selectedStore.phone}</p>
                    <p className="text-[12px] text-gray-500 mb-3">{selectedStore.hours} * 7 ngày/ tuần</p>
                    <div className="flex flex-col gap-1 text-[11px] text-[#333333] font-medium">
                      <span>📶 Wifi Miễn Phí</span>
                      <span>💳 Thanh toán bằng thẻ</span>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button 
                      onClick={() => setDetailedStore(selectedStore)}
                      className="flex-1 bg-[#5c3a21] hover:bg-[#4a2e1a] text-white text-[10px] font-bold uppercase py-2 transition-colors rounded-sm"
                    >
                      XEM CHI TIẾT
                    </button>
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedStore.address)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 bg-[#5c3a21] hover:bg-[#4a2e1a] text-white text-[10px] font-bold uppercase py-2 transition-colors rounded-sm text-center"
                    >
                      TÌM ĐƯỜNG
                    </a>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 bg-[#e5e3df]">
              <div className="text-center">
                <p className="mb-2 text-xl">🗺️</p>
                <p className="text-sm font-medium">Vui lòng chọn cửa hàng để xem bản đồ</p>
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
