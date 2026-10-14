import { MessageSquare } from 'lucide-react'
export function AdminChatWidget({ session, onOpenInbox, hidden }) {
  if (!session || hidden) return null
  return <button type="button" aria-label="Mở trang tin nhắn khách hàng" title="Tin nhắn khách hàng" className="admin-chat-bubble-btn" onClick={onOpenInbox}><MessageSquare size={25} /></button>
}
