import { useEffect, useMemo, useState } from 'react'
import { io } from 'socket.io-client'
import { API_BASE_URL } from '../../admin-dashboard/constants'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3005'
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

      setProfileState((prev) => ({ ...prev, saving: false, success: 'Đã cập nhật thông tin cá nhân.' }))
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

  return (
    <section className="panel account-center-panel">
      <div className="panel-head">
        <h2>Cập nhật Profile • Đổi mật khẩu • Nhận thông báo</h2>
        <span>Áp dụng cho tài khoản hiện tại ({session?.user?.vaiTro || session?.user?.vai_tro || 'STAFF'})</span>
      </div>

      {!userId ? <p className="error-text">Không tìm thấy mã người dùng trong phiên đăng nhập hiện tại.</p> : null}

      <div className="account-center-layout">
        <section className="account-card">
          <h3>Hồ sơ cá nhân</h3>
          {profileState.loading ? <p>Đang tải thông tin...</p> : null}
          <form className="account-form" onSubmit={saveProfile}>
            <label>
              <span>Họ tên</span>
              <input
                value={profileForm.hoTen}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, hoTen: e.target.value }))}
                placeholder="Nhập họ tên"
              />
            </label>
            <label>
              <span>Số điện thoại</span>
              <input
                value={profileForm.soDienThoai}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, soDienThoai: e.target.value }))}
                placeholder="Nhập số điện thoại"
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={profileForm.email}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Nhập email"
              />
            </label>
            <label>
              <span>Avatar URL</span>
              <input
                value={profileForm.avatarUrl}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
                placeholder="Dán liên kết ảnh avatar"
              />
            </label>
            {profileForm.avatarUrl ? (
              <img src={profileForm.avatarUrl} alt="Avatar preview" className="account-avatar-preview" />
            ) : null}

            {profileState.error ? <p className="error-text">{profileState.error}</p> : null}
            {profileState.success ? <p className="success-text">{profileState.success}</p> : null}

            <button type="submit" disabled={profileState.saving || !userId}>
              {profileState.saving ? 'Đang lưu...' : 'Lưu thay đổi hồ sơ'}
            </button>
          </form>
        </section>

        <section className="account-card">
          <h3>Đổi mật khẩu</h3>
          <form className="account-form" onSubmit={changePassword}>
            <label>
              <span>Mật khẩu hiện tại</span>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                placeholder="Nhập mật khẩu hiện tại"
              />
            </label>
            <label>
              <span>Mật khẩu mới</span>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                placeholder="Nhập mật khẩu mới"
              />
            </label>
            <label>
              <span>Xác nhận mật khẩu mới</span>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Nhập lại mật khẩu mới"
              />
            </label>

            {passwordState.error ? <p className="error-text">{passwordState.error}</p> : null}
            {passwordState.success ? <p className="success-text">{passwordState.success}</p> : null}

            <button type="submit" disabled={passwordState.saving || !userId}>
              {passwordState.saving ? 'Đang cập nhật...' : 'Đổi mật khẩu'}
            </button>
          </form>
        </section>
      </div>

      <section className="account-notification-section">
        <div className="account-notification-head">
          <h3>Thông báo hệ thống</h3>
          <div>
            <span className="notification-pill">Chưa đọc: {unreadCount}</span>
            <button type="button" className="secondary" onClick={markAllNotificationsRead} disabled={markingAll || !userId}>
              {markingAll ? 'Đang xử lý...' : 'Đánh dấu đã đọc tất cả'}
            </button>
          </div>
        </div>

        {notificationsState.loading ? <p>Đang tải thông báo...</p> : null}
        {notificationsState.error ? <p className="error-text">{notificationsState.error}</p> : null}

        {!notificationsState.loading && !notificationsState.items.length ? (
          <p>Hiện chưa có thông báo nào.</p>
        ) : null}

        <div className="notification-list">
          {pageNotificationItems.map((item) => (
            <article key={item.id} className={item.da_doc ? 'notification-card' : 'notification-card unread'}>
              <div>
                <h4>{item.tieu_de || 'Thông báo hệ thống'}</h4>
                <p>{item.noi_dung || ''}</p>
                <small>{fmtDateTime(item.ngay_tao)}</small>
              </div>
              {!item.da_doc ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => markOneNotificationRead(item.id)}
                  disabled={markingNotificationId === String(item.id)}
                >
                  {markingNotificationId === String(item.id) ? 'Đang lưu...' : 'Đánh dấu đã đọc'}
                </button>
              ) : (
                <span className="read-label">Đã đọc</span>
              )}
            </article>
          ))}
        </div>

        {notificationsState.items.length > PAGE_SIZE ? (
          <div className="ops-pagination" style={{ marginTop: '0.6rem' }}>
            <span>{(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, notificationsState.items.length)} / {notificationsState.items.length}</span>
            <div>
              <button type="button" className="secondary" onClick={() => setNotificationPage(1)} disabled={safePage <= 1}>Đầu</button>
              <button type="button" className="secondary" onClick={() => setNotificationPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>Trước</button>
              <strong>Trang {safePage}/{totalPages}</strong>
              <button type="button" className="secondary" onClick={() => setNotificationPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>Sau</button>
              <button type="button" className="secondary" onClick={() => setNotificationPage(totalPages)} disabled={safePage >= totalPages}>Cuối</button>
            </div>
          </div>
        ) : null}
      </section>
    </section>
  )
}
