import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency, formatDateTime } from '../lib/shipperData'

const TX_TYPE_CONFIG = {
  INCOME:   { icon: 'arrow-down-circle', color: colors.success, bg: colors.successBg, label: 'Phí ship' },
  COD:      { icon: 'cash',              color: colors.warning,  bg: colors.warningBg, label: 'Thu hộ COD' },
  WITHDRAW: { icon: 'arrow-up-circle',   color: colors.danger,   bg: colors.dangerBg,  label: 'Rút tiền' },
  REMIT:    { icon: 'swap-horizontal',   color: colors.info,     bg: colors.infoBg,    label: 'Nộp COD' },
  BONUS:    { icon: 'gift',              color: '#8B5CF6',        bg: '#EDE9FE',         label: 'Thưởng' },
}

function TxItem({ tx }) {
  const cfg = TX_TYPE_CONFIG[tx.type] || TX_TYPE_CONFIG.INCOME
  return (
    <View style={txStyles.row}>
      <View style={[txStyles.iconWrap, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={22} color={cfg.color} />
      </View>
      <View style={txStyles.info}>
        <Text style={txStyles.title} numberOfLines={1}>{tx.title || cfg.label}</Text>
        <Text style={txStyles.date}>{formatDateTime(tx.created_at || tx.date)}</Text>
      </View>
      <Text style={[txStyles.amount, { color: tx.amount > 0 ? colors.success : colors.danger }]}>
        {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
      </Text>
    </View>
  )
}

const txStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  info: { flex: 1 },
  title: { ...typography.bodyBold, color: colors.text },
  date: { ...typography.caption, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '800' },
})

export function WalletScreen({ navigation }) {
  const { shipper } = useShipper()
  const queryClient = useQueryClient()

  // Wallet & Stats
  const { data: wallet, isLoading: walletLoading, refetch: refetchWallet } = useQuery({
    queryKey: ['shipperWallet', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return null
      try {
        return await apiClient.get(`/shippers/${shipper.id}/wallet`)
      } catch {
        // Fallback to stats
        const stats = await apiClient.get(`/shippers/${shipper.id}/stats`)
        return {
          balance: stats?.balance || 0,
          cod_holding: stats?.cod_holding || 0,
          pending_commission: stats?.pending_commission || 0,
          total_earned: stats?.total_income || 0,
        }
      }
    },
    enabled: !!shipper?.id,
  })

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['shipperStats', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return null
      return apiClient.get(`/shippers/${shipper.id}/stats`)
    },
    enabled: !!shipper?.id,
  })

  // Transactions
  const { data: transactions, isLoading: txLoading, refetch: refetchTx } = useQuery({
    queryKey: ['shipperTransactions', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return []
      try {
        const res = await apiClient.get(`/shippers/${shipper.id}/transactions?limit=30`)
        return Array.isArray(res) ? res : res?.items || []
      } catch {
        return []
      }
    },
    enabled: !!shipper?.id,
  })

  // COD active deliveries
  const { data: activeDeliveries } = useQuery({
    queryKey: ['activeCod', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return []
      try {
        const res = await apiClient.get(`/shippers/${shipper.id}/deliveries?status=IN_TRANSIT`)
        return Array.isArray(res) ? res : []
      } catch {
        return []
      }
    },
    enabled: !!shipper?.id,
  })

  const remitMutation = useMutation({
    mutationFn: async () => {
      return apiClient.post(`/shippers/${shipper.id}/cod-remit`, { amount: wallet?.cod_holding || 0 })
    },
    onSuccess: () => {
      Alert.alert('✅ Thành công', 'Đã xác nhận nộp COD cho cửa hàng.')
      refetchWallet()
      refetchStats()
      refetchTx()
    },
    onError: (e) => Alert.alert('Lỗi', e?.message || 'Không thể nộp COD lúc này'),
  })

  const handleRemitCOD = () => {
    Alert.alert(
      'Xác nhận nộp COD',
      `Bạn xác nhận đã nộp ${formatCurrency(wallet?.cod_holding || 0)} tiền thu hộ cho cửa hàng?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xác nhận', onPress: () => remitMutation.mutate() },
      ]
    )
  }

  const handleRefresh = () => {
    refetchWallet()
    refetchStats()
    refetchTx()
  }

  const isLoading = walletLoading || txLoading
  const codHolding = wallet?.cod_holding || 0
  const balance = wallet?.balance || 0

  const totalCodInTransit = (activeDeliveries || []).reduce(
    (sum, d) => sum + Number(d.cod_amount || d.order_value || 0), 0
  )

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Ví & Doanh thu</Text>
        <TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* Main Balance Card */}
        <LinearGradient
          colors={[colors.primary, '#0ea5e9']}
          style={styles.balanceCard}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <Text style={styles.balanceLabel}>Số dư ví Shipper</Text>
          <Text style={styles.balanceValue}>{formatCurrency(balance)}</Text>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Tổng đơn</Text>
              <Text style={styles.statValue}>{stats?.total_deliveries || 0}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Hoàn thành hôm nay</Text>
              <Text style={styles.statValue}>{stats?.completed_today || 0}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Đánh giá</Text>
              <Text style={styles.statValue}>⭐ {Number(stats?.rating || shipper?.rating || 0).toFixed(1)}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* COD Card */}
        <View style={[styles.card, styles.codCard]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconWrap}>
              <Ionicons name="cash" size={22} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Tiền thu hộ (COD) đang giữ</Text>
              <Text style={styles.codAmount}>{formatCurrency(codHolding)}</Text>
            </View>
          </View>

          {totalCodInTransit > 0 && (
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color={colors.info} />
              <Text style={styles.infoText}>
                Đang giao {activeDeliveries?.length || 0} đơn COD • Ước tính thêm {formatCurrency(totalCodInTransit)}
              </Text>
            </View>
          )}

          <Text style={styles.codDesc}>
            Vui lòng nộp lại tiền thu hộ cho quầy cửa hàng trước cuối ca làm việc.
          </Text>

          {codHolding > 0 && (
            <TouchableOpacity
              style={styles.codBtn}
              onPress={handleRemitCOD}
              disabled={remitMutation.isPending}
            >
              {remitMutation.isPending
                ? <ActivityIndicator size="small" color={colors.warning} />
                : <Text style={styles.codBtnText}>✓ Xác nhận đã nộp COD</Text>
              }
            </TouchableOpacity>
          )}
        </View>

        {/* Pending Commission */}
        {(wallet?.pending_commission > 0) && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View style={[styles.cardIconWrap, { backgroundColor: '#EDE9FE' }]}>
                <Ionicons name="gift" size={22} color="#8B5CF6" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Hoa hồng chờ thanh toán</Text>
                <Text style={[styles.codAmount, { color: '#8B5CF6' }]}>
                  {formatCurrency(wallet.pending_commission)}
                </Text>
              </View>
            </View>
            <Text style={styles.codDesc}>Hoa hồng sẽ được thanh toán vào cuối tuần theo chính sách chuỗi.</Text>
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
          <View style={styles.actionsGrid}>
            {[
              { icon: 'bar-chart', label: 'Đối soát\nthu nhập', onPress: () => navigation.navigate('Report'), color: colors.primary },
              { icon: 'document-text', label: 'Lịch sử\ngiao dịch', onPress: () => {}, color: colors.info },
              { icon: 'calendar', label: 'Lịch\nlàm việc', onPress: () => navigation.navigate('Schedule'), color: colors.success },
              { icon: 'help-circle', label: 'Hỗ trợ\ntài chính', onPress: () => navigation.navigate('Notification'), color: colors.warning },
            ].map((action, i) => (
              <TouchableOpacity key={i} style={styles.actionBtn} onPress={action.onPress}>
                <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                  <Ionicons name={action.icon} size={24} color={action.color} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Transaction History */}
        <View style={styles.txSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Lịch sử giao dịch</Text>
            {transactions?.length > 0 && (
              <Text style={styles.sectionCount}>{transactions.length} giao dịch</Text>
            )}
          </View>
          {txLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
          ) : !transactions?.length ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>Chưa có giao dịch nào</Text>
              <Text style={styles.emptyDesc}>Giao dịch thu nhập và COD sẽ xuất hiện ở đây</Text>
            </View>
          ) : (
            transactions.map((tx, i) => <TxItem key={tx.id || i} tx={tx} />)
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
    padding: spacing.lg, backgroundColor: colors.surface, ...shadows.xs,
  },
  headerTitle: { ...typography.h3, color: colors.text },
  refreshBtn: { padding: spacing.xs },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },

  // Balance
  balanceCard: { borderRadius: radius.xl, padding: spacing.xl, marginBottom: spacing.lg, ...shadows.primary },
  balanceLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: spacing.xs },
  balanceValue: { color: colors.surface, fontSize: 36, fontWeight: '900', marginBottom: spacing.lg },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
  statLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginBottom: 4, textAlign: 'center' },
  statValue: { color: colors.surface, fontSize: 15, fontWeight: '800', textAlign: 'center' },

  // Cards
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.lg, marginBottom: spacing.lg, ...shadows.sm,
  },
  codCard: { borderLeftWidth: 4, borderLeftColor: colors.warning },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.warningBg,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  cardTitle: { ...typography.bodyBold, color: colors.text },
  codAmount: { fontSize: 24, fontWeight: '900', color: colors.danger, marginTop: 4 },
  codDesc: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  codBtn: {
    backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warning,
    paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center',
  },
  codBtnText: { color: colors.warning, fontWeight: '800', fontSize: 14 },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.infoBg,
    padding: spacing.sm, borderRadius: radius.sm, marginBottom: spacing.sm, gap: spacing.xs,
  },
  infoText: { ...typography.caption, color: colors.info, flex: 1 },

  // Actions
  actionsSection: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.h4, color: colors.text, marginBottom: spacing.md },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionBtn: {
    flex: 1, minWidth: '22%', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
  },
  actionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  actionLabel: { ...typography.caption, color: colors.text, textAlign: 'center', fontWeight: '600' },

  // Transactions
  txSection: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, ...shadows.sm,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionCount: { ...typography.caption, color: colors.muted },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyText: { ...typography.h4, color: colors.textSecondary, marginTop: spacing.md },
  emptyDesc: { ...typography.caption, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },
})
