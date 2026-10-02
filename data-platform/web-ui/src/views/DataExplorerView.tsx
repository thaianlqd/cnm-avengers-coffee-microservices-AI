import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { TableMetadata } from '../types';

export const DataExplorerView: React.FC = () => {
  const { 
    tables, 
    sampleQueries, 
    fetchTables, 
    activeSql, 
    setActiveSql, 
    runQuery, 
    queryResult, 
    isQueryRunning,
    setSelectedTableForInspect,
    queryHistory,
    showToast
  } = usePlatformStore();

  const [activeTab, setActiveTab] = useState<'sql' | 'saved' | 'history'>('sql');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedTable, setExpandedTable] = useState<string | null>(null);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const filteredTables = tables.filter((t) => 
    (t.display_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.category || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.columns || []).some(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const categoryOrder: Record<string, number> = {
    'Bán hàng & Đơn hàng': 1,
    'Thực đơn & Sản phẩm': 2,
    'Khách hàng & Hội viên': 3,
    'Chi nhánh & Vận hành': 4,
    'Báo cáo tổng hợp': 5,
  };

  const categoryGroups = filteredTables.reduce((acc: Record<string, TableMetadata[]>, table) => {
    const cat = table.category || (table.schema === 'gold' ? 'Báo cáo tổng hợp' : 'Dữ liệu vận hành');
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(table);
    return acc;
  }, {});

  const sortedCategories = Object.keys(categoryGroups).sort((a, b) => 
    (categoryOrder[a] ?? 99) - (categoryOrder[b] ?? 99)
  );

  const handleExportCSV = () => {
    if (!queryResult || queryResult.data.length === 0) {
      showToast('Không có dữ liệu để xuất CSV', 'error');
      return;
    }

    const headers = queryResult.columns.join(',');
    const rows = queryResult.data.map(row => 
      queryResult.columns.map(col => `"${row[col] ?? ''}"`).join(',')
    );
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `query_result_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Đã tải xuống tệp dữ liệu CSV', 'success');
  };

  const handleClear = () => {
    setActiveSql('');
    showToast('Đã xóa nội dung trình soạn thảo', 'info');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      runQuery();
    }
  };

  const lineCount = activeSql ? activeSql.split('\n').length : 1;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pb-8">
      {/* LEFT COLUMN: Data Catalog */}
      <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[780px] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Danh mục bảng dữ liệu
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Tầng dữ liệu phân tích</p>
            </div>
            <span className="text-xs font-medium text-slate-500">
              {tables.length} bảng
            </span>
          </div>

          {/* Search box */}
          <div className="mt-3">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm bảng, cột hoặc chủ đề..."
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200/80 rounded-xl outline-none focus:border-slate-400 transition-colors"
            />
          </div>
        </div>

        {/* Scrollable Categories & Tables */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {sortedCategories.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              Không tìm thấy bảng phù hợp
            </div>
          ) : (
            sortedCategories.map((categoryName) => {
              const catTables = categoryGroups[categoryName] || [];

              return (
                <div key={categoryName} className="space-y-1">
                  <div className="flex items-center justify-between px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 rounded-lg">
                    <span>{categoryName}</span>
                    <span className="text-[11px] font-normal text-slate-400">{catTables.length} bảng</span>
                  </div>

                  <div className="space-y-1">
                    {catTables.map((table) => {
                      const isExpanded = expandedTable === table.name;

                      return (
                        <div key={table.name} className="rounded-xl border border-slate-200/70 overflow-hidden bg-white">
                          <button
                            onClick={() => {
                              setExpandedTable(isExpanded ? null : table.name);
                              setSelectedTableForInspect(table);
                            }}
                            className={`w-full flex items-center justify-between p-2.5 text-left transition-colors text-xs cursor-pointer ${
                              isExpanded ? 'bg-slate-50 font-medium' : 'hover:bg-slate-50/50'
                            }`}
                          >
                            <div className="min-w-0 flex-1 pr-2">
                              <div className="text-slate-800 truncate font-medium">
                                {table.display_name || table.table_name.replace(/_/g, ' ')}
                              </div>
                              <div className="font-mono text-[10px] text-slate-400 truncate mt-0.5">
                                {table.name}
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {table.columns.length} cột
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="px-3 py-2.5 bg-slate-50/50 border-t border-slate-100 text-xs space-y-2">
                              {table.description && (
                                <p className="text-[11px] text-slate-500 leading-relaxed bg-white p-2 rounded-lg border border-slate-100">
                                  {table.description}
                                </p>
                              )}

                              <div>
                                <div className="text-[10px] font-medium text-slate-400 mb-1">
                                  Danh sách trường
                                </div>
                                <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                                  {table.columns.map((col, cIdx) => (
                                    <div key={cIdx} className="flex items-center justify-between text-[11px] py-0.5">
                                      <span className="font-mono text-slate-700 truncate max-w-[150px]">
                                        {col.name}
                                      </span>
                                      <span className="font-mono text-[10px] text-slate-400 uppercase">
                                        {col.type}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <button
                                onClick={() => {
                                  const sql = `SELECT * FROM ${table.name} LIMIT 50;`;
                                  setActiveSql(sql);
                                  runQuery(sql);
                                }}
                                className="w-full mt-2 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-center cursor-pointer"
                              >
                                Xem dữ liệu mẫu (50 dòng)
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: SQL Editor & Results */}
      <div className="lg:col-span-8 flex flex-col space-y-5">
        {/* SQL Editor Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
          {/* Editor Header Bar */}
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            {/* Apple Segmented Tabs */}
            <div className="bg-slate-200/70 p-1 rounded-2xl inline-flex space-x-1 border border-slate-200/90">
              <button
                onClick={() => setActiveTab('sql')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer ${
                  activeTab === 'sql'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Trình soạn thảo SQL
              </button>
              
              <button
                onClick={() => setActiveTab('saved')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer ${
                  activeTab === 'saved'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Mẫu truy vấn ({sampleQueries.length})
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-xl transition-all cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Lịch sử ({queryHistory.length})
              </button>
            </div>

            {/* Separated Action Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleClear}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Xóa
              </button>

              <button
                onClick={() => runQuery()}
                disabled={isQueryRunning}
                className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isQueryRunning ? 'Đang thực thi...' : 'Chạy truy vấn'}
              </button>
            </div>
          </div>

          {/* Editor Body */}
          {activeTab === 'sql' && (
            <div>
              <textarea
                value={activeSql}
                onChange={(e) => setActiveSql(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhập câu lệnh SELECT SQL..."
                rows={10}
                className="w-full p-4 font-mono text-xs bg-slate-900 text-slate-100 outline-none resize-y min-h-[220px] leading-relaxed selection:bg-slate-700"
              />
              <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between font-mono">
                <span>{lineCount} dòng • {activeSql.length} ký tự</span>
                <span className="text-slate-400">Ctrl + Enter để chạy</span>
              </div>
            </div>
          )}

          {activeTab === 'saved' && (
            <div className="p-3 bg-slate-900 min-h-[220px] max-h-72 overflow-y-auto space-y-2">
              {sampleQueries.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60 flex items-center justify-between hover:bg-slate-800 transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="text-xs font-medium text-slate-200">{item.title}</div>
                    <pre className="text-[11px] font-mono text-slate-300 truncate mt-1 bg-slate-900/60 p-1.5 rounded-lg">{item.sql}</pre>
                  </div>
                  <button
                    onClick={() => {
                      setActiveSql(item.sql);
                      setActiveTab('sql');
                      runQuery(item.sql);
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Dùng mẫu này
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="p-3 bg-slate-900 min-h-[220px] max-h-72 overflow-y-auto space-y-2">
              {queryHistory.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-8">Chưa có lịch sử câu lệnh nào</div>
              ) : (
                queryHistory.map((h, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60 flex items-center justify-between text-xs">
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="font-mono text-slate-300 truncate text-[11px]">{h.sql}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {h.time} • {h.duration} ms • {h.rows} dòng
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveSql(h.sql);
                        setActiveTab('sql');
                        runQuery(h.sql);
                      }}
                      className="px-2.5 py-1 text-[11px] font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-md cursor-pointer"
                    >
                      Chạy lại
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Results Container */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden h-[480px]">
          {/* Results Header Bar */}
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold text-slate-900">
                Bảng kết quả
              </span>

              {queryResult && !queryResult.error && (
                <span className="text-xs text-slate-500 font-medium">
                  {queryResult.count} dòng ({queryResult.duration_ms} ms)
                </span>
              )}

              {queryResult?.error && (
                <span className="text-xs text-rose-600 font-medium">
                  Lỗi cú pháp SQL
                </span>
              )}
            </div>

            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              Xuất CSV
            </button>
          </div>

          {/* Results Table Area */}
          <div className="flex-1 overflow-auto p-3">
            {isQueryRunning ? (
              <div className="h-full flex flex-col items-center justify-center space-y-2">
                <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-xs text-slate-500">Đang quét kho dữ liệu...</div>
              </div>
            ) : queryResult?.error ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-mono whitespace-pre-wrap leading-relaxed">
                {queryResult.error}
              </div>
            ) : !queryResult || queryResult.data.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-1.5 py-12">
                <p className="text-xs font-medium text-slate-500">Chưa có kết quả</p>
                <p className="text-[11px] text-slate-400">Nhập câu lệnh SQL và bấm Chạy truy vấn</p>
              </div>
            ) : (
              <div className="h-full overflow-auto border border-slate-200/80 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 text-slate-700 sticky top-0 z-10 border-b border-slate-200/80 font-medium">
                    <tr>
                      <th className="px-3 py-2 text-slate-400 w-10 text-center font-mono text-[11px]">#</th>
                      {queryResult.columns.map((col, idx) => (
                        <th key={idx} className="px-3.5 py-2 font-mono text-slate-800 whitespace-nowrap text-xs">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {queryResult.data.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3 py-2 text-slate-400 font-mono text-[10px] text-center">
                          {rIdx + 1}
                        </td>
                        {queryResult.columns.map((col, cIdx) => (
                          <td key={cIdx} className="px-3.5 py-2 text-slate-700 font-mono whitespace-nowrap text-[11px]">
                            {row[col] !== null && row[col] !== undefined 
                              ? String(row[col]) 
                              : <span className="text-slate-300 italic">null</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer status */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-400 flex justify-between items-center flex-shrink-0">
            <span>Cuộn ngang và dọc để xem chi tiết</span>
            <span>{queryResult ? `${queryResult.count} bản ghi` : '0 bản ghi'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
