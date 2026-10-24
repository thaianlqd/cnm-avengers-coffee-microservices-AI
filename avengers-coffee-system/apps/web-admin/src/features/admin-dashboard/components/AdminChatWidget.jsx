import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { MessageSquare } from '../../../components/console/WorkspaceIcons'
import { createStaffInbox } from '../../../components/console/staffInbox.mjs'
export function AdminChatWidget({ session, onOpenInbox, hidden }) {
  const [unread, setUnread] = useState(0)
  const user = session?.user || {}, userId = user.maNguoiDung || user.ma_nguoi_dung || user.id || user.tenDangNhap
  const role = user.vaiTro || user.vai_tro || 'STAFF', token = session?.token || session?.accessToken
  useEffect(() => {
    setUnread(0)
    if (!userId || hidden) return
    const client = { get: async path => {
      const response = await fetch(`${import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000`}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!response.ok) throw new Error('Chat request failed')
      return response.json()
    } }
    const model = createStaffInbox({ client, userId, role, onChange: state => setUnread(state.conversations.reduce((sum, row) => sum + Number(row.so_tin_nhan_chua_doc_nhan_su || 0), 0)) })
    model.refresh()
    const socket = io(`${import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:3005`}/chat`, { transports: ['websocket'], auth: { userId, role, token } })
    socket.on('connect', () => { socket.emit('chat:subscribe', { userId, role }); model.refresh() })
    socket.on('chat:conversation:update', row => model.receiveConversation(row))
    const timer = setInterval(() => model.refresh(), 15000)
    return () => { clearInterval(timer); model.dispose(); socket.disconnect() }
  }, [userId, role, token, hidden])
  if (!session || hidden) return null
  return <Button type="button" aria-label="Mở trang tin nhắn khách hàng" title="Tin nhắn khách hàng" className="admin-chat-bubble-btn" onClick={onOpenInbox}><MessageSquare size={25} />{unread > 0 && <Badge variant="outline" className="admin-chat-bubble-badge" aria-label={`${unread} tin nhắn chưa đọc`}>{unread > 99 ? '99+' : unread}</Badge>}</Button>
}
