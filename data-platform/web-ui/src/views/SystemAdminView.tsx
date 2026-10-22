import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { DataCoverageBar } from '../components/workspace/DataCoverageBar';
import { Pagination, usePagination } from '../components/Pagination';

const tabs = [['users','Tài khoản'],['roles','Vai trò & Quyền'],['sources','Nguồn & đồng bộ'],['logs','Nhật ký đồng bộ'],['connections','Hạ tầng kết nối']];
export const SystemAdminView: React.FC = () => {
  const { users, roles, systemLogs, fetchSystem, isLoadingSystem, dataErrors } = usePlatformStore();
  const [tab, setTab] = useState('users');
  const [capabilities,setCapabilities]=useState<any>(null);
  useEffect(()=>{const c=new AbortController();fetch('/api/ai/capabilities',{signal:c.signal}).then(r=>r.ok?r.json():null).then(setCapabilities).catch(()=>{});return()=>c.abort();},[]);
  const [search, setSearch] = useState('');
  useEffect(() => { fetchSystem(); }, [fetchSystem]);
  const match = (...values: unknown[]) => values.some(value => String(value ?? '').toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi').trim()));
  const userPage = usePagination(users.filter(u=>match(u.username,u.full_name,u.role,u.status)),10,tab+search);
  const rolePage = usePagination(roles.filter(r=>match(r.role,r.description)),10,tab+search);
  const logPage = usePagination(systemLogs.filter(l=>match(l.time,l.user,l.action,l.status)),10,tab+search);
  const pagination = tab==='users'?userPage:tab==='roles'?rolePage:logPage;
  const statusClass = (value: string) => ['Hoạt động', 'Thành công'].includes(value) ? 'text-blue-700' : /Thất bại|Ngừng|Khóa/.test(value) ? 'text-red-700' : 'text-slate-600';
  const isList=['users','roles','logs'].includes(tab);
  const ready = !isLoadingSystem && !dataErrors.system;
  const label = tabs.find(([id])=>id===tab)![1];
  return <section className="space-y-5 pb-8" data-system-admin>
    <div><p className="text-[11px] font-semibold tracking-widest text-blue-600">DATA PLATFORM / ADMINISTRATION</p><h1 className="mt-2 text-2xl font-semibold tracking-tight">Quản trị hệ thống</h1><p className="mt-2 text-sm leading-6 text-slate-500">Vai trò Data Platform và phiên hiện tại đã được xác thực. Chưa kết nối danh bạ Identity; số lượng tài khoản chưa được đo.</p></div>
    <div role="tablist" aria-label="Quản trị hệ thống" className="flex flex-wrap gap-2">{tabs.map(([id,title]) =>
      <button key={id} type="button" role="tab" id={`system-tab-${id}`} aria-controls="system-content" aria-selected={tab===id} className={`rounded-xl border px-4 py-2.5 text-xs font-medium focus-visible:outline-blue-600 ${tab===id?'border-blue-200 bg-blue-50 text-blue-700':'border-slate-200 bg-white text-slate-600 hover:border-blue-200'}`} onClick={()=>{setTab(id);setSearch('');}}>{title}</button>)}</div>
    <section id="system-content" role="tabpanel" aria-labelledby={`system-tab-${tab}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {isList && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h2 className="text-sm font-semibold text-slate-800">{label}</h2><p className="mt-1 text-[11px] text-slate-500">Phân trang trên dữ liệu máy chủ đã trả về; không tự tải thêm hoặc làm mới nền.</p></div><input aria-label={`Tìm ${label.toLocaleLowerCase('vi')}`} type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Tìm trong danh sách…" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs outline-none focus:border-blue-500 sm:w-64"/></div>}
      {isLoadingSystem && isList && <p role="status" className="p-6 text-sm text-slate-500">Đang tải thông tin quản trị…</p>}
      {dataErrors.system && isList && <p role="alert" className="p-6 text-sm text-red-700">{dataErrors.system}</p>}
      {ready && isList && pagination.total===0 && <p role="status" className="p-8 text-center text-sm text-slate-500">{search?'Không có kết quả phù hợp.':tab==='logs'?'Chưa có nhật ký đồng bộ.':tab==='roles'?'Chưa có dữ liệu vai trò.':'Không có tài khoản trong dữ liệu được trả về.'}</p>}
      {ready && tab==='users' && userPage.total>0 && <div className="overflow-x-auto"><table className="admin-data-table"><thead><tr><th>Tài khoản</th><th>Nguồn xác thực</th><th>Vai trò</th><th>Trạng thái</th></tr></thead><tbody>{userPage.items.map(u=><tr key={u.id}><td className="font-medium">{u.username}</td><td>{u.full_name}</td><td>{u.role}</td><td className={statusClass(u.status)}>{u.status}</td></tr>)}</tbody></table></div>}
      {ready && tab==='roles' && <div className="divide-y divide-slate-100 px-5">{rolePage.items.map((r,i)=><article key={i} className="py-4"><strong className="text-sm text-slate-800">{r.role}</strong><p className="mt-1 text-xs leading-6 text-slate-500">{r.users_count == null ? 'Chưa có số lượng tài khoản' : `${r.users_count} tài khoản`} — {r.description}</p></article>)}</div>}
      {ready && tab==='logs' && logPage.total>0 && <div className="overflow-x-auto"><table className="admin-data-table"><thead><tr><th>Thời gian</th><th>Tác nhân</th><th>Hành động</th><th>Trạng thái</th><th>Thời lượng</th></tr></thead><tbody>{logPage.items.map((log,i)=><tr key={logPage.offset+i}><td className="whitespace-nowrap">{log.time}</td><td className="font-mono text-[11px]">{log.user}</td><td className="min-w-64">{log.action}</td><td className={`whitespace-nowrap ${statusClass(log.status)}`}>{log.status}</td><td>{log.duration_seconds==null?'Chưa đo':`${log.duration_seconds}s`}</td></tr>)}</tbody></table></div>}
      {ready && isList && <Pagination {...pagination} label={`Phân trang ${label.toLocaleLowerCase('vi')}`} noun={tab==='logs'?'nhật ký':'mục'} />}
      {tab==='sources'&&<div className="p-4"><h2 className="mb-3 text-sm font-semibold">Nguồn dữ liệu & đối soát</h2><DataCoverageBar capabilities={capabilities} onCoverage={coverage=>setCapabilities((c:any)=>({...c,data_coverage:coverage}))}/></div>}
      {tab==='connections' && <div className="p-6"><p role="status" className="text-sm text-slate-700">Chưa đo trạng thái và độ trễ kết nối hạ tầng.</p><p className="mt-2 text-xs text-slate-500">PostgreSQL Analytics · MinIO · Kafka · Airflow</p></div>}
    </section>
  </section>;
};
