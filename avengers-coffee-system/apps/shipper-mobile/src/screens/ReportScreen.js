import React, { useState } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, RefreshControl, ActivityIndicator,
} from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency, formatDateTime } from '../lib/shipperData'

const RANGE_OPTIONS = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: '7 ngày' },
  { id: 'month', label: 'Tháng này' },
]

function StatCard({ icon, label, value, color = colors.primary, bg }) {
  return (
    <View style={[statStyles.card, bg ? { backgroundColor: bg } : {}]}>
      <View style={[statStyles.iconWrap, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
    </View>
  )
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'center', ...shadows.sm,
    minWidth: 130, margin: spacing.xs,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xs },
  value: { ...typography.h4, fontWeight: '900', textAlign: 'center' },
})

export function ReportScreen({ navigation }) {
  const { shipper } = useShipper()
  const [range, setRange] = useState('today')

  const { data: report, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['shipperReport', shipper?.id, range],
    queryFn: async () => {
      if (!shipper?.id) return null
      try {
        const res = await apiClient.get(`/shippers/${shipper.id}/report?range=${range}`)
        return res
      } catch {
        // Fallback: use stats endpoint if report doesn't exist
        const stats = await apiClient.get(`/shippers/${shipper.id}/stats`)
        return {
          total_orders: stats?.total_deliveries || 0,
          completed: stats?.completed_today || 0,
          failed: 0,
          total_income: (stats?.completed_today || 0) * 15000,
          cod_collected: 0,
          cod_remitted: 0,
          avg_delivery_time: 0,
          rating: stats?.rating || 0,
          shifts: [],
        }
      }
    },
    enabled: !!shipper?.id,
  })

  const { data: deliveries, isLoading: deliveriesLoading, refetch: refetchDeliveries } = useQuery({
    queryKey: ['deliveriesHistory', shipper?.id, range],
    queryFn: async () => {
      if (!shipper?.id) return []
      const res = await apiClient.get(`/shippers/${shipper.id}/deliveries?range=${range}&limit=20`)
      return Array.isArray(res) ? res : res?.items || []
    },
    enabled: !!shipper?.id,
  })

  const handleRefresh = () => {
    refetch()
    refetchDeliveries()
  }

  const completedCount = report?.completed || 0
  const failedCount = report?.failed || 0
  const totalIncome = report?.total_income || completedCount * 15000
  const successRate = (completedCount + failedCount) > 0
    ? Math.round(completedCount / (completedCount + failedCount) * 100)
    : 100

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Đối soát thu nhập</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.backBtn}>
          <Ionicons name="refresh-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Range Picker */}
      <View style={styles.rangePicker}>
        {RANGE_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.rangeBtn, range === opt.id && styles.rangeBtnActive]}
            onPress={() => setRange(opt.id)}
          >
            <Text style={[styles.rangeBtnText, range === opt.id && styles.rangeBtnTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isLoading || isRefetching} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* Income Card */}
        <LinearGradient colors={[colors.primary, '#1d4ed8']} style={styles.incomeCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.incomeLabel}>Thu nhập {RANGE_OPTIONS.find(o => o.id === range)?.label}</Text>
          <Text style={styles.incomeValue}>{formatCurrency(totalIncome)}</Text>
          <View style={styles.incomeRow}>
            <View style={styles.incomeItem}>
              <Text style={styles.incomeItemLabel}>Đơn hoàn thành</Text>
              <Text style={styles.incomeItemValue}>{completedCount}</Text>
            </View>
            <View style={styles.incomeDivider} />
            <View style={styles.incomeItem}>
              <Text style={styles.incomeItemLabel}>Tỉ lệ thành công</Text>
              <Text style={styles.incomeItemValue}>{successRate}%</Text>
            </View>
            <View style={styles.incomeDivider} />
            <View style={styles.incomeItem}>
              <Text style={styles.incomeItemLabel}>Đánh giá TB</Text>
              <Text style={styles.incomeItemValue}>⭐ {Number(report?.rating || shipper?.rating || 0).toFixed(1)}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Stats Grid */}
        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
        ) : (
          <View style={styles.statsGrid}>
            <StatCard icon="checkmark-circle" label="Hoàn thành" value={String(completedCount)} color={colors.success} />
            <StatCard icon="close-circle" label="Thất bại" value={String(failedCount)} color={colors.danger} />
            <StatCard icon="cash" label="Thu hộ COD" value={formatCurrency(report?.cod_collected || 0)} color={colors.warning} />
            <StatCard icon="time" label="TG giao TB" value={`${report?.avg_delivery_time || 0} phút`} color={colors.info} />
          </View>
        )}

        {/* COD Section */}
        {(report?.cod_collected > 0 || report?.cod_remitted >= 0) && (
          <View style={styles.codSection}>
            <Text style={styles.sectionTitle}>💰 Đối soát COD</Text>
            <View style={styles.codRow}>
              <View style={styles.codItem}>
                <Text style={styles.codLabel}>Đã thu hộ khách</Text>
                <Text style={[styles.codValue, { color: colors.danger }]}>{formatCurrency(report?.cod_collected || 0)}</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.muted} />
              <View style={styles.codItem}>
                <Text style={styles.codLabel}>Đã nộp cửa hàng</Text>
                <Text style={[styles.codValue, { color: colors.success }]}>{formatCurrency(report?.cod_remitted || 0)}</Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={colors.muted} />
              <View style={styles.codItem}>
                <Text style={styles.codLabel}>Còn phải nộp</Text>
                <Text style={[styles.codValue, { color: colors.warning }]}>
                  {formatCurrency(Math.max(0, (report?.cod_collected || 0) - (report?.cod_remitted || 0)))}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Delivery History */}
        <View style={styles.historySection}>
          <Text style={styles.sectionTitle}>📋 Chi tiết đơn giao ({deliveries?.length || 0})</Text>
          {deliveriesLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : deliveries?.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>Chưa có đơn nào trong khoảng thời gian này</Text>
            </View>
          ) : (
            deliveries.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.deliveryItem}
                onPress={() => navigation.navigate('OrderDetail', { deliveryId: item.id })}
              >
                <View style={[styles.statusDot, {
                  backgroundColor: item.status === 'DELIVERED' ? colors.success
                    : item.status === 'FAILED' ? colors.danger
                    : item.status === 'IN_TRANSIT' ? colors.primary
                    : colors.warning,
                }]} />
                <View style={styles.deliveryInfo}>
                  <Text style={styles.deliveryId}>#{(item.ma_don_hang || item.id || '').slice(0, 8).toUpperCase()}</Text>
                  <Text style={styles.deliveryAddr} numberOfLines={1}>{item.delivery_address || '—'}</Text>
                  <Text style={styles.deliveryTime}>{formatDateTime(item.delivered_at || item.updated_at)}</Text>
                </View>
                <View style={styles.deliveryRight}>
                  <Text style={[styles.deliveryFee, { color: item.status === 'DELIVERED' ? colors.success : colors.muted }]}>
                    {item.status === 'DELIVERED' ? `+${formatCurrency(item.delivery_fee || 15000)}` : '—'}
                  </Text>
                  <View style={[styles.deliveryStatus, {
                    backgroundColor: item.status === 'DELIVERED' ? colors.successBg
                      : item.status === 'FAILED' ? colors.dangerBg
                      : colors.infoBg,
                  }]}>
                    <Text style={[styles.deliveryStatusText, {
                      color: item.status === 'DELIVERED' ? colors.success
                        : item.status === 'FAILED' ? colors.danger
                        : colors.info,
                    }]}>
                      {item.status === 'DELIVERED' ? 'Thành công'
                        : item.status === 'FAILED' ? 'Thất bại'
                        : item.status === 'IN_TRANSIT' ? 'Đang giao'
                        : 'Đang xử lý'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, backgroundColor: colors.surface, ...shadows.xs,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { ...typography.h4, color: colors.text },
  rangePicker: {
    flexDirection: 'row', backgroundColor: colors.surface,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  rangeBtn: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
    alignItems: 'center', marginHorizontal: 4,
  },
  rangeBtnActive: { backgroundColor: colors.primary },
  rangeBtnText: { ...typography.label, color: colors.textSecondary },
  rangeBtnTextActive: { color: colors.surface, fontWeight: '700' },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  incomeCard: {
    borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.primary,
  },
  incomeLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: spacing.xs },
  incomeValue: { color: colors.surface, fontSize: 36, fontWeight: '900', marginBottom: spacing.lg },
  incomeRow: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  incomeItem: { flex: 1, alignItems: 'center' },
  incomeItemLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 4 },
  incomeItemValue: { color: colors.surface, fontSize: 16, fontWeight: '800' },
  incomeDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs, marginBottom: spacing.md },
  codSection: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.lg, ...shadows.sm,
  },
  sectionTitle: { ...typography.h4, color: colors.text, marginBottom: spacing.md },
  codRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  codItem: { flex: 1, alignItems: 'center' },
  codLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginBottom: 4 },
  codValue: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  historySection: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
  },
  deliveryItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.md, flexShrink: 0 },
  deliveryInfo: { flex: 1 },
  deliveryId: { ...typography.label, color: colors.text, fontWeight: '800' },
  deliveryAddr: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  deliveryTime: { ...typography.caption, color: colors.muted, marginTop: 2 },
  deliveryRight: { alignItems: 'flex-end', gap: 4 },
  deliveryFee: { fontSize: 15, fontWeight: '800' },
  deliveryStatus: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  deliveryStatusText: { fontSize: 11, fontWeight: '700' },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyText: { ...typography.body, color: colors.muted, marginTop: spacing.md, textAlign: 'center' },
})
