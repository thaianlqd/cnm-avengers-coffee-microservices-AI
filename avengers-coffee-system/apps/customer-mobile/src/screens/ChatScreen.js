import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import { getUserDisplayName, getUserId } from '../lib/customerData'
import { colors, spacing, shadows, radius } from '../theme'
import VoiceOrderCard from '../components/VoiceOrderCard'

function formatTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatCurrency(amount) {
  return Number(amount || 0).toLocaleString('vi-VN') + 'đ'
}

function MessageBubble({ message, isOwn }) {
  return (
    <View style={[styles.bubbleRow, isOwn && styles.bubbleRowOwn]}>
      {!isOwn && (
        <View style={styles.avatarStaff}>
          <Ionicons name="headset-outline" size={16} color={colors.primary} />
        </View>
      )}
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther]}>
        {!isOwn && message.ten_nguoi_gui ? (
          <Text style={styles.bubbleSender}>{message.ten_nguoi_gui}</Text>
        ) : null}
        <Text style={[styles.bubbleText, isOwn && styles.bubbleTextOwn]}>
          {message.noi_dung}
        </Text>
        <Text style={[styles.bubbleTime, isOwn && styles.bubbleTimeOwn]}>
          {formatTime(message.ngay_tao)}
        </Text>
      </View>
    </View>
  )
}

function DateSeparator({ date }) {
  return (
    <View style={styles.dateSeparator}>
      <View style={styles.dateLine} />
      <Text style={styles.dateText}>{date}</Text>
      <View style={styles.dateLine} />
    </View>
  )
}

// ─── Recording pulse animation ────────────────────────────────────────────────
function MicPulse() {
  const scale = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 500, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start()
  }, [])
  return (
    <Animated.View style={[styles.micPulse, { transform: [{ scale }] }]}>
      <LinearGradient colors={['#ef4444', '#dc2626']} style={styles.micPulseGrad}>
        <Ionicons name="mic" size={20} color="#fff" />
      </LinearGradient>
    </Animated.View>
  )
}

