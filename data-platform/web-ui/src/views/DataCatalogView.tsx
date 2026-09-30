import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { 
  TableIcon, 
  SearchIcon, 
  FilterIcon, 
  RefreshIcon, 
  EyeIcon, 
  QueryIcon,
  LayersIcon,
  DatabaseIcon
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
    // Core Cleaned Entities (Silver Fact & Dimension)
    { name: 'orders.don_hang', table_name: 'don_hang', schema: 'orders', description: 'Fact - Giao dịch đơn hàng toàn hệ thống (mã đơn, ngày tạo, tổng tiền, phương thức, trạng thái, cơ sở)', columns: [] },
    { name: 'orders.chi_tiet_don_hang', table_name: 'chi_tiet_don_hang', schema: 'orders', description: 'Fact - Chi tiết từng món trong đơn hàng (sản phẩm, số lượng, giá bán, thành tiền)', columns: [] },
    { name: 'orders.giao_dich_thanh_toan', table_name: 'giao_dich_thanh_toan', schema: 'orders', description: 'Fact - Lịch sử giao dịch thanh toán (phương thức, mã giao dịch, số tiền, trạng thái)', columns: [] },
    { name: 'orders.voucher', table_name: 'voucher', schema: 'orders', description: 'Dimension - Danh mục mã giảm giá, voucher khuyến mãi, điều kiện áp dụng', columns: [] },
    { name: 'menu.san_pham', table_name: 'san_pham', schema: 'menu', description: 'Dimension - Danh mục sản phẩm (mã món, tên món, giá niêm yết, danh mục ngành hàng)', columns: [] },
    { name: 'menu.danh_muc', table_name: 'danh_muc', schema: 'menu', description: 'Dimension - Phân loại ngành hàng (Cà phê, Trà, Bánh & Đồ ăn nhẹ, Đá xay...)', columns: [] },
    { name: 'menu.bien_the_san_pham', table_name: 'bien_the_san_pham', schema: 'menu', description: 'Dimension - Biến thể kích cỡ (Size S, M, L) và giá bán tương ứng', columns: [] },
    { name: 'identity.chi_nhanh', table_name: 'chi_nhanh', schema: 'identity', description: 'Dimension - Danh sách chuỗi cửa hàng / kiosk (mã chi nhánh, tên, địa chỉ, thành phố, trạng thái)', columns: [] },
    { name: 'identity.nguoi_dung', table_name: 'nguoi_dung', schema: 'identity', description: 'Dimension - Tài khoản khách hàng, nhân viên và người quản lý', columns: [] },
    { name: 'inventory.ton_kho_san_pham', table_name: 'ton_kho_san_pham', schema: 'inventory', description: 'Fact - Tồn kho nguyên vật liệu và sản phẩm theo từng chi nhánh', columns: [] },
    
    // Data Marts (Gold Layer)
    { name: 'gold.revenue_daily', table_name: 'revenue_daily', schema: 'gold', description: 'Data Mart - Tổng hợp doanh thu và số đơn theo ngày (phục vụ dashboard nhanh)', columns: [] },
    { name: 'gold.top_products', table_name: 'top_products', schema: 'gold', description: 'Data Mart - Xếp hạng doanh số và số lượng bán theo sản phẩm', columns: [] },
    { name: 'gold.customer_segments', table_name: 'customer_segments', schema: 'gold', description: 'Data Mart - Phân khúc khách hàng RFM và giá trị vòng đời (LTV)', columns: [] },
    { name: 'gold.stores_overview', table_name: 'stores_overview', schema: 'gold', description: 'Data Mart - Tổng hợp hiệu suất kinh doanh từng cửa hàng', columns: [] },
    { name: 'gold.kpi_summary', table_name: 'kpi_summary', schema: 'gold', description: 'Data Mart - Các chỉ số tổng quan điều hành toàn chuỗi', columns: [] },
    
    // Bronze Streaming
    { name: 'public.realtime_events', table_name: 'realtime_events', schema: 'public', description: 'Bronze - Sự kiện streaming thời gian thực từ Kafka (đơn hàng mới, chuyển trạng thái)', columns: [] },
  ];

  const filtered = allTables.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchSchema = filterSchema === 'all' || t.name.startsWith(filterSchema);
    return matchSearch && matchSchema;
  });

  const handleSyncAll = async () => {
    showToast('Đang quét và đồng bộ lại danh mục bảng từ kho dữ liệu...', 'info');
    await fetchTables();
    showToast('Danh mục Kho dữ liệu đã được cập nhật', 'success');
  };

  return (
    <div className="space-y-6">
      {/* ─── EXPLANATION BANNER: MEDALLION ARCHITECTURE ─── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
              <h1 className="text-base font-bold text-slate-900">
                Kiến trúc Kho Dữ liệu Chuẩn (Data Warehouse Architecture)
              </h1>
            </div>
            <p className="text-xs text-slate-500 max-w-4xl leading-relaxed">
              Kho dữ liệu được phân chia rõ ràng theo chuẩn <strong>Medallion Architecture (Bronze - Silver - Gold)</strong>:
              Tầng <strong>Silver (Thực thể sạch)</strong> chứa dữ liệu thô đã được làm sạch, lưu giữ nguyên vẹn ở mức chi tiết (granular facts & dimensions) để trả lời <strong>mọi câu hỏi phân tích kinh doanh linh hoạt</strong>;
              trong khi tầng <strong>Gold (Data Marts)</strong> là các góc nhìn tổng hợp sẵn nhằm tăng tốc độ tải biểu đồ và báo cáo điều hành.
            </p>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0">
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Silver: Thực thể sạch (Orders, Menu, Identity, Inventory)
            </span>
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              Gold: Data Marts (KPIs, Trends)
            </span>
          </div>
        </div>
      </div>

      {/* ─── CONTROLS & FILTER BAR ─── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 px-5 py-3.5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center space-x-2">
          <h2 className="text-sm font-bold text-slate-900">
            Danh mục Bảng Dữ liệu
          </h2>
          <span className="text-xs text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full font-bold border border-blue-200">
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
              placeholder="Tìm bảng, trường dữ liệu, mô tả..."
              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-600 transition-colors w-48 sm:w-64"
            />
          </div>

          {/* Schema Filter */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
            <FilterIcon className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            <select
              value={filterSchema}
              onChange={(e) => setFilterSchema(e.target.value)}
              className="bg-transparent font-medium text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Tất cả tầng & schemas</option>
              <option value="orders">orders (Đơn hàng & Giao dịch Fact)</option>
              <option value="menu">menu (Sản phẩm & Danh mục Dim)</option>
              <option value="identity">identity (Cửa hàng & Khách hàng Dim)</option>
              <option value="inventory">inventory (Tồn kho Fact)</option>
              <option value="gold">gold (Data Marts tổng hợp)</option>
              <option value="public">public (Sự kiện Kafka Streaming)</option>
            </select>
          </div>

          <button
            onClick={handleSyncAll}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <RefreshIcon className="w-3.5 h-3.5" />
            <span>Làm mới Catalog</span>
          </button>
        </div>
      </div>

      {/* ─── TABLES LIST ─── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 text-[10px]">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Tên Bảng DWH</th>
                <th className="px-4 py-3">Phân tầng</th>
                <th className="px-4 py-3">Mô tả nghiệp vụ</th>
                <th className="px-4 py-3 text-center">Số cột</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((table, idx) => {
                const schema = table.schema || table.name.split('.')[0];
                const isSilver = ['orders', 'menu', 'identity', 'inventory'].includes(schema);
                const isGold = schema === 'gold';
                const isBronze = schema === 'public';

                return (
                  <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                    
                    <td className="px-4 py-3.5 font-mono font-bold text-slate-800">
                      <div className="flex items-center space-x-2">
                        <TableIcon className={`w-4 h-4 flex-shrink-0 ${
                          isSilver ? 'text-blue-600' : isGold ? 'text-amber-500' : 'text-slate-500'
                        }`} />
                        <span>{table.name}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      {isSilver && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          Silver: Thực thể sạch
                        </span>
                      )}
                      {isGold && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Gold: Data Mart
                        </span>
                      )}
                      {isBronze && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          Bronze: Streaming
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-slate-600 max-w-md">
                      {table.description || 'Bảng dữ liệu thực thể trong Data Warehouse'}
                    </td>

                    <td className="px-4 py-3.5 text-slate-700 font-semibold text-center">
                      {table.columns.length || '—'}
                    </td>

                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                        Đã chuẩn hóa
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => setPreviewTable(table as TableMetadata)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <EyeIcon className="w-3.5 h-3.5 text-slate-500" />
                        <span>Xem cấu trúc</span>
                      </button>

                      <button
                        onClick={() => {
                          const sql = `SELECT * FROM ${table.name} LIMIT 50;`;
                          setActiveSql(sql);
                          setActiveTab('explorer');
                          runQuery(sql);
                        }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        <QueryIcon className="w-3.5 h-3.5" />
                        <span>Truy vấn SQL</span>
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

export default DataCatalogView;
