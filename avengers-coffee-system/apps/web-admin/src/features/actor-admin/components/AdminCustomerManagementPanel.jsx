import React, { useState } from 'react'
import { UserCog, Search, Filter, MoreVertical, Award, X } from 'lucide-react'

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

export function AdminCustomerManagementPanel({
  customersState = { loading: false, error: '', items: [] },
  customerForm = {},
  setCustomerForm = () => {},
  editingCustomerId = null,
  startEditCustomer = () => {},
  cancelEditCustomer = () => {},
  saveCustomer = () => {},
  deleteCustomer = () => {},
  savingCustomer = false,
  editingCustomerMembershipId = null,
  customerMembershipForm = {},
  setCustomerMembershipForm = () => {},
  startEditCustomerMembership = () => {},
  cancelEditCustomerMembership = () => {},
  saveCustomerMembership = () => {},
  savingCustomerMembership = false,
  customerFilters = { q: '', status: '' },
  setCustomerFilters = () => {},
  loadCustomers = () => {},
  customersPageData = { rows: [], total: 0, totalPages: 1, page: 1, pageSize: 10 },
  setCustomersPage = () => {}
}) {
  const [openCustomerActionId, setOpenCustomerActionId] = useState(null)

  const getCustomerRankBadge = (diem) => {
    if (diem >= 5000) return <span style={{ backgroundColor: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>💎 Kim Cương</span>;
    if (diem >= 3000) return <span style={{ backgroundColor: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>🥇 Vàng</span>;
    if (diem >= 1000) return <span style={{ backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>🥈 Bạc</span>;
    return <span style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0', padding: '0.2rem 0.55rem', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '600', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>🎖️ Thành viên</span>;
  }

  return (
    <section className="panel system-admin-panel" style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header & KPI Summary Cards */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserCog size={20} color="#4f46e5" /> Quản lý Khách hàng &amp; Thành viên
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
            Quản lý danh sách tài khoản khách hàng, điểm tích lũy Loyalty và xếp hạng thành viên
          </p>
        </div>
      </div>

      {/* Quick KPI Stat Widgets */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="system-admin-kpi-card">
          <p style={{ margin: 0, fontSize: '0.78125rem', color: '#64748b', fontWeight: '500' }}>Tổng số Khách hàng</p>
          <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.375rem', fontWeight: '700', color: '#0f172a' }}>
            {fmtNumber(customersState.items?.length || 0)}
          </h3>
        </div>

        <div className="system-admin-kpi-card">
          <p style={{ margin: 0, fontSize: '0.78125rem', color: '#64748b', fontWeight: '500' }}>Khách hàng VIP (Vàng/Kim Cương)</p>
          <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.375rem', fontWeight: '700', color: '#7c3aed' }}>
            {fmtNumber(customersState.items?.filter(c => (c.diem_loyalty || 0) >= 3000).length || 0)}
          </h3>
        </div>

        <div className="system-admin-kpi-card">
          <p style={{ margin: 0, fontSize: '0.78125rem', color: '#64748b', fontWeight: '500' }}>Tài khoản Đang hoạt động</p>
          <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.375rem', fontWeight: '700', color: '#10b981' }}>
            {fmtNumber(customersState.items?.filter(c => c.trang_thai === 'ACTIVE').length || 0)}
          </h3>
        </div>
      </div>

      {/* Form Card: Tạo / Sửa Khách hàng */}
      <div className="system-admin-card" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderTop: '3px solid #10b981', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.04)' }}>
        <div style={{ marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserCog size={18} color="#059669" />
            <h2 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '700', color: '#0f172a' }}>
              {editingCustomerId ? `Cập nhật thông tin Khách hàng #${editingCustomerId}` : 'Tạo tài khoản Khách hàng mới'}
            </h2>
          </div>
          {editingCustomerId ? (
            <span style={{ fontSize: '0.75rem', color: '#059669', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '600' }}>
              Đang chỉnh sửa profile
            </span>
          ) : null}
        </div>

        <div className="system-admin-form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem 1rem' }}>
          <label>
            <span style={{ color: '#334155', fontWeight: '600', fontSize: '0.78125rem' }}>Username <span style={{ color: '#ef4444' }}>*</span></span>
            <input value={customerForm.ten_dang_nhap || ''} onChange={(e) => setCustomerForm((p) => ({ ...p, ten_dang_nhap: e.target.value }))} placeholder="VD: khachhang01" />
          </label>
          <label>
            <span style={{ color: '#334155', fontWeight: '600', fontSize: '0.78125rem' }}>Họ tên đầy đủ <span style={{ color: '#ef4444' }}>*</span></span>
            <input value={customerForm.ho_ten || ''} onChange={(e) => setCustomerForm((p) => ({ ...p, ho_ten: e.target.value }))} placeholder="VD: Nguyễn Văn A" />
          </label>
          <label>
            <span style={{ color: '#334155', fontWeight: '600', fontSize: '0.78125rem' }}>Email</span>
            <input type="email" value={customerForm.email || ''} onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))} placeholder="nguyenvana@gmail.com" />
          </label>
          <label>
            <span style={{ color: '#334155', fontWeight: '600', fontSize: '0.78125rem' }}>Mật khẩu {editingCustomerId ? '(bỏ trống nếu giữ nguyên)' : <span style={{ color: '#ef4444' }}>*</span>}</span>
            <input type="password" value={customerForm.mat_khau || ''} onChange={(e) => setCustomerForm((p) => ({ ...p, mat_khau: e.target.value }))} placeholder="••••••••" />
          </label>
          <label>
            <span style={{ color: '#334155', fontWeight: '600', fontSize: '0.78125rem' }}>Trạng thái</span>
            <select value={customerForm.trang_thai || 'ACTIVE'} onChange={(e) => setCustomerForm((p) => ({ ...p, trang_thai: e.target.value }))}>
              <option value="ACTIVE">ACTIVE - Hoạt động</option>
              <option value="INACTIVE">INACTIVE - Tạm khóa</option>
            </select>
          </label>
        </div>

        <div className="system-admin-form-actions" style={{ marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="button"
            className="btn-save"
            onClick={saveCustomer}
            disabled={savingCustomer}
            style={{
              backgroundColor: '#ffffff',
              color: '#059669',
              border: '1px solid #059669',
              borderRadius: '6px',
              padding: '0.45rem 1.1rem',
              fontSize: '0.8125rem',
              fontWeight: '600',
              height: '36px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            {savingCustomer ? 'Đang lưu...' : 'Lưu khách hàng'}
          </button>
          {editingCustomerId ? (
            <button
              type="button"
              className="btn-cancel"
              onClick={cancelEditCustomer}
              style={{
                backgroundColor: '#ffffff',
                color: '#dc2626',
                border: '1px solid #dc2626',
                borderRadius: '6px',
                padding: '0.45rem 1.1rem',
                fontSize: '0.8125rem',
                fontWeight: '600',
                height: '36px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              Hủy sửa
            </button>
          ) : null}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={{ backgroundColor: '#ffffff', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flexGrow: 1 }}>
          <div style={{ position: 'relative', minWidth: '260px', flexGrow: 1 }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              style={{ width: '100%', paddingLeft: '2.25rem' }}
              value={customerFilters.q || ''}
              onChange={(e) => setCustomerFilters((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="Tìm theo tên, username, email khách hàng..."
            />
          </div>

          <select style={{ width: '180px' }} value={customerFilters.status || ''} onChange={(e) => setCustomerFilters((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">ACTIVE - Hoạt động</option>
            <option value="INACTIVE">INACTIVE - Tạm khóa</option>
          </select>

          <button type="button" className="secondary" onClick={() => loadCustomers && loadCustomers()} style={{ height: '36px' }}>
            <Filter size={14} /> Lọc dữ liệu
          </button>
        </div>
      </div>

      {customersState.loading ? <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>Đang tải danh sách khách hàng...</p> : null}
      {customersState.error ? <p className="error-text">{customersState.error}</p> : null}

      {/* Customers Data Table */}
      <div className="system-admin-table-wrap">
        <table className="system-admin-table">
          <thead>
            <tr>
              <th style={{ width: '15%', whiteSpace: 'nowrap' }}>Khách hàng</th>
              <th style={{ width: '22%', whiteSpace: 'nowrap' }}>Email</th>
              <th style={{ width: '15%', whiteSpace: 'nowrap' }}>Hạng</th>
              <th style={{ width: '12%', whiteSpace: 'nowrap' }}>Điểm</th>
              <th style={{ width: '12%', whiteSpace: 'nowrap' }}>Chi tiêu</th>
              <th style={{ width: '12%', whiteSpace: 'nowrap' }}>Trạng thái</th>
              <th style={{ width: '12%', textAlign: 'center', whiteSpace: 'nowrap' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {(customersPageData?.rows || []).map((item) => {
              const displayName = item.ho_ten || item.ten_dang_nhap || 'Khách hàng'

              return (
                <tr key={item.ma_nguoi_dung}>
                  <td style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ width: '1.8rem', height: '1.8rem', borderRadius: '50%', backgroundColor: '#eef2ff', color: '#4f46e5', fontWeight: '700', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #c7d2fe', flexShrink: 0 }}>
                        {displayName.charAt(0).toUpperCase()}
                      </div>
                      <strong style={{ color: '#0f172a', fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis' }} title={displayName}>{displayName}</strong>
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ fontSize: '0.8125rem', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }} title={item.email || ''}>{item.email || '---'}</span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{getCustomerRankBadge(item.diem_loyalty)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <strong style={{ color: '#4f46e5', fontSize: '0.8125rem' }}>{fmtNumber(item.diem_kha_dung)} pt</strong>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <strong style={{ color: '#059669', fontSize: '0.8125rem' }}>{fmtNumber(item.tong_chi_tieu)}đ</strong>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.12rem 0.5rem',
                      borderRadius: '999px',
                      fontSize: '0.72rem',
                      fontWeight: '600',
                      backgroundColor: item.trang_thai === 'ACTIVE' ? '#ecfdf5' : '#fef2f2',
                      color: item.trang_thai === 'ACTIVE' ? '#059669' : '#dc2626',
                      border: item.trang_thai === 'ACTIVE' ? '1px solid #a7f3d0' : '1px solid #fee2e2',
                      whiteSpace: 'nowrap'
                    }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.trang_thai === 'ACTIVE' ? '#10b981' : '#ef4444' }}></span>
                      {item.trang_thai}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', position: 'relative', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="btn-icon-more"
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenCustomerActionId(openCustomerActionId === item.ma_nguoi_dung ? null : item.ma_nguoi_dung)
                      }}
                      title="Thao tác"
                    >
                      <MoreVertical size={16} color="#475569" />
                    </button>

                    {openCustomerActionId === item.ma_nguoi_dung && (
                      <div
                        style={{
                          position: 'absolute',
                          right: '0.25rem',
                          top: 'calc(100% + 4px)',
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                          zIndex: 9999,
                          minWidth: '100px',
                          padding: '0.35rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.15rem'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="btn-dropdown-item"
                          onClick={() => {
                            setOpenCustomerActionId(null)
                            startEditCustomer(item)
                          }}
                        >
                          Sửa
                        </button>

                        <button
                          type="button"
                          className="btn-dropdown-item"
                          onClick={() => {
                            setOpenCustomerActionId(null)
                            startEditCustomerMembership(item)
                          }}
                        >
                          Sửa Membership &amp; Điểm
                        </button>

                        <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.2rem 0' }}></div>

                        <button
                          type="button"
                          className="btn-dropdown-item danger"
                          onClick={() => {
                            setOpenCustomerActionId(null)
                            deleteCustomer(item.ma_nguoi_dung)
                          }}
                        >
                          Xóa tài khoản
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fafafa', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Hiển thị {customersPageData.total > 0 ? (customersPageData.page - 1) * customersPageData.pageSize + 1 : 0}-
            {Math.min(customersPageData.page * customersPageData.pageSize, customersPageData.total)} của {customersPageData.total}
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button type="button" className="btn-icon-more" onClick={() => setCustomersPage(1)} disabled={customersPageData.page <= 1} title="Trang đầu">&lt;&lt;</button>
            <button type="button" className="btn-icon-more" onClick={() => setCustomersPage((p) => Math.max(1, p - 1))} disabled={customersPageData.page <= 1} title="Trang trước">&lt;</button>
            <span style={{ fontSize: '0.8125rem', color: '#334155', margin: '0 0.5rem', fontWeight: '500' }}>
              Trang {customersPageData.page} / {customersPageData.totalPages}
            </span>
            <button type="button" className="btn-icon-more" onClick={() => setCustomersPage((p) => Math.min(customersPageData.totalPages, p + 1))} disabled={customersPageData.page >= customersPageData.totalPages} title="Trang sau">&gt;</button>
            <button type="button" className="btn-icon-more" onClick={() => setCustomersPage(customersPageData.totalPages)} disabled={customersPageData.page >= customersPageData.totalPages} title="Trang cuối">&gt;&gt;</button>
          </div>
        </div>
      </div>

      {/* Modern Modal Sửa Membership */}
      {editingCustomerMembershipId && (
        <div className="admin-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="admin-modal" style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '16px', width: '450px', maxWidth: '92vw', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0' }}>
            <div style={{ marginBottom: '1.25rem', paddingBottom: '0.85rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Award size={20} color="#4f46e5" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#0f172a' }}>
                  Cập nhật Membership &amp; Điểm
                </h3>
              </div>
              <button
                type="button"
                onClick={cancelEditCustomerMembership}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            {/* Summary info box */}
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.75rem 1rem', marginBottom: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '2.4rem', height: '2.4rem', borderRadius: '50%', backgroundColor: '#eef2ff', color: '#4f46e5', fontWeight: '700', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #c7d2fe', flexShrink: 0 }}>
                {(customerMembershipForm.ho_ten || 'K').charAt(0).toUpperCase()}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <strong style={{ fontSize: '0.875rem', color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {customerMembershipForm.ho_ten || 'Khách hàng'}
                </strong>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Mã tài khoản: #{editingCustomerMembershipId}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}>Điểm Loyalty (Tích lũy xét hạng)</span>
                <input
                  type="number"
                  value={customerMembershipForm.diem_loyalty || 0}
                  onChange={(e) => setCustomerMembershipForm(prev => ({ ...prev, diem_loyalty: Number(e.target.value) }))}
                  min="0"
                  placeholder="VD: 1500"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}>Điểm khả dụng (Dùng quay thưởng / đổi quà)</span>
                <input
                  type="number"
                  value={customerMembershipForm.diem_kha_dung || 0}
                  onChange={(e) => setCustomerMembershipForm(prev => ({ ...prev, diem_kha_dung: Number(e.target.value) }))}
                  min="0"
                  placeholder="VD: 500"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}>Tổng chi tiêu tích lũy (VNĐ)</span>
                <input
                  type="number"
                  value={customerMembershipForm.tong_chi_tieu || 0}
                  onChange={(e) => setCustomerMembershipForm(prev => ({ ...prev, tong_chi_tieu: Number(e.target.value) }))}
                  min="0"
                  placeholder="VD: 2500000"
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}>Ngày sinh</span>
                <input
                  type="date"
                  value={customerMembershipForm.ngay_sinh || ''}
                  onChange={(e) => setCustomerMembershipForm(prev => ({ ...prev, ngay_sinh: e.target.value }))}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary" onClick={cancelEditCustomerMembership}>
                Hủy
              </button>
              <button type="button" onClick={saveCustomerMembership} disabled={savingCustomerMembership}>
                {savingCustomerMembership ? 'Đang lưu...' : 'Lưu điểm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
