import { deliveryArray } from '../lib/deliverySummary.mjs'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LazyScrollView, LazySection } from '../components/LazyScrollView'
import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, StyleSheet,  ScrollView,
  TouchableOpacity, RefreshControl, ActivityIndicator, Alert,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency, formatDateTime } from '../lib/shipperData'
import { Header, IconButton, Skeleton, EmptyState, Reveal } from '../components/Experience'
import Pagination, { usePagination } from '../components/Pagination'
import { formatBranchName, setGlobalBranchList } from '../lib/branchHelper'

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
  info: { flex: 1, minWidth: 0 },
  title: { ...typography.bodyBold, color: colors.text },
  date: { ...typography.caption, color: colors.muted, marginTop: 2 },
  amount: { fontSize: 14, fontWeight: '700' },
})

export function WalletScreen({ navigation }) {
  const { shipper } = useShipper()
  const queryClient = useQueryClient()

  const scrollRef = useRef(null)
  const [transactionY, setTransactionY] = useState(0)
  // Wallet & Stats
  const { data: wallet, isLoading: walletLoading, isError: walletError, refetch: refetchWallet } = useQuery({
    queryKey: ['shipperWallet', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return null
      return apiClient.get(`/shippers/${shipper.id}/wallet`)
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
  const { data: transactions, isLoading: txLoading, isError: txError, refetch: refetchTx } = useQuery({
    queryKey: ['shipperTransactions', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return []
      const res = await apiClient.get(`/shippers/${shipper.id}/deliveries`)
      return deliveryArray(res).filter(d => d.status === 'DELIVERED' && d.delivery_fee != null).sort((a,b) => new Date(b.delivered_at)-new Date(a.delivered_at)).map(d => ({ id: d.id, type: 'INCOME', amount: Number(d.delivery_fee), title: `Phí giao #${String(d.ma_don_hang || d.id).slice(0,8).toUpperCase()}`, date: d.delivered_at }))
    },
    enabled: !!shipper?.id,
  })

  const txPages = usePagination(transactions || [], shipper?.id)
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

  // Public branches to map branch codes to names
  const { data: publicBranchPayload } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      try {
        const res = await apiClient.get('/users/branches/public')
        const payload = res?.data || res || { items: [] }
        setGlobalBranchList(payload)
        return payload
      } catch (e) {
        return { items: [] }
      }
    },
    staleTime: 10 * 60 * 1000,
  })

  const getBranchName = (code) => {
    if (code === 'LEGACY_COD') return 'Tiền nợ cũ (Chưa phân loại)'
    return formatBranchName(code, publicBranchPayload)
  }

  const remitMutation = useMutation({
    mutationFn: async ({ branchCode, amount }) => {
      return apiClient.post(`/shippers/${shipper.id}/cod-remit`, { amount, branch_code: branchCode })
    },
    onSuccess: () => {
      Alert.alert('✅ Thành công', 'Đã gửi yêu cầu nộp COD. Chờ cửa hàng xác nhận.')
      refetchWallet()
      refetchStats()
      refetchTx()
    },
    onError: (e) => Alert.alert('Lỗi', e?.message || 'Không thể nộp COD lúc này'),
  })

  const handleRemitCOD = (branchCode, amount) => {
    const branchName = getBranchName(branchCode)
    Alert.alert(
      'Xác nhận nộp COD',
      `Bạn xác nhận đã nộp ${formatCurrency(amount)} tiền thu hộ cho ${branchName}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xác nhận', onPress: () => remitMutation.mutate({ branchCode, amount }) },
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
    (sum, d) => sum + Number(d.cod_amount ?? 0), 0
  )

  return (
    <SafeAreaView edges={['top','left','right']} style={styles.safeArea}>
      <Header title="Ví & COD" subtitle="Thu nhập và tiền thu hộ" right={<IconButton name="refresh-outline" label="Làm mới ví" onPress={handleRefresh} />} />
      {walletError && <EmptyState title="Chưa tải được ví" description="Kiểm tra kết nối và thử lại để xem số dư mới nhất." retry={handleRefresh} />}
      {walletLoading && <Skeleton count={1} />}

      <LazyScrollView ref={scrollRef}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        {/* Main Balance Card */}
        <LazySection minHeight={160}><View style={styles.balanceCard}>
          <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:8}}><Ionicons name="wallet-outline" size={18} color={colors.primary} /><Text style={styles.balanceLabel}>Số dư ví Shipper</Text></View>
          <Text style={styles.balanceValue}>{walletLoading || walletError ? '—' : formatCurrency(balance)}</Text>

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
              <Text style={styles.statValue}>{Number(stats?.rating || shipper?.rating || 0).toFixed(1)}</Text>
            </View>
          </View>
        </View></LazySection>

        {/* COD Card */}
        <LazySection minHeight={160}><View style={[styles.card, styles.codCard]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardIconWrap}>
              <Ionicons name="cash" size={22} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Tiền thu hộ (COD) đang giữ</Text>
              <Text style={styles.codAmount}>{walletLoading || walletError ? '—' : formatCurrency(codHolding)}</Text>
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

          {/* Breakdown by Branch */}
          {wallet?.cod_details && Object.values(wallet.cod_details).some(v => v > 0) ? (
            <View style={{ marginTop: 12 }}>
              {Object.entries(wallet.cod_details).map(([branch, amount]) => amount > 0 ? (
                <View key={branch} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFBEB', padding: 12, borderRadius: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontWeight: 'bold', color: colors.warning, fontSize: 13, marginBottom: 2 }}>
                      {getBranchName(branch)}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: colors.text }}>{formatCurrency(amount)}</Text>
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: colors.warning, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 }}
                    onPress={() => handleRemitCOD(branch, amount)}
                    disabled={remitMutation.isPending}
                  >
                    {remitMutation.isPending
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13 }}>Nộp</Text>
                    }
                  </TouchableOpacity>
                </View>
              ) : null)}
            </View>
          ) : (
            codHolding > 0 && (
              <TouchableOpacity
                style={styles.codBtn}
                onPress={() => handleRemitCOD('LEGACY_COD', codHolding)}
                disabled={remitMutation.isPending}
              >
                {remitMutation.isPending
                  ? <ActivityIndicator size="small" color={colors.warning} />
                  : <Text style={styles.codBtnText}>✓ Gửi yêu cầu nộp COD</Text>
                }
              </TouchableOpacity>
            )
          )}
        </View></LazySection>

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
        <LazySection minHeight={160}><View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Thao tác nhanh</Text>
          <View style={styles.actionsGrid}>
            {[
              { icon: 'bar-chart-outline', label: 'Thu nhập', onPress: () => navigation.navigate('Report'), color: colors.primary },
              { icon: 'receipt-outline', label: 'Phí giao', onPress: () => scrollRef.current?.scrollTo({ y: transactionY, animated: false }), color: colors.info },
              { icon: 'calendar-outline', label: 'Lịch làm', onPress: () => navigation.navigate('Schedule'), color: colors.success },
              { icon: 'notifications-outline', label: 'Thông báo', onPress: () => navigation.navigate('Notification'), color: colors.warning },
            ].map((action, i) => (
              <TouchableOpacity key={i} style={styles.actionBtn} onPress={action.onPress}>
                <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                  <Ionicons name={action.icon} size={24} color={action.color} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View></LazySection>

        {/* Transaction History */}
        <View style={styles.txSection} onLayout={event => setTransactionY(event.nativeEvent.layout.y)}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Phí giao đã ghi nhận</Text>
            {transactions?.length > 0 && (
              <Text style={styles.sectionCount}>{transactions.length} đơn</Text>
            )}
          </View>
          {txLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
          ) : txError ? <EmptyState title="Chưa tải được phí giao" description="Kiểm tra kết nối để xem các đơn đã ghi nhận phí." retry={refetchTx} /> : !transactions?.length ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={colors.muted} />
              <Text style={styles.emptyText}>Chưa có phí giao được ghi nhận</Text>
              <Text style={styles.emptyDesc}>Phí từ các đơn giao thành công sẽ xuất hiện ở đây</Text>
            </View>
          ) : (
            txPages.items.map((tx, i) => <Reveal key={tx.id || i}><TxItem tx={tx} /></Reveal>)
          )}
          <Pagination page={txPages.page} pages={txPages.pages} total={txPages.total} onChange={page => { txPages.setPage(page); scrollRef.current?.scrollTo({ y: transactionY, animated: false }) }} />
        </View>
      </LazyScrollView>
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
  balanceCard: { borderRadius: 12, padding: 18, marginBottom: 14,backgroundColor:'#fff',borderWidth:1,borderColor:'#e6e8ec' },
  balanceLabel: { color: colors.muted, fontSize: 12 },
  balanceValue: { color: colors.text, fontSize: 30, fontWeight: '700', marginBottom: spacing.lg },
  statsRow: {
    flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: '#edf0f2',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: '#edf0f2' },
  statLabel: { color: colors.muted, fontSize: 11, marginBottom: 4, textAlign: 'center' },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '700', textAlign: 'center' },

  // Cards
  card: {
    backgroundColor: colors.surface, borderRadius: 12,
    padding: 16, marginBottom: 14, borderWidth:1,borderColor:'#e6e8ec',
  },
  codCard: { },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  cardIconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.warningBg,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  cardTitle: { ...typography.bodyBold, color: colors.text },
  codAmount: { fontSize: 24, fontWeight: '700', color: colors.danger, marginTop: 4 },
  codDesc: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.md },
  codBtn: {
    backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warning,
    paddingVertical: spacing.sm, borderRadius: radius.md, alignItems: 'center',
  },
  codBtnText: { color: colors.warning, fontWeight: '700', fontSize: 14 },
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
    backgroundColor: colors.surface, borderRadius: 10, paddingVertical:12,paddingHorizontal:4,
  },
  actionIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  actionLabel: { ...typography.caption, color: colors.text, textAlign: 'center', fontWeight: '600' },

  // Transactions
  txSection: {
    backgroundColor: colors.surface, borderRadius: 12, padding: 16,borderWidth:1,borderColor:'#e6e8ec',
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionCount: { ...typography.caption, color: colors.muted },
  emptyState: { alignItems: 'center', paddingVertical: spacing.xxl },
  emptyText: { ...typography.h4, color: colors.textSecondary, marginTop: spacing.md },
  emptyDesc: { ...typography.caption, color: colors.muted, marginTop: spacing.xs, textAlign: 'center' },
})
