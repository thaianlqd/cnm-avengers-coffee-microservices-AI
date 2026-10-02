import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';

export const SystemAdminView: React.FC = () => {
  const { users, roles, systemLogs, fetchSystem, showToast } = usePlatformStore();
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'logs' | 'connections'>('users');

  useEffect(() => {
    fetchSystem();
  }, [fetchSystem]);

  const defaultUsers = users.length > 0 ? users : [
    { id: 1, username: 'analytics_admin', full_name: 'Nguyễn Văn A', role: 'Quản trị viên', status: 'Hoạt động', email: 'admin@platform.local' },
    { id: 2, username: 'data_analyst', full_name: 'Trần Thị B', role: 'Chuyên viên dữ liệu', status: 'Hoạt động', email: 'analyst@platform.local' },
    { id: 3, username: 'bi_viewer', full_name: 'Lê Văn C', role: 'Người xem', status: 'Hoạt động', email: 'viewer@platform.local' },
  ];

  const defaultRoles = roles.length > 0 ? roles : [
    { role: 'Quản trị viên', users_count: 1, description: 'Toàn quyền cấu hình kết nối, ETL và truy vấn kho dữ liệu' },
    { role: 'Chuyên viên dữ liệu', users_count: 3, description: 'Truy vấn Data Warehouse, tạo báo cáo và xuất CSV' },
    { role: 'Người xem', users_count: 5, description: 'Xem dashboard tổng quan và báo cáo trực quan' },
  ];

  const connections = [
    { name: 'PostgreSQL Analytics', host: 'postgres-analytics:5432', port: '5434', status: 'Đang kết nối', latency: '4ms' },
    { name: 'MinIO S3 Storage', host: 'minio:9000', port: '9000', status: 'Đang kết nối', latency: '6ms' },
    { name: 'Apache Kafka Broker', host: 'kafka:9092', port: '9092', status: 'Đang kết nối', latency: '2ms' },
    { name: 'Apache Airflow', host: 'avengers_airflow:8080', port: '8083', status: 'Sẵn sàng', latency: '8ms' },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-1">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            Quản trị hệ thống
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Quản lý tài khoản, phân quyền truy cập và kiểm toán hạ tầng dữ liệu
          </p>
        </div>

        <div className="text-xs font-medium text-slate-500">
          {defaultRoles.length} vai trò hệ thống
        </div>
      </div>

      {/* Sub Tabs: Apple Segmented Navigation */}
      <div className="bg-slate-200/70 p-1 rounded-2xl inline-flex space-x-1 border border-slate-200/90">
        {[
          { id: 'users', label: 'Tài khoản' },
          { id: 'roles', label: 'Vai trò & Quyền' },
          { id: 'logs', label: 'Nhật ký đồng bộ' },
          { id: 'connections', label: 'Hạ tầng kết nối' },
        ].map((tab) => {
          const isCurrent = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                isCurrent
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Users Table */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">#</th>
                <th className="px-5 py-3">Tài khoản</th>
                <th className="px-5 py-3">Họ và tên</th>
                <th className="px-5 py-3">Vai trò</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Trạng thái</th>
                <th className="px-5 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {defaultUsers.map((u, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3.5 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                  <td className="px-5 py-3.5 font-mono font-medium text-slate-900">{u.username}</td>
                  <td className="px-5 py-3.5 text-slate-700">{u.full_name}</td>
                  <td className="px-5 py-3.5 text-slate-600 font-medium">
                    {u.role}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 font-mono">{u.email}</td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => showToast(`Quyền hạn của ${u.username}: Truy cập tầng Gold Marts và xuất báo cáo`, 'info')}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Xem quyền
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Roles Grid */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {defaultRoles.map((r, idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-900 text-sm">{r.role}</h3>
                  <span className="text-xs text-slate-400 font-medium">
                    {r.users_count} thành viên
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-3 leading-relaxed">{r.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Logs Table */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-medium border-b border-slate-100">
              <tr>
                <th className="px-5 py-3">Thời gian</th>
                <th className="px-5 py-3">Tác nhân</th>
                <th className="px-5 py-3">Hành động</th>
                <th className="px-5 py-3">Trạng thái</th>
                <th className="px-5 py-3 text-right">Thời lượng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(systemLogs.length > 0 ? systemLogs : [
                { time: '28-09 08:40', user: 'data_sync', action: 'Đồng bộ 61 bảng, 1.2M dòng dữ liệu', status: 'Hoàn tất', duration_seconds: 18 },
                { time: '28-09 08:35', user: 'airflow', action: 'Chạy DAG avengers_daily_pipeline', status: 'Hoàn tất', duration_seconds: 142 },
                { time: '28-09 08:20', user: 'kafka_consumer', action: 'Xả buffer 50 sự kiện', status: 'Hoàn tất', duration_seconds: 2 },
              ]).map((log, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-5 py-3 text-slate-400 font-mono">{log.time}</td>
                  <td className="px-5 py-3 font-mono font-medium text-slate-700">{log.user}</td>
                  <td className="px-5 py-3 text-slate-600">{log.action}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-slate-600">{log.duration_seconds}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Connections Grid */}
      {activeTab === 'connections' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {connections.map((c, idx) => (
            <div key={idx} className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="font-semibold text-slate-900 text-sm">{c.name}</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  {c.status}
                </span>
              </div>
              <div className="mt-3.5 space-y-2 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>Địa chỉ máy chủ</span>
                  <span className="font-mono text-slate-700">{c.host}:{c.port}</span>
                </div>
                <div className="flex justify-between">
                  <span>Độ trễ phản hồi</span>
                  <span className="font-medium text-slate-700">{c.latency}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
