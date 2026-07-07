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
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'

const VEHICLE_TYPES = [
  { id: 'MOTORBIKE', label: 'Xe máy', icon: 'bicycle-outline', color: '#10B981' },
  { id: 'CAR', label: 'Ô tô', icon: 'car-outline', color: '#3B82F6' },
  { id: 'BICYCLE', label: 'Xe đạp', icon: 'bicycle-outline', color: '#8B5CF6' },
]

const VEHICLE_CONDITIONS = [
  { id: 'GOOD', label: 'Hoạt động tốt', icon: 'checkmark-circle-outline', color: '#10B981' },
  { id: 'MAINTENANCE', label: 'Cần bảo dưỡng', icon: 'warning-outline', color: '#F59E0B' },
  { id: 'BROKEN', label: 'Đang hỏng', icon: 'alert-circle-outline', color: '#EF4444' },
]

export function VehicleScreen({ navigation }) {
  const { shipper } = useShipper()
  const queryClient = useQueryClient()

  const { data: vehicle, isLoading } = useQuery({
    queryKey: ['shipper-vehicle', shipper?.id],
    queryFn: () => apiClient.get(`/shippers/${shipper.id}/vehicle`),
    enabled: !!shipper?.id,
    select: (res) => res,
  })

  const [vehicleType, setVehicleType] = useState(vehicle?.vehicle_type || 'MOTORBIKE')
  const [vehiclePlate, setVehiclePlate] = useState(vehicle?.vehicle_plate || '')
  const [condition, setCondition] = useState('GOOD')
  const [conditionNote, setConditionNote] = useState('')

  React.useEffect(() => {
    if (vehicle) {
      setVehicleType(vehicle.vehicle_type || 'MOTORBIKE')
      setVehiclePlate(vehicle.vehicle_plate || '')
    }
  }, [vehicle])

  const updateMutation = useMutation({
    mutationFn: () =>
      apiClient.patch(`/shippers/${shipper.id}/vehicle`, {
        vehicle_type: vehicleType,
        vehicle_plate: vehiclePlate.trim().toUpperCase(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['shipper-vehicle', shipper?.id])
      Alert.alert('✅ Cập nhật thành công', 'Thông tin phương tiện đã được lưu.')
    },
    onError: (err) => Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể cập nhật'),
  })

  const reportConditionMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/shippers/${shipper.id}/exceptions`, {
        delivery_id: null,
        exception_type: 'VEHICLE_ISSUE',
        description: `Tình trạng phương tiện: ${VEHICLE_CONDITIONS.find(c => c.id === condition)?.label}. ${conditionNote.trim()}`,
      }),
    onSuccess: () => {
      Alert.alert(
        '✅ Đã báo cáo tình trạng xe',
        'Quản lý sẽ sắp xếp hỗ trợ bảo dưỡng cho bạn.',
        [{ text: 'OK', onPress: () => setConditionNote('') }]
      )
    },
    onError: (err) => Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể gửi báo cáo'),
  })

  const handleReportCondition = () => {
    if (condition === 'GOOD') {
      Alert.alert('Thông báo', 'Xe đang hoạt động tốt, không cần báo cáo.')
      return
    }
    if (!conditionNote.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng mô tả tình trạng xe cụ thể hơn.')
      return
    }
    Alert.alert('Xác nhận', 'Gửi báo cáo tình trạng xe đến Quản lý?', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Gửi', onPress: () => reportConditionMutation.mutate() },
    ])
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Thông tin phương tiện</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {/* Vehicle Type */}
        <Text style={styles.sectionLabel}>Loại phương tiện</Text>
        <View style={styles.optionRow}>
          {VEHICLE_TYPES.map((vt) => {
            const isSelected = vehicleType === vt.id
            return (
              <TouchableOpacity
                key={vt.id}
                style={[styles.optionCard, isSelected && { borderColor: vt.color, backgroundColor: vt.color + '15' }]}
                onPress={() => setVehicleType(vt.id)}
              >
                <Ionicons name={vt.icon} size={28} color={isSelected ? vt.color : colors.muted} />
                <Text style={[styles.optionLabel, isSelected && { color: vt.color }]}>{vt.label}</Text>
                {isSelected && <Ionicons name="checkmark-circle" size={18} color={vt.color} style={styles.optionCheck} />}
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Plate */}
        <Text style={styles.sectionLabel}>Biển số xe</Text>
        <View style={styles.inputWrap}>
          <Ionicons name="card-outline" size={20} color={colors.muted} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="VD: 59-B1 234.56"
            placeholderTextColor={colors.muted}
            value={vehiclePlate}
            onChangeText={setVehiclePlate}
            autoCapitalize="characters"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, updateMutation.isPending && styles.saveBtnDisabled]}
          onPress={() => updateMutation.mutate()}
          disabled={updateMutation.isPending}
        >
          {updateMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Lưu thông tin xe</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Condition Report */}
        <Text style={styles.sectionHeader}>Báo cáo tình trạng xe</Text>
        <Text style={styles.sectionDesc}>
          Nếu xe có vấn đề, hãy báo cáo để Quản lý sắp xếp hỗ trợ kịp thời.
        </Text>
        <View style={styles.conditionRow}>
          {VEHICLE_CONDITIONS.map((c) => {
            const isSelected = condition === c.id
            return (
              <TouchableOpacity
                key={c.id}
                style={[styles.conditionCard, isSelected && { borderColor: c.color, backgroundColor: c.color + '15' }]}
                onPress={() => setCondition(c.id)}
              >
                <Ionicons name={c.icon} size={22} color={isSelected ? c.color : colors.muted} />
                <Text style={[styles.conditionLabel, isSelected && { color: c.color }]}>{c.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {condition !== 'GOOD' && (
          <>
            <Text style={styles.sectionLabel}>Mô tả vấn đề</Text>
            <TextInput
              style={styles.textArea}
              multiline
              placeholder="Mô tả cụ thể vấn đề bạn gặp phải với xe..."
              placeholderTextColor={colors.muted}
              value={conditionNote}
              onChangeText={setConditionNote}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.reportBtn, reportConditionMutation.isPending && styles.saveBtnDisabled]}
              onPress={handleReportCondition}
              disabled={reportConditionMutation.isPending}
            >
              {reportConditionMutation.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="warning-outline" size={18} color="#fff" />
                  <Text style={styles.saveBtnText}>Gửi báo cáo</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  sectionLabel: { ...typography.bodyBold, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.md },
  sectionHeader: { ...typography.h4, color: colors.text, marginBottom: spacing.xs },
  sectionDesc: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 18 },
  optionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  optionCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.borderLight,
    ...shadows.xs,
    position: 'relative',
  },
  optionLabel: { ...typography.caption, color: colors.text, marginTop: 6, fontWeight: '600' },
  optionCheck: { position: 'absolute', top: 6, right: 6 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  inputIcon: { marginRight: spacing.sm },
  input: { flex: 1, ...typography.body, color: colors.text },
  saveBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: spacing.xl },
  conditionRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  conditionCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 2,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  conditionLabel: {
    ...typography.caption,
    color: colors.text,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 11,
  },
  textArea: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...typography.body,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 100,
    marginBottom: spacing.md,
  },
  reportBtn: {
    backgroundColor: colors.warning || '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
})
