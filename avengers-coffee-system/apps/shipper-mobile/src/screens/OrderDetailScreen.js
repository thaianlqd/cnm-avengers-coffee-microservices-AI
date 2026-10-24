import { deliveryActionPath } from '../lib/deliveryAcceptance.mjs'
import OrderRouteCard from '../components/OrderRouteCard'
import AvailableOrderDetail from './AvailableOrderDetail'
import { LazyScrollView, LazySection } from '../components/LazyScrollView'
import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Linking,
  StatusBar,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency, formatDateTime, deliveryStatusLabels, deliveryStatusColors } from '../lib/shipperData'
import * as Location from 'expo-location'
import { formatBranchName, formatBranchFullTitle, formatBranchAddress, setGlobalBranchList } from '../lib/branchHelper'
import { openGoogleMapsNavigation } from '../lib/navigationHelper'
import { Header, IconButton, Skeleton, OrderDetailSkeleton } from '../components/Experience'
import { startBackgroundLocationTracking } from '../lib/backgroundLocationManager'

export function OrderDetailScreen(props) {
  return props.route.params?.orderId ? <AvailableOrderDetail {...props} /> : <AssignedDeliveryDetail {...props} />
}
function AssignedDeliveryDetail({ route, navigation }) {
  const { deliveryId } = route.params
  const { shipper } = useShipper()
  const queryClient = useQueryClient()
  const [loadingAction, setLoadingAction] = useState(null)
  const [failModalVisible, setFailModalVisible] = useState(false)
  const [failReason, setFailReason] = useState('')

  const { data: delivery, isLoading, isError, error } = useQuery({
    queryKey: ['deliveryDetail', deliveryId],
    queryFn: async () => {
      return apiClient.get(`/shippers/${shipper.id}/deliveries/${deliveryId}`)
    },
  })

  const { data: publicBranchPayload } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/users/branches/public')
        const payload = response?.data || response || { items: [] }
        setGlobalBranchList(payload)
        return payload
      } catch (error) {
        return { items: [] }
      }
    },
    staleTime: 10 * 60 * 1000,
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ action, payload = {} }) => {
      setLoadingAction(action)
      return apiClient.post(deliveryActionPath(shipper.id, delivery, action), payload)
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['deliveryDetail', deliveryId] })
      queryClient.invalidateQueries({ queryKey: ['availableOrders'] })
      queryClient.invalidateQueries({ queryKey: ['acceptedOrders'] })
      queryClient.invalidateQueries({ queryKey: ['deliveriesHistory'] })
      queryClient.invalidateQueries({ queryKey: ['shipperStats', shipper?.id] })
      queryClient.invalidateQueries({ queryKey: ['shipperWallet', shipper?.id] })
      setLoadingAction(null)
      setFailModalVisible(false)
      setFailReason('')

      if (variables?.action === 'accept' && data?.delivery?.id) {
        navigation.replace('OrderDetail', { deliveryId: data.delivery.id, orderId: null })
      }
      if (variables?.action === 'start') {
        navigation.navigate('Map', { delivery: { ...delivery, status: 'IN_TRANSIT' } })
      }
    },
    onError: (err) => {
      setLoadingAction(null)
      Alert.alert('Lỗi', err.response?.data?.message || 'Có lỗi xảy ra khi cập nhật trạng thái')
    },
  })

  const handleAction = (action) => {
    let payload = {}
    if (action === 'start') {
      payload = { latitude: delivery?.pickup_latitude || 10.762622, longitude: delivery?.pickup_longitude || 106.660172 }
    } else if (action === 'complete') {
      payload = {
        latitude: delivery?.delivery_latitude || 10.762622,
        longitude: delivery?.delivery_longitude || 106.660172,
        proof_image_url: delivery?.proof_image_url || 'https://images.unsplash.com/photo-1610632380989-7f09b1a64f8a?w=600&q=80',
      }
    }
    updateStatusMutation.mutate({ action, payload })
  }

  const handleFailDelivery = () => {
    if (!failReason.trim() || failReason.trim().length < 5) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập lý do giao thất bại (ít nhất 5 ký tự)')
      return
    }
    updateStatusMutation.mutate({ action: 'fail', payload: { reason: failReason.trim() } })
  }

  const customerAddress = String(
    delivery?.delivery_address ||
    delivery?.dia_chi_giao_hang ||
    delivery?.order?.dia_chi_giao_hang ||
    delivery?.tracking?.delivery_address ||
    ''
  ).trim();

  const openNavigation = async (address) => {
    try {
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (cur?.coords && shipper?.id) {
        apiClient.patch(`/shippers/${shipper.id}/location`, {
          latitude: cur.coords.latitude,
          longitude: cur.coords.longitude,
        }).catch(() => {});
      }
    } catch (e) {}

    if (shipper?.id && (delivery?.status === 'IN_TRANSIT' || delivery?.status === 'PICKING_UP')) {
      startBackgroundLocationTracking(shipper.id).catch(() => {});
    }

    openGoogleMapsNavigation(address || customerAddress, {
      latitude: delivery?.delivery_latitude || delivery?.tracking?.destination_latitude,
      longitude: delivery?.delivery_longitude || delivery?.tracking?.destination_longitude,
    });
  }

  const callCustomer = (phone) => {
    if (!phone) return Alert.alert('Không có số điện thoại', 'Thông tin khách hàng chưa cập nhật.')
    Linking.openURL(`tel:${phone}`)
  }

  if (isLoading) {
    return <OrderDetailSkeleton />
  }

  if (isError || !delivery) {
    return (
      <View style={styles.loadingWrap}>
        <Ionicons name="warning-outline" size={48} color={colors.danger} style={{ marginBottom: 16 }} />
        <Text style={styles.loadingText}>Không thể tải chi tiết đơn hàng.</Text>
        <Text style={[styles.loadingText, { fontSize: 12, color: colors.muted, marginTop: 8 }]}>
          {error?.message || 'Có lỗi xảy ra hoặc đơn hàng không tồn tại.'}
        </Text>
        <TouchableOpacity style={[styles.primaryBtn, { marginTop: 24, width: 200 }]} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const renderStepper = () => {
    const steps = [
      { id: 'PENDING', label: 'Chờ nhận', icon: 'time-outline' },
      { id: 'CONFIRMED', label: 'Đã nhận', icon: 'checkmark-outline' },
      { id: 'PICKING_UP', label: 'Đang lấy', icon: 'storefront-outline' },
      { id: 'IN_TRANSIT', label: 'Đang giao', icon: 'navigate-outline' },
      { id: 'DELIVERED', label: 'Hoàn thành', icon: 'checkmark-circle-outline' },
    ]
    const currentIndex = steps.findIndex(s => s.id === delivery.status)
    const isCancelled = delivery.status === 'CANCELLED' || delivery.status === 'FAILED'

    return (
      <View style={styles.stepperContainer}>
        {steps.map((step, index) => {
          const isActive = currentIndex >= index
          const isCurrent = currentIndex === index
          return (
            <React.Fragment key={step.id}>
              <View style={styles.stepItem}>
                <View style={[
                  styles.stepIconWrap,
                  isActive && { backgroundColor: colors.primary },
                  isCurrent && styles.stepCurrent,
                  isCancelled && { backgroundColor: colors.danger }
                ]}>
                  <Ionicons name={step.icon} size={20} color={isActive ? colors.surface : colors.muted} />
                </View>
                <Text style={[styles.stepLabel, isActive && styles.stepLabelActive]}>{step.label}</Text>
              </View>
              {index < steps.length - 1 && (
                <View style={[styles.stepLine, isActive && { backgroundColor: colors.primary }]} />
              )}
            </React.Fragment>
          )
        })}
      </View>
    )
  }

  const renderActionButtons = () => {
    if (delivery.status === 'PENDING') {
      return <TouchableOpacity style={styles.primaryBtn} onPress={() => handleAction('accept')} disabled={loadingAction !== null}>{loadingAction === 'accept' ? <ActivityIndicator color="#fff"/> : <Text style={styles.btnText}>Nhận đơn được phân công</Text>}</TouchableOpacity>
    }
    if (delivery.status === 'CONFIRMED') {
      return (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => handleAction('confirm-pickup')}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'confirm-pickup' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Xác nhận đi lấy món</Text>}
        </TouchableOpacity>
      )
    }
    if (delivery.status === 'PICKING_UP') {
      return (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => handleAction('start')} disabled={loadingAction !== null}>
          {loadingAction === 'start' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Đã lấy món · Bắt đầu giao</Text>}
        </TouchableOpacity>
      )
    }
    if (delivery.status === 'IN_TRANSIT') {
      return (
        <View style={{ gap: 10 }}>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }]}
            onPress={() => navigation.navigate('Map', { delivery })}
          >
            <Ionicons name="navigate-circle-outline" size={22} color="#fff" />
            <Text style={styles.btnText}>Mở bản đồ giao hàng</Text>
          </TouchableOpacity>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1, backgroundColor: colors.success, marginRight: 8 }]}
              onPress={() => {
                Alert.alert('Xác nhận giao thành công', 'Bạn đã giao hàng và thu tiền đầy đủ?', [
                  { text: 'Đóng', style: 'cancel' },
                  { text: 'Xác nhận đã giao', onPress: () => handleAction('complete') },
                ])
              }}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'complete' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Giao thành công</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1, backgroundColor: colors.danger, marginLeft: 8 }]}
              onPress={() => setFailModalVisible(true)}
              disabled={loadingAction !== null}
            >
              {loadingAction === 'fail' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Giao thất bại</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )
    }
    return null
  }

  const getBranchInfo = () => {
    const code = delivery?.order?.co_so_ma || delivery?.branch_code || shipper?.branch_code;
    const name = (delivery?.store_name && !delivery.store_name.includes('_'))
      ? (delivery.store_name.toLowerCase().includes('avengers coffee') ? delivery.store_name : `Avengers Coffee - ${delivery.store_name}`)
      : formatBranchFullTitle(code, publicBranchPayload);

    const address = (delivery?.store_address && !delivery.store_address.includes('_'))
      ? delivery.store_address
      : formatBranchAddress(code, publicBranchPayload, delivery?.pickup_address);

    return { name, address };
  }
  const branchInfo = getBranchInfo();

  const orderItems = delivery?.items || delivery?.order?.items || delivery?.order_items || [
    { ten_san_pham: 'Cà phê sữa đá', so_luong: 1, gia_ban: Math.max(0, (delivery.cod_amount || 50000) - (delivery.delivery_fee || 15000)) }
  ]
  const totalGoods = orderItems.reduce((sum, it) => sum + Number((it.gia_ban || 0) * (it.so_luong || 1)), 0)

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#fff' }}>
        <Header
          title="Chi tiết đơn hàng"
          onBack={() => navigation.goBack()}
          right={
            <IconButton
              name="ellipsis-vertical"
              label="Tùy chọn"
              onPress={() => {
                if (delivery.status === 'IN_TRANSIT') {
                  navigation.navigate('Exception', { deliveryId })
                }
              }}
            />
          }
        />
      </SafeAreaView>

      <LazyScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Card matching Mockup Screen 4 */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={[styles.statusIconWrap, { backgroundColor: '#f0fdf4' }]}>
              <Ionicons name="checkmark-circle" size={22} color={colors.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusLabelText}>
                {deliveryStatusLabels[delivery.status] || 'Đang giao'}
              </Text>
              <Text style={styles.orderId}>#{delivery.ma_don_hang?.slice(0, 8)}</Text>
              <Text style={styles.orderTimeText}>
                {formatDateTime(delivery.delivered_at || delivery.assigned_at || delivery.created_at || Date.now())}
              </Text>
            </View>
          </View>
        </View>

        {/* Customer Info Card matching Mockup Screen 4 */}
        <View style={styles.card}>
          <View style={styles.customerRow}>
            <View style={styles.customerAvatar}>
              <Ionicons name="person" size={20} color={colors.primary} />
            </View>
            <View style={styles.customerInfo}>
              <Text style={styles.customerName}>{delivery.customer_name || 'Nguyễn Văn A'}</Text>
              <Text style={styles.customerPhone}>{delivery.customer_phone || '0909 123 456'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {delivery.customer_phone ? (
                <TouchableOpacity
                  style={styles.circleActionBtn}
                  onPress={() => callCustomer(delivery.customer_phone)}
                  accessibilityLabel="Gọi khách"
                >
                  <Ionicons name="call-outline" size={18} color={colors.text} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.circleActionBtn}
                onPress={() => {
                  if (delivery.customer_phone) Linking.openURL(`sms:${delivery.customer_phone}`)
                }}
                accessibilityLabel="Nhắn tin"
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.addressDivider} />

          <TouchableOpacity
            style={styles.addressRow}
            onPress={() => navigation.navigate('Map', { delivery })}
          >
            <Ionicons name="location-outline" size={18} color="#94a3b8" />
            <Text style={styles.addressText} numberOfLines={2}>
              {customerAddress}
            </Text>
            <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Products Card matching Mockup Screen 4 */}
        <View style={styles.card}>
          <Text style={styles.sectionHeadingTitle}>Sản phẩm</Text>
          {orderItems.map((item, idx) => (
            <View key={idx} style={styles.productRow}>
              <View style={styles.productThumb}>
                <Ionicons name="cafe-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.productName} numberOfLines={1}>{item.ten_san_pham || 'Cà phê'}</Text>
                <Text style={styles.productQty}>x{item.so_luong || 1}</Text>
              </View>
              <Text style={styles.productPrice}>
                {formatCurrency(item.gia_ban != null ? item.gia_ban : 35000)}
              </Text>
            </View>
          ))}
        </View>

        {/* Financial Breakdown Card matching Mockup Screen 4 */}
        <View style={styles.card}>
          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Tổng tiền hàng</Text>
            <Text style={styles.calcValue}>{formatCurrency(totalGoods || 35000)}</Text>
          </View>
          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Phí giao</Text>
            <Text style={[styles.calcValue, { color: colors.success }]}>
              +{formatCurrency(delivery.delivery_fee != null ? delivery.delivery_fee : 15000)}
            </Text>
          </View>
          <View style={styles.calcRow}>
            <Text style={styles.calcLabel}>Tiền thu hộ (Cod)</Text>
            <Text style={styles.calcValue}>
              {formatCurrency(delivery.cod_amount != null ? delivery.cod_amount : 50000)}
            </Text>
          </View>
          <View style={styles.calcDivider} />
          <View style={styles.calcRow}>
            <Text style={styles.calcTotalLabel}>Tổng cần thu</Text>
            <Text style={styles.calcTotalValue}>
              {formatCurrency(delivery.cod_amount != null ? delivery.cod_amount : 50000)}
            </Text>
          </View>
        </View>

        {/* Notes */}
        {delivery.delivery_note && (
          <View style={styles.card}>
            <Text style={styles.sectionHeadingTitle}>Ghi chú đơn hàng</Text>
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>{delivery.delivery_note}</Text>
            </View>
          </View>
        )}

        {/* Proof of Delivery Image */}
        {(delivery.proof_image_url || delivery.status === 'DELIVERED') && (() => {
          const rawProof = delivery.proof_image_url
          const isDelivered = delivery.status === 'DELIVERED'
          const displayProofUrl = rawProof && !rawProof.startsWith('file://')
            ? rawProof
            : (rawProof?.startsWith('file://') && Platform.OS !== 'web'
                ? rawProof
                : (isDelivered || rawProof ? 'https://images.unsplash.com/photo-1610632380989-7f09b1a64f8a?w=600&q=80' : null))
          if (!displayProofUrl) return null
          return (
            <View style={styles.card}>
              <View style={styles.cardSectionHeader}>
                <Ionicons name="shield-checkmark" size={18} color={colors.success} />
                <Text style={styles.sectionTitle}>Ảnh xác nhận giao hàng</Text>
              </View>
              <Image
                source={{ uri: displayProofUrl }}
                style={{ width: '100%', height: 200, borderRadius: radius.md, marginTop: 8 }}
                resizeMode="cover"
              />
            </View>
          )
        })()}
      </LazyScrollView>

      {/* Bottom Actions */}
      {renderActionButtons() && (
        <View style={styles.footer}>
          {renderActionButtons()}
        </View>
      )}

      {/* Fail Reason Modal */}
      <Modal visible={failModalVisible} transparent animationType="slide" onRequestClose={() => setFailModalVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.modalBox} contentContainerStyle={{ padding: 20 }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Báo cáo giao thất bại</Text>
              <TouchableOpacity onPress={() => setFailModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalDesc}>Vui lòng chọn hoặc nhập lý do để hệ thống ghi nhận.</Text>

            <TextInput
              style={styles.modalInput}
              multiline
              numberOfLines={4}
              placeholder="VD: Khách không nghe máy, khách từ chối nhận..."
              placeholderTextColor={colors.placeholder}
              value={failReason}
              onChangeText={setFailReason}
              textAlignVertical="top"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm, loadingAction && styles.primaryBtnDisabled]}
                onPress={handleFailDelivery}
                disabled={!!loadingAction}
              >
                {loadingAction === 'fail' ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnText}>Xác nhận thất bại</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    paddingBottom: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  backBtn: { padding: spacing.sm, width: 40, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.surface, letterSpacing: 0.5 },
  exceptionBtn: { padding: spacing.sm, width: 40, alignItems: 'center' },

  scrollContent: { padding: 16, paddingBottom: 32 },

  // Cards
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  statusIconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  statusLabelText: { fontSize: 13, fontWeight: '700', color: colors.success },
  orderId: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: 2 },
  orderTimeText: { fontSize: 11, color: '#94a3b8', marginTop: 2 },

  customerRow: { flexDirection: 'row', alignItems: 'center' },
  customerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff1f2', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  customerInfo: { flex: 1, minWidth: 0 },
  customerName: { fontSize: 14, fontWeight: '700', color: colors.text },
  customerPhone: { fontSize: 12, color: '#64748b', marginTop: 2 },
  circleActionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f1f5f9' },
  addressDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addressText: { fontSize: 12, color: colors.textSecondary, flex: 1, lineHeight: 18 },

  sectionHeadingTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 12 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  productThumb: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#fff1f2', alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 13, fontWeight: '600', color: colors.text },
  productQty: { fontSize: 11, color: '#64748b', marginTop: 2 },
  productPrice: { fontSize: 13, fontWeight: '600', color: colors.text },

  calcRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 },
  calcLabel: { fontSize: 12, color: '#64748b' },
  calcValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  calcDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 10 },
  calcTotalLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  calcTotalValue: { fontSize: 16, fontWeight: '700', color: colors.primary },

  cardSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  noteBox: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  noteText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },

  footer: { padding: 16, backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  primaryBtn: {
    backgroundColor: colors.primary, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.5 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  btnText: { color: '#ffffff', fontWeight: '700', fontSize: 13 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 12 },
  modalBox: { width: '100%', maxWidth: 456, maxHeight: '90%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  modalTitle: { ...typography.h3, color: colors.text, fontSize: 18 },
  modalDesc: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md, fontSize: 13 },
  modalInput: {
    backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md, ...typography.body,
    color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 120, marginBottom: spacing.lg,
  },
  modalActions: { flexDirection: 'row' },
  modalBtn: { flex: 1, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modalBtnConfirm: { backgroundColor: colors.danger },
})
