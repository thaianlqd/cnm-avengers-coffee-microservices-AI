import TextInput from '../components/TextInput'
import Alert from '../lib/alert'
/**
 * Customer chat using the web Agent contract
 * Features:
 * - Rich message rendering: product cards, order cards, store cards, image, quick replies
 * - AI-powered ordering flow (search → customize → cart → payment)
 * - Order tracking in chat
 * - Store info with directions link
 * - Voice ordering
 */
import React, { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,

  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,

  Image,
  ScrollView,
  Linking,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import { useQuery } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import { formatDateOnly, getUserDisplayName, safeArray } from '../lib/customerData'
import StaffChatPanel from './StaffChatPanel'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, shadows } from '../theme'
import useAgentChat from '../hooks/useAgentChat'
import ChatRichText from '../components/ChatRichText'
import ChatActions, { CheckoutCard } from '../components/ChatActions'
import CustomerChoicePanel, { SelectionTray } from '../components/CustomerChoicePanel'
import { productIdentity, toggleProductSelection, updateProductQuantity, selectionAction, actionMessage } from '../../../web-customer/src/components/customerChoices'
import { branchDistanceLabel } from '../../../web-customer/src/components/chatWidgetActions'

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
    CHO_XAC_NHAN: { label: 'Vừa tạo', color: '#f59e0b', bg: '#f3f4f6', icon: 'time-outline' },
    DA_XAC_NHAN: { label: 'Đã xác nhận', color: '#3b82f6', bg: '#eff6ff', icon: 'checkmark-circle-outline' },
    DANG_CHUAN_BI: { label: 'Đang chuẩn bị', color: '#8b5cf6', bg: '#f5f3ff', icon: 'cafe-outline' },
    DANG_GIAO: { label: 'Đang giao', color: '#b22830', bg: '#f3f4f6', icon: 'bicycle-outline' },
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

// ─── RICH MESSAGE TYPES ─────────────────────────────────────────────────────

