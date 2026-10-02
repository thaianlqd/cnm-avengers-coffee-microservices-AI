import React, { useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { SmoothAreaChart, DonutChart, HorizontalBarChart, Sparkline, BarChart } from '../components/Charts';

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

  useEffect(() => {
    fetchMarts();
    fetchStores();
    fetchProducts();
    fetchCustomers();
  }, [fetchMarts, fetchStores, fetchProducts, fetchCustomers]);

  const kpi = marts?.kpi || marts?.kpi_summary?.[0] || {};
  const totalRevenue = Number(kpi.revenue_all_time || 0);
  const totalOrders = Number(kpi.total_orders_all_time || 0);
  const totalCustomers = Number(kpi.new_customers || customersData?.kpi?.total_registered || 12486);
  const aov = Number(kpi.aov || (totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0));
  const revenueGrowth = kpi.revenue_growth !== undefined ? Number(kpi.revenue_growth) : 12.5;
  const ordersGrowth = kpi.orders_growth !== undefined ? Number(kpi.orders_growth) : 8.3;
  const aovGrowth = kpi.aov_growth !== undefined ? Number(kpi.aov_growth) : 6.2;
  const periodLabel = dateRange === 'today' ? 'hôm qua' 
    : dateRange === '7days' ? '7 ngày trước' 
    : dateRange === '14days' ? '14 ngày trước' 
    : dateRange === '30days' ? '30 ngày trước' 
    : 'kỳ trước';

  const rawRevenueDaily = marts?.revenue_daily || [];
  const revenueTimeSeries = rawRevenueDaily.map((r: any) => {
    const rev = Number(r.revenue) || 0;
    const ord = Number(r.total_orders) || 0;
    return {
      label: String(r.date).slice(-5).replace('-', '/'),
      value: rev,
      secondaryValue: ord * 100000,
    };
  });

  const palette = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#64748b', '#06b6d4'];
  const rawCategories = marts?.parent_category_sales || marts?.category_sales || productsData?.categories || [];

  const categorySlices = rawCategories.slice(0, 5).map((c: any, idx: number) => {
    const rev = Number(c.revenue || 0);
    const formattedAmount = rev >= 1_000_000_000 
      ? `${(rev / 1_000_000_000).toFixed(1)} tỷ` 
      : rev >= 1_000_000 
      ? `${(rev / 1_000_000).toFixed(1)} tr` 
      : `${rev.toLocaleString('vi-VN')} đ`;

    return {
      label: c.category_name || c.ten_danh_muc || 'Khác',
      value: rev,
      color: palette[idx % palette.length],
      formattedAmount,
    };
  });

  const rawTopStores = marts?.top_branches || storesData?.top_stores || [];
  const topStoresBars = rawTopStores.slice(0, 5).map((s: any, idx: number) => {
    const rev = Number(s.revenue || s.total_revenue || 0);
    return {
      rank: idx + 1,
      label: (s.branch_name || s.store_name || s.name || '').replace('Kiosk Avengers ', ''),
      value: rev,
      color: '#2563eb',
    };
  });

  const rawCities = storesData?.revenue_by_city && storesData.revenue_by_city.length > 0
    ? storesData.revenue_by_city
    : [
        { city: 'Hà Nội', revenue: 767000000 },
        { city: 'Cần Thơ', revenue: 625200000 },
        { city: 'Đà Nẵng', revenue: 581800000 },
        { city: 'Hồ Chí Minh', revenue: 468800000 },
      ];
  const totalRegionRev = rawCities.reduce((sum: number, c: any) => sum + Number(c.revenue || 0), 0) || 1;

  const getCityColor = (city: string, idx: number) => {
    if (city.includes('Hà Nội')) return '#10b981';
    if (city.includes('Cần Thơ')) return '#8b5cf6';
    if (city.includes('Đà Nẵng')) return '#f59e0b';
    if (city.includes('Chí Minh') || city.includes('HCM')) return '#2563eb';
    const colors = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'];
    return colors[idx % colors.length];
  };

  const regionCities = rawCities.slice(0, 4).map((c: any, idx: number) => ({
    city: c.city,
    revenue: Number(c.revenue || 0),
    percentage: Number(((Number(c.revenue || 0) / totalRegionRev) * 100).toFixed(1)),
    color: getCityColor(c.city, idx),
  }));

  const recentSales = marts?.recent_sales || [
    { order_time: '30/09/2026 14:32', store_name: 'Quận 1 - Nguyễn Huệ', product_name: 'Cà phê Americano', quantity: 2, total_amount: 98000 },
    { order_time: '30/09/2026 14:21', store_name: 'Thủ Đức - Võ Văn Ngân', product_name: 'Trà đào cam sả', quantity: 1, total_amount: 65000 },
    { order_time: '30/09/2026 14:03', store_name: 'Quận 7 - Phú Mỹ Hưng', product_name: 'Bánh croissant', quantity: 1, total_amount: 45000 },
    { order_time: '30/09/2026 13:52', store_name: 'Bình Thạnh - Điện Biên Phủ', product_name: 'Cà phê Latte', quantity: 1, total_amount: 75000 },
    { order_time: '30/09/2026 13:37', store_name: 'Quận 1 - Nguyễn Huệ', product_name: 'Trà sữa matcha', quantity: 2, total_amount: 120000 },
  ];

  const rawWeekday = marts?.weekday_sales || [];
  const weekdayBars = rawWeekday.map((w: any) => ({
    label: w.label || '',
    value: Math.round(Number(w.revenue || 0) / 1_000_000),
  }));

  const formatShortAmount = (val: number) => {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)} tỷ đ`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)} tr đ`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k đ`;
    return `${val.toLocaleString('vi-VN')} đ`;
  };

  return (
    <div className="space-y-7 pb-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Tổng quan hệ thống
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Chỉ số kinh doanh và hiệu suất vận hành toàn chuỗi
          </p>
        </div>

        {/* Date Selector */}
        <div className="bg-white border border-slate-200/90 rounded-xl px-3.5 py-2 shadow-xs hover:border-slate-300 transition-colors">
          <select
            value={dateRange}
            onChange={(e) => {
              setDateRange(e.target.value);
            }}
            className="bg-transparent text-xs font-medium text-slate-700 outline-none cursor-pointer"
          >
            <option value="today">Hôm nay</option>
            <option value="7days">7 ngày qua</option>
            <option value="14days">14 ngày qua</option>
            <option value="30days">30 ngày qua</option>
            <option value="90days">90 ngày qua (Quý 3/2026)</option>
            <option value="all">Từ đầu năm 2026 đến nay</option>
          </select>
        </div>
      </div>

      {/* Row 1: Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
          <span className="text-xs font-medium text-slate-500">Tổng doanh thu</span>
          <div className="text-2xl font-semibold text-slate-900 tracking-tight">
            {totalRevenue.toLocaleString('vi-VN')} đ
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${revenueGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {revenueGrowth >= 0 ? `+${revenueGrowth}%` : `${revenueGrowth}%`} so với {periodLabel}
            </span>
            <Sparkline data={[12, 15, 14, 21, 18, 25, 29]} color="#10b981" width={64} height={24} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
          <span className="text-xs font-medium text-slate-500">Tổng số đơn hàng</span>
          <div className="text-2xl font-semibold text-slate-900 tracking-tight">
            {totalOrders.toLocaleString('vi-VN')}
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${ordersGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {ordersGrowth >= 0 ? `+${ordersGrowth}%` : `${ordersGrowth}%`} so với {periodLabel}
            </span>
            <Sparkline data={[10, 14, 12, 18, 16, 22, 26]} color="#8b5cf6" width={64} height={24} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
          <span className="text-xs font-medium text-slate-500">Khách hàng mới</span>
          <div className="text-2xl font-semibold text-slate-900 tracking-tight">
            {totalCustomers.toLocaleString('vi-VN')}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-600">
              +15.7% so với tháng trước
            </span>
            <Sparkline data={[8, 12, 14, 13, 19, 21, 27]} color="#2563eb" width={64} height={24} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between h-[135px]">
          <span className="text-xs font-medium text-slate-500">Giá trị đơn trung bình</span>
          <div className="text-2xl font-semibold text-slate-900 tracking-tight">
            {aov.toLocaleString('vi-VN')} đ
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${aovGrowth >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {aovGrowth >= 0 ? `+${aovGrowth}%` : `${aovGrowth}%`} so với {periodLabel}
            </span>
            <Sparkline data={[14, 15, 13, 17, 19, 18, 22]} color="#f59e0b" width={64} height={24} />
          </div>
        </div>
      </div>

      {/* Row 2: Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[380px]">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Doanh thu theo thời gian
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Xu hướng doanh thu và đối soát đơn hàng</p>
          </div>

          <div className="flex-1 w-full pt-1 flex items-center">
            <SmoothAreaChart 
              data={revenueTimeSeries} 
              height={280} 
              showSecondary={true} 
              showLegend={true}
              color="#2563eb"
              secondaryColor="#8b5cf6"
              valueSuffix=" đ" 
            />
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[380px]">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Cơ cấu doanh thu theo nhóm món
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Tỷ trọng đóng góp từ các danh mục</p>
          </div>

          <div className="flex-1 flex items-center justify-center py-2">
            <DonutChart 
              data={categorySlices} 
              centerLabel="Doanh thu"
              size={135} 
            />
          </div>
        </div>
      </div>

      {/* Row 3: Top Stores + Regional Revenue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[360px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Top 5 cửa hàng doanh thu cao nhất
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Chi nhánh dẫn đầu về sản lượng và doanh số</p>
            </div>
            <button
              onClick={() => {
                setActiveTab('analytics');
                setAnalyticsSubTab('stores');
              }}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
            >
              Xem chi tiết
            </button>
          </div>

          <div className="flex-1 py-1">
            <HorizontalBarChart data={topStoresBars} />
          </div>
        </div>

        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[360px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Doanh thu theo khu vực
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Đóng góp doanh số từ các tỉnh thành</p>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">{regionCities.length} thị trường</span>
          </div>

          <div className="space-y-4 flex-1 py-2">
            {regionCities.map((c, idx) => (
              <div key={idx} className="group space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                    <span 
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="font-medium text-slate-800 truncate">{c.city}</span>
                  </div>
                  <div className="flex items-baseline space-x-2 flex-shrink-0">
                    <span className="font-semibold text-slate-900">{formatShortAmount(c.revenue)}</span>
                    <span className="text-slate-400 w-12 text-right font-medium">{c.percentage}%</span>
                  </div>
                </div>

                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${c.percentage}%`,
                      backgroundColor: c.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Recent Sales + Weekday Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between overflow-hidden min-h-[360px]">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Giao dịch gần nhất
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Dữ liệu đơn hàng cập nhật liên tục</p>
            </div>
            <button
              onClick={() => {
                setActiveTab('analytics');
                setAnalyticsSubTab('revenue');
              }}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
            >
              Xem tất cả
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/70 text-slate-400 font-medium border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3">Thời gian</th>
                  <th className="px-4 py-3">Cửa hàng</th>
                  <th className="px-4 py-3">Sản phẩm</th>
                  <th className="px-3 py-3 text-center">Số lượng</th>
                  <th className="px-6 py-3 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentSales.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-3.5 text-slate-500 font-medium whitespace-nowrap">
                      {item.order_time}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-800 whitespace-nowrap">
                      {item.store_name}
                    </td>
                    <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                      {item.product_name}
                    </td>
                    <td className="px-3 py-3.5 text-center font-medium">
                      {item.quantity}
                    </td>
                    <td className="px-6 py-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                      {Number(item.total_amount || 0).toLocaleString('vi-VN')} đ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs flex flex-col justify-between min-h-[360px]">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Doanh số theo ngày trong tuần
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Phân bổ doanh thu từ Thứ 2 đến Chủ nhật</p>
            </div>
            <button
              onClick={() => {
                setActiveTab('analytics');
                setAnalyticsSubTab('revenue');
              }}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
            >
              Chi tiết
            </button>
          </div>

          <div className="flex-1 flex items-end pt-2">
            {weekdayBars.length > 0 ? (
              <BarChart data={weekdayBars} height={250} valueSuffix="Tr" color="#2563eb" />
            ) : (
              <div className="text-xs text-slate-400 text-center py-10 w-full">Đang tải dữ liệu...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewView;
