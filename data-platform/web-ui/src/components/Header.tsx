import React, { useState } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';

type Props = { onLogout: () => void; logoutBusy: boolean };

export const Header: React.FC<Props> = ({ onLogout, logoutBusy }) => {
  const { searchDashboards } = usePlatformStore();
  const [searchTerm, setSearchTerm] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      searchDashboards(searchTerm.trim());
    }
  };

  return (
    <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-20 px-3 sm:px-8 h-14 sm:h-16 shrink-0 gap-3 flex items-center justify-between">
      {/* Left: Clean Minimal Search */}
      <form onSubmit={handleSearchSubmit} className="w-full max-w-96 min-w-0">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          aria-label="Tìm bài toán phân tích toàn hệ thống"
          placeholder="Tìm bài toán, báo cáo phân tích…"
          className="w-full bg-slate-100/70 border border-slate-200/80 rounded-xl px-4 py-2 text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-slate-400 focus:ring-2 focus:ring-slate-200/50 transition-all"
        />
      </form>

      {/* Right: Clean Status and Profile */}
      <div className="flex shrink-0 items-center gap-3 lg:gap-5">
        <div className="hidden lg:flex items-center space-x-2 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span className="text-[11px] font-medium tracking-tight" title="Kho phân tích được đồng bộ định kỳ (data-sync), không phải thời gian thực">Cập nhật theo đợt</span>
        </div>

        <div className="hidden lg:block h-4 w-px bg-slate-200" />

        <div role="group" aria-label="Hồ sơ và phiên đăng nhập" className="flex items-center gap-2 rounded-xl border border-slate-200/80 bg-white py-1 pl-1 pr-1.5 sm:gap-3">
          <div className="flex items-center gap-2.5 sm:pl-1">
            <div aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-medium tracking-tight text-white">
              AC
            </div>
            <div className="hidden lg:block text-left">
              <div className="text-xs font-medium text-slate-900 leading-tight">
                Ban Điều Hành
              </div>
              <div className="text-[11px] text-slate-400 font-normal leading-tight mt-0.5">
                Avengers Analytics
              </div>
            </div>
          </div>
          <span aria-hidden="true" className="h-6 w-px bg-slate-200" />
          <button type="button" onClick={onLogout} disabled={logoutBusy} aria-busy={logoutBusy} aria-label="Đăng xuất tài khoản phân tích" title={logoutBusy ? 'Đang đăng xuất…' : 'Đăng xuất tài khoản phân tích'} className="inline-flex min-h-9 min-w-9 items-center justify-center gap-2 rounded-lg px-2 text-xs font-medium text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-wait disabled:opacity-50 sm:px-3">
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0"><path d="M8 3.5H4.5A1.5 1.5 0 0 0 3 5v10a1.5 1.5 0 0 0 1.5 1.5H8M11.5 6.5 15 10l-3.5 3.5M7 10h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="hidden sm:inline">{logoutBusy ? 'Đang đăng xuất…' : 'Đăng xuất'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
