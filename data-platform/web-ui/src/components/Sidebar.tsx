import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { ViewTab } from '../types';

interface NavItem {
  id: string;
  label: string;
  tabTarget: ViewTab;
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, analyticsSubTab, setAnalyticsSubTab } = usePlatformStore();

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Tổng quan', tabTarget: 'overview' },
    { id: 'analytics', label: 'Báo cáo & Phân tích', tabTarget: 'analytics' },
    { id: 'ai_assistant', label: 'Trợ lý AI', tabTarget: 'ai_assistant' },
    { id: 'saved_reports', label: 'Quản lý Báo cáo', tabTarget: 'saved_reports' },
    { id: 'explorer', label: 'Khám phá dữ liệu', tabTarget: 'explorer' },
    { id: 'architecture', label: 'Kiến trúc hệ thống', tabTarget: 'architecture' },
    { id: 'system', label: 'Quản trị hệ thống', tabTarget: 'system' },
  ];

  const handleNavClick = (item: NavItem) => {
    setActiveTab(item.tabTarget);
    if (item.tabTarget === 'ai_assistant') {
      setAnalyticsSubTab('ai_assistant');
    } else if (item.tabTarget === 'saved_reports') {
      setAnalyticsSubTab('saved_reports');
    } else if (item.tabTarget === 'analytics') {
      setAnalyticsSubTab('hub');
    }
  };

  const isItemActive = (item: NavItem) => {
    if (item.id === 'ai_assistant') {
      return activeTab === 'ai_assistant' || (activeTab === 'analytics' && analyticsSubTab === 'ai_assistant');
    }
    if (item.id === 'saved_reports') {
      return activeTab === 'saved_reports' || (activeTab === 'analytics' && analyticsSubTab === 'saved_reports');
    }
    if (item.id === 'analytics') {
      return activeTab === 'analytics' && analyticsSubTab !== 'ai_assistant' && analyticsSubTab !== 'saved_reports';
    }
    return activeTab === item.tabTarget;
  };

  return (
    <aside className="w-full md:w-64 bg-[#0d1117] text-slate-300 flex flex-col flex-shrink-0 border-r border-slate-800/80 select-none">
      {/* Brand Header - Apple minimalist typography */}
      <div className="hidden h-16 px-6 md:flex items-center space-x-3 border-b border-slate-800/60">
        <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-white font-semibold text-sm shadow-inner flex-shrink-0">
          AC
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-white text-sm tracking-tight leading-none truncate">
            Avengers Coffee
          </div>
          <div className="text-[11px] text-slate-400 font-normal tracking-wide truncate mt-1">
            Data Analytics Platform
          </div>
        </div>
      </div>

      {/* Navigation Section */}
      <div className="hidden md:block px-4 pt-5 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Điều hướng chính
      </div>

      <nav aria-label="Điều hướng chính" className="flex gap-1 overflow-x-auto p-2 md:block md:flex-1 md:space-y-1 md:overflow-y-auto md:px-3">
        {navItems.map((item) => {
          const active = isItemActive(item);

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item)}
              className={`w-auto md:w-full flex items-center justify-between gap-2 whitespace-nowrap px-3.5 py-2.5 rounded-xl text-xs tracking-tight transition-all cursor-pointer text-left ${
                active
                  ? 'bg-blue-600/90 text-white font-medium shadow-sm ring-1 ring-blue-500/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 font-normal'
              }`}
            >
              <span className="truncate">{item.label}</span>
              {active && (
                <span className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Status Card */}
      <div className="hidden md:block p-4 border-t border-slate-800/60">
        <button type="button" onClick={() => setActiveTab('architecture')} className="w-full text-left bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-medium text-slate-300">Hệ thống phân tích</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Xem kiến trúc & luồng dữ liệu</div>
          </div>
          <span className="inline-block w-2 h-2 rounded-full bg-slate-500"></span>
        </button>
      </div>
    </aside>
  );
};
