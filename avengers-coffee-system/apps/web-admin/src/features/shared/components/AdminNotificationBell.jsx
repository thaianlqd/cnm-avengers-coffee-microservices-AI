import { Button } from '../../../components/ui/button'
import React, { useEffect, useMemo, useRef, useState, lazy, Suspense, useId } from 'react'
import {
  Bell,
  BellRing,
  CheckCheck,
  Check,
  Clock,
  ShoppingBag,
  Calendar,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Info,
  Sparkles
} from '../../../components/console/WorkspaceIcons'
import { io } from 'socket.io-client'
import { API_BASE_URL } from '../../admin-dashboard/constants'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:3005`
const NotificationPanel = lazy(() => import('./NotificationPanel'))
const PAGE_SIZE = 5

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
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  } catch {
    return String(value)
  }
}

// Hàm chuẩn hóa chữ viết Tiếng Việt chuẩn UX cho thông báo hệ thống
function fixNotificationText(text) {
  if (!text) return ''
  let s = String(text)

  // Map các cụm từ không dấu phổ biến
  s = s.replace(/Co don hang moi/gi, 'Có đơn hàng mới')
  s = s.replace(/vua duoc tao/gi, 'vừa được tạo')
  s = s.replace(/Don #/gi, 'Đơn hàng #')
  s = s.replace(/Don hang #/gi, 'Đơn hàng #')
  s = s.replace(/Phan cong ca lam/gi, 'Phân công ca làm việc')
  s = s.replace(/Da cap nhat trang thai/gi, 'Đã cập nhật trạng thái')
  s = s.replace(/Yeu cau dang ky ca/gi, 'Yêu cầu đăng ký ca làm')
  s = s.replace(/Thong bao he thong/gi, 'Thông báo hệ thống')
  s = s.replace(/Da duoc phe duyet/gi, 'đã được phê duyệt')
  s = s.replace(/Bi tu choi/gi, 'bị từ chối')

  return s
}

export function AdminNotificationBell({ session }) {
  const userId = getSessionUserId(session)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState({ loading: false, error: '', items: [] })
  const [markingId, setMarkingId] = useState('')
  const [markingAll, setMarkingAll] = useState(false)
  const [page, setPage] = useState(1)
  const wrapperRef = useRef(null)
  const buttonRef = useRef(null)
  const panelId = useId()
  const requestRef = useRef(null)

  const unreadCount = useMemo(() => state.items.filter((item) => !item.da_doc).length, [state.items])
  const totalPages = useMemo(() => Math.max(1, Math.ceil((state.items?.length || 0) / PAGE_SIZE)), [state.items])
  const safePage = useMemo(() => Math.min(Math.max(page, 1), totalPages), [page, totalPages])
  const pageItems = useMemo(
    () => (state.items || []).slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [safePage, state.items],
  )

  useEffect(() => {
    setPage(1)
  }, [open])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const mergeServerWithLocal = (serverItems) => {
    const merged = []
    const seen = new Set()

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
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${encodeURIComponent(userId)}/notifications?limit=20`, { signal: controller.signal })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không tải được thông báo')
      if (controller.signal.aborted) return
      setState((prev) => ({
        loading: false,
        error: '',
        items: mergeServerWithLocal(normalizeNotificationPayload(payload)),
      }))
    } catch (error) {
      if (controller.signal.aborted) return
      setState((prev) => ({ ...prev, loading: false, error: error.message || 'Không tải được thông báo' }))
    }
  }

  useEffect(() => {
    if (!userId) return

    loadNotifications()
    return () => requestRef.current?.abort()
  }, [userId])

  useEffect(() => {
    if (!open || !userId) return
    loadNotifications()
    const timer = window.setInterval(loadNotifications, 30000)
    return () => window.clearInterval(timer)
  }, [open, userId])

  useEffect(() => {
    if (!userId) return undefined

    const socket = io(`${SOCKET_URL}/notifications`, {
      transports: ['websocket'],
      auth: { userId },
    })

    socket.on('connect', () => {
      socket.emit('notifications:subscribe', { userId })
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
    const onClickOutside = (event) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    const onEscape = event => {
      if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus() }
    }
    document.addEventListener('keydown', onEscape)
    document.addEventListener('mousedown', onClickOutside)
    return () => { document.removeEventListener('mousedown', onClickOutside); document.removeEventListener('keydown', onEscape) }
  }, [])

  const markOneRead = async (notificationId) => {
    if (!userId || !notificationId) return

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

  return <div className="workspace-notifications" ref={wrapperRef}>
    <Button ref={buttonRef} type="button" className="workspace-icon-button" onClick={() => setOpen(value => !value)} aria-label={unreadCount ? `Thông báo, ${unreadCount} chưa đọc` : 'Xem thông báo'} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}>
      <Bell size={19} />{unreadCount > 0 && <span className="workspace-unread-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </Button>
    {open && <Suspense fallback={<div className="workspace-notification-panel" role="status"><div className="workspace-shimmer" /><p>Đang tải thông báo…</p></div>}>
      <NotificationPanel anchorRef={buttonRef} id={panelId} state={state} pageItems={pageItems} unreadCount={unreadCount} markingAll={markingAll} markingId={markingId} markAllRead={markAllRead} markOneRead={markOneRead} onRetry={loadNotifications} page={safePage} totalPages={totalPages} setPage={setPage} formatText={fixNotificationText} formatTime={fmtDateTime} onClose={() => { setOpen(false); buttonRef.current?.focus() }} />
    </Suspense>}
  </div>
}
