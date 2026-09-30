import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { CheckIcon, AlertIcon, CloseIcon } from './Icons';

export const Toast: React.FC = () => {
  const { toast, hideToast } = usePlatformStore();

  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center space-x-3 max-w-md bg-white border border-slate-200 shadow-xl rounded-xl p-4 transition-all">
      <div className={`p-2 rounded-lg ${
        isSuccess ? 'bg-emerald-50 text-emerald-600' : isError ? 'bg-rose-50 text-rose-600' : 'bg-sky-50 text-sky-600'
      }`}>
        {isSuccess ? <CheckIcon className="w-5 h-5" /> : <AlertIcon className="w-5 h-5" />}
      </div>
      <div className="flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {isSuccess ? 'Thông báo thành công' : isError ? 'Cảnh báo lỗi' : 'Hệ thống'}
        </p>
        <p className="text-sm font-medium text-slate-700 leading-snug">{toast.message}</p>
      </div>
      <button 
        onClick={hideToast}
        className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100"
      >
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  );
};
