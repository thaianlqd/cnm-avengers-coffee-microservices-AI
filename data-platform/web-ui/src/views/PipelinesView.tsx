import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { 
  PipelineIcon, 
  PlayIcon, 
  CheckIcon, 
  DatabaseIcon, 
  LayersIcon, 
  StreamIcon 
} from '../components/Icons';
import { JobItem } from '../types';

export const PipelinesView: React.FC = () => {
  const { 
    pipelines, 
    fetchPipelines, 
    triggerJob, 
    triggerDag, 
    setInspectedJob 
  } = usePlatformStore();

  const [activeSubTab, setActiveSubTab] = useState<'pipelines' | 'history' | 'sources'>('pipelines');

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  const jobsList = pipelines?.jobs || [
    {
      id: 'job-bronze-ingest',
      name: 'Bronze Ingest Job',
      script: 'bronze_ingestion.py',
      layer: 'Bronze',
      schedule: 'Mỗi 1 giờ',
      last_run: '28/09 08:35',
      duration_seconds: 14.2,
      rows_processed: 12400,
      status: 'HOAN_THANH'
    },
    {
      id: 'job-silver-transform',
      name: 'Silver Transform Job',
      script: 'silver_transform.py',
      layer: 'Silver',
      schedule: 'Mỗi 2 giờ',
      last_run: '28/09 08:38',
      duration_seconds: 38.5,
      rows_processed: 12400,
      status: 'HOAN_THANH'
    },
    {
      id: 'job-gold-aggregation',
      name: 'Gold Aggregation Job',
      script: 'gold_aggregation.py',
      layer: 'Gold',
      schedule: 'Mỗi 4 giờ',
      last_run: '28/09 08:40',
      duration_seconds: 22.1,
      rows_processed: 645,
      status: 'HOAN_THANH'
    }
  ];

  return (
    <div className="space-y-5">
      {/* Visual Pipeline Architecture (Matching Screen 7 in mockup) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Luồng xử lý dữ liệu tự động (ETL Flow)
          </h2>

          <button
            onClick={() => triggerDag('daily_lakehouse_pipeline')}
            className="flex items-center space-x-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
          >
            <PlayIcon className="w-3.5 h-3.5" />
            <span>Chạy toàn bộ pipeline</span>
          </button>
        </div>

        {/* 5-Node Visual Flow */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 items-center">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
            <div className="w-8 h-8 mx-auto rounded-full bg-slate-200 text-slate-700 flex items-center justify-center mb-1.5">
              <DatabaseIcon className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-800">Nguồn dữ liệu</div>
            <div className="text-[10px] text-slate-400 mt-0.5">PostgreSQL, Kafka</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
            <div className="w-8 h-8 mx-auto rounded-full bg-sky-100 text-sky-700 flex items-center justify-center mb-1.5">
              <StreamIcon className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-800">Extract</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Bronze Lake</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
            <div className="w-8 h-8 mx-auto rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center mb-1.5">
              <PipelineIcon className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-800">Transform</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Silver Parquet</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center">
            <div className="w-8 h-8 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-1.5">
              <LayersIcon className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-800">Load</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Gold Marts</div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-center col-span-2 sm:col-span-1">
            <div className="w-8 h-8 mx-auto rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-1.5">
              <CheckIcon className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-slate-800">Warehouse & BI</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Analytics & Reporting</div>
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200 space-x-1">
        {[
          { id: 'pipelines', label: 'Danh sách Pipeline' },
          { id: 'history', label: 'Lịch sử chạy' },
          { id: 'sources', label: 'Nguồn dữ liệu' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
              activeSubTab === tab.id
                ? 'border-emerald-600 text-emerald-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pipelines Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">Tên tác vụ</th>
                <th className="px-4 py-3">Tầng</th>
                <th className="px-4 py-3">Lịch trình</th>
                <th className="px-4 py-3">Lần chạy cuối</th>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Số dòng</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobsList.map((job) => (
                <tr key={job.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-800">
                    <div>{job.name}</div>
                    <div className="text-[10px] font-mono text-slate-400 font-normal">{job.script}</div>
                  </td>

                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                      {job.layer}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {job.schedule}
                  </td>

                  <td className="px-4 py-3 text-slate-500 font-mono">
                    {job.last_run}
                  </td>

                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {job.duration_seconds}s
                  </td>

                  <td className="px-4 py-3 font-semibold text-emerald-700">
                    {Number(job.rows_processed).toLocaleString('vi-VN')}
                  </td>

                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                      Thành công
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      onClick={() => setInspectedJob(job as JobItem)}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
                    >
                      Log
                    </button>

                    <button
                      onClick={() => triggerJob(job.id)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors"
                    >
                      <PlayIcon className="w-3 h-3" />
                      <span>Chạy</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
