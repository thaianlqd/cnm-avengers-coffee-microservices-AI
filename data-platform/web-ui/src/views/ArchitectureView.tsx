import React, { useEffect, useState } from 'react';

type Component = { id: string; title: string; tech: string; symbol: string; detail: string; contract: string };
const serving: Component[] = [
  { id: 'source', title: 'Nguồn nghiệp vụ', tech: 'PostgreSQL · Microservices', symbol: 'DB', detail: 'Đơn hàng, giao hàng, thực đơn, chi nhánh, khách hàng và các nguồn nghiệp vụ theo hợp đồng dữ liệu.', contract: 'Credential pipeline riêng; nguồn chỉ đọc. Không ghi ngược từ hệ thống phân tích.' },
  { id: 'replica', title: 'Đồng bộ định kỳ', tech: 'Python · data-sync', symbol: '↻', detail: 'Đọc snapshot và cập nhật tăng dần theo hợp đồng; lưu checkpoint và bằng chứng chất lượng cùng dữ liệu.', contract: 'Chu kỳ 5 phút, trễ tối đa 15 phút theo SLA đã chốt. Đây là mục tiêu cấu hình, không phải số đo hiện tại.' },
  { id: 'warehouse', title: 'Kho phân tích', tech: 'PostgreSQL · Silver', symbol: 'SQL', detail: 'Replica Silver là đường đọc hiện tại của dashboard. Snapshot, generation và chất lượng nguồn quyết định khả năng sử dụng dữ liệu.', contract: 'Snapshot parity không thay thế xác nhận đóng kỳ nghiệp vụ. Không cộng gộp các generation chưa tương thích.' },
  { id: 'api', title: 'Analytics API', tech: 'FastAPI · Compiler', symbol: '{ }', detail: 'Danh mục ngữ nghĩa, kiểm tra quyền, biên dịch truy vấn chỉ đọc, tác vụ phân tích và artifact báo cáo.', contract: 'SQL bị giới hạn thời gian và số dòng; quyền được kiểm tra tại máy chủ. Dashboard chạy bằng SQL xác định.' },
  { id: 'console', title: 'Data Console', tech: 'React · Báo cáo & AI', symbol: '▥', detail: 'Tổng quan, dashboard nghiệp vụ, khám phá dữ liệu, quản trị và báo cáo lưu dùng dữ liệu do máy chủ trả về.', contract: 'Chỉ tab Trợ lý AI được khởi tạo gọi provider AI. Xem sơ đồ, xem biểu đồ, lưu và xuất không gọi provider.' },
];
const streaming: Component[] = [
  { id: 'producer', title: 'Producer', tech: 'Python · Polling', symbol: '↗', detail: 'Đọc các stream đã khai báo và phát sự kiện có định danh vào Kafka. Producer dùng credential riêng theo phạm vi đã duyệt.', contract: 'Đây là polling, không phải CDC. Cửa sổ và cursor chỉ tiến sau khi Kafka xác nhận gửi.' },
  { id: 'kafka', title: 'Event backbone', tech: 'Apache Kafka', symbol: 'K', detail: 'Phân vùng sự kiện theo topic; consumer group lưu offset để tiếp tục sau gián đoạn.', contract: 'Có Kafka đang chạy không đồng nghĩa không còn backlog. Không reset offset để che lag.' },
  { id: 'consumer', title: 'Consumer', tech: 'Python · Bronze writer', symbol: '↓', detail: 'Kiểm tra envelope và ghi object Bronze theo topic, partition và offset; sự kiện lỗi được cách ly.', contract: 'Xác minh ghi bền vững trước khi commit offset. Replay phải giữ định danh và checksum của object.' },
  { id: 'lake', title: 'Object storage', tech: 'MinIO · Bronze', symbol: 'S3', detail: 'Lưu sự kiện thô và bằng chứng checksum. Các vùng Silver/Gold phục vụ đường batch theo cấu hình triển khai.', contract: 'Đường Kafka → Bronze độc lập với dashboard đọc replica. MinIO dừng không được biến số liệu thành 0.' },
  { id: 'compute', title: 'Xử lý theo đợt', tech: 'Apache Spark', symbol: '✦', detail: 'Các job chuẩn hóa Bronze → Silver và tổng hợp Gold theo định nghĩa chỉ số đã khai báo.', contract: 'Đây là đường batch được cấu hình; màn hình này không khởi động Spark hoặc xác nhận job đã chạy.' },
  { id: 'gold', title: 'Data marts', tech: 'Gold · Aggregations', symbol: '∑', detail: 'Các bảng tổng hợp cho báo cáo sau khi vượt kiểm tra chất lượng và publication phù hợp.', contract: 'Chỉ đối chiếu với Analyst khi cùng phạm vi, định nghĩa và generation. Thiếu điều kiện thì chưa thể so sánh.' },
];
const support: Component[] = [
  { id: 'airflow', title: 'Điều phối', tech: 'Apache Airflow', symbol: 'AF', detail: 'Lịch DAG điều phối các bước batch, dependency và retry theo cấu hình.', contract: 'Không tự bật Airflow để xem sơ đồ; tránh tăng CPU/RAM trên máy phát triển.' },
  { id: 'redis', title: 'Tác vụ & phiên', tech: 'Redis', symbol: 'R', detail: 'Lưu trạng thái tác vụ, idempotency, quyền sở hữu và phối hợp giữa các process API.', contract: 'Lease và fencing bảo vệ kết quả; lỗi kho chia sẻ phải được báo rõ, không âm thầm đổi sang bộ nhớ riêng.' },
  { id: 'governance', title: 'Quyền & chất lượng', tech: 'ADMIN · Contracts · Audit', symbol: '✓', detail: 'Hợp đồng nguồn, semantic catalog, chính sách truy cập và nhật ký truy vấn hỗ trợ kiểm chứng dữ liệu.', contract: 'Sơ đồ mô tả cấu hình. Health, độ trễ và completeness phải có quan sát riêng, không suy ra từ mũi tên.' },
];

