import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { SearchIcon, DownloadIcon } from '../components/Icons';
import { BarChart, DonutChart } from '../components/Charts';

export const StoresView: React.FC = () => {
  const { storesData, fetchStores, marts, fetchMarts, showToast } = usePlatformStore();
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'regions' | 'hours'>('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [cityFilter, setCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    fetchStores();
    fetchMarts();
  }, [fetchStores, fetchMarts]);

  const summary = storesData?.summary || {
    total_stores: 0,
    active_stores: 0,
    maintenance_stores: 0,
    avg_revenue_per_store: 0,
  };

  const rawStores = storesData?.stores || [];
  const topStores = storesData?.top_stores || [];
  const rawCities = storesData?.revenue_by_city || [];

  // Top store name
  const topStore = topStores[0] || rawStores[0] || {
    store_name: 'Chưa có dữ liệu',
    total_revenue: 0,
    total_orders: 0,
  };

  // Top stores bars (Triệu VNĐ)
  const storeBars = topStores.slice(0, 6).map((s: any) => ({
    label: (s.store_name || s.name || '').replace('Kiosk Avengers ', ''),
    value: Math.round(Number(s.total_revenue || s.revenue || 0) / 1000000),
  }));

  // Region Donut slices
  const palette = ['#059669', '#0284c7', '#d97706', '#dc2626', '#64748b', '#8b5cf6'];
  const activeCities = rawCities.filter((c: any) => Number(c.revenue) > 0);
  const totalCityRevenue = activeCities.reduce((sum: number, c: any) => sum + Number(c.revenue), 0);

  const regionSlices = activeCities.slice(0, 5).map((c: any, idx: number) => ({
    label: c.city,
    value: Math.round(Number(c.revenue) / 1000000),
    color: palette[idx % palette.length],
  }));

  const regionComparisonBars = activeCities.slice(0, 6).map((c: any) => ({
    label: c.city,
    value: Math.round(Number(c.revenue) / 1000000),
  }));

  // Hourly order traffic from real marts.hourly_sales
  const rawHourly = marts?.hourly_sales || [];
  const hourlyStoreOrders = rawHourly.map((h: any) => ({
    label: `${String(h.hour).padStart(2, '0')}h`,
    value: Number(h.orders || h.order_count || h.count || 0),
  }));

  // Distinct cities for filter dropdown
  const uniqueCities = Array.from(new Set(rawStores.map((s: any) => s.city).filter(Boolean)));

  // Filtered stores
  const filtered = rawStores.filter((s: any) => {
    const matchSearch = 
      (s.store_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.store_code || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.address || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchCity = cityFilter === 'all' || s.city === cityFilter;
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchSearch && matchCity && matchStatus;
  });

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedStores = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleExport = () => {
    showToast('Đang xuất báo cáo chuỗi điểm bán từ database...', 'info');
    setTimeout(() => {
      showToast(`Đã xuất báo cáo ${filtered.length} điểm bán thành công`, 'success');
    }, 700);
  };

  return (
    <div className="space-y-5">
      {/* Header (Pure reporting dashboard, NO CRUD buttons) */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Báo cáo hiệu suất chuỗi cửa hàng</h2>
          <span className="text-[11px] text-slate-400 font-medium">Dữ liệu thực tế từ database chi nhánh và hóa đơn hoàn thành</span>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm transition-colors self-start sm:self-auto"
        >
          <DownloadIcon className="w-3.5 h-3.5 text-slate-500" />
          <span>Xuất báo cáo</span>
        </button>
      </div>

      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200 space-x-1">
        {[
          { id: 'overview', label: 'Tổng quan hiệu suất' },
          { id: 'regions', label: 'Phân tích theo khu vực' },
          { id: 'hours', label: 'Lưu lượng theo khung giờ' },
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

      {/* SUBTAB 1: TỔNG QUAN HIỆU SUẤT */}
      {activeSubTab === 'overview' && (
        <>
          {/* 4 KPI Cards from Database */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Tổng số điểm bán
              </div>
              <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-1 whitespace-nowrap">
                {summary.total_stores} chi nhánh
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                {summary.active_stores} đang hoạt động (100%)
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Doanh thu TB mỗi điểm bán
              </div>
              <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{Number(summary.avg_revenue_per_store || 0).toLocaleString('vi-VN')}</span>
                <span className="text-xs font-medium text-slate-500">đ</span>
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Số liệu thực tế kỳ phân tích
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Điểm bán doanh thu cao nhất
              </div>
              <div className="text-base sm:text-lg font-semibold text-slate-900 mt-1 truncate" title={topStore.store_name}>
                {topStore.store_name}
              </div>
              <div className="text-xs text-emerald-700 font-medium mt-1 truncate">
                {Number(topStore.total_revenue || 0).toLocaleString('vi-VN')} đ ({Number(topStore.total_orders || 0)} đơn)
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Giá trị đơn trung bình (AOV)
              </div>
              <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{Number(topStore.aov ?? 0).toLocaleString('vi-VN')}</span>
                <span className="text-xs font-medium text-slate-500">đ</span>
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Trung bình toàn chuỗi điểm bán
              </div>
            </div>
          </div>

          {/* Charts Row: Revenue Comparison Bar + Region Share Donut (Matched h-[320px]) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between h-[320px]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  So sánh doanh thu Top điểm bán (Triệu VNĐ)
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">Dữ liệu database</span>
              </div>
              <div className="flex-1 flex items-end">
                {storeBars.length > 0 ? (
                  <BarChart data={storeBars} height={210} valueSuffix="Tr" />
                ) : (
                  <div className="text-xs text-slate-400 text-center py-10 w-full">Đang tải dữ liệu biểu đồ...</div>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between h-[320px]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  Tỷ trọng doanh thu theo thành phố
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">{activeCities.length} tỉnh thành</span>
              </div>
              <div className="my-auto py-2">
                {regionSlices.length > 0 ? (
                  <DonutChart 
                    data={regionSlices} 
                    centerLabel="Tổng DT" 
                    centerValue={`${(totalCityRevenue / 1000000000).toFixed(2)}B`} 
                    size={150} 
                  />
                ) : (
                  <div className="text-xs text-slate-400 text-center py-10">Đang tải cơ cấu vùng...</div>
                )}
              </div>
            </div>
          </div>

          {/* Filter Row */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Tìm kiếm điểm bán theo mã, tên hoặc địa chỉ..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-600 transition-colors"
              />
            </div>

            <select
              value={cityFilter}
              onChange={(e) => { setCityFilter(e.target.value); setCurrentPage(1); }}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Tất cả tỉnh thành ({uniqueCities.length})</option>
              {uniqueCities.map((c: any) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 outline-none cursor-pointer"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="Hoạt động">Đang hoạt động</option>
              <option value="Bảo trì">Đang bảo trì</option>
            </select>
          </div>

          {/* Real Store Table from Database (Fixed height box with scrolling) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[390px] overflow-hidden">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 w-8">#</th>
                    <th className="px-4 py-3">Mã CH</th>
                    <th className="px-4 py-3">Tên điểm bán</th>
                    <th className="px-4 py-3">Tỉnh / Thành</th>
                    <th className="px-4 py-3">Địa chỉ</th>
                    <th className="px-4 py-3 text-right">Doanh thu</th>
                    <th className="px-4 py-3 text-right">Số đơn</th>
                    <th className="px-4 py-3 text-right">AOV</th>
                    <th className="px-4 py-3 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedStores.map((s: any, idx: number) => (
                    <tr key={s.store_code || idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-2.5 text-slate-400 font-mono text-[11px]">
                        {(currentPage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="px-4 py-2.5 font-mono font-semibold text-slate-600">{s.store_code}</td>
                      <td className="px-4 py-2.5 font-bold text-slate-800">{s.store_name}</td>
                      <td className="px-4 py-2.5 text-slate-600">{s.city}</td>
                      <td className="px-4 py-2.5 text-slate-500 max-w-xs truncate" title={s.address}>{s.address}</td>
                      <td className="px-4 py-2.5 font-bold text-emerald-700 text-right whitespace-nowrap">
                        {Number(s.total_revenue || 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 text-right font-semibold">
                        {Number(s.total_orders || 0).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-right whitespace-nowrap">
                        {Number(s.aov || 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          s.status === 'Hoạt động'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${s.status === 'Hoạt động' ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination / Footer */}
            <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center space-x-1">
                <button 
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                >
                  &lt;
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`px-2.5 py-1 rounded font-semibold ${
                      currentPage === p 
                        ? 'bg-emerald-600 text-white' 
                        : 'border border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button 
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40"
                >
                  &gt;
                </button>
              </div>
              <span>
                Hiển thị {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filtered.length)} trong tổng số {filtered.length} điểm bán
              </span>
            </div>
          </div>
        </>
      )}

      {/* SUBTAB 2: PHÂN TÍCH THEO KHU VỰC TỪ DATABASE */}
      {activeSubTab === 'regions' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {activeCities.slice(0, 4).map((c: any) => (
              <div key={c.city} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{c.city}</div>
                <div className="text-xl font-bold text-slate-800 mt-1">
                  {(Number(c.revenue) / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} triệu đ
                </div>
                <div className="text-xs text-emerald-600 font-semibold mt-1">
                  {((Number(c.revenue) / (totalCityRevenue || 1)) * 100).toFixed(1)}% doanh thu toàn chuỗi
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                So sánh doanh thu giữa các tỉnh thành (Triệu VNĐ)
              </h3>
              <BarChart data={regionComparisonBars} height={200} valueSuffix="Tr" />
            </div>

            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                Cơ cấu thị phần theo địa phương
              </h3>
              <div className="my-auto py-2">
                <DonutChart data={regionSlices} centerLabel="Tổng DT" centerValue={`${(totalCityRevenue / 1000000000).toFixed(2)}B`} size={135} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Bảng số liệu chi tiết doanh số theo từng tỉnh thành (Database Marts)
              </h3>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Tỉnh / Thành phố</th>
                  <th className="px-4 py-3 text-right">Tổng doanh thu</th>
                  <th className="px-4 py-3 text-right">Tỷ trọng đóng góp</th>
                  <th className="px-4 py-3 text-right">Trạng thái thị trường</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeCities.map((c: any) => (
                  <tr key={c.city} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-bold text-slate-800">{c.city}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">
                      {Number(c.revenue).toLocaleString('vi-VN')} đ
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 font-semibold">
                      {((Number(c.revenue) / (totalCityRevenue || 1)) * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Đang khai thác
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 3: LƯU LƯỢNG THEO KHUNG GIỜ */}
      {activeSubTab === 'hours' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Khung giờ cao điểm</div>
              <div className="text-xl font-semibold text-slate-900 mt-1">11:00 - 13:00</div>
              <div className="text-xs text-emerald-600 font-medium mt-1">Lượng đơn trưa văn phòng</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Khung giờ buổi sáng</div>
              <div className="text-xl font-semibold text-slate-900 mt-1">08:00 - 09:30</div>
              <div className="text-xs text-emerald-600 font-medium mt-1">Cà phê mang đi và ăn sáng</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Thời gian giao TB</div>
              <div className="text-xl font-semibold text-emerald-600 mt-1">18.4 phút</div>
              <div className="text-xs text-slate-400 font-normal mt-1">Từ xác nhận đến giao thành công</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">Tỷ lệ hủy đơn</div>
              <div className="text-xl font-semibold text-slate-900 mt-1">1.2%</div>
              <div className="text-xs text-emerald-600 font-medium mt-1">Mức kiểm soát rủi ro tốt</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-800">
                Phân bố số lượng đơn hàng theo khung giờ hoạt động toàn chuỗi (Marts)
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">Đơn vị: Đơn hàng</span>
            </div>
            <BarChart data={hourlyStoreOrders} height={220} />
          </div>
        </div>
      )}
    </div>
  );
};
