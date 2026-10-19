import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';

export const SystemAdminView: React.FC = () => {
  const { users, roles, systemLogs, fetchSystem, isLoadingSystem, dataErrors } = usePlatformStore();
  const [tab, setTab] = useState('users');
  useEffect(() => { fetchSystem(); }, [fetchSystem]);
  const statusClass = (value: string) => ['Hoạt động', 'Thành công'].includes(value) ? 'text-emerald-700' : /Thất bại|Ngừng|Khóa/.test(value) ? 'text-red-700' : 'text-slate-600';
  return <section className="space-y-5 pb-8">
    <h1 className="text-xl font-semibold">Quản trị hệ thống</h1>
    <p className="text-sm text-slate-500">Tài khoản và nhật ký từ nguồn quản trị được cấp quyền.</p>
    <div className="flex gap-2">{[['users','Tài khoản'],['roles','Vai trò & Quyền'],['logs','Nhật ký đồng bộ'],['connections','Hạ tầng kết nối']].map(([id,label]) =>
      <button key={id} className={`rounded-xl border px-4 py-2 text-xs ${tab===id?'bg-slate-100':'bg-white'}`} onClick={()=>setTab(id)}>{label}</button>)}</div>
    {isLoadingSystem && <p role="status">Đang tải thông tin quản trị…</p>}
    {dataErrors.system && <p role="alert" className="text-red-700">{dataErrors.system}</p>}
    {!isLoadingSystem && !dataErrors.system && tab==='users' && <div className="rounded-xl border bg-white p-4">
      {users.length===0 ? <p role="status">Không có tài khoản trong dữ liệu được trả về.</p> : <table className="w-full text-left text-sm"><thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Vai trò</th><th>Trạng thái</th></tr></thead><tbody>{users.map(u=><tr key={u.id}><td className="py-3">{u.username}</td><td>{u.full_name}</td><td>{u.role}</td><td className={statusClass(u.status)}>{u.status}</td></tr>)}</tbody></table>}
    </div>}
    {!isLoadingSystem && !dataErrors.system && tab==='roles' && <div className="rounded-xl border bg-white p-4">{roles.length===0 ? <p role="status">Chưa có dữ liệu vai trò.</p> : roles.map((r,i)=><article key={i} className="py-3"><strong>{r.role}</strong><p>{r.users_count} tài khoản — {r.description}</p></article>)}</div>}
    {!isLoadingSystem && !dataErrors.system && tab==='logs' && <div className="rounded-xl border bg-white p-4">{systemLogs.length===0 ? <p role="status">Chưa có nhật ký đồng bộ.</p> : <table className="w-full text-left text-sm"><thead><tr><th>Thời gian</th><th>Tác nhân</th><th>Hành động</th><th>Trạng thái</th><th>Thời lượng</th></tr></thead><tbody>{systemLogs.map((log,i)=><tr key={i}><td className="py-3">{log.time}</td><td>{log.user}</td><td>{log.action}</td><td className={statusClass(log.status)}>{log.status}</td><td>{log.duration_seconds==null?'Chưa đo':`${log.duration_seconds}s`}</td></tr>)}</tbody></table>}</div>}
    {tab==='connections' && <div className="rounded-xl border bg-white p-4"><p role="status">Chưa đo trạng thái và độ trễ kết nối hạ tầng.</p><p className="mt-2 text-sm text-slate-500">PostgreSQL Analytics · MinIO · Kafka · Airflow</p></div>}
  </section>;
};