export function ChatScreen({ navigation }) {
  const { user } = useUser()
  const userId = getUserId(user)
  const userName = getUserDisplayName(user)
  const queryClient = useQueryClient()
  const flatListRef = useRef(null)

  const [messageText, setMessageText] = useState('')
  const [conversationId, setConversationId] = useState(null)
  const fadeAnim = useRef(new Animated.Value(0)).current

  // Voice state
  const [isRecording, setIsRecording] = useState(false)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const recordingRef = useRef(null)

  // Order intent card state
  const [pendingOrder, setPendingOrder] = useState(null) // { transcript, items, total, message }
  const [orderLoading, setOrderLoading] = useState(false)

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start()
  }, [])

  // ─── Conversations ──────────────────────────────────────────────────────────
  const openConversationMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post('/chat/conversations/open', {
        customer_user_id: userId,
        customer_name: userName,
      })
    },
    onSuccess: (data) => {
      if (data?.conversation?.ma_hoi_thoai) {
        setConversationId(data.conversation.ma_hoi_thoai)
      }
    },
  })

  useEffect(() => {
    if (userId && !conversationId) {
      openConversationMutation.mutate()
    }
  }, [userId])

  const messagesQuery = useQuery({
    queryKey: ['chat', 'messages', conversationId],
    queryFn: async () => {
      const res = await apiClient.get(
        `/chat/conversations/${conversationId}/messages?user_id=${encodeURIComponent(userId)}&role=CUSTOMER`
      )
      return res
    },
    enabled: Boolean(conversationId),
    refetchInterval: 3000,
    staleTime: 2000,
  })

  const messages = messagesQuery.data?.items || []
  const conversation = messagesQuery.data?.conversation || null

  useEffect(() => {
    if (conversationId && conversation?.so_tin_nhan_chua_doc_khach > 0) {
      apiClient
        .patch(`/chat/conversations/${conversationId}/read`, {
          reader_user_id: userId,
          reader_role: 'CUSTOMER',
        })
        .catch(() => {})
    }
  }, [conversationId, conversation?.so_tin_nhan_chua_doc_khach])

  // ─── Send text message ──────────────────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: async (content) => {
      return apiClient.post(`/chat/conversations/${conversationId}/messages`, {
        sender_user_id: userId,
        sender_name: userName,
        sender_role: 'CUSTOMER',
        content,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat', 'messages', conversationId] })
    },
  })

  const handleSend = useCallback(async () => {
    const text = messageText.trim()
    if (!text || !conversationId || sendMutation.isPending) return
    setMessageText('')

    // Check if text looks like an order intent before sending as normal message
    const orderKeywords = ['cho tôi', 'đặt', 'order', 'mua', 'lấy', 'cần', 'muốn']
    const looksLikeOrder = orderKeywords.some((kw) => text.toLowerCase().includes(kw))

    if (looksLikeOrder) {
      // Try to parse as order intent
      setVoiceLoading(true)
      try {
        const result = await apiClient.post('/ai/chat/order-intent', {
          text,
          user_id: userId,
        })
        if (result?.can_order && result?.items?.length > 0) {
          setPendingOrder({
            transcript: null,
            items: result.items,
            total: result.estimated_total,
            message: result.message,
          })
          // Also send as chat message so staff can see
          sendMutation.mutate(text)
          return
        }
      } catch {
        // Ignore — just send as normal message
      } finally {
        setVoiceLoading(false)
      }
    }

    sendMutation.mutate(text)
  }, [messageText, conversationId, sendMutation.isPending, userId])

  // ─── Voice recording ────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Cần quyền mic',
          'Hãy cấp quyền microphone để sử dụng tính năng đặt hàng bằng giọng nói.',
          [{ text: 'OK' }]
        )
        return
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      })
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      )
      recordingRef.current = recording
      setIsRecording(true)
    } catch (err) {
      console.error('startRecording error:', err)
      Alert.alert('Lỗi', 'Không thể bật microphone. Thử lại nhé!')
    }
  }

  const stopRecordingAndProcess = async () => {
    if (!recordingRef.current) return
    setIsRecording(false)
    setVoiceLoading(true)

    try {
      await recordingRef.current.stopAndUnloadAsync()
      const uri = recordingRef.current.getURI()
      recordingRef.current = null

      if (!uri) throw new Error('No recording URI')

      // Build FormData to upload audio
      const formData = new FormData()
      formData.append('audio', {
        uri,
        name: 'audio.m4a',
        type: 'audio/m4a',
      })
      formData.append('user_id', userId || '')
      formData.append('language', 'vi')

      const result = await apiClient.postForm('/ai/voice-order', formData)

      if (result?.transcript) {
        // Send transcript as chat message
        sendMutation.mutate(`🎙️ "${result.transcript}"`)
      }

      if (result?.can_order && result?.items?.length > 0) {
        setPendingOrder({
          transcript: result.transcript,
          items: result.items,
          total: result.estimated_total,
          message: result.message,
        })
      } else if (result?.transcript) {
        // Intent is QUERY — send to AI chat for normal response
        // (already sent as message above)
      }
    } catch (err) {
      console.error('voice-order error:', err)
      Alert.alert(
        'Không nhận được giọng nói',
        'Hãy nói rõ hơn hoặc thử lại. Ví dụ: "Cho tôi 1 ly latte ít đường"'
      )
    } finally {
      setVoiceLoading(false)
    }
  }

  // ─── Confirm order ──────────────────────────────────────────────────────────
  const handleConfirmOrder = async () => {
    if (!pendingOrder) return
    setOrderLoading(true)
    try {
      const items = pendingOrder.items
        .filter((i) => i.matched)
        .map((i) => ({
          ma_san_pham: i.product_id,
          ten_san_pham: i.product_name,
          so_luong: i.quantity,
          gia_ban: i.price,
          ghi_chu: [i.size ? `Size ${i.size}` : '', i.note || ''].filter(Boolean).join(', '),
        }))

      await apiClient.post('/orders', {
        ma_nguoi_dung: userId,
        phuong_thuc_thanh_toan: 'TIEN_MAT',
        loai_don_hang: 'DELIVERY',
        chi_tiet_don_hang: items,
        ghi_chu: `Đặt qua AI Voice${pendingOrder.transcript ? ': ' + pendingOrder.transcript : ''}`,
      })

      sendMutation.mutate(`✅ Đã đặt hàng thành công! Tổng: ${formatCurrency(pendingOrder.total)}`)
      setPendingOrder(null)
      Alert.alert('🎉 Đặt hàng thành công!', 'Đơn hàng của bạn đang được xử lý.')
    } catch (err) {
      Alert.alert('Lỗi đặt hàng', 'Không thể tạo đơn. Thử lại nhé!')
    } finally {
      setOrderLoading(false)
    }
  }

  // ─── Group messages by date ─────────────────────────────────────────────────
  const messagesWithDates = React.useMemo(() => {
    const result = []
    let lastDate = ''
    for (const msg of messages) {
      const msgDate = formatDate(msg.ngay_tao)
      if (msgDate && msgDate !== lastDate) {
        result.push({ type: 'date', date: msgDate, id: `date-${msgDate}` })
        lastDate = msgDate
      }
      result.push({ type: 'message', ...msg })
    }
    return result
  }, [messages])

  const staffName = conversation?.ten_nhan_su_phu_trach || 'Tư vấn viên'
  const isLoading = openConversationMutation.isPending || (!conversationId && !openConversationMutation.isError)

  return (
    <Animated.View style={[styles.screen, { opacity: fadeAnim }]}>
      {/* Header */}
      <LinearGradient colors={['#1a0a02', '#3d1a08']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerInfo}>
          <View style={styles.headerAvatarWrap}>
            <LinearGradient colors={['#f26b1d', '#d4560e']} style={styles.headerAvatar}>
              <Ionicons name="headset-outline" size={20} color="#fff" />
            </LinearGradient>
            <View style={styles.onlineDot} />
          </View>
          <View>
            <Text style={styles.headerTitle}>{staffName}</Text>
            <Text style={styles.headerSubtitle}>Hỗ trợ & Đặt hàng AI</Text>
          </View>
        </View>
        {/* Voice hint badge */}
        <View style={styles.voiceHint}>
          <Ionicons name="mic-outline" size={12} color="#f26b1d" />
          <Text style={styles.voiceHintText}>Voice Order</Text>
        </View>
      </LinearGradient>

      {/* Loading */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Đang kết nối với hỗ trợ...</Text>
        </View>
      ) : openConversationMutation.isError ? (
        <View style={styles.loadingWrap}>
          <Ionicons name="cloud-offline-outline" size={48} color={colors.muted} />
          <Text style={styles.loadingText}>Không thể kết nối. Vui lòng thử lại.</Text>
          <Pressable onPress={() => openConversationMutation.mutate()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Thử lại</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={messagesWithDates}
            keyExtractor={(item) => String(item.id || item.date)}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => {
              flatListRef.current?.scrollToEnd({ animated: true })
            }}
            ListFooterComponent={
              pendingOrder ? (
                <VoiceOrderCard
                  transcript={pendingOrder.transcript}
                  items={pendingOrder.items}
                  total={pendingOrder.total}
                  message={pendingOrder.message}
                  onConfirm={handleConfirmOrder}
                  onDismiss={() => setPendingOrder(null)}
                  loading={orderLoading}
                />
              ) : null
            }
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <View style={styles.emptyChatIcon}>
                  <Ionicons name="chatbubbles-outline" size={48} color={colors.border} />
                </View>
                <Text style={styles.emptyChatTitle}>Xin chào! 👋</Text>
                <Text style={styles.emptyChatText}>
                  Chat hoặc nhấn 🎙️ để đặt hàng bằng giọng nói!{'\n'}
                  Ví dụ: "Cho tôi 2 ly latte ít đường"
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              if (item.type === 'date') {
                return <DateSeparator date={item.date} />
              }
              return (
                <MessageBubble
                  message={item}
                  isOwn={item.vai_tro_nguoi_gui === 'CUSTOMER'}
                />
              )
            }}
          />

          {/* Recording overlay */}
          {isRecording && (
            <View style={styles.recordingOverlay}>
              <MicPulse />
              <Text style={styles.recordingText}>Đang nghe... Nhả để gửi</Text>
              <Text style={styles.recordingHint}>Nói: "Cho tôi 2 ly latte ít đường"</Text>
            </View>
          )}

          {/* Voice processing indicator */}
          {voiceLoading && !isRecording && (
            <View style={styles.voiceProcessing}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.voiceProcessingText}>AI đang phân tích...</Text>
            </View>
          )}

          {/* Input Bar */}
          <View style={styles.inputBar}>
            <View style={styles.inputWrap}>
              <TextInput
                value={messageText}
                onChangeText={setMessageText}
                placeholder='Nhập hoặc nói "Cho tôi 2 ly latte..."'
                placeholderTextColor={colors.placeholder}
                multiline
                maxLength={500}
                style={styles.textInput}
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
              />
            </View>

            {/* Mic button — hold to record */}
            <Pressable
              onPressIn={startRecording}
              onPressOut={stopRecordingAndProcess}
              disabled={voiceLoading}
              style={({ pressed }) => [
                styles.micBtn,
                isRecording && styles.micBtnRecording,
                pressed && { opacity: 0.85 },
              ]}
            >
              <LinearGradient
                colors={isRecording ? ['#ef4444', '#dc2626'] : ['#1a0a02', '#3d1a08']}
                style={styles.micBtnGradient}
              >
                {voiceLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name={isRecording ? 'stop' : 'mic'} size={18} color="#fff" />
                )}
              </LinearGradient>
            </Pressable>

            {/* Send button */}
            <Pressable
              onPress={handleSend}
              disabled={!messageText.trim() || sendMutation.isPending || voiceLoading}
              style={({ pressed }) => [
                styles.sendBtn,
                (!messageText.trim() || sendMutation.isPending) && styles.sendBtnDisabled,
                pressed && { opacity: 0.85 },
              ]}
            >
              <LinearGradient
                colors={messageText.trim() ? ['#f26b1d', '#d4560e'] : ['#ccc', '#bbb']}
                style={styles.sendBtnGradient}
              >
                {sendMutation.isPending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerAvatarWrap: { position: 'relative' },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#1a0a02',
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#fff' },
  headerSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  voiceHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(242,107,29,0.2)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(242,107,29,0.4)',
  },
  voiceHintText: { fontSize: 10, color: '#f26b1d', fontWeight: '800' },

  // Loading
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  loadingText: { color: colors.muted, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  retryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
  },
  retryBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },

  // Messages
  messagesList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingBottom: 8,
  },

  // Date separator
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  dateLine: { flex: 1, height: 1, backgroundColor: colors.borderLight },
  dateText: { fontSize: 11, color: colors.muted, fontWeight: '700' },

  // Bubble
  bubbleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 10,
    maxWidth: '85%',
  },
  bubbleRowOwn: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatarStaff: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff4ec',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '100%' },
  bubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  bubbleSender: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 3,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bubbleTextOwn: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: colors.muted, marginTop: 4, alignSelf: 'flex-end', fontWeight: '500' },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.7)' },

  // Empty chat
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyChatIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyChatTitle: { fontSize: 20, fontWeight: '900', color: colors.text },
  emptyChatText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.xl,
  },

  // Recording overlay
  recordingOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  micPulse: { marginBottom: 4 },
  micPulseGrad: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  recordingText: { fontSize: 15, fontWeight: '800', color: '#ef4444' },
  recordingHint: { fontSize: 12, color: colors.muted, fontWeight: '500' },

  // Voice processing
  voiceProcessing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: 4,
    ...shadows.sm,
  },
  voiceProcessingText: { fontSize: 13, color: colors.primary, fontWeight: '700' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.sm,
    ...shadows.lg,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    maxHeight: 100,
  },
  textInput: { fontSize: 14, color: colors.text, lineHeight: 20, fontWeight: '500' },
  micBtn: { borderRadius: radius.full, overflow: 'hidden' },
  micBtnRecording: { transform: [{ scale: 1.1 }] },
  micBtnGradient: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtn: { borderRadius: radius.full, overflow: 'hidden' },
  sendBtnDisabled: { opacity: 0.6 },
  sendBtnGradient: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
