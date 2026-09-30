import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { 
  QueryIcon, 
  PlayIcon, 
  TrashIcon, 
  DownloadIcon, 
  TableIcon, 
  ChartBarIcon, 
  ChevronRightIcon, 
  ChevronDownIcon, 
  SearchIcon,
  CheckIcon,
  AlertIcon
} from '../components/Icons';

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
    queryViewMode,
    setQueryViewMode,
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
    (t.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.schema || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group tables by schema for clean UI
  const schemaGroups = filteredTables.reduce((acc: Record<string, typeof tables>, table) => {
    const sName = table.schema || (table.name.includes('.') ? table.name.split('.')[0] : 'public');
    if (!acc[sName]) acc[sName] = [];
    acc[sName].push(table);
    return acc;
  }, {});

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

  // Find numerical and categorical columns for auto-rendering chart
  const numericColumns = queryResult?.columns.filter(col => {
    const firstVal = queryResult.data[0]?.[col];
    return typeof firstVal === 'number' || (!isNaN(Number(firstVal)) && firstVal !== null);
  }) || [];

  const categoricalColumns = queryResult?.columns.filter(col => !numericColumns.includes(col)) || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* ──────────────────────────────────────────────────────────── */}
      {/* LEFT COLUMN: Modern Table Catalog Tree (4 cols / 12) */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[740px] overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/70 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <TableIcon className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Danh mục Kho dữ liệu
                </span>
                <p className="text-[10px] text-slate-400 font-mono">postgres-analytics:5432</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              {tables.length} bảng
            </span>
          </div>

          {/* Search box */}
          <div className="mt-3 relative">
            <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm bảng, cột hoặc schema..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-emerald-600 transition-colors shadow-xs"
            />
          </div>
        </div>

        {/* Scrollable Schema & Tables Tree */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {Object.keys(schemaGroups).length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400">
              Không tìm thấy bảng phù hợp
            </div>
          ) : (
            Object.entries(schemaGroups).map(([schemaName, sTables]) => (
              <div key={schemaName} className="space-y-1">
                {/* Schema Header Badge */}
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100/60 rounded">
                  <span className="font-mono text-emerald-800">schema: {schemaName}</span>
                  <span className="text-[10px] font-normal text-slate-400">{sTables.length} bảng</span>
                </div>

                {/* Tables in this schema */}
                <div className="space-y-1 pl-1">
                  {sTables.map((table) => {
                    const isExpanded = expandedTable === table.name;
                    return (
                      <div key={table.name} className="rounded-lg border border-slate-100 overflow-hidden bg-white">
                        <button
                          onClick={() => {
                            setExpandedTable(isExpanded ? null : table.name);
                            setSelectedTableForInspect(table);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-2 text-left transition-colors text-xs ${
                            isExpanded ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center space-x-1.5 min-w-0">
                            {isExpanded ? (
                              <ChevronDownIcon className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                            ) : (
                              <ChevronRightIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            )}
                            <span className="font-mono font-medium text-slate-800 truncate text-[11px]">
                              {table.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {table.columns.length} cột
                          </span>
                        </button>

                        {/* Columns when expanded */}
                        {isExpanded && (
                          <div className="px-3 py-2 bg-slate-50/40 border-t border-slate-100 text-xs space-y-1.5">
                            {table.description && (
                              <p className="text-[10px] text-slate-500 italic mb-1">{table.description}</p>
                            )}
                            <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                              {table.columns.map((col, cIdx) => (
                                <div key={cIdx} className="flex items-center justify-between text-[11px] py-0.5">
                                  <span className="font-mono text-slate-700 truncate max-w-[130px]">
                                    {col.name}
                                  </span>
                                  <span className="font-mono text-[9px] text-slate-400 uppercase bg-white px-1 py-0.2 rounded border border-slate-200">
                                    {col.type}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={() => {
                                const sql = `SELECT * FROM ${table.name} LIMIT 50;`;
                                setActiveSql(sql);
                                runQuery(sql);
                              }}
                              className="w-full mt-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors text-center"
                            >
                              Truy vấn bảng này (LIMIT 50)
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* RIGHT COLUMN: SQL Editor & Result Container (8 cols / 12) */}
      {/* ──────────────────────────────────────────────────────────── */}
      <div className="lg:col-span-8 flex flex-col space-y-4">
        {/* SQL Editor Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Editor Header Bar */}
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
            <div className="flex space-x-1.5">
              <button
                onClick={() => setActiveTab('sql')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === 'sql'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                Trình soạn thảo SQL
              </button>
              
              <button
                onClick={() => setActiveTab('saved')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === 'saved'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                Mẫu truy vấn ({sampleQueries.length})
              </button>

              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  activeTab === 'history'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                Lịch sử ({queryHistory.length})
              </button>
            </div>

            {/* Action Buttons: UX color compliant */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleClear}
                className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center space-x-1"
                title="Xóa câu lệnh"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                <span>Xóa</span>
              </button>

              <button
                onClick={() => runQuery()}
                disabled={isQueryRunning}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors flex items-center space-x-1.5 disabled:opacity-50"
              >
                {isQueryRunning ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang chạy...</span>
                  </>
                ) : (
                  <>
                    <PlayIcon className="w-3.5 h-3.5" />
                    <span>Chạy truy vấn</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Editor Body */}
          {activeTab === 'sql' && (
            <textarea
              value={activeSql}
              onChange={(e) => setActiveSql(e.target.value)}
              placeholder="Nhập câu lệnh SELECT SQL..."
              rows={6}
              className="w-full p-3 font-mono text-xs bg-slate-900 text-emerald-300 outline-none resize-none leading-relaxed selection:bg-emerald-800"
            />
          )}

          {activeTab === 'saved' && (
            <div className="p-3 bg-slate-900 max-h-40 overflow-y-auto space-y-1.5">
              {sampleQueries.map((item, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700 flex items-center justify-between hover:bg-slate-800 transition-colors"
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="text-xs font-bold text-slate-200">{item.title}</div>
                    <pre className="text-[10px] font-mono text-emerald-400 truncate mt-0.5">{item.sql}</pre>
                  </div>
                  <button
                    onClick={() => {
                      setActiveSql(item.sql);
                      setActiveTab('sql');
                      runQuery(item.sql);
                    }}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded whitespace-nowrap"
                  >
                    Dùng mẫu
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="p-3 bg-slate-900 max-h-40 overflow-y-auto space-y-1.5">
              {queryHistory.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-4">Chưa có lịch sử câu lệnh nào</div>
              ) : (
                queryHistory.map((h, idx) => (
                  <div key={idx} className="p-2 bg-slate-800/80 rounded border border-slate-700 flex items-center justify-between text-xs">
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="font-mono text-emerald-400 truncate text-[11px]">{h.sql}</div>
                      <div className="text-[9px] text-slate-400">
                        {h.time} • {h.duration} ms • {h.rows} dòng
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setActiveSql(h.sql);
                        setActiveTab('sql');
                        runQuery(h.sql);
                      }}
                      className="px-2 py-0.5 text-[10px] font-semibold text-white bg-slate-700 hover:bg-slate-600 rounded"
                    >
                      Chạy lại
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* ──────────────────────────────────────────────────────────── */}
        {/* Results Container Box with Inner Scrolling (Fixes long table!) */}
        {/* ──────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-[460px]">
          {/* Header Bar */}
          <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
            <div className="flex items-center space-x-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Kết quả Truy vấn
              </span>

              {queryResult && !queryResult.error && (
                <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold flex items-center">
                  <CheckIcon className="w-3.5 h-3.5 mr-1" />
                  {queryResult.count} dòng ({queryResult.duration_ms} ms)
                </span>
              )}

              {queryResult?.error && (
                <span className="text-xs text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-semibold flex items-center">
                  <AlertIcon className="w-3.5 h-3.5 mr-1" />
                  Lỗi cú pháp SQL
                </span>
              )}
            </div>

            {/* View Mode Toggle & CSV Export */}
            <div className="flex items-center space-x-2">
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => setQueryViewMode('table')}
                  className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                    queryViewMode === 'table'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span>Dạng bảng</span>
                </button>

                <button
                  onClick={() => setQueryViewMode('chart')}
                  className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold rounded transition-colors ${
                    queryViewMode === 'chart'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <ChartBarIcon className="w-3.5 h-3.5" />
                  <span>Dạng biểu đồ</span>
                </button>
              </div>

              <button
                onClick={handleExportCSV}
                className="flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-xs transition-colors"
              >
                <DownloadIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Xuất CSV</span>
              </button>
            </div>
          </div>

          {/* Results Box: Strictly Scrollable inside this container! */}
          <div className="flex-1 overflow-auto p-3">
            {isQueryRunning ? (
              <div className="h-full flex flex-col items-center justify-center space-y-2">
                <div className="w-7 h-7 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-xs font-medium text-slate-600">Đang quét kho dữ liệu...</div>
              </div>
            ) : queryResult?.error ? (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-mono whitespace-pre-wrap">
                {queryResult.error}
              </div>
            ) : !queryResult || queryResult.data.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-2 py-12">
                <QueryIcon className="w-7 h-7 text-slate-300" />
                <p className="text-xs">Chưa có kết quả. Nhập câu lệnh SQL và bấm "Chạy truy vấn".</p>
              </div>
            ) : queryViewMode === 'table' ? (
              /* THE TABLE IS FULLY SCROLLABLE IN BOTH X AND Y WITHIN THIS BOX */
              <div className="h-full overflow-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 border-b border-slate-200 font-semibold shadow-xs">
                    <tr>
                      <th className="px-3 py-2 text-slate-400 w-10 bg-slate-100 text-center">#</th>
                      {queryResult.columns.map((col, idx) => (
                        <th key={idx} className="px-3.5 py-2 font-mono text-slate-800 whitespace-nowrap bg-slate-100">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {queryResult.data.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-3 py-1.5 text-slate-400 font-mono text-[10px] text-center bg-slate-50/30">
                          {rIdx + 1}
                        </td>
                        {queryResult.columns.map((col, cIdx) => (
                          <td key={cIdx} className="px-3.5 py-1.5 text-slate-700 font-mono whitespace-nowrap text-[11px]">
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
            ) : (
              /* Chart View */
              <div className="p-2 h-full flex flex-col justify-between">
                <div className="mb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Biểu đồ Trực quan hóa Kết quả
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Trục X: <span className="font-semibold text-slate-700">{categoricalColumns[0] || queryResult.columns[0]}</span> • 
                    Trục Y: <span className="font-semibold text-emerald-700">{numericColumns[0] || queryResult.columns[1]}</span>
                  </p>
                </div>

                <div className="flex-1 flex items-end justify-between gap-2 px-2 border-b border-slate-200 pb-2 max-h-56">
                  {queryResult.data.slice(0, 15).map((row, idx) => {
                    const yKey = numericColumns[0] || queryResult.columns[1];
                    const xKey = categoricalColumns[0] || queryResult.columns[0];
                    const val = Number(row[yKey]) || 0;
                    const maxVal = Math.max(...queryResult.data.slice(0, 15).map(r => Number(r[yKey]) || 1));
                    const heightPct = Math.max(8, Math.round((val / maxVal) * 100));

                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center group">
                        <div className="text-[8px] font-semibold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity mb-0.5 whitespace-nowrap">
                          {val.toLocaleString('vi-VN')}
                        </div>
                        <div className="w-full bg-slate-100 rounded-t relative flex items-end justify-center h-40 overflow-hidden">
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 transition-all rounded-t"
                          ></div>
                        </div>
                        <div className="text-[9px] font-medium text-slate-600 mt-1 truncate w-full text-center">
                          {String(row[xKey] || `#${idx + 1}`)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer status */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-400 flex justify-between items-center flex-shrink-0">
            <span>Bảng kết quả có thể cuộn ngang và dọc độc lập</span>
            <span>{queryResult ? `${queryResult.count} bản ghi` : '0 bản ghi'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
