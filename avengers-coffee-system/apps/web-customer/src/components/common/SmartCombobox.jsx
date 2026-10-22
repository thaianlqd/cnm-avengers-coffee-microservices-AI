import { uiText as ui, useUiLanguage } from "../../lib/uiText";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapPinIcon, ChevronDownIcon, XMarkIcon, CheckIcon } from './iconsSolid';
import { normalizeLocationText } from '../../lib/locationModel';

/**
 * SmartCombobox: Input vừa nhập vừa gợi ý danh sách thả xuống thông minh.
 * Phù hợp cho Tỉnh / Thành phố, Phường / Xã, Chi nhánh, Khách hàng...
 */
export default function SmartCombobox({
  options = [],
  value = '',
  onChange,
  placeholder = 'Nhập hoặc chọn...',
  disabled = false,
  icon: Icon = MapPinIcon,
  className = '',
  emptyText = 'Không tìm thấy kết quả phù hợp',
}) {
  useUiLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Sync internal query when value prop changes from outside
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        // If query was typed but no matching item was selected, revert or sync with value
        if (query !== (value || '')) {
          setQuery(value || '');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value, query]);

  // Filter options based on query (accent-insensitive search)
  const filteredOptions = useMemo(() => {
    if (!query || query.trim() === '') return options;
    const normalizedQuery = normalizeLocationText(query);
    return options.filter((opt) => {
      const optText = typeof opt === 'string' ? opt : (opt?.label || opt?.name || String(opt));
      return normalizeLocationText(optText).includes(normalizedQuery);
    });
  }, [options, query]);

  const handleSelect = (item) => {
    const val = typeof item === 'string' ? item : (item?.value ?? item?.name ?? item);
    onChange?.(val);
    setQuery(val);
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange?.('');
    setQuery('');
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (!isOpen) setIsOpen(true);
    // If exact match found while typing, we can let user know
    const exactMatch = options.find((opt) => {
      const optText = typeof opt === 'string' ? opt : (opt?.label || opt?.name || String(opt));
      return optText.toLowerCase() === val.trim().toLowerCase();
    });
    if (exactMatch) {
      const matchedVal = typeof exactMatch === 'string' ? exactMatch : (exactMatch?.value ?? exactMatch?.name ?? exactMatch);
      onChange?.(matchedVal);
    } else if (val === '') {
      onChange?.('');
    }
  };

  return (
    <div className={`relative ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`} ref={containerRef}>
      {/* Input Field Container */}
      <div
        className={`relative flex items-center w-full rounded-xl border bg-white transition-all duration-200 ${
          isOpen
            ? 'border-[#b22830] ring-2 ring-[#b22830]/10 shadow-sm'
            : 'border-gray-200 hover:border-gray-300'
        } ${disabled ? 'bg-gray-50' : ''}`}
      >
        {/* Left Icon */}
        {Icon && (
          <div className="pl-2.5 pr-1 text-gray-400 pointer-events-none shrink-0 flex items-center justify-center">
            <Icon className="w-4 h-4 text-gray-400" />
          </div>
        )}

        {/* Search Input */}
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={query}
          title={query || value || ''}
          onChange={handleInputChange}
          onFocus={() => !disabled && setIsOpen(true)}
          placeholder={placeholder}
          className={`min-w-0 flex-1 py-2.5 ${Icon ? 'pl-1' : 'pl-3'} ${query && !disabled ? 'pr-11' : 'pr-7'} text-sm font-medium text-gray-800 placeholder-gray-400 bg-transparent outline-none`}
        />

        {/* Action Buttons: Clear & Chevron */}
        <div className="absolute right-1.5 flex items-center gap-0.5 shrink-0">
          {query && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              title={ui("Xóa lựa chọn")}
              className="p-1 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <XMarkIcon className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => !disabled && setIsOpen(!isOpen)}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ChevronDownIcon
              className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-[#b22830]' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-60 overflow-y-auto overflow-x-hidden py-1 divide-y divide-gray-50 animate-in fade-in-50 duration-150">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => {
              const optText = typeof opt === 'string' ? opt : (opt?.label || opt?.name || String(opt));
              const isSelected = value === optText;
              return (
                <div
                  key={`${optText}-${idx}`}
                  onClick={() => handleSelect(opt)}
                  className={`px-4 py-2.5 text-sm cursor-pointer flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-red-50 text-[#b22830] font-bold'
                      : 'text-gray-700 hover:bg-stone-50 hover:text-[#b22830]'
                  }`}
                >
                  <span className="truncate">{optText}</span>
                  {isSelected && <CheckIcon className="w-4 h-4 text-[#b22830] flex-shrink-0" />}
                </div>
              );
            })
          ) : (
            <div className="px-4 py-3 text-xs text-gray-400 text-center italic">
              {ui(emptyText)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
