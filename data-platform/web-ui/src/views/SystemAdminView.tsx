import React, { useState, useEffect } from 'react';
import { usePlatformStore } from '../store/usePlatformStore';
import { 
  ShieldIcon, 
  UsersIcon, 
  CheckIcon 
} from '../components/Icons';

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
    { role: 'Quản trị viên', users_count: 1, description: 'Toàn quyền cấu hình kết nối, ETL và truy vấn' },
    { role: 'Chuyên viên dữ liệu', users_count: 3, description: 'Truy vấn Data Warehouse, tạo báo cáo và xuất CSV' },
    { role: 'Người xem', users_count: 5, description: 'Xem dashboard tổng quan và báo cáo' },
  ];

  const connections = [
    { name: 'PostgreSQL Analytics', host: 'postgres-analytics:5432', port: '5434', status: 'Kết nối tốt', latency: '4ms' },
    { name: 'MinIO S3 Storage', host: 'minio:9000', port: '9000', status: 'Kết nối tốt', latency: '6ms' },
    { name: 'Apache Kafka Broker', host: 'kafka:9092', port: '9092', status: 'Kết nối tốt', latency: '2ms' },
    { name: 'Apache Airflow', host: 'avengers_airflow:8080', port: '8083', status: 'Sẵn sàng', latency: '8ms' },
  ];

  return (
    <div className="space-y-5">
      {/* Header (No add button - pure governance) */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-3.5 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800">
            Quản trị hệ thống và Phân quyền
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">Theo dõi tài khoản truy cập kho dữ liệu, phân quyền và nhật ký kiểm toán</span>
        </div>

        <span className="text-xs text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 font-semibold">
          3 vai trò hệ thống
        </span>
      </div>

      {/* Sub Tabs */}
      <div className="flex border-b border-slate-200 space-x-1">
        {[
          { id: 'users', label: 'Tài khoản' },
          { id: 'roles', label: 'Vai trò và Quyền' },
          { id: 'logs', label: 'Nhật ký đồng bộ' },
          { id: 'connections', label: 'Hạ tầng kết nối' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-emerald-600 text-emerald-700 bg-white'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Users Table */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Tài khoản</th>
                <th className="px-4 py-3">Họ và tên</th>
                <th className="px-4 py-3">Vai trò</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Chi tiết quyền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {defaultUsers.map((u, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-3 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-800">{u.username}</td>
                  <td className="px-4 py-3 font-semibold text-slate-700">{u.full_name}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => showToast(`Quyền hạn của ${u.username}: Truy cập tầng Gold Marts và xuất báo cáo`, 'info')}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
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

      {/* Roles */}
      {activeTab === 'roles' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {defaultRoles.map((r, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="font-bold text-slate-800 text-xs">{r.role}</h3>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  {r.users_count} người
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2">{r.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Logs */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-100">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Tác nhân</th>
                <th className="px-4 py-3">Hành động</th>
                <th className="px-4 py-3">Trạng thái</th>
                <th className="px-4 py-3 text-right">Thời lượng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(systemLogs.length > 0 ? systemLogs : [
                { time: '28-09 08:40', user: 'data_sync', action: 'Đồng bộ 61 bảng, 1.2M dòng', status: 'Thành công', duration_seconds: 18 },
                { time: '28-09 08:35', user: 'airflow', action: 'Chạy DAG avengers_daily_pipeline', status: 'Thành công', duration_seconds: 142 },
                { time: '28-09 08:20', user: 'kafka_consumer', action: 'Xả buffer 50 events', status: 'Thành công', duration_seconds: 2 },
              ]).map((log, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                  <td className="px-4 py-2.5 text-slate-400 font-mono">{log.time}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-700">{log.user}</td>
                  <td className="px-4 py-2.5 text-slate-600 font-medium">{log.action}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right font-semibold text-slate-700">{log.duration_seconds}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Connections */}
      {activeTab === 'connections' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map((c, idx) => (
            <div key={idx} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-bold text-slate-800 text-xs">{c.name}</span>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  {c.status}
                </span>
              </div>
              <div className="mt-3 space-y-1.5 text-xs text-slate-500">
                <div className="flex justify-between">
                  <span>Địa chỉ:</span>
                  <span className="font-mono text-slate-700">{c.host}:{c.port}</span>
                </div>
                <div className="flex justify-between">
                  <span>Độ trễ:</span>
                  <span className="font-semibold text-emerald-700">{c.latency}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
