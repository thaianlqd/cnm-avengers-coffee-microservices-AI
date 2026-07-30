import React, { useState } from 'react'
import { UserPlus, UsersIcon, Search, Filter, MoreVertical, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

function Pagination({ pageData, onPageChange }) {
  if (!pageData || pageData.total <= 10) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', fontSize: '0.875rem', color: '#6b7280', paddingTop: '0.85rem', marginTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
      <span>Hiển thị {pageData.from} - {pageData.to} trên tổng số {pageData.total}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(1)} disabled={pageData.page <= 1} title="Trang đầu">
          <ChevronsLeft size={18} />
        </button>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.page - 1)} disabled={pageData.page <= 1} title="Trang trước">
          <ChevronLeft size={18} />
        </button>
        <span style={{ margin: '0 0.5rem', fontWeight: '600', color: '#334155', fontSize: '0.825rem' }}>Trang {pageData.page} trên {pageData.totalPages}</span>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.page + 1)} disabled={pageData.page >= pageData.totalPages} title="Trang sau">
          <ChevronRight size={18} />
        </button>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.totalPages)} disabled={pageData.page >= pageData.totalPages} title="Trang cuối">
          <ChevronsRight size={18} />
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
  const [openUserActionId, setOpenUserActionId] = useState(null)

  return (
    <section style={{ padding: '2rem', backgroundColor: '#f7f9fb', minHeight: '100%', border: 'none', flexGrow: 1 }}>
      <div>
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Quản lý Người dùng &amp; Phân quyền
            </h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Quản lý tài khoản STAFF/MANAGER và phân bổ chi nhánh.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setUserForm({
                ten_dang_nhap: '',
                ho_ten: '',
                email: '',
                mat_khau: '',
                vai_tro: 'STAFF',
                co_so_ma: '',
                trang_thai: 'ACTIVE'
              })
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#2563eb',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 1px 2px 0 rgba(37, 99, 235, 0.3)'
            }}
          >
            <UserPlus size={16} /> Thêm tài khoản
          </button>
        </div>

        {/* User Form Card */}
        <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #f3f4f6', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)', marginBottom: '2rem' }}>
          <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: '600', color: '#111827' }}>
              {editingUserId ? 'Cập nhật tài khoản' : 'Tạo tài khoản mới'}
            </h2>
            {editingUserId && (
              <span style={{ fontSize: '0.75rem', color: '#6b7280', backgroundColor: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '0.25rem' }}>
                Đang chỉnh sửa: #{editingUserId}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4b5563' }}>Username</label>
              <input
                className="modern-input"
                value={userForm.ten_dang_nhap || ''}
                onChange={(e) => setUserForm((p) => ({ ...p, ten_dang_nhap: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4b5563' }}>Họ tên</label>
              <input
                className="modern-input"
                value={userForm.ho_ten || ''}
                onChange={(e) => setUserForm((p) => ({ ...p, ho_ten: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4b5563' }}>Email</label>
              <input
                className="modern-input"
                value={userForm.email || ''}
                onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4b5563' }}>
                Mật khẩu {editingUserId ? '(để trống nếu giữ nguyên)' : ''}
              </label>
              <input
                type="password"
                className="modern-input"
                value={userForm.mat_khau || ''}
                onChange={(e) => setUserForm((p) => ({ ...p, mat_khau: e.target.value }))}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4b5563' }}>Vai trò</label>
              <select
                className="modern-select"
                value={userForm.vai_tro || 'STAFF'}
                onChange={(e) => setUserForm((p) => ({ ...p, vai_tro: e.target.value }))}
              >
                <option value="STAFF">STAFF</option>
                <option value="MANAGER">MANAGER</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4b5563' }}>Chi nhánh</label>
              <select
                className="modern-select"
                value={userForm.co_so_ma || ''}
                onChange={(e) => setUserForm((p) => ({ ...p, co_so_ma: e.target.value }))}
              >
                {(branchOptions || []).map((branch) => (
                  <option key={branch.code} value={branch.code}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
            {editingUserId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#4b5563' }}>Trạng thái</label>
                <select
                  className="modern-select"
                  value={userForm.trang_thai || 'ACTIVE'}
                  onChange={(e) => setUserForm((p) => ({ ...p, trang_thai: e.target.value }))}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={saveUser}
              disabled={savingUser}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: '#2563eb',
                color: 'white',
                padding: '0.5rem 1.25rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                border: 'none',
                cursor: savingUser ? 'not-allowed' : 'pointer',
                opacity: savingUser ? 0.7 : 1
              }}
            >
              {savingUser ? 'Đang lưu...' : 'Lưu tài khoản'}
            </button>
            {editingUserId && (
              <button
                type="button"
                onClick={cancelEditUser}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  border: '1px solid #d1d5db',
                  cursor: 'pointer'
                }}
              >
                Hủy sửa
              </button>
            )}
          </div>
        </div>

        {/* User Data Table Card */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '1rem', border: '1px solid #e5e7eb', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)', overflow: 'hidden', marginBottom: '2rem' }}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '600', color: '#111827', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <UsersIcon size={18} color="#6b7280" /> Danh sách Người dùng
            </h2>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} color="#9ca3af" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  className="modern-input"
                  style={{ paddingLeft: '2.25rem' }}
                  placeholder="Tìm username, họ tên..."
                  value={userFilters.q || ''}
                  onChange={(e) => setUserFilters((prev) => ({ ...prev, q: e.target.value }))}
                />
              </div>
              <select
                className="modern-select"
                value={userFilters.role || ''}
                onChange={(e) => setUserFilters((prev) => ({ ...prev, role: e.target.value }))}
              >
                <option value="">Tất cả Vai trò</option>
                <option value="ADMIN">ADMIN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="STAFF">STAFF</option>
              </select>
              <select
                className="modern-select"
                value={userFilters.branch_code || ''}
                onChange={(e) => setUserFilters((prev) => ({ ...prev, branch_code: e.target.value }))}
              >
                <option value="">Tất cả chi nhánh</option>
                {(branchOptions || []).map((branch) => (
                  <option key={branch.code} value={branch.code}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => loadUsers && loadUsers()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.375rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#ffffff',
                  fontSize: '0.875rem',
                  color: '#374151',
                  cursor: 'pointer',
                  fontWeight: '500'
                }}
              >
                <Filter size={14} /> Lọc
              </button>
            </div>
          </div>

          {usersState.loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>Đang tải người dùng...</div>
          ) : usersState.error ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>{usersState.error}</div>
          ) : (
            <div className="system-admin-table-wrap">
              <table className="system-admin-table">
                <thead>
                  <tr>
                    <th style={{ width: '22%', whiteSpace: 'nowrap' }}>Người dùng</th>
                    <th style={{ width: '26%', whiteSpace: 'nowrap' }}>Email</th>
                    <th style={{ width: '12%', whiteSpace: 'nowrap' }}>Vai trò</th>
                    <th style={{ width: '12%', whiteSpace: 'nowrap' }}>Trạng thái</th>
                    <th style={{ width: '16%', whiteSpace: 'nowrap' }}>Chi nhánh</th>
                    <th style={{ width: '12%', textAlign: 'center', whiteSpace: 'nowrap' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {(usersPageData?.rows || []).map((item) => (
                    <tr key={item.ma_nguoi_dung}>
                      <td style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                          <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.8125rem', border: '1px solid #c7d2fe', flexShrink: 0 }}>
                            {item.ho_ten ? item.ho_ten.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <strong style={{ fontSize: '0.8125rem', color: '#0f172a', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.ho_ten}>
                              {item.ho_ten || '---'}
                            </strong>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis' }} title={`@${item.ten_dang_nhap}`}>
                              @{item.ten_dang_nhap}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        <span style={{ fontSize: '0.8125rem', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }} title={item.email || ''}>
                          {item.email || '---'}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '0.15rem 0.55rem',
                          borderRadius: '9999px',
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          backgroundColor: item.vai_tro === 'ADMIN' ? '#f5f3ff' : (item.vai_tro === 'MANAGER' ? '#eff6ff' : '#ecfdf5'),
                          color: item.vai_tro === 'ADMIN' ? '#7c3aed' : (item.vai_tro === 'MANAGER' ? '#2563eb' : '#059669'),
                          border: item.vai_tro === 'ADMIN' ? '1px solid #ddd6fe' : (item.vai_tro === 'MANAGER' ? '1px solid #bfdbfe' : '1px solid #a7f3d0')
                        }}>
                          {item.vai_tro}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                          padding: '0.12rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.72rem',
                          fontWeight: '600',
                          backgroundColor: item.trang_thai === 'ACTIVE' ? '#ecfdf5' : '#fef2f2',
                          color: item.trang_thai === 'ACTIVE' ? '#059669' : '#dc2626',
                          border: item.trang_thai === 'ACTIVE' ? '1px solid #a7f3d0' : '1px solid #fee2e2'
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.trang_thai === 'ACTIVE' ? '#10b981' : '#ef4444' }}></span>
                          {item.trang_thai}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                        <span style={{ fontSize: '0.8125rem', color: item.co_so_ten ? '#334155' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }} title={item.co_so_ten || ''}>
                          {item.co_so_ten || 'Không gán'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', position: 'relative', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="btn-icon-more"
                          onClick={(e) => {
                            e.stopPropagation()
                            setOpenUserActionId(openUserActionId === item.ma_nguoi_dung ? null : item.ma_nguoi_dung)
                          }}
                          title="Thao tác"
                        >
                          <MoreVertical size={16} color="#475569" />
                        </button>

                        {openUserActionId === item.ma_nguoi_dung && (
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
                              minWidth: '170px',
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
                                setOpenUserActionId(null)
                                startEditUser(item)
                              }}
                            >
                              Chỉnh sửa tài khoản
                            </button>

                            <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.2rem 0' }}></div>

                            <button
                              type="button"
                              className="btn-dropdown-item danger"
                              disabled={item.vai_tro === 'ADMIN'}
                              style={{
                                opacity: item.vai_tro === 'ADMIN' ? 0.5 : 1,
                                cursor: item.vai_tro === 'ADMIN' ? 'not-allowed' : 'pointer'
                              }}
                              onClick={() => {
                                if (item.vai_tro === 'ADMIN') return
                                setOpenUserActionId(null)
                                deleteUser(item.ma_nguoi_dung)
                              }}
                            >
                              Xóa tài khoản
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', backgroundColor: '#f9fafb' }}>
            <Pagination pageData={usersPageData} onPageChange={setUsersPage} />
          </div>
        </div>
      </div>
    </section>
  )
}
