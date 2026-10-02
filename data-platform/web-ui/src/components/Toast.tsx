import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';

export const Toast: React.FC = () => {
  const { toast, hideToast } = usePlatformStore();

  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-3.5 max-w-md bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl p-4 transition-all animate-in fade-in slide-in-from-bottom-2">
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
        isSuccess ? 'bg-emerald-500' : isError ? 'bg-rose-500' : 'bg-blue-500'
      }`} />
      
      <div className="flex-1 min-w-0 pr-2">
        <p className="text-[11px] font-medium text-slate-400">
          {isSuccess ? 'Thành công' : isError ? 'Thông báo lỗi' : 'Hệ thống'}
        </p>
        <p className="text-xs font-normal text-slate-800 leading-snug break-words">{toast.message}</p>
      </div>

      <button 
        onClick={hideToast}
        className="px-2 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
      >
        Đóng
      </button>
    </div>
  );
};
