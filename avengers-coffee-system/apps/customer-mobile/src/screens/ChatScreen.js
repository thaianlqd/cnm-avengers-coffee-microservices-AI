/**
 * ChatScreen.js — AI Chat Assistant Siêu Xịn
 * Features:
 * - Rich message rendering: product cards, order cards, store cards, image, quick replies
 * - AI-powered ordering flow (search → customize → cart → payment)
 * - Order tracking in chat
 * - Store info with directions link
 * - Voice ordering
 */
import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react'
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
  Image,
  ScrollView,
  Linking,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import { getUserDisplayName, getUserId, safeArray } from '../lib/customerData'
import { colors, spacing, shadows, radius } from '../theme'

// ─── Helpers ────────────────────────────────────────────────────────────────
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

function getOrderStatusLabel(status) {
  const labels = {
    CHO_XAC_NHAN: { label: 'Vừa tạo', color: '#f59e0b', bg: '#fef3c7', icon: 'time-outline' },
    DA_XAC_NHAN: { label: 'Đã xác nhận', color: '#3b82f6', bg: '#eff6ff', icon: 'checkmark-circle-outline' },
    DANG_CHUAN_BI: { label: 'Đang chuẩn bị', color: '#8b5cf6', bg: '#f5f3ff', icon: 'cafe-outline' },
    DANG_GIAO: { label: 'Đang giao', color: '#ea8025', bg: '#fff7ed', icon: 'bicycle-outline' },
    HOAN_THANH: { label: 'Hoàn thành', color: '#22c55e', bg: '#f0fdf4', icon: 'checkmark-done-circle-outline' },
    DA_HUY: { label: 'Đã huỷ', color: '#ef4444', bg: '#fef2f2', icon: 'close-circle-outline' },
  }
  return labels[status] || { label: status || 'N/A', color: '#64748b', bg: '#f1f5f9', icon: 'help-circle-outline' }
}

// ─── QUICK REPLY CHIPS ───────────────────────────────────────────────────────
const QUICK_REPLIES = [
  { id: 'menu', label: 'Xem menu', icon: 'restaurant-outline', text: 'Cho tôi xem menu đồ uống' },
  { id: 'order', label: 'Đặt hàng', icon: 'cart-outline', text: 'Tôi muốn đặt hàng' },
  { id: 'orders', label: 'Đơn hàng', icon: 'receipt-outline', text: 'Kiểm tra đơn hàng của tôi' },
  { id: 'stores', label: 'Cửa hàng', icon: 'location-outline', text: 'Cửa hàng gần tôi ở đâu?' },
  { id: 'voucher', label: 'Ưu đãi', icon: 'pricetag-outline', text: 'Có khuyến mãi gì không?' },
  { id: 'payment', label: 'Thanh toán', icon: 'card-outline', text: 'Phương thức thanh toán nào được hỗ trợ?' },
]

// ─── AI LOCAL HANDLER ────────────────────────────────────────────────────────
// Xử lý thông minh tại client để generate rich messages
function detectIntent(text) {
  const t = text.toLowerCase().trim()
  if (/(đơn|order|đặt rồi|trạng thái|theo dõi|giao hàng)/.test(t)) return 'orders'
  if (/(cửa hàng|chi nhánh|địa chỉ|địa điểm|gần đây|ở đâu)/.test(t)) return 'stores'
  if (/(menu|thực đơn|đồ uống|coffee|cà phê|trà|sữa|đồ ăn|bánh|xem)/.test(t)) return 'menu'
  if (/(khuyến mãi|voucher|giảm giá|ưu đãi|mã)/.test(t)) return 'voucher'
  if (/(thanh toán|payment|vnpay|tiền mặt|ví|momo|atm)/.test(t)) return 'payment'
  if (/(đặt|mua|cho tôi|order|lấy|muốn|cần)\s+\d*\s*(ly|cái|phần|suất)/.test(t)) return 'order_intent'
  if (/(đặt|mua|cho tôi|order|lấy|muốn|cần)/.test(t)) return 'order_intent'
  return 'chat'
}

// ─── RICH MESSAGE TYPES ─────────────────────────────────────────────────────

// Product Card dạng mini (trong chat)
function ProductMiniCard({ product, onAddToCart }) {
  return (
    <Pressable
      style={richStyles.productCard}
      onPress={() => onAddToCart && onAddToCart(product)}
    >
      {product.hinh_anh_url ? (
        <Image source={{ uri: product.hinh_anh_url }} style={richStyles.productImg} resizeMode="cover" />
      ) : (
        <View style={[richStyles.productImg, richStyles.productImgPlaceholder]}>
          <Ionicons name="cafe-outline" size={22} color="#94a3b8" />
        </View>
      )}
      <View style={richStyles.productInfo}>
        <Text style={richStyles.productName} numberOfLines={2}>{product.ten_san_pham}</Text>
        <Text style={richStyles.productPrice}>{formatCurrency(product.gia_ban)}</Text>
      </View>
      <Pressable style={richStyles.productAddBtn} onPress={() => onAddToCart && onAddToCart(product)}>
        <Ionicons name="add" size={18} color="#fff" />
      </Pressable>
    </Pressable>
  )
}

