import { useEffect, useState, useRef } from 'react'
import {
  User,
  ShieldCheck,
  Lock,
  KeyRound,
  Mail,
  Phone,
  Building,
  LogOut,
  ChevronDown,
  X,
  CheckCircle2,
  Eye,
  EyeOff
} from '../../../components/console/WorkspaceIcons'
import { readWorkspaceSession, saveWorkspaceSession } from '../../../lib/workspaceAuth'
import { API_BASE_URL } from '../../admin-dashboard/constants'

function getSessionUserId(session) {
  return session?.user?.ma_nguoi_dung || session?.user?.maNguoiDung || session?.user?.id || ''
}

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return (name.slice(0, 2) || 'AD').toUpperCase()
}

/**
 * Modal: Quản lý hồ sơ cá nhân (Screenshot 2)
 */
export function UserProfileModal({ isOpen, onClose, session, onProfileUpdated }) {
  const userId = getSessionUserId(session)
  const user = session?.user || {}

  const [profileForm, setProfileForm] = useState({
    hoTen: '',
    soDienThoai: '',
    email: '',
    donVi: 'Avengers Coffee System'
  })
  const [profileState, setProfileState] = useState({ loading: false, saving: false, error: '', success: '' })

  const loadProfile = async () => {
    if (!userId) return
    setProfileState((prev) => ({ ...prev, loading: true, error: '', success: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/profile`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không thể tải thông tin cá nhân')
      setProfileForm({
        hoTen: payload?.ho_ten || user.hoTen || user.ho_ten || user.tenDangNhap || '',
        soDienThoai: payload?.so_dien_thoai || user.soDienThoai || '',
        email: payload?.email || user.email || user.tenDangNhap || 'admin',
        donVi: payload?.co_so_ten || user.coSoTen || user.donVi || 'Avengers Coffee System'
      })
      setProfileState((prev) => ({ ...prev, loading: false, error: '' }))
    } catch (error) {
      setProfileState((prev) => ({ ...prev, loading: false, error: error.message || 'Không thể tải thông tin' }))
    }
  }

  useEffect(() => {
    if (isOpen) {
      setProfileForm({
        hoTen: user.hoTen || user.ho_ten || user.tenDangNhap || 'Quản trị viên',
        soDienThoai: user.soDienThoai || '0900000000',
        email: user.email || user.tenDangNhap || 'admin',
        donVi: user.coSoTen || user.donVi || 'Avengers Coffee System'
      })
      setProfileState({ loading: false, saving: false, error: '', success: '' })
      loadProfile()
    }
  }, [isOpen, userId])

  if (!isOpen) return null

  const handleSave = async (e) => {
    e.preventDefault()
    if (!userId) return

    setProfileState((prev) => ({ ...prev, saving: true, error: '', success: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hoTen: profileForm.hoTen,
          soDienThoai: profileForm.soDienThoai
        })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không thể cập nhật hồ sơ')

      const updatedUser = {
        ...(session?.user || {}),
        hoTen: payload?.user?.ho_ten || profileForm.hoTen,
        soDienThoai: payload?.user?.so_dien_thoai || profileForm.soDienThoai
      }
      const rawSession = JSON.stringify(readWorkspaceSession())
      if (rawSession) {
        try {
          const parsed = JSON.parse(rawSession)
          saveWorkspaceSession({ ...parsed, user: updatedUser })
        } catch {
          // ignore
        }
      }

      setProfileState((prev) => ({ ...prev, saving: false, success: 'Đã cập nhật hồ sơ cá nhân thành công!' }))
      if (onProfileUpdated) onProfileUpdated(updatedUser)
      setTimeout(() => {
        onClose()
      }, 900)
    } catch (error) {
      setProfileState((prev) => ({ ...prev, saving: false, error: error.message || 'Lỗi cập nhật hồ sơ' }))
    }
  }

  const displayName = profileForm.hoTen || user.hoTen || user.ho_ten || user.tenDangNhap || 'Quản trị viên'
  const roleName = user.vaiTro || user.vai_tro || 'ADMIN'
  const roleSubtitle =
    roleName === 'ADMIN'
      ? 'Quản trị viên toàn hệ thống'
      : roleName === 'MANAGER'
      ? 'Quản lý cơ sở hệ thống'
      : 'Nhân viên hệ thống'

  const singleInitial = (displayName.trim()[0] || 'Q').toUpperCase()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '510px',
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.1rem 1.4rem',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#ffffff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <User size={20} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#0f172a' }}>
              Quản lý hồ sơ cá nhân
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '0.3rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#334155')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <X size={19} />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.35rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {/* Top Identity Banner (Screenshot 2) */}
            <div
              style={{
                backgroundColor: '#f0f7ff',
                border: '1px solid #e0f2fe',
                borderRadius: '12px',
                padding: '0.9rem 1.1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}
            >
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  backgroundColor: '#dbeafe',
                  color: '#1e40af',
                  fontSize: '1.25rem',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                {singleInitial}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#0f172a' }}>
                  {displayName}
                </h4>
                <div
                  style={{
                    margin: '0.2rem 0 0 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.78rem',
                    color: '#64748b'
                  }}
                >
                  <ShieldCheck size={14} color="#2563eb" />
                  <span>{roleSubtitle}</span>
                </div>
              </div>
            </div>

            {/* Field 1: Email (Tài khoản) - ReadOnly */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.8125rem',
                  fontWeight: '500',
                  color: '#334155'
                }}
              >
                <Mail size={15} color="#64748b" />
                <span>Địa chỉ Email (Tài khoản)</span>
              </label>
              <input
                type="text"
                readOnly
                value={profileForm.email}
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 0.85rem',
                  borderRadius: '7px',
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#f8fafc',
                  fontSize: '0.85rem',
                  color: '#64748b',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Field 2: Họ và tên * */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label
                htmlFor="modal-profile-name"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.8125rem',
                  fontWeight: '500',
                  color: '#334155'
                }}
              >
                <User size={15} color="#64748b" />
                <span>Họ và tên *</span>
              </label>
              <input
                id="modal-profile-name"
                type="text"
                required
                value={profileForm.hoTen}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, hoTen: e.target.value }))}
                placeholder="Nhập họ và tên đầy đủ"
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 0.85rem',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  fontSize: '0.85rem',
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Field 3: Tên doanh nghiệp hoặc đơn vị (Screenshot 2) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label
                htmlFor="modal-profile-donvi"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.8125rem',
                  fontWeight: '500',
                  color: '#334155'
                }}
              >
                <Building size={15} color="#64748b" />
                <span>Tên doanh nghiệp hoặc đơn vị</span>
              </label>
              <input
                id="modal-profile-donvi"
                type="text"
                value={profileForm.donVi}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, donVi: e.target.value }))}
                placeholder="Avengers Coffee System"
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 0.85rem',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  fontSize: '0.85rem',
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Field 4: Số điện thoại liên hệ */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label
                htmlFor="modal-profile-phone"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.8125rem',
                  fontWeight: '500',
                  color: '#334155'
                }}
              >
                <Phone size={15} color="#64748b" />
                <span>Số điện thoại liên hệ</span>
              </label>
              <input
                id="modal-profile-phone"
                type="text"
                value={profileForm.soDienThoai}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, soDienThoai: e.target.value }))}
                placeholder="0900000000"
                style={{
                  width: '100%',
                  height: '40px',
                  padding: '0 0.85rem',
                  borderRadius: '7px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  fontSize: '0.85rem',
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {profileState.error && (
              <p
                style={{
                  margin: 0,
                  color: '#dc2626',
                  fontSize: '0.8125rem',
                  backgroundColor: '#fef2f2',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '7px',
                  border: '1px solid #fee2e2'
                }}
              >
                {profileState.error}
              </p>
            )}

            {profileState.success && (
              <p
                style={{
                  margin: 0,
                  color: '#15803d',
                  fontSize: '0.8125rem',
                  backgroundColor: '#f0fdf4',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '7px',
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem'
                }}
              >
                <CheckCircle2 size={16} /> {profileState.success}
              </p>
            )}
          </div>

          {/* Modal Footer (Screenshot 2: Đóng (soft button), Lưu thay đổi (emerald green)) */}
          <div
            style={{
              padding: '0.95rem 1.4rem',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              backgroundColor: '#ffffff'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                height: '38px',
                padding: '0 1.25rem',
                borderRadius: '7px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                color: '#334155',
                fontSize: '0.835rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={profileState.saving}
              style={{
                height: '38px',
                padding: '0 1.35rem',
                borderRadius: '7px',
                border: 'none',
                backgroundColor: '#059669',
                color: '#ffffff',
                fontSize: '0.835rem',
                fontWeight: '600',
                cursor: profileState.saving ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!profileState.saving) e.currentTarget.style.backgroundColor = '#047857'
              }}
              onMouseLeave={(e) => {
                if (!profileState.saving) e.currentTarget.style.backgroundColor = '#059669'
              }}
            >
              {profileState.saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Modal: Đổi mật khẩu (Screenshot 3)
 */
export function ChangePasswordModal({ isOpen, onClose, session }) {
  const userId = getSessionUserId(session)
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [passwordState, setPasswordState] = useState({ saving: false, error: '', success: '' })
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordState({ saving: false, error: '', success: '' })
      setShowCurrentPwd(false)
      setShowNewPwd(false)
      setShowConfirmPwd(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    if (!userId) return

    setPasswordState({ saving: false, error: '', success: '' })

    if (passwordForm.newPassword.length < 6) {
      setPasswordState({ saving: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.', success: '' })
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordState({ saving: false, error: 'Xác nhận mật khẩu mới chưa khớp.', success: '' })
      return
    }

    setPasswordState({ saving: true, error: '', success: '' })
    try {
      const response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không thể đổi mật khẩu')

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordState({ saving: false, error: '', success: 'Đổi mật khẩu thành công!' })
      setTimeout(() => {
        onClose()
      }, 1100)
    } catch (error) {
      setPasswordState({ saving: false, error: error.message || 'Lỗi đổi mật khẩu', success: '' })
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        backdropFilter: 'blur(3px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.1rem 1.4rem',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#ffffff'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <KeyRound size={20} color="#2563eb" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#0f172a' }}>
              Đổi mật khẩu
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '0.3rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#334155')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
          >
            <X size={19} />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '1.35rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {/* Field 1: Current Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label
                htmlFor="modal-pwd-current"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.8125rem',
                  fontWeight: '500',
                  color: '#334155'
                }}
              >
                <Lock size={15} color="#64748b" />
                <span>Mật khẩu hiện tại *</span>
              </label>
              <div className="admin-password-field" style={{ position: 'relative', width: '100%', height: '40px' }}>
                <input
                  id="modal-pwd-current"
                  type={showCurrentPwd ? "text" : "password"}
                  required
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                  placeholder="Nhập mật khẩu đang sử dụng"
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 2.5rem 0 0.85rem',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontSize: '0.85rem',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                  title={showCurrentPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  aria-label={showCurrentPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
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
                    color: '#64748b',
                    zIndex: 3
                  }}
                >
                  {showCurrentPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Field 2: New Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label
                htmlFor="modal-pwd-new"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.8125rem',
                  fontWeight: '500',
                  color: '#334155'
                }}
              >
                <KeyRound size={15} color="#64748b" />
                <span>Mật khẩu mới *</span>
              </label>
              <div className="admin-password-field" style={{ position: 'relative', width: '100%', height: '40px' }}>
                <input
                  id="modal-pwd-new"
                  type={showNewPwd ? "text" : "password"}
                  required
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                  placeholder="Tối thiểu 6 ký tự"
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 2.5rem 0 0.85rem',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontSize: '0.85rem',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() => setShowNewPwd(!showNewPwd)}
                  title={showNewPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  aria-label={showNewPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
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
                    color: '#64748b',
                    zIndex: 3
                  }}
                >
                  {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Field 3: Confirm Password */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label
                htmlFor="modal-pwd-confirm"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.8125rem',
                  fontWeight: '500',
                  color: '#334155'
                }}
              >
                <KeyRound size={15} color="#64748b" />
                <span>Xác nhận mật khẩu mới *</span>
              </label>
              <div className="admin-password-field" style={{ position: 'relative', width: '100%', height: '40px' }}>
                <input
                  id="modal-pwd-confirm"
                  type={showConfirmPwd ? "text" : "password"}
                  required
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                  placeholder="Nhập lại mật khẩu mới"
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 2.5rem 0 0.85rem',
                    borderRadius: '7px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    fontSize: '0.85rem',
                    color: '#0f172a',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="button"
                  className="admin-password-toggle"
                  onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                  title={showConfirmPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  aria-label={showConfirmPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
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
                    color: '#64748b',
                    zIndex: 3
                  }}
                >
                  {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {passwordState.error && (
              <p
                style={{
                  margin: 0,
                  color: '#dc2626',
                  fontSize: '0.8125rem',
                  backgroundColor: '#fef2f2',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '7px',
                  border: '1px solid #fee2e2'
                }}
              >
                {passwordState.error}
              </p>
            )}

            {passwordState.success && (
              <p
                style={{
                  margin: 0,
                  color: '#15803d',
                  fontSize: '0.8125rem',
                  backgroundColor: '#f0fdf4',
                  padding: '0.55rem 0.85rem',
                  borderRadius: '7px',
                  border: '1px solid #bbf7d0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem'
                }}
              >
                <CheckCircle2 size={16} /> {passwordState.success}
              </p>
            )}
          </div>

          {/* Modal Footer (Screenshot 3: Đóng, Đổi mật khẩu (solid dark navy/blue)) */}
          <div
            style={{
              padding: '0.95rem 1.4rem',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              backgroundColor: '#ffffff'
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                height: '38px',
                padding: '0 1.25rem',
                borderRadius: '7px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                color: '#334155',
                fontSize: '0.835rem',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={passwordState.saving}
              style={{
                height: '38px',
                padding: '0 1.35rem',
                borderRadius: '7px',
                border: 'none',
                backgroundColor: '#1e3a8a',
                color: '#ffffff',
                fontSize: '0.835rem',
                fontWeight: '600',
                cursor: passwordState.saving ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!passwordState.saving) e.currentTarget.style.backgroundColor = '#1e40af'
              }}
              onMouseLeave={(e) => {
                if (!passwordState.saving) e.currentTarget.style.backgroundColor = '#1e3a8a'
              }}
            >
              {passwordState.saving ? 'Đang cập nhật...' : 'Đổi mật khẩu'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Top-Right Header User Menu Button & Dropdown (Screenshot 1)
 */
export function TopbarUserDropdown({ session, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const menuRef = useRef(null)

  const user = session?.user || {}
  const displayName = user.hoTen || user.ho_ten || user.tenDangNhap || user.ten_dang_nhap || 'Quản trị viên'
  const initials = getInitials(displayName)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger Button (Screenshot 1: Blue border pill with avatar circle, name, chevron) */}
      <button
        type="button"
        onClick={() => setMenuOpen((prev) => !prev)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.55rem',
          padding: '0.22rem 0.75rem 0.22rem 0.35rem',
          borderRadius: '9999px',
          border: '1.5px solid #2563eb',
          backgroundColor: '#ffffff',
          cursor: 'pointer',
          outline: 'none',
          boxShadow: '0 1px 2px rgba(37, 99, 235, 0.08)',
          transition: 'all 0.15s ease'
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: '#eff6ff',
            color: '#1d4ed8',
            fontSize: '0.75rem',
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
        >
          {initials}
        </div>
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: '600',
            color: '#0f172a',
            whiteSpace: 'nowrap'
          }}
        >
          {displayName}
        </span>
        <ChevronDown
          size={14}
          color="#64748b"
          style={{
            transform: menuOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease'
          }}
        />
      </button>

      {/* Floating Dropdown Menu (Screenshot 1) */}
      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: '185px',
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e2e8f0',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            padding: '0.35rem 0',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Item 1: Quản lý hồ sơ */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              setProfileModalOpen(true)
            }}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              background: 'none',
              border: 'none',
              fontSize: '0.8125rem',
              color: '#334155',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <User size={16} color="#64748b" />
            <span>Quản lý hồ sơ</span>
          </button>

          {/* Item 2: Đổi mật khẩu */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              setPasswordModalOpen(true)
            }}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              background: 'none',
              border: 'none',
              fontSize: '0.8125rem',
              color: '#334155',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <KeyRound size={16} color="#64748b" />
            <span>Đổi mật khẩu</span>
          </button>

          <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '0.3rem 0' }} />

          {/* Item 3: Đăng xuất */}
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false)
              if (onLogout) onLogout()
            }}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              background: 'none',
              border: 'none',
              fontSize: '0.8125rem',
              color: '#dc2626',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fef2f2')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <LogOut size={16} color="#dc2626" />
            <span>Đăng xuất</span>
          </button>
        </div>
      )}

      {/* Profile Modal */}
      <UserProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        session={session}
      />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        session={session}
      />
    </div>
  )
}
