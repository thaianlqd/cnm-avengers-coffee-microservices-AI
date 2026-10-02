import React, { useState } from 'react';
import { BlueprintIcon, CheckIcon } from '../components/Icons';

export const ArchitectureView: React.FC = () => {
  const [selectedLayer, setSelectedLayer] = useState<number | null>(4);

  const layers = [
    { level: 1, name: 'Tầng 1 — Nguồn dữ liệu', tech: 'PostgreSQL (5 Schemas), Kafka Events, Mobile Clickstream', latency: '< 1s' },
    { level: 2, name: 'Tầng 2 — Ingestion & CDC', tech: 'Apache Kafka 7.4 + Zookeeper + Debezium CDC WAL', latency: '< 50ms' },
    { level: 3, name: 'Tầng 3 — Xử lý tính toán', tech: 'Apache Spark 3.5, PySpark Batch & ALS MLlib', latency: 'Hằng giờ' },
    { level: 4, name: 'Tầng 4 — Hồ Lakehouse', tech: 'MinIO S3 (Bronze, Silver Parquet, Gold Marts, Models)', latency: 'Parquet Snappy' },
    { level: 5, name: 'Tầng 5 — Query Engine', tech: 'PostgreSQL Analytics DWH + Apache Trino ANSI SQL', latency: '< 50ms' },
    { level: 6, name: 'Tầng 6 — Điều phối ETL', tech: 'Apache Airflow 2.8.1 (DAGs) + Great Expectations', latency: '24/7 Cron' },
    { level: 7, name: 'Tầng 7 — Trực quan hóa', tech: 'React 18 + Tailwind + Zustand + FastAPI Analytics', latency: 'Realtime' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h2 className="text-base font-bold text-slate-800">
            Kiến trúc Nền tảng Dữ liệu (Modern Data Stack 7 Lớp)
          </h2>
          <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">
            Enterprise
          </span>
        </div>
        <span className="text-xs text-slate-400">Medallion Lakehouse Architecture</span>
      </div>

      {/* 7-Layer Interactive Stack */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {layers.map((l) => {
          const isSelected = selectedLayer === l.level;
          return (
            <div
              key={l.level}
              onClick={() => setSelectedLayer(l.level)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-emerald-50/60 border-emerald-500 shadow-sm ring-1 ring-emerald-500'
                  : 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">{l.name}</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">
                  {l.latency}
                </span>
              </div>
              <div className="mt-2 text-xs font-mono text-slate-600 truncate">{l.tech}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
