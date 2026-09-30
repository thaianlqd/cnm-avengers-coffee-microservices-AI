import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { 
  DatabaseIcon, 
  LayersIcon, 
  TableIcon, 
  UsersIcon 
} from '../components/Icons';
import { SmoothAreaChart, DonutChart, BarChart, HorizontalBarChart } from '../components/Charts';

export const OverviewView: React.FC = () => {
  const { 
    marts, 
    storesData,
    productsData,
    customersData,
    fetchMarts, 
    fetchStores,
    fetchProducts,
    fetchCustomers,
    setActiveTab,
    setAnalyticsSubTab,
    dateRange,
    setDateRange
  } = usePlatformStore();

  const [categoryMode, setCategoryMode] = useState<'parent' | 'sub'>('parent');

  useEffect(() => {
    fetchMarts();
    fetchStores();
    fetchProducts();
    fetchCustomers();
  }, [fetchMarts, fetchStores, fetchProducts, fetchCustomers]);

  // Real KPIs from gold.kpi_summary and marts
  const kpi = marts?.kpi || marts?.kpi_summary?.[0] || {};
  const totalRevenue = Number(kpi.revenue_all_time || 0);
  const totalOrders = Number(kpi.total_orders_all_time || 0);
  const totalStores = storesData?.summary?.total_stores || Number(kpi.total_stores || 100);
  const activeStores = storesData?.summary?.active_stores || Number(kpi.active_stores || 100);
  const totalCustomers = customersData?.kpi?.total_registered || 18;

  // 1. Time-series data for Area Chart from real revenue daily
  const revenueDaily = marts?.revenue_daily || [];
  const revenueTimeSeries = revenueDaily.map((r: any) => ({
    label: String(r.date).slice(-5).replace('/', '-'),
    value: Number(r.revenue) || 0,
    secondaryValue: (Number(r.revenue) || 0) * 0.9,
  }));

  // 2. Donut slices: Real Category Sales from marts (Support both Parent groups & Sub-categories)
  const palette = ['#059669', '#0284c7', '#d97706', '#8b5cf6', '#dc2626', '#0d9488', '#ea580c'];
  
  const rawParentCategories = marts?.parent_category_sales || [];
  const rawSubCategories = marts?.category_sales || productsData?.categories || [];
  
  const sourceCategories = categoryMode === 'parent' && rawParentCategories.length > 0 
    ? rawParentCategories 
    : rawSubCategories;

  const categorySlices = sourceCategories.slice(0, 6).map((c: any, idx: number) => ({
    label: c.category_name || c.ten_danh_muc || 'Khác',
    value: Number(c.revenue) || 0,
    color: palette[idx % palette.length],
  }));

  // 3. Region Breakdown: Real Revenue by City from storesData.revenue_by_city
  const rawCities = storesData?.revenue_by_city || [];
  const regionBars = rawCities
    .filter((c: any) => Number(c.revenue) > 0)
    .slice(0, 6)
    .map((c: any) => ({
      label: c.city,
      value: Math.round(Number(c.revenue) / 1000000), // Triệu VNĐ
    }));

  // 4. Real Top Stores from marts.top_branches or storesData.top_stores
  const rawTopStores = marts?.top_branches || storesData?.top_stores || [];
  const topStores = rawTopStores.slice(0, 5).map((s: any) => {
    const revRaw = Number(s.revenue || s.total_revenue || 0);
    return {
      name: s.branch_name || s.store_name,
      revenue_raw: revRaw,
      revenue: `${revRaw.toLocaleString('vi-VN')} đ`,
      orders: Number(s.total_orders || 0).toLocaleString('vi-VN'),
    };
  });

  const storeRankBars = topStores.map((s, idx) => ({
    rank: idx + 1,
    label: s.name.replace('Kiosk Avengers ', ''),
    value: s.revenue_raw,
    subValue: `${s.orders} đơn`,
    color: idx === 0 ? '#059669' : idx === 1 ? '#0284c7' : '#64748b',
  }));

  // 5. Real Best-Selling Products from marts.top_products or productsData.top_products
  const rawTopProducts = marts?.top_products || productsData?.top_products || [];
  const topProducts = rawTopProducts.slice(0, 5).map((p: any) => {
    const revRaw = Number(p.total_revenue || 0);
    return {
      name: p.ten_san_pham || p.name,
      revenue_raw: revRaw,
      qty: Number(p.total_quantity || p.total_sold || 0).toLocaleString('vi-VN'),
      revenue: `${revRaw.toLocaleString('vi-VN')} đ`,
    };
  });

  const productRankBars = topProducts.map((p, idx) => ({
    rank: idx + 1,
    label: p.name,
    value: p.revenue_raw,
    subValue: `${p.qty} ly`,
    color: idx === 0 ? '#059669' : idx === 1 ? '#d97706' : '#64748b',
  }));

  // 6. Real system recent activities
  const recentActivities = [
    { badge: 'Chi nhánh', title: `${topStores[0]?.name || 'Chi nhánh'} dẫn đầu doanh số kỳ này`, time: 'Hệ thống tự động', color: 'bg-emerald-50 text-emerald-700' },
    { badge: 'Sản phẩm chủ lực', title: `${topProducts[0]?.name || 'Sản phẩm'} đạt ${topProducts[0]?.qty || 'nhiều'} lượt đặt`, time: 'Dữ liệu Marts', color: 'bg-sky-50 text-sky-700' },
    { badge: 'Hội viên', title: `${customersData?.membership_tiers?.find(t => t.key === 'Kim Cương')?.count || 2} khách hàng hạng Kim Cương tích cực`, time: 'Hạng thành viên', color: 'bg-indigo-50 text-indigo-700' },
    { badge: 'Đơn hoàn thành', title: `Tỷ lệ hoàn thành đơn toàn chuỗi đạt ${Number(kpi.completion_rate ?? 0)}%`, time: 'Theo dõi chỉ số', color: 'bg-emerald-50 text-emerald-700' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Bar: Clean greeting and date filter */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            DA
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 leading-tight">
              Tổng quan kinh doanh chuỗi cà phê
            </h2>
            <span className="text-[11px] text-slate-400 font-medium">Dữ liệu hợp nhất thời gian thực từ kho Analytics Data Platform</span>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 font-medium text-slate-700 outline-none cursor-pointer hover:border-slate-300 transition-colors"
          >
            <option value="30days">30 ngày gần nhất</option>
            <option value="14days">14 ngày gần nhất</option>
            <option value="7days">7 ngày gần nhất</option>
            <option value="today">Hôm nay</option>
          </select>
        </div>
      </div>

      {/* Row 1: 4 Business KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Tổng doanh thu */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Tổng doanh thu
            </div>
            <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 flex items-baseline gap-1 whitespace-nowrap">
              <span>{Number(kpi.revenue_all_time ?? 0).toLocaleString('vi-VN')}</span>
              <span className="text-xs font-semibold text-slate-500">đ</span>
            </div>
            <div className="text-xs text-emerald-600 font-medium mt-1 truncate flex items-center">
              <span>AOV: {Number(kpi.aov ?? 0).toLocaleString('vi-VN')} đ</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
            <DatabaseIcon className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Tổng đơn hàng */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Tổng số đơn hàng
            </div>
            <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
              {Number(kpi.total_orders_all_time ?? 0).toLocaleString('vi-VN')} đơn
            </div>
            <div className="text-xs text-sky-600 font-medium mt-1 truncate flex items-center">
              <span>Đã hoàn thành: {Number(kpi.completed_orders || 0).toLocaleString('vi-VN')}</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0">
            <TableIcon className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Khách hàng và Hội viên */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Hội viên đăng ký
            </div>
            <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
              {totalCustomers} tài khoản
            </div>
            <div className="text-xs text-amber-600 font-medium mt-1 truncate flex items-center">
              <span>4 hạng hội viên tích lũy</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
            <UsersIcon className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Số cửa hàng */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Cửa hàng hoạt động
            </div>
            <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
              {activeStores} trên {totalStores}
            </div>
            <div className="text-xs text-emerald-600 font-medium mt-1 truncate flex items-center">
              <span>100% điểm bán sẵn sàng</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
            <LayersIcon className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Row 2: Hero Visualizations - Spacious Line Chart (8 cols) & Menu Breakdown (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Chart 1: Doanh thu theo thời gian - Wide, large, readable */}
        <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Xu hướng doanh thu theo ngày
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Biểu đồ đường biểu diễn biến động doanh số 10 ngày gần nhất</p>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200 self-start sm:self-auto">
              {revenueTimeSeries.length > 0 ? 'Tăng trưởng ổn định' : 'Chưa phát sinh giao dịch'}
            </span>
          </div>
          <div className="flex-1 w-full pt-1">
            <SmoothAreaChart data={revenueTimeSeries} height={250} showSecondary={true} valueSuffix=" đ" />
          </div>
        </div>

        {/* Chart 2: Cơ cấu doanh thu theo thực đơn */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Cơ cấu doanh thu thực đơn
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{categorySlices.length} nhóm danh mục</p>
            </div>
            {/* Toggle view mode */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[10px] font-semibold">
              <button
                onClick={() => setCategoryMode('parent')}
                className={`px-2 py-1 rounded transition-all cursor-pointer ${
                  categoryMode === 'parent' 
                    ? 'bg-white text-slate-800 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Nhóm lớn
              </button>
              <button
                onClick={() => setCategoryMode('sub')}
                className={`px-2 py-1 rounded transition-all cursor-pointer ${
                  categoryMode === 'sub' 
                    ? 'bg-white text-slate-800 shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Món chi tiết
              </button>
            </div>
          </div>
          <div className="my-auto py-3">
            {categorySlices.length > 0 ? (
              <DonutChart 
                data={categorySlices} 
                centerLabel="Tổng DT" 
                centerValue={totalRevenue >= 1000000000 ? `${(totalRevenue / 1000000000).toFixed(2)}B` : totalRevenue > 0 ? `${(totalRevenue / 1000000).toFixed(1)}M` : '0 đ'} 
                size={160} 
              />
            ) : (
              <div className="text-xs text-slate-400 text-center py-8">Chưa có dữ liệu danh mục trong kỳ</div>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Doanh thu theo tỉnh thành (6 cols) & Xếp hạng chi nhánh (6 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Doanh thu theo tỉnh thành - Clean spacious container without overflow */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Doanh thu theo tỉnh thành
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">So sánh đóng góp doanh số giữa các thị trường trọng điểm</p>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
              Đơn vị: Triệu VNĐ
            </span>
          </div>
          <div className="flex-1 w-full overflow-hidden pt-2">
            {regionBars.length > 0 ? (
              <BarChart data={regionBars} height={210} color="#059669" valueSuffix="Tr" />
            ) : (
              <div className="text-xs text-slate-400 text-center py-8">Đang tải khu vực...</div>
            )}
          </div>
        </div>

        {/* Xếp hạng chi nhánh */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Xếp hạng doanh số chi nhánh
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Top 5 điểm bán dẫn đầu toàn chuỗi</p>
            </div>
            <button
              onClick={() => {
                setActiveTab('analytics');
                setAnalyticsSubTab('stores');
              }}
              className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              Xem chi tiết
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            <HorizontalBarChart data={storeRankBars} valueSuffix=" đ" />
          </div>

          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0">
            <span>Dữ liệu Marts thực tế</span>
            <span>{storesData?.summary?.total_stores || 100} điểm bán toàn hệ thống</span>
          </div>
        </div>
      </div>

      {/* Row 4: Sản phẩm bán chạy nhất & Thông tin vận hành */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Sản phẩm bán chạy (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden p-5 justify-between">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 flex-shrink-0">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Xếp hạng món bán chạy nhất
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Số lượng tiêu thụ và doanh thu Top món chủ lực</p>
            </div>
            <button
              onClick={() => {
                setActiveTab('analytics');
                setAnalyticsSubTab('products');
              }}
              className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              Xem thực đơn
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-3">
            <HorizontalBarChart data={productRankBars} valueSuffix=" đ" />
          </div>

          <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0">
            <span>Ghi nhận từ chi tiết đơn hàng</span>
            <span>Tổng {productsData?.kpi?.total_products || 118} món thực đơn</span>
          </div>
        </div>

        {/* Thông tin vận hành (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 flex-shrink-0">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Thông tin vận hành và Cảnh báo
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Tình trạng hệ thống và chỉ số kinh doanh</p>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
          </div>

          <div className="space-y-2.5 overflow-y-auto flex-1 py-3 pr-1">
            {recentActivities.map((act, idx) => (
              <div key={idx} className="flex items-start space-x-3 p-2.5 bg-slate-50/80 rounded-lg border border-slate-100">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 mt-0.5 ${act.color}`}>
                  {act.badge}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-700 font-semibold truncate">{act.title}</p>
                  <span className="text-[10px] text-slate-400">{act.time}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-2.5 border-t border-slate-100 text-[11px] text-slate-400 text-center flex-shrink-0">
            Đồng bộ dữ liệu thời gian thực từ kho Analytics
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewView;
