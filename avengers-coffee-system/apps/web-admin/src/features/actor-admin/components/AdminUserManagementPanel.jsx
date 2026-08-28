import React, { useState, useRef } from 'react'
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
  MoreVertical
} from 'lucide-react'

function Pagination({ pageData, onPageChange }) {
  if (!pageData || !pageData.total || pageData.total <= 10) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', fontSize: '0.8125rem', color: '#64748b', paddingTop: '0.85rem', marginTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
      <span>Hiển thị <strong>{pageData.from || 1} - {pageData.to || pageData.total}</strong> trên tổng số <strong>{pageData.total}</strong> người dùng</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(1)} disabled={pageData.page <= 1} title="Trang đầu">
          <ChevronsLeft size={16} />
        </button>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.page - 1)} disabled={pageData.page <= 1} title="Trang trước">
          <ChevronLeft size={16} />
        </button>
        <span style={{ margin: '0 0.5rem', fontWeight: '700', color: '#334155', fontSize: '0.8125rem' }}>Trang {pageData.page || 1} / {pageData.totalPages || 1}</span>
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
  setUsersPage = () => {}
}) {
  const formRef = useRef(null)
  const [openUserActionId, setOpenUserActionId] = useState(null)

  // Defensive fallbacks
  const safeUserForm = userForm || {}
  const safeUserFilters = userFilters || { q: '', role: '', branch_code: '' }
  const safeUsersState = usersState || { loading: false, error: '', items: [] }
  const safePageData = usersPageData || { rows: [], total: 0, totalPages: 1, page: 1 }
  const safeBranchOptions = (branchOptions || []).filter(b => b && (b.code || b.ma_chi_nhanh))

  const handleStartEdit = (user) => {
    if (!user) return
    startEditUser(user)
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const handleStartCreateNew = () => {
    setUserForm({
      ten_dang_nhap: '',
      ho_ten: '',
      email: '',
      mat_khau: '',
      vai_tro: 'STAFF',
      co_so_ma: '',
      trang_thai: 'ACTIVE'
    })
    if (formRef.current) {
      formRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Calculate KPI stats safely
  const allUsersList = (safeUsersState.items || safePageData.rows || []).filter(Boolean)
  const totalUsers = safePageData.total || allUsersList.length
  const managerCount = allUsersList.filter(u => u && u.vai_tro === 'MANAGER').length
  const staffCount = allUsersList.filter(u => u && u.vai_tro === 'STAFF').length
  const accountantCount = allUsersList.filter(u => u && u.vai_tro === 'ACCOUNTANT').length
  const activeCount = allUsersList.filter(u => u && u.trang_thai === 'ACTIVE').length

  return (
    <section className="panel system-admin-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      
      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserCog size={22} color="#4f46e5" /> Quản Lý Người Dùng &amp; Phân Quyền
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
            Quản lý tài khoản nhân viên (STAFF), quản lý cửa hàng (MANAGER) và điều phối phân bổ chi nhánh.
          </p>
        </div>

        <button
          type="button"
          className="btn-save-green"
          onClick={handleStartCreateNew}
        >
          <UserPlus size={18} color="#ffffff" />
          <span>Thêm Tài Khoản Mới</span>
        </button>
      </div>

      {/* KPI SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UsersIcon size={20} color="#4f46e5" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>TỔNG TÀI KHOẢN</span>
            <strong style={{ display: 'block', fontSize: '1.2rem', color: '#0f172a', marginTop: '0.1rem' }}>{totalUsers}</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building size={20} color="#2563eb" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>QUẢN LÝ (MANAGER)</span>
            <strong style={{ display: 'block', fontSize: '1.2rem', color: '#2563eb', marginTop: '0.1rem' }}>{managerCount}</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCheck size={20} color="#059669" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>NHÂN VIÊN (STAFF)</span>
            <strong style={{ display: 'block', fontSize: '1.2rem', color: '#059669', marginTop: '0.1rem' }}>{staffCount}</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UsersIcon size={20} color="#d97706" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>KẾ TOÁN (ACCOUNTANT)</span>
            <strong style={{ display: 'block', fontSize: '1.2rem', color: '#d97706', marginTop: '0.1rem' }}>{accountantCount}</strong>
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={20} color="#16a34a" />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>ĐANG HOẠT ĐỘNG</span>
            <strong style={{ display: 'block', fontSize: '1.2rem', color: '#16a34a', marginTop: '0.1rem' }}>{activeCount}</strong>
          </div>
        </div>
      </div>

      {/* USER EDIT / CREATE FORM CARD */}
      <div ref={formRef} className="system-admin-card" style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', boxShadow: '0 8px 24px -4px rgba(15, 23, 42, 0.06)', overflow: 'hidden' }}>
        <div style={{ padding: '1.1rem 1.5rem', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: editingUserId ? '#eff6ff' : '#ecfdf5', color: editingUserId ? '#2563eb' : '#059669', border: editingUserId ? '1px solid #bfdbfe' : '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {editingUserId ? <Edit3 size={20} /> : <UserPlus size={20} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                {editingUserId ? 'Chỉnh sửa tài khoản người dùng' : 'Tạo tài khoản người dùng mới'}
              </h3>
              <span style={{ fontSize: '0.78125rem', color: '#64748b' }}>
                {editingUserId ? `Mã tài khoản đang chỉnh sửa: #${editingUserId}` : 'Điền đầy đủ thông tin để cấp tài khoản truy cập hệ thống'}
              </span>
            </div>
          </div>

          {editingUserId && (
            <button
              type="button"
              onClick={cancelEditUser}
              style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '0.4rem 0.85rem', borderRadius: '8px', fontSize: '0.78125rem', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <X size={15} color="#dc2626" /> Hủy sửa
            </button>
          )}
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
            
            {/* Field: Username */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                Tên đăng nhập (Username) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                <User size={16} color="#64748b" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                  value={safeUserForm.ten_dang_nhap || ''}
                  onChange={(e) => setUserForm((p) => ({ ...p, ten_dang_nhap: e.target.value }))}
                  placeholder="Nhập tên đăng nhập"
                />
              </div>
            </div>

            {/* Field: Full Name */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                Họ và tên nhân viên <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                <UserCheck size={16} color="#64748b" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                  value={safeUserForm.ho_ten || ''}
                  onChange={(e) => setUserForm((p) => ({ ...p, ho_ten: e.target.value }))}
                  placeholder="Nhập họ và tên đầy đủ"
                />
              </div>
            </div>

            {/* Field: Email */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                Địa chỉ Email
              </label>
              <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                <Mail size={16} color="#64748b" style={{ flexShrink: 0 }} />
                <input
                  type="email"
                  style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                  value={safeUserForm.email || ''}
                  onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="email@avengerscoffee.com"
                />
              </div>
            </div>

            {/* Field: Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                Mật khẩu {editingUserId ? '(để trống nếu không đổi)' : '*'}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                <Lock size={16} color="#64748b" style={{ flexShrink: 0 }} />
                <input
                  type="password"
                  style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                  value={safeUserForm.mat_khau || ''}
                  onChange={(e) => setUserForm((p) => ({ ...p, mat_khau: e.target.value }))}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Field: Role */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                Phân quyền Vai trò <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                <ShieldCheck size={16} color="#4f46e5" style={{ flexShrink: 0 }} />
                <select
                  style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', fontWeight: '600', cursor: 'pointer' }}
                  value={safeUserForm.vai_tro || 'STAFF'}
                  onChange={(e) => setUserForm((p) => ({ ...p, vai_tro: e.target.value }))}
                >
                  <option value="STAFF">STAFF - Nhân viên cửa hàng</option>
                  <option value="MANAGER">MANAGER - Quản lý cửa hàng</option>
                  <option value="ACCOUNTANT">ACCOUNTANT - Kế toán hội sở</option>
                  <option value="ADMIN">ADMIN - Quản trị viên hệ thống</option>
                </select>
              </div>
            </div>

            {/* Field: Branch */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                Chi nhánh làm việc
              </label>
              <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                <Store size={16} color="#64748b" style={{ flexShrink: 0 }} />
                <select
                  style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', fontWeight: '600', cursor: 'pointer' }}
                  value={safeUserForm.co_so_ma || ''}
                  onChange={(e) => setUserForm((p) => ({ ...p, co_so_ma: e.target.value }))}
                >
                  <option value="">-- Áp dụng tất cả / Chưa gán --</option>
                  {safeBranchOptions.map((branch) => (
                    <option key={branch.code || branch.ma_chi_nhanh} value={branch.code || branch.ma_chi_nhanh}>
                      {branch.name || branch.ten_chi_nhanh}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Field: Status */}
            {editingUserId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ color: '#334155', fontWeight: '600', fontSize: '0.8125rem' }}>
                  Trạng thái tài khoản
                </label>
                <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                  <Activity size={16} color="#64748b" style={{ flexShrink: 0 }} />
                  <select
                    style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', fontWeight: '600', cursor: 'pointer' }}
                    value={safeUserForm.trang_thai || 'ACTIVE'}
                    onChange={(e) => setUserForm((p) => ({ ...p, trang_thai: e.target.value }))}
                  >
                    <option value="ACTIVE">ACTIVE - Đang hoạt động</option>
                    <option value="INACTIVE">INACTIVE - Tạm khóa tài khoản</option>
                  </select>
                </div>
              </div>
            )}

          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
            {editingUserId && (
              <button
                type="button"
                onClick={cancelEditUser}
                style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', height: '40px', padding: '0 1.25rem', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <X size={16} color="#dc2626" /> Hủy bỏ
              </button>
            )}

            <button
              type="button"
              className="btn-save-green"
              onClick={saveUser}
              disabled={savingUser}
            >
              <CheckCircle2 size={18} color="#ffffff" />
              <span>{savingUser ? 'Đang lưu tài khoản...' : 'Lưu Thông Tin Tài Khoản'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* USER DATA TABLE CARD */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: '#ffffff' }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            <UsersIcon size={18} color="#4f46e5" /> Danh sách người dùng hệ thống ({totalUsers})
          </h2>

          {/* SEARCH & FILTERS */}
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.75rem', gap: '0.5rem', width: '220px' }}>
              <Search size={15} color="#64748b" style={{ flexShrink: 0 }} />
              <input
                style={{ flex: 1, border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.8125rem', color: '#0f172a' }}
                placeholder="Tìm username, họ tên..."
                value={safeUserFilters.q || ''}
                onChange={(e) => setUserFilters((prev) => ({ ...prev, q: e.target.value }))}
              />
            </div>

            <select
              style={{ height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', cursor: 'pointer' }}
              value={safeUserFilters.role || ''}
              onChange={(e) => setUserFilters((prev) => ({ ...prev, role: e.target.value }))}
            >
              <option value="">Tất cả Vai trò</option>
              <option value="ADMIN">ADMIN</option>
              <option value="MANAGER">MANAGER</option>
              <option value="STAFF">STAFF</option>
              <option value="ACCOUNTANT">ACCOUNTANT</option>
            </select>

            <select
              style={{ height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', fontSize: '0.8125rem', fontWeight: '600', color: '#334155', cursor: 'pointer' }}
              value={safeUserFilters.branch_code || ''}
              onChange={(e) => setUserFilters((prev) => ({ ...prev, branch_code: e.target.value }))}
            >
              <option value="">Tất cả Chi nhánh</option>
              {safeBranchOptions.map((branch) => (
                <option key={branch.code || branch.ma_chi_nhanh} value={branch.code || branch.ma_chi_nhanh}>
                  {branch.name || branch.ten_chi_nhanh}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => loadUsers && loadUsers()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                height: '38px',
                padding: '0 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                fontSize: '0.8125rem',
                color: '#334155',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              <Filter size={14} color="#64748b" /> Lọc
            </button>
          </div>
        </div>

        {safeUsersState.loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>Đang tải danh sách tài khoản...</div>
        ) : safeUsersState.error ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#ef4444', fontWeight: '600' }}>{safeUsersState.error}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '0.85rem 1rem', width: '22%' }}>Họ tên &amp; Username</th>
                  <th style={{ padding: '0.85rem 1rem', width: '24%' }}>Email liên hệ</th>
                  <th style={{ padding: '0.85rem 1rem', width: '14%' }}>Vai trò</th>
                  <th style={{ padding: '0.85rem 1rem', width: '14%' }}>Trạng thái</th>
                  <th style={{ padding: '0.85rem 1rem', width: '16%' }}>Chi nhánh gán</th>
                  <th style={{ padding: '0.85rem 1rem', width: '10%', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {(safePageData.rows || []).filter(Boolean).map((item, index) => {
                  const avatarLetter = (String(item?.ho_ten || item?.ten_dang_nhap || 'U').trim()[0] || 'U').toUpperCase()
                  const itemId = item?.ma_nguoi_dung || item?.id || index

                  return (
                    <tr key={itemId} style={{ borderBottom: '1px solid #f1f5f9', transition: 'backgroundColor 0.15s ease' }}>
                      
                      {/* Name & Avatar & Username */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: '#e0e7ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '0.85rem', flexShrink: 0 }}>
                            {avatarLetter}
                          </div>
                          <div>
                            <strong style={{ fontSize: '0.84rem', color: '#0f172a', display: 'block' }}>{item?.ho_ten || '---'}</strong>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>@{item?.ten_dang_nhap || 'user'}</span>
                          </div>
                        </div>
                      </td>

                      {/* Email */}
                      <td style={{ padding: '0.85rem 1rem', color: '#334155' }}>
                        {item?.email || <span style={{ color: '#94a3b8' }}>Chưa cập nhật</span>}
                      </td>

                      {/* Role Badge */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            backgroundColor: item?.vai_tro === 'ADMIN' ? '#f5f3ff' : (item?.vai_tro === 'MANAGER' ? '#eff6ff' : '#ecfdf5'),
                            color: item?.vai_tro === 'ADMIN' ? '#7c3aed' : (item?.vai_tro === 'MANAGER' ? '#2563eb' : '#059669'),
                            border: item?.vai_tro === 'ADMIN' ? '1px solid #ddd6fe' : (item?.vai_tro === 'MANAGER' ? '1px solid #bfdbfe' : '1px solid #a7f3d0')
                          }}
                        >
                          {item?.vai_tro || 'STAFF'}
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            backgroundColor: item?.trang_thai === 'ACTIVE' ? '#ecfdf5' : '#fef2f2',
                            color: item?.trang_thai === 'ACTIVE' ? '#059669' : '#dc2626',
                            border: item?.trang_thai === 'ACTIVE' ? '1px solid #a7f3d0' : '1px solid #fecaca'
                          }}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item?.trang_thai === 'ACTIVE' ? '#10b981' : '#ef4444' }}></span>
                          {item?.trang_thai === 'ACTIVE' ? 'Hoạt động' : 'Tạm khóa'}
                        </span>
                      </td>

                      {/* Branch Name */}
                      <td style={{ padding: '0.85rem 1rem', color: item?.co_so_ten ? '#334155' : '#94a3b8', fontWeight: item?.co_so_ten ? '600' : '400' }}>
                        {item?.co_so_ten || 'Tất cả chi nhánh'}
                      </td>

                      {/* 3-Dots Action Dropdown */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center', position: 'relative' }}>
                        <button
                          type="button"
                          className="btn-icon-more"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenUserActionId(String(openUserActionId) === String(itemId) ? null : itemId)
                          }}
                          title="Thao tác"
                        >
                          <MoreVertical size={16} color="#475569" />
                        </button>

                        {String(openUserActionId) === String(itemId) && (
                          <div
                            style={{
                              position: 'absolute',
                              right: 'calc(100% + 6px)',
                              top: '-4px',
                              backgroundColor: '#ffffff',
                              border: '1px solid #e2e8f0',
                              borderRadius: '10px',
                              boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.18)',
                              zIndex: 9999,
                              minWidth: '170px',
                              padding: '0.35rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.2rem'
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              className="btn-dropdown-item"
                              onClick={() => {
                                setOpenUserActionId(null)
                                handleStartEdit(item)
                              }}
                              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '600', color: '#2563eb', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                            >
                              <Edit3 size={14} color="#2563eb" /> Chỉnh sửa tài khoản
                            </button>

                            <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.15rem 0' }}></div>

                            <button
                              type="button"
                              className="btn-dropdown-item danger"
                              disabled={item?.vai_tro === 'ADMIN'}
                              onClick={() => {
                                if (item?.vai_tro === 'ADMIN') return
                                setOpenUserActionId(null)
                                if (window.confirm(`Bạn có chắc muốn xóa tài khoản "${item?.ten_dang_nhap || ''}"?`)) {
                                  deleteUser(item?.ma_nguoi_dung || itemId)
                                }
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.5rem 0.75rem',
                                borderRadius: '6px',
                                fontSize: '0.8125rem',
                                fontWeight: '600',
                                color: '#dc2626',
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: item?.vai_tro === 'ADMIN' ? 'not-allowed' : 'pointer',
                                opacity: item?.vai_tro === 'ADMIN' ? 0.4 : 1,
                                textAlign: 'left',
                                width: '100%'
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
          </div>
        )}

        {/* PAGINATION FOOTER */}
        <div style={{ padding: '0.85rem 1.25rem', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Pagination pageData={safePageData} onPageChange={setUsersPage} />
        </div>
      </div>

    </section>
  )
}
