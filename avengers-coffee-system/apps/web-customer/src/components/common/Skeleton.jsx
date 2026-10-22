import { uiText as ui, useUiLanguage } from '../../lib/uiText';
import React from 'react';

/**
 * Khối cơ bản cho Skeleton với hiệu ứng nhịp thở / sóng mờ nhẹ
 */
export function Skeleton({ className = '', style, ...props }) {
  useUiLanguage();
  return (
    <div
      className={`customer-skeleton rounded-xl bg-[#ece8e3] ${className}`}
      style={style}
      {...props}
    />
  );
}

// The global header and footer remain mounted while a lazy page is loading.
// Only the page body is represented here, so its shape matches the selected tab.
export function PageSkeleton({ page = 'home' }) {
  useUiLanguage();
  const catalog = ['order', 'menu-intro'].includes(page);
  const editorial = ['news', 'news-detail', 'about', 'other-group', 'careers'].includes(page);
  if (['tra-cuu-don', 'tracking'].includes(page)) {
    return <div className="min-h-[55vh] bg-[#faf7f4] px-4 py-10" role="status" aria-label={ui("Đang tải tra cứu đơn hàng")} aria-busy="true"><OrderLookupSkeleton /></div>;
  }
  return (
    <div role="status" aria-label={ui("Đang tải nội dung")} aria-busy="true" className={`min-h-[55vh] ${page === 'home' ? 'bg-[#faf9f6]' : 'bg-white'}`} data-testid="page-skeleton">
      {page === 'home' ? (
        <>
          <div className="flex min-h-[620px] items-center bg-[#35312d] md:min-h-[min(760px,84vh)]">
            <div className="w-full max-w-[740px] space-y-5 px-8 py-16 md:px-[9vw]">
              <div className="customer-skeleton h-3 w-48 bg-white/25" />
              <div className="customer-skeleton h-14 w-full max-w-xl bg-white/25 md:h-20" />
              <div className="customer-skeleton h-14 w-4/5 max-w-lg bg-white/25 md:h-20" />
              <div className="customer-skeleton h-5 w-4/5 max-w-md bg-white/25" />
              <div className="customer-skeleton h-5 w-2/3 max-w-sm bg-white/25" />
              <div className="customer-skeleton mt-8 h-9 w-40 border-b border-white/40 bg-white/15" />
            </div>
          </div>
          <div className="mx-auto flex max-w-[800px] flex-col items-center gap-5 px-6 py-20 md:py-32">
            <Skeleton className="h-3 w-36" />
            <Skeleton className="h-12 w-full max-w-[680px]" />
            <Skeleton className="h-12 w-3/4 max-w-[510px]" />
            <Skeleton className="h-5 w-4/5 max-w-[470px]" />
          </div>
          <div className="grid gap-5 px-5 pb-20 md:grid-cols-2 md:px-[5vw]">
            <Skeleton className="h-[430px] w-full rounded-none md:h-[560px]" />
            <Skeleton className="h-[430px] w-full rounded-none md:h-[560px]" />
          </div>
        </>
      ) : catalog ? (
        <div className="mx-auto max-w-[1440px] px-4 py-8 md:px-8">
          <Skeleton className="h-[180px] w-full rounded-2xl md:h-[300px]" />
          <div className="my-8 flex gap-3 overflow-hidden">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 w-28 shrink-0 rounded-full" />)}</div>
          <OrderCatalogSkeleton />
        </div>
      ) : page === 'stores' ? (
        <div className="mx-auto max-w-[1240px] px-4 py-10 md:px-6 md:py-16">
          <Skeleton className="mb-4 h-10 w-64" /><Skeleton className="mb-8 h-5 w-3/5" />
          <Skeleton className="mb-6 h-12 w-full rounded-full" />
          <div className="grid gap-6 md:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">{Array.from({ length: 3 }, (_, i) => <div key={i} className="rounded-xl border border-gray-100 p-4"><Skeleton className="mb-3 h-5 w-3/4" /><Skeleton className="mb-2 h-4 w-full" /><Skeleton className="h-4 w-1/2" /></div>)}</div>
            <Skeleton className="h-[360px] w-full md:h-[500px]" />
          </div>
        </div>
      ) : editorial ? (
        <div className="mx-auto max-w-[1240px] px-4 py-10 md:px-6 md:py-16">
          <Skeleton className="mb-5 h-4 w-28" /><Skeleton className="mb-4 h-10 w-3/4 md:w-1/2" />
          <Skeleton className="mb-10 h-5 w-2/3" />
          <div className="grid gap-6 md:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="space-y-3"><Skeleton className="aspect-[4/3] w-full" /><Skeleton className="h-5 w-4/5" /><Skeleton className="h-4 w-2/3" /></div>)}</div>
        </div>
      ) : (
        <div className="mx-auto max-w-[1240px] px-4 py-10 md:px-6 md:py-16">
          <Skeleton className="mb-4 h-9 w-56" /><Skeleton className="mb-10 h-5 w-3/5" />
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <div key={i} className="rounded-2xl border border-[#eee7de] p-5"><Skeleton className="mb-5 h-32 w-full" /><Skeleton className="mb-3 h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /></div>)}</div>
        </div>
      )}
    </div>
  );
}

