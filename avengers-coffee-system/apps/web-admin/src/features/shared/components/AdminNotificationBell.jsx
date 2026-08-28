import React, { useEffect, useMemo, useRef, useState } from 'react'
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
} from 'lucide-react'
import { io } from 'socket.io-client'
import { API_BASE_URL } from '../../admin-dashboard/constants'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:3005`
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
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const response = await fetch(`${API_BASE_URL}/customers/${encodeURIComponent(userId)}/notifications?limit=20`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.message || 'Không tải được thông báo')
      setState((prev) => ({
        loading: false,
        error: '',
        items: mergeServerWithLocal(normalizeNotificationPayload(payload)),
      }))
    } catch (error) {
      setState((prev) => ({ ...prev, loading: false, error: error.message || 'Không tải được thông báo' }))
    }
  }

  useEffect(() => {
    if (!userId) return

    loadNotifications()
    const timer = window.setInterval(loadNotifications, 15000)
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

  const renderIcon = (title, content) => {
    const text = (title + ' ' + content).toLowerCase()
    if (text.includes('don') || text.includes('đơn')) {
      return (
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: '#ecfdf5',
          color: '#059669',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <ShoppingBag size={18} />
        </div>
      )
    }
    if (text.includes('ca') || text.includes('lịch')) {
      return (
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '10px',
          background: '#eff6ff',
          color: '#2563eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          <Calendar size={18} />
        </div>
      )
    }
    return (
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '10px',
        background: '#e0e7ff',
        color: '#4f46e5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        <Info size={18} />
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', flexShrink: 0 }} ref={wrapperRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Xem thông báo"
        style={{
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          border: '1.5px solid #fde68a',
          background: open ? '#fef3c7' : '#fffbe6',
          color: '#d97706',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.2s ease',
          boxShadow: '0 3px 8px rgba(245, 158, 11, 0.2)'
        }}
      >
        <Bell size={26} color="#d97706" fill="#f59e0b" />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-3px',
            right: '-3px',
            minWidth: '20px',
            height: '20px',
            borderRadius: '9999px',
            background: '#ef4444',
            color: '#ffffff',
            fontSize: '0.75rem',
            fontWeight: '800',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 5px',
            border: '2px solid #ffffff',
            boxShadow: '0 2px 5px rgba(239, 68, 68, 0.35)'
          }}>
            {Math.min(unreadCount, 99)}
          </span>
        )}
      </button>

      {/* Notification Dropdown Panel */}
      {open && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 'calc(100% + 10px)',
          width: 'min(92vw, 400px)',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '18px',
          boxShadow: '0 20px 35px -10px rgba(15, 23, 42, 0.18)',
          zIndex: 999,
          padding: '1.15rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem'
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #f1f5f9',
            paddingBottom: '0.75rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <BellRing size={18} color="#10b981" />
              <strong style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                Thông báo
              </strong>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: '0.725rem',
                  fontWeight: '700',
                  background: '#ecfdf5',
                  color: '#047857',
                  padding: '0.15rem 0.55rem',
                  borderRadius: '9999px',
                  border: '1px solid #a7f3d0'
                }}>
                  {unreadCount} chưa đọc
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll || !state.items.length || unreadCount === 0}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: 'none',
                background: unreadCount > 0 ? '#ecfdf5' : '#f1f5f9',
                color: unreadCount > 0 ? '#047857' : '#94a3b8',
                fontSize: '0.775rem',
                fontWeight: '700',
                cursor: unreadCount > 0 ? 'pointer' : 'default',
                transition: 'all 0.2s ease'
              }}
            >
              <CheckCheck size={14} />
              {markingAll ? 'Đang xử lý...' : 'Đọc tất cả'}
            </button>
          </div>

          {/* Body List */}
          {state.loading && (
            <p style={{ margin: 0, padding: '1rem 0', textAlign: 'center', fontSize: '0.85rem', color: '#64748b' }}>
              Đang tải thông báo...
            </p>
          )}

          {state.error && (
            <p style={{ margin: 0, padding: '0.5rem', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontSize: '0.825rem', fontWeight: '600' }}>
              ⚠️ {state.error}
            </p>
          )}

          {!state.loading && !state.items.length && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8' }}>
              <Bell size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Chưa có thông báo mới.</p>
            </div>
          )}

          {!state.loading && state.items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {pageItems.map((item) => {
                const titleText = fixNotificationText(item.tieu_de || 'Thông báo hệ thống')
                const contentText = fixNotificationText(item.noi_dung || '')
                const isUnread = !item.da_doc

                return (
                  <article
                    key={item.id}
                    style={{
                      padding: '0.85rem',
                      borderRadius: '12px',
                      border: isUnread ? '1px solid #a7f3d0' : '1px solid #f1f5f9',
                      background: isUnread ? '#f0fdf4' : '#ffffff',
                      display: 'flex',
                      gap: '0.75rem',
                      alignItems: 'flex-start',
                      transition: 'all 0.2s ease',
                      position: 'relative'
                    }}
                  >
                    {renderIcon(titleText, contentText)}

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                        <h4 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '700', color: '#0f172a', lineHeight: 1.3 }}>
                          {titleText}
                        </h4>
                        {isUnread && (
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                        )}
                      </div>

                      <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.825rem', color: '#475569', lineHeight: 1.4 }}>
                        {contentText}
                      </p>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                        <span style={{ fontSize: '0.725rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          <Clock size={12} /> {fmtDateTime(item.ngay_tao)}
                        </span>

                        {isUnread && (
                          <button
                            type="button"
                            onClick={() => markOneRead(item.id)}
                            disabled={markingId === String(item.id)}
                            style={{
                              background: '#ffffff',
                              border: '1px solid #10b981',
                              color: '#047857',
                              padding: '0.2rem 0.55rem',
                              borderRadius: '6px',
                              fontSize: '0.725rem',
                              fontWeight: '700',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem'
                            }}
                          >
                            <Check size={12} />
                            {markingId === String(item.id) ? '...' : 'Đã đọc'}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {/* Footer Pagination */}
          {(state.items?.length || 0) > PAGE_SIZE && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingTop: '0.65rem',
              borderTop: '1px solid #f1f5f9',
              fontSize: '0.775rem',
              color: '#64748b'
            }}>
              <span>
                Trang <strong>{safePage}</strong>/<strong>{totalPages}</strong>
              </span>

              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: safePage <= 1 ? '#cbd5e1' : '#334155',
                    cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}
                >
                  <ChevronLeft size={14} />
                </button>

                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: safePage >= totalPages ? '#cbd5e1' : '#334155',
                    cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: '600'
                  }}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
