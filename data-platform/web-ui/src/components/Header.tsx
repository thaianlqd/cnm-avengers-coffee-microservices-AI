import React, { useState } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { SearchIcon, BellIcon, RefreshIcon, CheckIcon } from './Icons';

export const Header: React.FC = () => {
  const { 
    setActiveTab, 
    fetchOverview, 
    fetchMarts, 
    fetchTables, 
    showToast 
  } = usePlatformStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    showToast('Đang đồng bộ dữ liệu thời gian thực...', 'info');
    try {
      await Promise.all([
        fetchOverview(),
        fetchMarts(),
        fetchTables()
      ]);
      showToast('Dữ liệu đã được cập nhật mới nhất', 'success');
    } catch {
      showToast('Lỗi đồng bộ dữ liệu', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    const q = searchQuery.toLowerCase().trim();
    if (q.includes('ai') || q.includes('báo cáo') || q.includes('hỏi')) {
      setActiveTab('ai_assistant');
    } else if (q.includes('sql') || q.includes('truy vấn') || q.includes('select')) {
      setActiveTab('explorer');
    } else if (q.includes('cửa hàng') || q.includes('chi nhánh') || q.includes('doanh thu')) {
      setActiveTab('analytics');
    } else {
      setActiveTab('warehouse');
    }
    showToast(`Đang tìm kiếm cho: "${searchQuery}"`, 'info');
  };

  return (
    <header className="bg-white border-b border-slate-200/80 sticky top-0 z-20 px-6 sm:px-8 h-16 flex items-center justify-between shadow-xs">
      {/* Left: Search Bar matching mockup image */}
      <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <SearchIcon className="w-4 h-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm dữ liệu, báo cáo, bảng..."
            className="w-full bg-slate-50/80 border border-slate-200/90 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
          />
        </div>
      </form>

      {/* Right: Notification Bell & User Profile matching mockup image */}
      <div className="flex items-center space-x-4 pl-4">
        {/* Quick Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Làm mới dữ liệu toàn hệ thống"
          className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200/80"
        >
          <RefreshIcon className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
        </button>

        {/* Notifications Bell */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            title="Thông báo hệ thống"
            className="relative p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer border border-transparent hover:border-slate-200/80"
          >
            <BellIcon className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white"></span>
          </button>

          {/* Notifications Dropdown */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 z-50 text-xs">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                <span className="font-bold text-slate-800">Thông báo hệ thống</span>
                <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold">2 mới</span>
              </div>
              <div className="space-y-2">
                <div className="p-2 bg-slate-50 rounded-xl flex items-start space-x-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 flex-shrink-0"></span>
                  <div>
                    <p className="font-semibold text-slate-800">Đồng bộ Data Marts</p>
                    <p className="text-[11px] text-slate-500">Pipeline Gold vừa hoàn tất lúc 14:30</p>
                  </div>
                </div>
                <div className="p-2 bg-slate-50 rounded-xl flex items-start space-x-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 mt-1 flex-shrink-0"></span>
                  <div>
                    <p className="font-semibold text-slate-800">Trợ lý AI sẵn sàng</p>
                    <p className="text-[11px] text-slate-500">Vector Knowledge DB đã kết nối schema mới</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Info */}
        <div className="flex items-center space-x-3 pl-2 border-l border-slate-200">
          <div className="w-9 h-9 rounded-full bg-slate-900 text-white font-bold text-xs flex items-center justify-center shadow-xs flex-shrink-0">
            NT
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-bold text-slate-900 leading-tight">
              Nguyễn Thành
            </div>
            <div className="text-[11px] text-slate-400 font-medium leading-tight">
              Data Analyst
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
