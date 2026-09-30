import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { CloseIcon, CopyIcon, StreamIcon } from './Icons';

export const EventDetailModal: React.FC = () => {
  const { inspectedEvent, setInspectedEvent, showToast } = usePlatformStore();

  if (!inspectedEvent) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(inspectedEvent.payload, null, 2));
    showToast('Đã sao chép nội dung sự kiện vào bộ nhớ tạm', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <StreamIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                Chi tiết Sự kiện Realtime
              </h3>
              <p className="text-xs text-slate-500">
                Chủ đề: <span className="font-mono text-emerald-700 font-semibold">{inspectedEvent.topic}</span> • Mã sự kiện: #{inspectedEvent.id}
              </p>
            </div>
          </div>
          <button
            onClick={() => setInspectedEvent(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Metadata info */}
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-400 uppercase">Khóa sự kiện</div>
              <div className="text-xs font-mono font-medium text-slate-800 truncate mt-0.5">
                {inspectedEvent.event_key || 'Tự động tạo'}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-400 uppercase">Loại sự kiện</div>
              <div className="text-xs font-semibold text-emerald-700 mt-0.5">
                {inspectedEvent.event_type || 'Ghi nhận giao dịch'}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 col-span-2 sm:col-span-1">
              <div className="text-[11px] font-semibold text-slate-400 uppercase">Thời gian nạp</div>
              <div className="text-xs font-medium text-slate-800 mt-0.5">
                {inspectedEvent.received_at ? new Date(inspectedEvent.received_at).toLocaleString('vi-VN') : 'Vừa xong'}
              </div>
            </div>
          </div>

          {/* Payload JSON */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Dữ liệu gói tin (Payload JSON)
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center space-x-1 text-xs text-slate-600 hover:text-emerald-700 font-medium px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                <CopyIcon className="w-3.5 h-3.5" />
                <span>Sao chép JSON</span>
              </button>
            </div>
            <pre className="p-4 bg-slate-900 text-emerald-300 font-mono text-xs rounded-xl overflow-x-auto max-h-72 border border-slate-800 leading-relaxed">
              {JSON.stringify(inspectedEvent.payload, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={() => setInspectedEvent(null)}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Đóng cửa sổ
          </button>
        </div>
      </div>
    </div>
  );
};
