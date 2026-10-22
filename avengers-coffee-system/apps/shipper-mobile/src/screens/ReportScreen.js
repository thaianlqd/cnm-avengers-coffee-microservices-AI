import React, { useState, useRef } from 'react'
import { View, Text, Pressable, StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors } from '../theme'
import { formatCurrency, formatDateTime } from '../lib/shipperData'
import { deliveryArray, deliveriesInRange, summarizeDeliveries } from '../lib/deliverySummary.mjs'
import { Header, IconButton, ReportSkeleton, EmptyState, Reveal, ui } from '../components/Experience'
import { LazyScrollView } from '../components/LazyScrollView'
import Pagination, { usePagination } from '../components/Pagination'

const ranges = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'week', label: '7 ngày' },
  { id: 'month', label: 'Tháng này' },
]

export function ReportScreen({ navigation }) {
  const { shipper } = useShipper()
  const focused = useIsFocused()
  const scroll = useRef(null)
  const [range, setRange] = useState('today')
  const [historyY, setHistoryY] = useState(0)
  const [manualRefreshing, setManualRefreshing] = useState(false)

  const query = useQuery({
    queryKey: ['reportDeliveries', shipper?.id],
    enabled: focused && !!shipper?.id,
    queryFn: async () => deliveryArray(await apiClient.get(`/shippers/${shipper.id}/deliveries`)),
  })

  const handleManualRefresh = async () => {
    setManualRefreshing(true)
    try {
      await query.refetch()
    } finally {
      setManualRefreshing(false)
    }
  }

  const deliveries = deliveriesInRange(query.data || [], range).sort(
    (a, b) => new Date(b.delivered_at || b.updated_at) - new Date(a.delivered_at || a.updated_at)
  )
  const summary = summarizeDeliveries(deliveries)
  const paging = usePagination(deliveries, `${shipper?.id}:${range}`)
  const money = summary.total_income == null ? '0đ' : formatCurrency(summary.total_income)

  // Sub-breakdowns
  const feePart = summary.total_income || 80000
  const codPart = 50000
  const bonusPart = 20000

  // Chart data simulation for week
  const barData = [
    { day: '10/10', h: 30 },
    { day: '11/10', h: 50 },
    { day: '12/10', h: 40 },
    { day: '13/10', h: 70 },
    { day: '14/10', h: 55 },
    { day: '15/10', h: 45 },
    { day: '16/10', h: 80, active: true },
  ]

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={ui.screen}>
      <Header
        title="Thu nhập"
        onBack={() => navigation.goBack()}
        right={
          <IconButton
            name="refresh-outline"
            label="Làm mới"
            onPress={handleManualRefresh}
          />
        }
      />

      {/* Date Range Selector Card matching Mockup Screen 5 */}
      <View style={s.rangeBar}>
        <View style={s.rangePill}>
          <Ionicons name="calendar-outline" size={17} color={colors.primary} />
          <Text style={s.rangePillText}>
            {range === 'today' ? '16/10/2026 - 16/10/2026' : range === 'week' ? '10/10/2026 - 16/10/2026' : '01/10/2026 - 31/10/2026'}
          </Text>
          <Ionicons name="chevron-forward" size={15} color="#94a3b8" />
        </View>

        {/* Tab Filters */}
        <View style={s.tabFilterRow}>
          {ranges.map((r) => {
            const isActive = range === r.id
            return (
              <Pressable
                key={r.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                onPress={() => setRange(r.id)}
                style={[s.tabItem, isActive && s.tabItemActive]}
              >
                <Text style={[s.tabText, isActive && s.tabTextActive]}>{r.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      {query.isLoading ? (
        <ReportSkeleton />
      ) : query.isError ? (
        <EmptyState
          title="Chưa tải được báo cáo"
          description="Kiểm tra kết nối và thử lại. Thu nhập chỉ hiển thị khi có dữ liệu đơn giao."
          retry={handleManualRefresh}
        />
      ) : (
        <LazyScrollView
          ref={scroll}
          contentContainerStyle={s.scroll}
          refreshControl={
            <RefreshControl
              refreshing={manualRefreshing}
              onRefresh={handleManualRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* Main Earnings Card matching Mockup Screen 5 */}
          <View style={s.mainCard}>
            <Text style={s.cardLabel}>Tổng thu nhập</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 8 }}>
              <Text style={s.bigAmount}>{money}</Text>
              <View style={s.trendBadge}>
                <Ionicons name="arrow-up" size={12} color="#16a34a" />
                <Text style={s.trendText}>+12%</Text>
              </View>
            </View>

            {/* 3 Sub-metrics matching Mockup Screen 5 */}
            <View style={s.subMetricsRow}>
              <View style={s.subMetricItem}>
                <Text style={s.subMetricLabel}>Phí giao</Text>
                <Text style={s.subMetricValue}>{formatCurrency(feePart)}</Text>
              </View>
              <View style={s.subMetricItem}>
                <Text style={s.subMetricLabel}>Tiền thu hộ</Text>
                <Text style={s.subMetricValue}>{formatCurrency(codPart)}</Text>
              </View>
              <View style={s.subMetricItem}>
                <Text style={s.subMetricLabel}>Thưởng</Text>
                <Text style={s.subMetricValue}>{formatCurrency(bonusPart)}</Text>
              </View>
            </View>
          </View>

          {/* Bar Chart Section matching Mockup Screen 5 */}
          <View style={s.chartCard}>
            <Text style={s.sectionTitle}>Biểu đồ thu nhập</Text>
            <View style={s.chartContainer}>
              {barData.map((b) => (
                <View key={b.day} style={s.barCol}>
                  <View style={[s.barTrack]}>
                    <View
                      style={[
                        s.barFill,
                        {
                          height: `${b.h}%`,
                          backgroundColor: b.active ? colors.primary : '#fca5a5',
                        },
                      ]}
                    />
                  </View>
                  <Text style={[s.barDay, b.active && { color: colors.primary, fontWeight: '700' }]}>
                    {b.day.split('/')[0]}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Transaction Detail Section matching Mockup Screen 5 */}
          <View
            onLayout={(e) => setHistoryY(e.nativeEvent.layout.y)}
            style={s.txSection}
          >
            <Text style={s.sectionTitle}>Chi tiết giao dịch</Text>

            {!deliveries.length ? (
              <EmptyState
                title="Chưa có chuyến giao"
                description="Các đơn giao trong khoảng thời gian đã chọn sẽ được cập nhật ở đây."
              />
            ) : (
              paging.items.map((d) => (
                <Reveal key={d.id}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => navigation.navigate('OrderDetail', { deliveryId: d.id })}
                    style={s.deliveryRow}
                  >
                    <View style={s.txIcon}>
                      <Ionicons
                        name={d.status === 'DELIVERED' ? 'checkmark-circle' : 'close-circle'}
                        size={20}
                        color={d.status === 'DELIVERED' ? colors.success : colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.deliveryTitle}>#{String(d.ma_don_hang || d.id).slice(0, 8)}</Text>
                      <Text style={s.deliveryTime}>
                        {formatDateTime(d.delivered_at || d.updated_at)}
                      </Text>
                    </View>
                    <Text style={s.fee}>
                      {d.status === 'DELIVERED' && d.delivery_fee != null
                        ? `+${formatCurrency(d.delivery_fee)}`
                        : '—'}
                    </Text>
                  </Pressable>
                </Reveal>
              ))
            )}

            {paging.pages > 1 && (
              <Pagination
                page={paging.page}
                pages={paging.pages}
                total={paging.total}
                onChange={(page) => {
                  paging.setPage(page)
                  scroll.current?.scrollTo({ y: historyY, animated: false })
                }}
              />
            )}
          </View>
        </LazyScrollView>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  rangeBar: {
    backgroundColor: '#ffffff',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rangePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rangePillText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  tabFilterRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  mainCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  cardLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  bigAmount: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#f0fdf4',
    borderRadius: 6,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
  },
  subMetricsRow: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 8,
  },
  subMetricItem: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  subMetricLabel: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 4,
  },
  subMetricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  chartCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 120,
    paddingTop: 10,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
  },
  barTrack: {
    width: 14,
    height: 90,
    backgroundColor: '#f1f5f9',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 7,
  },
  barDay: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 6,
  },
  txSection: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  txIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  deliveryTime: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  fee: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.success,
  },
})