export function OrderCatalogSkeleton() {
  useUiLanguage();
  return (
    <div className="space-y-6" role="status" aria-label={ui("Đang tải thực đơn")} aria-busy="true">
      <Skeleton className="h-7 w-48" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-6">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-lg border border-gray-100 bg-white">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="space-y-3 p-4"><Skeleton className="h-3 w-20" /><Skeleton className="h-5 w-4/5" /><Skeleton className="h-5 w-24" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NewsListSkeleton() {
  useUiLanguage();
  return <div role="status" aria-label={ui("Đang tải tin tức")} aria-busy="true">
    <div className="news-feature pointer-events-none">
      <div className="news-image"><Skeleton className="h-full w-full rounded-none" /></div>
      <div className="news-feature-copy space-y-5">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-8 h-4 w-40" />
      </div>
    </div>
    <div className="news-grid">
      {Array.from({ length: 3 }, (_, i) => <div key={i} className="space-y-4">
        <Skeleton className="aspect-[16/10] w-full rounded-none" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-4/5" />
        <Skeleton className="h-4 w-full" />
      </div>)}
    </div>
  </div>;
}

export function NewsArticleSkeleton() {
  useUiLanguage();
  return <article role="status" aria-label={ui("Đang tải bài viết")} aria-busy="true" className="min-h-screen bg-gray-50/50 pb-20">
    <div className="border-b border-gray-100 bg-white px-4 pb-12 pt-8">
      <div className="mx-auto max-w-[880px] space-y-6">
        <Skeleton className="h-9 w-44 rounded-full" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="aspect-[16/9] w-full rounded-none md:h-[480px]" />
      </div>
    </div>
    <div className="mx-auto max-w-[880px] space-y-5 bg-white px-4 py-12">
      <Skeleton className="h-6 w-4/5" />
      {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className={`h-4 ${i % 2 ? 'w-4/5' : 'w-full'}`} />)}
    </div>
  </article>;
}

export function StoreListSkeleton() {
  useUiLanguage();
  return <div role="status" aria-label={ui("Đang tải danh sách cửa hàng")} aria-busy="true" className="divide-y divide-gray-100">
    {Array.from({ length: 4 }, (_, i) => <div key={i} className="space-y-3 border-l-4 border-l-transparent p-6">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>)}
  </div>;
}

export function OrderHistoryModalSkeleton() {
  useUiLanguage();
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" role="status" aria-label={ui("Đang tải lịch sử đơn hàng")} aria-busy="true">
    <div className="w-full max-w-3xl space-y-5 rounded-2xl bg-white p-6 shadow-2xl"><Skeleton className="h-7 w-52" />{Array.from({ length: 3 }, (_, i) => <div key={i} className="rounded-xl border border-gray-100 p-4"><Skeleton className="mb-3 h-5 w-32" /><Skeleton className="h-4 w-3/4" /></div>)}</div>
  </div>;
}

/**
 * Skeleton thẻ sản phẩm (Product Card Skeleton)
 */
export function ProductCardSkeleton({ className = '' }) {
  useUiLanguage();
  return (
    <div className={`bg-white rounded-3xl p-4 md:p-5 border border-[#ede5dc] shadow-xs flex flex-col justify-between space-y-4 ${className}`}>
      <div className="space-y-3">
        <Skeleton className="w-full aspect-square rounded-2xl" />
        <Skeleton className="w-3/4 h-5 rounded-lg" />
        <Skeleton className="w-1/2 h-4 rounded-md" />
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <Skeleton className="w-24 h-6 rounded-lg" />
        <Skeleton className="w-9 h-9 rounded-xl" />
      </div>
    </div>
  );
}

/**
 * Skeleton lưới sản phẩm (Product Grid Skeleton)
 */
export function ProductGridSkeleton({ count = 6 }) {
  useUiLanguage();
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
      {Array.from({ length: count }, (_, idx) => (
        <ProductCardSkeleton key={idx} />
      ))}
    </div>
  );
}

