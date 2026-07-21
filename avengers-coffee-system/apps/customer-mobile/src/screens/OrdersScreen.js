import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Image,
  Linking,
  Animated,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import {
  canCancelOrder,
  formatCurrency,
  formatDateTime,
  getUserId,
  normalizeOrder,
  orderStatusLabels,
  paymentStatusLabels,
  safeArray,
} from '../lib/customerData'
import { colors, spacing, shadows, radius } from '../theme'

/* ────────────────────────────────────────────────────────────
   LIVE TRACKING MODAL
──────────────────────────────────────────────────────────── */
const DELIVERY_STEP_LABELS = [
  { key: 'MOI_TAO',       icon: 'receipt',           label: 'Đặt hàng thành công' },
  { key: 'DA_XAC_NHAN',   icon: 'checkmark-circle',  label: 'Đã xác nhận' },
  { key: 'DANG_CHUAN_BI', icon: 'cafe',               label: 'Đang chuẩn bị' },
  { key: 'DANG_GIAO',     icon: 'bicycle',            label: 'Shipper đang giao' },
  { key: 'HOAN_THANH',    icon: 'home',               label: 'Giao thành công' },
]

function LiveTrackingModal({ order, visible, onClose, onOpenRating }) {
  const [delivery, setDelivery] = useState(null)
  const [loading, setLoading] = useState(false)
  const pulseAnim = useRef(new Animated.Value(1)).current
  const refreshRef = useRef(null)

  const loadDelivery = useCallback(async () => {
    if (!order?.ma_don_hang) return
    try {
      const res = await apiClient.get(`/shippers/delivery/tracking/${order.ma_don_hang}?t=${Date.now()}`)
      setDelivery(res.data || res)
    } catch {
      setDelivery(null)
    }
  }, [order?.ma_don_hang])

  useEffect(() => {
    if (!visible) return
    setLoading(true)
    loadDelivery().finally(() => setLoading(false))
    refreshRef.current = setInterval(loadDelivery, 15000)
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current)
    }
  }, [visible, loadDelivery])

  useEffect(() => {
    if (!visible || order?.trang_thai_don_hang !== 'DANG_GIAO') return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.3, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [visible, order?.trang_thai_don_hang, pulseAnim])

  const openGoogleMaps = () => {
    const lat = delivery?.shipper_location?.latitude || delivery?.shipper_latitude
    const lng = delivery?.shipper_location?.longitude || delivery?.shipper_longitude
    if (!lat || !lng) return
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    Linking.openURL(url)
  }

  const callShipper = () => {
    const phone = delivery?.shipper?.so_dien_thoai || delivery?.shipper?.phone || delivery?.shipper_phone
    if (!phone) return
    Linking.openURL(`tel:${phone}`)
  }

  const currentStepIndex = DELIVERY_STEP_LABELS.findIndex(
    s => s.key === order?.trang_thai_don_hang
  )

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={liveStyles.container}>
        <View style={liveStyles.header}>
          <TouchableOpacity onPress={onClose} style={liveStyles.closeBtn}>
            <Ionicons name="arrow-back" size={24} color="#1e293b" />
          </TouchableOpacity>
          <View>
            <Text style={liveStyles.headerTitle}>Theo dõi đơn hàng</Text>
            {order?.ma_don_hang && <Text style={liveStyles.headerSubtitle}>#{order.ma_don_hang}</Text>}
          </View>
        </View>

        <ScrollView contentContainerStyle={liveStyles.body} showsVerticalScrollIndicator={false}>
          {/* Status Banner */}
          <LinearGradient colors={['#ea8025', '#d4560e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={liveStyles.statusBanner}>
            <View style={{ flex: 1 }}>
              <Text style={liveStyles.statusBannerLabel}>Trạng thái hiện tại</Text>
              <Text style={liveStyles.statusBannerTitle}>{DELIVERY_STEP_LABELS[currentStepIndex > -1 ? currentStepIndex : 0]?.label || order?.trang_thai_don_hang}</Text>
              
              {delivery?.tracking?.delivery_method && (
                <View style={liveStyles.deliveryMethodBadge}>
                  <Text style={liveStyles.deliveryMethodText}>
                    {delivery.tracking.delivery_method === 'LALAMOVE' ? '🚀 Giao hỏa tốc Lalamove' : '🛵 Avengers Delivery'}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize: 48 }}>{DELIVERY_STEP_LABELS[currentStepIndex > -1 ? currentStepIndex : 0]?.icon === 'bicycle' ? '🛵' : '📦'}</Text>
          </LinearGradient>

          {/* Progress Steps */}
          <View style={liveStyles.stepsSection}>
            <Text style={liveStyles.stepsTitle}>Hành trình đơn hàng</Text>
            {DELIVERY_STEP_LABELS.map((step, i) => {
              const isDone = i < currentStepIndex
              const isCurrent = i === currentStepIndex
              const isFuture = i > currentStepIndex
              return (
                <View key={step.key} style={liveStyles.step}>
                  <View style={liveStyles.stepLeft}>
                    <View style={[
                      liveStyles.stepDot,
                      isDone && liveStyles.stepDotDone,
                      isCurrent && liveStyles.stepDotCurrent,
                    ]}>
                      <Ionicons
                        name={isDone ? 'checkmark' : step.icon}
                        size={16}
                        color={isDone ? '#fff' : isCurrent ? '#ea8025' : '#cbd5e1'}
                      />
                    </View>
                    {i < DELIVERY_STEP_LABELS.length - 1 && (
                      <View style={[liveStyles.stepLine, isDone && liveStyles.stepLineDone]} />
                    )}
                  </View>
                  <View style={liveStyles.stepRight}>
                    <Text style={[
                      liveStyles.stepLabel,
                      isFuture && { color: '#94a3b8' },
                      isCurrent && { color: '#1e293b', fontWeight: '900' },
                      isDone && { color: '#ea8025' },
                    ]}>
                      {step.label}
                    </Text>
                    {isCurrent && (
                      <Text style={liveStyles.stepCurrent}>● Đang thực hiện</Text>
                    )}
                  </View>
                </View>
              )
            })}
          </View>

          {/* Shipper Info */}
          {(delivery?.shipper?.ho_ten || delivery?.shipper?.name || delivery?.shipper_name) ? (
            <View style={liveStyles.shipperCard}>
              <View style={liveStyles.shipperIconWrap}>
                <Ionicons name="person" size={24} color="#ea8025" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={liveStyles.shipperName}>
                  {delivery?.shipper?.ho_ten || delivery?.shipper?.name || delivery?.shipper_name}
                </Text>
                <Text style={liveStyles.shipperPhone}>Shipper giao hàng</Text>
              </View>
              {(delivery?.shipper?.so_dien_thoai || delivery?.shipper?.phone || delivery?.shipper_phone) && (
                <TouchableOpacity onPress={callShipper} style={liveStyles.callBtn}>
                  <Ionicons name="call" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {/* Order Info */}
          {order && (
            <View style={liveStyles.orderInfo}>
              <Text style={liveStyles.orderInfoTitle}>Thông tin đơn</Text>
              <View style={liveStyles.orderInfoRow}>
                <Text style={liveStyles.orderInfoLabel}>Mã đơn</Text>
                <Text style={liveStyles.orderInfoValue}>{order.ma_don_hang?.slice(0, 12)}</Text>
              </View>
              <View style={liveStyles.orderInfoRow}>
                <Text style={liveStyles.orderInfoLabel}>Địa chỉ giao</Text>
                <Text style={liveStyles.orderInfoValue} numberOfLines={2}>{order.dia_chi_giao_hang || 'N/A'}</Text>
              </View>
              <View style={liveStyles.orderInfoRow}>
                <Text style={liveStyles.orderInfoLabel}>Tổng tiền</Text>
                <Text style={[liveStyles.orderInfoValue, { color: colors.primary }]}>{formatCurrency(order.tong_tien)}</Text>
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={liveStyles.actions}>
            {(delivery?.shipper_location?.latitude || delivery?.shipper_latitude) && (
              <TouchableOpacity style={[liveStyles.actionBtn, { backgroundColor: '#10B981' }]} onPress={openGoogleMaps}>
                <Ionicons name="map" size={20} color="#fff" />
                <Text style={liveStyles.actionBtnText}>Xem bản đồ</Text>
              </TouchableOpacity>
            )}
            {order?.trang_thai_don_hang === 'HOAN_THANH' && (
              <TouchableOpacity
                style={[liveStyles.actionBtn, { backgroundColor: '#F59E0B' }]}
                onPress={() => { onClose(); onOpenRating?.(order) }}
              >
                <Ionicons name="star" size={20} color="#fff" />
                <Text style={liveStyles.actionBtnText}>Đánh giá Shipper</Text>
              </TouchableOpacity>
            )}
          </View>

          {loading && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.lg }} />}
        </ScrollView>
      </View>
    </Modal>
  )
}

const liveStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', maxWidth: 480, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingTop: 52, paddingBottom: 12, paddingHorizontal: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  closeBtn: { padding: 4, marginLeft: -4 },
  headerTitle: { color: '#1e293b', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: '#64748b', fontSize: 12, fontWeight: '600', marginTop: 2 },
  body: { padding: 16, paddingBottom: 60, gap: 16 },
  
  statusBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderRadius: 20,
    shadowColor: '#ea8025', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  statusBannerLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' },
  statusBannerTitle: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 4, marginBottom: 8 },
  deliveryMethodBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  deliveryMethodText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  
  stepsSection: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  stepsTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b', marginBottom: 20 },
  step: { flexDirection: 'row', marginBottom: 0 },
  stepLeft: { alignItems: 'center', width: 40 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  stepDotDone: { backgroundColor: '#ea8025' },
  stepDotCurrent: { backgroundColor: '#fff', borderWidth: 2, borderColor: '#ea8025' },
  stepLine: { width: 2, flex: 1, backgroundColor: '#f1f5f9', minHeight: 28, marginVertical: 4 },
  stepLineDone: { backgroundColor: '#ea8025' },
  stepRight: { flex: 1, paddingLeft: 12, paddingBottom: 24, justifyContent: 'flex-start', paddingTop: 6 },
  stepLabel: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
  stepCurrent: { fontSize: 12, color: '#ea8025', marginTop: 4, fontWeight: '700' },

  shipperCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, padding: 16, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  shipperIconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#fdba74' },
  shipperName: { fontSize: 16, fontWeight: '900', color: '#1e293b' },
  shipperPhone: { fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: '500' },
  callBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center', shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  
  orderInfo: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  orderInfoTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b', marginBottom: 4 },
  orderInfoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 12 },
  orderInfoLabel: { fontSize: 14, color: '#64748b', fontWeight: '500' },
  orderInfoValue: { fontSize: 14, fontWeight: '800', color: '#1e293b', flex: 1, textAlign: 'right', marginLeft: 16 },
  
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 16, gap: 8 },
  actionBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
})

/* ────────────────────────────────────────────────────────────
   SHIPPER RATING MODAL
──────────────────────────────────────────────────────────── */
function ShipperRatingModal({ order, visible, onClose, userId }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (visible) { setRating(5); setComment(''); setSubmitted(false) }
  }, [visible])

  const handleSubmit = async () => {
    if (!order?.ma_don_hang) return
    setSubmitting(true)
    try {
      await apiClient.post(`/customers/${userId}/orders/${order.ma_don_hang}/rate-shipper`, {
        rating,
        comment,
      })
      setSubmitted(true)
      setTimeout(onClose, 2000)
    } catch (e) {
      Alert.alert('Lỗi', e?.message || 'Không thể gửi đánh giá lúc này')
    } finally {
      setSubmitting(false)
    }
  }

  const QUICK_TAGS = ['Nhanh chóng', 'Thân thiện', 'Cẩn thận', 'Đúng giờ', 'Chuyên nghiệp']
  const [selectedTags, setSelectedTags] = useState([])
  const toggleTag = (tag) => setSelectedTags(prev =>
    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
  )

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={ratingStyles.container}>
        <View style={ratingStyles.header}>
          <TouchableOpacity onPress={onClose} style={ratingStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={ratingStyles.headerTitle}>Đánh giá Shipper</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={ratingStyles.body} showsVerticalScrollIndicator={false}>
          {submitted ? (
            <View style={ratingStyles.successState}>
              <View style={ratingStyles.successIcon}>
                <Ionicons name="checkmark-circle" size={72} color={colors.success} />
              </View>
              <Text style={ratingStyles.successTitle}>Cảm ơn bạn! 🎉</Text>
              <Text style={ratingStyles.successDesc}>Đánh giá của bạn giúp chúng tôi cải thiện chất lượng dịch vụ giao hàng.</Text>
            </View>
          ) : (
            <>
              {/* Shipper Icon */}
              <View style={ratingStyles.shipperSection}>
                <View style={ratingStyles.shipperIcon}>
                  <Ionicons name="person" size={40} color={colors.primary} />
                </View>
                <Text style={ratingStyles.shipperLabel}>Đánh giá Shipper giao đơn hàng</Text>
                <Text style={ratingStyles.orderRef}>{order?.ma_don_hang?.slice(0, 12)}</Text>
              </View>

              {/* Stars */}
              <View style={ratingStyles.starsSection}>
                <Text style={ratingStyles.starsTitle}>Mức độ hài lòng</Text>
                <View style={ratingStyles.starsRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <TouchableOpacity key={star} onPress={() => setRating(star)} style={ratingStyles.starBtn}>
                      <Ionicons
                        name={star <= rating ? 'star' : 'star-outline'}
                        size={44}
                        color={star <= rating ? '#F59E0B' : colors.muted}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={ratingStyles.starLabel}>
                  {rating === 5 ? '🤩 Tuyệt vời!' : rating === 4 ? '😊 Tốt' : rating === 3 ? '😐 Bình thường' : rating === 2 ? '😕 Không tốt' : '😞 Rất tệ'}
                </Text>
              </View>

              {/* Quick Tags */}
              <View style={ratingStyles.tagsSection}>
                <Text style={ratingStyles.starsTitle}>Nhận xét nhanh</Text>
                <View style={ratingStyles.tagsRow}>
                  {QUICK_TAGS.map(tag => (
                    <TouchableOpacity
                      key={tag}
                      style={[ratingStyles.tag, selectedTags.includes(tag) && ratingStyles.tagActive]}
                      onPress={() => toggleTag(tag)}
                    >
                      <Text style={[ratingStyles.tagText, selectedTags.includes(tag) && ratingStyles.tagTextActive]}>
                        {selectedTags.includes(tag) ? '✓ ' : ''}{tag}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Comment */}
              <View style={ratingStyles.commentSection}>
                <Text style={ratingStyles.starsTitle}>Nhận xét chi tiết (không bắt buộc)</Text>
                <CommentInput comment={comment} setComment={setComment} />
              </View>

              <TouchableOpacity
                style={[ratingStyles.submitBtn, submitting && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={ratingStyles.submitBtnText}>Gửi đánh giá ⭐</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

// Comment input for rating modal
function CommentInput({ comment, setComment }) {
  return (
    <TextInput
      style={ratingStyles.commentInput}
      value={comment}
      onChangeText={setComment}
      placeholder="Chia sẻ trải nghiệm của bạn với Shipper..."
      placeholderTextColor={colors.muted}
      multiline
      numberOfLines={4}
      textAlignVertical="top"
    />
  )
}

const ratingStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, maxWidth: 480, width: '100%', alignSelf: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border,
    paddingTop: 56,
  },
  closeBtn: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  body: { padding: spacing.lg, paddingBottom: 60 },
  shipperSection: { alignItems: 'center', marginBottom: spacing.xl },
  shipperIcon: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: colors.infoBg,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md,
    borderWidth: 2, borderColor: colors.primary,
  },
  shipperLabel: { fontSize: 15, color: colors.textSecondary },
  orderRef: { fontSize: 12, color: colors.muted, marginTop: 4 },
  starsSection: { alignItems: 'center', marginBottom: spacing.lg },
  starsTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.md, alignSelf: 'flex-start' },
  starsRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
  starBtn: { padding: 4 },
  starLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  tagsSection: { marginBottom: spacing.lg },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: colors.bg, borderWidth: 1.5, borderColor: colors.border,
  },
  tagActive: { backgroundColor: colors.infoBg, borderColor: colors.primary },
  tagText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  tagTextActive: { color: colors.primary },
  commentSection: { marginBottom: spacing.xl },
  commentInput: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: 12, padding: 12,
    fontSize: 14, color: colors.text, minHeight: 100, backgroundColor: colors.surface,
  },
  submitBtn: {
    backgroundColor: '#F59E0B', paddingVertical: 16, borderRadius: 12,
    alignItems: 'center', ...shadows.card,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  successState: { alignItems: 'center', paddingVertical: 60 },
  successIcon: { marginBottom: spacing.xl },
  successTitle: { fontSize: 24, fontWeight: '900', color: colors.text, marginBottom: spacing.md },
  successDesc: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', paddingHorizontal: spacing.xl },
})

function InvoiceModal({ order, visible, onClose }) {
  if (!order) return null
  const paymentStyle = {
    DA_THANH_TOAN: { color: '#22c55e', label: 'Đã thanh toán', icon: 'checkmark-circle' },
    CHO_THANH_TOAN: { color: '#0ea5e9', label: 'Chờ thanh toán', icon: 'time-outline' },
    CHO_THANH_TOAN_KHI_NHAN_HANG: { color: '#f97316', label: 'Thanh toán khi nhận', icon: 'cash-outline' },
    CHO_XU_LY: { color: '#f59e0b', label: 'Chờ xử lý', icon: 'hourglass-outline' },
    THAT_BAI: { color: '#ef4444', label: 'Thất bại', icon: 'close-circle-outline' },
  }
  const ps = paymentStyle[order.trang_thai_thanh_toan] || { color: colors.muted, label: order.trang_thai_thanh_toan, icon: 'help-circle-outline' }
  const subTotal = order.chi_tiet.reduce((sum, i) => sum + Number(i.gia_ban || 0) * Number(i.so_luong || 0), 0)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={invoiceStyles.container}>
        <View style={invoiceStyles.header}>
          <Text style={invoiceStyles.headerTitle}>Hóa đơn</Text>
          <Pressable onPress={onClose} style={invoiceStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={invoiceStyles.body}>
          {/* Store Info */}
          <View style={invoiceStyles.storeSection}>
            <Text style={invoiceStyles.storeName}>☕ AVENGERS COFFEE</Text>
            <Text style={invoiceStyles.storeSlogan}>Hương vị ngọt ngào mỗi ngày</Text>
          </View>

          <View style={invoiceStyles.dashed} />

          {/* Invoice Info */}
          <View style={invoiceStyles.infoSection}>
            <View style={invoiceStyles.infoRow}>
              <Text style={invoiceStyles.infoLabel}>Mã đơn hàng</Text>
              <Text style={invoiceStyles.infoValueBold}>{order.ma_don_hang}</Text>
            </View>
            <View style={invoiceStyles.infoRow}>
              <Text style={invoiceStyles.infoLabel}>Ngày đặt</Text>
              <Text style={invoiceStyles.infoValue}>{formatDateTime(order.ngay_tao)}</Text>
            </View>
            <View style={invoiceStyles.infoRow}>
              <Text style={invoiceStyles.infoLabel}>Địa chỉ</Text>
              <Text style={invoiceStyles.infoValue} numberOfLines={2}>{order.dia_chi_giao_hang || 'N/A'}</Text>
            </View>
            <View style={invoiceStyles.infoRow}>
              <Text style={invoiceStyles.infoLabel}>Thanh toán</Text>
              <View style={[invoiceStyles.payBadge, { backgroundColor: `${ps.color}15` }]}>
                <Ionicons name={ps.icon} size={12} color={ps.color} />
                <Text style={[invoiceStyles.payBadgeText, { color: ps.color }]}>{ps.label}</Text>
              </View>
            </View>
          </View>

          <View style={invoiceStyles.dashed} />

          {/* Items Header */}
          <View style={invoiceStyles.itemsHeader}>
            <Text style={[invoiceStyles.colName, { flex: 3 }]}>Sản phẩm</Text>
            <Text style={[invoiceStyles.colName, { flex: 1, textAlign: 'center' }]}>SL</Text>
            <Text style={[invoiceStyles.colName, { flex: 2, textAlign: 'right' }]}>Thành tiền</Text>
          </View>

          {/* Items */}
          {order.chi_tiet.map((item, index) => (
            <View key={item.id || index} style={invoiceStyles.itemRow}>
              <View style={{ flex: 3 }}>
                <Text style={invoiceStyles.itemName} numberOfLines={2}>{item.ten_san_pham}</Text>
                {item.kich_co || item.size ? (
                  <Text style={[invoiceStyles.itemPrice, { fontSize: 11 }]}>
                    Size {item.kich_co || item.size}
                    {item.toppings && item.toppings.length ? ` + ${Array.isArray(item.toppings) ? item.toppings.join(', ') : item.toppings}` : ''}
                  </Text>
                ) : null}
                <Text style={invoiceStyles.itemPrice}>{formatCurrency(item.gia_ban)}</Text>
              </View>
              <Text style={[invoiceStyles.itemQty, { flex: 1 }]}>x{item.so_luong}</Text>
              <Text style={[invoiceStyles.itemTotal, { flex: 2 }]}>
                {formatCurrency(Number(item.gia_ban) * Number(item.so_luong))}
              </Text>
            </View>
          ))}

          <View style={invoiceStyles.dashed} />

          {/* Totals */}
          <View style={invoiceStyles.totalsSection}>
            <View style={invoiceStyles.totalRow}>
              <Text style={invoiceStyles.totalLabel}>Tạm tính ({order.chi_tiet.length} món)</Text>
              <Text style={invoiceStyles.totalValue}>{formatCurrency(subTotal)}</Text>
            </View>
            {order.so_tien_giam > 0 ? (
              <View style={invoiceStyles.totalRow}>
                <Text style={[invoiceStyles.totalLabel, { color: colors.success }]}>Giảm giá</Text>
                <Text style={[invoiceStyles.totalValue, { color: colors.success }]}>-{formatCurrency(order.so_tien_giam)}</Text>
              </View>
            ) : null}
            <View style={invoiceStyles.dashed} />
            <View style={invoiceStyles.totalRow}>
              <Text style={invoiceStyles.grandTotalLabel}>TỔNG CỘNG</Text>
              <Text style={invoiceStyles.grandTotalValue}>{formatCurrency(order.tong_tien)}</Text>
            </View>
          </View>

          <View style={invoiceStyles.dashed} />

          {/* Footer */}
          <View style={invoiceStyles.footer}>
            <Text style={invoiceStyles.footerText}>Cảm ơn quý khách đã sử dụng dịch vụ!</Text>
            <Text style={invoiceStyles.footerText}>Avengers Coffee ♥</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'MOI_TAO', label: 'Vừa tạo' },
  { value: 'DA_XAC_NHAN', label: 'Đã xác nhận' },
  { value: 'DANG_CHUAN_BI', label: 'Đang chuẩn bị' },
  { value: 'DANG_GIAO', label: 'Đang giao' },
  { value: 'HOAN_THANH', label: 'Hoàn thành' },
  { value: 'DA_HUY', label: 'Đã hủy' },
]

const STATUS_STYLE = {
  MOI_TAO:       { color: '#f59e0b', bg: '#fffbeb', icon: 'time-outline' },
  DA_XAC_NHAN:   { color: '#0ea5e9', bg: '#f0f9ff', icon: 'checkmark-outline' },
  DANG_CHUAN_BI: { color: '#8b5cf6', bg: '#f5f3ff', icon: 'cafe-outline' },
  DANG_GIAO:     { color: '#f97316', bg: '#fff7ed', icon: 'bicycle-outline' },
  HOAN_THANH:    { color: '#22c55e', bg: '#f0fdf4', icon: 'checkmark-circle-outline' },
  DA_HUY:        { color: '#ef4444', bg: '#fef2f2', icon: 'close-circle-outline' },
}

const PAYMENT_STATUS_STYLE = {
  CHO_XU_LY:                    { color: '#f59e0b', label: 'Chờ xử lý' },
  CHO_THANH_TOAN:               { color: '#0ea5e9', label: 'Chờ thanh toán' },
  CHO_THANH_TOAN_KHI_NHAN_HANG: { color: '#f97316', label: 'Thanh toán khi nhận' },
  DA_THANH_TOAN:                { color: '#22c55e', label: 'Đã thanh toán' },
  THAT_BAI:                     { color: '#ef4444', label: 'Thất bại' },
}


function OrderRatingModal({ order, visible, onClose, userId }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    if (!visible) {
      setRating(5)
      setComment('')
      setSubmitted(false)
    }
  }, [visible])

  if (!order) return null

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await apiClient.post(`/customers/${userId}/orders/${order.ma_don_hang}/review`, {
        diem_danh_gia: rating,
        nhan_xet: comment.trim() || 'Rất hài lòng!',
      })
      setSubmitted(true)
      setTimeout(onClose, 2000)
    } catch (e) {
      Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không thể gửi đánh giá')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={ratingStyles.container}>
        <View style={ratingStyles.header}>
          <TouchableOpacity onPress={onClose} style={ratingStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={ratingStyles.headerTitle}>Đánh giá đơn hàng</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={ratingStyles.body} showsVerticalScrollIndicator={false}>
          {submitted ? (
            <View style={ratingStyles.successState}>
              <View style={ratingStyles.successIcon}>
                <Ionicons name="checkmark-circle" size={72} color={colors.success} />
              </View>
              <Text style={ratingStyles.successTitle}>Cảm ơn bạn! 🎉</Text>
              <Text style={ratingStyles.successDesc}>Đánh giá của bạn giúp chúng tôi phục vụ bạn tốt hơn.</Text>
            </View>
          ) : (
            <>
              <View style={ratingStyles.shipperSection}>
                <View style={[ratingStyles.shipperIcon, { backgroundColor: '#fff7ed', borderColor: '#ea8025' }]}>
                  <Ionicons name="cafe" size={40} color="#ea8025" />
                </View>
                <Text style={ratingStyles.shipperLabel}>Đánh giá chất lượng đơn hàng</Text>
                <Text style={ratingStyles.orderRef}>{order?.ma_don_hang?.slice(0, 16)}</Text>
              </View>

              <View style={ratingStyles.starsSection}>
                <Text style={ratingStyles.starsTitle}>Mức độ hài lòng</Text>
                <View style={ratingStyles.starsRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <TouchableOpacity key={star} onPress={() => setRating(star)} style={ratingStyles.starBtn}>
                      <Ionicons
                        name={star <= rating ? 'star' : 'star-outline'}
                        size={44}
                        color={star <= rating ? '#F59E0B' : colors.muted}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={ratingStyles.starLabel}>
                  {rating === 5 ? '🤩 Tuyệt vời!' : rating === 4 ? '😊 Tốt' : rating === 3 ? '😐 Bình thường' : rating === 2 ? '😕 Không tốt' : '😞 Rất tệ'}
                </Text>
              </View>

              <View style={ratingStyles.commentSection}>
                <Text style={ratingStyles.starsTitle}>Nhận xét của bạn (không bắt buộc)</Text>
                <TextInput
                  style={ratingStyles.commentInput}
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Chia sẻ cảm nhận về đồ uống, dịch vụ..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={[ratingStyles.submitBtn, submitting && { opacity: 0.7 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={ratingStyles.submitBtnText}>Gửi đánh giá ⭐</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

function OrderDetailModal({ order, visible, onClose, onCancel, onViewInvoice, onRateOrder, onTrackOrder }) {
  if (!order) return null
  const statusStyle = STATUS_STYLE[order.trang_thai_don_hang] || { color: colors.muted, bg: colors.cream, icon: 'help-circle-outline' }
  const paymentStyle = PAYMENT_STATUS_STYLE[order.trang_thai_thanh_toan] || { color: colors.muted, label: order.trang_thai_thanh_toan }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={detailStyles.container}>
        <View style={detailStyles.header}>
          <Text style={detailStyles.headerTitle}>Chi tiết đơn hàng</Text>
          <Pressable onPress={onClose} style={detailStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Status Banner */}
          <View style={[detailStyles.statusBanner, { backgroundColor: statusStyle.bg }]}>
            <Ionicons name={statusStyle.icon} size={28} color={statusStyle.color} />
            <View>
              <Text style={[detailStyles.statusText, { color: statusStyle.color }]}>
                {orderStatusLabels[order.trang_thai_don_hang] || order.trang_thai_don_hang}
              </Text>
              <Text style={detailStyles.orderCode}>{order.ma_don_hang}</Text>
            </View>
          </View>

          <View style={detailStyles.body}>
            {/* Order Info */}
            <View style={detailStyles.infoCard}>
              <Text style={detailStyles.infoTitle}>Thông tin đơn hàng</Text>
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Ngày đặt</Text>
                <Text style={detailStyles.infoValue}>{formatDateTime(order.ngay_tao)}</Text>
              </View>
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Địa chỉ giao</Text>
                <Text style={detailStyles.infoValue} numberOfLines={2}>{order.dia_chi_giao_hang || 'N/A'}</Text>
              </View>
              {order.khung_gio_giao ? (
                <View style={detailStyles.infoRow}>
                  <Text style={detailStyles.infoLabel}>Khung giờ giao</Text>
                  <Text style={detailStyles.infoValue}>{order.khung_gio_giao}</Text>
                </View>
              ) : null}
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Phương thức TT</Text>
                <Text style={detailStyles.infoValue}>{order.phuong_thuc_thanh_toan || 'N/A'}</Text>
              </View>
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Trạng thái TT</Text>
                <Text style={[detailStyles.infoValue, { color: paymentStyle.color }]}>{paymentStyle.label}</Text>
              </View>
              {order.ghi_chu ? (
                <View style={detailStyles.infoRow}>
                  <Text style={detailStyles.infoLabel}>Ghi chú</Text>
                  <Text style={detailStyles.infoValue}>{order.ghi_chu}</Text>
                </View>
              ) : null}
            </View>

            {/* Order Items */}
            <View style={detailStyles.itemsCard}>
              <Text style={detailStyles.infoTitle}>Sản phẩm ({order.chi_tiet.length})</Text>
              {order.chi_tiet.map((item, index) => (
                <View key={item.id || index} style={detailStyles.orderItem}>
                  {item.hinh_anh_url ? (
                    <Image source={{ uri: item.hinh_anh_url }} style={detailStyles.orderItemImage} resizeMode="cover" />
                  ) : (
                    <View style={[detailStyles.orderItemImage, detailStyles.orderItemImagePlaceholder]}>
                      <Ionicons name="cafe-outline" size={18} color={colors.muted} />
                    </View>
                  )}
                  <View style={detailStyles.orderItemInfo}>
                    <Text style={detailStyles.orderItemName} numberOfLines={2}>{item.ten_san_pham}</Text>
                    {item.kich_co || item.size ? <Text style={detailStyles.orderItemMeta}>Size: {item.kich_co || item.size}</Text> : null}
                    {item.toppings && item.toppings.length ? (
                      <Text style={detailStyles.orderItemMeta}>Topping: {Array.isArray(item.toppings) ? item.toppings.join(', ') : item.toppings}</Text>
                    ) : null}
                    {(item.luong_da || item.do_ngot) ? (
                      <Text style={detailStyles.orderItemMeta}>
                        {item.luong_da ? `Đá: ${item.luong_da}` : ''}
                        {item.luong_da && item.do_ngot ? ' | ' : ''}
                        {item.do_ngot ? `Ngọt: ${item.do_ngot}` : ''}
                      </Text>
                    ) : null}
                    {item.ghi_chu ? <Text style={[detailStyles.orderItemMeta, { fontStyle: 'italic', color: '#ea8025' }]}>Ghi chú: {item.ghi_chu}</Text> : null}
                    <View style={detailStyles.orderItemPriceRow}>
                      <Text style={detailStyles.orderItemQty}>x{item.so_luong}</Text>
                      <Text style={detailStyles.orderItemPrice}>{formatCurrency(item.gia_ban)}</Text>
                    </View>
                  </View>
                  <Text style={detailStyles.orderItemSubtotal}>
                    {formatCurrency(Number(item.gia_ban) * Number(item.so_luong))}
                  </Text>
                </View>
              ))}
            </View>

            {/* Total */}
            <View style={detailStyles.totalCard}>
              {order.so_tien_giam > 0 ? (
                <>
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.totalLabel}>Tạm tính</Text>
                    <Text style={detailStyles.totalValue}>{formatCurrency(order.tong_tien + order.so_tien_giam)}</Text>
                  </View>
                  <View style={detailStyles.totalRow}>
                    <Text style={[detailStyles.totalLabel, { color: colors.success }]}>Giảm giá</Text>
                    <Text style={[detailStyles.totalValue, { color: colors.success }]}>-{formatCurrency(order.so_tien_giam)}</Text>
                  </View>
                </>
              ) : null}
              <View style={detailStyles.totalFinalRow}>
                <Text style={detailStyles.totalFinalLabel}>Tổng thanh toán</Text>
                <Text style={detailStyles.totalFinalValue}>{formatCurrency(order.tong_tien)}</Text>
              </View>
            </View>

            {/* Cancel Button */}
            {canCancelOrder(order.trang_thai_don_hang) ? (
              <Pressable
                onPress={() => {
                  onClose()
                  onCancel(order.ma_don_hang)
                }}
                style={detailStyles.cancelBtn}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                <Text style={detailStyles.cancelBtnText}>Hủy đơn hàng</Text>
              </Pressable>
            ) : null}

            {/* Rate Order */}
            {order.trang_thai_don_hang === 'HOAN_THANH' ? (
              <Pressable
                onPress={() => { onClose(); onRateOrder?.(order) }}
                style={[detailStyles.invoiceBtn, { backgroundColor: '#fff7ed', borderColor: '#f97316', marginBottom: 8 }]}
              >
                <Ionicons name="star-outline" size={18} color="#f97316" />
                <Text style={[detailStyles.invoiceBtnText, { color: '#f97316' }]}>Đánh giá đơn hàng</Text>
              </Pressable>
            ) : null}

            {/* View Invoice */}
            <Pressable
              onPress={() => onViewInvoice?.(order)}
              style={[detailStyles.invoiceBtn, { marginBottom: 8 }]}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
              <Text style={detailStyles.invoiceBtnText}>Xem hóa đơn</Text>
            </Pressable>

            {/* Track Order */}
            {['MOI_TAO', 'DANG_GIAO', 'DANG_CHUAN_BI', 'DA_XAC_NHAN'].includes(order.trang_thai_don_hang) ? (
              <Pressable
                onPress={() => onTrackOrder?.(order)}
                style={[detailStyles.invoiceBtn, { backgroundColor: colors.infoBg, borderColor: colors.primary }]}
              >
                <Ionicons name="navigate" size={18} color={colors.primary} />
                <Text style={[detailStyles.invoiceBtnText, { color: colors.primary }]}>Theo dõi đơn hàng</Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

export function OrdersScreen() {
  const navigation = useNavigation()
  const { user } = useUser()
  const userId = getUserId(user)
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [invoiceOrder, setInvoiceOrder] = useState(null)
  const [trackingOrder, setTrackingOrder] = useState(null)
  const [ratingOrder, setRatingOrder] = useState(null)
  const [orderRatingTarget, setOrderRatingTarget] = useState(null)

  const ordersQuery = useQuery({
    queryKey: ['customer', 'orders', userId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const response = await apiClient.get(`/customers/${userId}/orders${params.toString() ? `?${params.toString()}` : ''}`)
      return safeArray(response?.orders).map(normalizeOrder)
    },
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  })

  const cancelMutation = useMutation({
    mutationFn: async ({ orderId }) =>
      apiClient.patch(`/customers/${userId}/orders/${orderId}/cancel`, {
        reason: 'Khách hàng hủy đơn từ ứng dụng',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'orders', userId] })
    },
    onError: (error) => {
      const message = error?.response?.data?.message || 'Không thể hủy đơn hàng.'
      Alert.alert('Lỗi', message)
    },
  })

  const orders = ordersQuery.data || []

  const handleCancel = (orderId) => {
    Alert.alert(
      'Xác nhận hủy đơn',
      'Bạn chắc chắn muốn hủy đơn hàng này không?',
      [
        { text: 'Không', style: 'cancel' },
        {
          text: 'Hủy đơn',
          style: 'destructive',
          onPress: () => cancelMutation.mutate({ orderId }),
        },
      ]
    )
  }

  const renderOrderCard = ({ item }) => {
    const statusStyle = STATUS_STYLE[item.trang_thai_don_hang] || { color: colors.muted, bg: colors.cream, icon: 'help-circle-outline' }

    return (
      <Pressable
        onPress={() => {
          setSelectedOrder(item)
          setIsDetailOpen(true)
        }}
        style={({ pressed }) => [styles.orderCard, shadows.sm, pressed && { opacity: 0.93 }]}
      >
        {/* Header row */}
        <View style={styles.orderCardHeader}>
          <View style={styles.orderCodeWrap}>
            <Text style={styles.orderCode}>{item.ma_don_hang}</Text>
            <Text style={styles.orderDate}>{formatDateTime(item.ngay_tao)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Ionicons name={statusStyle.icon} size={13} color={statusStyle.color} />
            <Text style={[styles.statusText, { color: statusStyle.color }]}>
              {orderStatusLabels[item.trang_thai_don_hang] || item.trang_thai_don_hang}
            </Text>
          </View>
        </View>

        <View style={styles.orderDivider} />

        {/* Body */}
        <View style={styles.orderBody}>
          <View style={styles.orderInfoRow}>
            <Ionicons name="location-outline" size={13} color={colors.muted} />
            <Text style={styles.orderInfoText} numberOfLines={1}>{item.dia_chi_giao_hang || 'Chưa có địa chỉ'}</Text>
          </View>
          <View style={styles.orderInfoRow}>
            <Ionicons name="restaurant-outline" size={13} color={colors.muted} />
            <Text style={styles.orderInfoText}>{item.chi_tiet.length} sản phẩm</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.orderCardFooter}>
          <View>
            <Text style={styles.orderTotalLabel}>Tổng tiền</Text>
            <Text style={styles.orderTotal}>{formatCurrency(item.tong_tien)}</Text>
          </View>
          <View style={styles.orderActions}>
            {canCancelOrder(item.trang_thai_don_hang) ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.()
                  handleCancel(item.ma_don_hang)
                }}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Hủy đơn</Text>
              </Pressable>
            ) : null}
            {/* Live Tracking Button */}
            {['MOI_TAO', 'DANG_GIAO', 'DANG_CHUAN_BI', 'DA_XAC_NHAN'].includes(item.trang_thai_don_hang) && (
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); setTrackingOrder(item) }}
                style={[styles.detailBtn, { backgroundColor: colors.infoBg, borderColor: colors.primary, borderWidth: 1 }]}
              >
                <Ionicons name="navigate" size={13} color={colors.primary} />
                <Text style={[styles.detailBtnText, { color: colors.primary }]}>Theo dõi</Text>
              </Pressable>
            )}
            {/* Rating Button */}
            {item.trang_thai_don_hang === 'HOAN_THANH' && (
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); setRatingOrder(item) }}
                style={[styles.detailBtn, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B', borderWidth: 1 }]}
              >
                <Ionicons name="star" size={13} color="#F59E0B" />
                <Text style={[styles.detailBtnText, { color: '#92400E' }]}>Đánh giá</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                setSelectedOrder(item)
                setIsDetailOpen(true)
              }}
              style={styles.detailBtn}
            >
              <Text style={styles.detailBtnText}>Chi tiết</Text>
              <Ionicons name="chevron-forward" size={13} color={colors.primary} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1e293b" />
          </Pressable>
          <View>
            <Text style={styles.headerTitle}>Đơn hàng của tôi</Text>
            <Text style={styles.headerSubtitle}>{orders.length} đơn hàng</Text>
          </View>
        </View>
      </View>

      {/* Status Filters */}
      <View style={styles.filterBar}>
        <View style={[styles.filterList, { flexDirection: 'row', flexWrap: 'wrap' }]}>
          {STATUS_FILTERS.map((item) => {
            const isActive = statusFilter === item.value
            return (
              <Pressable
                key={item.value}
                onPress={() => setStatusFilter(item.value)}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {/* Loading */}
      {ordersQuery.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Đang tải đơn hàng...</Text>
        </View>
      ) : null}

      {/* Empty */}
      {!ordersQuery.isLoading && !orders.length ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="receipt-outline" size={56} color={colors.border} />
          <Text style={styles.emptyTitle}>Chưa có đơn hàng nào</Text>
          <Text style={styles.emptyText}>
            {statusFilter !== 'all'
              ? `Không có đơn hàng với trạng thái "${orderStatusLabels[statusFilter] || statusFilter}".`
              : 'Hãy đặt hàng đầu tiên của bạn!'}
          </Text>
          {statusFilter !== 'all' ? (
            <Pressable onPress={() => setStatusFilter('all')} style={styles.clearFilterBtn}>
              <Text style={styles.clearFilterText}>Xem tất cả đơn</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Orders List */}
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrderCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onRefresh={() => ordersQuery.refetch()}
        refreshing={ordersQuery.isFetching && !ordersQuery.isLoading}
      />

      {/* Detail Modal */}
      <OrderDetailModal
        order={selectedOrder}
        visible={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false)
          setSelectedOrder(null)
        }}
        onCancel={handleCancel}
        onRateOrder={(order) => setOrderRatingTarget(order)}
        onViewInvoice={(order) => {
          setIsDetailOpen(false)
          setInvoiceOrder(order)
        }}
        onTrackOrder={(order) => {
          setIsDetailOpen(false)
          setTrackingOrder(order)
        }}
      />

      {/* Invoice Modal */}
      <InvoiceModal
        order={invoiceOrder}
        visible={Boolean(invoiceOrder)}
        onClose={() => setInvoiceOrder(null)}
      />

      {/* Live Tracking Modal */}
      <LiveTrackingModal
        order={trackingOrder}
        visible={Boolean(trackingOrder)}
        onClose={() => setTrackingOrder(null)}
        onOpenRating={(order) => setRatingOrder(order)}
      />

      {/* Shipper Rating Modal */}
      <ShipperRatingModal
        order={ratingOrder}
        visible={Boolean(ratingOrder)}
        onClose={() => setRatingOrder(null)}
        userId={userId}
      />

      {/* Order Rating Modal */}
      <OrderRatingModal
        order={orderRatingTarget}
        visible={Boolean(orderRatingTarget)}
        onClose={() => setOrderRatingTarget(null)}
        userId={userId}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1e293b',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
  filterBar: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  filterList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  filterChipActive: {
    backgroundColor: '#ea8025',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  filterTextActive: {
    color: '#fff',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  clearFilterBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearFilterText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },

  // Order Card
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingBottom: 12,
  },
  orderCodeWrap: {
    flex: 1,
  },
  orderCode: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: 0.2,
  },
  orderDate: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  orderDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginHorizontal: 16,
  },
  orderBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  orderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderInfoText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
  },
  orderTotalLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  orderTotal: {
    fontSize: 18,
    fontWeight: '900',
    color: '#ea8025',
  },
  orderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cancelBtn: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  cancelBtnText: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 12,
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fff9f5',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ffe0c8',
  },
  detailBtnText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 12,
  },
})

// Order Detail Modal Styles
const detailStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    maxWidth: 480, width: '100%', alignSelf: 'center'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.card,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderCode: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
    marginTop: 2,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#1e293b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  infoLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    minWidth: 100,
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '700',
    textAlign: 'right',
  },
  itemsCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  orderItemImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  orderItemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderItemInfo: {
    flex: 1,
    gap: 4,
  },
  orderItemName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
    lineHeight: 20,
  },
  orderItemMeta: {
    fontSize: 12,
    color: '#64748b',
  },
  orderItemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderItemQty: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  orderItemPrice: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '700',
  },
  orderItemSubtotal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ea8025',
  },
  totalCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  totalFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  totalFinalLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
  },
  totalFinalValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ea8025',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.xl,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.danger,
  },
})

// Invoice Modal Styles
const invoiceStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    maxWidth: 480, width: '100%', alignSelf: 'center'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: '#fff',
    margin: spacing.md,
    borderRadius: radius.xl,
    ...shadows.sm,
  },
  storeSection: {
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
  },
  storeName: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textTransform: 'uppercase',
  },
  storeSlogan: {
    fontSize: 12,
    color: colors.muted,
  },
  dashed: {
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    borderStyle: 'dashed',
    marginVertical: spacing.xs,
  },
  infoSection: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
    maxWidth: '65%',
    textAlign: 'right',
  },
  infoValueBold: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '900',
  },
  payBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  payBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
  },
  colName: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  itemPrice: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  itemQty: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  itemTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  totalsSection: {
    gap: 6,
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
  },
  footer: {
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
  },
  footerText: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
  }
})
