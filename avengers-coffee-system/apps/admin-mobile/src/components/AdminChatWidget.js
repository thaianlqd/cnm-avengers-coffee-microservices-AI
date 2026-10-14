import React, { useEffect, useState } from 'react'
import { Pressable, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { io } from 'socket.io-client'
import apiClient from '../lib/apiClient'
import { createStaffInbox } from '../../../web-admin/src/components/console/staffInbox.mjs'
export function AdminChatWidget({ admin, sessionRole, onOpenInbox }) {
  const [unread, setUnread] = useState(0)
  const userId = admin?.maNguoiDung || admin?.ma_nguoi_dung || admin?.id || admin?.tenDangNhap
  useEffect(() => {
    setUnread(0)
    if (!userId) return
    const model = createStaffInbox({ client: apiClient, userId, role: sessionRole, onChange: state => setUnread(state.conversations.reduce((sum, row) => sum + Number(row.so_tin_nhan_chua_doc_nhan_su || 0), 0)) })
    model.refresh()
    const base = apiClient.defaults.baseURL
    const socket = io(`${process.env.EXPO_PUBLIC_SOCKET_URL || base.replace(/:\d+(?=\/|$)/, ':3005')}/chat`, { transports: ['websocket'], auth: { userId, role: sessionRole } })
    socket.on('connect', () => { socket.emit('chat:subscribe', { userId, role: sessionRole }); model.refresh() })
    socket.on('chat:conversation:update', row => model.receiveConversation(row))
    const timer = globalThis.setInterval(() => model.refresh(), 15000)
    return () => { globalThis.clearInterval(timer); model.dispose(); socket.disconnect() }
  }, [userId, sessionRole])
  return <Pressable accessibilityRole="button" accessibilityLabel="Mở trang tin nhắn khách hàng" onPress={onOpenInbox} style={{ position: 'absolute', bottom: 24, right: 24, width: 54, height: 54, borderRadius: 27, backgroundColor: '#1671ba', justifyContent: 'center', alignItems: 'center', zIndex: 99, shadowColor: '#1671ba', shadowRadius: 10, shadowOpacity: 0.2, elevation: 4 }}><Ionicons name="chatbubbles-outline" size={25} color="#fff" />{unread > 0 && <Text accessibilityLabel={`${unread} tin nhắn chưa đọc`} style={{ position: 'absolute', top: -4, right: -4, minWidth: 22, paddingHorizontal: 4, height: 22, lineHeight: 22, borderRadius: 11, backgroundColor: '#ef4444', color: '#fff', textAlign: 'center', fontSize: 10, fontWeight: '700' }}>{unread > 99 ? '99+' : unread}</Text>}</Pressable>
}
