import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  MapPinIcon, 
  MagnifyingGlassIcon, 
  XMarkIcon, 
  ArrowPathIcon
} from '@heroicons/react/24/solid';
import { searchAddressSuggestions, getCurrentLocation, reverseGeocode } from '../../lib/geocodingService';

export default function AddressAutocompleteInput({
  label = 'Địa chỉ / Tên đường',
  value = '',
  onChange,
  onSelectAddress,
  placeholder = 'Nhập số nhà, tên đường (Ví dụ: 28 Nguyễn Văn Linh)...',
}) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [locatingError, setLocatingError] = useState('');

  const containerRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Đồng bộ value từ bên ngoài khi có thay đổi
  useEffect(() => {
    if (value !== undefined && value !== query && !isOpen) {
      setQuery(value);
    }
  }, [value]);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Xử lý tìm kiếm gợi ý địa chỉ (Debounce 300ms)
  const handleSearch = useCallback((text) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (!text || text.trim().length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const results = await searchAddressSuggestions(text);
        setSuggestions(results);
        setIsOpen(results.length > 0);
      } catch (err) {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  }, []);

  const handleInputChange = (e) => {
    const text = e.target.value;
    setQuery(text);
    if (onChange) onChange(text);
    handleSearch(text);
  };

  const handleSelectSuggestion = (item) => {
    const chosenStreet = item.street || item.title || query;
    setQuery(chosenStreet);
    setIsOpen(false);
    setSuggestions([]);

    if (onChange) {
      onChange(chosenStreet);
    }
    if (onSelectAddress) {
      onSelectAddress(item);
    }
  };

  // Nút Lấy vị trí GPS thực tế từ trình duyệt
  const handleGetLocation = async () => {
    setIsLocating(true);
    setLocatingError('');
    try {
      const coords = await getCurrentLocation();
      const resolved = await reverseGeocode(coords.lat, coords.lng);
      const addrObj = {
        title: resolved?.title || 'Vị trí hiện tại',
        subtitle: resolved?.subtitle || '',
        displayName: resolved?.displayName || 'Vị trí hiện tại',
        lat: coords.lat,
        lng: coords.lng,
        street: resolved?.street || resolved?.title || '',
        ward: resolved?.ward || '',
        city: resolved?.city || 'Hồ Chí Minh',
      };

      const chosenStreet = addrObj.street || addrObj.title;
      if (chosenStreet) {
        setQuery(chosenStreet);
      }
      setIsOpen(false);

      if (onChange) onChange(chosenStreet);
      if (onSelectAddress) onSelectAddress(addrObj);
    } catch (err) {
      setLocatingError('Không thể lấy vị trí GPS (vui lòng cho phép quyền truy cập vị trí trên trình duyệt).');
      setTimeout(() => setLocatingError(''), 6000);
    } finally {
      setIsLocating(false);
    }
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setIsOpen(false);
    if (onChange) onChange('');
  };

  return (
    <div className="relative w-full space-y-1.5" ref={containerRef}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
          <MapPinIcon className="w-3.5 h-3.5 text-[#c41230]" />
          <span>{label}</span>
        </label>

        {/* Nút Lấy vị trí GPS */}
        <button
          type="button"
          onClick={handleGetLocation}
          disabled={isLocating}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#2563eb] hover:text-[#1d4ed8] bg-blue-50/80 hover:bg-blue-100 px-2.5 py-1 rounded-full border border-blue-200/80 transition-colors shadow-2xs cursor-pointer"
        >
          {isLocating ? (
            <>
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
              <span>Đang định vị GPS...</span>
            </>
          ) : (
            <>
              <MapPinIcon className="w-3.5 h-3.5 text-blue-600" />
              <span>Lấy vị trí GPS</span>
            </>
          )}
        </button>
      </div>

      {/* Input Box */}
      <div className="relative flex items-center">
        <div className="absolute left-3.5 flex items-center pointer-events-none text-gray-400">
          {isLoading ? (
            <ArrowPathIcon className="w-4 h-4 animate-spin text-[#c41230]" />
          ) : (
            <MagnifyingGlassIcon className="w-4 h-4" />
          )}
        </div>

        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-10 py-3 text-sm font-semibold outline-none transition-all placeholder:text-gray-400 placeholder:font-normal focus:border-[#c41230] focus:ring-2 focus:ring-[#c41230]/20"
        />

        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Thông báo lỗi định vị nếu có */}
      {locatingError && (
        <p className="text-[11px] font-bold text-red-600 bg-red-50 p-2 rounded-lg border border-red-200 animate-fadeIn">
          {locatingError}
        </p>
      )}

      {/* DROPDOWN GỢI Ý ĐỊA CHỈ */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 max-h-[260px] overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-[0_12px_36px_rgba(0,0,0,0.16)] py-1.5 z-50 divide-y divide-gray-100 animate-fadeIn">
          <div className="px-3 py-1 bg-gray-50 text-[10px] font-extrabold uppercase tracking-wider text-gray-500 flex items-center justify-between">
            <span>Gợi ý địa chỉ trên bản đồ</span>
            <span className="text-gray-400 font-normal">Bấm để tự động điền</span>
          </div>

          {suggestions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectSuggestion(item)}
              className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[#faf7f4] focus:bg-[#fce8eb]/40 focus:outline-none cursor-pointer"
            >
              <div className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-red-50 flex items-center justify-center text-[#c41230]">
                <MapPinIcon className="w-3.5 h-3.5" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[13px] font-bold text-gray-900 leading-tight truncate">
                  {item.title}
                </span>
                <span className="text-[11px] font-medium text-gray-500 line-clamp-1 mt-0.5">
                  {item.subtitle}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
