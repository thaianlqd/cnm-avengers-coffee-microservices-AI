import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';

export const EventDetailModal: React.FC = () => {
  const { inspectedEvent, setInspectedEvent, showToast } = usePlatformStore();

  if (!inspectedEvent) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(inspectedEvent.payload, null, 2));
    showToast('Đã sao chép nội dung sự kiện vào bộ nhớ tạm', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-md p-4">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 text-base">
              Chi tiết sự kiện realtime
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Chủ đề: {inspectedEvent.topic} • Mã: #{inspectedEvent.id}
            </p>
          </div>
          <button
            onClick={() => setInspectedEvent(null)}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>

        {/* Metadata info */}
        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
              <div className="text-[11px] font-medium text-slate-400">Khóa sự kiện</div>
              <div className="text-xs font-mono font-medium text-slate-800 truncate mt-1">
                {inspectedEvent.event_key || 'Tự động tạo'}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
              <div className="text-[11px] font-medium text-slate-400">Loại sự kiện</div>
              <div className="text-xs font-medium text-slate-800 mt-1">
                {inspectedEvent.event_type || 'Ghi nhận giao dịch'}
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 col-span-2 sm:col-span-1">
              <div className="text-[11px] font-medium text-slate-400">Thời gian nhận</div>
              <div className="text-xs font-medium text-slate-800 mt-1">
                {inspectedEvent.received_at ? new Date(inspectedEvent.received_at).toLocaleString('vi-VN') : 'Vừa xong'}
              </div>
            </div>
          </div>

          {/* Payload JSON */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">
                Gói tin Payload JSON
              </span>
              <button
                onClick={handleCopy}
                className="text-xs text-slate-600 hover:text-slate-900 font-medium px-3 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Sao chép
              </button>
            </div>
            <pre className="p-4 bg-slate-900 text-slate-200 font-mono text-xs rounded-2xl overflow-x-auto max-h-72 border border-slate-800 leading-relaxed">
              {JSON.stringify(inspectedEvent.payload, null, 2)}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 flex justify-end">
          <button
            onClick={() => setInspectedEvent(null)}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
