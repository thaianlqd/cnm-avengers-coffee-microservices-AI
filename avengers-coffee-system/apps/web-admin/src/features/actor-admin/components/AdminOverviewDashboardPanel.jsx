import React from 'react'
import { PieChart, TrendingUp, BarChart2, MapPin, Users, Info } from 'lucide-react'

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

export function AdminOverviewDashboardPanel({
  statsState = { loading: false, error: '', data: null },
  dashboardSummary = {},
  roleChartRows = [],
  branchChartRows = []
}) {
  return (
    <section className="panel system-admin-panel" style={{ padding: '2rem', backgroundColor: '#f9fafb', minHeight: '100%', border: 'none' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '0.25rem', color: '#111827' }}>
          Thống kê Người dùng Hệ thống
        </h1>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Dashboard chi tiết theo vai trò, trạng thái và phân bổ chi nhánh.
        </p>
      </div>

      {statsState.loading ? <p>Đang tải thống kê...</p> : null}
      {statsState.error ? <p className="error-text">{statsState.error}</p> : null}

      {!statsState.loading && !statsState.error && statsState.data ? (
        <>
          {/* KPI Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#6b7280', marginBottom: '0.25rem' }}>Tổng tài khoản</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111827' }}>{fmtNumber(dashboardSummary.totalUsers)}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#059669', backgroundColor: '#d1fae5', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>{fmtNumber(dashboardSummary.branchCount)} chi nhánh</span>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#6b7280', marginBottom: '0.25rem' }}>Tỷ lệ hoạt động</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.875rem', fontWeight: '700', color: '#2563eb' }}>{dashboardSummary.activeRate}%</span>
                <TrendingUp size={20} color="#2563eb" />
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#6b7280', marginBottom: '0.25rem' }}>Khối vận hành</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111827' }}>{fmtNumber(dashboardSummary.workforceCount)}</span>
                <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Staff/Mgr</span>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              <p style={{ fontSize: '0.875rem', fontWeight: '500', color: '#6b7280', marginBottom: '0.25rem' }}>Khách hàng</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '1.875rem', fontWeight: '700', color: '#111827' }}>{fmtNumber(dashboardSummary.customerCount)}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: '500', color: '#2563eb', backgroundColor: '#eff6ff', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>Hệ thống</span>
              </div>
            </div>
          </div>

          {/* Charts Row 1 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2rem', marginBottom: '2rem' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              <h3 style={{ fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#111827' }}>
                <PieChart size={20} color="#2563eb" /> Phân bổ Trạng thái
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f9fafb' }}>
                  <div className="circular-progress" style={{ background: `conic-gradient(#2563eb 0% ${dashboardSummary.activeRate}%, #e2e8f0 ${dashboardSummary.activeRate}% 100%)`, marginBottom: '0.75rem' }}>
                    <span style={{ position: 'relative', zIndex: 10, fontSize: '1.25rem', fontWeight: '700', color: '#111827' }}>{dashboardSummary.activeRate}%</span>
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>Hoạt động</span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>{fmtNumber(dashboardSummary.activeUsers)} tài khoản đang hoạt động</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f9fafb' }}>
                  <div className="circular-progress" style={{ background: `conic-gradient(#2563eb 0% ${dashboardSummary.workforceRate}%, #e2e8f0 ${dashboardSummary.workforceRate}% 100%)`, marginBottom: '0.75rem' }}>
                    <span style={{ position: 'relative', zIndex: 10, fontSize: '1.25rem', fontWeight: '700', color: '#111827' }}>{dashboardSummary.workforceRate}%</span>
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#111827' }}>Lực lượng</span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>{fmtNumber(dashboardSummary.workforceCount)} Nhân viên/Quản lý</span>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#111827' }}>
                  <BarChart2 size={20} color="#2563eb" /> Phân bổ Vai trò
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Tổng: {fmtNumber(dashboardSummary.totalUsers)} Tài khoản</span>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {roleChartRows.map((row) => (
                  <div key={row.role} style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '500' }}>
                      <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: '#374151' }}>{row.role}</span>
                      <span style={{ color: '#4b5563' }}>{row.count} ({row.percent}%)</span>
                    </div>
                    <div style={{ width: '100%', backgroundColor: '#f3f4f6', height: '0.5rem', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ backgroundColor: '#2563eb', height: '100%', width: `${Math.min(Math.max(row.percent, 0), 100)}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Charts Row 2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '2rem' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              <h3 style={{ fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#111827' }}>
                <MapPin size={20} color="#2563eb" /> Phân bổ Tài khoản Chi nhánh
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {branchChartRows.map((row) => (
                  <div key={row.code} style={{ display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: '500', color: '#111827' }}>{row.label}</span>
                      <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#6b7280' }}>{row.count} tài khoản</span>
                    </div>
                    <div style={{ width: '100%', backgroundColor: '#f3f4f6', height: '0.75rem', borderRadius: '9999px', overflow: 'hidden' }}>
                      <div style={{ backgroundColor: '#2563eb', height: '100%', borderRadius: '9999px', opacity: row.percentOfMax === 100 ? 1 : (row.percentOfMax > 60 ? 0.8 : (row.percentOfMax > 30 ? 0.6 : 0.4)), width: `${Math.min(Math.max(row.percentOfMax, 0), 100)}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
              <h3 style={{ fontWeight: '700', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#111827' }}>
                <Users size={20} color="#2563eb" /> Phân tích Lực lượng
              </h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
                <div style={{ padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.25rem' }}>Admin</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>{fmtNumber(dashboardSummary.adminCount)}</p>
                </div>
                
                <div style={{ padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.25rem' }}>Manager</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>{fmtNumber(dashboardSummary.managerCount)}</p>
                </div>
                
                <div style={{ padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.25rem' }}>Staff</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827' }}>{fmtNumber(dashboardSummary.staffCount)}</p>
                </div>
                
                <div style={{ padding: '1rem', borderRadius: '0.5rem', backgroundColor: '#f9fafb', border: '1px solid #f3f4f6' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#6b7280', marginBottom: '0.25rem' }}>Customer</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#2563eb' }}>{fmtNumber(dashboardSummary.customerCount)}</p>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: 'rgba(37, 99, 235, 0.05)', borderRadius: '0.5rem', border: '1px solid rgba(37, 99, 235, 0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <Info size={16} color="#2563eb" style={{ marginTop: '0.125rem' }} />
                  <p style={{ fontSize: '0.75rem', lineHeight: '1.6', color: '#4b5563' }}>
                    Tỷ lệ chuyển đổi khách hàng hiện tại chiếm <strong>{dashboardSummary.totalUsers > 0 ? Math.round((dashboardSummary.customerCount / dashboardSummary.totalUsers) * 100) : 0}%</strong> tổng số lượng người dùng. Hãy cân đối bổ sung vai trò Quản lý (Manager) để duy trì tỷ lệ hỗ trợ tốt.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  )
}
