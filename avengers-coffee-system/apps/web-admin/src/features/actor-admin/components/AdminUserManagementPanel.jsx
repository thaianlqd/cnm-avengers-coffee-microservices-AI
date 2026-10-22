import { Check as WorkspaceSymbolCheck } from '../../../components/console/WorkspaceIcons'
import SearchableSelect from '../../../components/console/SearchableSelect'
import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import React, { useState, useRef, useEffect } from 'react'
import SmartSelect from '../../../components/console/SmartSelect'
import {
  UserPlus,
  UsersIcon,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  User,
  UserCheck,
  Mail,
  Lock,
  ShieldCheck,
  Store,
  Activity,
  X,
  Edit3,
  Trash2,
  Check,
  Building,
  UserCog,
  CheckCircle2,
  MoreVertical,
  RefreshCw,
  MapPin,
  ArrowLeft,
  Eye,
  KeyRound,
  Shield,
  Calendar,
  Clock,
  AlertTriangle
} from '../../../components/console/WorkspaceIcons'
import { API_BASE_URL } from '../../admin-dashboard/constants'
import { getAdminAccessToken } from '../../../lib/adminFetch'

function fmtDateTime(value) {
  if (!value) return 'Chưa cập nhật'
  try {
    const d = new Date(value)
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return String(value)
  }
}

function getRoleBadge(role) {
  const map = {
    ADMIN: { label: 'Quản trị HQ', color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
    MANAGER: { label: 'Quản lý cửa hàng', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
    STAFF: { label: 'Nhân viên cửa hàng', color: '#047857', bg: '#ecfdf5', border: '#a7f3d0' },
    FRANCHISEE: { label: 'Đối tác Kiosk', color: '#6d28d9', bg: '#f5f3ff', border: '#ddd6fe' },
    FRANCHISE_STAFF: { label: 'Nhân viên Kiosk', color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
    KIOSK_STAFF: { label: 'Nhân viên Kiosk', color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
    ACCOUNTANT: { label: 'Quản lý nhượng quyền', color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' },
    DATA_ANALYST: { label: 'Phân tích dữ liệu', color: '#0f766e', bg: '#f0fdfa', border: '#99f6e4' },
    CUSTOMER: { label: 'Khách hàng', color: '#475569', bg: '#f8fafc', border: '#e2e8f0' }
  }
  return map[role] || { label: role || 'Nhân sự', color: '#475569', bg: '#f8fafc', border: '#e2e8f0' }
}

function getAvatarProps(user) {
  const name = String(user?.ho_ten || user?.ten_dang_nhap || 'N').trim()
  const letter = (name[0] || 'N').toUpperCase()
  const role = user?.vai_tro
  const badge = getRoleBadge(role)
  return { letter, bg: badge.bg, color: badge.color, border: badge.border }
}

function Pagination({ pageData, onPageChange }) {
  if (!pageData || !pageData.total || pageData.total <= 10) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', fontSize: '0.8125rem', color: 'var(--text-muted)', paddingTop: '0.85rem', marginTop: '0.5rem', borderTop: '1px solid #f7f9fd' }}>
      <span>Hiển thị <strong>{pageData.from || 1} - {pageData.to || pageData.total}</strong> trên tổng số <strong>{pageData.total}</strong> nhân viên</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(1)} disabled={pageData.page <= 1} title="Trang đầu">
          <ChevronsLeft size={16} />
        </button>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.page - 1)} disabled={pageData.page <= 1} title="Trang trước">
          <ChevronLeft size={16} />
        </button>
        <span style={{ margin: '0 0.5rem', fontWeight: '500', color: '#414743', fontSize: '0.8125rem' }}>Trang {pageData.page || 1} / {pageData.totalPages || 1}</span>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.page + 1)} disabled={pageData.page >= pageData.totalPages} title="Trang sau">
          <ChevronRight size={16} />
        </button>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.totalPages)} disabled={pageData.page >= pageData.totalPages} title="Trang cuối">
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  )
}

const SearchableBranchSelect = ({ branches = [], value, onChange }) => <SmartSelect
  label="Tìm chi nhánh làm việc" value={value} onChange={onChange}
  options={[{ value: '', label: 'Chưa gán chi nhánh' }, ...branches.map(branch => ({
    value: branch.code || branch.ma_chi_nhanh,
    label: branch.name || branch.ten_chi_nhanh || branch.code || branch.ma_chi_nhanh,
    keywords: [branch.code, branch.ma_chi_nhanh, branch.thanh_pho].filter(Boolean).join(' '),
  }))]} />


