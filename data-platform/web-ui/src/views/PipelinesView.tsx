import React, { useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
export const PipelinesView: React.FC = () => {
  const {pipelines,fetchPipelines,setInspectedJob,isLoadingPipelines,dataErrors}=usePlatformStore();
  useEffect(()=>{fetchPipelines();},[fetchPipelines]);
  return <section className="space-y-4"><h1 className="text-xl font-semibold">Tác vụ xử lý dữ liệu</h1>
    <p className="text-sm text-slate-500">Chưa đo tác vụ đang chạy hoặc lịch Airflow. Một bản công bố DB chưa xác minh trạng thái object storage.</p>
    {isLoadingPipelines && <p role="status">Đang tải thông tin tác vụ…</p>}
    {dataErrors.pipelines && <p role="alert">{dataErrors.pipelines}</p>}
    {!isLoadingPipelines && !dataErrors.pipelines && !(pipelines?.jobs.length) && <p role="status">Chưa có quan sát tác vụ.</p>}
    {(pipelines?.jobs || []).map(job=><button key={job.id} className="block rounded-xl border bg-white p-4 text-left" onClick={()=>setInspectedJob(job)}><strong>{job.name}</strong><p>{job.status || 'Chưa đo'}</p><p>{job.last_run || 'Chưa có thời điểm chạy'}</p></button>)}
    {(pipelines?.committed_publications || []).map(p=><article key={p.pipeline} className="rounded-xl border bg-white p-4"><strong>Bản công bố DB: {p.pipeline}</strong><p>{p.run_id}</p><p>{p.published_at}</p></article>)}
  </section>;
};
