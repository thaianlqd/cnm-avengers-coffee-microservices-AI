import React, { useEffect, useState } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-md p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full border border-slate-200/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900 text-base">
              Bảng dữ liệu: <span className="font-mono text-slate-900">{previewTable.name}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {previewTable.description || 'Bảng dữ liệu phân tích'}
            </p>
          </div>
          <button
            onClick={() => setPreviewTable(null)}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 px-3 py-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Columns list */}
          <div>
            <div className="text-xs font-medium text-slate-400 mb-2.5">
              Danh sách trường ({previewTable.columns.length} cột)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {previewTable.columns.map((col, idx) => (
                <div key={idx} className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                  <div className="text-xs font-mono font-medium text-slate-800 truncate">{col.name}</div>
                  <div className="text-[10px] text-slate-400 uppercase mt-0.5">{col.type}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Sample rows */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-medium text-slate-400">
                Dữ liệu mẫu gần nhất
              </span>
              {sampleData && (
                <span className="text-[11px] text-slate-400">
                  {sampleData.duration_ms} ms
                </span>
              )}
            </div>

            {loading ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200/70 rounded-2xl">
                <div className="inline-block w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-xs text-slate-500 mt-2">Đang nạp dữ liệu mẫu...</div>
              </div>
            ) : sampleData && sampleData.data.length > 0 ? (
              <div className="overflow-x-auto border border-slate-200/70 rounded-2xl max-h-64">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0 border-b border-slate-200/70 font-medium">
                    <tr>
                      {sampleData.columns.map((col, idx) => (
                        <th key={idx} className="px-3.5 py-2.5 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {sampleData.data.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/70">
                        {sampleData.columns.map((col, cIdx) => (
                          <td key={cIdx} className="px-3.5 py-2 text-slate-700 font-mono whitespace-nowrap">
                            {row[col] !== null && row[col] !== undefined ? String(row[col]) : <span className="text-slate-300 italic">null</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center bg-slate-50 border border-slate-200/70 rounded-2xl text-xs text-slate-400">
                Không có dữ liệu trong bảng này
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-between">
          <button
            onClick={handleOpenInExplorer}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Mở trong Trình soạn thảo SQL
          </button>
          
          <button
            onClick={() => setPreviewTable(null)}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-xl transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
