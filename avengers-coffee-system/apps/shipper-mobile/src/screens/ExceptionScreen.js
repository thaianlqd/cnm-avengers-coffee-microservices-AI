import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native'
import { useMutation } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'

const EXCEPTION_TYPES = [
  { id: 'CUSTOMER_UNREACHABLE', label: 'Không liên hệ được khách', icon: 'call-outline', color: '#F59E0B' },
  { id: 'WRONG_ADDRESS', label: 'Sai địa chỉ giao hàng', icon: 'location-outline', color: '#EF4444' },
  { id: 'ITEM_DAMAGED', label: 'Hàng hóa bị hỏng/vỡ', icon: 'alert-circle-outline', color: '#DC2626' },
  { id: 'VEHICLE_ISSUE', label: 'Sự cố phương tiện', icon: 'bicycle-outline', color: '#6366F1' },
  { id: 'OTHER', label: 'Lý do khác', icon: 'ellipsis-horizontal-outline', color: '#6B7280' },
]

export function ExceptionScreen({ route, navigation }) {
  const { deliveryId } = route?.params || {}
  const { shipper } = useShipper()
  const [selectedType, setSelectedType] = useState(null)
  const [description, setDescription] = useState('')

  const reportMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/shippers/${shipper.id}/exceptions`, {
        delivery_id: deliveryId || null,
        exception_type: selectedType,
        description: description.trim(),
      }),
    onSuccess: () => {
      Alert.alert(
        '✅ Báo cáo thành công',
        'Chúng tôi đã nhận được báo cáo của bạn. Quản lý sẽ xem xét và phản hồi sớm nhất.',
        [{ text: 'Đóng', onPress: () => navigation.goBack() }]
      )
    },
    onError: (err) =>
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể gửi báo cáo. Thử lại sau.'),
  })

  const handleSubmit = () => {
    if (!selectedType) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn loại sự cố')
      return
    }
    if (!description.trim() || description.trim().length < 10) {
      Alert.alert('Mô tả quá ngắn', 'Vui lòng mô tả sự cố chi tiết hơn (ít nhất 10 ký tự)')
      return
    }

    Alert.alert(
      'Xác nhận gửi báo cáo',
      `Bạn sẽ báo cáo sự cố: "${EXCEPTION_TYPES.find((t) => t.id === selectedType)?.label}"`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Gửi báo cáo', onPress: () => reportMutation.mutate() },
      ]
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Báo cáo sự cố</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Alert Banner */}
        <View style={styles.alertBanner}>
          <Ionicons name="warning" size={20} color="#D97706" />
          <Text style={styles.alertText}>
            Vui lòng chỉ báo cáo khi gặp sự cố thật sự. Báo cáo không chính xác sẽ ảnh hưởng đến điểm uy tín của bạn.
          </Text>
        </View>

        {/* Delivery ID Info */}
        {deliveryId && (
          <View style={styles.infoCard}>
            <Ionicons name="receipt-outline" size={16} color={colors.primary} />
            <Text style={styles.infoText}>Liên quan đến đơn: #{deliveryId.slice(0, 8).toUpperCase()}</Text>
          </View>
        )}

        {/* Exception Type Selection */}
        <Text style={styles.sectionLabel}>Loại sự cố *</Text>
        <View style={styles.typeGrid}>
          {EXCEPTION_TYPES.map((type) => {
            const isSelected = selectedType === type.id
            return (
              <TouchableOpacity
                key={type.id}
                style={[
                  styles.typeCard,
                  isSelected && { borderColor: type.color, backgroundColor: type.color + '15' },
                ]}
                onPress={() => setSelectedType(type.id)}
              >
                <View style={[styles.typeIcon, { backgroundColor: type.color + '20' }]}>
                  <Ionicons name={type.icon} size={24} color={type.color} />
                </View>
                <Text style={[styles.typeLabel, isSelected && { color: type.color }]}>{type.label}</Text>
                {isSelected && (
                  <View style={[styles.checkMark, { backgroundColor: type.color }]}>
                    <Ionicons name="checkmark" size={12} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Description */}
        <Text style={styles.sectionLabel}>Mô tả chi tiết *</Text>
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={5}
          placeholder="Mô tả cụ thể sự cố bạn đang gặp phải... (tối thiểu 10 ký tự)"
          placeholderTextColor={colors.muted}
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
        />
        <Text style={styles.charCount}>{description.length} ký tự</Text>

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (!selectedType || !description.trim() || reportMutation.isPending) && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!selectedType || !description.trim() || reportMutation.isPending}
        >
          {reportMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send-outline" size={20} color="#fff" />
              <Text style={styles.submitBtnText}>Gửi báo cáo sự cố</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surface,
    ...shadows.xs,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { ...typography.h4, color: colors.text },
  body: { padding: spacing.md, paddingBottom: spacing.xxl * 2 },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    gap: spacing.sm,
  },
  alertText: { flex: 1, color: '#92400E', fontSize: 13, lineHeight: 18 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoBg,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  infoText: { color: colors.info, fontSize: 13, fontWeight: '600' },
  sectionLabel: { ...typography.bodyBold, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  typeCard: {
    width: '47%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.borderLight,
    alignItems: 'center',
    position: 'relative',
    ...shadows.xs,
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  typeLabel: { ...typography.caption, color: colors.text, textAlign: 'center', fontWeight: '600', lineHeight: 18 },
  checkMark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textArea: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 120,
    marginBottom: 4,
  },
  charCount: { ...typography.caption, color: colors.muted, textAlign: 'right', marginBottom: spacing.lg },
  submitBtn: {
    backgroundColor: colors.danger,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
    ...shadows.sm,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
})
