import React, { useState } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';

export const Header: React.FC = () => {
  const { showToast } = usePlatformStore();
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      showToast(`Đang tìm kiếm dữ liệu: "${searchTerm}"`, 'info');
    }
  };

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20 px-8 h-16 flex items-center justify-between">
      {/* Left: Clean Minimal Search */}
      <form onSubmit={handleSearchSubmit} className="w-80 sm:w-96">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Tìm kiếm báo cáo, chỉ số, chỉ mục..."
          className="w-full bg-slate-100/70 border border-slate-200/80 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-200/50 transition-all"
        />
      </form>

      {/* Right: Clean Status and Profile */}
      <div className="flex items-center space-x-5">
        <div className="flex items-center space-x-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-[11px] font-medium tracking-tight">Dữ liệu thời gian thực</span>
        </div>

        <div className="h-4 w-px bg-slate-200" />

        <div className="flex items-center space-x-3 cursor-pointer group">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-medium text-xs tracking-tight">
            AC
          </div>
          <div className="text-left">
            <div className="text-xs font-medium text-slate-900 leading-tight">
              Ban Điều Hành
            </div>
            <div className="text-[11px] text-slate-400 font-normal leading-tight mt-0.5">
              Avengers Analytics
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
