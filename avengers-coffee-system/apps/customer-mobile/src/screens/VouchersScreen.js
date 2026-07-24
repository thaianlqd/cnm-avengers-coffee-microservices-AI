import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import { formatDateOnly, getUserId, safeArray, getVoucherDisplayTitle, getVoucherDisplayDescription } from '../lib/customerData'
import { colors, spacing, shadows, radius } from '../theme'
// Clipboard import removed - using Alert fallback

const TYPE_CONFIG = {
  PERCENT:   { label: 'Giảm %',    color: '#22c55e', bg: '#f0fdf4', icon: 'trending-down-outline' },
  FIXED:     { label: 'Giảm tiền', color: '#0ea5e9', bg: '#f0f9ff', icon: 'cash-outline' },
  FREE_ITEM: { label: 'Tặng kèm',  color: '#a855f7', bg: '#faf5ff', icon: 'gift-outline' },
}

function VoucherCard({ voucher, onCopy }) {
  const type = String(voucher?.loai_khuyen_mai || voucher?.loai || '').toUpperCase()
  const tc = TYPE_CONFIG[type] || { label: 'Ưu đãi', color: colors.primary, bg: '#fff9f5', icon: 'ticket-outline' }

  const title = getVoucherDisplayTitle(voucher)
  const description = getVoucherDisplayDescription(voucher)
  const isExpired = voucher?.ngay_ket_thuc && new Date(voucher.ngay_ket_thuc) < new Date()

  return (
    <View style={[styles.voucherCard, shadows.sm, isExpired && styles.voucherCardExpired]}>
      {/* Left accent */}
      <LinearGradient
        colors={isExpired ? ['#d1d5db', '#9ca3af'] : [tc.color, tc.color + '99']}
        style={styles.voucherAccent}
      >
        <Ionicons name={tc.icon} size={24} color="#fff" />
      </LinearGradient>

      {/* Dashed divider */}
      <View style={styles.voucherDivider}>
        <View style={styles.voucherDividerDot1} />
        <View style={styles.voucherDividerLine} />
        <View style={styles.voucherDividerDot2} />
      </View>

      {/* Content */}
      <View style={styles.voucherContent}>
        <View style={styles.voucherHeaderRow}>
          <View style={[styles.typeBadge, { backgroundColor: tc.bg }]}>
            <Text style={[styles.typeBadgeText, { color: tc.color }]}>{tc.label}</Text>
          </View>
          {isExpired ? <View style={styles.expiredBadge}><Text style={styles.expiredText}>Hết hạn</Text></View> : null}
        </View>

        <Text style={styles.voucherValue} numberOfLines={1}>{title}</Text>

        <Text style={styles.voucherName} numberOfLines={2}>{description}</Text>

        <View style={styles.voucherFooter}>
          <View style={styles.voucherCodeWrap}>
            <Ionicons name="ticket-outline" size={13} color={isExpired ? colors.muted : tc.color} />
            <Text style={[styles.voucherCode, { color: isExpired ? colors.muted : tc.color }]}>
              {voucher.ma_khuyen_mai || voucher.ma_voucher}
            </Text>
          </View>
          <View style={styles.voucherDateCopyRow}>
            <Text style={styles.voucherDate}>HSD: {formatDateOnly(voucher.ngay_ket_thuc) || 'Không giới hạn'}</Text>
            {!isExpired ? (
              <Pressable
                onPress={() => onCopy(voucher.ma_khuyen_mai || voucher.ma_voucher)}
                style={[styles.copyBtn, { backgroundColor: tc.bg, borderColor: tc.color }]}
              >
                <Ionicons name="copy-outline" size={12} color={tc.color} />
                <Text style={[styles.copyBtnText, { color: tc.color }]}>Sao chép</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  )
}

export function VouchersScreen({ navigation }) {
  const { user } = useUser()
  const userId = getUserId(user)
  const [filter, setFilter] = useState('all')

  const vouchersQuery = useQuery({
    queryKey: ['customer', 'vouchers-list', userId],
    queryFn: async () => {
      const q = userId ? `?user_id=${encodeURIComponent(userId)}&limit=100` : '?limit=100'
      const response = await apiClient.get(`/promotions/vouchers${q}`)
      return safeArray(response?.items || response)
    },
    staleTime: 60 * 1000,
  })

  const vouchers = vouchersQuery.data || []
  const now = new Date()

  const filteredVouchers = vouchers.filter(v => {
    if (filter === 'valid') {
      return !v.ngay_ket_thuc || new Date(v.ngay_ket_thuc) >= now
    }
    if (filter === 'expired') {
      return v.ngay_ket_thuc && new Date(v.ngay_ket_thuc) < now
    }
    return true
  })

  const handleCopyCode = (code) => {
    Alert.alert(
      'Mã ưu đãi',
      `Mã của bạn: ${code}\n\nSao chép và dán vào ô nhập mã khi thanh toán.`,
      [{ text: 'Đã hiểu', style: 'default' }]
    )
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <LinearGradient colors={['#1a0a02', '#3d1a08']} style={styles.headerRow}>
        <Pressable onPress={() => navigation?.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Ưu đãi & Voucher</Text>
          <Text style={styles.headerSubtitle}>{vouchers.length} voucher hiện có</Text>
        </View>
      </LinearGradient>

      {/* Filters */}
      <View style={styles.filterBar}>
        {[
          { value: 'all', label: 'Tất cả' },
          { value: 'valid', label: 'Còn hiệu lực' },
          { value: 'expired', label: 'Đã hết hạn' },
        ].map(opt => (
          <Pressable
            key={opt.value}
            onPress={() => setFilter(opt.value)}
            style={[styles.filterBtn, filter === opt.value && styles.filterBtnActive]}
          >
            <Text style={[styles.filterBtnText, filter === opt.value && styles.filterBtnTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Loading */}
      {vouchersQuery.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Đang tải voucher...</Text>
        </View>
      ) : null}

      {/* Empty */}
      {!vouchersQuery.isLoading && filteredVouchers.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="ticket-outline" size={56} color={colors.border} />
          <Text style={styles.emptyTitle}>Không có voucher</Text>
          <Text style={styles.emptyText}>
            {filter !== 'all'
              ? 'Hãy thử xem ở danh mục khác.'
              : 'Mua hàng nhiều hơn để nhận được các ưu đãi hấp dẫn!'}
          </Text>
        </View>
      ) : null}

      {/* Voucher List */}
      <FlatList
        data={filteredVouchers}
        keyExtractor={(item) => String(item.ma_khuyen_mai || item.id || Math.random())}
        renderItem={({ item }) => <VoucherCard voucher={item} onCopy={handleCopyCode} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onRefresh={() => vouchersQuery.refetch()}
        refreshing={vouchersQuery.isFetching && !vouchersQuery.isLoading}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerRow: {
    paddingTop: 48,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    fontWeight: '500',
  },
  filterBar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  filterBtnTextActive: {
    color: '#fff',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },

  // Voucher Card
  voucherCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  voucherCardExpired: {
    opacity: 0.6,
  },
  voucherAccent: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voucherDivider: {
    width: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: -8,
    position: 'relative',
  },
  voucherDividerLine: {
    flex: 1,
    width: 1,
    borderStyle: 'dashed',
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  voucherDividerDot1: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.bg,
    position: 'absolute',
    top: -7,
  },
  voucherDividerDot2: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.bg,
    position: 'absolute',
    bottom: -7,
  },
  voucherContent: {
    flex: 1,
    padding: 14,
    gap: 5,
  },
  voucherHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeBadge: {
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  expiredBadge: {
    backgroundColor: '#fee2e2',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  expiredText: {
    fontSize: 10,
    fontWeight: '900',
    color: colors.danger,
  },
  voucherName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 20,
  },
  voucherValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
  },
  voucherCondition: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  voucherFooter: {
    gap: 6,
    marginTop: 3,
  },
  voucherCodeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  voucherCode: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  voucherDateCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voucherDate: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.md,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
})