export function AdminUserManagementPanel({
  userForm = {},
  setUserForm = () => {},
  editingUserId = null,
  startEditUser = () => {},
  cancelEditUser = () => {},
  saveUser = () => {},
  deleteUser = () => {},
  savingUser = false,
  branchOptions = [],
  userFilters = { q: '', role: '', branch_code: '' },
  setUserFilters = () => {},
  loadUsers = () => {},
  usersState = { loading: false, error: '', items: [] },
  usersPageData = { rows: [], total: 0, totalPages: 1, page: 1 },
  usersPage = 1,
  setUsersPage = () => {},
  session = null
}) {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const formOpen = isFormOpen || Boolean(editingUserId)
  const formRef = useRef(null)
  const firstInputRef = useRef(null)
  const [selectedCityFilter, setSelectedCityFilter] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)

  // Reset password modal state
  const [resetPasswordModalUser, setResetPasswordModalUser] = useState(null)
  const [newPasswordInput, setNewPasswordInput] = useState('')
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [resetPasswordError, setResetPasswordError] = useState('')

  // Defensive fallbacks
  const safeUserForm = userForm || {}
  const safeUserFilters = userFilters || { q: '', role: '', branch_code: '' }
  const safeUsersState = usersState || { loading: false, error: '', items: [] }
  const safePageData = usersPageData || { rows: [], total: 0, totalPages: 1, page: 1 }
  const safeBranchOptions = (branchOptions || []).filter(b => b && (b.code || b.ma_chi_nhanh))

  const cityList = Array.from(new Set(safeBranchOptions.map(b => b.thanh_pho).filter(Boolean))).sort()

  const filteredBranchOptions = safeBranchOptions.filter(b => {
    if (!selectedCityFilter) return true
    return b.thanh_pho === selectedCityFilter
  })

  const scrollToForm = () => {
    formRef.current?.scrollTo({ top: 0 })
  }

  const handleStartEdit = (user, e) => {
    if (e) e.stopPropagation()
    if (!user) return
    startEditUser(user)
    setSelectedCityFilter('')
    setIsFormOpen(true)
    setTimeout(() => {
      scrollToForm()
      firstInputRef.current?.focus()
    }, 100)
  }

  const handleStartCreateNew = () => {
    cancelEditUser()
    setUserForm({
      ten_dang_nhap: '',
      ho_ten: '',
      email: '',
      mat_khau: '',
      vai_tro: 'STAFF',
      co_so_ma: '',
      trang_thai: 'ACTIVE'
    })
    setSelectedCityFilter('')
    setIsFormOpen(true)
    setTimeout(() => {
      scrollToForm()
      firstInputRef.current?.focus()
    }, 100)
  }

  const handleCloseForm = () => {
    if (savingUser) return
    setFormError('')
    cancelEditUser()
    setIsFormOpen(false)
  }

  const handleSaveUser = async (e) => {
    if (e) e.preventDefault()
    const success = await saveUser()
    if (success?.ok === false) { setFormError(success.error); return }
    if (success !== false && success?.ok !== false) {
      setIsFormOpen(false)
      if (selectedUser && editingUserId) {
        // Refresh selected user
        setSelectedUser((prev) => prev ? {
          ...prev,
          ho_ten: safeUserForm.ho_ten || prev.ho_ten,
          email: safeUserForm.email ?? prev.email,
          vai_tro: safeUserForm.vai_tro || prev.vai_tro,
          co_so_ma: safeUserForm.co_so_ma ?? prev.co_so_ma,
          trang_thai: safeUserForm.trang_thai || prev.trang_thai,
          ngay_cap_nhat: new Date().toISOString()
        } : null)
      }
    }
  }

  const [formError, setFormError] = useState('')

  // Quick reset password handlers
  const handleOpenResetPassword = (user, e) => {
    if (e) e.stopPropagation()
    setResetPasswordModalUser(user)
    setNewPasswordInput('')
    setResetPasswordError('')
  }

  const handleCloseResetPassword = () => {
    if (isResettingPassword) return
    setResetPasswordModalUser(null)
    setNewPasswordInput('')
    setResetPasswordError('')
  }

  const handleGenerateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*'
    let pwd = ''
    for (let i = 0; i < 10; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setNewPasswordInput(pwd)
  }

  const handleResetPasswordSubmit = async (e) => {
    if (e) e.preventDefault()
    if (!newPasswordInput || newPasswordInput.trim().length < 6) {
      setResetPasswordError('Mật khẩu mới phải có tối thiểu 6 ký tự.')
      return
    }
    setIsResettingPassword(true)
    setResetPasswordError('')
    const token = getAdminAccessToken() || session?.token
    const targetUser = resetPasswordModalUser
    const userId = targetUser?.ma_nguoi_dung || targetUser?.id
    try {
      const response = await fetch(`${API_BASE_URL}/users/admin/accounts/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ mat_khau: newPasswordInput.trim() })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || 'Không thể đặt lại mật khẩu')
      alert(`Đã đặt lại mật khẩu cho nhân viên ${targetUser.ho_ten || targetUser.ten_dang_nhap} thành công!`)
      if (selectedUser && (selectedUser.ma_nguoi_dung === userId || selectedUser.id === userId)) {
        setSelectedUser((prev) => prev ? { ...prev, ngay_cap_nhat: new Date().toISOString() } : null)
      }
      handleCloseResetPassword()
      loadUsers()
    } catch (err) {
      setResetPasswordError(err.message || 'Lỗi đặt lại mật khẩu')
    } finally {
      setIsResettingPassword(false)
    }
  }

  // Toggle user active / inactive status
  const handleToggleUserStatus = async (user, e) => {
    if (e) e.stopPropagation()
    const current = user?.trang_thai === 'ACTIVE'
    const nextStatus = current ? 'INACTIVE' : 'ACTIVE'
    const actionText = current ? 'tạm khóa' : 'kích hoạt'
    if (!window.confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản của nhân viên ${user.ho_ten || user.ten_dang_nhap}?`)) return

    const token = getAdminAccessToken() || session?.token
    const userId = user?.ma_nguoi_dung || user?.id
    try {
      const response = await fetch(`${API_BASE_URL}/users/admin/accounts/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ trang_thai: nextStatus })
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result?.message || `Không thể ${actionText} tài khoản`)
      alert(`Đã ${actionText} tài khoản thành công!`)
      if (selectedUser && (selectedUser.ma_nguoi_dung === userId || selectedUser.id === userId)) {
        setSelectedUser((prev) => prev ? { ...prev, trang_thai: nextStatus, ngay_cap_nhat: new Date().toISOString() } : null)
      }
      loadUsers()
    } catch (err) {
      alert(`Lỗi: ${err.message}`)
    }
  }

  return (
    <section className="panel system-admin-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* USER EDIT / CREATE FORM CARD - ONLY SHOWN WHEN ADDING OR EDITING */}
      {formOpen && (
        <WorkspaceDialog label={editingUserId ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản'} onClose={handleCloseForm} busy={savingUser}>
          {formError && <p className="workspace-form-error" role="alert">{formError}</p>}
        <div
          ref={formRef}
          className="system-admin-card admin-surface"
          aria-label={editingUserId ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản'}
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-light)',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            transition: 'all 0.25s ease'
          }}
        >
          {/* Form Header */}
          <div className="admin-card-header" style={{ padding: '1.1rem 1.5rem', backgroundColor: '#ffffff', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTopLeftRadius: '11px', borderTopRightRadius: '11px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="admin-icon-tile" style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#f1f5fb', color: 'var(--text-main)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {editingUserId ? <Edit3 size={19} /> : <UserPlus size={19} />}
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '500', color: 'var(--text-main)' }}>
                {editingUserId ? 'Chỉnh sửa thông tin nhân viên' : 'Thêm nhân viên mới'}
              </h3>
            </div>

            <button className="admin-icon-button" aria-label="Đóng form"
              type="button"
              onClick={handleCloseForm}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: '#ffffff',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease'
              }}
              title="Đóng form"
            >
              <X size={16} />
            </button>
          </div>

          {/* Form Body - 2 Column Balanced Grid */}
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>

              {/* Field: Username */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label htmlFor="usermanagementpanel-8845" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Tên đăng nhập (Username) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input id="usermanagementpanel-8845"
                  ref={firstInputRef}
                  type="text"
                  className="shadcn-input ui-input"
                  value={safeUserForm.ten_dang_nhap || ''}
                  onChange={(e) => setUserForm((p) => ({ ...p, ten_dang_nhap: e.target.value }))}
                  placeholder="Nhập tên đăng nhập"
                />
              </div>

              {/* Field: Full Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label htmlFor="usermanagementpanel-9580" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Họ và tên nhân viên <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input id="usermanagementpanel-9580"
                  type="text"
                  className="shadcn-input ui-input"
                  value={safeUserForm.ho_ten || ''}
                  onChange={(e) => setUserForm((p) => ({ ...p, ho_ten: e.target.value }))}
                  placeholder="Nhập họ và tên đầy đủ"
                />
              </div>

              {/* Field: Email */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label htmlFor="usermanagementpanel-10212" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Địa chỉ email
                </label>
                <input id="usermanagementpanel-10212"
                  type="email"
                  className="shadcn-input ui-input"
                  value={safeUserForm.email || ''}
                  onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="email@avengerscoffee.com"
                />
              </div>

              {/* Field: Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label htmlFor="usermanagementpanel-10895" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  {editingUserId ? 'Đặt lại mật khẩu (để trống nếu giữ nguyên)' : 'Mật khẩu khởi tạo *'}
                </label>
                <input id="usermanagementpanel-10895"
                  type="password"
                  className="shadcn-input ui-input"
                  value={safeUserForm.mat_khau || ''}
                  onChange={(e) => setUserForm((p) => ({ ...p, mat_khau: e.target.value }))}
                  placeholder={editingUserId ? 'Nhập mật khẩu mới nếu muốn đặt lại...' : '••••••••'}
                />
              </div>

              {/* Field: Role */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label htmlFor="usermanagementpanel-11570" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Phân quyền vai trò <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <select id="usermanagementpanel-11570"
                  className="shadcn-select"
                  value={safeUserForm.vai_tro || 'STAFF'}
                  onChange={(e) => setUserForm((p) => ({ ...p, vai_tro: e.target.value }))}
                >
                  <option value="STAFF">Nhân viên cửa hàng chính thức (Staff)</option>
                  <option value="MANAGER">Quản lý cửa hàng (Manager)</option>
                  <option value="FRANCHISEE">Đối tác nhượng quyền Kiosk (Franchisee)</option>
                  <option value="FRANCHISE_STAFF">Nhân viên Kiosk nhượng quyền</option>
                  <option value="ACCOUNTANT">Quản lý nhượng quyền</option>
                  <option value="ADMIN">Quản trị viên hệ thống (Admin)</option>
                </select>
              </div>

              {/* Field: Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label htmlFor="usermanagementpanel-12662" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Trạng thái tài khoản
                </label>
                <select id="usermanagementpanel-12662"
                  className="shadcn-select"
                  value={safeUserForm.trang_thai || 'ACTIVE'}
                  onChange={(e) => setUserForm((p) => ({ ...p, trang_thai: e.target.value }))}
                >
                  <option value="ACTIVE">Hoạt động</option>
                  <option value="INACTIVE">Tạm khóa tài khoản</option>
                </select>
              </div>

              {/* Field: City Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label htmlFor="usermanagementpanel-13393" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Lọc theo thành phố
                </label>
                <SearchableSelect id="usermanagementpanel-13393"
                  className="shadcn-select"
                  value={selectedCityFilter}
                  onChange={e => {
                    setSelectedCityFilter(e.target.value);
                    setUserForm((p) => ({ ...p, co_so_ma: '' }));
                  }}
                >
                  <option value="">-- Tất cả thành phố --</option>
                  {cityList.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </SearchableSelect>
              </div>

              {/* Field: Branch */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Chi nhánh làm việc
                </label>
                <SearchableBranchSelect
                  branches={filteredBranchOptions}
                  value={safeUserForm.co_so_ma || ''}
                  onChange={(val) => setUserForm((p) => ({ ...p, co_so_ma: val }))}
                />
              </div>

            </div>

            {/* Form Footer Actions */}
            <div className="admin-editor-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e4df', paddingTop: '1.25rem' }}>
              <button
                type="button"
                onClick={handleCloseForm}
                className="btn-cancel" style={{ height: '38px', padding: '0 1.25rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <X size={15} /> Hủy bỏ
              </button>

              <button
                type="button"
                className="btn-save"
                onClick={handleSaveUser}
                disabled={savingUser}
                style={{ height: '38px', padding: '0 1.35rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <CheckCircle2 size={17} color="#ffffff" />
                <span>{savingUser ? 'Đang lưu tài khoản...' : (editingUserId ? 'Cập nhật tài khoản' : 'Lưu thông tin tài khoản')}</span>
              </button>
            </div>
          </div>
        </div>
        </WorkspaceDialog>
      )}

      {selectedUser ? (
        /* =========================================================================
           EMPLOYEE DETAIL VIEW (Single Unified View with Faint Vertical Dividers)
           ========================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Top Navigation & Breadcrumbs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setSelectedUser(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 0.95rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#1e293b',
                fontWeight: '600',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease'
              }}
            >
              <ArrowLeft size={16} /> Quay lại danh sách nhân viên
            </button>

            <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              <span>Danh sách nhân viên</span> <span style={{ margin: '0 0.35rem' }}>/</span> <strong style={{ color: '#0f172a' }}>{selectedUser.ho_ten || selectedUser.ten_dang_nhap}</strong>
            </div>
          </div>

          {/* UNIFIED DETAIL CARD */}
          <div
            className="admin-surface user-detail-unified-section"
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.05), 0 1px 4px -1px rgba(15, 23, 42, 0.03)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header Banner with Profile Summary & Action Buttons */}
            <div
              style={{
                padding: '1rem 1.5rem',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem',
                background: '#f8fafc'
              }}
            >
              {/* Profile Identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', minWidth: 0 }}>
                {(() => {
                  const av = getAvatarProps(selectedUser)
                  return (
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        backgroundColor: av.bg,
                        color: av.color,
                        border: `1.5px solid ${av.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '600',
                        fontSize: '1rem',
                        flexShrink: 0
                      }}
                    >
                      {av.letter}
                    </div>
                  )
                })()}

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#0f172a', letterSpacing: '-0.01em' }}>
                      {selectedUser.ho_ten || 'Chưa cập nhật họ tên'}
                    </h2>
                    {(() => {
                      const b = getRoleBadge(selectedUser.vai_tro)
                      return (
                        <span
                          style={{
                            padding: '0.15rem 0.55rem',
                            borderRadius: '9999px',
                            fontSize: '0.72rem',
                            fontWeight: '500',
                            backgroundColor: b.bg,
                            color: b.color,
                            border: `1px solid ${b.border}`
                          }}
                        >
                          {b.label}
                        </span>
                      )
                    })()}

                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.15rem 0.55rem',
                        borderRadius: '9999px',
                        fontSize: '0.72rem',
                        fontWeight: '500',
                        backgroundColor: selectedUser.trang_thai === 'ACTIVE' ? '#f0fdf4' : '#fef2f2',
                        color: selectedUser.trang_thai === 'ACTIVE' ? '#15803d' : '#b91c1c',
                        border: `1px solid ${selectedUser.trang_thai === 'ACTIVE' ? '#bbf7d0' : '#fecaca'}`
                      }}
                    >
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: selectedUser.trang_thai === 'ACTIVE' ? '#16a34a' : '#dc2626' }}></span>
                      {selectedUser.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <div>
                      <span>Tài khoản: </span>
                      <strong style={{ color: '#0f172a', fontFamily: 'monospace', fontWeight: '500' }}>@{selectedUser.ten_dang_nhap}</strong>
                    </div>
                    <div>
                      <span>Mã ID: </span>
                      <strong style={{ color: '#475569', fontFamily: 'monospace', fontWeight: '500', wordBreak: 'break-all' }}>{selectedUser.ma_nguoi_dung || selectedUser.id}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Action Toolbar (Dời sang bên phải) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginLeft: 'auto', flexShrink: 0 }}>
                {/* Đặt lại mật khẩu */}
                <button
                  type="button"
                  onClick={(e) => handleOpenResetPassword(selectedUser, e)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    height: '34px',
                    padding: '0 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#1e293b',
                    fontWeight: '500',
                    fontSize: '0.78125rem',
                    cursor: 'pointer',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                    transition: 'all 0.15s ease'
                  }}
                  title="Đặt lại mật khẩu cho nhân viên này"
                >
                  <KeyRound size={14} color="#ea580c" /> Đặt lại mật khẩu
                </button>

                {/* Chỉnh sửa */}
                <button
                  type="button"
                  onClick={() => handleStartEdit(selectedUser)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    height: '34px',
                    padding: '0 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #bfdbfe',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    fontWeight: '500',
                    fontSize: '0.78125rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  title="Chỉnh sửa thông tin nhân viên"
                >
                  <Edit3 size={14} /> Chỉnh sửa
                </button>

                {/* Khóa / Mở khóa */}
                <button
                  type="button"
                  onClick={(e) => handleToggleUserStatus(selectedUser, e)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    height: '34px',
                    padding: '0 0.85rem',
                    borderRadius: '8px',
                    border: selectedUser.trang_thai === 'ACTIVE' ? '1px solid #fed7aa' : '1px solid #bbf7d0',
                    background: selectedUser.trang_thai === 'ACTIVE' ? '#fff7ed' : '#f0fdf4',
                    color: selectedUser.trang_thai === 'ACTIVE' ? '#c2410c' : '#15803d',
                    fontWeight: '500',
                    fontSize: '0.78125rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <ShieldCheck size={14} /> {selectedUser.trang_thai === 'ACTIVE' ? 'Tạm khóa tài khoản' : 'Kích hoạt tài khoản'}
                </button>

                {/* Xóa */}
                <button
                  type="button"
                  disabled={selectedUser.vai_tro === 'ADMIN'}
                  onClick={() => {
                    if (selectedUser.vai_tro === 'ADMIN') return
                    deleteUser(selectedUser.ma_nguoi_dung || selectedUser.id)
                    setSelectedUser(null)
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    height: '34px',
                    padding: '0 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontWeight: '500',
                    fontSize: '0.78125rem',
                    cursor: selectedUser.vai_tro === 'ADMIN' ? 'not-allowed' : 'pointer',
                    opacity: selectedUser.vai_tro === 'ADMIN' ? 0.4 : 1,
                    transition: 'all 0.15s ease'
                  }}
                  title={selectedUser.vai_tro === 'ADMIN' ? 'Không thể xóa tài khoản Quản trị viên' : 'Xóa tài khoản nhân viên'}
                >
                  <Trash2 size={14} /> Xóa
                </button>
              </div>
            </div>

            {/* 3-Column Info Matrix with Faint Vertical Dividers */}
            <div
              className="admin-detail-matrix"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                background: '#ffffff',
                padding: '1.25rem 1.5rem',
                gap: '0'
              }}
            >
              {/* Column 1: Định danh & Tài khoản */}
              <div
                className="admin-detail-col col-1"
                style={{
                  paddingRight: '1.5rem',
                  borderRight: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem'
                }}
              >
                <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                  <User size={15} color="#2563eb" /> Định danh &amp; Tài khoản
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Họ và tên đầy đủ</span>
                    <span style={{ fontWeight: '500', color: '#0f172a', fontSize: '0.8125rem', display: 'block' }}>{selectedUser.ho_ten || '---'}</span>
                  </div>

                  <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Tên đăng nhập hệ thống</span>
                    <span style={{ fontWeight: '500', color: '#1d4ed8', fontFamily: 'monospace', fontSize: '0.8125rem', display: 'block' }}>@{selectedUser.ten_dang_nhap}</span>
                  </div>

                  <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Vai trò hệ thống</span>
                    <div style={{ marginTop: '0.1rem' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '500',
                          backgroundColor: getRoleBadge(selectedUser.vai_tro).bg,
                          color: getRoleBadge(selectedUser.vai_tro).color,
                          border: `1px solid ${getRoleBadge(selectedUser.vai_tro).border}`
                        }}
                      >
                        {getRoleBadge(selectedUser.vai_tro).label}
                      </span>
                    </div>
                  </div>

                  <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Mã định danh (ID)</span>
                    <span style={{ fontWeight: '500', color: '#334155', fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all', display: 'block' }}>
                      {selectedUser.ma_nguoi_dung || selectedUser.id || '---'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.55rem' }}>
                    <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Ngày khởi tạo</span>
                      <span style={{ fontWeight: '500', color: '#334155', fontSize: '0.75rem', display: 'block' }}>{fmtDateTime(selectedUser.ngay_tao)}</span>
                    </div>
                    <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Cập nhật gần nhất</span>
                      <span style={{ fontWeight: '500', color: '#334155', fontSize: '0.75rem', display: 'block' }}>{fmtDateTime(selectedUser.ngay_cap_nhat)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 2: Cơ sở & Nơi làm việc */}
              <div
                className="admin-detail-col col-2"
                style={{
                  paddingLeft: '1.5rem',
                  paddingRight: '1.5rem',
                  borderRight: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem'
                }}
              >
                <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                  <Store size={15} color="#059669" /> Cơ sở &amp; Nơi làm việc
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Chi nhánh làm việc</span>
                    <span style={{ fontWeight: '500', color: '#0f172a', fontSize: '0.8125rem', lineHeight: '1.4', display: 'block' }}>
                      {selectedUser.co_so_ten || 'Tất cả chi nhánh (Toàn hệ thống)'}
                    </span>
                  </div>

                  <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Mã cơ sở</span>
                    <span style={{ fontWeight: '500', color: '#334155', fontFamily: 'monospace', fontSize: '0.8125rem', display: 'block' }}>
                      {selectedUser.co_so_ma || 'ALL'}
                    </span>
                  </div>

                  <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Quyền hạn truy cập</span>
                    <span style={{ fontWeight: '500', color: '#0f172a', fontSize: '0.8125rem', display: 'block' }}>
                      {selectedUser.vai_tro === 'ADMIN' ? 'Toàn quyền Quản trị hệ thống (HQ)' : 'Phân quyền theo phạm vi chi nhánh'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Column 3: Bảo mật & Mật khẩu */}
              <div
                className="admin-detail-col col-3"
                style={{
                  paddingLeft: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem'
                }}
              >
                <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                  <ShieldCheck size={15} color="#7c3aed" /> Bảo mật &amp; Đăng nhập
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Email nhận thông báo &amp; OTP</span>
                    <span style={{ fontWeight: '500', color: selectedUser.email ? '#0f172a' : '#94a3b8', fontSize: '0.8125rem', wordBreak: 'break-all', display: 'block', fontStyle: selectedUser.email ? 'normal' : 'italic' }}>
                      {selectedUser.email || 'Chưa cập nhật email'}
                    </span>
                  </div>

                  <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Mật khẩu tài khoản</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: '500', color: '#475569', letterSpacing: '0.2em', fontSize: '0.85rem', display: 'block' }}>
                      ••••••••
                    </span>
                  </div>

                  <div style={{ padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '500', display: 'block', marginBottom: '0.2rem' }}>Trạng thái tài khoản</span>
                    <div style={{ marginTop: '0.1rem' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          fontSize: '0.78125rem',
                          fontWeight: '500',
                          color: selectedUser.trang_thai === 'ACTIVE' ? '#15803d' : '#dc2626'
                        }}
                      >
                        {selectedUser.trang_thai === 'ACTIVE' ? <CheckCircle2 size={14} /> : <X size={14} />}
                        {selectedUser.trang_thai === 'ACTIVE' ? 'Cho phép đăng nhập bình thường' : 'Tài khoản đang bị tạm khóa'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* USER DATA TABLE CARD */
        <div className="admin-surface admin-users-directory" style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--border-light)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {/* Table Header: Title on Left, Add Button on Right */}
          <div className="admin-card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              <UsersIcon size={18} color="var(--text-muted)" /> Danh sách nhân viên hệ thống
            </h2>

            <button
              type="button"
              className="btn-save"
              onClick={handleStartCreateNew}
              style={{ height: '36px', padding: '0 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', fontSize: '0.8125rem', borderRadius: '6px' }}
            >
              <UserPlus size={16} color="#ffffff" />
              <span>Thêm nhân viên</span>
            </button>
          </div>

          {/* Filters Toolbar Row */}
          <div
            style={{
              padding: '0.85rem 1.25rem',
              borderBottom: '1px solid var(--border-light)',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'center',
              backgroundColor: '#ffffff',
              flexWrap: 'wrap'
            }}
          >
            {/* Keyword Search with search icon locked inside */}
            <div
              style={{
                position: 'relative',
                flex: '1 1 200px',
                minWidth: '175px',
                maxWidth: '300px'
              }}
            >
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: '11px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted, #94a3b8)',
                  pointerEvents: 'none',
                  zIndex: 2
                }}
              />
              <input
                style={{
                  width: '100%',
                  height: '38px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light, #cbd5e1)',
                  backgroundColor: '#ffffff',
                  paddingLeft: '34px',
                  paddingRight: safeUserFilters.q ? '32px' : '12px',
                  fontSize: '0.8125rem',
                  color: 'var(--text-main, #0f172a)',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                placeholder="Tìm username, họ tên..."
                value={safeUserFilters.q || ''}
                onChange={(e) => setUserFilters((prev) => ({ ...prev, q: e.target.value }))}
              />
              {safeUserFilters.q && (
                <button
                  type="button"
                  onClick={() => setUserFilters((prev) => ({ ...prev, q: '' }))}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted, #94a3b8)',
                    zIndex: 2
                  }}
                  title="Xóa tìm kiếm"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Role Filter */}
            <div style={{ flex: '1 1 180px', minWidth: '175px', maxWidth: '240px' }}>
              <SearchableSelect
                id="user-role-filter-select"
                value={safeUserFilters.role || ''}
                onChange={(e) => {
                  const val = e?.target?.value ?? e
                  setUserFilters((prev) => ({ ...prev, role: val }))
                }}
                placeholder="Tất cả vai trò"
                style={{ height: '38px', minHeight: '38px' }}
              >
                <option value="">Tất cả vai trò</option>
                <option value="ADMIN">Quản trị viên HQ</option>
                <option value="MANAGER">Quản lý cửa hàng</option>
                <option value="STAFF">Nhân viên cửa hàng</option>
                <option value="FRANCHISEE">Đối tác Kiosk</option>
                <option value="FRANCHISE_STAFF">Nhân viên Kiosk</option>
                <option value="ACCOUNTANT">Quản lý nhượng quyền</option>
              </SearchableSelect>
            </div>

            {/* Branch Filter */}
            <div style={{ flex: '1 1 240px', minWidth: '200px', maxWidth: '340px' }}>
              <SearchableSelect
                id="user-branch-filter-select"
                value={safeUserFilters.branch_code || ''}
                onChange={(e) => {
                  const val = e?.target?.value ?? e
                  setUserFilters((prev) => ({ ...prev, branch_code: val }))
                }}
                placeholder="Tất cả chi nhánh"
                style={{ height: '38px', minHeight: '38px' }}
              >
                <option value="">Tất cả chi nhánh</option>
                {safeBranchOptions.map((branch) => (
                  <option key={branch.code || branch.ma_chi_nhanh} value={branch.code || branch.ma_chi_nhanh}>
                    {branch.name || branch.ten_chi_nhanh}
                  </option>
                ))}
              </SearchableSelect>
            </div>

            {/* Refresh Action Button */}
            <button
              className="admin-button-secondary"
              type="button"
              onClick={() => loadUsers && loadUsers()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                height: '38px',
                padding: '0 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                backgroundColor: '#ffffff',
                fontSize: '0.8125rem',
                color: '#3f3f46',
                cursor: 'pointer',
                fontWeight: '500',
                flexShrink: 0,
                marginLeft: 'auto'
              }}
            >
              <RefreshCw size={14} color="var(--text-muted)" /> Làm mới
            </button>
          </div>

          {/* EMPLOYEE TABLE VIEW */}
          {safeUsersState.loading ? (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Đang tải danh sách nhân viên...</div>
            ) : safeUsersState.error ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#ef4444', fontWeight: '500' }}>{safeUsersState.error}</div>
            ) : (
              <div className="admin-table-scroll" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                      <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#1e293b', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '25%' }}>Họ tên &amp; tài khoản</th>
                      <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#1e293b', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '22%' }}>Email liên hệ</th>
                      <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#1e293b', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '15%' }}>Vai trò</th>
                      <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#1e293b', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '12%' }}>Trạng thái</th>
                      <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#1e293b', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '16%' }}>Chi nhánh gán</th>
                      <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#1e293b', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '10%', textAlign: 'center' }}>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(safePageData.rows || []).filter(Boolean).length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.65rem' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                              <Search size={22} />
                            </div>
                            <strong style={{ fontSize: '0.925rem', color: 'var(--text-main)', fontWeight: '600' }}>
                              Không tìm thấy nhân viên nào
                            </strong>
                            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', maxWidth: '380px', textAlign: 'center', lineHeight: '1.4' }}>
                              {safeUserFilters.q
                                ? `Không có nhân viên nào khớp với từ khóa "${safeUserFilters.q}". Vui lòng kiểm tra lại.`
                                : 'Không có dữ liệu nhân viên phù hợp với bộ lọc hiện tại.'}
                            </span>
                            {safeUserFilters.q && (
                              <button
                                type="button"
                                onClick={() => setUserFilters && setUserFilters((prev) => ({ ...prev, q: '' }))}
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
                      (safePageData.rows || []).filter(Boolean).map((item, index) => {
                        const av = getAvatarProps(item)
                        const roleBadge = getRoleBadge(item?.vai_tro)
                        const itemId = item?.ma_nguoi_dung || item?.id || index

                        return (
                          <tr
                            key={itemId}
                            className="user-table-row"
                            onClick={() => setSelectedUser(item)}
                            style={{
                              borderBottom: '1px solid #f1f5f9',
                              transition: 'background-color 0.15s ease',
                              cursor: 'pointer'
                            }}
                          >
                            {/* Name & Avatar & Username */}
                            <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <div
                                  style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '50%',
                                    backgroundColor: av.bg,
                                    color: av.color,
                                    border: `1px solid ${av.border}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '700',
                                    fontSize: '0.875rem',
                                    flexShrink: 0
                                  }}
                                >
                                  {av.letter}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <strong style={{ fontSize: '0.84rem', color: '#0f172a', display: 'block', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item?.ho_ten || '---'}
                                  </strong>
                                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                                    @{item?.ten_dang_nhap || 'user'}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Email */}
                            <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                              {item?.email ? (
                                <span
                                  style={{
                                    fontSize: '0.8125rem',
                                    color: '#334155',
                                    display: 'inline-block',
                                    maxWidth: '190px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={item.email}
                                >
                                  {item.email}
                                </span>
                              ) : (
                                <span style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.75rem' }}>Chưa cập nhật</span>
                              )}
                            </td>

                            {/* Role */}
                            <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '0.2rem 0.6rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.75rem',
                                  fontWeight: '600',
                                  backgroundColor: roleBadge.bg,
                                  color: roleBadge.color,
                                  border: `1px solid ${roleBadge.border}`,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {roleBadge.label}
                              </span>
                            </td>

                            {/* Status */}
                            <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.75rem',
                                  fontWeight: '600',
                                  backgroundColor: item?.trang_thai === 'ACTIVE' ? '#f0fdf4' : '#fef2f2',
                                  color: item?.trang_thai === 'ACTIVE' ? '#15803d' : '#b91c1c',
                                  border: `1px solid ${item?.trang_thai === 'ACTIVE' ? '#bbf7d0' : '#fecaca'}`,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item?.trang_thai === 'ACTIVE' ? '#16a34a' : '#dc2626' }}></span>
                                {item?.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa'}
                              </span>
                            </td>

                            {/* Branch Name */}
                            <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', maxWidth: '200px' }}>
                                <Store size={14} color={item?.co_so_ten ? '#2563eb' : '#94a3b8'} style={{ flexShrink: 0 }} />
                                <span
                                  style={{
                                    fontSize: '0.8125rem',
                                    color: item?.co_so_ten ? '#0f172a' : '#64748b',
                                    fontWeight: item?.co_so_ten ? '600' : '400',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={item?.co_so_ten || 'Tất cả chi nhánh'}
                                >
                                  {item?.co_so_ten || 'Tất cả chi nhánh'}
                                </span>
                              </div>
                            </td>

                            {/* Chi tiết button */}
                            <td style={{ padding: '0.85rem 1rem', textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                              <button
                                type="button"
                                className="admin-button-secondary"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedUser(item)
                                }}
                                title="Xem chi tiết nhân viên"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.4rem',
                                  height: '30px',
                                  padding: '0 0.85rem',
                                  borderRadius: '6px',
                                  border: '1px solid #bfdbfe',
                                  background: '#eff6ff',
                                  color: '#1d4ed8',
                                  fontSize: '0.785rem',
                                  fontWeight: '600',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.borderColor = '#93c5fd'
                                  e.currentTarget.style.backgroundColor = '#dbeafe'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.borderColor = '#bfdbfe'
                                  e.currentTarget.style.backgroundColor = '#eff6ff'
                                }}
                              >
                                <Eye size={14} color="#1d4ed8" />
                                <span>Chi tiết</span>
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* PAGINATION FOOTER */}
            <div style={{ padding: '0.85rem 1.25rem', backgroundColor: '#ffffff', borderTop: '1px solid var(--border-light)' }}>
              <Pagination pageData={safePageData} onPageChange={setUsersPage} />
            </div>
          </div>
        )}

      {/* =========================================================================
         RESET PASSWORD DIALOG (Đặt lại mật khẩu)
         ========================================================================= */}
      {resetPasswordModalUser && (
        <WorkspaceDialog
          isOpen={true}
          onClose={handleCloseResetPassword}
          title="Đặt lại mật khẩu nhân viên"
          style={{ width: '460px', maxWidth: '95vw' }}
        >
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              {(() => {
                const av = getAvatarProps(resetPasswordModalUser)
                return (
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: av.bg,
                      color: av.color,
                      border: `1px solid ${av.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700',
                      fontSize: '1rem',
                      flexShrink: 0
                    }}
                  >
                    {av.letter}
                  </div>
                )
              })()}
              <div>
                <strong style={{ fontSize: '0.875rem', color: '#0f172a', display: 'block' }}>
                  {resetPasswordModalUser.ho_ten || resetPasswordModalUser.ten_dang_nhap}
                </strong>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  @{resetPasswordModalUser.ten_dang_nhap} • {getRoleBadge(resetPasswordModalUser.vai_tro).label}
                </span>
              </div>
            </div>

            {resetPasswordError && (
              <div style={{ padding: '0.65rem 0.85rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '0.75rem', fontWeight: '500' }}>
                {resetPasswordError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: '500', color: '#334155' }}>
                  Mật khẩu mới <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <button
                  type="button"
                  onClick={handleGenerateRandomPassword}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Tạo mật khẩu ngẫu nhiên
                </button>
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  className="shadcn-input ui-input"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Nhập tối thiểu 6 ký tự..."
                  style={{ width: '100%', paddingRight: '2.5rem', fontFamily: newPasswordInput ? 'monospace' : 'inherit', fontSize: '0.875rem' }}
                  autoFocus
                />
              </div>
              <span style={{ fontSize: '0.75rem', color: '#64748b', lineHeight: '1.4' }}>
                Mật khẩu sẽ có hiệu lực ngay lập tức. Nhân viên sẽ dùng mật khẩu này cho lần đăng nhập tới.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
              <button
                type="button"
                className="btn-cancel"
                onClick={handleCloseResetPassword}
                disabled={isResettingPassword}
                style={{ height: '36px', padding: '0 1rem', fontSize: '0.8125rem' }}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn-save"
                onClick={handleResetPasswordSubmit}
                disabled={isResettingPassword || !newPasswordInput}
                style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <KeyRound size={15} color="#ffffff" />
                <span>{isResettingPassword ? 'Đang đặt lại...' : 'Xác nhận đặt lại'}</span>
              </button>
            </div>
          </div>
        </WorkspaceDialog>
      )}

    </section>
  )
}
