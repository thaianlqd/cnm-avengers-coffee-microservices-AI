import StatusBadge from '../../../components/console/StatusBadge'
import { useWorkspacePage } from '../../../components/console/WorkspacePageContext'
import { Button } from '../../../components/ui/button'
import { Card } from '../../../components/ui/card'
import { Label } from '../../../components/ui/label'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import { Table } from '../../../components/ui/table'
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
  XCircle,
  ShieldAlert,
  MoreVertical,
  MapPin,
  ArrowLeft,
  Eye,
  EyeOff,
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
        <Button type="button" className="admin-pg-btn" onClick={() => onPageChange(1)} disabled={pageData.page <= 1} title="Trang đầu">
          <ChevronsLeft size={16} />
        </Button>
        <Button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.page - 1)} disabled={pageData.page <= 1} title="Trang trước">
          <ChevronLeft size={16} />
        </Button>
        <span style={{ margin: '0 0.5rem', fontWeight: '500', color: '#414743', fontSize: '0.8125rem' }}>Trang {pageData.page || 1} / {pageData.totalPages || 1}</span>
        <Button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.page + 1)} disabled={pageData.page >= pageData.totalPages} title="Trang sau">
          <ChevronRight size={16} />
        </Button>
        <Button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.totalPages)} disabled={pageData.page >= pageData.totalPages} title="Trang cuối">
          <ChevronsRight size={16} />
        </Button>
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
  useWorkspacePage(selectedUser ? (selectedUser.ho_ten || selectedUser.ten_dang_nhap) : '', 'Hồ sơ nhân viên, vai trò và quyền truy cập hệ thống.')

  // Reset password modal state
  const [resetPasswordModalUser, setResetPasswordModalUser] = useState(null)
  const [newPasswordInput, setNewPasswordInput] = useState('')
  const [isResettingPassword, setIsResettingPassword] = useState(false)
  const [resetPasswordError, setResetPasswordError] = useState('')
  const [showUserPassword, setShowUserPassword] = useState(false)

  // Defensive fallbacks
  const safeUserForm = userForm || {}
  const safeUserFilters = userFilters || { q: '', role: '', branch_code: '' }
  const safeUsersState = usersState || { loading: false, error: '', items: [] }
  const safePageData = usersPageData || { rows: [], total: 0, totalPages: 1, page: 1 }
  const safeBranchOptions = (branchOptions || []).filter(b => {
    if (!b || !(b.code || b.ma_chi_nhanh)) return false
    if (b.loai_diem_ban && b.loai_diem_ban !== 'CHI_NHANH_CHINH') return false
    const name = String(b.name || b.ten_chi_nhanh || '').toLowerCase()
    const code = String(b.code || b.ma_chi_nhanh || '').toUpperCase()
    if (/^kiosk\b/i.test(name) || /nhượng quyền/i.test(name)) return false
    if (/^(KSK|KVT|KIOSK)([-_]|$)/i.test(code)) return false
    return true
  })

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
        <Card
          ref={formRef}
          className="system-admin-card admin-surface"
          aria-label={editingUserId ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản'}
          style={{
            backgroundColor: '#ffffff',
            border: '1px solid var(--border-light)',
            borderRadius: '12px',
            boxShadow: "none",
            transition: 'all 0.25s ease'
          }}
        >
          {/* Form Header */}
          <div data-modal-body="true" className="admin-card-header" style={{ padding: '1.1rem 1.5rem', backgroundColor: '#ffffff', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTopLeftRadius: '11px', borderTopRightRadius: '11px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="admin-icon-tile workspace-dialog-icon-badge" style={{ width: '38px', height: '38px', borderRadius: '8px', backgroundColor: '#f1f5f9', color: 'var(--text-main)', border: '1px solid var(--border-light)', display: 'grid', placeItems: 'center', lineHeight: 1 }}>
                {editingUserId ? <Edit3 size={18} style={{ display: 'block', margin: 'auto' }} /> : <UserPlus size={18} style={{ display: 'block', margin: 'auto' }} />}
              </div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '500', color: 'var(--text-main)' }}>
                {editingUserId ? 'Chỉnh sửa thông tin nhân viên' : 'Thêm nhân viên mới'}
              </h3>
            </div>

            <Button data-intent="danger" className="admin-icon-button" aria-label="Đóng form"
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
            </Button>
          </div>

          {/* Form Body - 2 Column Balanced Grid */}
          <div data-modal-body="true" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>

              {/* Field: Username */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <Label htmlFor="usermanagementpanel-8845" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Tên đăng nhập (Username) <span style={{ color: '#ef4444' }}>*</span>
                </Label>
                <Input id="usermanagementpanel-8845"
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
                <Label htmlFor="usermanagementpanel-9580" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Họ và tên nhân viên <span style={{ color: '#ef4444' }}>*</span>
                </Label>
                <Input id="usermanagementpanel-9580"
                  type="text"
                  className="shadcn-input ui-input"
                  value={safeUserForm.ho_ten || ''}
                  onChange={(e) => setUserForm((p) => ({ ...p, ho_ten: e.target.value }))}
                  placeholder="Nhập họ và tên đầy đủ"
                />
              </div>

              {/* Field: Email */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <Label htmlFor="usermanagementpanel-10212" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Địa chỉ email
                </Label>
                <Input id="usermanagementpanel-10212"
                  type="email"
                  className="shadcn-input ui-input"
                  value={safeUserForm.email || ''}
                  onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="email@avengerscoffee.com"
                />
              </div>

              {/* Field: Password */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <Label htmlFor="usermanagementpanel-10895" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  {editingUserId ? 'Đặt lại mật khẩu (để trống nếu giữ nguyên)' : 'Mật khẩu khởi tạo *'}
                </Label>
                <div className="admin-password-field" style={{ position: 'relative', width: '100%', height: '40px' }}>
                  <Input id="usermanagementpanel-10895"
                    type={showUserPassword ? "text" : "password"}
                    className="shadcn-input ui-input"
                    value={safeUserForm.mat_khau || ''}
                    onChange={(e) => setUserForm((p) => ({ ...p, mat_khau: e.target.value }))}
                    placeholder={editingUserId ? 'Nhập mật khẩu mới nếu muốn đặt lại...' : '••••••••'}
                    style={{ width: '100%', height: '40px', paddingRight: '42px', boxSizing: 'border-box' }}
                  />
                  <Button
                    type="button"
                    className="admin-password-toggle"
                    onClick={() => setShowUserPassword(!showUserPassword)}
                    title={showUserPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    aria-label={showUserPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '26px',
                      height: '26px',
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      margin: 0,
                      cursor: 'pointer',
                      color: "var(--text-muted)",
                      zIndex: 3
                    }}
                  >
                    {showUserPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </Button>
                </div>
              </div>

              {/* Field: Role */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <Label htmlFor="usermanagementpanel-11570" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Phân quyền vai trò <span style={{ color: '#ef4444' }}>*</span>
                </Label>
                <SearchableSelect id="usermanagementpanel-11570"
                  className="shadcn-select"
                  value={safeUserForm.vai_tro || 'STAFF'}
                  onChange={(e) => setUserForm((p) => ({ ...p, vai_tro: e.target.value }))}
                >
                  <option value="STAFF">Nhân viên cửa hàng chính thức (Staff)</option>
                  <option value="MANAGER">Quản lý cửa hàng (Manager)</option>
                  <option value="DATA_ANALYST">Chuyên viên phân tích dữ liệu (Analyst)</option>
                  <option value="ACCOUNTANT">Quản lý nhượng quyền (Accountant)</option>
                  <option value="SHIPPER">Nhân viên giao hàng (Shipper)</option>
                  <option value="ADMIN">Quản trị viên hệ thống (Admin)</option>
                </SearchableSelect>
              </div>

              {/* Field: Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <Label htmlFor="usermanagementpanel-12662" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Trạng thái tài khoản
                </Label>
                <SearchableSelect id="usermanagementpanel-12662"
                  className="shadcn-select"
                  value={safeUserForm.trang_thai || 'ACTIVE'}
                  onChange={(e) => setUserForm((p) => ({ ...p, trang_thai: e.target.value }))}
                >
                  <option value="ACTIVE">Hoạt động</option>
                  <option value="INACTIVE">Tạm khóa tài khoản</option>
                </SearchableSelect>
              </div>

              {/* Field: City Filter */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <Label htmlFor="usermanagementpanel-13393" style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Lọc theo thành phố
                </Label>
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
                <Label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                  Chi nhánh làm việc
                </Label>
                <SearchableBranchSelect
                  branches={filteredBranchOptions}
                  value={safeUserForm.co_so_ma || ''}
                  onChange={(val) => setUserForm((p) => ({ ...p, co_so_ma: val }))}
                />
              </div>

            </div>

            {/* Form Footer Actions */}
            <div data-modal-footer="inset" data-modal-actions="true" className="admin-editor-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e4df', paddingTop: '1.25rem' }}>
              <Button data-intent="danger"
                type="button"
                onClick={handleCloseForm}
                className="btn-cancel" style={{ height: '38px', padding: '0 1.25rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <X size={15} /> Hủy bỏ
              </Button>

              <Button data-intent="success"
                type="button"
                className="btn-save"
                onClick={handleSaveUser}
                disabled={savingUser}
                style={{ height: '38px', padding: '0 1.35rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <CheckCircle2 size={17} color="#ffffff" />
                <span>{savingUser ? 'Đang lưu tài khoản...' : (editingUserId ? 'Cập nhật tài khoản' : 'Lưu thông tin tài khoản')}</span>
              </Button>
            </div>
          </div>
        </Card>
        </WorkspaceDialog>
      )}

      {selectedUser ? (
        /* =========================================================================
           EMPLOYEE DETAIL VIEW (Single Unified View with Faint Vertical Dividers)
           ========================================================================= */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Top Navigation & Breadcrumbs */}
          <div className="record-page-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <Button
              type="button"
              onClick={() => setSelectedUser(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.55rem 0.95rem',
                borderRadius: '8px',
                border: "1px solid var(--border-light)",
                background: '#ffffff',
                color: "var(--text-body)",
                fontWeight: '600',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                boxShadow: "none",
                transition: 'all 0.15s ease'
              }}
            >
              <ArrowLeft size={16} /> Quay lại danh sách nhân viên
            </Button>

            <div style={{ fontSize: '0.8125rem', color: "var(--text-muted)" }}>
              <span>Danh sách nhân viên</span> <span style={{ margin: '0 0.35rem' }}>/</span> <strong style={{ color: "var(--text-main)" }}>{selectedUser.ho_ten || selectedUser.ten_dang_nhap}</strong>
            </div>
          </div>

          {/* UNIFIED DETAIL CARD */}
          <div
            className="record-detail-layout"
            style={{
              background: '#ffffff',
              borderRadius: "10px",
              border: "1px solid var(--border-light)",
              boxShadow: "none",
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header Banner with Profile Summary & Action Buttons */}
            <Card className="record-summary-header"
              style={{
                padding: '1.35rem 1.75rem',
                borderBottom: "1px solid var(--border-subtle)",
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '1rem',
                background: '#fafbfd'
              }}
            >
              {/* Profile Identity */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                {(() => {
                  const av = getAvatarProps(selectedUser)
                  return (
                    <div
                      style={{
                        width: '46px',
                        height: '46px',
                        borderRadius: '50%',
                        backgroundColor: av.bg,
                        color: av.color,
                        border: `1.5px solid ${av.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: '700',
                        fontSize: '1.15rem',
                        flexShrink: 0
                      }}
                    >
                      {av.letter}
                    </div>
                  )
                })()}

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: "700", color: "var(--text-main)", letterSpacing: '-0.015em' }}>
                      {selectedUser.ho_ten || 'Chưa cập nhật họ tên'}
                    </h2>
                    {(() => {
                      const b = getRoleBadge(selectedUser.vai_tro)
                      return (
                        <Badge variant="outline" data-quiet-label="true"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0.2rem 0.65rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            backgroundColor: b.bg,
                            color: b.color,
                            border: `1px solid ${b.border}`
                          }}
                        >
                          {b.label}
                        </Badge>
                      )
                    })()}

                    <StatusBadge status={selectedUser.trang_thai}>

                      {selectedUser.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa'}
                    </StatusBadge>
                  </div>

                  {/* Natural, uncluttered metadata line without badge abuse */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.45rem', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>Tài khoản:</span>
                      <strong style={{ color: 'var(--text-main)', fontFamily: 'monospace', fontWeight: '600' }}>@{selectedUser.ten_dang_nhap}</strong>
                    </div>
                    <span style={{ color: 'var(--border-light)', userSelect: 'none' }}>•</span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>Mã ID:</span>
                      <strong style={{ color: 'var(--text-main)', fontFamily: 'monospace', fontWeight: '600', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedUser.ma_nguoi_dung || selectedUser.id}>
                        {selectedUser.ma_nguoi_dung || selectedUser.id}
                      </strong>
                    </div>
                    <span style={{ color: 'var(--border-light)', userSelect: 'none' }}>•</span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>Khởi tạo:</span>
                      <span style={{ color: 'var(--text-body)', fontWeight: '500' }}>{fmtDateTime(selectedUser.ngay_tao)}</span>
                    </div>
                    <span style={{ color: 'var(--border-light)', userSelect: 'none' }}>•</span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>Cập nhật:</span>
                      <span style={{ color: 'var(--text-body)', fontWeight: '500' }}>{selectedUser.ngay_cap_nhat ? fmtDateTime(selectedUser.ngay_cap_nhat) : 'Chưa cập nhật'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Action Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Button
                  type="button"
                  className="admin-button-secondary"
                  onClick={(e) => handleOpenResetPassword(selectedUser, e)}
                  style={{
                    height: '36px',
                    padding: '0 0.95rem',
                    borderRadius: '8px',
                    border: "1px solid var(--border-light)",
                    background: '#ffffff',
                    color: "var(--text-main)",
                    fontWeight: '600',
                    fontSize: '0.8125rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    cursor: 'pointer'
                  }}
                  title="Đặt lại mật khẩu cho nhân viên này"
                >
                  <KeyRound size={15} color="#ea580c" /> Đặt lại mật khẩu
                </Button>

                <Button
                  type="button"
                  className="admin-button-secondary"
                  onClick={() => handleStartEdit(selectedUser)}
                  style={{
                    height: '36px',
                    padding: '0 0.95rem',
                    borderRadius: '8px',
                    border: "1px solid var(--border-light)",
                    background: '#ffffff',
                    color: "var(--text-main)",
                    fontWeight: '600',
                    fontSize: '0.8125rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    cursor: 'pointer'
                  }}
                  title="Chỉnh sửa thông tin nhân viên"
                >
                  <Edit3 size={15} color="#2563eb" /> Chỉnh sửa
                </Button>

                <Button
                  type="button"
                  onClick={(e) => handleToggleUserStatus(selectedUser, e)}
                  style={{
                    height: '36px',
                    padding: '0 0.95rem',
                    borderRadius: '8px',
                    border: selectedUser.trang_thai === 'ACTIVE' ? '1px solid #fed7aa' : '1px solid #bbf7d0',
                    background: selectedUser.trang_thai === 'ACTIVE' ? '#fff7ed' : '#f0fdf4',
                    color: selectedUser.trang_thai === 'ACTIVE' ? '#c2410c' : '#15803d',
                    fontWeight: '600',
                    fontSize: '0.8125rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    cursor: 'pointer'
                  }}
                  title={selectedUser.trang_thai === 'ACTIVE' ? 'Tạm khóa quyền truy cập' : 'Kích hoạt lại tài khoản'}
                >
                  {selectedUser.trang_thai === 'ACTIVE' ? (
                    <>
                      <ShieldAlert size={15} /> Tạm khóa tài khoản
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={15} /> Kích hoạt tài khoản
                    </>
                  )}
                </Button>

                <Button data-intent="danger"
                  type="button"
                  className="admin-button-danger"
                  disabled={selectedUser.vai_tro === 'ADMIN'}
                  onClick={() => {
                    if (selectedUser.vai_tro === 'ADMIN') return
                    deleteUser(selectedUser.ma_nguoi_dung || selectedUser.id)
                    setSelectedUser(null)
                  }}
                  style={{
                    height: '36px',
                    padding: '0 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontWeight: '600',
                    fontSize: '0.8125rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: selectedUser.vai_tro === 'ADMIN' ? 'not-allowed' : 'pointer',
                    opacity: selectedUser.vai_tro === 'ADMIN' ? 0.4 : 1
                  }}
                  title={selectedUser.vai_tro === 'ADMIN' ? 'Không thể xóa tài khoản Quản trị viên' : 'Xóa tài khoản nhân viên'}
                >
                  <Trash2 size={15} /> Xóa
                </Button>
              </div>
            </Card>

            {/* BLOCK 1: 3-COLUMN INFORMATION MATRIX */}
            <div
              className="record-facts-grid grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/70 p-6 gap-6 lg:gap-0"
              style={{
                background: '#ffffff'
              }}
            >
              {/* Column 1: Định danh & Tài khoản */}
              <Card data-record-card="true" className="flex flex-col gap-3 lg:pr-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ fontWeight: "600", fontSize: '0.875rem', color: "var(--text-main)", display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: "1px solid var(--border-subtle)" }}>
                  <User size={17} color="#2563eb" /> Thông tin Định danh &amp; Tài khoản
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.85rem', fontSize: '0.8125rem' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Họ và tên đầy đủ</div>
                    <div style={{ fontWeight: '600', color: "var(--text-main)", fontSize: '0.875rem' }}>{selectedUser.ho_ten || '---'}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Tên đăng nhập hệ thống</div>
                    <div style={{ fontWeight: '600', color: "var(--primary-hover)", fontFamily: 'monospace' }}>@{selectedUser.ten_dang_nhap}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Vai trò hệ thống</div>
                    <div>
                      <Badge variant="outline" data-quiet-label="true"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          backgroundColor: getRoleBadge(selectedUser.vai_tro).bg,
                          color: getRoleBadge(selectedUser.vai_tro).color,
                          border: `1px solid ${getRoleBadge(selectedUser.vai_tro).border}`
                        }}
                      >
                        {getRoleBadge(selectedUser.vai_tro).label}
                      </Badge>
                    </div>
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Mã định danh (ID)</div>
                    <div style={{ fontWeight: '500', color: "var(--text-body)", fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>
                      {selectedUser.ma_nguoi_dung || selectedUser.id || '---'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Ngày khởi tạo</div>
                    <div style={{ fontWeight: '500', color: "var(--text-body)" }}>{fmtDateTime(selectedUser.ngay_tao)}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Cập nhật gần nhất</div>
                    <div style={{ fontWeight: '500', color: "var(--text-body)" }}>{fmtDateTime(selectedUser.ngay_cap_nhat)}</div>
                  </div>
                </div>
              </Card>

              {/* Column 2: Cơ sở & Nơi làm việc */}
              <Card data-record-card="true" className="flex flex-col gap-3 pt-6 lg:pt-0 lg:px-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ fontWeight: "600", fontSize: '0.875rem', color: "var(--text-main)", display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: "1px solid var(--border-subtle)" }}>
                  <Store size={17} color="#059669" /> Cơ sở &amp; Nơi làm việc
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8125rem' }}>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Chi nhánh làm việc</div>
                    <div style={{ fontWeight: '600', color: "var(--text-main)", lineHeight: '1.4' }}>
                      {selectedUser.co_so_ten || 'Tất cả chi nhánh (Toàn hệ thống)'}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.85rem' }}>
                    <div>
                      <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Mã cơ sở</div>
                      <div style={{ fontWeight: '600', color: "var(--text-body)", fontFamily: 'monospace' }}>
                        {selectedUser.co_so_ma || 'ALL'}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Loại cơ sở</div>
                      <div style={{ fontWeight: '500', color: "var(--text-body)" }}>
                        {selectedUser.co_so_ma ? 'Điểm Kiosk / Chi nhánh' : 'Trụ sở điều hành'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Quyền hạn truy cập</div>
                    <div style={{ fontWeight: '500', color: "var(--text-main)" }}>
                      {selectedUser.vai_tro === 'ADMIN' ? 'Toàn quyền Quản trị hệ thống (HQ)' : 'Phân quyền theo phạm vi chi nhánh'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Phạm vi phụ trách</div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', lineHeight: '1.4' }}>
                      {selectedUser.vai_tro === 'ADMIN'
                        ? 'Có toàn quyền kiểm soát nhân sự, tài chính, thực đơn và mạng lưới Kiosk.'
                        : 'Truy cập giới hạn theo các tính năng được phân bổ cho vai trò và cơ sở tương ứng.'}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Column 3: Bảo mật & Đăng nhập */}
              <Card data-record-card="true" className="flex flex-col gap-3 pt-6 lg:pt-0 lg:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ fontWeight: "600", fontSize: '0.875rem', color: "var(--text-main)", display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: "1px solid var(--border-subtle)" }}>
                  <ShieldCheck size={17} color="#7c3aed" /> Bảo mật &amp; Đăng nhập
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8125rem' }}>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Email nhận thông báo &amp; OTP</div>
                    <div style={{ fontWeight: '600', color: selectedUser.email ? "var(--text-main)" : "var(--text-muted)", wordBreak: 'break-all', fontStyle: selectedUser.email ? 'normal' : 'italic' }}>
                      {selectedUser.email || 'Chưa cập nhật email'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Mật khẩu tài khoản</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: '600', color: "var(--text-body)", letterSpacing: '0.2em' }}>
                      ••••••••
                    </div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Trạng thái tài khoản</div>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.8125rem',
                        fontWeight: '600',
                        color: selectedUser.trang_thai === 'ACTIVE' ? '#15803d' : '#dc2626'
                      }}
                    >
                      {selectedUser.trang_thai === 'ACTIVE' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      {selectedUser.trang_thai === 'ACTIVE' ? 'Cho phép đăng nhập bình thường' : 'Tài khoản đang bị tạm khóa'}
                    </span>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Phương thức xác thực</div>
                    <div style={{ fontWeight: '500', color: "var(--text-body)" }}>
                      Mật khẩu mã hóa Bcrypt + Phiên JWT
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* BLOCK 2: CHÍNH SÁCH BẢO MẬT & NHẬT KÝ */}
            <div data-record-finance="true"
              className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/70 p-5 gap-6 lg:gap-0"
              style={{
                borderTop: "1px solid var(--border-subtle)",
                background: '#fafbfd'
              }}
            >
              {/* Security policy */}
              <div className="flex flex-col gap-3 lg:pr-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontWeight: "600", fontSize: '0.875rem', color: "var(--text-main)", display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <ShieldCheck size={16} color="#d97706" /> Chính sách an toàn tài khoản &amp; Phiên đăng nhập
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', fontSize: '0.8125rem' }}>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Thời hạn phiên (JWT)</div>
                    <div style={{ fontWeight: "600", color: '#0284c7' }}>8 giờ làm việc</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Xác thực 2 lớp (2FA)</div>
                    <div style={{ fontWeight: '500', color: "var(--text-body)" }}>{selectedUser.vai_tro === 'ADMIN' ? 'Bắt buộc' : 'Tùy chọn'}</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Chính sách mật khẩu</div>
                    <div style={{ fontWeight: '500', color: "var(--text-body)" }}>Chu kỳ 90 ngày</div>
                  </div>
                </div>
              </div>

              {/* Activity log / Account history */}
              <div className="flex flex-col gap-3 pt-5 lg:pt-0 lg:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontWeight: "600", fontSize: '0.875rem', color: "var(--text-main)", display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Clock size={16} color="#059669" /> Nhật ký truy cập &amp; Trạng thái hoạt động
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', fontSize: '0.8125rem' }}>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Thiết bị đăng nhập gần nhất</div>
                    <div style={{ fontWeight: "600", color: "var(--text-main)" }}>Web Admin Enterprise</div>
                  </div>
                  <div>
                    <div style={{ color: "var(--text-muted)", fontSize: '0.75rem', marginBottom: '0.2rem' }}>Nhật ký kiểm toán (Audit)</div>
                    <div style={{ fontWeight: "600", color: '#16a34a' }}>Đã ghi nhận đầy đủ</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* USER DATA TABLE CARD */
        <Card className="admin-surface admin-users-directory" style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid var(--border-light)', overflow: 'hidden', boxShadow: "none" }}>
          {/* Table Header: Title on Left, Add Button on Right */}
          <div className="admin-card-header" style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
            <span className="workspace-record-count">{safePageData.total || 0} nhân viên</span>

            <Button data-intent="success"
              type="button"
              className="btn-save"
              onClick={handleStartCreateNew}
              style={{ height: '36px', padding: '0 1rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: '500', fontSize: '0.8125rem', borderRadius: '6px' }}
            >
              <UserPlus size={16} color="#ffffff" />
              <span>Thêm nhân viên</span>
            </Button>
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
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: "#64748b",
                  pointerEvents: 'none',
                  zIndex: 2
                }}
              />
              <Input data-input-prefix="true"
                className="admin-directory-search !pl-11"
                id="system-admin-user-search"
                aria-label="Tìm nhân viên"
                style={{
                  width: '100%',
                  height: '38px',
                  borderRadius: '8px',
                  border: "1px solid var(--border-light)",
                  backgroundColor: '#ffffff',
                  paddingLeft: '44px',
                  paddingRight: safeUserFilters.q ? '32px' : '12px',
                  fontSize: '0.8125rem',
                  color: "var(--text-main)",
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                placeholder="Tìm username, họ tên..."
                value={safeUserFilters.q || ''}
                onChange={(e) => setUserFilters((prev) => ({ ...prev, q: e.target.value }))}
              />
              {safeUserFilters.q && (
                <Button data-intent="danger"
                  className="admin-directory-search-clear"
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
                    color: "var(--text-muted)",
                    zIndex: 2
                  }}
                  title="Xóa tìm kiếm"
                >
                  <X size={14} />
                </Button>
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
                <option value="DATA_ANALYST">Phân tích dữ liệu (Analyst)</option>
                <option value="ACCOUNTANT">Quản lý nhượng quyền</option>
                <option value="SHIPPER">Nhân viên giao hàng (Shipper)</option>
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
          </div>

          {/* EMPLOYEE TABLE VIEW */}
          {safeUsersState.loading ? (
              <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Đang tải danh sách nhân viên...</div>
            ) : safeUsersState.error ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#ef4444', fontWeight: '500' }}>{safeUsersState.error}</div>
            ) : (
              <div className="admin-table-scroll" style={{ overflowX: 'auto' }}>
                <Table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: "var(--border-subtle)", borderBottom: "1px solid var(--border-light)" }}>
                      <th style={{ padding: '0.85rem 1rem', background: "var(--border-subtle)", color: "var(--text-body)", fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '24%' }}>Họ tên &amp; tài khoản</th>
                      <th style={{ padding: '0.85rem 1rem', background: "var(--border-subtle)", color: "var(--text-body)", fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '19%' }}>Email liên hệ</th>
                      <th style={{ padding: '0.85rem 1rem', background: "var(--border-subtle)", color: "var(--text-body)", fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '14%' }}>Vai trò</th>
                      <th style={{ padding: '0.85rem 1rem', background: "var(--border-subtle)", color: "var(--text-body)", fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '13%' }}>Trạng thái</th>
                      <th style={{ padding: '0.85rem 1rem', background: "var(--border-subtle)", color: "var(--text-body)", fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '16%' }}>Chi nhánh gán</th>
                      <th style={{ padding: '0.85rem 0.5rem', background: "var(--border-subtle)", color: "var(--text-body)", fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', width: '14%', minWidth: '95px', textAlign: 'center', whiteSpace: 'nowrap' }}>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(safePageData.rows || []).filter(Boolean).length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.65rem' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', backgroundColor: "var(--border-subtle)", display: 'flex', alignItems: 'center', justifyContent: 'center', color: "var(--text-muted)" }}>
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
                              <Button data-intent="danger"
                                type="button"
                                onClick={() => setUserFilters && setUserFilters((prev) => ({ ...prev, q: '' }))}
                                className="btn-cancel"
                                style={{ height: '32px', fontSize: '0.75rem', padding: '0 0.85rem', marginTop: '0.25rem' }}
                              >
                                Xóa bộ lọc tìm kiếm
                              </Button>
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
                              borderBottom: "1px solid var(--border-subtle)",
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
                                    fontWeight: "600",
                                    fontSize: '0.875rem',
                                    flexShrink: 0
                                  }}
                                >
                                  {av.letter}
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <strong style={{ fontSize: '0.84rem', color: "var(--text-main)", display: 'block', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item?.ho_ten || '---'}
                                  </strong>
                                  <span style={{ fontSize: '0.75rem', color: "var(--text-muted)", fontFamily: 'monospace' }}>
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
                                    color: "var(--text-body)",
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
                                <span style={{ color: "var(--text-muted)", fontStyle: 'italic', fontSize: '0.75rem' }}>Chưa cập nhật</span>
                              )}
                            </td>

                            {/* Role */}
                            <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                              <Badge variant="outline" data-quiet-label="true"
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
                              </Badge>
                            </td>

                            {/* Status */}
                            <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                              <StatusBadge status={item?.trang_thai}>

                                {item?.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa'}
                              </StatusBadge>
                            </td>

                            {/* Branch Name */}
                            <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', maxWidth: '200px' }}>
                                <Store size={14} color={item?.co_so_ten ? '#2563eb' : '#94a3b8'} style={{ flexShrink: 0 }} />
                                <span
                                  style={{
                                    fontSize: '0.8125rem',
                                    color: item?.co_so_ten ? "var(--text-main)" : "var(--text-muted)",
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
                            <td style={{ padding: '0.85rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                              <Button
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
                                  justifyContent: 'center',
                                  gap: '0.35rem',
                                  height: '30px',
                                  padding: '0 0.65rem',
                                  borderRadius: '6px',
                                  border: "1px solid var(--border-light)",
                                  background: "var(--primary-light)",
                                  color: "var(--primary-hover)",
                                  fontSize: '0.785rem',
                                  fontWeight: '600',
                                  whiteSpace: 'nowrap',
                                  flexShrink: 0,
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
                                <Eye size={14} color="#1d4ed8" style={{ flexShrink: 0 }} />
                                <span style={{ whiteSpace: 'nowrap' }}>Chi tiết</span>
                              </Button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </Table>
              </div>
            )}

            {/* PAGINATION FOOTER */}
            <div style={{ padding: '0.85rem 1.25rem', backgroundColor: '#ffffff', borderTop: '1px solid var(--border-light)' }}>
              <Pagination pageData={safePageData} onPageChange={setUsersPage} />
            </div>
          </Card>
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
          <div data-modal-body="true" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', background: "var(--surface-low)", borderRadius: '10px', border: "1px solid var(--border-light)" }}>
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
                      fontWeight: "600",
                      fontSize: '1rem',
                      flexShrink: 0
                    }}
                  >
                    {av.letter}
                  </div>
                )
              })()}
              <div>
                <strong style={{ fontSize: '0.875rem', color: "var(--text-main)", display: 'block' }}>
                  {resetPasswordModalUser.ho_ten || resetPasswordModalUser.ten_dang_nhap}
                </strong>
                <span style={{ fontSize: '0.75rem', color: "var(--text-muted)" }}>
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
                <Label style={{ fontSize: '0.8125rem', fontWeight: '500', color: "var(--text-body)" }}>
                  Mật khẩu mới <span style={{ color: '#ef4444' }}>*</span>
                </Label>
                <Button
                  type="button"
                  onClick={handleGenerateRandomPassword}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: "var(--primary)",
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Tạo mật khẩu ngẫu nhiên
                </Button>
              </div>

              <div style={{ position: 'relative' }}>
                <Input
                  type="text"
                  className="shadcn-input ui-input"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="Nhập tối thiểu 6 ký tự..."
                  style={{ width: '100%', paddingRight: '2.5rem', fontFamily: newPasswordInput ? 'monospace' : 'inherit', fontSize: '0.875rem' }}
                  autoFocus
                />
              </div>
              <span style={{ fontSize: '0.75rem', color: "var(--text-muted)", lineHeight: '1.4' }}>
                Mật khẩu sẽ có hiệu lực ngay lập tức. Nhân viên sẽ dùng mật khẩu này cho lần đăng nhập tới.
              </span>
            </div>

            <div data-modal-footer="inset" data-modal-actions="true" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', paddingTop: '0.75rem', borderTop: "1px solid var(--border-subtle)" }}>
              <Button data-intent="danger"
                type="button"
                className="btn-cancel"
                onClick={handleCloseResetPassword}
                disabled={isResettingPassword}
                style={{ height: '36px', padding: '0 1rem', fontSize: '0.8125rem' }}
              >
                Hủy bỏ
              </Button>
              <Button data-intent="success"
                type="button"
                className="btn-save"
                onClick={handleResetPasswordSubmit}
                disabled={isResettingPassword || !newPasswordInput}
                style={{ height: '36px', padding: '0 1.25rem', fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
              >
                <KeyRound size={15} color="#ffffff" />
                <span>{isResettingPassword ? 'Đang đặt lại...' : 'Xác nhận đặt lại'}</span>
              </Button>
            </div>
          </div>
        </WorkspaceDialog>
      )}

    </section>
  )
}
