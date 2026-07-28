import React, { useState, useMemo } from 'react'
import { View, Text, StyleSheet, FlatList, SafeAreaView, RefreshControl, TouchableOpacity, ScrollView, Platform } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency, formatDateTime } from '../lib/shipperData'
import AsyncStorage from '@react-native-async-storage/async-storage'

const FILTER_OPTIONS = [
  { id: '7_DAYS', label: '7 Ngày' },
  { id: '30_DAYS', label: '30 Ngày' },
  { id: '3_MONTHS', label: '3 Tháng' },
  { id: 'ALL', label: 'Tất cả' },
]

export function HistoryScreen({ navigation }) {
  const { shipper } = useShipper()
  const [filterType, setFilterType] = useState('7_DAYS')

  const { data: rawDeliveries, isLoading, refetch } = useQuery({
    queryKey: ['deliveriesHistory', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return []
      const res = await apiClient.get(`/shippers/${shipper.id}/deliveries`)
      return res.filter(d => d.status === 'DELIVERED' || d.status === 'FAILED')
    },
    enabled: !!shipper?.id,
  })

  const [localBatchedMap, setLocalBatchedMap] = useState({})

  React.useEffect(() => {
    // Tải map các đơn ghép từ máy (fallback nếu server chưa được restart)
    AsyncStorage.getItem('localBatchedMap').then(res => {
      if (res) {
        setLocalBatchedMap(JSON.parse(res))
      }
    }).catch(() => {})
  }, [rawDeliveries]) // Chạy lại mỗi khi data thay đổi để sync UI

  const deliveries = useMemo(() => {
    if (!rawDeliveries) return []
    const now = new Date().getTime()
    return rawDeliveries.filter(d => {
      const dTime = new Date(d.delivered_at || d.updated_at).getTime()
      const diffDays = (now - dTime) / (1000 * 3600 * 24)
      if (filterType === '7_DAYS') return diffDays <= 7
      if (filterType === '30_DAYS') return diffDays <= 30
      if (filterType === '3_MONTHS') return diffDays <= 90
      return true
    }).sort((a, b) => new Date(b.delivered_at || b.updated_at).getTime() - new Date(a.delivered_at || a.updated_at).getTime())
  }, [rawDeliveries, filterType])

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => navigation.navigate('OrderDetail', { deliveryId: item.id })}
    >
      <View style={styles.cardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={styles.orderIdBadge}>
            <Text style={styles.orderIdText}>#{item.ma_don_hang?.slice(0, 8).toUpperCase()}</Text>
          </View>
          {item.is_batched || item.delivery_note?.includes('[BATCHED]') || localBatchedMap[item.id] || localBatchedMap[item.ma_don_hang] ? (
            <View style={[styles.typeBadge, { backgroundColor: '#E0F2FE', borderColor: '#38BDF8' }]}>
              <Text style={[styles.typeBadgeText, { color: '#0369A1' }]}>📦 Đơn Ghép AI</Text>
            </View>
          ) : (
            <View style={[styles.typeBadge, { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' }]}>
              <Text style={[styles.typeBadgeText, { color: '#4B5563' }]}>🛵 Đơn Lẻ</Text>
            </View>
          )}
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
        
        {/* Filters */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {FILTER_OPTIONS.map(opt => {
              const isActive = filterType === opt.id
              return (
                <TouchableOpacity
                  key={opt.id}
                  style={[styles.filterBtn, isActive && styles.filterBtnActive]}
                  onPress={() => setFilterType(opt.id)}
                >
                  <Text style={[styles.filterBtnText, isActive && styles.filterBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
          <TouchableOpacity style={styles.datePickerBtn}>
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>
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
            <Text style={styles.emptyDesc}>
              Không có đơn hàng nào hoàn thành trong khoảng thời gian này.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingTop: spacing.lg,
    backgroundColor: colors.surface,
    ...shadows.xs,
    zIndex: 10,
  },
  headerTitle: { ...typography.h3, color: colors.text, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  filterScroll: { paddingHorizontal: spacing.xs, alignItems: 'center', gap: spacing.xs },
  filterBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterBtnActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#6366F1',
  },
  filterBtnText: { color: '#6B7280', fontWeight: '600', fontSize: 13 },
  filterBtnTextActive: { color: '#4F46E5' },
  
  datePickerBtn: {
    padding: 8,
    marginLeft: spacing.sm,
    backgroundColor: '#EEF2FF',
    borderRadius: radius.md,
  },

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
  
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  typeBadgeText: { fontWeight: 'bold', fontSize: 11 },

  timeText: { color: colors.muted, fontSize: 11 },
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
