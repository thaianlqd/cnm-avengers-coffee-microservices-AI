import React, { useState, useMemo, useRef } from 'react'
import { View, Text, TextInput, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useIsFocused } from '@react-navigation/native'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors } from '../theme'
import { formatCurrency, formatDateTime } from '../lib/shipperData'
import { Header, IconButton, Reveal, Skeleton, HistorySkeleton, EmptyState, ui } from '../components/Experience'
import Pagination, { usePagination } from '../components/Pagination'

const statusFilters = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'DELIVERED', label: 'Đã giao' },
  { id: 'CANCELLED', label: 'Đã hủy' },
]

export function HistoryScreen({ navigation }) {
  const { shipper } = useShipper()
  const focused = useIsFocused()
  const list = useRef(null)
  const [openedAt] = useState(Date.now)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [manualRefreshing, setManualRefreshing] = useState(false)

  const query = useQuery({
    queryKey: ['deliveriesHistory', shipper?.id],
    enabled: focused && !!shipper?.id,
    queryFn: async () => {
      const res = await apiClient.get(`/shippers/${shipper.id}/deliveries`)
      return (Array.isArray(res) ? res : res?.items || []).filter((d) =>
        ['DELIVERED', 'FAILED', 'CANCELLED'].includes(d.status)
      )
    },
  })

  const handleManualRefresh = async () => {
    setManualRefreshing(true)
    try {
      await query.refetch()
    } finally {
      setManualRefreshing(false)
    }
  }

  const snapshotTime = query.dataUpdatedAt || openedAt
  const filtered = useMemo(() => {
    return (query.data || [])
      .filter((d) => {
        if (status === 'ALL') return true
        if (status === 'DELIVERED') return d.status === 'DELIVERED'
        if (status === 'CANCELLED') return d.status === 'CANCELLED' || d.status === 'FAILED'
        return true
      })
      .filter((d) =>
        `${d.ma_don_hang} ${d.customer_name || ''} ${d.delivery_address || ''}`
          .toLocaleLowerCase('vi')
          .includes(search.trim().toLocaleLowerCase('vi'))
      )
      .sort(
        (a, b) =>
          new Date(b.delivered_at || b.updated_at) - new Date(a.delivered_at || a.updated_at)
      )
  }, [query.data, status, search])

  const pagination = usePagination(filtered, [status, search, shipper?.id].join('|'))

  const renderHeader = () => (
    <View style={{ paddingBottom: 12 }}>
      {/* Search Input with Filter Button */}
      <View style={s.searchRow}>
        <View style={s.searchInputWrap}>
          <Ionicons name="search-outline" size={18} color="#94a3b8" />
          <TextInput
            accessibilityLabel="Tìm mã đơn hoặc người nhận"
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm mã đơn, người nhận..."
            placeholderTextColor="#94a3b8"
            style={s.searchInput}
          />
          {search !== '' && (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </Pressable>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Lọc danh sách"
          style={s.filterIconButton}
          onPress={handleManualRefresh}
        >
          <Ionicons name="funnel-outline" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {/* Filter Chips matching Mockup Screen 6 */}
      <View style={s.chipRow}>
        {statusFilters.map((f) => {
          const isActive = status === f.id
          return (
            <Pressable
              key={f.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              onPress={() => setStatus(f.id)}
              style={[s.chip, isActive && s.chipActive]}
            >
              <Text style={[s.chipText, isActive && s.chipTextActive]}>{f.label}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )

  const renderItem = ({ item }) => {
    const isSuccess = item.status === 'DELIVERED'
    const code = `#${String(item.ma_don_hang || item.id).slice(0, 8)}`
    const amount = item.cod_amount != null ? formatCurrency(item.cod_amount) : item.delivery_fee != null ? formatCurrency(item.delivery_fee) : '0đ'

    return (
      <Reveal>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Chi tiết đơn ${String(item.ma_don_hang).slice(0, 8)}`}
          onPress={() => navigation.navigate('OrderDetail', { deliveryId: item.id })}
          style={s.card}
        >
          <View style={s.cardLeft}>
            <View style={s.boxIconWrap}>
              <Ionicons name="cube-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.orderCodeText}>{code}</Text>
              <Text style={s.timeText}>
                {formatDateTime(item.delivered_at || item.updated_at)}
              </Text>
            </View>
          </View>

          <View style={s.cardRight}>
            <View
              style={[
                s.statusPill,
                { backgroundColor: isSuccess ? '#f0fdf4' : '#fff1f2' },
              ]}
            >
              <View
                style={[
                  s.statusDot,
                  { backgroundColor: isSuccess ? colors.success : colors.primary },
                ]}
              />
              <Text
                style={[
                  s.statusText,
                  { color: isSuccess ? colors.success : colors.primary },
                ]}
              >
                {isSuccess ? 'Đã giao' : 'Đã hủy'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <Text style={s.amountText}>{amount}</Text>
              <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
            </View>
          </View>
        </Pressable>
      </Reveal>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={ui.screen}>
      <Header
        title="Lịch sử đơn hàng"
        right={
          <IconButton
            name="refresh-outline"
            label="Làm mới"
            onPress={handleManualRefresh}
          />
        }
      />

      <FlatList
        ref={list}
        data={pagination.items}
        keyExtractor={(i) => String(i.id || i.ma_don_hang)}
        initialNumToRender={4}
        maxToRenderPerBatch={5}
        windowSize={5}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={handleManualRefresh}
            tintColor={colors.primary}
          />
        }
        renderItem={renderItem}
        ListEmptyComponent={
          query.isLoading ? (
            <HistorySkeleton count={4} />
          ) : (
            <EmptyState
              title={query.isError ? 'Chưa tải được lịch sử' : 'Chưa có đơn hàng nào'}
              description={
                query.isError
                  ? 'Kiểm tra kết nối và thử lại.'
                  : 'Các đơn giao sẽ được lưu lại tại đây.'
              }
              retry={query.isError ? query.refetch : undefined}
            />
          )
        }
      />

      {filtered.length > 0 && pagination.pages > 1 && (
        <Pagination
          total={filtered.length}
          pages={pagination.pages}
          page={pagination.page}
          onChange={(page) => {
            pagination.setPage(page)
            list.current?.scrollToOffset({ offset: 0, animated: false })
          }}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    paddingVertical: 8,
  },
  filterIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 14,
    marginBottom: 10,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  boxIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#fff1f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderCodeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  timeText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  amountText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
})
