import React, { useState, useRef, useEffect } from 'react';
import { MapPinIcon, ChevronDownIcon, CheckCircleIcon } from '@heroicons/react/24/solid';

export default function BranchSelector({ branches, selectedBranch, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = branches?.find(
    b => (b.ma_chi_nhanh || b.co_so_ma || b.branch_code) === selectedBranch
  ) || branches?.[0];

  if (!branches || branches.length === 0) {
    return (
      <div className="animate-pulse flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="h-5 w-40 bg-gray-200 rounded" />
      </div>
    );
  }

  return (
    <div className={`relative w-full ${isOpen ? 'z-[9999]' : 'z-10'}`} ref={wrapperRef}>
      <label className="text-xs font-bold text-gray-500 mb-1.5 block">Cửa hàng</label>

      {/* Trigger Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setIsOpen(prev => !prev);
        }}
        className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-[#c41230] focus:outline-none focus:ring-2 focus:ring-[#c41230]/20"
      >
        <div className="flex items-center gap-3 overflow-hidden min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#fce8eb] flex items-center justify-center">
            <MapPinIcon className="w-4 h-4 text-[#c41230]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-bold text-gray-900 truncate">
              {selected?.ten_chi_nhanh || selected?.ten_co_so || selected?.name || 'Chọn chi nhánh'}
            </span>
            <span className="text-[11px] font-medium text-gray-500 truncate">
              {selected?.dia_chi || 'Bấm để xem danh sách chi nhánh'}
            </span>
          </div>
        </div>
        <ChevronDownIcon
          className={`w-5 h-5 text-gray-400 transition-transform duration-200 flex-shrink-0 ml-2 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown — dùng absolute */}
      {isOpen && (
        <div
          className="absolute left-0 right-0 mt-2 max-h-[300px] overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] py-2 z-[9999]"
        >
          {branches.map((branch) => {
            const code = branch.ma_chi_nhanh || branch.co_so_ma || branch.branch_code;
            const name = branch.ten_chi_nhanh || branch.ten_co_so || branch.name || 'Chi nhánh hệ thống';
            const isSelected = selectedBranch === code;

            return (
              <button
                key={code}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(code);
                  setIsOpen(false);
                }}
                className={`w-full flex items-start gap-3 px-4 py-2.5 transition-colors text-left hover:bg-[#faf7f4] ${
                  isSelected ? 'bg-[#fce8eb]/40' : ''
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {isSelected ? (
                    <CheckCircleIcon className="w-5 h-5 text-[#c41230]" />
                  ) : (
                    <MapPinIcon className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className={`text-[13px] font-bold ${isSelected ? 'text-[#c41230]' : 'text-gray-800'}`}>
                    {name}
                  </span>
                  <span className="text-[11px] font-medium text-gray-500 leading-snug break-words">
                    {branch.dia_chi}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
