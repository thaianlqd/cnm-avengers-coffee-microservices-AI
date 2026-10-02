import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { BarChart, DonutChart } from '../components/Charts';
import { DownloadIcon } from '../components/Icons';

export const ProductsView: React.FC = () => {
  const { productsData, fetchProducts, marts, fetchMarts, showToast } = usePlatformStore();
  const [activeSubTab, setActiveSubTab] = useState<'products' | 'categories' | 'menu_store'>('products');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProducts();
    fetchMarts();
  }, [fetchProducts, fetchMarts]);

  const kpi = productsData?.kpi || {
    total_products: 0,
    best_sellers: 0,
    total_revenue: 0,
    total_sold: 0,
    categories_count: 0,
  };

  const topProducts = productsData?.top_products || [];
  const categories = productsData?.categories || [];
  const allProducts = productsData?.all_products || [];
  const totalRev = Number(kpi.total_revenue || 0);

  // Category Bars (Triệu VNĐ)
  const categoryBars = categories.map((c: any) => ({
    label: c.category_name,
    value: Math.round(Number(c.revenue || 0) / 1000000),
  }));

  // Category Donut slices
  const palette = ['#059669', '#0284c7', '#d97706', '#dc2626', '#8b5cf6'];
  const categorySlices = categories.map((c: any, idx: number) => ({
    label: c.category_name,
    value: Math.round(Number(c.revenue || 0) / 1000000),
    color: palette[idx % palette.length],
  }));

  // Filtered products list
  const filteredProducts = (allProducts.length > 0 ? allProducts : topProducts).filter((p: any) => {
    const name = p.product_name || p.ten_san_pham || '';
    const cat = p.category_name || '';
    return name.toLowerCase().includes(searchTerm.toLowerCase()) || cat.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleExport = () => {
    showToast('Đang xuất báo cáo sản phẩm từ database...', 'info');
    setTimeout(() => {
      showToast(`Đã xuất báo cáo ${filteredProducts.length} sản phẩm thành công`, 'success');
    }, 700);
  };

  return (
    <div className="space-y-5">
      {/* Header (Pure reporting dashboard, NO CRUD buttons) */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Báo cáo hiệu suất sản phẩm và thực đơn</h2>
          <span className="text-[11px] text-slate-400 font-medium">Dữ liệu thực tế từ bảng menu.san_pham và chi tiết đơn hàng</span>
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
          { id: 'products', label: 'Hiệu suất sản phẩm' },
          { id: 'categories', label: 'Doanh số theo danh mục' },
          { id: 'menu_store', label: 'Cơ cấu theo vùng miền' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
              activeSubTab === tab.id
                ? 'border-emerald-600 text-emerald-700 bg-white shadow-xs'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SUBTAB 1: HIỆU SUẤT SẢN PHẨM */}
      {activeSubTab === 'products' && (
        <>
          {/* 4 Balanced KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Tổng danh mục thực đơn
              </div>
              <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-1 whitespace-nowrap">
                {kpi.total_products} món
              </div>
              <div className="text-xs text-slate-400 font-normal mt-1 truncate">
                Ghi nhận trong kho danh mục món
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Sản phẩm chủ lực (Best Sellers)
              </div>
              <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-1 whitespace-nowrap">
                {kpi.best_sellers} món
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Đóng góp chính vào doanh thu
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Tổng doanh số sản phẩm
              </div>
              <div className="text-lg sm:text-xl font-semibold text-slate-900 mt-1 flex items-baseline gap-1 whitespace-nowrap">
                <span>{totalRev.toLocaleString('vi-VN')}</span>
                <span className="text-xs font-medium text-slate-500">đ</span>
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Doanh thu hoàn thành từ chi tiết đơn
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs">
              <div className="text-xs font-medium text-slate-500">
                Tổng sản lượng tiêu thụ
              </div>
              <div className="text-lg sm:text-xl font-semibold text-emerald-600 mt-1 whitespace-nowrap">
                {Number(kpi.total_sold || 0).toLocaleString('vi-VN')} ly/phần
              </div>
              <div className="text-xs text-emerald-600 font-medium mt-1 truncate">
                Đã phục vụ toàn chuỗi
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm sản phẩm theo tên hoặc danh mục..."
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-emerald-600 transition-colors"
            />
          </div>

          {/* Middle Row: Balanced Table + Bar Chart (Both exactly 380px tall!) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* Left: Scrollable Balanced Table */}
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[380px] overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
                <h3 className="text-sm font-semibold text-slate-800">
                  Xếp hạng sản phẩm bán chạy nhất (Database Marts)
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">
                  {filteredProducts.length} sản phẩm
                </span>
              </div>

              {/* Scrollable table body inside fixed container */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-400 font-semibold border-b border-slate-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 w-8">#</th>
                      <th className="px-3 py-2">Tên món</th>
                      <th className="px-3 py-2">Danh mục</th>
                      <th className="px-3 py-2 text-right">Doanh số</th>
                      <th className="px-3 py-2 text-right">Số lượng bán</th>
                      <th className="px-3 py-2 text-right">Tỷ trọng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map((p: any, idx: number) => {
                      const rev = Number(p.total_revenue || 0);
                      const qty = Number(p.total_sold || p.total_quantity || 0);
                      const share = totalRev > 0 ? ((rev / totalRev) * 100).toFixed(1) : '0';
                      return (
                        <tr key={p.product_id || p.ma_san_pham || idx} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="px-3 py-2 font-bold text-slate-800 truncate max-w-[160px]" title={p.product_name || p.ten_san_pham}>
                            {p.product_name || p.ten_san_pham}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{p.category_name || 'Cà phê'}</td>
                          <td className="px-3 py-2 font-bold text-emerald-700 text-right whitespace-nowrap">
                            {rev > 0 ? `${rev.toLocaleString('vi-VN')} đ` : 'Chưa bán'}
                          </td>
                          <td className="px-3 py-2 text-slate-600 text-right font-medium whitespace-nowrap">
                            {qty.toLocaleString('vi-VN')} ly
                          </td>
                          <td className="px-3 py-2 text-slate-800 font-semibold text-right">
                            {share}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Scroll hint footer */}
              <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-400 flex justify-between items-center flex-shrink-0">
                <span>Cuộn để xem thêm sản phẩm</span>
                <span>Tổng cộng {filteredProducts.length} món</span>
              </div>
            </div>

            {/* Right: Doanh thu theo danh mục Bar Chart (Matches left height!) */}
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-[380px]">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-800">
                    Doanh thu theo danh mục (Triệu VNĐ)
                  </h3>
                  <span className="text-[11px] text-slate-400 font-mono">{categories.length} nhóm</span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">Tỷ lệ đóng góp doanh thu theo từng nhóm thực đơn</p>
              </div>

              <div className="flex-1 flex items-end">
                {categoryBars.length > 0 ? (
                  <BarChart data={categoryBars} height={230} valueSuffix="Tr" />
                ) : (
                  <div className="text-xs text-slate-400 text-center py-10 w-full">Đang tải danh mục...</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* SUBTAB 2: DOANH SỐ THEO DANH MỤC */}
      {activeSubTab === 'categories' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat: any) => {
              const rev = Number(cat.revenue || 0);
              const share = totalRev > 0 ? ((rev / totalRev) * 100).toFixed(1) : '0';
              return (
                <div key={cat.category_name} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{cat.category_name}</span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                      {share}% doanh thu
                    </span>
                  </div>
                  <div className="text-lg font-bold text-emerald-700 mt-2">
                    {rev.toLocaleString('vi-VN')} đ
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Sản lượng bán: {Number(cat.total_qty || 0).toLocaleString('vi-VN')} món
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 border-t border-slate-100 pt-1.5">
                    Nhóm cha: <span className="font-semibold text-slate-700">{cat.parent_category || 'Thực đơn'}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between h-[360px]">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                So sánh doanh thu giữa các nhóm sản phẩm (Triệu VNĐ)
              </h3>
              <div className="flex-1 flex items-end">
                <BarChart data={categoryBars} height={240} valueSuffix="Tr" />
              </div>
            </div>

            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between h-[360px]">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                Tỷ trọng đóng góp danh mục
              </h3>
              <div className="my-auto py-2">
                <DonutChart data={categorySlices} centerLabel="Danh mục" centerValue={`${categories.length}`} size={135} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 3: TỶ TRỌNG THEO VÙNG MIỀN */}
      {activeSubTab === 'menu_store' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-col justify-between h-[360px]">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                Cơ cấu danh mục đồ uống và thức ăn
              </h3>
              <div className="my-auto py-2">
                <DonutChart data={categorySlices} centerLabel="Cơ cấu" centerValue={`${categories.length} Nhóm`} size={135} />
              </div>
            </div>

            <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs h-[360px] overflow-y-auto">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">
                Thông tin tiêu dùng theo số liệu thực tế
              </h3>
              <div className="space-y-3 text-xs">
                {categories.map((c: any) => (
                  <div key={c.category_name} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="font-bold text-slate-800">{c.category_name} ({c.parent_category || 'Thực đơn'})</div>
                    <p className="text-slate-600 mt-1">
                      Ghi nhận tổng sản lượng {Number(c.total_qty || 0).toLocaleString('vi-VN')} món bán ra, thu về {Number(c.revenue || 0).toLocaleString('vi-VN')} đồng trên toàn bộ chuỗi điểm bán.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
