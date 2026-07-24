import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  SafeAreaView
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { io } from 'socket.io-client'
import { colors, radius, shadows, spacing } from '../theme'
import apiClient from '../lib/apiClient'

// Re-use logic to get socket url from environment
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://unentwined-johanne-biasedly.ngrok-free.dev'
// Adjust if API_URL ends with /api, socket URL usually doesn't, but let's assume socket is at the same origin
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3005'

const AI_PROMPT_PATTERNS = [
  'gợi ý cho tôi menu đồ uống nổi bật',
  'tôi muốn đặt đồ uống giao ngay',
  'tôi muốn đặt hàng',
  'kiểm tra trạng thái đơn hàng của tôi',
  'kiểm tra đơn hàng của tôi',
  'địa chỉ các chi nhánh gần đây',
  'cửa hàng gần tôi ở đâu?',
  'cửa hàng gần tôi',
  'cho tôi xem mã giảm giá và khuyến mãi',
  'có khuyến mãi gì không?',
  'các phương thức thanh toán được hỗ trợ',
  'phương thức thanh toán nào được hỗ trợ?',
  'tôi muốn thanh toán ngay',
  'trời mưa nên uống gì nhỉ',
  'bạn thông minh đấy',
  'cho tôi xem menu đồ uống',
  'cho tôi xem menu'
]

function isStaffChatMessage(msg) {
  if (!msg) return false
  if (msg.vai_tro_nguoi_gui === 'AI') return false
  if (msg.vai_tro_nguoi_gui === 'STAFF' || msg.vai_tro_nguoi_gui === 'MANAGER') return true
  const textLower = String(msg.noi_dung || '').trim().toLowerCase()
  if (AI_PROMPT_PATTERNS.some(p => textLower === p)) return false
  return true
}

