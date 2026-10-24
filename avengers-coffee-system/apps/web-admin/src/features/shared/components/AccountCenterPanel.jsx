import { Card } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Label } from '../../../components/ui/label'
import { Input } from '../../../components/ui/input'
import { Check as WorkspaceSymbolCheck, Info as WorkspaceSymbolInfo, ShieldCheck as WorkspaceSymbolShieldCheck } from '../../../components/console/WorkspaceIcons'
import { readWorkspaceSession, saveWorkspaceSession } from '../../../lib/workspaceAuth'
import { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { API_BASE_URL } from '../../admin-dashboard/constants'
import {
  User,
  ShieldCheck,
  Lock,
  CheckCircle2,
  KeyRound,
  Mail,
  Phone,
  Image,
  AlertCircle,
  Eye,
  EyeOff
} from '../../../components/console/WorkspaceIcons'

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
  const [showCurrentPwd, setShowCurrentPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
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
      const rawSession = JSON.stringify(readWorkspaceSession())
      if (rawSession) {
        try {
          const parsed = JSON.parse(rawSession)
          saveWorkspaceSession({ ...parsed, user: mergedUser })
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
    <div className="workspace-account" style={{ width: '100%', maxWidth: '100%', margin: 0, padding: 0 }}>
      {/* ========================================================================= */}
      {/* 1 SINGLE UNIFIED CARD: HỒ SƠ & BẢO MẬT HỆ THỐNG */}
      {/* ========================================================================= */}
      <Card
        className="admin-surface admin-settings-card"
        style={{
          width: '100%',
          backgroundColor: '#ffffff',
          border: '1px solid var(--border-light)',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* SECTION 1: HEADER BANNER (Thông tin hồ sơ tóm tắt) */}
        <div
          style={{
            padding: '1.25rem 1.75rem',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.25rem',
            background: '#f8fafc'
          }}
        >
          {/* User Identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
            <div style={{ width: '46px', height: '46px', flexShrink: 0 }}>
              {profileForm.avatarUrl ? (
                <img
                  src={profileForm.avatarUrl}
                  alt="Avatar"
                  style={{ width: '46px', height: '46px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #3b82f6', display: 'block' }}
                />
              ) : (
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '600',
                    fontSize: '1.1rem',
                    border: '1.5px solid #bfdbfe',
                    boxSizing: 'border-box'
                  }}
                >
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: '600', color: '#0f172a', letterSpacing: '-0.01em' }}>
                  {displayName}
                </h2>
                <Badge variant="outline" data-quiet-label="true"
                  style={{
                    padding: '0.15rem 0.6rem',
                    borderRadius: '9999px',
                    fontSize: '0.72rem',
                    fontWeight: '500',
                    backgroundColor: '#eff6ff',
                    color: '#1d4ed8',
                    border: '1px solid #bfdbfe'
                  }}
                >
                  {userRole}
                </Badge>
              </div>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78125rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <Mail size={13} color="#94a3b8" /> {profileForm.email || session?.user?.email || 'admin@avengers.coffee'}
                </span>
                {profileForm.soDienThoai && (
                  <>
                    <span>•</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Phone size={13} color="#94a3b8" /> {profileForm.soDienThoai}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Right Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <div
              style={{
                backgroundColor: '#ffffff',
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}
            >
              <ShieldCheck size={16} color="#16a34a" />
              <span style={{ fontSize: '0.78125rem', color: '#15803d', fontWeight: '500' }}>Tài khoản An toàn</span>
            </div>
          </div>
        </div>

        {!userId && (
          <div style={{ margin: '1rem 1.75rem 0', padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '8px', color: '#dc2626', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} /> Không tìm thấy mã người dùng trong phiên đăng nhập hiện tại.
          </div>
        )}

        {/* SECTION 2: 2 TABS NGANG NẰM TRONG CÙNG 1 CARD (Hồ sơ cá nhân & Đổi mật khẩu) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2rem',
            padding: '0 1.75rem',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid var(--border-light)',
            overflowX: 'auto'
          }}
        >
          <Button
            type="button"
            className="account-tab-btn"
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '0.85rem 0.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'profile' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'profile' ? '#2563eb' : '#64748b',
              fontWeight: activeTab === 'profile' ? '600' : '500',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
              borderRadius: 0,
              outline: 'none',
              boxShadow: 'none',
              transition: 'color 0.15s ease'
            }}
          >
            <User size={15} /> Hồ sơ cá nhân
          </Button>

          <Button
            type="button"
            className="account-tab-btn"
            onClick={() => setActiveTab('security')}
            style={{
              padding: '0.85rem 0.25rem',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'security' ? '2px solid #2563eb' : '2px solid transparent',
              color: activeTab === 'security' ? '#2563eb' : '#64748b',
              fontWeight: activeTab === 'security' ? '600' : '500',
              fontSize: '0.8125rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              whiteSpace: 'nowrap',
              borderRadius: 0,
              outline: 'none',
              boxShadow: 'none',
              transition: 'color 0.15s ease'
            }}
          >
            <Lock size={15} /> Đổi mật khẩu &amp; Bảo mật
          </Button>
        </div>

        {/* SECTION 3: TAB CONTENT BODY */}
        <div style={{ padding: '1.75rem', width: '100%', boxSizing: 'border-box' }}>
          {/* TAB 1: Profile Info */}
          {activeTab === 'profile' && (
            <div style={{ maxWidth: '680px', width: '100%' }}>
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={16} color="#2563eb" /> Cập nhật hồ sơ cá nhân
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Tài khoản @{session?.user?.tenDangNhap || session?.user?.username}
                </span>
              </div>

              {profileState.loading && <p style={{ fontSize: '0.8125rem', color: '#64748b' }}>Đang tải thông tin...</p>}

              <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
                  {/* Full Name */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <Label htmlFor="account-profile-name" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', fontWeight: '500', color: '#334155' }}>
                      <User size={14} color="#64748b" />
                      <span>Họ tên đầy đủ</span>
                    </Label>
                    <Input
                      id="account-profile-name"
                      type="text"
                      value={profileForm.hoTen}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, hoTen: e.target.value }))}
                      placeholder="Nhập họ tên đầy đủ"
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '0 0.85rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        fontSize: '0.8125rem',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  {/* Phone Number */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <Label htmlFor="account-profile-phone" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', fontWeight: '500', color: '#334155' }}>
                      <Phone size={14} color="#64748b" />
                      <span>Số điện thoại</span>
                    </Label>
                    <Input
                      id="account-profile-phone"
                      type="text"
                      value={profileForm.soDienThoai}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, soDienThoai: e.target.value }))}
                      placeholder="Nhập số điện thoại"
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '0 0.85rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        fontSize: '0.8125rem',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                {/* Email */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <Label htmlFor="account-profile-email" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', fontWeight: '500', color: '#334155' }}>
                    <Mail size={14} color="#64748b" />
                    <span>Email liên hệ</span>
                  </Label>
                  <Input
                    id="account-profile-email"
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Nhập địa chỉ email"
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 0.85rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      fontSize: '0.8125rem',
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* Avatar URL */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <Label htmlFor="account-profile-avatar" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', fontWeight: '500', color: '#334155' }}>
                    <Image size={14} color="#64748b" />
                    <span>Đường dẫn Ảnh Avatar (URL)</span>
                  </Label>
                  <Input
                    id="account-profile-avatar"
                    type="text"
                    value={profileForm.avatarUrl}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                    placeholder="Dán liên kết URL ảnh đại diện (https://...)"
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 0.85rem',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      fontSize: '0.8125rem',
                      color: '#0f172a',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {profileState.error && (
                  <p style={{ margin: 0, color: '#dc2626', fontSize: '0.8125rem', backgroundColor: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fee2e2' }}>
                    {profileState.error}
                  </p>
                )}

                {profileState.success && (
                  <p style={{ margin: 0, color: '#15803d', fontSize: '0.8125rem', backgroundColor: '#f0fdf4', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <CheckCircle2 size={16} /> {profileState.success}
                  </p>
                )}

                <div style={{ marginTop: '0.5rem' }}>
                  <Button data-intent="success"
                    type="submit"
                    disabled={profileState.saving || !userId}
                    className="admin-button-primary btn-save"
                    style={{
                      height: '38px',
                      padding: '0 1.25rem',
                      borderRadius: '6px',
                      fontSize: '0.8125rem',
                      fontWeight: '500',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      cursor: profileState.saving ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <CheckCircle2 size={15} /> {profileState.saving ? 'Đang lưu...' : 'Lưu thay đổi hồ sơ'}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: Change Password */}
          {activeTab === 'security' && (
            <div style={{ maxWidth: '680px', width: '100%' }}>
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '600', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Lock size={16} color="#0284c7" /> Thao tác đổi mật khẩu tài khoản
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Đảm bảo an toàn hệ thống</span>
              </div>

              <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                {/* Current Password */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <Label htmlFor="account-pwd-current" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', fontWeight: '500', color: '#334155' }}>
                    <Lock size={14} color="#64748b" />
                    <span>Mật khẩu hiện tại</span>
                  </Label>
                  <div className="admin-password-field">
                    <Input
                      id="account-pwd-current"
                      type={showCurrentPwd ? "text" : "password"}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                      placeholder="••••••••"
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '0 2.5rem 0 0.85rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        fontSize: '0.8125rem',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <Button
                      type="button"
                      className="admin-password-toggle"
                      onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                      title={showCurrentPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      aria-label={showCurrentPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    >
                      {showCurrentPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </Button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '1rem' }}>
                  {/* New Password */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <Label htmlFor="account-pwd-new" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', fontWeight: '500', color: '#334155' }}>
                      <KeyRound size={14} color="#64748b" />
                      <span>Mật khẩu mới</span>
                    </Label>
                    <div className="admin-password-field">
                      <Input
                        id="account-pwd-new"
                        type={showNewPwd ? "text" : "password"}
                        value={passwordForm.newPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                        placeholder="Tối thiểu 6 ký tự"
                        style={{
                          width: '100%',
                          height: '38px',
                          padding: '0 2.5rem 0 0.85rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          fontSize: '0.8125rem',
                          color: '#0f172a',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                      <Button
                        type="button"
                        className="admin-password-toggle"
                        onClick={() => setShowNewPwd(!showNewPwd)}
                        title={showNewPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                        aria-label={showNewPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showNewPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </Button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <Label htmlFor="account-pwd-confirm" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem', fontWeight: '500', color: '#334155' }}>
                      <KeyRound size={14} color="#64748b" />
                      <span>Xác nhận mật khẩu mới</span>
                    </Label>
                    <div className="admin-password-field">
                      <Input
                        id="account-pwd-confirm"
                        type={showConfirmPwd ? "text" : "password"}
                        value={passwordForm.confirmPassword}
                        onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Nhập lại mật khẩu mới"
                        style={{
                          width: '100%',
                          height: '38px',
                          padding: '0 2.5rem 0 0.85rem',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          fontSize: '0.8125rem',
                          color: '#0f172a',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                      <Button
                        type="button"
                        className="admin-password-toggle"
                        onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                        title={showConfirmPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                        aria-label={showConfirmPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showConfirmPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </Button>
                    </div>
                  </div>
                </div>

                {passwordState.error && (
                  <p style={{ margin: 0, color: '#dc2626', fontSize: '0.8125rem', backgroundColor: '#fef2f2', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #fee2e2' }}>
                    {passwordState.error}
                  </p>
                )}

                {passwordState.success && (
                  <p style={{ margin: 0, color: '#15803d', fontSize: '0.8125rem', backgroundColor: '#f0fdf4', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <CheckCircle2 size={16} /> {passwordState.success}
                  </p>
                )}

                <div style={{ marginTop: '0.5rem' }}>
                  <Button data-intent="success"
                    type="submit"
                    disabled={passwordState.saving || !userId}
                    className="admin-button-primary btn-save"
                    style={{
                      height: '38px',
                      padding: '0 1.25rem',
                      borderRadius: '6px',
                      fontSize: '0.8125rem',
                      fontWeight: '500',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      cursor: passwordState.saving ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <KeyRound size={15} /> {passwordState.saving ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
