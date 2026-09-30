import React, { useState } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { StorageIcon, DownloadIcon } from '../components/Icons';

export const StorageView: React.FC = () => {
  const { showToast } = usePlatformStore();
  const [selectedBucket, setSelectedBucket] = useState('silver');

  const buckets = [
    { id: 'bronze', name: 'avengers-bronze', label: 'Bronze Lake', format: 'JSON / NDJSON', size: '432.8 MB', objects: '962.325' },
    { id: 'silver', name: 'avengers-silver', label: 'Silver Parquet', format: 'Parquet Snappy', size: '685.4 MB', objects: '252.025' },
    { id: 'gold', name: 'avengers-gold', label: 'Gold Marts', format: 'Parquet & JSON', size: '128.2 MB', objects: '645' },
    { id: 'models', name: 'avengers-models', label: 'AI Models', format: 'MLflow & Parquet', size: '14.5 MB', objects: '24' },
  ];

  const fileTree = [
    { path: 'silver/orders/year=2026/month=09/orders_part_001.snappy.parquet', size: '42.5 MB', rows: '12.400 dòng', updated: '28/09 08:38' },
    { path: 'silver/orders/year=2026/month=09/orders_part_002.snappy.parquet', size: '38.2 MB', rows: '11.200 dòng', updated: '28/09 08:38' },
    { path: 'silver/order_items/year=2026/month=09/items_part_001.snappy.parquet', size: '64.1 MB', rows: '28.500 dòng', updated: '28/09 08:39' },
    { path: 'silver/identity/year=2026/month=09/users_part_001.snappy.parquet', size: '18.4 MB', rows: '8.100 dòng', updated: '28/09 08:39' },
    { path: 'gold/kpi/latest.json', size: '4 KB', rows: '1 dòng', updated: '28/09 08:40' },
    { path: 'gold/revenue_daily/latest.json', size: '12 KB', rows: '90 dòng', updated: '28/09 08:40' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <h2 className="text-base font-bold text-slate-800">
            Kho lưu trữ Lakehouse (MinIO S3)
          </h2>
          <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">
            4 Buckets
          </span>
        </div>
        <span className="text-xs text-slate-400 font-mono">Total: 1.26 GB</span>
      </div>

      {/* 4 Bucket Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {buckets.map((b) => {
          const isSelected = selectedBucket === b.id;
          return (
            <div
              key={b.id}
              onClick={() => setSelectedBucket(b.id)}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-emerald-50/50 border-emerald-500 shadow-sm ring-1 ring-emerald-500'
                  : 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-800 truncate">{b.name}</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                  {b.size}
                </span>
              </div>

              <div className="text-xs font-bold text-emerald-800 mt-2">{b.label}</div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span>{b.format}</span>
                <span>{b.objects} files</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Parquet Browser */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Tệp đối tượng Parquet & JSON (s3://avengers-lakehouse/)
          </h3>
        </div>

        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100">
            <tr>
              <th className="px-4 py-2.5">S3 Key</th>
              <th className="px-4 py-2.5">Kích thước</th>
              <th className="px-4 py-2.5">Số dòng</th>
              <th className="px-4 py-2.5">Cập nhật</th>
              <th className="px-4 py-2.5 text-right">Tải về</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fileTree.map((f, idx) => (
              <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                <td className="px-4 py-2.5 font-mono font-bold text-slate-800 flex items-center space-x-2">
                  <StorageIcon className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
                  <span className="truncate max-w-md">{f.path}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-600 font-semibold">{f.size}</td>
                <td className="px-4 py-2.5 text-slate-500">{f.rows}</td>
                <td className="px-4 py-2.5 text-slate-400 font-mono">{f.updated}</td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => showToast(`Tải tệp: ${f.path.split('/').pop()}`, 'info')}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
                  >
                    <DownloadIcon className="w-3 h-3 text-slate-500" />
                    <span>Tải</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
