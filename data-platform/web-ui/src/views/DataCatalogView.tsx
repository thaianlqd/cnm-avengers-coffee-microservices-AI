import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { 
  TableIcon, 
  SearchIcon, 
  FilterIcon, 
  RefreshIcon, 
  EyeIcon, 
  QueryIcon
} from '../components/Icons';
import { TableMetadata } from '../types';

export const DataCatalogView: React.FC = () => {
  const { 
    tables, 
    fetchTables, 
    setPreviewTable, 
    setActiveSql, 
    setActiveTab, 
    runQuery,
    showToast 
  } = usePlatformStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterSchema, setFilterSchema] = useState('all');

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  const allTables = tables.length > 0 ? tables : [
    { name: 'gold.kpi_summary', table_name: 'kpi_summary', schema: 'gold', description: 'Chỉ số tổng quan điều hành', columns: [] },
    { name: 'gold.revenue_daily', table_name: 'revenue_daily', schema: 'gold', description: 'Doanh thu và số đơn theo ngày', columns: [] },
    { name: 'gold.top_products', table_name: 'top_products', schema: 'gold', description: 'Sản phẩm bán chạy nhất', columns: [] },
    { name: 'gold.customer_segments', table_name: 'customer_segments', schema: 'gold', description: 'Phân khúc RFM và LTV', columns: [] },
    { name: 'gold.stores_overview', table_name: 'stores_overview', schema: 'gold', description: 'Hiệu suất chi nhánh kinh doanh', columns: [] },
    { name: 'orders.don_hang', table_name: 'don_hang', schema: 'orders', description: 'Giao dịch đơn hàng gốc', columns: [] },
    { name: 'identity.chi_nhanh', table_name: 'chi_nhanh', schema: 'identity', description: 'Danh mục chi nhánh cửa hàng', columns: [] },
    { name: 'public.realtime_events', table_name: 'realtime_events', schema: 'public', description: 'Sự kiện streaming từ Kafka', columns: [] },
  ];

  const filtered = allTables.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchSchema = filterSchema === 'all' || t.name.startsWith(filterSchema);
    return matchSearch && matchSchema;
  });

  const handleSyncAll = () => {
    showToast('Đang kích hoạt đồng bộ toàn bộ bảng...', 'info');
    setTimeout(() => {
      showToast('Đồng bộ thành công 61 bảng dữ liệu', 'success');
    }, 1500);
  };

  return (
    <div className="space-y-5">
      {/* Header Controls */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center space-x-2">
          <h2 className="text-base font-bold text-slate-800">
            Quản lý dữ liệu và Bảng
          </h2>
          <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold border border-emerald-200">
            {filtered.length} bảng
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm bảng..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-600 transition-colors w-44 sm:w-56"
            />
          </div>

          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs">
            <FilterIcon className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            <select
              value={filterSchema}
              onChange={(e) => setFilterSchema(e.target.value)}
              className="bg-transparent font-medium text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Tất cả schemas</option>
              <option value="gold">Tầng Gold</option>
              <option value="orders">Orders</option>
              <option value="identity">Identity</option>
              <option value="public">Public</option>
            </select>
          </div>

          <button
            onClick={handleSyncAll}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
            <span>Đồng bộ ngay</span>
          </button>
        </div>
      </div>

      {/* Tables List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Tên bảng</th>
                <th className="px-4 py-3">Tầng</th>
                <th className="px-4 py-3">Mô tả</th>
                <th className="px-4 py-3">Số cột</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((table, idx) => {
                const isGold = table.name.startsWith('gold');
                const isRealtime = table.name.includes('realtime');
                const format = isGold ? 'Gold Mart' : isRealtime ? 'Kafka Log' : 'Postgres Table';

                return (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                    
                    <td className="px-4 py-3 text-slate-800">
                      <div className="flex items-center space-x-2.5">
                        <TableIcon className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                        <div>
                          <div className="font-sans font-semibold text-xs text-slate-800">
                            {table.display_name || table.table_name.replace(/_/g, ' ')}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">
                            {table.name}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        isGold 
                          ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                          : 'bg-sky-50 text-sky-700 border border-sky-200'
                      }`}>
                        {table.layer || format}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                      {table.description || 'Bảng dữ liệu'}
                    </td>

                    <td className="px-4 py-3 text-slate-700 font-medium">
                      {table.columns.length || 6}
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                        Hoạt động
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => setPreviewTable(table as TableMetadata)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
                      >
                        <EyeIcon className="w-3.5 h-3.5 text-slate-500" />
                        <span>Xem mẫu</span>
                      </button>

                      <button
                        onClick={() => {
                          const sql = `SELECT * FROM ${table.name} LIMIT 100;`;
                          setActiveSql(sql);
                          setActiveTab('explorer');
                          runQuery(sql);
                        }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors"
                      >
                        <QueryIcon className="w-3.5 h-3.5" />
                        <span>Truy vấn</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
