import React, { useState, useRef, useEffect } from 'react';
import { MapPinIcon, ChevronDownIcon, CheckCircleIcon } from '@heroicons/react/24/solid';

export default function BranchSelector({ branches, selectedBranch, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = branches?.find(b => (b.ma_chi_nhanh || b.co_so_ma || b.branch_code) === selectedBranch) || branches?.[0];

  if (!branches || branches.length === 0) {
    return (
      <div className="animate-pulse flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
         <div className="h-5 w-32 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <label className="text-xs font-bold text-gray-500 mb-1.5 block">Cửa hàng</label>
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-[#c41230] focus:outline-none focus:ring-2 focus:ring-[#c41230]/20"
      >
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#fce8eb] flex items-center justify-center">
            <MapPinIcon className="w-4 h-4 text-[#c41230]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-bold text-gray-900 truncate">
              {selected?.ten_chi_nhanh || selected?.ten_co_so || selected?.name || 'Chi nhánh hệ thống'}
            </span>
            <span className="text-[11px] font-medium text-gray-500 truncate">
              {selected?.dia_chi}
            </span>
          </div>
        </div>
        <ChevronDownIcon className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 w-full max-h-[300px] overflow-y-auto rounded-xl bg-white border border-gray-100 shadow-[0_10px_40px_-15px_rgba(0,0,0,0.15)] py-2">
          {branches.map((branch) => {
            const code = branch.ma_chi_nhanh || branch.co_so_ma || branch.branch_code;
            const name = branch.ten_chi_nhanh || branch.ten_co_so || branch.name || 'Chi nhánh hệ thống';
            const isSelected = selectedBranch === code;
            
            return (
              <button
                key={code}
                type="button"
                onClick={() => {
                  onChange(code);
                  setIsOpen(false);
                }}
                className={`w-full flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-[#faf7f4] ${isSelected ? 'bg-[#fce8eb]/30' : ''}`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {isSelected ? (
                    <CheckCircleIcon className="w-5 h-5 text-[#c41230]" />
                  ) : (
                    <MapPinIcon className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div className="flex flex-col text-left">
                  <span className={`text-[13px] font-bold ${isSelected ? 'text-[#c41230]' : 'text-gray-700'}`}>
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