// Product Card dạng mini (trong chat)
function ProductMiniCard({ product, index, grouped, chat, selected, onAddToCart, onDetail }) {
  const name = product.ten_san_pham || product.product_name || product.name
  const seed = product.gia_ban ?? product.final_price ?? product.price
  const seedPrice = seed != null && Number.isFinite(Number(seed)) && Number(seed) > 0 ? Number(seed) : null
  const id = product.product_id || product.ma_san_pham || product.id
  const priceQuery = useQuery({
    queryKey: ['customer', 'agent-product-price', chat.conversationId, id],
    queryFn: () => chat.controller.price(name), enabled: seedPrice == null && Boolean(name), retry: false,
  })
  const price = seedPrice ?? (priceQuery.data?.status === 'ok' ? priceQuery.data.products?.find(p => p.product_name === name)?.final_price : null)
  return (
    <Pressable
      style={richStyles.productCard}
      onPress={() => onDetail(id)}
    >
      {product.hinh_anh_url ? (
        <Image source={{ uri: product.hinh_anh_url }} style={richStyles.productImg} resizeMode="cover" />
      ) : (
        <View style={[richStyles.productImg, richStyles.productImgPlaceholder]}>
          <Ionicons name="cafe-outline" size={22} color="#94a3b8" />
        </View>
      )}
      <View style={richStyles.productInfo}>
        <Text style={richStyles.productName} numberOfLines={2}>{product.display_index || index + 1}. {name}</Text>
        <Text style={richStyles.productPrice}>{Number.isFinite(Number(price)) && price != null ? formatCurrency(price) : 'Chưa xác minh được giá'}</Text>
        <Text style={{ fontSize: 11, color: '#64748b', marginTop: 3 }}>{product.danh_muc || product.ten_danh_muc || product.category}{grouped && product.group_display_index ? ` · ${product.menu_bucket === 'food' ? 'Bánh' : 'Nước'} số ${product.group_display_index}` : ''}</Text>
        <Text style={{ fontSize: 11, color: colors.primary, marginTop: 5 }}>Xem chi tiết →</Text>
      </View>
      <Pressable disabled={chat.busy || price == null} accessibilityRole="button" accessibilityLabel={`${selected ? 'Bỏ chọn' : 'Chọn'} ${name}`} accessibilityState={{ selected }} style={[richStyles.productAddBtn, (chat.busy || price == null) && { opacity: 0.4 }]} onPress={event => { event.stopPropagation(); onAddToCart(product) }}>
        <Ionicons name={selected ? 'checkmark' : 'add'} size={18} color="#fff" />
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
function StoreMiniCard({ branch, index, onChoose }) {
  const name = branch.ten_chi_nhanh || branch.branch_name || branch.name
  const address = branch.dia_chi || branch.address
  const phone = branch.so_dien_thoai || branch.phone
  const available = !branch.availability_status || branch.availability_status === 'available'
  const mapUrl = /^https?:\/\//i.test(branch.map_url || '') ? branch.map_url : null
  const openMaps = () => {
    if (mapUrl) Linking.openURL(mapUrl).catch(() => {})
  }
  const call = () => {
    if (phone) Linking.openURL(`tel:${phone}`).catch(() => {})
  }
  return (
    <View style={richStyles.storeCard}>
      <View style={richStyles.storeCardTop}>
        <View style={richStyles.storeIcon}>
          <Ionicons name="storefront-outline" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={richStyles.storeName} numberOfLines={2}>{index + 1}. {name}</Text>
          <Text style={richStyles.storeAddr} numberOfLines={2}>{address}</Text>
          {branch.gio_mo_cua && (
            <Text style={richStyles.storeHours}>🕐 {branch.gio_mo_cua} – {branch.gio_dong_cua}</Text>
          )}
        </View>
      </View>
      <Text style={{ fontSize: 11, color: colors.muted }}>{branchDistanceLabel(branch)}</Text>
      {branch.availability_status && <Text style={{ fontSize: 12, color: available ? '#15803d' : colors.primary }}>{available ? 'Còn đủ tất cả món trong giỏ' : branch.availability_status === 'unknown' ? 'Chưa đọc được tình trạng bán; chưa thể chọn' : `Tạm ngưng: ${(branch.unavailable_products || []).join(', ') || 'một số món trong giỏ'}`}</Text>}
      <Pressable disabled={!available} onPress={() => onChoose(`Tôi chọn chi nhánh ${name}`)} style={{ paddingVertical: 9, opacity: available ? 1 : 0.5 }}><Text style={{ color: colors.primary }}>Chọn cửa hàng này</Text></Pressable>
      <View style={richStyles.storeActions}>
        {phone && (
          <Pressable style={richStyles.storeBtn} onPress={call}>
            <Ionicons name="call-outline" size={13} color={colors.primary} />
            <Text style={richStyles.storeBtnText}>Gọi ngay</Text>
          </Pressable>
        )}
        {mapUrl && (
          <Pressable style={[richStyles.storeBtn, richStyles.storeBtnPrimary]} onPress={openMaps}>
            <Ionicons name="navigate-outline" size={13} color="#fff" />
            <Text style={[richStyles.storeBtnText, { color: '#fff' }]}>Chỉ đường</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

// Voucher info card
function VoucherInfoCard({ vouchers = [], onChoose }) {
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
        const expiry = v.ngay_ket_thuc ? `HSD: ${formatDateOnly(v.ngay_ket_thuc)}` : 'HSD: chưa có thông tin'

        return (
          <Pressable key={i} onPress={() => onChoose(`Áp dụng mã ${code}`)} style={richStyles.voucherRow}>
            <View style={richStyles.voucherBadge}>
              <Text style={richStyles.voucherBadgeText}>{badgeText}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={richStyles.voucherName} numberOfLines={1}>{name}</Text>
              <Text style={richStyles.voucherCode}>
                Mã: <Text style={{ fontWeight: '800', color: '#b22830' }}>{code}</Text>{minSpend}
              </Text>
              <Text style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{expiry}</Text>
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

// ─── AI BUBBLE (Rich content) ─────────────────────────────────────────────────
function AIBubble({ message, chat, selectedProducts, onProductAdd, onProductDetail, onOrderTrack, onQuickReply, onLogin }) {
  const { text, products, orders, stores, vouchers } = message
  const groups = new Map()
  ;(products || []).forEach(product => { const bucket = product.menu_bucket || 'unknown'; if (!groups.has(bucket)) groups.set(bucket, []); groups.get(bucket).push(product) })
  const grouped = groups.size > 1
  const groupLabels = { food: 'Bánh & đồ ăn', drink: 'Đồ uống', topping: 'Topping', unknown: 'Các món khác' }

  return (
    <View style={styles.aiBubbleWrap}>
      {/* Avatar */}
      <LinearGradient colors={[colors.primary, colors.primary]} style={styles.aiAvatar}>
        <Ionicons name="sparkles" size={16} color="#fff" />
      </LinearGradient>

      <View style={styles.aiBubbleBody}>
        {/* Text message */}
        {!!text && (
          <View style={styles.aiBubble}>
            <ChatRichText text={text} style={styles.aiBubbleText} />
            {!!message.time && <Text style={styles.aiBubbleTime}>{formatTime(message.time)}</Text>}
          </View>
        )}

        {/* Product list */}
        {products && products.length > 0 && (
          <View style={richStyles.richBlock}>
            <Text style={richStyles.richBlockTitle}>Sản phẩm phù hợp</Text>
            {[...groups].map(([bucket, rows]) => <View key={bucket}>{grouped && <Text style={richStyles.richBlockTitle}>{groupLabels[bucket] || groupLabels.unknown}</Text>}{rows.map((p, i) => <ProductMiniCard key={p.product_id || i} index={i} grouped={grouped} chat={chat} selected={selectedProducts.some(row => productIdentity(row) === productIdentity(p) && row.snapshot === message.selectionSnapshot)} product={p} onAddToCart={product => onProductAdd(product, message.selectionSnapshot)} onDetail={onProductDetail} />)}</View>)}
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
              <StoreMiniCard key={i} index={i} branch={s} onChoose={onQuickReply} />
            ))}
          </View>
        )}

        {/* Payment info */}
        <ChatActions message={message} chat={chat} onReply={onQuickReply} onLogin={onLogin} />

        {/* Vouchers */}
        {!!vouchers?.length && <VoucherInfoCard vouchers={vouchers} onChoose={onQuickReply} />}

        {/* Quick reply buttons */}
        {message.quickReplies && message.quickReplies.length > 0 && (
          <View style={styles.quickRepliesWrap}>
            {message.quickReplies.map(qr => (
              <Pressable key={qr.id} style={styles.quickReplyChip} onPress={() => onQuickReply(qr.text)}>
                {qr.icon && <Ionicons name={qr.icon} size={14} color="#b22830" style={{ marginRight: 4 }} />}
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
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
          Animated.delay(600),
        ])
      ).start()
    animate(dot1, 0)
    animate(dot2, 150)
    animate(dot3, 300)
  }, [dot1, dot2, dot3])

  return (
    <View style={styles.aiBubbleWrap}>
      <LinearGradient colors={[colors.primary, colors.primary]} style={styles.aiAvatar}>
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
        Animated.timing(scale, { toValue: 1.25, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(scale, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start()
  }, [scale])
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <LinearGradient colors={['#ef4444', '#dc2626']} style={styles.micPulseGrad}>
        <Ionicons name="mic" size={22} color="#fff" />
      </LinearGradient>
    </Animated.View>
  )
}

// ─── MAIN SCREEN ──────────────────────────────────────────────────────────────
export function ChatScreen({ navigation, route }) {
  const { activeUserId } = useUser()
  return <ChatWorkspace key={activeUserId} navigation={navigation} route={route} />
}
function ChatWorkspace({ navigation, route }) {
  const { activeUserId, user } = useUser()
  const chat = useAgentChat(activeUserId, getUserDisplayName(user), navigation)
  const [selectedProducts, setSelectedProducts] = useState([])
  const [mode, setMode] = useState(route?.params?.mode === 'staff' ? 'staff' : 'ai')
  const insets = useSafeAreaInsets()
  useEffect(() => { if (route?.params?.mode) setMode(route.params.mode === 'staff' ? 'staff' : 'ai') }, [route?.params?.mode])
  return <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top }}><View style={{ flexDirection: 'row', padding: 10, gap: 8, borderBottomWidth: 1, borderColor: '#eee' }}>{[['ai','Trợ lý AI','sparkles-outline'],['staff','Nhân viên','headset-outline']].map(([id,label,icon])=><Pressable key={id} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: mode === id }} onPress={()=>setMode(id)} style={{ flex: 1, padding: 11, backgroundColor: mode === id ? colors.primary : '#f5f5f5', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Ionicons name={icon} size={17} color={mode===id?'#fff':'#555'}/><Text style={{ fontSize: 13, fontWeight: '500', color: mode===id?'#fff':'#555' }}>{label}</Text></Pressable>)}</View>{mode==='staff'?<StaffChatPanel navigation={navigation}/>:<AIChatPanel navigation={navigation} chat={chat} selectedProducts={selectedProducts} setSelectedProducts={setSelectedProducts}/>}</View>
}
function AIChatPanel({ navigation, chat, selectedProducts, setSelectedProducts }) {
  const localMessages = chat.messages, isTyping = chat.busy
  const { activeUserId } = useUser()
  const userId = activeUserId
  const flatListRef = useRef(null)

  const [inputText, setInputText] = useState('')
  const fadeAnim = useRef(new Animated.Value(0)).current

  // Voice
  const [isRecording, setIsRecording] = useState(false)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const recordingRef = useRef(null)
  const speechRef = useRef(null)
  const recordingRequested = useRef(false)

  useEffect(() => {
    // Wait for the rich cards/text to finish layout before scrolling the last answer into view.
    const timer = globalThis.setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 250)
    return () => globalThis.clearTimeout(timer)
  }, [localMessages.length, isTyping])
  useEffect(() => () => {
    recordingRequested.current = false
    speechRef.current?.abort()
    recordingRef.current?.stopAndUnloadAsync().catch(() => {})
  }, [])

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: Platform.OS !== 'web' }).start()
  }, [fadeAnim])

  // ─── Load catalog only for images of server-selected cards ───────────────────────────────────────
  const productsQuery = useQuery({
    queryKey: ['customer', 'products-all'],
    queryFn: async () => {
      const res = await apiClient.get('/menu/san-pham')
      return safeArray(res?.data || res?.items || res)
    },
    staleTime: 5 * 60 * 1000,
  })

  const processMessage = (text, productId, action) => chat.ready && chat.controller.send(text, productId, productsQuery.data || [], action)
  const handleSend = async () => {
    const text = inputText.trim()
    if (!text || isTyping || !chat.ready) return
    setInputText('')
    await processMessage(text)
  }
  const handleQuickReply = text => processMessage(text)
  const handleProductAdd = (product, snapshot) => {
    const id = productIdentity(product), name = product.ten_san_pham || product.product_name || product.name
    if (snapshot) setSelectedProducts(prev => toggleProductSelection(prev, product, snapshot))
    else if (id && name) processMessage(`Thêm ${name} vào giỏ`, id)
  }
  const submitSelection = async () => {
    try {
      const action = selectionAction(selectedProducts)
      await processMessage(actionMessage(action, selectedProducts), null, action)
      if (!chat.controller.snapshot().lastError) setSelectedProducts([])
    } catch (error) { Alert.alert('Chọn món', error.message) }
  }
  const handleOrderTrack = () => navigation.navigate('Orders')
  const handleProductDetail = productId => navigation.navigate('ProductDetail', { productId })

  // ─── Voice ────────────────────────────────────────────────────────────────
  const startRecording = async () => {
    if (isTyping || voiceLoading || recordingRequested.current) return
    recordingRequested.current = true
    if (Platform.OS === 'web') {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!Recognition) { recordingRequested.current = false; Alert.alert('Giọng nói', 'Trình duyệt chưa hỗ trợ nhận diện giọng nói. Vui lòng dùng Google Chrome.'); return }
      const recognition = new Recognition()
      recognition.lang = 'vi-VN'; recognition.interimResults = false; recognition.maxAlternatives = 1
      recognition.onresult = event => { const text = event.results?.[0]?.[0]?.transcript; if (text) processMessage(text) }
      recognition.onerror = () => { Alert.alert('Giọng nói', 'Chưa nhận được giọng nói. Bạn hãy thử lại.') }
      recognition.onend = () => { speechRef.current = null; recordingRequested.current = false; setIsRecording(false); setVoiceLoading(false) }
      speechRef.current = recognition
      try { recognition.start(); setIsRecording(true) }
      catch { speechRef.current = null; recordingRequested.current = false; setIsRecording(false) }
      return
    }
    try {
      const { status } = await Audio.requestPermissionsAsync()
      if (status !== 'granted') {
        recordingRequested.current = false
        Alert.alert('Cần quyền mic', 'Hãy cấp quyền microphone để dùng tính năng giọng nói.')
        return
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
      if (!recordingRequested.current) { await recording.stopAndUnloadAsync(); return }
      recordingRef.current = recording
      setIsRecording(true)
    } catch {
      recordingRequested.current = false
      Alert.alert('Lỗi', 'Không thể bật microphone!')
    }
  }

  const stopRecordingAndProcess = async () => {
    recordingRequested.current = false
    if (speechRef.current) { speechRef.current.stop(); setIsRecording(false); return }
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
      formData.append('transcription_only', 'true')

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
  const allMessages = localMessages
  const isLoading = !chat.ready

  return (
    <Animated.View style={[styles.screen, { opacity: fadeAnim }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#1e293b" />
        </Pressable>
        <View style={styles.headerInfo}>
          <LinearGradient colors={[colors.primary, colors.primary]} style={styles.headerAvatar}>
            <Ionicons name="sparkles" size={20} color="#fff" />
          </LinearGradient>
          <View style={styles.onlineDot} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={styles.headerTitle}>Trợ lý Avengers Coffee</Text>
            <Text numberOfLines={1} style={styles.headerSubtitle}>Gợi ý món & giải đáp với AI</Text>
          </View>
        </View>
        <Pressable accessibilityLabel="Hội thoại mới" disabled={isTyping} onPress={() => chat.controller.reset(chat.greeting)} style={styles.backBtn}><Ionicons name="refresh-outline" size={18} color={colors.primary} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ghi âm tin nhắn" style={styles.backBtn} onPressIn={startRecording} onPressOut={stopRecordingAndProcess}>
          <Ionicons name={isRecording ? 'stop' : 'mic-outline'} size={18} color={isRecording ? '#ef4444' : colors.primary} />
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
            ListFooterComponent={<View>{isTyping && <TypingIndicator />}{chat.productConfiguration?.items?.length > 0 && <CustomerChoicePanel key={chat.productConfiguration.snapshot} configuration={chat.productConfiguration} busy={isTyping} onSubmit={action => processMessage(actionMessage(action, chat.productConfiguration.items), null, action)} />}<CheckoutCard pending={chat.pendingOrder} busy={isTyping} onConfirm={() => chat.controller.confirm()} /></View>}
            renderItem={({ item }) => {
              if (item.type === 'date') return <DateSeparator date={item.date} />
              if (item._source === 'staff') return <StaffBubble message={item} />
              if (item.role === 'user') return <UserBubble text={item.text} time={formatTime(item.time)} />
              if (item.role === 'ai') return (
                <AIBubble
                  message={item}
                  chat={chat}
                  selectedProducts={selectedProducts}
                  onProductDetail={handleProductDetail}
                  onLogin={() => navigation.navigate('Login')}
                  onProductAdd={handleProductAdd}
                  onOrderTrack={handleOrderTrack}
                  onQuickReply={handleQuickReply}
                />
              )
              return null
            }}
          />

          <SelectionTray onQuantityChange={(product, quantity) => setSelectedProducts(prev => updateProductQuantity(prev, product, quantity))} selected={selectedProducts} busy={isTyping} onRemove={product => setSelectedProducts(prev => prev.filter(row => productIdentity(row) !== productIdentity(product)))} onSubmit={submitSelection} />

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
                maxLength={2000}
                style={styles.textInput}
                onSubmitEditing={handleSend}
                onKeyPress={event => { if (Platform.OS === 'web' && event.nativeEvent.key === 'Enter' && !event.nativeEvent.shiftKey) { event.preventDefault(); handleSend() } }}
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
              accessibilityRole="button"
              accessibilityLabel="Gửi tin nhắn"
              onPress={handleSend}
              disabled={!inputText.trim() || isTyping}
              style={[styles.iconBtn, !inputText.trim() && { opacity: 0.5 }]}
            >
              <LinearGradient
                colors={inputText.trim() ? [colors.primary, colors.primary] : ['#e2e8f0', '#cbd5e1']}
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
    color: '#b22830',
    marginTop: 4,
  },
  productAddBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#b22830',
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
  orderTotal: { fontSize: 15, fontWeight: '900', color: '#b22830' },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  trackBtnText: { fontSize: 12, fontWeight: '700', color: '#b22830' },
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
    backgroundColor: '#f3f4f6',
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
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  storeBtnPrimary: {
    backgroundColor: '#b22830',
    borderColor: '#b22830',
    flex: 1.5,
  },
  storeBtnText: { fontSize: 12, fontWeight: '700', color: '#b22830' },
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
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fdba74',
    flexShrink: 0,
  },
  voucherBadgeText: { fontSize: 12, fontWeight: '900', color: '#b22830', textAlign: 'center' },
  voucherName: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  voucherCode: { fontSize: 11, color: '#64748b', marginTop: 2 },
})

// ─── MAIN STYLES ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },

  // Header
  header: {
    paddingTop: 12,
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
    backgroundColor: '#f3f4f6',
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
    backgroundColor: '#b22830',
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
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  quickReplyText: { fontSize: 12, fontWeight: '700', color: '#b22830' },

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
