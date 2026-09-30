import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { RefreshIcon, BellIcon, FilterIcon, ClockIcon } from './Icons';

export const Header: React.FC = () => {
  const { 
    activeTab, 
    dateRange, 
    setDateRange, 
    fetchOverview,
    fetchPipelines,
    fetchTables,
    fetchMarts,
    fetchSystem,
    showToast
  } = usePlatformStore();

  const getTitle = () => {
    switch (activeTab) {
      case 'overview': return 'Tổng quan';
      case 'analytics': return 'Báo cáo và Phân tích';
      case 'ai_assistant': return 'Trợ lý AI Phân tích Dữ liệu';
      case 'explorer': return 'Khám phá dữ liệu';
      case 'system': return 'Quản trị hệ thống';
      default: return 'Bảng điều khiển';
    }
  };

  const handleRefresh = async () => {
    showToast('Đang làm mới dữ liệu...', 'info');
    await Promise.all([
      fetchOverview(),
      fetchPipelines(),
      fetchTables(),
      fetchMarts(),
      fetchSystem()
    ]);
    showToast('Dữ liệu đã được cập nhật', 'success');
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20 px-6 py-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left: View title */}
        <div className="flex items-center space-x-2">
          <h1 className="text-base font-bold text-slate-800">
            {getTitle()}
          </h1>
          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            Trực tuyến
          </span>
        </div>

        {/* Right: Controls and Profile */}
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <ClockIcon className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value);
                fetchMarts();
              }}
              className="bg-transparent font-medium text-slate-800 outline-none cursor-pointer"
            >
              <option value="30days">01-09-2026 đến 30-09-2026</option>
              <option value="14days">14 ngày qua</option>
              <option value="7days">7 ngày qua</option>
              <option value="today">Hôm nay</option>
            </select>
          </div>

          <button
            onClick={handleRefresh}
            title="Làm mới dữ liệu"
            className="p-1.5 rounded-lg text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 shadow-sm"
          >
            <RefreshIcon className="w-4 h-4 text-slate-600" />
          </button>

          <div className="flex items-center pl-2 border-l border-slate-200 space-x-2">
            <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs">
              NV
            </div>
            <div className="hidden sm:block text-left text-xs font-semibold text-slate-800">
              Nguyễn Văn A
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
