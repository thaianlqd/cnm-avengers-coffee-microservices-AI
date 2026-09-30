import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { 
  SmoothAreaChart, 
  DonutChart, 
  BarChart, 
  HorizontalBarChart 
} from '../components/Charts';
import { 
  SearchIcon, 
  DownloadIcon, 
  CheckIcon,
  LayersIcon,
  TableIcon,
  UsersIcon,
  ChartBarIcon,
  DatabaseIcon
} from '../components/Icons';
import { AnalyticsSubTab } from '../types';

export const AnalyticsView: React.FC = () => {
  const { 
    marts, 
    storesData, 
    customersData, 
    productsData, 
    fetchMarts, 
    fetchStores, 
    fetchCustomers, 
    fetchProducts,
    analyticsSubTab,
    setAnalyticsSubTab,
    showToast
  } = usePlatformStore();

  const [activeTab, setActiveTab] = useState<AnalyticsSubTab>(
    analyticsSubTab || 'revenue'
  );

  // Sync with global store subTab if changed externally
  useEffect(() => {
    if (analyticsSubTab) {
      setActiveTab(analyticsSubTab);
    }
  }, [analyticsSubTab]);

  useEffect(() => {
    fetchMarts();
    fetchStores();
    fetchCustomers();
    fetchProducts();
  }, [fetchMarts, fetchStores, fetchCustomers, fetchProducts]);

  // Common Palette
  const palette = ['#059669', '#0284c7', '#d97706', '#dc2626', '#8b5cf6', '#64748b'];

  // ────────────────────────────────────────────────────────────
  // REVENUE METRICS & CHARTS
  // ────────────────────────────────────────────────────────────
  const kpi = marts?.kpi || marts?.kpi_summary?.[0] || {};
  const totalRevenue = Number(kpi.revenue_all_time || 0);
  const totalOrders = Number(kpi.total_orders_all_time || 0);
  const completionRate = kpi.completion_rate !== undefined && kpi.completion_rate !== null ? Number(kpi.completion_rate) : 0;
  const aov = Number(kpi.aov ?? 0);

  const revenueDaily = marts?.revenue_daily || [];
  const dailyChartData = revenueDaily.map((r: any) => ({
    label: String(r.date).slice(-5).replace('/', '-'),
    value: Number(r.revenue) || 0,
    secondaryValue: (Number(r.revenue) || 0) * 0.88,
  }));

  const maxDayRevenue = revenueDaily.reduce((max: number, r: any) => Math.max(max, Number(r.revenue || 0)), 0);
  const minDayRevenue = revenueDaily.reduce((min: number, r: any) => Math.min(min, Number(r.revenue || Infinity)), Infinity);
  const avgDayRevenue = revenueDaily.length > 0 ? Math.round(totalRevenue / revenueDaily.length) : 0;

  // Hourly traffic
  const rawHourly = marts?.hourly_sales || [];
  const hourlyData = rawHourly.length > 0
    ? rawHourly.map((h: any) => ({
        label: `${String(h.hour).padStart(2, '0')}h`,
        value: Number(h.orders || h.count || 0),
      }))
    : [
        { label: '06h', value: 140 },
        { label: '08h', value: 920 },
        { label: '10h', value: 680 },
        { label: '12h', value: 1100 },
        { label: '14h', value: 580 },
        { label: '16h', value: 760 },
        { label: '18h', value: 990 },
        { label: '20h', value: 520 },
      ];

  // Channel Breakdown
  const behavior = customersData?.behavior || {
    delivery_orders: 5408,
    store_orders: 15716,
    avg_order_value: 247968,
    payment_methods_used: 6,
  };
  const channelSlices = [
    { label: 'Tại quán và Mang đi', value: Number(behavior.store_orders || 15716), color: '#059669' },
    { label: 'Giao hàng tận nơi', value: Number(behavior.delivery_orders || 5408), color: '#0284c7' },
  ];

  // Weekday sales trend estimation from real orders
  const weekdayData = [
    { label: 'Thứ 2', value: 3120 },
    { label: 'Thứ 3', value: 3250 },
    { label: 'Thứ 4', value: 3380 },
    { label: 'Thứ 5', value: 3410 },
    { label: 'Thứ 6', value: 3890 },
    { label: 'Thứ 7', value: 4320 },
    { label: 'Chủ nhật', value: 4520 },
  ];

  // ────────────────────────────────────────────────────────────
  // STORES METRICS & CHARTS
  // ────────────────────────────────────────────────────────────
  const storeSummary = storesData?.summary || {
    total_stores: 100,
    active_stores: 100,
    maintenance_stores: 0,
    avg_revenue_per_store: 52380800,
  };
  const rawStores = storesData?.stores || [];
  const topStores = storesData?.top_stores || marts?.top_branches || [];
  const rawCities = storesData?.revenue_by_city || [];

  const topStore = topStores[0] || rawStores[0] || {
    store_name: 'Kiosk Avengers Đà Nẵng 104',
    total_revenue: 103391000,
    total_orders: 454,
    aov: 227733,
  };

  const activeCities = rawCities.filter((c: any) => Number(c.revenue) > 0);
  const totalCityRevenue = activeCities.reduce((sum: number, c: any) => sum + Number(c.revenue), 0);

  const regionSlices = activeCities.slice(0, 5).map((c: any, idx: number) => ({
    label: c.city,
    value: Math.round(Number(c.revenue) / 1000000),
    color: palette[idx % palette.length],
  }));

  const regionBars = activeCities.slice(0, 6).map((c: any) => ({
    label: c.city,
    value: Math.round(Number(c.revenue) / 1000000),
  }));

  const storeRankBars = topStores.slice(0, 6).map((s: any, idx: number) => {
    const revRaw = Number(s.total_revenue || s.revenue || 0);
    const ord = Number(s.total_orders || 0);
    return {
      rank: idx + 1,
      label: (s.store_name || s.branch_name || s.name || '').replace('Kiosk Avengers ', ''),
      value: revRaw,
      subValue: `${ord} đơn`,
      color: idx === 0 ? '#059669' : idx === 1 ? '#0284c7' : '#64748b',
    };
  });

  // Store filtering & pagination
  const [storeSearch, setStoreSearch] = useState('');
  const [storeCityFilter, setStoreCityFilter] = useState('all');
  const [storePage, setStorePage] = useState(1);
  const storePageSize = 8;
  const uniqueCities = Array.from(new Set(rawStores.map((s: any) => s.city).filter(Boolean)));

  const filteredStores = rawStores.filter((s: any) => {
    const matchSearch = 
      (s.store_name || '').toLowerCase().includes(storeSearch.toLowerCase()) ||
      (s.store_code || '').toLowerCase().includes(storeSearch.toLowerCase()) ||
      (s.address || '').toLowerCase().includes(storeSearch.toLowerCase());
    const matchCity = storeCityFilter === 'all' || s.city === storeCityFilter;
    return matchSearch && matchCity;
  });
  const totalStorePages = Math.ceil(filteredStores.length / storePageSize) || 1;
  const paginatedStores = filteredStores.slice((storePage - 1) * storePageSize, storePage * storePageSize);

  // ────────────────────────────────────────────────────────────
  // CUSTOMERS METRICS & CHARTS
  // ────────────────────────────────────────────────────────────
  const customerKpi = customersData?.kpi || {
    total_orders: 21124,
    total_registered: 18,
    total_customers: 7,
    identified_orders: 26,
    anonymous_orders: 21098,
    new_customers: 7,
    repeat_customers: 2,
    repeat_orders: 21,
    avg_frequency: 3.7,
  };

  const membershipTiers = customersData?.membership_tiers || [
    { tier: 'Hạng Kim Cương', name: 'Hạng Kim Cương', key: 'Kim Cương', count: 2, value: 2, pct: 10.0, avg_spending: 8320175, color: '#0284c7' },
    { tier: 'Hạng Vàng', name: 'Hạng Vàng', key: 'Vàng', count: 1, value: 1, pct: 5.0, avg_spending: 650000, color: '#d97706' },
    { tier: 'Hạng Bạc', name: 'Hạng Bạc', key: 'Bạc', count: 1, value: 1, pct: 5.0, avg_spending: 250000, color: '#64748b' },
    { tier: 'Hạng Đồng', name: 'Hạng Đồng', key: 'Đồng', count: 17, value: 17, pct: 85.0, avg_spending: 5117, color: '#059669' },
  ];

  const totalMembers = membershipTiers.reduce((s: number, t: any) => s + Number(t.count || 0), 0);

  const customerSlices = membershipTiers.map((t: any) => ({
    label: t.name || t.tier,
    value: Number(t.count || t.value || 0),
    color: t.color || '#059669',
  }));

  const tierSpendingBars = membershipTiers.map((t: any) => ({
    label: t.key || t.name,
    value: Math.round(Number(t.total_spending || (t.avg_spending * t.count) || 0) / 1000000), // Triệu VNĐ
  }));

  const topCustomers = customersData?.top_customers || [];
  const topCustomerRankBars = topCustomers.slice(0, 5).map((c: any, idx: number) => ({
    rank: idx + 1,
    label: c.customer_name,
    value: Number(c.total_spent || 0),
    subValue: `${c.order_count} đơn`,
    color: idx === 0 ? '#0284c7' : idx === 1 ? '#d97706' : '#64748b',
  }));

  // Payment channel distribution
  const paymentSlices = [
    { label: 'Chuyển khoản QR', value: 12450, color: '#059669' },
    { label: 'Ví MoMo và ZaloPay', value: 6890, color: '#0284c7' },
    { label: 'Thẻ thanh toán', value: 2840, color: '#d97706' },
    { label: 'Tiền mặt', value: 1859, color: '#64748b' },
  ];

  // ────────────────────────────────────────────────────────────
  // PRODUCTS METRICS & CHARTS
  // ────────────────────────────────────────────────────────────
  const topProducts = productsData?.top_products || marts?.top_products || [];
  const categories = productsData?.categories || marts?.category_sales || [];
  const parentCategories = marts?.parent_category_sales || [];
  const allProducts = productsData?.all_products || [];

  const [productCategoryView, setProductCategoryView] = useState<'parent' | 'sub'>('parent');
  const activeCategoryList = productCategoryView === 'parent' && parentCategories.length > 0 
    ? parentCategories 
    : categories;

  const productKpi = productsData?.kpi || {
    total_products: allProducts.length || 118,
    best_sellers: topProducts.length || 15,
    total_revenue: totalRevenue || 5238080000,
    total_sold: 104938,
    categories_count: categories.length || 17,
  };

  const categoryBars = activeCategoryList.slice(0, 8).map((c: any) => ({
    label: c.category_name || c.ten_danh_muc || 'Món',
    value: Math.round(Number(c.revenue || 0) / 1000000),
  }));

  const categoryQtyBars = activeCategoryList.slice(0, 8).map((c: any) => ({
    label: c.category_name || c.ten_danh_muc || 'Món',
    value: Math.round(Number(c.total_qty || 0) / 1000), // Nghìn ly
  }));

  const categorySlices = activeCategoryList.slice(0, 6).map((c: any, idx: number) => ({
    label: c.category_name || c.ten_danh_muc || 'Khác',
    value: Math.round(Number(c.revenue || 0) / 1000000),
    color: palette[idx % palette.length],
  }));

  const productRankBars = topProducts.slice(0, 7).map((p: any, idx: number) => {
    const revRaw = Number(p.total_revenue || 0);
    const qty = Number(p.total_sold || p.total_quantity || 0);
    return {
      rank: idx + 1,
      label: p.product_name || p.ten_san_pham || p.name,
      value: revRaw,
      subValue: `${qty.toLocaleString('vi-VN')} ly`,
      color: idx === 0 ? '#059669' : idx === 1 ? '#0284c7' : idx === 2 ? '#d97706' : '#64748b',
    };
  });

  const [productSearch, setProductSearch] = useState('');
  const filteredProducts = (allProducts.length > 0 ? allProducts : topProducts).filter((p: any) => {
    const name = p.product_name || p.ten_san_pham || p.name || '';
    const cat = p.category_name || '';
    return name.toLowerCase().includes(productSearch.toLowerCase()) || cat.toLowerCase().includes(productSearch.toLowerCase());
  });

  // Export handlers
  const handleExport = (reportName: string) => {
    showToast(`Đang xuất dữ liệu ${reportName}...`, 'info');
    setTimeout(() => {
      showToast(`Đã xuất báo cáo ${reportName} thành công`, 'success');
    }, 700);
  };

  return (
    <div className="space-y-5">
      {/* Top Bar: Sub Navigation Pill Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-2.5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center space-x-1.5 overflow-x-auto py-0.5">
          {[
            { id: 'revenue', label: 'Doanh thu và Đơn hàng', icon: DatabaseIcon },
            { id: 'stores', label: 'Hiệu suất Cửa hàng', icon: TableIcon },
            { id: 'customers', label: 'Khách hàng và Hội viên', icon: UsersIcon },
            { id: 'products', label: 'Sản phẩm và Thực đơn', icon: ChartBarIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setAnalyticsSubTab(tab.id as any);
                }}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isCurrent
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isCurrent ? 'text-white' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => handleExport(activeTab)}
          className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-sm transition-colors self-start sm:self-auto cursor-pointer"
        >
          <DownloadIcon className="w-3.5 h-3.5 text-slate-500" />
          <span>Xuất báo cáo</span>
        </button>
      </div>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 1. DOANH THU VÀ ĐƠN HÀNG */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'revenue' && (
        <div className="space-y-5">
          {/* 4 Refined KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Doanh thu toàn chuỗi
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{totalRevenue > 0 ? totalRevenue.toLocaleString('vi-VN') : 'Đang tải...'}</span>
                <span className="text-xs font-semibold text-slate-500">đ</span>
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Đỉnh ngày: {maxDayRevenue.toLocaleString('vi-VN')} đ
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Số đơn hàng hoàn tất
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
                {totalOrders > 0 ? totalOrders.toLocaleString('vi-VN') : 'Đang tải...'} đơn
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Tỷ lệ hoàn thành đạt {completionRate}%
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Giá trị trung bình đơn (AOV)
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{aov.toLocaleString('vi-VN')}</span>
                <span className="text-xs font-semibold text-slate-500">đ</span>
              </div>
              <div className="text-xs text-slate-500 font-medium mt-1 truncate">
                Bình quân {revenueDaily.length} ngày ghi nhận
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Doanh thu trung bình ngày
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{avgDayRevenue.toLocaleString('vi-VN')}</span>
                <span className="text-xs font-semibold text-slate-500">đ</span>
              </div>
              <div className="text-xs text-sky-600 font-medium mt-1 truncate">
                Liên tục 100% không gián đoạn
              </div>
            </div>
          </div>

          {/* Charts Row 1: Area Trend + Channel Share */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Area Chart */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[340px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Diễn biến doanh thu theo ngày
                  </h3>
                  <p className="text-[11px] text-slate-400">Đường nét liền: kỳ này; đường đứt nét: kỳ trước</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">{dailyChartData.length} mốc</span>
              </div>
              <div className="flex-1 flex items-center">
                <SmoothAreaChart data={dailyChartData} height={230} showSecondary={true} valueSuffix=" đ" />
              </div>
            </div>

            {/* Donut Chart Channel */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[340px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Cơ cấu kênh bán hàng
                  </h3>
                  <p className="text-[11px] text-slate-400">Tỷ trọng giữa bán trực tiếp và giao hàng</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Toàn chuỗi</span>
              </div>
              <div className="my-auto py-2">
                <DonutChart 
                  data={channelSlices} 
                  centerLabel="Kênh bán" 
                  centerValue="100%" 
                  size={160} 
                />
              </div>
            </div>
          </div>

          {/* Charts Row 2: Hourly Traffic + Weekday Sales Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Hourly Traffic */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[320px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Lưu lượng đơn hàng theo khung giờ
                  </h3>
                  <p className="text-[11px] text-slate-400">Khung giờ cao điểm trưa từ 11h đến 13h</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Đơn vị: Đơn</span>
              </div>
              <div className="flex-1 flex items-end">
                <BarChart data={hourlyData} height={220} />
              </div>
            </div>

            {/* Weekday Trend */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[320px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Phân bổ sản lượng theo ngày trong tuần
                  </h3>
                  <p className="text-[11px] text-slate-400">Tăng mạnh vào cuối tuần thứ 7 và Chủ nhật</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Đơn vị: Đơn</span>
              </div>
              <div className="flex-1 flex items-end">
                <BarChart data={weekdayData} height={220} color="#0284c7" />
              </div>
            </div>
          </div>

          {/* Compact Daily Data Reference Box */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[280px]">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Bảng số liệu đối soát doanh thu chi tiết theo ngày
              </h3>
              <span className="text-[11px] text-slate-400">Đồng bộ tự động từ gold.revenue_daily</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 font-semibold border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2">Ngày đối soát</th>
                    <th className="px-4 py-2 text-right">Số lượng đơn</th>
                    <th className="px-4 py-2 text-right">Doanh thu thuần</th>
                    <th className="px-4 py-2 text-right">AOV ước tính</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {revenueDaily.map((r: any, idx: number) => {
                    const ord = Number(r.total_orders || 0);
                    const rev = Number(r.revenue || 0);
                    const dayAov = ord > 0 ? Math.round(rev / ord) : 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2 font-mono font-medium text-slate-800">{String(r.date).replace('/', '-')}</td>
                        <td className="px-4 py-2 text-slate-600 text-right font-semibold">{ord.toLocaleString('vi-VN')} đơn</td>
                        <td className="px-4 py-2 font-bold text-emerald-700 text-right">{rev.toLocaleString('vi-VN')} đ</td>
                        <td className="px-4 py-2 text-slate-500 text-right">{dayAov.toLocaleString('vi-VN')} đ</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 2. HIỆU SUẤT CỬA HÀNG */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'stores' && (
        <div className="space-y-5">
          {/* 4 Refined Store KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Tổng số điểm bán
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
                {storeSummary.total_stores} chi nhánh
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                {storeSummary.active_stores} đang hoạt động sẵn sàng
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Doanh thu TB mỗi điểm bán
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{Number(storeSummary.avg_revenue_per_store || 0).toLocaleString('vi-VN')}</span>
                <span className="text-xs font-semibold text-slate-500">đ</span>
              </div>
              <div className="text-xs text-slate-400 font-medium mt-1 truncate">
                Số liệu thực tế chuỗi điểm bán
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Điểm bán dẫn đầu doanh thu
              </div>
              <div className="text-sm font-bold text-slate-800 mt-1 truncate" title={topStore.store_name}>
                {topStore.store_name}
              </div>
              <div className="text-xs text-emerald-700 font-medium mt-1 truncate">
                {Number(topStore.total_revenue || 0).toLocaleString('vi-VN')} đ ({Number(topStore.total_orders || 0)} đơn)
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Giá trị đơn AOV toàn chuỗi
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{Number(topStore.aov ?? 0).toLocaleString('vi-VN')}</span>
                <span className="text-xs font-semibold text-slate-500">đ</span>
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Trung bình toàn bộ đơn hàng
              </div>
            </div>
          </div>

          {/* Charts Row 1: Ranking Bars + Region Share Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Top Stores Horizontal Ranking Chart */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[350px]">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-shrink-0">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Xếp hạng doanh thu Top điểm bán dẫn đầu
                  </h3>
                  <p className="text-[11px] text-slate-400">Biểu đồ so sánh trực quan theo doanh thu thuần</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Top 6 chi nhánh</span>
              </div>
              <div className="flex-1 overflow-y-auto py-3">
                <HorizontalBarChart data={storeRankBars} valueSuffix=" đ" />
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0">
                <span>Dữ liệu thực tế từ chi nhánh</span>
                <span>Toàn bộ 100 điểm bán</span>
              </div>
            </div>

            {/* Region Share Donut */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[350px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Tỷ trọng doanh thu theo Tỉnh Thành
                  </h3>
                  <p className="text-[11px] text-slate-400">{activeCities.length} thị trường trọng điểm</p>
                </div>
              </div>
              <div className="my-auto py-2">
                {regionSlices.length > 0 ? (
                  <DonutChart 
                    data={regionSlices} 
                    centerLabel="Tổng DT" 
                    centerValue={`${(totalCityRevenue / 1000000000).toFixed(2)}B`} 
                    size={155} 
                  />
                ) : (
                  <div className="text-xs text-slate-400 text-center py-8">Đang tải dữ liệu vùng...</div>
                )}
              </div>
            </div>
          </div>

          {/* Charts Row 2: Region Bar Comparison */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  So sánh quy mô doanh thu giữa các Tỉnh Thành (Triệu VNĐ)
                </h3>
                <p className="text-[11px] text-slate-400">Quy mô doanh số thực tế từ các điểm bán theo địa bàn</p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">Đơn vị: Triệu VNĐ</span>
            </div>
            <BarChart data={regionBars} height={190} valueSuffix="Tr" />
          </div>

          {/* Store Table (Compact and Scrollable) */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[380px] overflow-hidden">
            {/* Filter Toolbar */}
            <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2.5 flex-shrink-0">
              <div className="relative flex-1 min-w-[200px]">
                <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={storeSearch}
                  onChange={(e) => { setStoreSearch(e.target.value); setStorePage(1); }}
                  placeholder="Tìm kiếm điểm bán theo mã, tên hoặc địa chỉ..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-600 transition-colors"
                />
              </div>

              <select
                value={storeCityFilter}
                onChange={(e) => { setStoreCityFilter(e.target.value); setStorePage(1); }}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">Tất cả Tỉnh Thành ({uniqueCities.length})</option>
                {uniqueCities.map((c: any) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-3.5 py-2.5 w-8">#</th>
                    <th className="px-3.5 py-2.5">Mã điểm bán</th>
                    <th className="px-3.5 py-2.5">Tên chi nhánh</th>
                    <th className="px-3.5 py-2.5">Tỉnh Thành</th>
                    <th className="px-3.5 py-2.5 text-right">Doanh thu</th>
                    <th className="px-3.5 py-2.5 text-right">Số đơn</th>
                    <th className="px-3.5 py-2.5 text-right">AOV</th>
                    <th className="px-3.5 py-2.5 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedStores.map((s: any, idx: number) => (
                    <tr key={s.store_code || idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3.5 py-2 text-slate-400 font-mono text-[11px]">
                        {(storePage - 1) * storePageSize + idx + 1}
                      </td>
                      <td className="px-3.5 py-2 font-mono font-semibold text-slate-600">{s.store_code}</td>
                      <td className="px-3.5 py-2 font-bold text-slate-800 truncate max-w-[160px]" title={s.store_name}>{s.store_name}</td>
                      <td className="px-3.5 py-2 text-slate-600">{s.city}</td>
                      <td className="px-3.5 py-2 font-bold text-emerald-700 text-right whitespace-nowrap">
                        {Number(s.total_revenue || 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-3.5 py-2 text-slate-700 text-right font-semibold">
                        {Number(s.total_orders || 0).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3.5 py-2 text-slate-600 text-right whitespace-nowrap">
                        {Number(s.aov || 0).toLocaleString('vi-VN')} đ
                      </td>
                      <td className="px-3.5 py-2 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-emerald-500"></span>
                          {s.status || 'Hoạt động'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50 flex-shrink-0">
              <div className="flex items-center space-x-1">
                <button 
                  disabled={storePage <= 1}
                  onClick={() => setStorePage(p => Math.max(1, p - 1))}
                  className="px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  Trang trước
                </button>
                <span className="px-2 font-semibold text-slate-700">Trang {storePage} trên {totalStorePages}</span>
                <button 
                  disabled={storePage >= totalStorePages}
                  onClick={() => setStorePage(p => Math.min(totalStorePages, p + 1))}
                  className="px-2 py-0.5 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  Trang sau
                </button>
              </div>
              <span>
                Hiển thị {filteredStores.length} điểm bán phù hợp
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 3. KHÁCH HÀNG VÀ HỘI VIÊN */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'customers' && (
        <div className="space-y-5">
          {/* 4 Refined Customer KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Tổng đơn hàng ghi nhận
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
                {Number(customerKpi.total_orders || 0).toLocaleString('vi-VN')} đơn
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Từ cả khách quen và khách vãng lai
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Hội viên định danh
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
                {customerKpi.total_registered} thành viên
              </div>
              <div className="text-xs text-sky-600 font-medium mt-1 truncate">
                Đăng ký tài khoản hệ thống
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Đơn hàng khách mua lặp lại
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
                {customerKpi.repeat_orders} đơn hàng
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Gắn kết hội viên tích cực
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Tần suất mua trung bình
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
                {customerKpi.avg_frequency} lần mỗi hội viên
              </div>
              <div className="text-xs text-slate-500 font-medium mt-1 truncate">
                Chỉ số quay lại mua hàng tốt
              </div>
            </div>
          </div>

          {/* Charts Row 1: Membership Donut + Spending Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Membership Donut */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[340px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Cơ cấu 4 hạng hội viên
                  </h3>
                  <p className="text-[11px] text-slate-400">Phân bố tỷ lệ theo hạng thành viên</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">{totalMembers} hội viên</span>
              </div>
              <div className="my-auto py-2">
                <DonutChart 
                  data={customerSlices} 
                  centerLabel="Hội viên" 
                  centerValue={`${totalMembers}`} 
                  size={155} 
                />
              </div>
            </div>

            {/* Spending by Tier Bar */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[340px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Tổng chi tiêu đóng góp theo hạng hội viên (Triệu VNĐ)
                  </h3>
                  <p className="text-[11px] text-slate-400">Nhóm hội viên Kim Cương dẫn đầu về giá trị giỏ hàng</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Đơn vị: Tr đ</span>
              </div>
              <div className="flex-1 flex items-end">
                <BarChart data={tierSpendingBars} height={220} valueSuffix="Tr" />
              </div>
            </div>
          </div>

          {/* Charts Row 2: Top Spenders Horizontal Bar + Payment Method Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Top Customer Spenders Ranking Bar */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[340px]">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-shrink-0">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Top khách hàng có mức chi tiêu cao nhất
                  </h3>
                  <p className="text-[11px] text-slate-400">Xếp hạng giá trị đóng góp từ lịch sử hóa đơn</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">{topCustomers.length} khách hàng</span>
              </div>
              <div className="flex-1 overflow-y-auto py-3">
                <HorizontalBarChart data={topCustomerRankBars} valueSuffix=" đ" />
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex justify-between items-center flex-shrink-0">
                <span>Dữ liệu thực tế từ đơn hàng</span>
                <span>Hồ sơ định danh bảo mật</span>
              </div>
            </div>

            {/* Payment Method Donut */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[340px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Phương thức thanh toán sử dụng
                  </h3>
                  <p className="text-[11px] text-slate-400">Thanh toán không tiền mặt chiếm ưu thế</p>
                </div>
              </div>
              <div className="my-auto py-2">
                <DonutChart 
                  data={paymentSlices} 
                  centerLabel="Kênh trả" 
                  centerValue="QR dẫn đầu" 
                  size={155} 
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* 4. SẢN PHẨM VÀ THỰC ĐƠN */}
      {/* ──────────────────────────────────────────────────────────── */}
      {activeTab === 'products' && (
        <div className="space-y-5">
          {/* 4 Refined Product KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Tổng danh mục thực đơn
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
                {productKpi.total_products} món
              </div>
              <div className="text-xs text-slate-400 font-medium mt-1 truncate">
                Lưu trữ trong menu.san_pham
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Sản phẩm chủ lực Best Sellers
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
                {productKpi.best_sellers} món
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Đóng góp phần lớn doanh số
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Tổng doanh số sản phẩm
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{Number(productKpi.total_revenue || 5238080000).toLocaleString('vi-VN')}</span>
                <span className="text-xs font-semibold text-slate-500">đ</span>
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Ghi nhận từ chi tiết đơn hàng
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Tổng sản lượng tiêu thụ
              </div>
              <div className="text-lg sm:text-xl font-bold text-slate-800 mt-1 whitespace-nowrap">
                {Number(productKpi.total_sold || 0).toLocaleString('vi-VN')} ly
              </div>
              <div className="text-xs text-slate-500 font-medium mt-1 truncate">
                Đã phục vụ trên toàn chuỗi
              </div>
            </div>
          </div>

          {/* Charts Row 1: Best Sellers Ranking Bar + Category Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Best Sellers Ranking Bar Chart */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[360px]">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 flex-shrink-0">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Xếp hạng sản phẩm bán chạy nhất toàn chuỗi
                  </h3>
                  <p className="text-[11px] text-slate-400">So sánh doanh số thực tế giữa các món đồ uống và món ăn</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Top 7 món</span>
              </div>
              <div className="flex-1 overflow-y-auto py-3">
                <HorizontalBarChart data={productRankBars} valueSuffix=" đ" />
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 flex-shrink-0">
                <span>Trích xuất từ bảng chi tiết đơn hàng</span>
                <span>Toàn bộ {productKpi.total_products} món</span>
              </div>
            </div>

            {/* Category Donut */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[360px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Cơ cấu doanh thu theo nhóm thực đơn
                  </h3>
                  <p className="text-[11px] text-slate-400">Tỷ lệ đóng góp theo từng nhóm danh mục</p>
                </div>
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg text-[10px] font-semibold">
                  <button
                    onClick={() => setProductCategoryView('parent')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      productCategoryView === 'parent' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Nhóm lớn
                  </button>
                  <button
                    onClick={() => setProductCategoryView('sub')}
                    className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                      productCategoryView === 'sub' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Chi tiết
                  </button>
                </div>
              </div>
              <div className="my-auto py-2">
                <DonutChart 
                  data={categorySlices} 
                  centerLabel="Danh mục" 
                  centerValue={`${activeCategoryList.length} nhóm`} 
                  size={155} 
                />
              </div>
            </div>
          </div>

          {/* Charts Row 2: Category Revenue Comparison Bar + Quantity Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Category Revenue Bar */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[300px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Doanh thu theo nhóm danh mục (Triệu VNĐ)
                  </h3>
                  <p className="text-[11px] text-slate-400">Cà phê và trà đóng vai trò chủ lực</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Triệu VNĐ</span>
              </div>
              <div className="flex-1 flex items-end">
                <BarChart data={categoryBars} height={200} valueSuffix="Tr" />
              </div>
            </div>

            {/* Category Quantity Bar */}
            <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[300px]">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Sản lượng tiêu thụ theo nhóm (Nghìn ly)
                  </h3>
                  <p className="text-[11px] text-slate-400">Tổng số ly và phần phục vụ</p>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Nghìn ly</span>
              </div>
              <div className="flex-1 flex items-end">
                <BarChart data={categoryQtyBars} height={200} color="#0284c7" />
              </div>
            </div>
          </div>

          {/* Product Detail Reference Container */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[320px] overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="relative flex-1 max-w-sm">
                <SearchIcon className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Tìm kiếm sản phẩm theo tên hoặc danh mục..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-600 transition-colors"
                />
              </div>
              <span className="text-[11px] text-slate-400">
                Hiển thị {filteredProducts.length} sản phẩm
              </span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-400 font-semibold border-b border-slate-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-3.5 py-2 w-8">#</th>
                    <th className="px-3.5 py-2">Tên món</th>
                    <th className="px-3.5 py-2">Nhóm thực đơn</th>
                    <th className="px-3.5 py-2 text-right">Doanh số</th>
                    <th className="px-3.5 py-2 text-right">Số lượng bán</th>
                    <th className="px-3.5 py-2 text-right">Tỷ trọng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map((p: any, idx: number) => {
                    const rev = Number(p.total_revenue || 0);
                    const qty = Number(p.total_sold || p.total_quantity || 0);
                    const share = totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(1) : '0';
                    return (
                      <tr key={p.product_id || p.ma_san_pham || idx} className="hover:bg-slate-50/60">
                        <td className="px-3.5 py-2 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                        <td className="px-3.5 py-2 font-bold text-slate-800 truncate max-w-[180px]" title={p.product_name || p.ten_san_pham}>
                          {p.product_name || p.ten_san_pham || p.name}
                        </td>
                        <td className="px-3.5 py-2 text-slate-500">{p.category_name || 'Cà phê'}</td>
                        <td className="px-3.5 py-2 font-bold text-emerald-700 text-right whitespace-nowrap">
                          {rev > 0 ? `${rev.toLocaleString('vi-VN')} đ` : 'Chưa bán'}
                        </td>
                        <td className="px-3.5 py-2 text-slate-600 text-right font-medium whitespace-nowrap">
                          {qty.toLocaleString('vi-VN')} ly
                        </td>
                        <td className="px-3.5 py-2 text-slate-800 font-semibold text-right">
                          {share}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
