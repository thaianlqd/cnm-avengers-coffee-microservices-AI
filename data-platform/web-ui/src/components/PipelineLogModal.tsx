import React from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
export const PipelineLogModal: React.FC = () => {
  const {inspectedJob:job,setInspectedJob}=usePlatformStore();
  if(!job)return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4"><section role="dialog" aria-label="Thông tin tác vụ" className="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-6">
    <h2 className="font-semibold">{job.name}</h2><p className="text-sm text-slate-500">{job.script} · {job.layer}</p>
    <dl className="grid grid-cols-2 gap-3 text-sm"><dt>Trạng thái được trả về</dt><dd>{job.status || 'Chưa đo'}</dd><dt>Lần chạy</dt><dd>{job.last_run || 'Chưa đo'}</dd><dt>Thời lượng</dt><dd>{job.duration_seconds==null?'Chưa đo':`${job.duration_seconds}s`}</dd><dt>Bản ghi</dt><dd>{job.rows_processed==null?'Chưa đo':job.rows_processed.toLocaleString('vi-VN')}</dd></dl>
    <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm">Chưa có nhật ký thực thi hoặc mã thoát được thu thập cho tác vụ này.</p>
    <button className="rounded-xl border px-4 py-2" onClick={()=>setInspectedJob(null)}>Đóng</button>
  </section></div>;
};
