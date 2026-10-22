import React, { useEffect, useState } from 'react';
import { ArchitectureExplorer } from '../components/architecture/ArchitectureExplorer';

export const ArchitectureView: React.FC = () => {
  const [lineage, setLineage] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setLineage(null);
    fetch('/api/platform/lineage', { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 403 ? 'Tài khoản chưa có quyền xem kiến trúc.' : 'Chưa tải được danh mục kiến trúc.');
        const data = await response.json();
        if (!Array.isArray(data.layers)) throw new Error('Danh mục kiến trúc chưa có cấu trúc hợp lệ.');
        if (!controller.signal.aborted) setLineage(data);
      }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  return <div data-architecture-view className="min-w-0 space-y-5 pb-8">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[11px] font-semibold tracking-widest text-blue-600">DATA PLATFORM / ARCHITECTURE</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Kiến trúc hệ thống</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Toàn bộ hành trình từ ứng dụng nghiệp vụ, đồng bộ và xử lý dữ liệu đến dashboard, trợ lý AI và báo cáo.</p></div><span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] text-slate-500">Sơ đồ cấu hình · Không phải health monitor</span></header>
    <ArchitectureExplorer />
    <div className="grid gap-3 md:grid-cols-3">{[
      ['Dashboard hiện tại','Đọc replica PostgreSQL qua Silver SQL và semantic catalog.'],
      ['Hai đường Bronze riêng','Kafka lưu event theo offset; batch đọc snapshot nguồn theo run. Chưa có bridge tự động giữa hai đường.'],
      ['AI chỉ hiểu ý','Server giữ quyền, công thức, SQL và snapshot; lưu/mở/xuất dùng artifact đã được kiểm chứng.'],
    ].map(([title,description])=><section key={title} className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="text-xs font-semibold text-slate-800">{title}</h2><p className="mt-2 text-xs leading-6 text-slate-500">{description}</p></section>)}</div>
    <details className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-slate-700">Danh mục triển khai từ máy chủ</summary>
      <p className="mt-3 leading-6">Danh mục và sơ đồ mô tả cấu hình. Màn hình không khởi động Spark/Airflow, không polling nền, không gọi provider AI và không tự xác nhận sức khỏe dịch vụ.</p>
      {loading && <p role="status" className="mt-3">Đang tải danh mục…</p>}
      {error && <div role="alert" className="mt-3 text-amber-800">{error} <button className="underline" onClick={() => setRevision(value => value + 1)}>Thử lại</button></div>}
      {lineage && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{lineage.layers.map((layer: any) => <div key={layer.id} className="rounded-xl bg-slate-50 p-3"><p className="font-medium text-slate-800">{layer.sub}</p><ul className="mt-2 space-y-1">{(layer.nodes || []).map((entry: any) => <li key={entry.id}>{entry.name} · Cấu hình</li>)}</ul></div>)}</div>}
    </details>
  </div>;
};
