import React from 'react'
import { View, Text, StyleSheet, FlatList, SafeAreaView, RefreshControl, TouchableOpacity } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency, formatDateTime } from '../lib/shipperData'

export function HistoryScreen({ navigation }) {
  const { shipper } = useShipper()

  const { data: deliveries, isLoading, refetch } = useQuery({
    queryKey: ['deliveriesHistory', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return []
      // Get all DELIVERED and FAILED
      const res = await apiClient.get(`/shippers/${shipper.id}/deliveries`)
      return res.filter(d => d.status === 'DELIVERED' || d.status === 'FAILED')
    },
    enabled: !!shipper?.id,
  })

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => navigation.navigate('OrderDetail', { deliveryId: item.id })}
    >
      <View style={styles.cardHeader}>
        <View style={styles.orderIdBadge}>
          <Text style={styles.orderIdText}>#{item.ma_don_hang?.slice(0, 8).toUpperCase()}</Text>
        </View>
        <Text style={styles.timeText}>{formatDateTime(item.delivered_at || item.updated_at)}</Text>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.addressText} numberOfLines={2}>
          Đến: {item.delivery_address || 'Chưa cập nhật địa chỉ'}
        </Text>
      </View>

      <View style={styles.cardFooter}>
        <View style={[styles.statusBadge, { backgroundColor: item.status === 'DELIVERED' ? colors.successBg : colors.dangerBg }]}>
          <Text style={[styles.statusText, { color: item.status === 'DELIVERED' ? colors.success : colors.danger }]}>
            {item.status === 'DELIVERED' ? 'Thành công' : 'Thất bại'}
          </Text>
        </View>
        <Text style={styles.feeValue}>+{formatCurrency(item.delivery_fee || 15000)}</Text>
      </View>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Lịch sử giao hàng</Text>
      </View>

      <FlatList
        data={deliveries}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>Chưa có lịch sử</Text>
            <Text style={styles.emptyDesc}>Các đơn hàng đã hoàn thành hoặc thất bại sẽ hiển thị tại đây.</Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  header: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    ...shadows.xs,
    zIndex: 10,
  },
  headerTitle: { ...typography.h3, color: colors.text },
  listContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  orderIdBadge: {
    backgroundColor: colors.borderLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  orderIdText: { color: colors.textSecondary, fontWeight: 'bold', fontSize: 12 },
  timeText: { color: colors.muted, fontSize: 12 },
  cardBody: { marginBottom: spacing.md },
  addressText: { ...typography.body, color: colors.text },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusText: { fontWeight: 'bold', fontSize: 12 },
  feeValue: { color: colors.text, fontWeight: 'bold' },
  
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyTitle: { ...typography.h4, color: colors.textSecondary, marginTop: spacing.md },
  emptyDesc: { ...typography.body, color: colors.muted, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.xl },
})