// Order mini card (trong chat)
function OrderMiniCard({ order, onTrack }) {
  const status = getOrderStatusLabel(order.trang_thai_don_hang)
  const code = (order.ma_don_hang || '').slice(0, 13) + '...'
  return (
    <Pressable style={richStyles.orderCard} onPress={() => onTrack && onTrack(order)}>
      <View style={richStyles.orderCardTop}>
        <View>
          <Text style={richStyles.orderCode}>#{code}</Text>
          <Text style={richStyles.orderDate}>{formatDate(order.ngay_tao || order.created_at)}</Text>
        </View>
        <View style={[richStyles.statusBadge, { backgroundColor: status.bg }]}>
          <Ionicons name={status.icon} size={12} color={status.color} />
          <Text style={[richStyles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>
      <View style={richStyles.orderCardBottom}>
        <Text style={richStyles.orderTotal}>{formatCurrency(order.tong_tien || order.total)}</Text>
        <View style={richStyles.trackBtn}>
          <Ionicons name="navigate-outline" size={13} color={colors.primary} />
          <Text style={richStyles.trackBtnText}>Xem chi tiết</Text>
        </View>
      </View>
    </Pressable>
  )
}

// Store mini card (trong chat)
function StoreMiniCard({ branch }) {
  const openMaps = () => {
    if (branch.map_url) Linking.openURL(branch.map_url).catch(() => {})
  }
  const call = () => {
    if (branch.so_dien_thoai) Linking.openURL(`tel:${branch.so_dien_thoai}`).catch(() => {})
  }
  return (
    <View style={richStyles.storeCard}>
      <View style={richStyles.storeCardTop}>
        <View style={richStyles.storeIcon}>
          <Ionicons name="storefront-outline" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={richStyles.storeName} numberOfLines={2}>{branch.ten_chi_nhanh}</Text>
          <Text style={richStyles.storeAddr} numberOfLines={2}>{branch.dia_chi}</Text>
          {branch.gio_mo_cua && (
            <Text style={richStyles.storeHours}>🕐 {branch.gio_mo_cua} – {branch.gio_dong_cua}</Text>
          )}
        </View>
      </View>
      <View style={richStyles.storeActions}>
        {branch.so_dien_thoai && (
          <Pressable style={richStyles.storeBtn} onPress={call}>
            <Ionicons name="call-outline" size={13} color={colors.primary} />
            <Text style={richStyles.storeBtnText}>Gọi ngay</Text>
          </Pressable>
        )}
        {branch.map_url && (
          <Pressable style={[richStyles.storeBtn, richStyles.storeBtnPrimary]} onPress={openMaps}>
            <Ionicons name="navigate-outline" size={13} color="#fff" />
            <Text style={[richStyles.storeBtnText, { color: '#fff' }]}>Chỉ đường</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

// Info card cho Payment methods
function PaymentInfoCard() {
  const methods = [
    { icon: 'card-outline', color: '#0ea5e9', label: 'VNPAY', desc: 'Thẻ ATM / Internet Banking' },
    { icon: 'qr-code-outline', color: '#3b82f6', label: 'QR Code', desc: 'Quét mã ngân hàng' },
    { icon: 'wallet-outline', color: '#ea8025', label: 'Ví Avengers', desc: 'Nạp tiền, nhận hoàn xu' },
    { icon: 'cash-outline', color: '#22c55e', label: 'Tiền mặt', desc: 'Thanh toán khi nhận hàng' },
  ]
  return (
    <View style={richStyles.infoCard}>
      <Text style={richStyles.infoCardTitle}>Phương thức thanh toán</Text>
      {methods.map(m => (
        <View key={m.label} style={richStyles.infoRow}>
          <View style={[richStyles.infoIcon, { backgroundColor: m.color + '20' }]}>
            <Ionicons name={m.icon} size={16} color={m.color} />
          </View>
          <View>
            <Text style={richStyles.infoRowLabel}>{m.label}</Text>
            <Text style={richStyles.infoRowDesc}>{m.desc}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}

// Voucher info card
function VoucherInfoCard({ vouchers = [] }) {
  return (
    <View style={richStyles.infoCard}>
      <Text style={richStyles.infoCardTitle}>Ưu đãi đang có</Text>
      {(!vouchers || vouchers.length === 0) && (
        <Text style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          Hiện chưa có voucher khả dụng. Đăng ký thành viên để nhận ưu đãi!
        </Text>
      )}
      {vouchers.slice(0, 4).map((v, i) => {
        const code = v.ma_khuyen_mai || v.ma_voucher || v.code || `VOUCHER-${i + 1}`
        const name = v.ten_khuyen_mai || v.ten_voucher || v.name || v.title || `Voucher ${code}`
        const type = String(v.loai_khuyen_mai || v.loai_giam_gia || v.loai || '').toUpperCase()
        const rawVal = Number(v.gia_tri || v.gia_tri_giam || v.discount_value || 0)
        let badgeText = 'HOT'
        if (type.includes('PERCENT') || (rawVal > 0 && rawVal <= 100)) {
          badgeText = `${rawVal || 10}%`
        } else if (rawVal >= 1000) {
          badgeText = `${Math.round(rawVal / 1000)}K`
        } else if (rawVal > 0) {
          badgeText = `${rawVal}K`
        }

        const minSpend = v.gia_tri_don_toi_thieu ? ` • Đơn từ ${Math.round(v.gia_tri_don_toi_thieu / 1000)}k` : ''
        const expiry = v.ngay_ket_thuc ? `HSD: ${formatDateOnly(v.ngay_ket_thuc)}` : 'HSD: Dùng ngay'

        return (
          <View key={i} style={richStyles.voucherRow}>
            <View style={richStyles.voucherBadge}>
              <Text style={richStyles.voucherBadgeText}>{badgeText}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={richStyles.voucherName} numberOfLines={1}>{name}</Text>
              <Text style={richStyles.voucherCode}>
                Mã: <Text style={{ fontWeight: '800', color: '#ea8025' }}>{code}</Text>{minSpend}
              </Text>
              <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{expiry}</Text>
            </View>
          </View>
        )
      })}
    </View>
  )
}

// ─── AI BUBBLE (Rich content) ─────────────────────────────────────────────────
function AIBubble({ message, onProductAdd, onOrderTrack, onQuickReply }) {
  const { text, type, products, orders, stores, vouchers } = message

  return (
    <View style={styles.aiBubbleWrap}>
      {/* Avatar */}
      <LinearGradient colors={['#ea8025', '#c45c10']} style={styles.aiAvatar}>
        <Ionicons name="sparkles" size={16} color="#fff" />
      </LinearGradient>

      <View style={styles.aiBubbleBody}>
        {/* Text message */}
        {!!text && (
          <View style={styles.aiBubble}>
            <Text style={styles.aiBubbleText}>{text}</Text>
          </View>
        )}

        {/* Product list */}
        {products && products.length > 0 && (
          <View style={richStyles.richBlock}>
            <Text style={richStyles.richBlockTitle}>Sản phẩm phù hợp</Text>
            {products.map((p, i) => (
              <ProductMiniCard key={i} product={p} onAddToCart={onProductAdd} />
            ))}
          </View>
        )}

        {/* Orders */}
        {orders && orders.length > 0 && (
          <View style={richStyles.richBlock}>
            <Text style={richStyles.richBlockTitle}>Đơn hàng gần đây</Text>
            {orders.map((o, i) => (
              <OrderMiniCard key={i} order={o} onTrack={onOrderTrack} />
            ))}
          </View>
        )}

        {/* Stores */}
        {stores && stores.length > 0 && (
          <View style={richStyles.richBlock}>
            <Text style={richStyles.richBlockTitle}>Cửa hàng của chúng tôi</Text>
            {stores.map((s, i) => (
              <StoreMiniCard key={i} branch={s} />
            ))}
          </View>
        )}

        {/* Payment info */}
        {type === 'payment' && <PaymentInfoCard />}

        {/* Vouchers */}
        {type === 'voucher' && <VoucherInfoCard vouchers={vouchers || []} />}

        {/* Quick reply buttons */}
        {message.quickReplies && message.quickReplies.length > 0 && (
          <View style={styles.quickRepliesWrap}>
            {message.quickReplies.map(qr => (
              <Pressable key={qr.id} style={styles.quickReplyChip} onPress={() => onQuickReply(qr.text)}>
                {qr.icon && <Ionicons name={qr.icon} size={14} color="#ea8025" style={{ marginRight: 4 }} />}
                <Text style={styles.quickReplyText}>{qr.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  )
}

// ─── USER BUBBLE ────────────────────────────────────────────────────────────
function UserBubble({ text, time }) {
  return (
    <View style={styles.userBubbleRow}>
      <View style={styles.userBubble}>
        <Text style={styles.userBubbleText}>{text}</Text>
        {!!time && <Text style={styles.userBubbleTime}>{time}</Text>}
      </View>
    </View>
  )
}

// ─── Staff text bubble (legacy, from server) ─────────────────────────────────
function StaffBubble({ message }) {
  return (
    <View style={styles.aiBubbleWrap}>
      <View style={[styles.aiAvatar, { backgroundColor: '#e2e8f0' }]}>
        <Ionicons name="headset-outline" size={16} color="#475569" />
      </View>
      <View style={styles.aiBubbleBody}>
        {message.ten_nguoi_gui && (
          <Text style={styles.staffName}>{message.ten_nguoi_gui}</Text>
        )}
        <View style={styles.aiBubble}>
          <Text style={styles.aiBubbleText}>{message.noi_dung}</Text>
          <Text style={styles.aiBubbleTime}>{formatTime(message.ngay_tao)}</Text>
        </View>
      </View>
    </View>
  )
}

// ─── Date separator ───────────────────────────────────────────────────────────
function DateSeparator({ date }) {
  return (
    <View style={styles.dateSeparator}>
      <View style={styles.dateLine} />
      <Text style={styles.dateText}>{date}</Text>
      <View style={styles.dateLine} />
    </View>
  )
}

// ─── Typing indicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  const dot1 = useRef(new Animated.Value(0)).current
  const dot2 = useRef(new Animated.Value(0)).current
  const dot3 = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const animate = (dot, delay) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(600),
        ])
      ).start()
    animate(dot1, 0)
    animate(dot2, 150)
    animate(dot3, 300)
  }, [])

  return (
    <View style={styles.aiBubbleWrap}>
      <LinearGradient colors={['#ea8025', '#c45c10']} style={styles.aiAvatar}>
        <Ionicons name="sparkles" size={16} color="#fff" />
      </LinearGradient>
      <View style={[styles.aiBubble, { flexDirection: 'row', gap: 4, paddingVertical: 14, paddingHorizontal: 16 }]}>
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={[styles.typingDot, { transform: [{ translateY: dot }] }]}
          />
        ))}
      </View>
    </View>
  )
}

// ─── MIC PULSE ────────────────────────────────────────────────────────────────
function MicPulse() {
  const scale = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.25, duration: 500, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])
    ).start()
  }, [])
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <LinearGradient colors={['#ef4444', '#dc2626']} style={styles.micPulseGrad}>
        <Ionicons name="mic" size={22} color="#fff" />
      </LinearGradient>
    </Animated.View>
  )
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export function ChatScreen({ navigation }) {
  const { user } = useUser()
  const userId = getUserId(user)
  const userName = getUserDisplayName(user)
  const queryClient = useQueryClient()
  const flatListRef = useRef(null)

  const [inputText, setInputText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [localMessages, setLocalMessages] = useState([]) // AI messages (local)
  const [conversationId, setConversationId] = useState(null)
  const fadeAnim = useRef(new Animated.Value(0)).current

  // Voice
  const [isRecording, setIsRecording] = useState(false)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const recordingRef = useRef(null)

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start()
  }, [])

  // ─── Load products for suggestions ───────────────────────────────────────
  const productsQuery = useQuery({
    queryKey: ['customer', 'products-all'],
    queryFn: async () => {
      const res = await apiClient.get('/menu/san-pham')
      return safeArray(res?.data || res?.items || res)
    },
    staleTime: 5 * 60 * 1000,
  })

  const branchesQuery = useQuery({
    queryKey: ['customer', 'branches-all'],
    queryFn: async () => {
      const res = await apiClient.get('/users/branches/public')
      return safeArray(res?.items || res)
    },
    staleTime: 5 * 60 * 1000,
  })

  const ordersQuery = useQuery({
    queryKey: ['customer', 'orders', userId],
    queryFn: async () => {
      const res = await apiClient.get(`/customers/${userId}/orders?limit=5`)
      return safeArray(res?.items || res)
    },
    enabled: Boolean(userId) && !String(userId).startsWith('anon-'),
    staleTime: 30 * 1000,
  })

  const vouchersQuery = useQuery({
    queryKey: ['customer', 'vouchers'],
    queryFn: async () => {
      const res = await apiClient.get('/vouchers?trang_thai=ACTIVE&limit=10')
      return safeArray(res?.items || res)
    },
    staleTime: 2 * 60 * 1000,
  })

  // ─── Open conversation ────────────────────────────────────────────────────
  const openConvMutation = useMutation({
    mutationFn: async () =>
      apiClient.post('/chat/conversations/open', {
        customer_user_id: userId,
        customer_name: userName,
      }),
    onSuccess: (data) => {
      if (data?.conversation?.ma_hoi_thoai) setConversationId(data.conversation.ma_hoi_thoai)
    },
  })

  useEffect(() => {
    if (userId && !conversationId) openConvMutation.mutate()
  }, [userId])

  // ─── Server messages ──────────────────────────────────────────────────────
  const serverMsgQuery = useQuery({
    queryKey: ['chat', 'messages', conversationId],
    queryFn: async () =>
      apiClient.get(
        `/chat/conversations/${conversationId}/messages?user_id=${encodeURIComponent(userId)}&role=CUSTOMER`
      ),
    enabled: Boolean(conversationId),
    refetchInterval: 5000,
    staleTime: 3000,
  })

  const serverMessages = serverMsgQuery.data?.items || []

  // ─── Add AI greeting on first load ───────────────────────────────────────
  useEffect(() => {
    if (localMessages.length === 0) {
      setLocalMessages([
        {
          id: 'greeting',
          role: 'ai',
          text: `Xin chào${userName && userName !== 'Khách' ? ` ${userName}` : ''}! Mình là trợ lý AI của Avengers Coffee.\n\nMình có thể giúp bạn:`,
          quickReplies: QUICK_REPLIES.slice(0, 4),
        },
      ])
    }
  }, [])

  // ─── Send to server ───────────────────────────────────────────────────────
  const sendServerMsg = useMutation({
    mutationFn: async (content) =>
      apiClient.post(`/chat/conversations/${conversationId}/messages`, {
        sender_user_id: userId,
        sender_name: userName,
        sender_role: 'CUSTOMER',
        content,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat', 'messages', conversationId] }),
  })

  // ─── Add to cart ──────────────────────────────────────────────────────────
  const addToCartMutation = useMutation({
    mutationFn: async (product) =>
      apiClient.post('/cart', {
        ma_nguoi_dung: userId,
        ma_san_pham: product.id || product.ma_san_pham,
        ten_san_pham: product.ten_san_pham,
        gia_ban: product.gia_ban,
        hinh_anh_url: product.hinh_anh_url,
        size: 'Nhỏ',
        so_luong: 1,
      }),
    onSuccess: (_, product) => {
      queryClient.invalidateQueries({ queryKey: ['customer', 'cart', userId] })
      appendAIMessage({
        id: Date.now() + 'cart',
        role: 'ai',
        text: `✅ Đã thêm **${product.ten_san_pham}** vào giỏ hàng!\n\nBạn có muốn tiếp tục chọn thêm món hay vào giỏ để thanh toán?`,
        quickReplies: [
          { id: 'more', label: '➕ Thêm món khác', text: 'Tôi muốn xem thêm menu' },
          { id: 'cart', label: '🛒 Vào giỏ hàng', text: 'Tôi muốn thanh toán ngay' },
        ],
      })
    },
    onError: () => {
      appendAIMessage({ id: Date.now() + 'err', role: 'ai', text: '😢 Không thể thêm vào giỏ. Vui lòng thử lại!' })
    },
  })

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function appendAIMessage(msg) {
    setLocalMessages(prev => [...prev, msg])
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 200)
  }

  function appendUserMessage(text) {
    const msg = { id: `user-${Date.now()}`, role: 'user', text, time: formatTime(new Date()) }
    setLocalMessages(prev => [...prev, msg])
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100)
  }

  // ─── Process user message (Direct AI API call + Rich UI Cards) ───────────
  async function processMessage(text) {
    appendUserMessage(text)
    setIsTyping(true)

    try {
      const history = localMessages
        .slice(-6)
        .map((m) => `${m.role === 'user' ? userName : 'AI'}: ${m.text || ''}`)
        .join('\n')

      const textLower = text.toLowerCase()

      // Direct navigation if requested
      if (/giỏ hàng|thanh toán ngay|checkout/.test(textLower)) {
        setTimeout(() => navigation.navigate('Cart'), 800)
      }
      if (/tất cả đơn|xem đơn|lịch sử/.test(textLower)) {
        setTimeout(() => navigation.navigate('Orders'), 800)
      }

      // Order intent check if user is placing an order
      if (/(đặt|mua|order|cho tôi|lấy)\s*(\d+)?/.test(textLower)) {
        try {
          const orderRes = await apiClient.post('/ai/chat/order-intent', { text, user_id: userId, history })
          const d = orderRes?.data || orderRes
          if (d?.can_order && d?.items?.length > 0) {
            appendAIMessage({
              id: Date.now() + 'ai-order',
              role: 'ai',
              text: d.message || `Mình nhận thấy bạn muốn đặt hàng. Tổng tạm tính khoảng ${Number(d.estimated_total || 0).toLocaleString('vi-VN')}đ.`,
              quickReplies: [{ id: 'cart', label: '🛒 Vào giỏ hàng', text: 'Xem giỏ hàng' }],
            })
            return
          }
        } catch { /* proceed to main AI chat */ }
      }

      // Call primary AI Chat API (/ai/chat)
      const chatRes = await apiClient.post('/ai/chat', {
        user_id: userId,
        user_name: userName,
        content: text,
        history,
      })

      const resData = chatRes?.data || chatRes
      let replyText = resData?.reply || resData?.message

      if (replyText) {
        const productsAll = productsQuery.data || []
        const branchesAll = branchesQuery.data || []
        const ordersAll = ordersQuery.data || []
        const vouchersAll = vouchersQuery.data || []

        let stores = resData.stores
        let products = resData.products
        let vouchers = resData.vouchers
        let orders = resData.orders
        let type = resData.type

        // 1. Store cards
        if ((!stores || stores.length === 0) && (/(cửa hàng|chi nhánh|địa chỉ|ở đâu|gần đây)/.test(textLower) || /(cửa hàng|chi nhánh|địa chỉ)/.test(replyText.toLowerCase()))) {
          stores = branchesAll.slice(0, 4)
        }

        // 2. Product cards
        if ((!products || products.length === 0) && (/(thực đơn|menu|đồ uống|cà phê|phê|trà|sữa|đồ ăn|bánh|matcha|latte|có gì ngon|món|xem menu|đặt)/.test(textLower) || /(sản phẩm|đồ uống|menu|món|matcha|latte)/.test(replyText.toLowerCase()))) {
          let prods = productsAll
          const searchKeys = ['matcha', 'latte', 'americano', 'trà sữa', 'bánh', 'cà phê', 'phin', 'espresso', 'cold brew', 'trà']
          const matchedKey = searchKeys.find((k) => textLower.includes(k) || replyText.toLowerCase().includes(k))
          if (matchedKey && prods.length > 0) {
            const filtered = prods.filter((p) =>
              (p.ten_san_pham || '').toLowerCase().includes(matchedKey) ||
              (p.ten_danh_muc || p.danh_muc || '').toLowerCase().includes(matchedKey)
            )
            if (filtered.length > 0) prods = filtered
          }
          products = prods.slice(0, 6)
        }

        // 3. Voucher cards
        if ((!vouchers || vouchers.length === 0) && (/(khuyến mãi|voucher|giảm giá|ưu đãi|mã)/.test(textLower) || /(voucher|khuyến mãi|ưu đãi)/.test(replyText.toLowerCase()))) {
          vouchers = vouchersAll.slice(0, 4)
          type = 'voucher'
        }

        // 4. Order cards
        if ((!orders || orders.length === 0) && (/(đơn hàng|đơn của tôi|trạng thái.*đơn|theo dõi.*đơn|giao chưa)/.test(textLower) || /(đơn hàng)/.test(replyText.toLowerCase()))) {
          orders = ordersAll.slice(0, 3)
        }

        // 5. Payment info
        if (/(thanh toán|payment|vnpay|ví|momo|atm)/.test(textLower)) {
          type = 'payment'
        }

        // Clean up bullet list text lines if cards are present
        const hasCards = Boolean(products?.length || stores?.length || vouchers?.length || orders?.length)
        if (hasCards) {
          const lines = replyText.split('\n')
          const nonBulletLines = lines.filter((l) => {
            const trimmed = l.trim()
            if (/^\s*[-*•\d+.]\s+/.test(l)) return false
            if (/^\*\*.+\*\*:?$/.test(trimmed)) return false
            return true
          })
          const cleaned = nonBulletLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
          if (cleaned) replyText = cleaned
        }

        appendAIMessage({
          id: Date.now() + 'ai',
          role: 'ai',
          text: replyText,
          type,
          products,
          orders,
          stores,
          vouchers,
          quickReplies: QUICK_REPLIES.slice(0, 3),
        })
        return
      }
    } catch (e) {
      console.error('[ChatScreen Mobile] AI API error:', e)
    } finally {
      setIsTyping(false)
    }

    // Fallback response
    appendAIMessage({
      id: Date.now() + 'fallback',
      role: 'ai',
      text: 'Xin lỗi, mình chưa thể xử lý yêu cầu này ngay bây giờ. Vui lòng thử lại câu hỏi nhé!',
      quickReplies: QUICK_REPLIES.slice(0, 4),
    })
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text) return
    setInputText('')
    await processMessage(text)
  }, [inputText, conversationId, userId])

  const handleQuickReply = useCallback((text) => {
    processMessage(text)
  }, [conversationId, userId, productsQuery.data, branchesQuery.data, ordersQuery.data])

  const handleProductAdd = useCallback((product) => {
    if (!userId || String(userId).startsWith('anon-')) {
      Alert.alert('Cần đăng nhập', 'Vui lòng đăng nhập để thêm vào giỏ hàng')
      return
    }
    addToCartMutation.mutate(product)
  }, [userId])

  const handleOrderTrack = useCallback((order) => {
    navigation.navigate('Orders')
  }, [navigation])

  // ─── Voice ────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Cần quyền mic', 'Hãy cấp quyền microphone để dùng tính năng giọng nói.')
        return
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      recordingRef.current = recording
      setIsRecording(true)
    } catch (err) {
      Alert.alert('Lỗi', 'Không thể bật microphone!')
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
      if (!uri) return

      const formData = new FormData()
      formData.append('audio', { uri, name: 'audio.m4a', type: 'audio/m4a' })
      formData.append('user_id', userId || '')
      formData.append('language', 'vi')

      const result = await apiClient.postForm('/ai/voice-order', formData)
      if (result?.transcript) {
        await processMessage(result.transcript)
      }
    } catch {
      Alert.alert('Lỗi', 'Không thể nhận giọng nói. Thử lại!')
    } finally {
      setVoiceLoading(false)
    }
  }

  // ─── Combine local + server messages ─────────────────────────────────────
  const allMessages = useMemo(() => {
    const result = []
    let lastDate = ''

    // Server messages (staff chat)
    const staffMsgs = serverMessages
      .filter(m => m.vai_tro_nguoi_gui === 'STAFF' || m.vai_tro_nguoi_gui === 'MANAGER')
      .map(m => ({ ...m, _source: 'staff' }))

    // Customer server messages
    const customerServerMsgs = serverMessages
      .filter(m => m.vai_tro_nguoi_gui === 'CUSTOMER')
      .map(m => ({ ...m, _source: 'customerServer' }))

    // Merge local + server by date logic (simplified: append local at end)
    const combined = [
      ...localMessages,
      ...staffMsgs,
    ]

    // Add date separators for staff messages
    for (const msg of combined) {
      if (msg._source === 'staff') {
        const d = formatDate(msg.ngay_tao)
        if (d && d !== lastDate) {
          result.push({ type: 'date', date: d, id: `date-${d}` })
          lastDate = d
        }
      }
      result.push(msg)
    }
    return result
  }, [localMessages, serverMessages])

  const isLoading = openConvMutation.isPending

  return (
    <Animated.View style={[styles.screen, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1e293b" />
        </Pressable>
        <View style={styles.headerInfo}>
          <LinearGradient colors={['#ea8025', '#c45c10']} style={styles.headerAvatar}>
            <Ionicons name="sparkles" size={20} color="#fff" />
          </LinearGradient>
          <View style={styles.onlineDot} />
          <View>
            <Text style={styles.headerTitle}>Trợ lý Avengers Coffee</Text>
            <Text style={styles.headerSubtitle}>🟢 Luôn sẵn sàng hỗ trợ bạn</Text>
          </View>
        </View>
        <Pressable style={styles.voiceBadge} onPressIn={startRecording} onPressOut={stopRecordingAndProcess}>
          <Ionicons name={isRecording ? 'stop' : 'mic-outline'} size={16} color={isRecording ? '#ef4444' : colors.primary} />
          <Text style={[styles.voiceBadgeText, isRecording && { color: '#ef4444' }]}>
            {isRecording ? 'Đang nghe...' : 'Voice'}
          </Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Đang kết nối...</Text>
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
            data={allMessages}
            keyExtractor={(item, i) => String(item.id || item.ma_tin_nhan || i)}
            contentContainerStyle={styles.messagesList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={isTyping ? <TypingIndicator /> : null}
            renderItem={({ item }) => {
              if (item.type === 'date') return <DateSeparator date={item.date} />
              if (item._source === 'staff') return <StaffBubble message={item} />
              if (item.role === 'user') return <UserBubble text={item.text} time={item.time} />
              if (item.role === 'ai') return (
                <AIBubble
                  message={item}
                  onProductAdd={handleProductAdd}
                  onOrderTrack={handleOrderTrack}
                  onQuickReply={handleQuickReply}
                />
              )
              return null
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

          {/* Voice processing */}
          {voiceLoading && !isRecording && (
            <View style={styles.voiceProcessing}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.voiceProcessingText}>AI đang phân tích giọng nói...</Text>
            </View>
          )}

          {/* Quick replies row (always-visible shortcuts) */}
          {!isTyping && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickBarContent}
              style={styles.quickBar}
            >
              {QUICK_REPLIES.map(qr => (
                <Pressable key={qr.id} style={styles.quickBarChip} onPress={() => handleQuickReply(qr.text)}>
                  {qr.icon && <Ionicons name={qr.icon} size={13} color="#475569" style={{ marginRight: 4 }} />}
                  <Text style={styles.quickBarChipText}>{qr.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* Input Bar */}
          <View style={styles.inputBar}>
            <View style={styles.inputWrap}>
              <TextInput
                value={inputText}
                onChangeText={setInputText}
                placeholder="Hỏi AI về menu, giá, khuyến mãi..."
                placeholderTextColor="#94a3b8"
                multiline
                maxLength={500}
                style={styles.textInput}
                onSubmitEditing={handleSend}
                blurOnSubmit={false}
              />
            </View>

            {/* Mic button */}
            <Pressable
              onPressIn={startRecording}
              onPressOut={stopRecordingAndProcess}
              disabled={voiceLoading}
              style={styles.iconBtn}
            >
              <LinearGradient
                colors={isRecording ? ['#ef4444', '#dc2626'] : ['#f1f5f9', '#e2e8f0']}
                style={styles.iconBtnGrad}
              >
                {voiceLoading
                  ? <ActivityIndicator color={colors.primary} size="small" />
                  : <Ionicons name={isRecording ? 'stop' : 'mic'} size={18} color={isRecording ? '#fff' : '#475569'} />
                }
              </LinearGradient>
            </Pressable>

            {/* Send button */}
            <Pressable
              onPress={handleSend}
              disabled={!inputText.trim() || sendServerMsg.isPending}
              style={[styles.iconBtn, !inputText.trim() && { opacity: 0.5 }]}
            >
              <LinearGradient
                colors={inputText.trim() ? ['#ea8025', '#c45c10'] : ['#e2e8f0', '#cbd5e1']}
                style={styles.iconBtnGrad}
              >
                <Ionicons name="send" size={16} color={inputText.trim() ? '#fff' : '#94a3b8'} />
              </LinearGradient>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      )}
    </Animated.View>
  )
}

// ─── RICH CONTENT STYLES ──────────────────────────────────────────────────────
const richStyles = StyleSheet.create({
  richBlock: {
    marginTop: 8,
  },
  richBlockTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Product card
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    alignItems: 'center',
    ...shadows.xs,
  },
  productImg: {
    width: 64,
    height: 64,
    backgroundColor: '#fdf5f0',
  },
  productImgPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  productName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: 18,
  },
  productPrice: {
    fontSize: 13,
    fontWeight: '900',
    color: '#ea8025',
    marginTop: 4,
  },
  productAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ea8025',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  // Order card
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    ...shadows.xs,
  },
  orderCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  orderCode: { fontSize: 13, fontWeight: '800', color: '#1e293b' },
  orderDate: { fontSize: 11, color: '#64748b', marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: '800' },
  orderCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderTotal: { fontSize: 15, fontWeight: '900', color: '#ea8025' },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff7ed',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  trackBtnText: { fontSize: 12, fontWeight: '700', color: '#ea8025' },
  // Store card
  storeCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    ...shadows.xs,
  },
  storeCardTop: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  storeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  storeName: { fontSize: 13, fontWeight: '800', color: '#1e293b' },
  storeAddr: { fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 17 },
  storeHours: { fontSize: 11, color: '#64748b', marginTop: 3 },
  storeActions: { flexDirection: 'row', gap: 8 },
  storeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#fff7ed',
    borderRadius: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  storeBtnPrimary: {
    backgroundColor: '#ea8025',
    borderColor: '#ea8025',
    flex: 1.5,
  },
  storeBtnText: { fontSize: 12, fontWeight: '700', color: '#ea8025' },
  // Info card
  infoCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 14,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  infoCardTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b', marginBottom: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoRowLabel: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  infoRowDesc: { fontSize: 11, color: '#64748b', marginTop: 1 },
  // Voucher
  voucherRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  voucherBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#fff7ed',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fdba74',
    flexShrink: 0,
  },
  voucherBadgeText: { fontSize: 12, fontWeight: '900', color: '#ea8025', textAlign: 'center' },
  voucherName: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  voucherCode: { fontSize: 11, color: '#64748b', marginTop: 2 },
})

