import React, { useState } from 'react'
import {
  UserCog,
  Search,
  Filter,
  MoreVertical,
  Award,
  X,
  Users,
  Crown,
  ShieldCheck,
  Coins,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  Plus,
  UserCheck,
  Save,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  UserPlus,
  RefreshCw,
  User,
  Mail,
  Lock
} from 'lucide-react'

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
  const [showCreateForm, setShowCreateForm] = useState(false)

  const getCustomerRankBadge = (diem) => {
    const score = Number(diem || 0)
    if (score >= 5000) {
      return (
        <span
          style={{
            backgroundColor: '#f0f9ff',
            color: '#0284c7',
            border: '1px solid #bae6fd',
            padding: '0.25rem 0.6rem',
            borderRadius: '9999px',
            fontSize: '0.72rem',
            fontWeight: '700',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}
        >
          💎 Kim Cương
        </span>
      )
    }
    if (score >= 3000) {
      return (
        <span
          style={{
            backgroundColor: '#fffbeb',
            color: '#d97706',
            border: '1px solid #fde68a',
            padding: '0.25rem 0.6rem',
            borderRadius: '9999px',
            fontSize: '0.72rem',
            fontWeight: '700',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}
        >
          🥇 Vàng
        </span>
      )
    }
    if (score >= 1000) {
      return (
        <span
          style={{
            backgroundColor: '#f8fafc',
            color: '#475569',
            border: '1px solid #cbd5e1',
            padding: '0.25rem 0.6rem',
            borderRadius: '9999px',
            fontSize: '0.72rem',
            fontWeight: '700',
            whiteSpace: 'nowrap',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}
        >
          🥈 Bạc
        </span>
      )
    }
    return (
      <span
        style={{
          backgroundColor: '#f1f5f9',
          color: '#64748b',
          border: '1px solid #e2e8f0',
          padding: '0.25rem 0.6rem',
          borderRadius: '9999px',
          fontSize: '0.72rem',
          fontWeight: '600',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.25rem'
        }}
      >
        🎖️ Thành viên
      </span>
    )
  }

  const isFormActive = Boolean(editingCustomerId || showCreateForm)
  const allItems = customersState.items || []
  const totalCustomersCount = customersPageData.total || allItems.length || 0
  const vipCount = allItems.filter((c) => Number(c.diem_loyalty || 0) >= 3000).length
  const activeCount = allItems.filter((c) => c.trang_thai === 'ACTIVE').length
  const totalLoyaltyPoints = allItems.reduce((acc, curr) => acc + Number(curr.diem_loyalty || 0), 0)

  return (
    <section className="panel system-admin-panel" style={{ padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Main Action Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserCog size={22} color="#4f46e5" /> Quản lý Khách hàng &amp; Thành viên
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
            Quản lý danh sách tài khoản khách hàng, điểm tích lũy Loyalty và xếp hạng thành viên hệ thống
          </p>
        </div>

        <button
          type="button"
          className={isFormActive ? 'btn-cancel' : 'btn-save'}
          onClick={() => {
            if (editingCustomerId) {
              cancelEditCustomer()
              setShowCreateForm(false)
            } else {
              setShowCreateForm((prev) => !prev)
            }
          }}
          style={{ height: '38px', padding: '0 1.1rem' }}
        >
          {isFormActive ? (
            <>
              <X size={16} /> Đóng biểu mẫu
            </>
          ) : (
            <>
              <UserPlus size={16} /> Tạo tài khoản khách hàng
            </>
          )}
        </button>
      </div>

      {/* Modern KPI Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem' }}>
        {/* KPI 1: Total Customers */}
        <div
          className="system-admin-kpi-card"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1rem 1.15rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 2px 4px 0 rgba(0, 0, 0, 0.03)'
          }}
        >
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Users size={22} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.78125rem', color: '#64748b', fontWeight: '500' }}>Tổng số Khách hàng</p>
            <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.35rem', fontWeight: '700', color: '#0f172a' }}>
              {fmtNumber(totalCustomersCount)}
            </h3>
          </div>
        </div>

        {/* KPI 2: VIP Customers */}
        <div
          className="system-admin-kpi-card"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1rem 1.15rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 2px 4px 0 rgba(0, 0, 0, 0.03)'
          }}
        >
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Crown size={22} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.78125rem', color: '#64748b', fontWeight: '500' }}>Khách hàng VIP (Vàng/Kim Cương)</p>
            <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.35rem', fontWeight: '700', color: '#b45309' }}>
              {fmtNumber(vipCount)}
            </h3>
          </div>
        </div>

        {/* KPI 3: Active Accounts */}
        <div
          className="system-admin-kpi-card"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1rem 1.15rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 2px 4px 0 rgba(0, 0, 0, 0.03)'
          }}
        >
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.78125rem', color: '#64748b', fontWeight: '500' }}>Đang hoạt động</p>
            <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.35rem', fontWeight: '700', color: '#059669' }}>
              {fmtNumber(activeCount)}
            </h3>
          </div>
        </div>

        {/* KPI 4: Total Loyalty Points */}
        <div
          className="system-admin-kpi-card"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '1rem 1.15rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: '0 2px 4px 0 rgba(0, 0, 0, 0.03)'
          }}
        >
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', backgroundColor: '#f3e8ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Coins size={22} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '0.78125rem', color: '#64748b', fontWeight: '500' }}>Tổng điểm Loyalty toàn hệ thống</p>
            <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.35rem', fontWeight: '700', color: '#6d28d9' }}>
              {fmtNumber(totalLoyaltyPoints)} pt
            </h3>
          </div>
        </div>
      </div>

      {/* Form Card: Tạo / Sửa Khách hàng - REDESIGNED LOVELY 2-COLUMN CARD */}
      {isFormActive && (
        <div
          className="system-admin-card"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            boxShadow: '0 12px 30px -5px rgba(15, 23, 42, 0.08), 0 4px 6px -2px rgba(0, 0, 0, 0.03)',
            overflow: 'hidden',
            transition: 'all 0.2s ease'
          }}
        >
          {/* Form Header */}
          <div
            style={{
              padding: '1.1rem 1.5rem',
              backgroundColor: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: editingCustomerId ? '#eff6ff' : '#ecfdf5',
                  color: editingCustomerId ? '#2563eb' : '#059669',
                  border: editingCustomerId ? '1px solid #bfdbfe' : '1px solid #a7f3d0',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  flexShrink: 0
                }}
              >
                {editingCustomerId ? <UserCog size={20} /> : <UserPlus size={20} />}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                  {editingCustomerId ? `Cập nhật thông tin Khách hàng #${editingCustomerId}` : 'Tạo tài khoản Khách hàng mới'}
                </h2>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78125rem', color: '#64748b' }}>
                  {editingCustomerId
                    ? 'Thay đổi thông tin hồ sơ cá nhân và trạng thái hoạt động'
                    : 'Điền đầy đủ thông tin bên dưới để khởi tạo tài khoản mới'}
                </p>
              </div>
            </div>

            <div
              onClick={() => {
                if (editingCustomerId) cancelEditCustomer()
                setShowCreateForm(false)
              }}
              style={{
                cursor: 'pointer',
                padding: '0.4rem',
                color: '#64748b',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                transition: 'all 0.15s ease',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                flexShrink: 0
              }}
              title="Đóng form"
            >
              <X size={18} color="#64748b" />
            </div>
          </div>

          {/* Form Body - Balanced 2-Column Grid */}
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {/* Field 1: Username */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                  Tên đăng nhập <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '42px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    padding: '0 0.85rem',
                    gap: '0.65rem'
                  }}
                >
                  <User size={16} color="#64748b" style={{ flexShrink: 0 }} />
                  <input
                    style={{
                      flex: 1,
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      background: 'transparent',
                      padding: 0,
                      fontSize: '0.875rem',
                      color: '#0f172a',
                      boxShadow: 'none'
                    }}
                    value={customerForm.ten_dang_nhap || ''}
                    onChange={(e) => setCustomerForm((p) => ({ ...p, ten_dang_nhap: e.target.value }))}
                    placeholder="Nhập username (VD: khachhang01)"
                  />
                </div>
              </div>

              {/* Field 2: Full Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                  Họ tên đầy đủ <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '42px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    padding: '0 0.85rem',
                    gap: '0.65rem'
                  }}
                >
                  <UserCheck size={16} color="#64748b" style={{ flexShrink: 0 }} />
                  <input
                    style={{
                      flex: 1,
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      background: 'transparent',
                      padding: 0,
                      fontSize: '0.875rem',
                      color: '#0f172a',
                      boxShadow: 'none'
                    }}
                    value={customerForm.ho_ten || ''}
                    onChange={(e) => setCustomerForm((p) => ({ ...p, ho_ten: e.target.value }))}
                    placeholder="Nhập họ và tên (VD: Nguyễn Văn A)"
                  />
                </div>
              </div>

              {/* Field 3: Email */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                  Địa chỉ Email
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '42px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    padding: '0 0.85rem',
                    gap: '0.65rem'
                  }}
                >
                  <Mail size={16} color="#64748b" style={{ flexShrink: 0 }} />
                  <input
                    type="email"
                    style={{
                      flex: 1,
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      background: 'transparent',
                      padding: 0,
                      fontSize: '0.875rem',
                      color: '#0f172a',
                      boxShadow: 'none'
                    }}
                    value={customerForm.email || ''}
                    onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))}
                    placeholder="nguyenvana@gmail.com"
                  />
                </div>
              </div>

              {/* Field 4: Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                  Mật khẩu {editingCustomerId ? '(bỏ trống nếu giữ nguyên)' : <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '42px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    padding: '0 0.85rem',
                    gap: '0.65rem'
                  }}
                >
                  <Lock size={16} color="#64748b" style={{ flexShrink: 0 }} />
                  <input
                    type="password"
                    style={{
                      flex: 1,
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      background: 'transparent',
                      padding: 0,
                      fontSize: '0.875rem',
                      color: '#0f172a',
                      boxShadow: 'none'
                    }}
                    value={customerForm.mat_khau || ''}
                    onChange={(e) => setCustomerForm((p) => ({ ...p, mat_khau: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {/* Field 5: Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                  Trạng thái tài khoản
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    height: '42px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#f8fafc',
                    padding: '0 0.85rem',
                    gap: '0.65rem'
                  }}
                >
                  <ShieldCheck size={16} color="#64748b" style={{ flexShrink: 0 }} />
                  <select
                    style={{
                      flex: 1,
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      outline: 'none',
                      backgroundColor: 'transparent',
                      background: 'transparent',
                      padding: 0,
                      fontSize: '0.875rem',
                      color: '#0f172a',
                      boxShadow: 'none',
                      cursor: 'pointer'
                    }}
                    value={customerForm.trang_thai || 'ACTIVE'}
                    onChange={(e) => setCustomerForm((p) => ({ ...p, trang_thai: e.target.value }))}
                  >
                    <option value="ACTIVE">ACTIVE - Hoạt động bình thường</option>
                    <option value="INACTIVE">INACTIVE - Tạm khóa tài khoản</option>
                  </select>
                </div>
              </div>

              {/* Field 6 / Info Tip Box */}
              <div
                style={{
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '10px',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  color: '#166534',
                  fontSize: '0.8125rem',
                  minHeight: '42px',
                  alignSelf: 'flex-end',
                  boxSizing: 'border-box'
                }}
              >
                <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
                <span>
                  Tài khoản tạo mới sẽ mặc định cấp hạng <strong>Thành viên</strong> và 0 điểm tích lũy.
                </span>
              </div>
            </div>
          </div>

          {/* Form Action Footer */}
          <div
            style={{
              padding: '1rem 1.5rem',
              backgroundColor: '#f8fafc',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justify: 'flex-end',
              gap: '0.75rem'
            }}
          >
            <button
              type="button"
              className="btn-cancel"
              onClick={() => {
                if (editingCustomerId) cancelEditCustomer()
                setShowCreateForm(false)
              }}
              style={{
                backgroundColor: '#fef2f2',
                background: '#fef2f2',
                color: '#dc2626',
                border: '1px solid #fecaca',
                height: '40px',
                padding: '0 1.25rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease'
              }}
            >
              <X size={17} color="#dc2626" />
              <span style={{ color: '#dc2626' }}>Hủy bỏ</span>
            </button>

            <button
              type="button"
              className="btn-save"
              onClick={saveCustomer}
              disabled={savingCustomer}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                height: '40px',
                padding: '0 1.5rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              <UserCheck size={17} color="#ffffff" />
              <span>{savingCustomer ? 'Đang lưu khách hàng...' : 'Lưu khách hàng'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div style={{ backgroundColor: '#ffffff', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flexGrow: 1 }}>
          <div style={{ position: 'relative', minWidth: '260px', flexGrow: 1 }}>
            <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              style={{ width: '100%', paddingLeft: '2.25rem', height: '36px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem' }}
              value={customerFilters.q || ''}
              onChange={(e) => setCustomerFilters((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="Tìm theo họ tên, tên đăng nhập, email khách hàng..."
            />
          </div>

          <select
            style={{ width: '180px', height: '36px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem', padding: '0 0.5rem' }}
            value={customerFilters.status || ''}
            onChange={(e) => setCustomerFilters((prev) => ({ ...prev, status: e.target.value }))}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="ACTIVE">ACTIVE - Hoạt động</option>
            <option value="INACTIVE">INACTIVE - Tạm khóa</option>
          </select>

          <button
            type="button"
            className="btn-save"
            onClick={() => loadCustomers && loadCustomers()}
            style={{ height: '36px' }}
          >
            <RefreshCw size={14} /> Lọc dữ liệu
          </button>
        </div>
      </div>

      {customersState.loading ? <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: 0 }}>Đang tải danh sách khách hàng...</p> : null}
      {customersState.error ? <p className="error-text" style={{ margin: 0 }}>{customersState.error}</p> : null}

      {/* Customers Data Table */}
      <div className="system-admin-table-wrap" style={{ overflow: 'visible', maxWidth: '100%', boxSizing: 'border-box' }}>
        <table className="admin-fit-table system-admin-table" style={{ width: '100%', tableLayout: 'fixed', maxWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '23%', whiteSpace: 'nowrap' }}>Khách hàng</th>
              <th style={{ width: '20%', whiteSpace: 'nowrap' }}>Email</th>
              <th style={{ width: '15%', whiteSpace: 'nowrap' }}>Hạng thành viên</th>
              <th style={{ width: '18%', whiteSpace: 'nowrap' }}>Điểm khả dụng</th>
              <th style={{ width: '12%', whiteSpace: 'nowrap' }}>Trạng thái</th>
              <th style={{ width: '12%', textAlign: 'center', whiteSpace: 'nowrap' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {(customersPageData?.rows || []).map((item, index, array) => {
              const displayName = item.ho_ten || item.ten_dang_nhap || 'Khách hàng'

              return (
                <tr key={item.ma_nguoi_dung}>
                  <td style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div className="admin-avatar-circle">
                        <span>{displayName.charAt(0).toUpperCase()}</span>
                      </div>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <strong style={{ color: '#0f172a', fontSize: '0.8125rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }} title={displayName}>
                          {displayName}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>@{item.ten_dang_nhap}</span>
                      </div>
                    </div>
                  </td>

                  <td style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span style={{ fontSize: '0.8125rem', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }} title={item.email || ''}>
                      {item.email || '---'}
                    </span>
                  </td>

                  <td style={{ whiteSpace: 'nowrap' }}>{getCustomerRankBadge(item.diem_loyalty)}</td>

                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                      <strong style={{ color: '#4f46e5', fontSize: '0.8125rem' }}>{fmtNumber(item.diem_kha_dung)} pt khả dụng</strong>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>({fmtNumber(item.diem_loyalty)} pt tích lũy)</span>
                    </div>
                  </td>

                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.12rem 0.55rem',
                        borderRadius: '9999px',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        backgroundColor: item.trang_thai === 'ACTIVE' ? '#ecfdf5' : '#fef2f2',
                        color: item.trang_thai === 'ACTIVE' ? '#059669' : '#dc2626',
                        border: item.trang_thai === 'ACTIVE' ? '1px solid #a7f3d0' : '1px solid #fee2e2',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.trang_thai === 'ACTIVE' ? '#10b981' : '#ef4444' }}></span>
                      {item.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa'}
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
                          right: 'calc(100% + 6px)',
                          top: index >= (array.length - 2) ? 'auto' : '-4px',
                          bottom: index >= (array.length - 2) ? '-4px' : 'auto',
                          backgroundColor: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                          zIndex: 9999,
                          minWidth: '200px',
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
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', color: '#2563eb', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          onClick={() => {
                            setOpenCustomerActionId(null)
                            startEditCustomer(item)
                          }}
                        >
                          <Edit3 size={14} color="#2563eb" /> Chỉnh sửa thông tin
                        </button>

                        <button
                          type="button"
                          className="btn-dropdown-item"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', color: '#6366f1', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          onClick={() => {
                            setOpenCustomerActionId(null)
                            startEditCustomerMembership(item)
                          }}
                        >
                          <Award size={14} color="#6366f1" /> Sửa Membership &amp; Điểm
                        </button>

                        <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.2rem 0' }}></div>

                        <button
                          type="button"
                          className="btn-dropdown-item danger"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                          onClick={() => {
                            setOpenCustomerActionId(null)
                            deleteCustomer(item.ma_nguoi_dung)
                          }}
                        >
                          <Trash2 size={14} color="#dc2626" /> Xóa tài khoản
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Pagination Bar */}
        {(() => {
          const pg = Number(customersPageData?.page || customersPage || 1)
          const sz = Number(customersPageData?.pageSize || 10)
          const tot = Number(customersPageData?.total || allItems.length || 0)
          const totPages = Number(customersPageData?.totalPages || Math.max(1, Math.ceil(tot / sz)))
          const fromItem = tot === 0 ? 0 : (pg - 1) * sz + 1
          const toItem = Math.min(pg * sz, tot)

          return (
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fafafa', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                Hiển thị {fromItem}-{toItem} trên tổng số {tot} khách hàng
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="btn-icon-more"
                  onClick={() => setCustomersPage && setCustomersPage(1)}
                  disabled={pg <= 1}
                  title="Trang đầu"
                >
                  <ChevronsLeft size={16} />
                </button>
                <button
                  type="button"
                  className="btn-icon-more"
                  onClick={() => setCustomersPage && setCustomersPage(pg - 1)}
                  disabled={pg <= 1}
                  title="Trang trước"
                >
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize: '0.8125rem', color: '#334155', margin: '0 0.5rem', fontWeight: '600' }}>
                  Trang {pg} / {totPages}
                </span>
                <button
                  type="button"
                  className="btn-icon-more"
                  onClick={() => setCustomersPage && setCustomersPage(pg + 1)}
                  disabled={pg >= totPages}
                  title="Trang sau"
                >
                  <ChevronRight size={16} />
                </button>
                <button
                  type="button"
                  className="admin-pg-btn"
                  onClick={() => setCustomersPage && setCustomersPage(totPages)}
                  disabled={pg >= totPages}
                  title="Trang cuối"
                >
                  <ChevronsRight size={16} />
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Modern Modal Sửa Membership & Điểm */}
      {editingCustomerMembershipId && (
        <div className="admin-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="admin-modal" style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '16px', width: '460px', maxWidth: '92vw', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #e2e8f0' }}>
            <div style={{ marginBottom: '1.25rem', paddingBottom: '0.85rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Award size={22} color="#4f46e5" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: '#0f172a' }}>
                  Cập nhật Membership &amp; Điểm tích lũy
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
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem 1rem', marginBottom: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', backgroundColor: '#eef2ff', color: '#4f46e5', fontWeight: '700', fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: '1px solid #c7d2fe', flexShrink: 0 }}>
                  <span style={{ display: 'inline-block', lineHeight: 1, margin: 0, padding: 0 }}>
                    {(customerMembershipForm.ho_ten || 'K').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <strong style={{ fontSize: '0.875rem', color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {customerMembershipForm.ho_ten || 'Khách hàng'}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Mã tài khoản: #{editingCustomerMembershipId}</span>
                </div>
              </div>
              <div>{getCustomerRankBadge(customerMembershipForm.diem_loyalty)}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}>Điểm Loyalty (Tích lũy xét hạng thành viên)</span>
                <input
                  type="number"
                  style={{ height: '36px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 0.75rem', fontSize: '0.8125rem' }}
                  value={customerMembershipForm.diem_loyalty || 0}
                  onChange={(e) => setCustomerMembershipForm((prev) => ({ ...prev, diem_loyalty: Number(e.target.value) }))}
                  min="0"
                  placeholder="VD: 1500"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}>Điểm khả dụng (Dùng quay thưởng / đổi voucher)</span>
                <input
                  type="number"
                  style={{ height: '36px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 0.75rem', fontSize: '0.8125rem' }}
                  value={customerMembershipForm.diem_kha_dung || 0}
                  onChange={(e) => setCustomerMembershipForm((prev) => ({ ...prev, diem_kha_dung: Number(e.target.value) }))}
                  min="0"
                  placeholder="VD: 500"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}>Tổng chi tiêu tích lũy (VNĐ)</span>
                <input
                  type="number"
                  style={{ height: '36px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 0.75rem', fontSize: '0.8125rem' }}
                  value={customerMembershipForm.tong_chi_tieu || 0}
                  onChange={(e) => setCustomerMembershipForm((prev) => ({ ...prev, tong_chi_tieu: Number(e.target.value) }))}
                  min="0"
                  placeholder="VD: 2500000"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}>Ngày sinh khách hàng</span>
                <input
                  type="date"
                  style={{ height: '36px', borderRadius: '6px', border: '1px solid #cbd5e1', padding: '0 0.75rem', fontSize: '0.8125rem' }}
                  value={customerMembershipForm.ngay_sinh || ''}
                  onChange={(e) => setCustomerMembershipForm((prev) => ({ ...prev, ngay_sinh: e.target.value }))}
                />
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.35rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={cancelEditCustomerMembership}
                style={{
                  backgroundColor: '#fef2f2',
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  height: '38px',
                  padding: '0 1.1rem',
                  borderRadius: '8px',
                  fontSize: '0.8125rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <X size={16} color="#dc2626" />
                <span style={{ color: '#dc2626' }}>Hủy bỏ</span>
              </button>

              <button
                type="button"
                className="btn-save"
                onClick={saveCustomerMembership}
                disabled={savingCustomerMembership}
              >
                <Save size={15} />
                {savingCustomerMembership ? 'Đang lưu...' : 'Lưu điểm thành viên'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
