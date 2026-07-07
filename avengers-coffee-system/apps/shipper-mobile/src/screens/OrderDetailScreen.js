import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Linking,
  Platform,
  StatusBar,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency, deliveryStatusLabels, deliveryStatusColors } from '../lib/shipperData'

export function OrderDetailScreen({ route, navigation }) {
  const { deliveryId } = route.params
  const { shipper } = useShipper()
  const queryClient = useQueryClient()
  const [loadingAction, setLoadingAction] = useState(null)
  const [failModalVisible, setFailModalVisible] = useState(false)
  const [failReason, setFailReason] = useState('')

  const { data: delivery, isLoading } = useQuery({
    queryKey: ['deliveryDetail', deliveryId],
    queryFn: async () => {
      return apiClient.get(`/shippers/${shipper.id}/deliveries/${deliveryId}`)
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ action, payload = {} }) => {
      setLoadingAction(action)
      return apiClient.post(`/shippers/${shipper.id}/deliveries/${deliveryId}/${action}`, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['deliveryDetail', deliveryId] })
      queryClient.invalidateQueries({ queryKey: ['availableOrders'] })
      queryClient.invalidateQueries({ queryKey: ['shipperStats', shipper?.id] })
      setLoadingAction(null)
      setFailModalVisible(false)
      setFailReason('')
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
        proof_image_url: null,
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

  const openNavigation = (address) => {
    const encodedAddress = encodeURIComponent(address || '')
    const googleMapsUrl = `https://maps.google.com/maps?daddr=${encodedAddress}`
    const appleMapsUrl = `maps:?daddr=${encodedAddress}`
    const url = Platform.OS === 'ios' ? appleMapsUrl : googleMapsUrl
    Linking.openURL(url).catch(() => Linking.openURL(googleMapsUrl))
  }

  const callCustomer = (phone) => {
    if (!phone) return Alert.alert('Không có số điện thoại', 'Thông tin khách hàng chưa cập nhật.')
    Linking.openURL(`tel:${phone}`)
  }

  if (isLoading || !delivery) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const renderStepper = () => {
    const steps = [
      { id: 'PENDING', label: 'Chờ lấy', icon: 'cube-outline' },
      { id: 'PICKING_UP', label: 'Đang lấy', icon: 'storefront-outline' },
      { id: 'IN_TRANSIT', label: 'Đang giao', icon: 'bicycle-outline' },
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
      return (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => handleAction('confirm-pickup')}
          disabled={loadingAction !== null}
        >
          {loadingAction === 'confirm-pickup' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>XÁC NHẬN ĐI LẤY HÀNG</Text>}
        </TouchableOpacity>
      )
    }
    if (delivery.status === 'PICKING_UP') {
      return (
        <TouchableOpacity style={styles.primaryBtn} onPress={() => handleAction('start')} disabled={loadingAction !== null}>
          {loadingAction === 'start' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>ĐÃ LẤY HÀNG - BẮT ĐẦU GIAO</Text>}
        </TouchableOpacity>
      )
    }
    if (delivery.status === 'IN_TRANSIT') {
      return (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.primaryBtn, { flex: 1, backgroundColor: colors.success, marginRight: 8 }]}
            onPress={() => {
              Alert.alert('Xác nhận giao thành công', 'Bạn đã giao hàng và thu tiền đầy đủ?', [
                { text: 'Đóng', style: 'cancel' },
                { text: 'Xác nhận ĐÃ GIAO', onPress: () => handleAction('complete') },
              ])
            }}
            disabled={loadingAction !== null}
          >
            {loadingAction === 'complete' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>GIAO THÀNH CÔNG</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, { flex: 1, backgroundColor: colors.danger, marginLeft: 8 }]}
            onPress={() => setFailModalVisible(true)}
            disabled={loadingAction !== null}
          >
            {loadingAction === 'fail' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>GIAO THẤT BẠI</Text>}
          </TouchableOpacity>
        </View>
      )
    }
    return null
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      
      {/* VTP Style Header */}
      <LinearGradient colors={colors.gradientRed} style={styles.header}>
        <SafeAreaView>
          <View style={styles.headerTop}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={colors.surface} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Chi Tiết Vận Đơn</Text>
            {delivery.status === 'IN_TRANSIT' ? (
              <TouchableOpacity
                style={styles.exceptionBtn}
                onPress={() => navigation.navigate('Exception', { deliveryId })}
              >
                <Ionicons name="warning" size={22} color={colors.surface} />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.orderIdLabel}>Mã vận đơn</Text>
              <Text style={styles.orderId}>#{delivery.ma_don_hang?.slice(0, 8).toUpperCase()}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: deliveryStatusColors[delivery.status] || colors.border }]}>
              <Text style={styles.statusText}>{deliveryStatusLabels[delivery.status] || delivery.status}</Text>
            </View>
          </View>
          {renderStepper()}
        </View>

        {/* Address & Navigation */}
        <View style={styles.card}>
          <View style={styles.cardSectionHeader}>
            <Ionicons name="map" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Hành trình</Text>
          </View>
          
          <View style={styles.addressContainer}>
            <View style={styles.addressRow}>
              <View style={[styles.addressIconWrap, { backgroundColor: '#F3F4F6' }]}>
                <Ionicons name="storefront" size={16} color={colors.textSecondary} />
              </View>
              <View style={styles.addressContent}>
                <Text style={styles.addressLabel}>Điểm lấy hàng</Text>
                <Text style={styles.addressValue}>Cửa hàng Avengers Coffee</Text>
              </View>
            </View>
            <View style={styles.addressLine} />
            <View style={styles.addressRow}>
              <View style={[styles.addressIconWrap, { backgroundColor: colors.primaryBg }]}>
                <Ionicons name="location" size={16} color={colors.primary} />
              </View>
              <View style={styles.addressContent}>
                <Text style={styles.addressLabel}>Điểm giao hàng</Text>
                <Text style={styles.addressValue}>{delivery.delivery_address || 'Chưa cập nhật'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.mapActionsRow}>
            <TouchableOpacity
              style={[styles.actionChip, { flex: 1, marginRight: 8, backgroundColor: colors.bg }]}
              onPress={() => navigation.navigate('Map', { delivery })}
            >
              <Ionicons name="map-outline" size={18} color={colors.text} />
              <Text style={[styles.actionChipText, { color: colors.text }]}>Xem bản đồ</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionChip, { flex: 1, backgroundColor: colors.successBg, borderWidth: 1, borderColor: colors.success + '40' }]}
              onPress={() => openNavigation(delivery.delivery_address)}
            >
              <Ionicons name="navigate" size={18} color={colors.success} />
              <Text style={[styles.actionChipText, { color: colors.success }]}>Chỉ đường</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Customer Info */}
        {(delivery.customer_name || delivery.customer_phone) && (
          <View style={styles.card}>
            <View style={styles.cardSectionHeader}>
              <Ionicons name="person" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Người nhận</Text>
            </View>
            
            <View style={styles.customerRow}>
              <View style={styles.customerInfo}>
                <Text style={styles.customerName}>{delivery.customer_name || 'Khách hàng'}</Text>
                {delivery.customer_phone && (
                  <Text style={styles.customerPhone}>{delivery.customer_phone}</Text>
                )}
              </View>
              {delivery.customer_phone && (
                <TouchableOpacity
                  style={styles.callBtn}
                  onPress={() => callCustomer(delivery.customer_phone)}
                >
                  <Ionicons name="call" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* COD Info */}
        <View style={styles.card}>
          <View style={styles.cardSectionHeader}>
            <Ionicons name="cash" size={18} color={colors.primary} />
            <Text style={styles.sectionTitle}>Thông tin thu hộ</Text>
          </View>

          <View style={styles.feeRow}>
            <Text style={styles.feeLabel}>Phí vận chuyển (bạn nhận)</Text>
            <Text style={styles.feeValue}>{formatCurrency(delivery.delivery_fee || 15000)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.feeRow}>
            <Text style={styles.codLabel}>Tiền cần thu khách (COD)</Text>
            <Text style={styles.codValue}>{formatCurrency(delivery.cod_amount || 0)}</Text>
          </View>
        </View>

        {/* Notes */}
        {delivery.delivery_note && (
          <View style={styles.card}>
            <View style={styles.cardSectionHeader}>
              <Ionicons name="document-text" size={18} color={colors.primary} />
              <Text style={styles.sectionTitle}>Ghi chú đơn hàng</Text>
            </View>
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>{delivery.delivery_note}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom Actions */}
      {renderActionButtons() && (
        <View style={styles.footer}>
          {renderActionButtons()}
        </View>
      )}

      {/* Fail Reason Modal */}
      <Modal visible={failModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
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
                  <Text style={styles.btnText}>XÁC NHẬN THẤT BẠI</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.surface, letterSpacing: 0.5 },
  exceptionBtn: { padding: spacing.sm, width: 40, alignItems: 'center' },

  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl * 2 },
  
  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: 8 },
  sectionTitle: { ...typography.h4, color: colors.text, fontSize: 16 },
  
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
  orderIdLabel: { fontSize: 12, color: colors.muted, marginBottom: 2 },
  orderId: { ...typography.h3, color: colors.text, fontSize: 20 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm },
  statusText: { color: colors.surface, fontSize: 12, fontWeight: '800' },
  
  // Stepper
  stepperContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepItem: { alignItems: 'center', width: 60 },
  stepIconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.borderLight,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xs,
  },
  stepCurrent: { borderWidth: 2, borderColor: colors.primaryLight, ...shadows.primary },
  stepLabel: { fontSize: 10, color: colors.muted, textAlign: 'center', fontWeight: '600' },
  stepLabelActive: { color: colors.primary, fontWeight: '800' },
  stepLine: { flex: 1, height: 2, backgroundColor: colors.borderLight, marginHorizontal: -8, marginTop: -15 },
  
  // Address
  addressContainer: { marginBottom: spacing.md },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start' },
  addressIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  addressContent: { marginLeft: spacing.md, flex: 1 },
  addressLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  addressValue: { ...typography.bodyBold, color: colors.text, marginTop: 2 },
  addressLine: { width: 2, height: 24, backgroundColor: colors.border, marginLeft: 13, marginVertical: 4 },
  
  mapActionsRow: { flexDirection: 'row', marginTop: spacing.sm },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: radius.md, gap: 6,
  },
  actionChipText: { fontWeight: '800', fontSize: 13 },
  
  // Customer
  customerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, padding: spacing.md, borderRadius: radius.md },
  customerInfo: { flex: 1 },
  customerName: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  customerPhone: { ...typography.caption, color: colors.textSecondary, marginTop: 4, fontSize: 14 },
  callBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center', ...shadows.success,
  },
  
  // Fees
  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.xs },
  feeLabel: { color: colors.textSecondary, fontSize: 14 },
  feeValue: { color: colors.success, fontWeight: '800', fontSize: 16 },
  codLabel: { color: colors.text, fontWeight: '800', fontSize: 14 },
  codValue: { color: colors.danger, fontWeight: '900', fontSize: 20 },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.md, borderStyle: 'dashed' },
  
  noteBox: { backgroundColor: colors.bg, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderLight },
  noteText: { color: colors.textSecondary, fontStyle: 'italic', fontSize: 14, lineHeight: 20 },
  
  // Footer
  footer: { padding: spacing.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.borderLight, ...shadows.lg },
  primaryBtn: {
    backgroundColor: colors.primary, height: 54, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', ...shadows.primary,
  },
  primaryBtnDisabled: { opacity: 0.5 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  btnText: { color: colors.surface, fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  modalTitle: { ...typography.h3, color: colors.text, fontSize: 18 },
  modalDesc: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md, fontSize: 13 },
  modalInput: {
    backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md, ...typography.body,
    color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 120, marginBottom: spacing.lg,
  },
  modalActions: { flexDirection: 'row' },
  modalBtn: { flex: 1, height: 50, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  modalBtnConfirm: { backgroundColor: colors.danger, ...shadows.primary },
})
