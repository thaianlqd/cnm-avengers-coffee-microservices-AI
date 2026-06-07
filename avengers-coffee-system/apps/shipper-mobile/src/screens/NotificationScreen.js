import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'

const NOTIFICATION_ICONS = {
  ORDER: { icon: 'receipt-outline', color: '#10B981', bg: '#ECFDF5' },
  PAYMENT: { icon: 'card-outline', color: '#3B82F6', bg: '#EFF6FF' },
  SYSTEM: { icon: 'settings-outline', color: '#6B7280', bg: '#F9FAFB' },
  DELIVERY: { icon: 'bicycle-outline', color: colors.primary, bg: colors.infoBg },
  DEFAULT: { icon: 'notifications-outline', color: colors.primary, bg: colors.infoBg },
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now - date
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Vừa xong'
  if (diffMins < 60) return `${diffMins} phút trước`
  if (diffHours < 24) return `${diffHours} giờ trước`
  if (diffDays < 7) return `${diffDays} ngày trước`
  return date.toLocaleDateString('vi-VN')
}

export function NotificationScreen({ navigation }) {
  const { shipper } = useShipper()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('ALL')

  const {
    data: notifData,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['shipper-notifications', shipper?.id],
    queryFn: () => apiClient.get(`/shippers/${shipper.id}/notifications`),
    enabled: !!shipper?.id,
    refetchInterval: 30000,
    select: (res) => (Array.isArray(res) ? res : res?.items || res?.data || []),
  })

  const notifications = notifData || []

  const filteredNotifs = filter === 'ALL'
    ? notifications
    : notifications.filter((n) => String(n.type || n.loai || '').toUpperCase() === filter)

  const renderItem = ({ item }) => {
    const type = String(item.type || item.loai || 'DEFAULT').toUpperCase()
    const meta = NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.DEFAULT
    const isRead = item.da_doc !== false && item.is_read !== false

    return (
      <View style={[styles.card, !isRead && styles.cardUnread]}>
        <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={22} color={meta.color} />
        </View>
        <View style={styles.content}>
          <View style={styles.cardHeader}>
            <Text style={[styles.title, !isRead && styles.titleUnread]} numberOfLines={1}>
              {item.tieu_de || item.title || 'Thông báo'}
            </Text>
            {!isRead && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.body} numberOfLines={2}>
            {item.noi_dung || item.content || ''}
          </Text>
          <Text style={styles.time}>{formatRelativeTime(item.created_at || item.tao_luc)}</Text>
        </View>
      </View>
    )
  }

  const FILTERS = [
    { id: 'ALL', label: 'Tất cả' },
    { id: 'ORDER', label: 'Đơn hàng' },
    { id: 'PAYMENT', label: 'Thanh toán' },
    { id: 'SYSTEM', label: 'Hệ thống' },
  ]

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Thông báo</Text>
          {notifications.length > 0 && (
            <Text style={styles.headerSub}>{notifications.length} thông báo</Text>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterTab, filter === f.id && styles.filterTabActive]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredNotifs}
          keyExtractor={(item, index) => String(item.id || index)}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={64} color={colors.muted} />
              <Text style={styles.emptyTitle}>Không có thông báo nào</Text>
              <Text style={styles.emptyDesc}>
                {filter === 'ALL'
                  ? 'Bạn chưa có thông báo mới. Kéo xuống để làm mới.'
                  : 'Không có thông báo trong danh mục này.'}
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
  filterRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  filterTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    backgroundColor: colors.bg,
  },
  filterTabActive: { backgroundColor: colors.primary },
  filterText: { ...typography.caption, color: colors.muted, fontWeight: '600' },
  filterTextActive: { color: '#fff' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.xs,
    alignItems: 'flex-start',
  },
  cardUnread: {
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    flexShrink: 0,
  },
  content: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { ...typography.bodyBold, color: colors.text, flex: 1 },
  titleUnread: { color: colors.text },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginLeft: spacing.xs,
    flexShrink: 0,
  },
  body: { ...typography.body, color: colors.textSecondary, lineHeight: 20, marginBottom: 4 },
  time: { ...typography.caption, color: colors.muted },
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
