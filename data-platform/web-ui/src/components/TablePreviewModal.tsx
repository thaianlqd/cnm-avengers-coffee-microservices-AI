import React, { useEffect, useState } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { CloseIcon, TableIcon, QueryIcon } from './Icons';
import { QueryResult } from '../types';

export const TablePreviewModal: React.FC = () => {
  const { previewTable, setPreviewTable, setActiveTab, setActiveSql, runQuery } = usePlatformStore();
  const [sampleData, setSampleData] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!previewTable) {
      setSampleData(null);
      return;
    }

    const loadSample = async () => {
      setLoading(true);
      try {
        const sql = `SELECT * FROM ${previewTable.name} LIMIT 10;`;
        const res = await fetch('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sql })
        });
        if (res.ok) {
          const data = await res.json();
          setSampleData(data);
        }
      } catch (e) {
        console.error('Lỗi nạp dữ liệu mẫu:', e);
      } finally {
        setLoading(false);
      }
    };

    loadSample();
  }, [previewTable]);

  if (!previewTable) return null;

  const handleOpenInExplorer = () => {
    setActiveSql(`SELECT * FROM ${previewTable.name} LIMIT 100;`);
    setActiveTab('explorer');
    runQuery(`SELECT * FROM ${previewTable.name} LIMIT 100;`);
    setPreviewTable(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
              <TableIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">
                Xem Bảng: <span className="font-mono text-emerald-700">{previewTable.name}</span>
              </h3>
              <p className="text-xs text-slate-500">
                {previewTable.description || 'Bảng dữ liệu trong Kho phân tích'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setPreviewTable(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Columns list */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Cấu trúc Cột ({previewTable.columns.length} cột)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {previewTable.columns.map((col, idx) => (
                <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-xs font-mono font-bold text-slate-800 truncate">{col.name}</div>
                  <div className="text-[10px] font-semibold text-emerald-700 uppercase mt-0.5">{col.type}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sample rows */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                10 dòng dữ liệu mẫu gần nhất
              </span>
              {sampleData && (
                <span className="text-xs text-slate-400 font-medium">
                  Thời gian truy vấn: {sampleData.duration_ms} ms
                </span>
              )}
            </div>

            {loading ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl">
                <div className="inline-block w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-xs text-slate-500 mt-2">Đang tải dữ liệu mẫu từ kho...</div>
              </div>
            ) : sampleData && sampleData.data.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-64">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0">
                    <tr>
                      {sampleData.columns.map((col, idx) => (
                        <th key={idx} className="px-3 py-2 font-semibold border-b border-slate-200 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sampleData.data.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/80">
                        {sampleData.columns.map((col, cIdx) => (
                          <td key={cIdx} className="px-3 py-2 text-slate-600 font-mono whitespace-nowrap">
                            {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-300">null</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500">
                Không có dữ liệu trong bảng này.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            onClick={handleOpenInExplorer}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
          >
            <QueryIcon className="w-3.5 h-3.5" />
            <span>Mở trong SQL Studio</span>
          </button>
          
          <button
            onClick={() => setPreviewTable(null)}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
