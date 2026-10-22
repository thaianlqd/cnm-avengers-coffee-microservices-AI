import React from 'react';
export const StorageView: React.FC = () => <section className="space-y-4">
  <h1 className="text-xl font-semibold">Kho dữ liệu đối tượng</h1>
  <p role="status">Chưa có quan sát dung lượng, danh sách object hoặc kiểm tra kết nối MinIO.</p>
  <div className="grid gap-4 md:grid-cols-3">{['bronze','silver','gold'].map(layer=><article key={layer} className="rounded-xl border bg-white p-5"><h2 className="font-medium">avengers-{layer}</h2><p className="mt-2 text-sm text-slate-500">Bucket cấu hình · Chưa đo</p></article>)}</div>
</section>;
