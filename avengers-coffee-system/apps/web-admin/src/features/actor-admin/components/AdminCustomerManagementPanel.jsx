import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import SearchableSelect from '../../../components/console/SearchableSelect'
import CurrencyInput from '../../../components/console/CurrencyInput'
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
} from '../../../components/console/WorkspaceIcons'

function CustomerAvatar({ src, name }) {
  const [failedSrc, setFailedSrc] = useState(null)
  return <span className="admin-customer-avatar">
    {src && failedSrc !== src
      ? <img src={src} alt={`Ảnh đại diện của ${name}`} loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
      : <User size={21} aria-label="Chưa có ảnh đại diện" />}
  </span>
}

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
  const [formError, setFormError] = useState('')
  const closeCustomerForm = () => {
    if (savingCustomer) return
    cancelEditCustomer()
    setShowCreateForm(false)
    setFormError('')
  }

  const getCustomerRankBadge = (diem) => {
    const score = Number(diem || 0)
    if (score >= 5000) {
      return (
        <span className="workspace-inline-label"
          style={{
            backgroundColor: "#f7f9fd",
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
          <Award size={15} aria-hidden="true" /> Kim Cương
        </span>
      )
    }
    if (score >= 3000) {
      return (
        <span className="workspace-inline-label"
          style={{
            backgroundColor: "#f7f9fd",
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
          <Award size={15} aria-hidden="true" /> Vàng
        </span>
      )
    }
    if (score >= 1000) {
      return (
        <span className="workspace-inline-label"
          style={{
            backgroundColor: '#f7f9fd',
            color: '#60718a',
            border: '1px solid var(--border-light)',
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
          <Award size={15} aria-hidden="true" /> Bạc
        </span>
      )
    }
    return (
      <span className="workspace-inline-label"
        style={{
          backgroundColor: '#f7f9fd',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-light)',
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
        <Award size={15} aria-hidden="true" /> Thành viên
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
      {/* Form Card: Tạo / Sửa Khách hàng - REDESIGNED LOVELY 2-COLUMN CARD */}
      {isFormActive && (
        <WorkspaceDialog label={editingCustomerId ? 'Chỉnh sửa khách hàng' : 'Thêm khách hàng'} onClose={closeCustomerForm} busy={savingCustomer}>
          {formError && <p className="workspace-form-error" role="alert">{formError}</p>}
        <div
          className="system-admin-card workspace-edit-form admin-surface"
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-light)',
            borderRadius: '10px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden',
            transition: 'all 0.2s ease'
          }}
        >
          {/* Form Header */}
          <div className="workspace-form-heading admin-card-header"
            style={{
              padding: '1rem 1.5rem',
              backgroundColor: '#ffffff',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justify: 'space-between',
              gap: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '6px',
                  backgroundColor: '#f1f5fb',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  flexShrink: 0
                }}
              >
                {editingCustomerId ? <UserCog size={20} /> : <UserPlus size={20} />}
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '500', color: 'var(--text-main)' }}>
                  {editingCustomerId ? `Cập nhật thông tin Khách hàng #${editingCustomerId}` : 'Tạo tài khoản Khách hàng mới'}
                </h2>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {editingCustomerId
                    ? 'Thay đổi thông tin hồ sơ cá nhân và trạng thái hoạt động'
                    : 'Điền đầy đủ thông tin bên dưới để khởi tạo tài khoản mới'}
                </p>
              </div>
            </div>

            <button className="admin-icon-button" type="button" aria-label="Đóng cửa sổ" disabled={savingCustomer}
              onClick={closeCustomerForm}
              style={{
                cursor: 'pointer',
                padding: '0.4rem',
                color: 'var(--text-muted)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                transition: 'all 0.15s ease',
                backgroundColor: '#ffffff',
                border: '1px solid var(--border-light)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                flexShrink: 0
              }}
              title="Đóng form"
            >
              <X size={18} color="var(--text-muted)" />
            </button>
          </div>

          {/* Form Body - Balanced 2-Column Grid */}
          <div style={{ padding: '1.5rem' }}>
            <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {/* Field 1: Username */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="customermanagementpanel-8702" style={{ color: '#3f3f46', fontWeight: '500', fontSize: '0.8125rem' }}>
                  Tên đăng nhập <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input id="customermanagementpanel-8702"
                  type="text"
                  className="shadcn-input ui-input"
                  value={customerForm.ten_dang_nhap || ''}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, ten_dang_nhap: e.target.value }))}
                  placeholder="Nhập username (VD: khachhang01)"
                />
              </div>

              {/* Field 2: Full Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="customermanagementpanel-9389" style={{ color: '#3f3f46', fontWeight: '500', fontSize: '0.8125rem' }}>
                  Họ tên đầy đủ <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input id="customermanagementpanel-9389"
                  type="text"
                  className="shadcn-input ui-input"
                  value={customerForm.ho_ten || ''}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, ho_ten: e.target.value }))}
                  placeholder="Nhập họ và tên (VD: Nguyễn Văn A)"
                />
              </div>

              {/* Field 3: Email */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="customermanagementpanel-10016" style={{ color: '#3f3f46', fontWeight: '500', fontSize: '0.8125rem' }}>
                  Địa chỉ Email
                </label>
                <input id="customermanagementpanel-10016"
                  type="email"
                  className="shadcn-input ui-input"
                  value={customerForm.email || ''}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="nguyenvana@gmail.com"
                />
              </div>

              {/* Field 4: Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="customermanagementpanel-10723" style={{ color: '#3f3f46', fontWeight: '500', fontSize: '0.8125rem' }}>
                  Mật khẩu {editingCustomerId ? '(bỏ trống nếu giữ nguyên)' : <span style={{ color: '#ef4444' }}>*</span>}
                </label>
                <input id="customermanagementpanel-10723"
                  type="password"
                  className="shadcn-input ui-input"
                  value={customerForm.mat_khau || ''}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, mat_khau: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>

              {/* Field 5: Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="customermanagementpanel-11341" style={{ color: '#3f3f46', fontWeight: '500', fontSize: '0.8125rem' }}>
                  Trạng thái tài khoản
                </label>
                <select id="customermanagementpanel-11341"
                  className="shadcn-select"
                  value={customerForm.trang_thai || 'ACTIVE'}
                  onChange={(e) => setCustomerForm((p) => ({ ...p, trang_thai: e.target.value }))}
                >
                  <option value="ACTIVE">ACTIVE - Hoạt động bình thường</option>
                  <option value="INACTIVE">INACTIVE - Tạm khóa tài khoản</option>
                </select>
              </div>

              {/* Field 6 / Info Tip Box */}
              <div
                style={{
                  backgroundColor: '#f1f5fb',
                  border: '1px solid var(--border-light)',
                  borderRadius: '6px',
                  padding: '0.65rem 0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  color: '#3f3f46',
                  fontSize: '0.75rem',
                  minHeight: '38px',
                  alignSelf: 'flex-end',
                  boxSizing: 'border-box'
                }}
              >
                <CheckCircle2 size={16} color="var(--text-muted)" style={{ flexShrink: 0 }} />
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
              backgroundColor: '#ffffff',
              borderTop: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justify: 'flex-end',
              gap: '0.75rem'
            }}
          >
            <button
              type="button"
              className="btn-cancel"
              onClick={closeCustomerForm}
              style={{
                backgroundColor: '#ffffff',
                color: 'var(--text-main)',
                border: '1px solid var(--border-light)',
                height: '38px',
                padding: '0 1.1rem',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease'
              }}
            >
              <X size={15} color="var(--text-main)" />
              <span>Hủy bỏ</span>
            </button>

            <button
              type="button"
              className="btn-save"
              onClick={async () => {
                if (savingCustomer) return
                setFormError('')
                const result = await saveCustomer()
                if (result?.ok === false) { setFormError(result.error); return }
                setShowCreateForm(false)
              }}
              disabled={savingCustomer}
              style={{
                backgroundColor: '#18181b',
                color: '#ffffff',
                border: '1px solid #18181b',
                height: '38px',
                padding: '0 1.35rem',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 1px 2px 0 rgba(0,0,0,0.05)',
                transition: 'all 0.15s ease'
              }}
            >
              <UserCheck size={15} color="#ffffff" />
              <span>{savingCustomer ? 'Đang lưu khách hàng...' : 'Lưu khách hàng'}</span>
            </button>
          </div>
        </div>
        </WorkspaceDialog>
      )}

      {/* Filter & Search Bar */}
      <div className="admin-surface" style={{ backgroundColor: '#ffffff', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', flexGrow: 1 }}>
          <div className="customer-search-box" style={{ position: 'relative', minWidth: '260px', flexGrow: 1, height: '38px', display: 'flex', alignItems: 'center' }}>

            <input className="ui-input"
              style={{
                width: '100%',
                paddingLeft: '38px',
                paddingRight: customerFilters.q ? '34px' : '12px',
                height: '38px',
                minHeight: '38px',
                borderRadius: '6px',
                border: '1px solid var(--border-light)',
                fontSize: '13px',
                backgroundColor: '#ffffff',
                boxSizing: 'border-box'
              }}
              value={customerFilters.q || ''}
              onChange={(e) => setCustomerFilters((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="Tìm theo họ tên, tên đăng nhập, email khách hàng..."
            />
            {customerFilters.q && (
              <button
                type="button"
                className="admin-search-clear-btn"
                onClick={() => setCustomerFilters((prev) => ({ ...prev, q: '' }))}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '0',
                  bottom: '0',
                  margin: 'auto 0',
                  width: '22px',
                  height: '22px',
                  background: 'transparent',
                  backgroundColor: 'transparent',
                  border: 0,
                  borderWidth: 0,
                  outline: 'none',
                  boxShadow: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  borderRadius: '50%',
                  zIndex: 3
                }}
                title="Xóa tìm kiếm"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ minWidth: 200, width: 225, flexShrink: 0 }}>
            <SearchableSelect
              id="customer-status-filter-select"
              value={customerFilters.status || ''}
              onChange={(e) => {
                const val = e?.target?.value ?? e
                setCustomerFilters((prev) => ({ ...prev, status: val }))
              }}
              placeholder="Tất cả trạng thái"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">ACTIVE - Hoạt động</option>
              <option value="INACTIVE">INACTIVE - Tạm khóa</option>
            </SearchableSelect>
          </div>

          <button
            type="button"
            className="btn-save"
            onClick={() => loadCustomers && loadCustomers()}
            style={{ height: '36px' }}
          >
            <RefreshCw size={14} /> Làm mới
          </button>
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
          style={{ height: '36px', padding: '0 1rem' }}
        >
          {isFormActive ? (
            <>
              <X size={15} /> Đóng biểu mẫu
            </>
          ) : (
            <>
              <UserPlus size={15} /> Tạo tài khoản khách hàng
            </>
          )}
        </button>
      </div>

      {customersState.loading ? <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>Đang tải danh sách khách hàng...</p> : null}
      {customersState.error ? <p className="error-text" style={{ margin: 0 }}>{customersState.error}</p> : null}

      {/* Customers Data Table */}
      <div className="system-admin-table-wrap" style={{ overflow: 'visible', maxWidth: '100%', boxSizing: 'border-box' }}>
        <table className="admin-fit-table system-admin-table" style={{ width: '100%', tableLayout: 'fixed', maxWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '22%', whiteSpace: 'nowrap' }}>Khách hàng</th>
              <th style={{ width: '20%', whiteSpace: 'nowrap' }}>Email</th>
              <th style={{ width: '15%', whiteSpace: 'nowrap' }}>Hạng thành viên</th>
              <th style={{ width: '16%', whiteSpace: 'nowrap' }}>Điểm khả dụng</th>
              <th style={{ width: '12%', whiteSpace: 'nowrap' }}>Trạng thái</th>
              <th style={{ width: '15%', textAlign: 'center', whiteSpace: 'nowrap' }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {(customersPageData?.rows || []).length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.65rem' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                      <Search size={22} />
                    </div>
                    <strong style={{ fontSize: '0.925rem', color: 'var(--text-main)', fontWeight: '600' }}>
                      Không tìm thấy khách hàng nào
                    </strong>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', maxWidth: '380px', textAlign: 'center', lineHeight: '1.4' }}>
                      {customerFilters.q
                        ? `Không có khách hàng nào khớp với từ khóa "${customerFilters.q}". Vui lòng kiểm tra lại họ tên, username hoặc email.`
                        : 'Không có dữ liệu khách hàng phù hợp với điều kiện lọc hiện tại.'}
                    </span>
                    {customerFilters.q && (
                      <button
                        type="button"
                        onClick={() => setCustomerFilters && setCustomerFilters((prev) => ({ ...prev, q: '' }))}
                        className="btn-cancel"
                        style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.85rem', marginTop: '0.25rem' }}
                      >
                        Xóa bộ lọc tìm kiếm
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              (customersPageData?.rows || []).map((item, index, array) => {
                const displayName = item.ho_ten || item.ten_dang_nhap || 'Khách hàng'

                return (
                  <tr key={item.ma_nguoi_dung}>
                    <td style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <CustomerAvatar src={item.avatar_url} name={displayName} />
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          <strong style={{ color: 'var(--text-main)', fontSize: '0.8125rem', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }} title={displayName}>
                            {displayName}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{item.ten_dang_nhap}</span>
                        </div>
                      </div>
                    </td>

                    <td style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.8125rem', color: '#414743', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }} title={item.email || ''}>
                        {item.email || '---'}
                      </span>
                    </td>

                    <td style={{ whiteSpace: 'nowrap' }}>{getCustomerRankBadge(item.diem_loyalty)}</td>

                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                        <strong style={{ color: 'var(--primary)', fontSize: '0.8125rem' }}>{fmtNumber(item.diem_kha_dung)} pt khả dụng</strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({fmtNumber(item.diem_loyalty)} pt tích lũy)</span>
                      </div>
                    </td>

                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span className="workspace-inline-label"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.12rem 0.55rem',
                          borderRadius: '9999px',
                          fontSize: '0.72rem',
                          fontWeight: '600',
                          backgroundColor: item.trang_thai === 'ACTIVE' ? "#f7f9fd" : "#f7f9fd",
                          color: item.trang_thai === 'ACTIVE' ? '#2563eb' : '#dc2626',
                          border: item.trang_thai === 'ACTIVE' ? '1px solid #bfdbfe' : '1px solid #fee2e2',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.trang_thai === 'ACTIVE' ? '#3b82f6' : '#ef4444' }}></span>
                        {item.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="admin-table-action-btn btn-edit"
                          onClick={() => startEditCustomer(item)}
                          title="Chỉnh sửa thông tin khách hàng"
                        >
                          <Edit3 size={15} />
                        </button>

                        <button
                          type="button"
                          className="admin-table-action-btn btn-special"
                          onClick={() => startEditCustomerMembership(item)}
                          title="Sửa Hạng thành viên & Điểm thưởng"
                        >
                          <Award size={15} />
                        </button>

                        <button
                          type="button"
                          className="admin-table-action-btn btn-delete"
                          onClick={() => deleteCustomer(item.ma_nguoi_dung)}
                          title="Xóa tài khoản khách hàng"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Pagination Bar */}
        {(() => {
          const pg = Number(customersPageData?.page || 1)
          const sz = Number(customersPageData?.pageSize || 10)
          const tot = Number(customersPageData?.total ?? allItems.length ?? 0)
          const totPages = Number(customersPageData?.totalPages || Math.max(1, Math.ceil(tot / sz)))
          const fromItem = tot === 0 ? 0 : (pg - 1) * sz + 1
          const toItem = Math.min(pg * sz, tot)

          return (
            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #f7f9fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fafafa', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
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
                <span style={{ fontSize: '0.8125rem', color: '#414743', margin: '0 0.5rem', fontWeight: '600' }}>
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
        <WorkspaceDialog label="Cập nhật Membership & Điểm tích lũy" onClose={cancelEditCustomerMembership} busy={savingCustomerMembership}>
          <div className="admin-modal admin-surface" style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '16px', width: '460px', maxWidth: '92vw', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid var(--border-light)' }}>
            <div className="workspace-form-heading" style={{ marginBottom: '1.25rem', paddingBottom: '0.85rem', borderBottom: '1px solid #f7f9fd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Award size={22} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '700', color: 'var(--text-main)' }}>
                  Cập nhật Membership &amp; Điểm tích lũy
                </h3>
              </div>
              <button className="admin-icon-button" aria-label="Đóng"
                type="button"
                onClick={cancelEditCustomerMembership}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
                title="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            {/* Summary info box */}
            <div className="admin-surface" style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '0.85rem 1rem', marginBottom: '1.1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
                <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '50%', backgroundColor: '#f1f5fb', color: 'var(--text-main)', fontWeight: '600', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, border: '1px solid var(--border-light)', flexShrink: 0 }}>
                  <span style={{ display: 'inline-block', lineHeight: 1, margin: 0, padding: 0 }}>
                    {(customerMembershipForm.ho_ten || 'K').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div style={{ overflow: 'hidden' }}>
                  <strong style={{ fontSize: '0.875rem', color: 'var(--text-main)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {customerMembershipForm.ho_ten || 'Khách hàng'}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mã tài khoản: #{editingCustomerMembershipId}</span>
                </div>
              </div>
              <div>{getCustomerRankBadge(customerMembershipForm.diem_loyalty)}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#414743' }}>Điểm Loyalty (Tích lũy xét hạng thành viên)</span>
                <input className="ui-input"
                  type="number"
                  style={{ height: '36px', borderRadius: '6px', border: '1px solid var(--border-light)', padding: '0 0.75rem', fontSize: '0.8125rem' }}
                  value={customerMembershipForm.diem_loyalty || 0}
                  onChange={(e) => setCustomerMembershipForm((prev) => ({ ...prev, diem_loyalty: Number(e.target.value) }))}
                  min="0"
                  placeholder="VD: 1500"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#414743' }}>Điểm khả dụng (Dùng quay thưởng / đổi voucher)</span>
                <input className="ui-input"
                  type="number"
                  style={{ height: '36px', borderRadius: '6px', border: '1px solid var(--border-light)', padding: '0 0.75rem', fontSize: '0.8125rem' }}
                  value={customerMembershipForm.diem_kha_dung || 0}
                  onChange={(e) => setCustomerMembershipForm((prev) => ({ ...prev, diem_kha_dung: Number(e.target.value) }))}
                  min="0"
                  placeholder="VD: 500"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#414743' }}>Tổng chi tiêu tích lũy (VNĐ)</span>
                <CurrencyInput
                  style={{ height: '36px', borderRadius: '6px', border: '1px solid var(--border-light)', padding: '0 0.75rem', fontSize: '0.8125rem' }}
                  value={customerMembershipForm.tong_chi_tieu || 0}
                  onChange={(e) => setCustomerMembershipForm((prev) => ({ ...prev, tong_chi_tieu: Number(e.target.value) }))}
                  placeholder="VD: 2.500.000"
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#414743' }}>Ngày sinh khách hàng</span>
                <input className="ui-input"
                  type="date"
                  style={{ height: '36px', borderRadius: '6px', border: '1px solid var(--border-light)', padding: '0 0.75rem', fontSize: '0.8125rem' }}
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
                  backgroundColor: '#ffffff',
                  color: 'var(--text-main)',
                  border: '1px solid var(--border-light)',
                  height: '38px',
                  padding: '0 1.1rem',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <X size={15} color="var(--text-main)" />
                <span>Hủy bỏ</span>
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
        </WorkspaceDialog>
      )}
    </section>
  )
}
