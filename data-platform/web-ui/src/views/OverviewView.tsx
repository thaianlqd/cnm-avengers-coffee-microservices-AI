import React, { useEffect,useState } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { SeriesLineChart, DonutChart, HorizontalBarChart, SeriesBarChart } from '../components/Charts';
import { ExecutivePanels } from '../components/overview/ExecutivePanels';
import { WholeChainMap } from '../components/overview/WholeChainMap';
import { DataCoverageBar } from '../components/workspace/DataCoverageBar';
import { SearchableSelect } from '../components/SearchableSelect';
import { formatValue } from '../utils/workspacePresentation.mjs';

export const OverviewView: React.FC = () => {
  const [focus,setFocus]=useState('all'),[query,setQuery]=useState(''),[coverage,setCoverage]=useState<any>(null),[healthReload,setHealthReload]=useState(0);
  const { 
    marts,
    dataErrors,
    isLoadingMarts,
    isLoadingStores,
    isLoadingCustomers,
    isLoadingProducts,
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
    setDateRange,
    searchDashboards
  } = usePlatformStore();

  useEffect(() => {
    fetchMarts();
    fetchStores();
    fetchProducts();
    fetchCustomers();
  }, [fetchMarts, fetchStores, fetchProducts, fetchCustomers]);
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>fetch('/api/ai/capabilities',{signal:controller.signal,cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(!controller.signal.aborted)setCoverage(data);}).catch(()=>{}),0);return()=>{clearTimeout(timer);controller.abort();};},[healthReload]);

  const kpi = marts?.kpi || marts?.kpi_summary?.[0] || {};
  const totalRevenue = Number(kpi.revenue_all_time || 0);
  const totalOrders = Number(kpi.total_orders_all_time || 0);
  const totalCustomers = Number(kpi.new_customers ?? 0);
  const aov = Number(kpi.aov ?? (kpi.revenue_orders > 0 ? Math.round(totalRevenue / kpi.revenue_orders) : 0));
  const revenueGrowth = kpi.revenue_growth !== undefined ? Number(kpi.revenue_growth) : null;
  const ordersGrowth = kpi.orders_growth !== undefined ? Number(kpi.orders_growth) : null;
  const aovGrowth = kpi.aov_growth !== undefined ? Number(kpi.aov_growth) : null;
  const periodLabel = dateRange === 'today' ? 'hôm qua' 
    : dateRange === '7days' ? '7 ngày trước' 
    : dateRange === '14days' ? '14 ngày trước' 
    : dateRange === '30days' ? '30 ngày trước' 
    : 'kỳ trước';

  const rawRevenueDaily = marts?.revenue_daily || [];
  const revenueTimeSeries = rawRevenueDaily.map((r: any) => {
    const rev = Number(r.revenue) || 0;
    return {
      label: String(r.date).slice(0, 10),
      value: rev,
    };
  });

  const palette = ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#64748b', '#06b6d4'];
  const rawCategories = marts?.parent_category_sales || marts?.category_sales || productsData?.categories || [];

  const displayedCategories = rawCategories.length > 5
    ? [...rawCategories.slice(0, 4), {category_name:'Nhóm còn lại', revenue:rawCategories.slice(4).reduce((total: number, row: any) => total + Number(row.revenue || 0), 0)}]
    : rawCategories;
  const categorySlices = displayedCategories.map((c: any, idx: number) => {
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

  const rawCities = !isLoadingStores && storesData?.revenue_by_city && storesData.revenue_by_city.length > 0
    ? storesData.revenue_by_city
    : [];
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

  const recentSales = marts?.recent_sales || [];

  const rawWeekday = marts?.weekday_sales || [];
  const weekdayBars = rawWeekday.map((w: any) => ({
    label: w.label || '',
    value: Number(w.revenue || 0),
  }));

  const formatShortAmount = (val: number) => {
    if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)} tỷ đ`;
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)} tr đ`;
    if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k đ`;
    return `${val.toLocaleString('vi-VN')} đ`;
  };

  const sourceErrors = Object.entries({marts:dataErrors.marts,storesData:dataErrors.storesData,productsData:dataErrors.productsData,customersData:dataErrors.customersData}).filter(([,message])=>Boolean(message));
  const retry=()=>{setHealthReload(n=>n+1);fetchMarts();fetchStores();fetchCustomers();fetchProducts();};
  if (dataErrors.marts&&!marts) return <section className="rounded-2xl border border-slate-200 bg-white p-6" data-overview-unavailable><h1 className="text-xl font-semibold">Tổng quan hệ thống</h1><p className="mt-3 text-slate-600">Chưa nhận được dữ liệu kinh doanh từ máy chủ: {dataErrors.marts}</p><button type="button" onClick={retry} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-sm text-white">Tải lại Tổng quan</button></section>;
  if (isLoadingMarts || !marts) return <section role="status" className="p-6">Đang tải dữ liệu tổng quan…</section>;
  return (
    <div data-overview-layout className="overview-layout space-y-5 pb-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Tổng quan điều hành
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Kinh doanh · khách hàng · vận hành · mạng lưới điểm bán
          </p>
        </div>

        {/* Date Selector */}
        <div className="flex flex-wrap items-center gap-2"><div className="w-56"><SearchableSelect label="Kỳ Tổng quan" value={dateRange} onChange={setDateRange} options={[{value:'today',label:'Hôm nay'},{value:'7days',label:'7 ngày qua'},{value:'14days',label:'14 ngày qua'},{value:'30days',label:'30 ngày qua'},{value:'90days',label:'90 ngày qua'},{value:'all',label:'Từ đầu năm 2026 đến nay'}]}/></div><button type="button" onClick={retry} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">Làm mới</button></div>
      </div>
      <section className="executive-intro"><div><p>AVENGERS INTELLIGENCE</p><h2>Bức tranh điều hành toàn chuỗi</h2><span>Theo dõi quy mô, tìm điểm biến động và chuyển đến bài toán phân tích chuyên sâu.</span></div><div className="executive-intro-links"><button type="button" onClick={()=>searchDashboards('D36')}>Khám phá bản đồ ↗</button><button type="button" onClick={()=>searchDashboards('')}>Danh mục bài toán ↗</button></div></section>
      {sourceErrors.length>0&&<div role="status" className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-900">Một số góc nhìn chưa tải được: {sourceErrors.map(([key])=>({storesData:'mạng lưới',productsData:'sản phẩm',customersData:'khách hàng',marts:'kinh doanh'}[key])).join(', ')}. Chỉ số từ các nguồn còn khả dụng tiếp tục hiển thị.</div>}

      {/* Row 1: Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between min-h-[112px] gap-2">
          <span className="text-xs font-medium text-slate-500">Tổng doanh thu</span>
          <div className="text-xl font-semibold text-slate-900 tracking-tight">
            {totalRevenue.toLocaleString('vi-VN')} đ
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${(revenueGrowth ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {revenueGrowth === null ? 'Chưa đo biến động' : `${revenueGrowth >= 0 ? '+' : ''}${revenueGrowth}% so với ${periodLabel}`}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between min-h-[112px] gap-2">
          <span className="text-xs font-medium text-slate-500">Tổng số đơn hàng</span>
          <div className="text-xl font-semibold text-slate-900 tracking-tight">
            {totalOrders.toLocaleString('vi-VN')}
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${(ordersGrowth ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {ordersGrowth === null ? 'Chưa đo biến động' : `${ordersGrowth >= 0 ? '+' : ''}${ordersGrowth}% so với ${periodLabel}`}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between min-h-[112px] gap-2">
          <span className="text-xs font-medium text-slate-500">Khách có tài khoản trong kỳ</span>
          <div className="text-xl font-semibold text-slate-900 tracking-tight">
            {totalCustomers.toLocaleString('vi-VN')}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-600">
              Tài khoản có giao dịch trong kỳ đã chọn
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs flex flex-col justify-between min-h-[112px] gap-2">
          <span className="text-xs font-medium text-slate-500">Giá trị đơn trung bình</span>
          <div className="text-xl font-semibold text-slate-900 tracking-tight">
            {aov.toLocaleString('vi-VN')} đ
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-medium ${(aovGrowth ?? 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {aovGrowth === null ? 'Chưa đo biến động' : `${aovGrowth >= 0 ? '+' : ''}${aovGrowth}% so với ${periodLabel}`}
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-overview-secondary-kpis>{[
        ['Đơn hoàn thành',kpi.completed_orders,'đơn','Toàn bộ đơn có trạng thái HOAN_THANH trong kỳ'],
        ['Đơn đang giao',kpi.active_deliveries,'đơn','Trạng thái trên các đơn được tạo trong kỳ'],
        ['Điểm bán hiện có',kpi.total_stores,'điểm','Hiện trạng danh mục; không phải lịch sử mở cửa hàng'],
        ['Sản lượng bán trong kỳ',isLoadingProducts?null:productsData?.kpi?.total_sold,'sản phẩm','Dòng món thuộc đơn hoàn thành và đang giao'],
      ].map(([label,value,unit,note])=><article key={label} className="rounded-xl border border-slate-200 bg-white px-4 py-3"><p className="text-[11px] text-slate-500">{label}</p><strong className="mt-2 block text-xl font-semibold tracking-tight text-slate-900">{formatValue(value,unit)}</strong><p className="mt-1 text-[10px] leading-4 text-slate-400">{note}</p></article>)}</div>
      <details className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500"><summary className="cursor-pointer font-medium text-slate-700">Định nghĩa chỉ số & cách so sánh kỳ</summary><p className="mt-2 leading-6">Doanh thu và AOV dùng đơn HOAN_THANH + DANG_GIAO. Tổng số đơn gồm mọi trạng thái. Dòng món được tính từ chi tiết đơn nên có thể khác tổng tiền đơn. Biến động đỏ dưới KPI biểu thị giảm so với kỳ trước, không phải lỗi hệ thống.</p></details>
      {coverage&&<DataCoverageBar capabilities={coverage}/>}

      {/* Primary story: the trend leads, composition provides context. */}
      <div className="overview-primary-grid">
        <div className="overview-chart-card overview-trend bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col min-w-0">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Doanh thu theo thời gian
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Tổng tiền các đơn hoàn thành và đang giao</p>
          </div>

          <div className="overview-chart-body w-full flex items-center">
            <SeriesLineChart
              data={revenueTimeSeries.map(point => ({ label: point.label, revenue: point.value }))}
              series={[{ key: 'revenue', label: 'Doanh thu', color: '#2563eb' }]}
              unit="VND"
              area
            />
          </div>
        </div>

        <div className="overview-chart-card overview-composition bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col min-w-0">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-900">
              Giá trị dòng món theo nhóm
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Tổng tiền dòng món, khác tổng tiền đơn hàng</p>
          </div>

          <div className="overview-chart-body flex items-center justify-center">
            <DonutChart 
              data={categorySlices} 
              centerLabel="Giá trị món"
              size={135} 
            />
          </div>
        </div>
      </div>

      <WholeChainMap directory={isLoadingStores?null:storesData} dateRange={dateRange} referenceDate={marts?.filters_applied?.reference_date} loading={isLoadingStores} error={dataErrors.storesData} open={searchDashboards}/>

      {/* Three complementary views on a wide canvas. */}
      <div className="overview-secondary-grid">
        <div className="overview-chart-card bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col min-w-0">
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

          <div className="overview-chart-body flex flex-col justify-center">
            <HorizontalBarChart data={topStoresBars} />
          </div>
        </div>

        <div className="overview-chart-card bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Doanh thu theo khu vực
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Đóng góp doanh số từ các tỉnh thành</p>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">{regionCities.length} thị trường</span>
          </div>

          <div className="overview-chart-body space-y-5 flex flex-col justify-center">
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
        <div className="overview-chart-card overview-weekday bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs flex flex-col min-w-0">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Doanh số theo ngày trong tuần
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Từ Thứ 2 đến Chủ nhật · tổng tiền đơn hợp lệ</p>
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

          <div className="overview-chart-body flex items-center">
            {weekdayBars.length > 0 ? (
              <SeriesBarChart data={weekdayBars.map(point => ({ label: point.label, revenue: point.value }))} series={[{ key: 'revenue', label: 'Doanh thu', color: '#2563eb' }]} unit="VND" />
            ) : (
              <div className="text-xs text-slate-400 text-center py-10 w-full">Không có quan sát trong khoảng thời gian đã chọn.</div>
            )}
          </div>
        </div>
      </div>

      <section className="executive-explorer-toolbar"><nav aria-label="Nhóm góc nhìn Tổng quan">{[['all','Tất cả'],['sales','Kinh doanh'],['customers','Khách hàng'],['operations','Vận hành'],['network','Mạng lưới']].map(([id,label])=><button type="button" key={id} aria-pressed={focus===id} onClick={()=>setFocus(id)}>{label}</button>)}</nav><input type="search" aria-label="Tìm góc nhìn Tổng quan" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Gõ: thanh toán, sản phẩm, giờ, khách hàng…"/></section>
      {(isLoadingStores||isLoadingCustomers||isLoadingProducts)&&<p role="status" className="text-xs text-blue-700">Đang cập nhật các góc nhìn bổ sung theo kỳ đã chọn…</p>}
      <ExecutivePanels marts={marts} storesData={isLoadingStores?null:storesData} customersData={isLoadingCustomers?null:customersData} productsData={isLoadingProducts?null:productsData} focus={focus} query={query} open={searchDashboards}/>

      {/* Transaction details use the full width for readable columns. */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col overflow-hidden min-w-0">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Giao dịch gần nhất
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Đơn hợp lệ theo dữ liệu đã đồng bộ</p>
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


      </div>
    </div>
  );
};

export default OverviewView;