export function AdminChatWidget({ admin, sessionRole }) {
  const [isOpen, setIsOpen] = useState(false)
  const [view, setView] = useState('list') // 'list' | 'detail'
  const [conversations, setConversations] = useState([])
  const [selectedConv, setSelectedConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sending, setSending] = useState(false)
  const [totalUnread, setTotalUnread] = useState(0)
  
  const socketRef = useRef(null)
  const flatListRef = useRef(null)

  const userId = admin?.tenDangNhap || admin?.ma_nguoi_dung || admin?.id || ''
  const userName = admin?.ho_ten || admin?.tenDangNhap || 'Staff'
  const userRole = sessionRole || 'STAFF'

  const calcTotalUnread = useCallback((convList) => {
    return convList.reduce((sum, c) => sum + Number(c.so_tin_nhan_chua_doc_nhan_su || 0), 0)
  }, [])

  useEffect(() => {
    if (!userId) return

    const socket = io(`${SOCKET_URL}/chat`, {
      transports: ['websocket'],
      auth: { userId, role: userRole },
    })

    socket.emit('chat:subscribe', { userId, role: userRole })

    socket.on('chat:message:new', (msg) => {
      if (!isStaffChatMessage(msg)) return
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        const next = [...prev, msg]
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
        return next
      })
    })

    socket.on('chat:conversation:update', (conv) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.ma_hoi_thoai === conv.ma_hoi_thoai)
        let next
        if (idx >= 0) {
          next = prev.map((c, i) => (i === idx ? conv : c))
        } else {
          next = [conv, ...prev]
        }
        setTotalUnread(calcTotalUnread(next))
        return next
      })
      setSelectedConv((prev) => (prev?.ma_hoi_thoai === conv.ma_hoi_thoai ? conv : prev))
    })

    socketRef.current = socket
    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [userId, userRole, calcTotalUnread])

  useEffect(() => {
    if (selectedConv?.ma_hoi_thoai && socketRef.current) {
      socketRef.current.emit('chat:conversation:join', { conversationId: selectedConv.ma_hoi_thoai })
    }
  }, [selectedConv?.ma_hoi_thoai])

  const fetchConversations = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await apiClient.get(`/chat/conversations?user_id=${encodeURIComponent(userId)}&role=${userRole}`)
      const items = res?.items || []
      setConversations(items)
      setTotalUnread(calcTotalUnread(items))
    } catch {
      // ignore
    } finally {
      setLoadingList(false)
    }
  }, [userId, userRole, calcTotalUnread])

  const openWidget = () => {
    setIsOpen(true)
    setView('list')
    fetchConversations()
  }

  const openConversation = async (conv) => {
    setSelectedConv(conv)
    setView('detail')
    setLoadingMessages(true)
    setMessages([])
    try {
      const res = await apiClient.get(`/chat/conversations/${conv.ma_hoi_thoai}/messages?user_id=${encodeURIComponent(userId)}&role=${userRole}`)
      const items = (res?.items || []).filter(isStaffChatMessage)
      setMessages(items)
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50)
      
      // mark as read
      await apiClient.patch(`/chat/conversations/${conv.ma_hoi_thoai}/read`, {
        reader_user_id: userId,
        reader_role: userRole,
      })
    } catch {
      // ignore
    } finally {
      setLoadingMessages(false)
    }
  }

  const sendMessage = async () => {
    const content = inputText.trim()
    if (!content || !selectedConv || sending) return
    setSending(true)
    setInputText('')
    try {
      const res = await apiClient.post(`/chat/conversations/${selectedConv.ma_hoi_thoai}/messages`, {
        sender_user_id: userId,
        sender_name: userName,
        sender_role: userRole,
        content,
      })
      
      if (res && res.id) {
        setMessages(prev => {
          if (prev.some(m => m.id === res.id)) return prev
          return [...prev, res]
        })
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
      } else {
        const latestRes = await apiClient.get(`/chat/conversations/${selectedConv.ma_hoi_thoai}/messages?user_id=${encodeURIComponent(userId)}&role=${userRole}`)
        setMessages(latestRes?.items || [])
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
      }
    } catch {
      setInputText(content)
    } finally {
      setSending(false)
    }
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  if (!userId || sessionRole === 'ADMIN') return null

  return (
    <>
      <Pressable style={[styles.bubbleBtn, shadows.lg]} onPress={isOpen ? () => setIsOpen(false) : openWidget}>
        <Ionicons name={isOpen ? "close" : "chatbubble-ellipses"} size={28} color="#fff" />
        {!isOpen && totalUnread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{totalUnread > 9 ? '9+' : totalUnread}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={isOpen} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>Tin nhắn khách hàng 💬</Text>
                <Text style={styles.headerSub}>
                  {view === 'list' ? `${conversations.length} hội thoại` : selectedConv?.ten_khach_hang || 'Khách'}
                </Text>
              </View>
              <View style={styles.headerActions}>
                {view === 'detail' && (
                  <Pressable style={styles.iconBtn} onPress={() => setView('list')}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                  </Pressable>
                )}
                <Pressable style={styles.iconBtn} onPress={() => setIsOpen(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </Pressable>
              </View>
            </View>

            {view === 'list' && (
              <View style={styles.content}>
                {loadingList ? (
                  <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
                ) : conversations.length === 0 ? (
                  <Text style={styles.emptyText}>Chưa có hội thoại nào</Text>
                ) : (
                  <FlatList
                    data={conversations}
                    keyExtractor={c => c.ma_hoi_thoai}
                    contentContainerStyle={{ padding: spacing.md }}
                    renderItem={({ item }) => (
                      <Pressable 
                        style={[styles.convItem, item.so_tin_nhan_chua_doc_nhan_su > 0 && styles.convItemUnread]}
                        onPress={() => openConversation(item)}
                      >
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{(item.ten_khach_hang || 'K').charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.convInfo}>
                          <View style={styles.convNameRow}>
                            <Text style={[styles.convName, item.so_tin_nhan_chua_doc_nhan_su > 0 && styles.convNameUnread]}>
                              {item.ten_khach_hang || 'Khách'}
                            </Text>
                            {item.so_tin_nhan_chua_doc_nhan_su > 0 && (
                              <View style={styles.unreadBadge}>
                                <Text style={styles.unreadBadgeText}>{item.so_tin_nhan_chua_doc_nhan_su}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.convPreview} numberOfLines={1}>
                            {item.vai_tro_nguoi_gui_cuoi && item.vai_tro_nguoi_gui_cuoi !== 'CUSTOMER' ? 'Bạn: ' : ''}
                            {item.tin_nhan_cuoi || 'Hội thoại mới'}
                          </Text>
                        </View>
                        <View style={[styles.statusDot, { backgroundColor: item.trang_thai === 'OPEN' ? colors.success : colors.muted }]} />
                      </Pressable>
                    )}
                  />
                )}
              </View>
            )}

            {view === 'detail' && (
              <View style={styles.content}>
                {loadingMessages ? (
                  <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
                ) : (
                  <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={m => String(m.id)}
                    contentContainerStyle={{ padding: spacing.md }}
                    ListEmptyComponent={<Text style={styles.emptyText}>Chưa có tin nhắn</Text>}
                    renderItem={({ item }) => {
                      const isCustomer = item.vai_tro_nguoi_gui === 'CUSTOMER'
                      return (
                        <View style={[styles.msgRow, isCustomer ? styles.msgFromCustomer : styles.msgFromStaff]}>
                          <View style={[styles.msgBubble, isCustomer ? styles.bubbleCustomer : styles.bubbleStaff]}>
                            {isCustomer && <Text style={styles.msgSender}>{item.ten_nguoi_gui || 'Khách'}</Text>}
                            <Text style={styles.msgText}>{item.noi_dung}</Text>
                            <Text style={styles.msgTime}>{formatTime(item.ngay_tao)}</Text>
                          </View>
                        </View>
                      )
                    }}
                  />
                )}
                
                <View style={styles.inputArea}>
                  <TextInput
                    style={styles.input}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder="Nhắn tin cho khách..."
                    multiline
                  />
                  <Pressable 
                    style={[styles.sendBtn, (!inputText.trim() || sending) && styles.sendBtnDisabled]} 
                    onPress={sendMessage}
                    disabled={!inputText.trim() || sending}
                  >
                    <Ionicons name="send" size={20} color="#fff" />
                  </Pressable>
                </View>
              </View>
            )}
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  bubbleBtn: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.danger,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { flex: 1, backgroundColor: '#f1f5f9', marginTop: Platform.OS === 'ios' ? 40 : 20, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, overflow: 'hidden' },
  
  header: { backgroundColor: '#0ea5e9', padding: spacing.lg, flexDirection: 'row', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: '#e0f2fe', fontSize: 13, marginTop: 4 },
  headerActions: { flexDirection: 'row', gap: 16 },
  iconBtn: { padding: 4 },

  content: { flex: 1 },
  emptyText: { textAlign: 'center', color: colors.muted, marginTop: 40, fontSize: 14 },
  
  convItem: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.borderLight, alignItems: 'center' },
  convItemUnread: { backgroundColor: '#f0f9ff' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  convInfo: { flex: 1 },
  convNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  convName: { fontSize: 15, fontWeight: '600', color: colors.text },
  convNameUnread: { fontWeight: '900', color: '#0ea5e9' },
  unreadBadge: { backgroundColor: colors.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  unreadBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  convPreview: { fontSize: 13, color: colors.textSecondary },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 12 },

  msgRow: { marginBottom: 12, flexDirection: 'row' },
  msgFromCustomer: { justifyContent: 'flex-start' },
  msgFromStaff: { justifyContent: 'flex-end' },
  msgBubble: { maxWidth: '80%', padding: 12, borderRadius: 16 },
  bubbleCustomer: { backgroundColor: '#fff', borderTopLeftRadius: 4 },
  bubbleStaff: { backgroundColor: '#0ea5e9', borderTopRightRadius: 4 },
  msgSender: { fontSize: 11, fontWeight: '800', color: '#0ea5e9', marginBottom: 4 },
  msgText: { fontSize: 15, color: '#333' },
  msgTime: { fontSize: 10, color: '#9ca3af', alignSelf: 'flex-end', marginTop: 4 },

  inputArea: { flexDirection: 'row', padding: spacing.md, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.borderLight, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, minHeight: 44, maxHeight: 100, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#0ea5e9', alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  sendBtnDisabled: { backgroundColor: '#cbd5e1' },
})
