import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { ViewTab } from '../types';
import { 
  DatabaseIcon, 
  LayersIcon, 
  QueryIcon, 
  StorageIcon,
  SparklesIcon,
  ShieldIcon,
  AvengersBadgeIcon
} from './Icons';

interface NavItem {
  id: ViewTab;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: string;
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab } = usePlatformStore();

  // 6 Core Fully-Functional Features (No empty or dummy placeholders)
  const navItems: NavItem[] = [
    { id: 'overview', label: 'Tổng quan', icon: DatabaseIcon },
    { id: 'explorer', label: 'Khám phá dữ liệu (SQL)', icon: QueryIcon, badge: 'SQL' },
    { id: 'analytics', label: 'Báo cáo & Phân tích', icon: LayersIcon },
    { id: 'warehouse', label: 'Kho dữ liệu (DWH)', icon: StorageIcon, badge: '65 Bảng' },
    { id: 'ai_assistant', label: 'Trợ lý AI', icon: SparklesIcon, badge: 'AI' },
    { id: 'system', label: 'Quản trị hệ thống', icon: ShieldIcon },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0 border-r border-slate-800 select-none h-screen">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center space-x-3 border-b border-slate-800/80 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700/80 flex items-center justify-center text-white shadow-sm flex-shrink-0">
          <AvengersBadgeIcon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-white text-sm tracking-tight truncate">
            Avengers Coffee
          </div>
          <div className="text-[11px] text-slate-400 font-medium truncate">Data Platform</div>
        </div>
      </div>

      {/* Navigation Scroll Area - Clean and 100% functional */}
      <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto custom-scrollbar">
        <div className="px-3 pb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          CHỨC NĂNG HỆ THỐNG
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-500/20'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 font-medium'
              }`}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate tracking-wide">{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive 
                      ? 'bg-blue-700 text-white' 
                      : item.badge === 'AI'
                      ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Card widget */}
      <div className="p-3.5 border-t border-slate-800/80 flex-shrink-0">
        <div className="relative rounded-2xl bg-gradient-to-b from-slate-800 to-slate-850 p-3.5 border border-slate-700/70 overflow-hidden shadow-sm">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none" />
          
          <div className="relative z-10">
            <div className="text-xs font-bold text-white leading-tight">
              Better Data
            </div>
            <div className="text-xs font-bold text-slate-300 leading-tight mt-0.5">
              Better Decisions
            </div>
            
            <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between text-[10px] text-slate-400 font-medium">
              <span className="truncate">Data Platform Core</span>
              <span className="font-mono text-slate-400 flex-shrink-0 ml-1">v2.1</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