export const ArchitectureView: React.FC = () => {
  const [selected, setSelected] = useState<Component>(serving[2]);
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
  const node = (item: Component, tone: 'blue' | 'violet') => <button key={item.id} type="button" data-architecture-node={item.id}
    aria-pressed={selected.id === item.id} onClick={() => setSelected(item)}
    className={`relative w-full h-full min-w-0 rounded-2xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-400 ${selected.id === item.id ? 'border-blue-400 bg-slate-800 ring-1 ring-blue-400' : 'border-slate-700 bg-slate-900 hover:border-slate-500'}`}>
    <span aria-hidden="true" className={`mb-4 inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-2 font-mono text-sm font-semibold ${tone === 'blue' ? 'bg-blue-500/15 text-blue-300' : 'bg-violet-500/15 text-violet-300'}`}>{item.symbol}</span>
    <span className="block text-xs font-semibold text-white">{item.title}</span>
    <span className="mt-1.5 block text-[10px] leading-relaxed text-slate-400">{item.tech}</span>
  </button>;
  const lane = (items: Component[], tone: 'blue' | 'violet') => <div className="flex items-stretch">
    {items.map((item, index) => <React.Fragment key={item.id}><div className="flex-1 min-w-0">{node(item, tone)}</div>
      {index < items.length - 1 && <div aria-hidden="true" className={`w-6 shrink-0 flex items-center ${tone === 'blue' ? 'text-blue-400' : 'text-violet-400'}`}><svg viewBox="0 0 24 20" className="w-full"><path d="M0 10H21m-5-5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray={tone === 'violet' ? '3 2' : undefined}/></svg></div>}
    </React.Fragment>)}
  </div>;
  return <div data-architecture-view className="space-y-6 pb-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold text-blue-600">DATA PLATFORM / ARCHITECTURE</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Kiến trúc hệ thống</h1><p className="mt-2 text-sm text-slate-500">Từ dữ liệu nghiệp vụ đến những góc nhìn hỗ trợ quyết định.</p></div>
      <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">Sơ đồ cấu hình · Không phải health monitor</span>
    </div>
    <div className="grid gap-4 md:grid-cols-3">{[
      ['01', 'Phục vụ báo cáo', 'Replica → SQL → Dashboard', 'Đường đọc của dashboard hiện tại.'],
      ['02', 'Luồng sự kiện & batch', 'Kafka → MinIO → Spark', 'Bronze và xử lý batch có kiểm chứng riêng.'],
      ['03', 'Điều phối & kiểm soát', 'Airflow · Redis · Governance', 'Quyền, chất lượng và tác vụ dùng chung.'],
    ].map(([id, title, tech, detail]) => <section key={id} className="rounded-2xl border border-slate-200 bg-white p-5"><span className="text-[10px] font-semibold tracking-widest text-slate-400">{id}</span><h2 className="mt-2 text-sm font-semibold text-slate-900">{title}</h2><p className="mt-2 text-xs font-medium text-slate-700">{tech}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{detail}</p></section>)}</div>
    <section aria-label="Sơ đồ dòng chảy dữ liệu" className="rounded-3xl bg-[#101827] text-white border border-slate-800 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-6 py-5"><div><h2 className="text-sm font-semibold">Một hệ sinh thái. Hai đường dữ liệu.</h2><p className="mt-1 text-xs text-slate-400">Chọn một thành phần để xem vai trò và hợp đồng vận hành.</p></div><span className="text-[10px] text-slate-400">→ Luồng đọc / đồng bộ &nbsp; ⇢ Batch theo cấu hình</span></div>
      <div tabIndex={0} role="region" aria-label="Sơ đồ có thể cuộn ngang" className="overflow-x-auto focus-visible:outline-blue-400">
        <div className="min-w-[950px] space-y-8 p-6">
          <div><p className="mb-4 text-[10px] font-semibold tracking-widest text-blue-300">01 / PHỤC VỤ BÁO CÁO</p>{lane(serving, 'blue')}</div>
          <div><p className="mb-2 text-[10px] font-semibold tracking-widest text-violet-300">02 / TỪ NGUỒN NGHIỆP VỤ → SỰ KIỆN → BATCH</p><p className="mb-4 text-[11px] text-slate-400">Đường sự kiện độc lập với replica; không mặc định là nguồn số liệu của dashboard.</p>{lane(streaming, 'violet')}</div>
          <div className="grid grid-cols-3 gap-4 border-t border-slate-800 pt-5">{support.map(item => node(item, 'violet'))}</div>
        </div>
      </div>
    </section>
    <section aria-label="Chi tiết thành phần" aria-live="polite" className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 lg:grid-cols-3">
      <div><p className="text-xs text-blue-600">THÀNH PHẦN ĐANG CHỌN</p><h2 className="mt-2 text-lg font-semibold text-slate-900">{selected.title}</h2><p className="mt-1 text-xs text-slate-500">{selected.tech}</p></div>
      <div className="lg:col-span-2 text-sm leading-relaxed text-slate-600"><p>{selected.detail}</p><details className="mt-4 border-t border-slate-100 pt-3"><summary className="cursor-pointer text-xs font-semibold text-slate-700">Hợp đồng & lưu ý vận hành</summary><p className="mt-3 text-xs leading-relaxed">{selected.contract}</p></details></div>
    </section>
    <details className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-slate-700">Danh mục triển khai từ máy chủ</summary>
      <p className="mt-3 leading-relaxed">Danh mục mô tả cấu hình; không có số đo sức khỏe dịch vụ tại màn hình này. Xem sơ đồ không khởi động Spark/Airflow, không polling nền và không gọi provider AI.</p>
      {loading && <p role="status" className="mt-3">Đang tải danh mục…</p>}
      {error && <div role="alert" className="mt-3 text-amber-800">{error} <button className="underline" onClick={() => setRevision(value => value + 1)}>Thử lại</button></div>}
      {lineage && <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{lineage.layers.map((layer: any) => <div key={layer.id} className="rounded-xl bg-slate-50 p-3"><p className="font-medium text-slate-800">{layer.sub}</p><ul className="mt-2 space-y-1">{(layer.nodes || []).map((entry: any) => <li key={entry.id}>{entry.name} · Cấu hình</li>)}</ul></div>)}</div>}
    </details>
  </div>;
};
