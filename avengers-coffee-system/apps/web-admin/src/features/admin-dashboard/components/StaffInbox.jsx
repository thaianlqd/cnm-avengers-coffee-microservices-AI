import { Button } from '../../../components/ui/button'
import { Label } from '../../../components/ui/label'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { useEffect, useMemo, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import { MessageSquare, Search, RefreshCw, Send, ChevronLeft, Check, Sparkles } from '../../../components/console/WorkspaceIcons'
import { createStaffInbox, filteredConversations, SUPPORT_REPLIES } from '../../../components/console/staffInbox.mjs'
import './StaffInbox.css'

const time = value => value ? new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''
const day = value => value ? new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : ''
const initial = value => String(value || 'Khách').trim().charAt(0).toUpperCase()
export default function StaffInbox({ session, onClose }) {
  const user = session?.user || {}, userId = user.maNguoiDung || user.ma_nguoi_dung || user.id || user.tenDangNhap
  const role = user.vaiTro || user.vai_tro || 'STAFF', token = session?.token || session?.accessToken
  const [state, setState] = useState({ conversations: [], messages: [], drafts: {} })
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all'), [connected, setConnected] = useState(false), [detail, setDetail] = useState(false)
  const bottom = useRef(null), input = useRef(null), modelRef = useRef(null)
  const client = useMemo(() => Object.fromEntries(['get', 'post', 'patch'].map(method => [method, async (path, body) => {
    const response = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000`}${path}`, {
      method: method.toUpperCase(), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
    })
    if (!response.ok) throw new Error('Chat request failed')
    return response.json()
  }])), [token])
  useEffect(() => {
    const model = createStaffInbox({ client, userId, role, name: user.hoTen || user.ho_ten || user.tenDangNhap || 'Nhân viên', onChange: setState })
    modelRef.current = model; model.refresh()
    const socket = io(`${import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:3005`}/chat`, { transports: ['websocket'], auth: { userId, role, token } })
    socket.on('connect', () => { setConnected(true); socket.emit('chat:subscribe', { userId, role }); const id = model.snapshot().selected?.ma_hoi_thoai; if (id) socket.emit('chat:conversation:join', { conversationId: id }); model.refresh(); if (id) model.select(model.snapshot().selected) })
    socket.on('disconnect', () => setConnected(false)); socket.on('connect_error', () => setConnected(false))
    socket.on('chat:message:new', message => { model.receiveMessage(message); if (message.ma_hoi_thoai === model.snapshot().selected?.ma_hoi_thoai && document.visibilityState === 'visible') model.select(model.snapshot().selected) })
    socket.on('chat:conversation:update', conversation => model.receiveConversation(conversation))
    const refresh = () => { if (document.visibilityState === 'visible') { model.refresh(); const selected = model.snapshot().selected; if (selected) model.select(selected) } }
    const timer = setInterval(refresh, 15000); document.addEventListener('visibilitychange', refresh)
    model.join = id => socket.emit('chat:conversation:join', { conversationId: id })
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refresh); model.dispose(); socket.disconnect() }
  }, [client, userId, role, token, user.hoTen, user.ho_ten, user.tenDangNhap])
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [state.messages.length, state.selected?.ma_hoi_thoai])
  const rows = filteredConversations(state.conversations, search, filter)
  const unread = state.conversations.reduce((sum, row) => sum + Number(row.so_tin_nhan_chua_doc_nhan_su || 0), 0)
  const selected = state.selected, draft = state.drafts[selected?.ma_hoi_thoai] || ''
  const choose = row => { modelRef.current.join(row.ma_hoi_thoai); modelRef.current.select(row); setDetail(true) }
  return <section className={`support-inbox ${detail ? 'show-detail' : ''}`} aria-label="Tin nhắn khách hàng">
    <aside className="support-sidebar"><header><span className="support-icon"><MessageSquare size={22} /></span><div><h2>Hội thoại</h2><p><i className={connected ? 'connected' : ''} />{connected ? 'Realtime kết nối' : 'Đang đồng bộ qua máy chủ'}</p></div><Button type="button" aria-label="Tải lại hội thoại" onClick={() => modelRef.current.refresh()}><RefreshCw size={18} /></Button></header>
      <Label className="support-search"><Search size={18} /><Input aria-label="Tìm hội thoại" placeholder="Tìm khách hàng, nội dung…" value={search} onChange={event => setSearch(event.target.value)} /></Label>
      <div className="support-filters">{[['all', `Tất cả (${state.conversations.length})`], ['unread', `Chưa đọc (${unread})`], ['open', 'Đang mở']].map(([id, label]) => <Button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</Button>)}</div>
      <nav aria-label="Danh sách hội thoại">{state.loading && !rows.length ? <p className="support-empty">Đang tải hội thoại…</p> : !rows.length ? <p className="support-empty">Không có hội thoại phù hợp.</p> : rows.map(row => <Button type="button" key={row.ma_hoi_thoai} className={`support-conversation ${selected?.ma_hoi_thoai === row.ma_hoi_thoai ? 'selected' : ''}`} onClick={() => choose(row)}><span className="support-avatar">{initial(row.ten_khach_hang)}</span><span className="support-conversation-copy"><span><b>{row.ten_khach_hang || 'Khách hàng'}</b><time>{day(row.ngay_cap_nhat)}</time></span><small>{row.vai_tro_nguoi_gui_cuoi && row.vai_tro_nguoi_gui_cuoi !== 'CUSTOMER' ? 'Bạn: ' : ''}{row.tin_nhan_cuoi || 'Bắt đầu cuộc trò chuyện'}</small></span>{Number(row.so_tin_nhan_chua_doc_nhan_su) > 0 && <em>{row.so_tin_nhan_chua_doc_nhan_su}</em>}</Button>)}</nav>
    </aside>
    <div className="support-thread"><header><Button type="button" className="support-back" aria-label="Quay lại danh sách hội thoại" onClick={() => setDetail(false)}><ChevronLeft size={20} /></Button><span className="support-avatar">{initial(selected?.ten_khach_hang)}</span><div><h3>{selected?.ten_khach_hang || 'Chăm sóc khách hàng'}</h3><p>{selected ? selected.trang_thai === 'OPEN' ? 'Hội thoại đang mở' : 'Hội thoại đã đóng' : 'Chọn một hội thoại để bắt đầu'}</p></div>{onClose && <Button type="button" className="support-minimize" onClick={onClose}>Thu gọn</Button>}</header>
      {state.error && <div className="support-error" role="alert">{state.error}</div>}
      <div className="support-message-list" role="log" aria-label="Nội dung hội thoại">{!selected ? <div className="support-welcome"><span><MessageSquare size={36} /></span><h3>Mỗi tin nhắn, một kết nối.</h3><p>Trả lời khách hàng, hỗ trợ món và theo dõi yêu cầu tại một nơi.</p></div> : state.loadingMessages && !state.messages.length ? <p className="support-empty">Đang tải tin nhắn…</p> : <>{state.messages.map((message, index) => <div key={message.id}>{(!index || day(message.ngay_tao) !== day(state.messages[index - 1].ngay_tao)) && <div className="support-day"><span>{day(message.ngay_tao)}</span></div>}<div className={`support-message ${message.vai_tro_nguoi_gui === 'CUSTOMER' ? 'incoming' : 'outgoing'}`}>{message.vai_tro_nguoi_gui === 'CUSTOMER' && <span className="support-avatar small">{initial(selected.ten_khach_hang)}</span>}<div><p>{message.noi_dung}</p><small>{time(message.ngay_tao)}{message.vai_tro_nguoi_gui !== 'CUSTOMER' && <Check size={13} aria-label="Đã gửi tới máy chủ" />}</small></div></div></div>)}<div ref={bottom} /></>}</div>
      {selected && <><div className="support-quick"><span><Sparkles size={15} />Trả lời nhanh</span>{SUPPORT_REPLIES.map(text => <Button key={text} type="button" onClick={() => { modelRef.current.setDraft(text); input.current?.focus() }}>{text}</Button>)}</div><form className="support-composer" onSubmit={event => { event.preventDefault(); modelRef.current.send() }}><Textarea ref={input} aria-label="Tin nhắn trả lời khách" rows={1} value={draft} onChange={event => modelRef.current.setDraft(event.target.value)} placeholder="Nhập tin nhắn cho khách… (Enter để gửi)" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); modelRef.current.send() } }} /><Button type="submit" disabled={!draft.trim() || state.sending || state.loadingMessages}>{state.sending ? 'Đang gửi' : 'Gửi'}<Send size={18} /></Button></form></>}
    </div>
  </section>
}
