import { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { API_BASE_URL } from '../../admin-dashboard/constants'
import {
  User,
  ShieldCheck,
  Lock,
  Bell,
  CheckCircle2,
  KeyRound,
  CheckCheck,
  Mail,
  Phone,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  AlertCircle
} from 'lucide-react'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:3005`
const ADMIN_LOCAL_NOTIFY_EVENT = 'avengers-admin-local-notify'
const PAGE_SIZE = 8

function getSessionUserId(session) {
  return session?.user?.ma_nguoi_dung || session?.user?.maNguoiDung || ''
}

function fmtDateTime(value) {
  if (!value) return '---'
  try {
    return new Date(value).toLocaleString('vi-VN')
  } catch {
    return String(value)
  }
}

function normalizeNotificationPayload(payload) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.items)) return payload.items
  return []
}

export function AccountCenterPanel({ session }) {
  const userId = getSessionUserId(session)
  const [activeTab, setActiveTab] = useState('profile') // 'profile' | 'security' | 'notifications'
  const [profileForm, setProfileForm] = useState({
    hoTen: '',
    soDienThoai: '',
    email: '',
    avatarUrl: '',
  })
  const [profileState, setProfileState] = useState({ loading: false, saving: false, error: '', success: '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [passwordState, setPasswordState] = useState({ saving: false, error: '', success: '' })
  const [notificationsState, setNotificationsState] = useState({ loading: false, error: '', items: [] })
  const [markingNotificationId, setMarkingNotificationId] = useState('')
  const [markingAll, setMarkingAll] = useState(false)
  const [notificationPage, setNotificationPage] = useState(1)

  const unreadCount = useMemo(
    () => notificationsState.items.filter((item) => !item.da_doc).length,
    [notificationsState.items],
  )
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((notificationsState.items?.length || 0) / PAGE_SIZE)),
    [notificationsState.items],
  )
  const safePage = useMemo(() => Math.min(Math.max(notificationPage, 1), totalPages), [notificationPage, totalPages])
  const pageNotificationItems = useMemo(
    () => (notificationsState.items || []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [notificationsState.items, safePage],
  )

  const pushLocalNotification = (tieuDe, noiDung) => {
    window.dispatchEvent(new CustomEvent(ADMIN_LOCAL_NOTIFY_EVENT, {
      detail: {
        tieu_de: tieuDe,
        noi_dung: noiDung,
      },
    }))
  }

  useEffect(() => {
    if (notificationPage > totalPages) {
      setNotificationPage(totalPages)
    }
  }, [notificationPage, totalPages])

  const loadProfile = async () => {
    if (!userId) return
    setProfileState((prev) => ({ ...prev, loading: true, error: '', success: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/profile`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không thể tải thông tin cá nhân')
      setProfileForm({
        hoTen: payload?.ho_ten || '',
        soDienThoai: payload?.so_dien_thoai || '',
        email: payload?.email || '',
        avatarUrl: payload?.avatar_url || '',
      })
      setProfileState((prev) => ({ ...prev, loading: false, error: '' }))
    } catch (error) {
      setProfileState((prev) => ({ ...prev, loading: false, error: error.message || 'Không thể tải thông tin cá nhân' }))
    }
  }

  const loadNotifications = async () => {
    if (!userId) return
    setNotificationsState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${encodeURIComponent(userId)}/notifications?limit=30`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không thể tải thông báo')
      setNotificationsState({
        loading: false,
        error: '',
        items: normalizeNotificationPayload(payload),
      })
    } catch (error) {
      setNotificationsState((prev) => ({ ...prev, loading: false, error: error.message || 'Không thể tải thông báo' }))
    }
  }

  useEffect(() => {
    if (!userId) return
    loadProfile()
    loadNotifications()

    const socket = io(`${SOCKET_URL}/notifications`, {
      transports: ['websocket'],
      auth: { userId },
    })

    socket.on('connect', () => {
      socket.emit('notifications:subscribe', { userId })
      loadNotifications()
    })

    socket.on('notification:new', (notification) => {
      if (!notification?.id) return
      setNotificationsState((prev) => {
        const items = Array.isArray(prev.items) ? prev.items : []
        if (items.some((item) => item.id === notification.id)) {
          return prev
        }
        return {
          ...prev,
          items: [notification, ...items].slice(0, 30),
        }
      })
    })

    const timer = window.setInterval(() => {
      loadNotifications()
    }, 15000)

    return () => {
      window.clearInterval(timer)
      socket.disconnect()
    }
  }, [userId])

  const saveProfile = async (event) => {
    event.preventDefault()
    if (!userId) return

    setProfileState((prev) => ({ ...prev, saving: true, error: '', success: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hoTen: profileForm.hoTen,
          soDienThoai: profileForm.soDienThoai,
          email: profileForm.email,
          avatarUrl: profileForm.avatarUrl,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không thể cập nhật thông tin cá nhân')

      const mergedUser = {
        ...(session?.user || {}),
        hoTen: payload?.user?.ho_ten || profileForm.hoTen,
        email: payload?.user?.email || profileForm.email,
      }
      const rawSession = window.localStorage.getItem('adminSession')
      if (rawSession) {
        try {
          const parsed = JSON.parse(rawSession)
          window.localStorage.setItem('adminSession', JSON.stringify({ ...parsed, user: mergedUser }))
        } catch {
          // Ignore storage parsing failures.
        }
      }

      setProfileState((prev) => ({ ...prev, saving: false, success: 'Đã cập nhật thông tin cá nhân thành công.' }))
      pushLocalNotification('Cập nhật hồ sơ', 'Thông tin hồ sơ cá nhân đã được cập nhật thành công.')
      await loadProfile()
    } catch (error) {
      setProfileState((prev) => ({ ...prev, saving: false, error: error.message || 'Không thể cập nhật thông tin cá nhân' }))
    }
  }

  const changePassword = async (event) => {
    event.preventDefault()
    if (!userId) return

    setPasswordState({ saving: false, error: '', success: '' })

    if (passwordForm.newPassword.length < 6) {
      setPasswordState({ saving: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự.', success: '' })
      return
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordState({ saving: false, error: 'Xác nhận mật khẩu chưa khớp.', success: '' })
      return
    }

    setPasswordState({ saving: true, error: '', success: '' })
    try {
      const response = await fetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không thể đổi mật khẩu')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setPasswordState({ saving: false, error: '', success: 'Đổi mật khẩu thành công.' })
      pushLocalNotification('Đổi mật khẩu', 'Bạn đã đổi mật khẩu tài khoản thành công.')
    } catch (error) {
      setPasswordState({ saving: false, error: error.message || 'Không thể đổi mật khẩu', success: '' })
    }
  }

  const markOneNotificationRead = async (notificationId) => {
    if (!userId || !notificationId) return
    setMarkingNotificationId(String(notificationId))
    try {
      const response = await fetch(
        `${API_BASE_URL}/customers/${encodeURIComponent(userId)}/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'PATCH' },
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không thể đánh dấu đã đọc')
      await loadNotifications()
    } catch (error) {
      setNotificationsState((prev) => ({ ...prev, error: error.message || 'Không thể đánh dấu đã đọc' }))
    } finally {
      setMarkingNotificationId('')
    }
  }

  const markAllNotificationsRead = async () => {
    if (!userId) return
    setMarkingAll(true)
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${encodeURIComponent(userId)}/notifications/read-all`, {
        method: 'PATCH',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không thể đánh dấu đã đọc toàn bộ')
      await loadNotifications()
    } catch (error) {
      setNotificationsState((prev) => ({ ...prev, error: error.message || 'Không thể đánh dấu đã đọc toàn bộ' }))
    } finally {
      setMarkingAll(false)
    }
  }

  const userRole = session?.user?.vaiTro || session?.user?.vai_tro || 'ADMIN'
  const displayName = profileForm.hoTen || session?.user?.hoTen || session?.user?.tenDangNhap || 'System Admin'

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
      
      {/* Sleek Top Banner Header */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        border: '1px solid #e2e8f0',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        alignItems: 'center',
        justify: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Clean Centered Avatar Box */}
          <div style={{ width: '3.5rem', height: '3.5rem', flexShrink: 0 }}>
            {profileForm.avatarUrl ? (
              <img
                src={profileForm.avatarUrl}
                alt="Avatar"
                style={{ width: '3.5rem', height: '3.5rem', borderRadius: '50%', objectFit: 'cover', border: '2px solid #6366f1', display: 'block' }}
              />
            ) : (
              <div style={{
                width: '3.5rem',
                height: '3.5rem',
                borderRadius: '50%',
                backgroundColor: '#eef2ff',
                color: '#4f46e5',
                display: 'flex',
                alignItems: 'center',
                justify: 'center',
                fontWeight: '700',
                fontSize: '1.35rem',
                lineHeight: 1,
                textAlign: 'center',
                border: '2px solid #c7d2fe',
                boxSizing: 'border-box'
              }}>
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#0f172a' }}>
                {displayName}
              </h1>
              <span style={{
                backgroundColor: userRole === 'ADMIN' ? '#f5f3ff' : '#eff6ff',
                color: userRole === 'ADMIN' ? '#7c3aed' : '#2563eb',
                border: userRole === 'ADMIN' ? '1px solid #ddd6fe' : '1px solid #bfdbfe',
                fontSize: '0.7rem',
                fontWeight: '700',
                padding: '0.12rem 0.5rem',
                borderRadius: '999px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                {userRole}
              </span>
            </div>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78125rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Mail size={13} color="#94a3b8" /> {profileForm.email || session?.user?.email || 'admin@avengers.coffee'}</span>
              {profileForm.soDienThoai && (
                <>
                  <span>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Phone size={13} color="#94a3b8" /> {profileForm.soDienThoai}</span>
                </>
              )}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ backgroundColor: '#f8fafc', padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={16} color="#10b981" />
            <span style={{ fontSize: '0.78125rem', color: '#0f172a', fontWeight: '600' }}>Tài khoản An toàn</span>
          </div>
        </div>
      </div>

      {!userId ? (
        <div style={{ padding: '0.85rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', color: '#dc2626', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertCircle size={16} /> Không tìm thấy mã người dùng trong phiên đăng nhập hiện tại.
        </div>
      ) : null}

      {/* Clean Sub-Navigation Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        borderBottom: '1px solid #e2e8f0',
        backgroundColor: '#ffffff',
        padding: '0.5rem 0.75rem',
        borderRadius: '8px',
        border: '1px solid #e2e8f0'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            fontSize: '0.8125rem',
            fontWeight: '600',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: activeTab === 'profile' ? '#eef2ff' : 'transparent',
            color: activeTab === 'profile' ? '#4f46e5' : '#64748b',
            transition: 'all 0.15s ease'
          }}
        >
          <User size={15} /> Hồ sơ cá nhân
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            fontSize: '0.8125rem',
            fontWeight: '600',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: activeTab === 'security' ? '#eef2ff' : 'transparent',
            color: activeTab === 'security' ? '#4f46e5' : '#64748b',
            transition: 'all 0.15s ease'
          }}
        >
          <Lock size={15} /> Đổi mật khẩu &amp; Bảo mật
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('notifications')}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            fontSize: '0.8125rem',
            fontWeight: '600',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: activeTab === 'notifications' ? '#eef2ff' : 'transparent',
            color: activeTab === 'notifications' ? '#4f46e5' : '#64748b',
            transition: 'all 0.15s ease'
          }}
        >
          <Bell size={15} /> Thông báo hệ thống {unreadCount > 0 && <span style={{ backgroundColor: '#ef4444', color: '#fff', fontSize: '0.68rem', borderRadius: '999px', padding: '0.08rem 0.4rem', fontWeight: '700' }}>{unreadCount}</span>}
        </button>
      </div>

      {/* TAB 1: Profile Info */}
      {activeTab === 'profile' && (
        <section className="system-admin-card" style={{ borderTop: '3px solid #4f46e5' }}>
          <div style={{ marginBottom: '1.25rem', paddingBottom: '0.65rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '600', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={17} color="#4f46e5" /> Cập nhật hồ sơ cá nhân
            </h2>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Thông tin tài khoản {session?.user?.tenDangNhap}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
            {/* Left Column: Form Inputs */}
            <div>
              {profileState.loading ? <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>Đang tải thông tin...</p> : null}

              <form onSubmit={saveProfile} style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#334155' }}>Họ tên đầy đủ</label>
                    <input
                      value={profileForm.hoTen}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, hoTen: e.target.value }))}
                      placeholder="Nhập họ tên đầy đủ"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#334155' }}>Số điện thoại</label>
                    <input
                      value={profileForm.soDienThoai}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, soDienThoai: e.target.value }))}
                      placeholder="Nhập số điện thoại"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#334155' }}>Email liên hệ</label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Nhập địa chỉ email"
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#334155' }}>Đường dẫn Ảnh Avatar (URL)</label>
                  <input
                    value={profileForm.avatarUrl}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                    placeholder="Dán liên kết URL ảnh đại diện (https://...)"
                  />
                </div>

                {profileState.error ? (
                  <p style={{ margin: 0, color: '#dc2626', fontSize: '0.8125rem', backgroundColor: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fee2e2' }}>
                    {profileState.error}
                  </p>
                ) : null}

                {profileState.success ? (
                  <p style={{ margin: 0, color: '#059669', fontSize: '0.8125rem', backgroundColor: '#ecfdf5', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <CheckCircle2 size={16} /> {profileState.success}
                  </p>
                ) : null}

                <div className="system-admin-form-actions" style={{ marginTop: '0.25rem' }}>
                  <button type="submit" disabled={profileState.saving || !userId}>
                    <CheckCircle2 size={15} /> {profileState.saving ? 'Đang lưu...' : 'Lưu thay đổi hồ sơ'}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Avatar Preview & Account Info Card */}
            <div style={{ backgroundColor: '#f8fafc', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center', textAlign: 'center' }}>
              <span style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#475569', alignSelf: 'flex-start' }}>Xem trước ảnh đại diện</span>
              
              <div style={{ width: '5.5rem', height: '5.5rem', borderRadius: '50%', overflow: 'hidden', border: '3px solid #6366f1', boxShadow: '0 4px 10px rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef2ff' }}>
                {profileForm.avatarUrl ? (
                  <img src={profileForm.avatarUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '2rem', fontWeight: '700', color: '#4f46e5' }}>{displayName.charAt(0).toUpperCase()}</span>
                )}
              </div>

              <div>
                <h4 style={{ margin: '0 0 0.2rem 0', fontSize: '0.9375rem', fontWeight: '700', color: '#0f172a' }}>{displayName}</h4>
                <p style={{ margin: 0, fontSize: '0.78125rem', color: '#64748b' }}>{profileForm.email || 'admin@avengers.coffee'}</p>
              </div>

              <div style={{ width: '100%', borderTop: '1px solid #e2e8f0', paddingTop: '0.85rem', display: 'grid', gap: '0.4rem', textAlign: 'left', fontSize: '0.78125rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Mã người dùng:</span>
                  <span style={{ fontWeight: '600', color: '#0f172a', fontFamily: 'monospace' }}>{userId || '---'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Vai trò quyền hạn:</span>
                  <span style={{ fontWeight: '600', color: '#4f46e5' }}>{userRole}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748b' }}>Xác thực tài khoản:</span>
                  <span style={{ fontWeight: '600', color: '#10b981' }}>Đã xác thực ✓</span>
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.72rem', color: '#64748b', textAlign: 'left', lineHeight: 1.35, width: '100%', boxSizing: 'border-box' }}>
                💡 <strong>Mẹo:</strong> Dán đường dẫn ảnh PNG/JPG sắc nét tỉ lệ 1:1 để ảnh đại diện hiển thị tối ưu nhất.
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 2: Change Password */}
      {activeTab === 'security' && (
        <section className="system-admin-card" style={{ borderTop: '3px solid #0284c7' }}>
          <div style={{ marginBottom: '1.25rem', paddingBottom: '0.65rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '600', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Lock size={17} color="#0284c7" /> Thao tác đổi mật khẩu tài khoản
            </h2>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Đảm bảo an toàn hệ thống</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
            {/* Left Column: Password Form */}
            <div>
              <form onSubmit={changePassword} style={{ display: 'grid', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#334155' }}>Mật khẩu hiện tại</label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#334155' }}>Mật khẩu mới</label>
                    <input
                      type="password"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                      placeholder="Tối thiểu 6 ký tự"
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#334155' }}>Xác nhận mật khẩu mới</label>
                    <input
                      type="password"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Nhập lại mật khẩu mới"
                    />
                  </div>
                </div>

                {passwordState.error ? (
                  <p style={{ margin: 0, color: '#dc2626', fontSize: '0.8125rem', backgroundColor: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fee2e2' }}>
                    {passwordState.error}
                  </p>
                ) : null}

                {passwordState.success ? (
                  <p style={{ margin: 0, color: '#059669', fontSize: '0.8125rem', backgroundColor: '#ecfdf5', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <CheckCircle2 size={16} /> {passwordState.success}
                  </p>
                ) : null}

                <div className="system-admin-form-actions" style={{ marginTop: '0.25rem' }}>
                  <button type="submit" disabled={passwordState.saving || !userId} style={{ backgroundColor: '#0284c7' }}>
                    <KeyRound size={15} /> {passwordState.saving ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Security Best Practices Widget */}
            <div style={{ backgroundColor: '#f8fafc', padding: '1.25rem', borderRadius: '10px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={18} color="#0284c7" />
                <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '700', color: '#0f172a' }}>Nguyên tắc bảo mật tài khoản</h4>
              </div>

              <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.78125rem', color: '#475569', display: 'grid', gap: '0.45rem', lineHeight: 1.45 }}>
                <li>Mật khẩu mới phải bao gồm ít nhất <strong>6 ký tự</strong>.</li>
                <li>Nên kết hợp cả <strong>chữ hoa, chữ thường, số</strong> và ký tự đặc biệt (!@#$).</li>
                <li>Đổi mật khẩu định kỳ <strong>90 ngày/lần</strong> để giữ an toàn tuyệt đối.</li>
                <li>Tuyệt đối không chia sẻ thông tin tài khoản Admin với người khác.</li>
              </ul>

              <div style={{ backgroundColor: '#f0f9ff', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid #bae6fd', fontSize: '0.72rem', color: '#0369a1', lineHeight: 1.35 }}>
                🛡️ <strong>Lưu ý:</strong> Khi đổi mật khẩu thành công, thông báo bảo mật sẽ tự động gửi tới email của bạn.
              </div>
            </div>
          </div>
        </section>
      )}

      {/* TAB 3: Notifications Center */}
      {activeTab === 'notifications' && (
        <section className="system-admin-card" style={{ borderTop: '3px solid #10b981' }}>
          <div style={{ marginBottom: '1rem', paddingBottom: '0.65rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h2 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: '600', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Bell size={17} color="#10b981" /> Trung tâm thông báo hệ thống
              </h2>
              <span style={{
                backgroundColor: unreadCount > 0 ? '#fee2e2' : '#f1f5f9',
                color: unreadCount > 0 ? '#dc2626' : '#64748b',
                fontSize: '0.7rem',
                fontWeight: '700',
                padding: '0.12rem 0.5rem',
                borderRadius: '999px',
                border: unreadCount > 0 ? '1px solid #fca5a5' : '1px solid #e2e8f0'
              }}>
                Chưa đọc: {unreadCount}
              </span>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={markAllNotificationsRead}
              disabled={markingAll || !userId || unreadCount === 0}
              style={{ fontSize: '0.78125rem' }}
            >
              <CheckCheck size={14} /> {markingAll ? 'Đang xử lý...' : 'Đánh dấu đã đọc tất cả'}
            </button>
          </div>

          {notificationsState.loading ? <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>Đang tải danh sách thông báo...</p> : null}
          {notificationsState.error ? <p className="error-text">{notificationsState.error}</p> : null}

          {!notificationsState.loading && !notificationsState.items.length ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
              Hiện tại bạn chưa có thông báo hệ thống nào.
            </div>
          ) : null}

          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {pageNotificationItems.map((item) => (
              <article
                key={item.id}
                style={{
                  padding: '0.75rem 0.9rem',
                  borderRadius: '8px',
                  border: item.da_doc ? '1px solid #e2e8f0' : '1px solid #bfdbfe',
                  backgroundColor: item.da_doc ? '#ffffff' : '#eff6ff',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ flexGrow: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                    {!item.da_doc ? (
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#2563eb', display: 'inline-block' }}></span>
                    ) : null}
                    <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: '#0f172a' }}>
                      {item.tieu_de || 'Thông báo hệ thống'}
                    </h4>
                  </div>
                  <p style={{ margin: '0 0 0.2rem 0', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.4 }}>
                    {item.noi_dung || ''}
                  </p>
                  <small style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {fmtDateTime(item.ngay_tao)}
                  </small>
                </div>

                {!item.da_doc ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => markOneNotificationRead(item.id)}
                    disabled={markingNotificationId === String(item.id)}
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.55rem', flexShrink: 0 }}
                  >
                    {markingNotificationId === String(item.id) ? 'Đang lưu...' : 'Đọc'}
                  </button>
                ) : (
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', padding: '0.2rem 0.4rem', flexShrink: 0 }}>Đã đọc</span>
                )}
              </article>
            ))}
          </div>

          {notificationsState.items.length > PAGE_SIZE ? (
            <div style={{ marginTop: '0.85rem', paddingTop: '0.65rem', borderTop: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78125rem', color: '#64748b' }}>
              <span>Hiển thị {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, notificationsState.items.length)} / {notificationsState.items.length} thông báo</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <button type="button" className="secondary" onClick={() => setNotificationPage(1)} disabled={safePage <= 1} style={{ padding: '0.25rem', height: '28px' }}>
                  <ChevronsLeft size={15} />
                </button>
                <button type="button" className="secondary" onClick={() => setNotificationPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} style={{ padding: '0.25rem', height: '28px' }}>
                  <ChevronLeft size={15} />
                </button>
                <span style={{ fontWeight: '600', color: '#0f172a', margin: '0 0.3rem' }}>Trang {safePage} / {totalPages}</span>
                <button type="button" className="secondary" onClick={() => setNotificationPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} style={{ padding: '0.25rem', height: '28px' }}>
                  <ChevronRight size={15} />
                </button>
                <button type="button" className="secondary" onClick={() => setNotificationPage(totalPages)} disabled={safePage >= totalPages} style={{ padding: '0.25rem', height: '28px' }}>
                  <ChevronsRight size={15} />
                </button>
              </div>
            </div>
          ) : null}
        </section>
      )}

    </div>
  )
}
