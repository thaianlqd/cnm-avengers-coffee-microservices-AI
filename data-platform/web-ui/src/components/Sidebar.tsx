import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { ViewTab } from '../types';
import { 
  DatabaseIcon, 
  LayersIcon, 
  TableIcon, 
  QueryIcon, 
  UsersIcon, 
  PipelineIcon, 
  ShieldIcon, 
  ChartBarIcon,
  SparklesIcon
} from './Icons';

interface NavItem {
  id: string;
  label: string;
  icon: React.FC<{ className?: string }>;
  badge?: string;
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, analyticsSubTab, setAnalyticsSubTab } = usePlatformStore();

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Tổng quan', icon: DatabaseIcon },
    { id: 'analytics', label: 'Báo cáo và Phân tích', icon: LayersIcon },
    { id: 'ai_assistant', label: 'Trợ lý AI', icon: SparklesIcon, badge: 'AI' },
    { id: 'explorer', label: 'Khám phá dữ liệu', icon: QueryIcon, badge: 'SQL' },
    { id: 'system', label: 'Quản trị hệ thống', icon: ShieldIcon },
  ];


  return (
    <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="h-14 px-4 flex items-center space-x-2.5 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-sm flex-shrink-0">
          <DatabaseIcon className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-white text-sm tracking-tight truncate flex items-center">
            BrewData
            <span className="ml-1.5 px-1 py-0.2 text-[9px] font-bold bg-emerald-500/20 text-emerald-400 rounded">
              BI
            </span>
          </div>
          <div className="text-[10px] text-slate-400 truncate">Data Analyst Studio</div>
        </div>
      </div>

      {/* Navigation List: Clean Single Line */}
      <nav className="flex-1 px-2.5 py-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as ViewTab)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                isActive
                  ? 'bg-emerald-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 font-medium'
              }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                    isActive ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
          Data Marts Online
        </span>
        <span className="font-mono text-slate-400">v2.1</span>
      </div>
    </aside>
  );
};
