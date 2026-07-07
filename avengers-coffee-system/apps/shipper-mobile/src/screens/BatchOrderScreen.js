import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency } from '../lib/shipperData'

export function BatchOrderScreen({ navigation }) {
  const { shipper } = useShipper()
  const queryClient = useQueryClient()
  const [accepting, setAccepting] = useState(null)

  const { data: batches = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['batch-orders', shipper?.id],
    queryFn: async () => {
      const result = await apiClient.get(`/shippers/${shipper.id}/batch-orders`)
      return Array.isArray(result) ? result : result?.batches || result?.data || []
    },
    enabled: !!shipper?.id,
    refetchInterval: 15000,
  })

  const acceptBatchMutation = useMutation({
    mutationFn: (batchId) =>
      apiClient.post(`/shippers/${shipper.id}/batch-orders/${batchId}/accept`),
    onSuccess: (_, batchId) => {
      setAccepting(null)
      queryClient.invalidateQueries(['batch-orders', shipper?.id])
      queryClient.invalidateQueries(['deliveries', shipper?.id])
      Alert.alert(
        '✅ Nhận đơn ghép thành công!',
        'Tất cả đơn trong nhóm này đã được phân công cho bạn.',
        [{ text: 'Xem đơn', onPress: () => navigation.navigate('Home') }]
      )
    },
    onError: (err) => {
      setAccepting(null)
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể nhận đơn ghép. Thử lại sau.')
    },
  })

  const handleAcceptBatch = (batch) => {
    const totalFee = batch.deliveries?.reduce((sum, d) => sum + (d.delivery_fee || 0), 0) || 0
    Alert.alert(
      '📦 Nhận đơn ghép tuyến',
      `Bạn sẽ nhận ${batch.deliveries?.length || 0} đơn với tổng phí ship: ${formatCurrency(totalFee)}\n\nKhu vực: ${batch.zone_label || 'Cùng khu vực'}`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Nhận tất cả',
          onPress: () => {
            setAccepting(batch.id)
            acceptBatchMutation.mutate(batch.id)
          },
        },
      ]
    )
  }

  const renderBatchCard = ({ item: batch }) => {
    const deliveries = batch.deliveries || []
    const totalFee = deliveries.reduce((sum, d) => sum + (Number(d.delivery_fee) || 0), 0)
    const totalDistance = Number(batch.total_distance_km || 0).toFixed(1)
    const isAccepting = accepting === batch.id

    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.batchBadge}>
            <Ionicons name="layers-outline" size={16} color={colors.primary} />
            <Text style={styles.batchBadgeText}>Ghép {deliveries.length} đơn</Text>
          </View>
          <View style={styles.zoneBadge}>
            <Ionicons name="location-outline" size={14} color={colors.success} />
            <Text style={styles.zoneText}>{batch.zone_label || 'Cùng khu vực'}</Text>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatCurrency(totalFee)}</Text>
            <Text style={styles.statLabel}>Tổng phí ship</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{totalDistance} km</Text>
            <Text style={styles.statLabel}>Quãng đường</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{batch.estimated_time || '~30'} phút</Text>
            <Text style={styles.statLabel}>Ước tính</Text>
          </View>
        </View>

        {/* Deliveries List */}
        <View style={styles.deliveriesContainer}>
          {deliveries.slice(0, 3).map((d, idx) => (
            <View key={d.id || idx} style={styles.deliveryItem}>
              <View style={styles.deliveryDot}>
                <Text style={styles.deliveryDotText}>{idx + 1}</Text>
              </View>
              <View style={styles.deliveryContent}>
                <Text style={styles.deliveryOrderId}>#{String(d.ma_don_hang || d.id || '').slice(0, 8).toUpperCase()}</Text>
                <Text style={styles.deliveryAddress} numberOfLines={1}>
                  {d.delivery_address || 'Địa chỉ đang cập nhật'}
                </Text>
              </View>
              <Text style={styles.deliveryFee}>{formatCurrency(d.delivery_fee || 0)}</Text>
            </View>
          ))}
          {deliveries.length > 3 && (
            <Text style={styles.moreItems}>+{deliveries.length - 3} đơn khác...</Text>
          )}
        </View>

        {/* Accept Button */}
        <TouchableOpacity
          style={[styles.acceptBtn, isAccepting && styles.acceptBtnDisabled]}
          onPress={() => handleAcceptBatch(batch)}
          disabled={isAccepting}
        >
          {isAccepting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.acceptBtnText}>Nhận tất cả {deliveries.length} đơn</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Đơn ghép tuyến</Text>
          {batches.length > 0 && (
            <Text style={styles.headerSub}>{batches.length} nhóm đơn khả dụng</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="information-circle-outline" size={18} color={colors.info} />
        <Text style={styles.infoText}>
          Đơn ghép tuyến giúp bạn giao nhiều đơn cùng lúc trong cùng khu vực, tối ưu quãng đường và tăng thu nhập.
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={batches}
          keyExtractor={(item, index) => String(item.id || index)}
          renderItem={renderBatchCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="layers-outline" size={64} color={colors.muted} />
              <Text style={styles.emptyTitle}>Không có đơn ghép nào</Text>
              <Text style={styles.emptyDesc}>
                Hệ thống sẽ tự động ghép đơn khi có nhiều đơn cùng khu vực. Kéo xuống để làm mới.
              </Text>
            </View>
          }
        />
      )}
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
  headerSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.infoBg,
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoText: { flex: 1, color: colors.info, fontSize: 12, lineHeight: 18 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  batchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.infoBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    gap: 4,
  },
  batchBadgeText: { color: colors.primary, fontWeight: 'bold', fontSize: 13 },
  zoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    gap: 4,
  },
  zoneText: { color: colors.success, fontSize: 12, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { ...typography.h4, color: colors.text },
  statLabel: { ...typography.caption, color: colors.muted, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: colors.borderLight },
  deliveriesContainer: { marginBottom: spacing.md },
  deliveryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    gap: spacing.sm,
  },
  deliveryDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  deliveryDotText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  deliveryContent: { flex: 1 },
  deliveryOrderId: { fontSize: 11, fontWeight: 'bold', color: colors.primary },
  deliveryAddress: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  deliveryFee: { color: colors.success, fontWeight: 'bold', fontSize: 13 },
  moreItems: { ...typography.caption, color: colors.muted, textAlign: 'center', paddingVertical: spacing.sm },
  acceptBtn: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  acceptBtnDisabled: { opacity: 0.5 },
  acceptBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyTitle: { ...typography.h4, color: colors.textSecondary, marginTop: spacing.md },
  emptyDesc: {
    ...typography.body,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
})
