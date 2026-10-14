import { useEffect, useLayoutEffect, useRef } from 'react'
import { Bell, Check, CheckCheck, ChevronLeft, ChevronRight, X, RefreshCw } from 'lucide-react'
export default function NotificationPanel({ anchorRef, id, state, pageItems, unreadCount, markingAll, markingId, markAllRead, markOneRead, onRetry, page, totalPages, setPage, formatText, formatTime, onClose }) {
  const panel = useRef(null)
  useLayoutEffect(() => {
    const place = () => {
      const node = panel.current
      const anchor = anchorRef.current?.getBoundingClientRect()
      if (!node || !anchor) return
      node.style.position = 'fixed'
      const width = node.getBoundingClientRect().width
      node.style.right = 'auto'
      node.style.left = `${Math.max(12, Math.min(anchor.right - width, window.innerWidth - width - 12))}px`
      const top = Math.min(anchor.bottom + 12, window.innerHeight - 160)
      node.style.top = `${Math.max(12, top)}px`
      node.style.maxHeight = `${window.innerHeight - Math.max(12, top) - 16}px`
      node.style.overflowY = 'auto'
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [anchorRef])
  useEffect(() => { panel.current?.querySelector('button[aria-label="Đóng thông báo"]')?.focus() }, [])
  return <section ref={panel} id={id} className="workspace-notification-panel" role="dialog" aria-label="Thông báo">
    <header><div><h3>Thông báo</h3><p>{unreadCount ? `${unreadCount} thông báo chưa đọc` : 'Cập nhật trong không gian của bạn'}</p></div><button type="button" className="workspace-icon-button" onClick={onClose} aria-label="Đóng thông báo"><X size={17} /></button></header>
    <div className="workspace-notification-actions"><button type="button" onClick={markAllRead} disabled={markingAll || !unreadCount}><CheckCheck size={15} />{markingAll ? 'Đang cập nhật…' : 'Đọc tất cả'}</button><button type="button" onClick={onRetry} disabled={state.loading} aria-label="Tải lại thông báo"><RefreshCw size={15} /></button></div>
    {state.error && <div className="workspace-notification-error" role="alert"><p>{state.error}</p><button type="button" onClick={onRetry}>Thử lại</button></div>}
    {state.loading && !state.items.length ? <div className="workspace-notification-skeleton" role="status" aria-label="Đang tải thông báo">{[1, 2, 3].map(i => <div className="workspace-shimmer" key={i} />)}</div> : !state.error && !state.items.length ? <div className="workspace-notification-empty"><span><Bell size={24} /></span><h4>Bạn đã xem hết cập nhật</h4><p>Thông báo mới về đơn hàng và ca làm sẽ xuất hiện ở đây.</p></div> : <div className="workspace-notification-list" aria-busy={state.loading}>
      {pageItems.map(item => <article key={item.id} className={item.da_doc ? '' : 'is-unread'}><span className="workspace-notification-dot" /><div><h4>{formatText(item.tieu_de || 'Thông báo hệ thống')}</h4><p>{formatText(item.noi_dung)}</p><footer><time>{formatTime(item.ngay_tao)}</time>{!item.da_doc && <button type="button" onClick={() => markOneRead(item.id)} disabled={markingId === String(item.id)} aria-label={'Đánh dấu đã đọc: ' + formatText(item.tieu_de)}><Check size={14} />{markingId === String(item.id) ? 'Đang lưu…' : 'Đã đọc'}</button>}</footer></div></article>)}
    </div>}
    {totalPages > 1 && <footer className="workspace-notification-pagination"><span>Trang {page} / {totalPages}</span><div><button type="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)} aria-label="Thông báo trước"><ChevronLeft size={16} /></button><button type="button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)} aria-label="Thông báo tiếp"><ChevronRight size={16} /></button></div></footer>}
  </section>
}
