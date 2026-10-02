import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';

export const PipelineLogModal: React.FC = () => {
  const { inspectedJob, setInspectedJob, triggerJob } = usePlatformStore();

  if (!inspectedJob) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-md p-4">
      <div className="bg-white rounded-3xl max-w-3xl w-full border border-slate-200/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 text-base">
              Nhật ký tác vụ ETL
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Tác vụ: {inspectedJob.name} ({inspectedJob.script})
            </p>
          </div>
          <button
            onClick={() => setInspectedJob(null)}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>

        {/* Job metadata summary */}
        <div className="p-6 space-y-5 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
              <div className="text-[11px] font-medium text-slate-400">Tầng Medallion</div>
              <div className="text-xs font-semibold text-slate-800 mt-1 uppercase">{inspectedJob.layer}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
              <div className="text-[11px] font-medium text-slate-400">Thời gian chạy</div>
              <div className="text-xs font-medium text-slate-800 mt-1">{inspectedJob.duration_seconds} giây</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
              <div className="text-[11px] font-medium text-slate-400">Bản ghi xử lý</div>
              <div className="text-xs font-medium text-slate-800 mt-1">{Number(inspectedJob.rows_processed).toLocaleString('vi-VN')} dòng</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
              <div className="text-[11px] font-medium text-slate-400">Trạng thái</div>
              <div className="text-xs font-medium text-slate-800 mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                Hoàn thành
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-400 mb-2">
              Nhật ký xử lý chi tiết
            </div>
            <div className="p-4 bg-slate-950 text-slate-300 font-mono text-xs rounded-2xl overflow-x-auto max-h-80 border border-slate-800 space-y-1">
              <div className="text-slate-500">[INFO] Khởi động trình thực thi Apache Spark 3.5.0</div>
              <div className="text-slate-500">[INFO] Kết nối máy chủ lưu trữ MinIO S3 tại http://minio:9000</div>
              <div className="text-slate-300">[INFO] Đang nạp phân vùng dữ liệu từ hồ chứa {inspectedJob.layer.toLowerCase()}...</div>
              <div className="text-emerald-400">[SUCCESS] Đã xử lý thành công {Number(inspectedJob.rows_processed).toLocaleString('vi-VN')} dòng dữ liệu</div>
              <div className="text-slate-400">[INFO] Ghi định dạng Apache Parquet với nén Snappy hoàn tất</div>
              <div className="text-emerald-400">[SUCCESS] Đồng bộ chỉ mục Data Marts vào PostgreSQL analytics schema 'gold' thành công</div>
              <div className="text-slate-500">[INFO] Thời gian thực thi tác vụ: {inspectedJob.duration_seconds}s. Mã thoát: 0</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={() => {
              triggerJob(inspectedJob.id);
              setInspectedJob(null);
            }}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Chạy lại tác vụ
          </button>
          
          <button
            onClick={() => setInspectedJob(null)}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
