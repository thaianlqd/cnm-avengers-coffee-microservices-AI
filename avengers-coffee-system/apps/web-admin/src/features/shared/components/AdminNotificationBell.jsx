import { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { API_BASE_URL } from '../../admin-dashboard/constants'

const ADMIN_LOCAL_NOTIFY_EVENT = 'avengers-admin-local-notify'
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3005'

function getSessionUserId(session) {
  const directUserId = session?.user?.ma_nguoi_dung || session?.user?.maNguoiDung || ''
  if (directUserId) return directUserId

  const rawToken = String(session?.token || session?.accessToken || '').replace(/^Bearer\s+/i, '').trim()
  if (!rawToken || !rawToken.includes('.')) return ''

  try {
    const payloadSegment = rawToken.split('.')[1]
    const normalized = payloadSegment.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(window.atob(normalized))
    return decoded?.sub || ''
  } catch {
    return ''
  }
}

function normalizeNotificationPayload(payload) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.items)) return payload.items
  return []
}

function fmtDateTime(value) {
  if (!value) return '---'
  try {
    return new Date(value).toLocaleString('vi-VN')
  } catch {
    return String(value)
  }
}

export function AdminNotificationBell({ session }) {
  const userId = getSessionUserId(session)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ loading: false, error: '', items: [] })
  const [markingId, setMarkingId] = useState('')
  const [markingAll, setMarkingAll] = useState(false)
  const wrapperRef = useRef(null)

  const unreadCount = useMemo(() => state.items.filter((item) => !item.da_doc).length, [state.items])

  const mergeServerWithLocal = (serverItems, currentItems) => {
    const localItems = (currentItems || []).filter((item) => String(item.id || '').startsWith('local-'))
    const merged = [...localItems]
    const seen = new Set(localItems.map((item) => String(item.id)))

    ;(serverItems || []).forEach((item) => {
      const key = String(item.id || '')
      if (!key || seen.has(key)) return
      seen.add(key)
      merged.push(item)
    })

    return merged.slice(0, 30)
  }

  const loadNotifications = async () => {
    if (!userId) return
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${encodeURIComponent(userId)}/notifications?limit=20`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không tải được thông báo')
      setState((prev) => ({
        loading: false,
        error: '',
        items: mergeServerWithLocal(normalizeNotificationPayload(payload), prev.items),
      }))
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message || 'Không tải được thông báo' }))
    }
  }

  useEffect(() => {
    if (!userId) return

    loadNotifications()
    const timer = window.setInterval(loadNotifications, 90000)
    return () => window.clearInterval(timer)
  }, [userId])

  useEffect(() => {
    if (!userId) return undefined

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
      setState((prev) => {
        if ((prev.items || []).some((item) => String(item.id) === String(notification.id))) {
          return prev
        }
        return {
          ...prev,
          items: [notification, ...(prev.items || [])].slice(0, 30),
        }
      })
    })

    return () => {
      socket.disconnect()
    }
  }, [userId])

  useEffect(() => {
    const onLocalNotify = (event) => {
      const detail = event?.detail || {}
      const timestamp = new Date().toISOString()
      const synthetic = {
        id: `local-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        tieu_de: detail.tieu_de || 'Thông báo vận hành',
        noi_dung: detail.noi_dung || 'Có cập nhật mới từ thao tác hệ thống.',
        ngay_tao: timestamp,
        da_doc: false,
      }

      setState((prev) => ({
        ...prev,
        items: [synthetic, ...prev.items].slice(0, 30),
      }))
    }

    window.addEventListener(ADMIN_LOCAL_NOTIFY_EVENT, onLocalNotify)
    return () => window.removeEventListener(ADMIN_LOCAL_NOTIFY_EVENT, onLocalNotify)
  }, [])

  useEffect(() => {
    const onClickOutside = (event) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const markOneRead = async (notificationId) => {
    if (!userId || !notificationId) return
    const isLocalOnly = String(notificationId).startsWith('local-')

    if (isLocalOnly) {
      setState((prev) => ({
        ...prev,
        items: prev.items.map((item) => (String(item.id) === String(notificationId) ? { ...item, da_doc: true } : item)),
      }))
      return
    }

    setMarkingId(String(notificationId))
    try {
      const response = await fetch(
        `${API_BASE_URL}/customers/${encodeURIComponent(userId)}/notifications/${encodeURIComponent(notificationId)}/read`,
        { method: 'PATCH' },
      )
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không thể đánh dấu đã đọc')
      setState((prev) => ({
        ...prev,
        items: prev.items.map((item) => (String(item.id) === String(notificationId) ? { ...item, da_doc: true } : item)),
      }))
    } catch (error) {
      setState((prev) => ({ ...prev, error: error.message || 'Không thể đánh dấu đã đọc' }))
    } finally {
      setMarkingId('')
    }
  }

  const markAllRead = async () => {
    if (!userId) return
    setMarkingAll(true)
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${encodeURIComponent(userId)}/notifications/read-all`, {
        method: 'PATCH',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không thể đánh dấu đã đọc toàn bộ')
      setState((prev) => ({
        ...prev,
        items: prev.items.map((item) => ({ ...item, da_doc: true })),
      }))
    } catch (error) {
      setState((prev) => ({ ...prev, error: error.message || 'Không thể đánh dấu đã đọc toàn bộ' }))
    } finally {
      setMarkingAll(false)
    }
  }

  return (
    <div className="admin-notify" ref={wrapperRef}>
      <button
        type="button"
        className="admin-notify-bell"
        onClick={() => {
          setOpen((prev) => !prev)
        }}
        aria-label="Xem thông báo"
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 ? <span className="admin-notify-count">{Math.min(unreadCount, 99)}</span> : null}
      </button>

      {open ? (
        <div className="admin-notify-panel">
          <div className="admin-notify-head">
            <strong>Thông báo</strong>
            <button type="button" className="secondary" onClick={markAllRead} disabled={markingAll || !state.items.length}>
              {markingAll ? 'Đang xử lý...' : 'Đọc tất cả'}
            </button>
          </div>

          {state.loading ? <p className="admin-notify-hint">Đang tải...</p> : null}
          {state.error ? <p className="error-text admin-notify-hint">{state.error}</p> : null}

          {!state.loading && !state.items.length ? (
            <p className="admin-notify-hint">Chưa có thông báo mới.</p>
          ) : (
            <div className="admin-notify-list">
              {state.items.map((item) => (
                <article key={item.id} className={item.da_doc ? 'admin-notify-item' : 'admin-notify-item unread'}>
                  <h4>{item.tieu_de || 'Thông báo hệ thống'}</h4>
                  <p>{item.noi_dung || ''}</p>
                  <small>{fmtDateTime(item.ngay_tao)}</small>
                  {!item.da_doc ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => markOneRead(item.id)}
                      disabled={markingId === String(item.id)}
                    >
                      {markingId === String(item.id) ? 'Đang lưu...' : 'Đánh dấu đã đọc'}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
