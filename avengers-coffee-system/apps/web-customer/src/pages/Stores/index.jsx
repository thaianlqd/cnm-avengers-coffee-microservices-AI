import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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

  const { data: detailedBranchReviews, refetch: refetchDetailedReviews } = useQuery({
    queryKey: ['branch-reviews-detail', detailedStore?.code],
    queryFn: async () => {
      if (!detailedStore?.code) return null;
      const res = await apiClient.get(`/branch-reviews/branch/${detailedStore.code}`);
      return res.data;
    },
    enabled: !!detailedStore?.code,
  });

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
        if (!name.includes(query) && !address.includes(query)) return false;
      }
      return true;
    });
  }, [stores, selectedCity, selectedDistrict, searchQuery]);

  useEffect(() => {
    if (filteredStores.length > 0 && (!selectedStore || !filteredStores.find(s => s.id === selectedStore.id))) {
      setSelectedStore(filteredStores[0]);
    } else if (filteredStores.length === 0 && selectedStore !== null) {
      setSelectedStore(null);
    }
  }, [filteredStores, selectedStore]);

  return (
    <div className="flex flex-col h-[calc(100vh-84px)] bg-white mt-[84px]">
      {/* Detailed Store View */}
      {detailedStore ? (
        <div className="flex-1 overflow-y-auto bg-gray-50 pb-16">
          <div className="bg-[#b22830] h-14 flex items-center px-6 w-full cursor-pointer hover:bg-red-800 transition-colors shadow-md" onClick={() => setDetailedStore(null)}>
            <span className="text-white text-sm font-bold ml-4 flex items-center gap-2">← Quay lại danh sách cửa hàng</span>
          </div>

          <div className="max-w-[1000px] mx-auto mt-8 space-y-6 px-4">
            {/* Store Banner & Meta */}
            <div className="bg-white p-8 shadow-sm rounded-2xl flex flex-col md:flex-row gap-10 border border-gray-100">
              <div className="bg-[#b22830] flex-1 flex items-center justify-center p-10 min-h-[260px] rounded-2xl">
                <img src="/hc-assets/red_BG_logo800.png" alt="Highlands Coffee" className="w-[80%] max-w-[260px] object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
              </div>
              <div className="flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="bg-amber-100 text-amber-900 text-xs font-black px-3 py-1 rounded-full flex items-center gap-1 border border-amber-200">
                      ⭐ {detailedBranchReviews?.diem_trung_binh || detailedStore.rating || 5.0} / 5.0
                    </span>
                    <span className="text-xs text-gray-500 font-medium">
                      ({detailedBranchReviews?.tong_luot_danh_gia || detailedStore.reviewCount || 0} đánh giá)
                    </span>
                  </div>
                  <h2 className="text-[22px] font-black uppercase text-[#333333] mb-4">{detailedStore.name}</h2>
                  <div className="space-y-3">
                    <div className="flex border-b border-gray-100 pb-3">
                      <span className="text-[#a51a1a] w-20 text-[13px] font-bold">Địa chỉ</span>
                      <p className="text-[#333333] text-[14px] flex-1 font-medium">{detailedStore.address}</p>
                    </div>
                    <div className="flex border-b border-gray-100 pb-3">
                      <span className="text-[#a51a1a] w-20 text-[13px] font-bold">Hotline</span>
                      <p className="text-[#333333] text-[14px] flex-1 font-medium">{detailedStore.phone}</p>
                    </div>
                    <div className="pt-2 flex flex-wrap gap-4 text-[13px] text-gray-700 font-medium">
                      <span>📶 Wifi Miễn Phí</span>
                      <span>💳 Thanh toán thẻ</span>
                      <span>⏰ {detailedStore.hours}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsReviewModalOpen(true)}
                    className="flex-1 bg-[#b22830] hover:bg-red-800 text-white text-xs font-black uppercase py-3 rounded-full transition-all shadow-md flex items-center justify-center gap-2"
                  >
                    ⭐ Viết Đánh Giá Chi Nhánh
                  </button>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailedStore.address)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 bg-[#5c3a21] hover:bg-[#4a2e1a] text-white text-xs font-black uppercase py-3 rounded-full transition-all text-center flex items-center justify-center gap-2"
                  >
                    🗺️ Xem Chỉ Đường
                  </a>
                </div>
              </div>
            </div>

            {/* Criteria Breakdown & Reviews List */}
            <div className="bg-white p-8 shadow-sm rounded-2xl border border-gray-100 space-y-6">
              <h3 className="text-lg font-black uppercase text-gray-800 tracking-wide border-b border-gray-100 pb-3 flex items-center gap-2">
                💬 Đánh giá & Nhận xét của Khách hàng ({detailedBranchReviews?.tong_luot_danh_gia || 0})
              </h3>

              {/* Criteria Scores */}
              {detailedBranchReviews && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-amber-50/50 p-4 rounded-2xl border border-amber-100/60">
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500 uppercase">Thái độ phục vụ</p>
                    <p className="text-xl font-black text-amber-700 mt-1">
                      ⭐ {detailedBranchReviews.tieu_chi_trung_binh?.phuc_vu || 5.0}
                    </p>
                  </div>
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500 uppercase">Không gian & Vệ sinh</p>
                    <p className="text-xl font-black text-amber-700 mt-1">
                      ⭐ {detailedBranchReviews.tieu_chi_trung_binh?.ve_sinh || 5.0}
                    </p>
                  </div>
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500 uppercase">Tốc độ lên món</p>
                    <p className="text-xl font-black text-amber-700 mt-1">
                      ⭐ {detailedBranchReviews.tieu_chi_trung_binh?.toc_do || 5.0}
                    </p>
                  </div>
                  <div className="text-center p-2">
                    <p className="text-[11px] font-bold text-gray-500 uppercase">Chất lượng đồ uống</p>
                    <p className="text-xl font-black text-amber-700 mt-1">
                      ⭐ {detailedBranchReviews.tieu_chi_trung_binh?.chat_luong_mon || 5.0}
                    </p>
                  </div>
                </div>
              )}

              {/* Reviews Items */}
              <div className="space-y-4">
                {(detailedBranchReviews?.items || []).length === 0 ? (
                  <div className="py-12 text-center text-gray-400">
                    <p className="text-2xl mb-2">⭐</p>
                    <p className="text-sm font-medium">Chưa có đánh giá nào cho chi nhánh này. Hãy là người đầu tiên để lại đánh giá!</p>
                  </div>
                ) : (
                  (detailedBranchReviews?.items || []).map((review) => (
                    <div key={review.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-gray-900">{review.ten_nguoi_dung || 'Khách hàng'}</span>
                          <span className="bg-amber-100 text-amber-800 text-[11px] font-black px-2 py-0.5 rounded-md">
                            ⭐ {review.diem_tong_quan}/5
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

          <div className="flex items-center w-[300px] ml-2 bg-white rounded-[3px] border border-gray-300 overflow-hidden focus-within:border-[#5c3a21]">
            <input 
              type="text" 
              placeholder="Nhập tên đường, hoặc quận..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 h-10 px-4 text-[13px] font-medium text-[#333] outline-none"
            />
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
          <div className="bg-[#f2f2f2] px-6 py-4 border-b border-gray-200 flex justify-between items-center">
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
                  <div className="flex justify-between items-start">
                    <h3 className="uppercase text-[#333333] font-bold text-[15px] mb-2">{store.name}</h3>
                    <span className="bg-amber-100 text-amber-800 text-[11px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 border border-amber-200">
                      ⭐ {store.rating} ({store.reviewCount})
                    </span>
                  </div>
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
                    <div className="flex justify-between items-start">
                      <h4 className="text-[14px] font-black text-[#333333] uppercase leading-tight mb-2">{selectedStore.name}</h4>
                      <span className="text-[11px] font-bold text-amber-700">⭐ {selectedStore.rating}</span>
                    </div>
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