/**
 * Skeleton toàn diện trang Tra Cứu Đơn Hàng (OrderLookupPage)
 */
export function OrderLookupSkeleton() {
  useUiLanguage();
  return (
    <div className="w-full space-y-6">
      {/* Thẻ trạng thái & tiến trình */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#ede5dc] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="space-y-2">
            <Skeleton className="w-56 h-7 rounded-xl" />
            <Skeleton className="w-40 h-4 rounded-md" />
          </div>
          <Skeleton className="w-36 h-10 rounded-2xl" />
        </div>

        {/* Giải thích trạng thái */}
        <Skeleton className="w-full h-14 rounded-2xl" />

        {/* 4 bước tiến trình */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col items-center p-4 rounded-2xl border border-gray-100 bg-gray-50/50 space-y-2.5">
              <Skeleton className="w-10 h-10 rounded-xl" />
              <Skeleton className="w-20 h-4 rounded-md" />
              <Skeleton className="w-24 h-3 rounded-md" />
            </div>
          ))}
        </div>
      </div>

      {/* Thông tin 2 cột: Giao nhận & Người nhận */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-3xl p-6 md:p-7 shadow-sm border border-[#ede5dc] space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="w-36 h-5 rounded-md" />
          </div>
          <div className="space-y-3">
            <Skeleton className="w-28 h-3 rounded-md" />
            <Skeleton className="w-3/4 h-5 rounded-md" />
            <Skeleton className="w-24 h-3 rounded-md mt-2" />
            <Skeleton className="w-full h-5 rounded-md" />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 md:p-7 shadow-sm border border-[#ede5dc] space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-gray-100">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="w-44 h-5 rounded-md" />
          </div>
          <div className="space-y-3">
            <Skeleton className="w-28 h-3 rounded-md" />
            <Skeleton className="w-2/3 h-5 rounded-md" />
            <Skeleton className="w-24 h-3 rounded-md mt-2" />
            <Skeleton className="w-1/2 h-5 rounded-md" />
          </div>
        </div>
      </div>

      {/* Bản đồ định vị lộ trình */}
      <div className="bg-white rounded-3xl p-6 md:p-7 shadow-sm border border-[#ede5dc] space-y-4">
        <div className="flex items-center gap-2.5 pb-2">
          <Skeleton className="w-8 h-8 rounded-lg" />
          <Skeleton className="w-64 h-5 rounded-md" />
        </div>
        <Skeleton className="w-full h-80 rounded-2xl" />
      </div>

      {/* Chi tiết món đã đặt */}
      <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#ede5dc] space-y-4">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <Skeleton className="w-8 h-8 rounded-lg" />
            <Skeleton className="w-40 h-5 rounded-md" />
          </div>
          <Skeleton className="w-24 h-5 rounded-md" />
        </div>
        <div className="space-y-3 pt-2">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-gray-50">
              <div className="flex items-center gap-3">
                <Skeleton className="w-14 h-14 rounded-xl" />
                <div className="space-y-1.5">
                  <Skeleton className="w-36 h-4 rounded-md" />
                  <Skeleton className="w-20 h-3 rounded-md" />
                </div>
              </div>
              <Skeleton className="w-20 h-5 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton trang Theo Dõi Đơn Hàng trực tiếp (OrderTrackingPage)
 */
export function OrderTrackingSkeleton() {
  useUiLanguage();
  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Header bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="w-48 h-6 rounded-lg" />
            <Skeleton className="w-32 h-4 rounded-md" />
          </div>
          <Skeleton className="w-28 h-8 rounded-full" />
        </div>
      </div>

      {/* Bản đồ hành trình */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex items-center justify-between pb-2">
          <Skeleton className="w-40 h-5 rounded-md" />
          <Skeleton className="w-28 h-6 rounded-full" />
        </div>
        <Skeleton className="w-full h-80 rounded-xl" />
      </div>

      {/* Thông tin tài xế & cửa hàng */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <Skeleton className="w-36 h-5 rounded-md" />
          <div className="flex items-center gap-3">
            <Skeleton className="w-12 h-12 rounded-full" />
            <div className="space-y-1.5 flex-1">
              <Skeleton className="w-32 h-4 rounded-md" />
              <Skeleton className="w-24 h-3 rounded-md" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-3">
          <Skeleton className="w-36 h-5 rounded-md" />
          <div className="space-y-2">
            <Skeleton className="w-3/4 h-4 rounded-md" />
            <Skeleton className="w-full h-4 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  );
}