// ─── MAIN STYLES ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },

  // Header
  header: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, position: 'relative' },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineDot: {
    position: 'absolute',
    left: 28,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    borderWidth: 2,
    borderColor: '#fff',
  },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  headerSubtitle: { fontSize: 11, color: '#64748b', fontWeight: '500', marginTop: 1 },
  voiceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff7ed',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  voiceBadgeText: { fontSize: 11, fontWeight: '800', color: colors.primary },

  // Loading
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#64748b', fontWeight: '600' },

  // Messages list
  messagesList: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingBottom: 8,
  },

  // AI bubble
  aiBubbleWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 14,
    maxWidth: '90%',
  },
  aiAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  aiBubbleBody: { flex: 1 },
  aiBubble: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...shadows.xs,
  },
  aiBubbleText: { fontSize: 14, color: '#1e293b', lineHeight: 21 },
  aiBubbleTime: { fontSize: 10, color: '#94a3b8', marginTop: 4, alignSelf: 'flex-end' },
  staffName: { fontSize: 10, fontWeight: '800', color: '#475569', marginBottom: 4, marginLeft: 2, textTransform: 'uppercase' },

  // User bubble
  userBubbleRow: { alignSelf: 'flex-end', marginBottom: 14, maxWidth: '80%' },
  userBubble: {
    backgroundColor: '#ea8025',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubbleText: { fontSize: 14, color: '#fff', lineHeight: 21 },
  userBubbleTime: { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 4, alignSelf: 'flex-end' },

  // Quick replies in bubble
  quickRepliesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  quickReplyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  quickReplyText: { fontSize: 12, fontWeight: '700', color: '#ea8025' },

  // Date separator
  dateSeparator: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
  dateLine: { flex: 1, height: 1, backgroundColor: '#e2e8f0' },
  dateText: { fontSize: 11, color: '#94a3b8', fontWeight: '700' },

  // Typing dots
  typingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#94a3b8' },

  // Recording overlay
  recordingOverlay: {
    position: 'absolute',
    bottom: 120,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 8,
  },
  micPulseGrad: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  recordingText: { fontSize: 15, fontWeight: '800', color: '#ef4444' },
  recordingHint: { fontSize: 12, color: '#64748b' },

  // Voice processing
  voiceProcessing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 4,
    ...shadows.sm,
  },
  voiceProcessingText: { fontSize: 13, color: colors.primary, fontWeight: '700' },

  // Quick bar
  quickBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    height: 46,
    flexGrow: 0,
    flexShrink: 0,
  },
  quickBarContent: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 8,
    alignItems: 'center',
  },
  quickBarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickBarChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 8,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    maxHeight: 100,
  },
  textInput: { fontSize: 14, color: '#1e293b', lineHeight: 20 },
  iconBtn: { borderRadius: 21, overflow: 'hidden' },
  iconBtnGrad: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
