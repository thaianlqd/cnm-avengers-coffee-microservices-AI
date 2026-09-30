import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { CloseIcon, PipelineIcon, PlayIcon, CheckIcon } from './Icons';

export const PipelineLogModal: React.FC = () => {
  const { inspectedJob, setInspectedJob, triggerJob } = usePlatformStore();

  if (!inspectedJob) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-sky-100 text-sky-700">
              <PipelineIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                Nhật ký Thực thi Tác vụ ETL
              </h3>
              <p className="text-xs text-slate-500">
                Tác vụ: <span className="font-semibold text-slate-700">{inspectedJob.name}</span> ({inspectedJob.script})
              </p>
            </div>
          </div>
          <button
            onClick={() => setInspectedJob(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Job metadata summary */}
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-400 uppercase">Tầng Medallion</div>
              <div className="text-xs font-bold text-emerald-700 mt-0.5 uppercase">{inspectedJob.layer}</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-400 uppercase">Thời gian thực thi</div>
              <div className="text-xs font-semibold text-slate-800 mt-0.5">{inspectedJob.duration_seconds} giây</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-400 uppercase">Bản ghi xử lý</div>
              <div className="text-xs font-semibold text-slate-800 mt-0.5">{Number(inspectedJob.rows_processed).toLocaleString('vi-VN')} dòng</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <div className="text-[11px] font-semibold text-slate-400 uppercase">Trạng thái</div>
              <div className="text-xs font-bold text-emerald-600 mt-0.5 flex items-center">
                <CheckIcon className="w-3.5 h-3.5 mr-1" />
                Hoàn thành tốt
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Nhật ký chi tiết (Console Log Output)
            </div>
            <div className="p-4 bg-slate-950 text-slate-300 font-mono text-xs rounded-xl overflow-x-auto max-h-80 border border-slate-800 space-y-1">
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
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={() => {
              triggerJob(inspectedJob.id);
              setInspectedJob(null);
            }}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
          >
            <PlayIcon className="w-3.5 h-3.5" />
            <span>Chạy lại tác vụ này</span>
          </button>
          
          <button
            onClick={() => setInspectedJob(null)}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
