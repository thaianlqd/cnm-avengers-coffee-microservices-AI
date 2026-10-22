import { deliveryArray } from '../lib/deliverySummary.mjs'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LazyScrollView, LazySection } from '../components/LazyScrollView'
import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing } from '../theme'
import { formatCurrency, formatDateTime } from '../lib/shipperData'
import { Header, IconButton, WalletSkeleton, TransactionSkeleton, EmptyState, Reveal } from '../components/Experience'
import Pagination, { usePagination } from '../components/Pagination'
import { formatBranchName, setGlobalBranchList } from '../lib/branchHelper'

const TX_TYPE_CONFIG = {
  INCOME:   { icon: 'checkmark-circle', color: '#16a34a', bg: '#f0fdf4', label: 'Phí giao', tag: 'Thành công' },
  COD:      { icon: 'cash', color: '#2563eb', bg: '#eff6ff', label: 'Cod', tag: 'Thành công' },
  WITHDRAW: { icon: 'arrow-up-circle', color: '#b22830', bg: '#fff1f2', label: 'Rút tiền', tag: 'Thành công' },
  REMIT:    { icon: 'swap-horizontal', color: '#b22830', bg: '#fff1f2', label: 'Hoàn tiền', tag: 'Đã hoàn' },
  BONUS:    { icon: 'gift', color: '#8b5cf6', bg: '#f3e8ff', label: 'Thưởng', tag: 'Thành công' },
}

function TxItem({ tx }) {
  const cfg = TX_TYPE_CONFIG[tx.type] || TX_TYPE_CONFIG.INCOME
  const code = tx.order_code ? `#${String(tx.order_code).slice(0, 8)}` : tx.title
  return (
    <View style={txStyles.card}>
      <View style={[txStyles.iconWrap, { backgroundColor: cfg.bg }]}>
        <Ionicons name={cfg.icon} size={20} color={cfg.color} />
      </View>
      <View style={txStyles.info}>
        <Text style={txStyles.title} numberOfLines={1}>{code}</Text>
        <Text style={txStyles.sub}>{cfg.label}</Text>
        <Text style={txStyles.date}>{formatDateTime(tx.created_at || tx.date)}</Text>
      </View>
      <View style={txStyles.rightSide}>
        <Text style={[txStyles.amount, { color: tx.amount > 0 ? '#16a34a' : '#b22830' }]}>
          {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
        </Text>
        <View style={[txStyles.tag, { backgroundColor: tx.amount > 0 ? '#f0fdf4' : '#f1f5f9' }]}>
          <Text style={[txStyles.tagText, { color: tx.amount > 0 ? '#16a34a' : '#64748b' }]}>
            {cfg.tag}
          </Text>
        </View>
      </View>
    </View>
  )
}

const txStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 12,
    marginBottom: 8,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  sub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  date: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 1,
  },
  rightSide: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 14,
    fontWeight: '700',
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '600',
  },
})

export function WalletScreen({ navigation }) {
  const { shipper } = useShipper()
  const queryClient = useQueryClient()

  const scrollRef = useRef(null)
  const [transactionY, setTransactionY] = useState(0)
  const [manualRefreshing, setManualRefreshing] = useState(false)

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
      return deliveryArray(res)
        .filter((d) => d.status === 'DELIVERED' && d.delivery_fee != null)
        .sort((a, b) => new Date(b.delivered_at) - new Date(a.delivered_at))
        .map((d) => ({
          id: d.id,
          type: 'INCOME',
          amount: Number(d.delivery_fee),
          order_code: d.ma_don_hang || d.id,
          title: `Phí giao #${String(d.ma_don_hang || d.id).slice(0, 8)}`,
          date: d.delivered_at,
        }))
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
      Alert.alert('Thành công', 'Đã gửi yêu cầu nộp tiền thu hộ. Chờ cửa hàng xác nhận.')
      refetchWallet()
      refetchStats()
      refetchTx()
    },
    onError: (e) => Alert.alert('Lỗi', e?.message || 'Không thể nộp tiền thu hộ lúc này'),
  })

  const handleRemitCOD = (branchCode, amount) => {
    const branchName = getBranchName(branchCode)
    Alert.alert(
      'Xác nhận nộp tiền thu hộ',
      `Bạn xác nhận đã nộp ${formatCurrency(amount)} tiền thu hộ cho ${branchName}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Xác nhận', onPress: () => remitMutation.mutate({ branchCode, amount }) },
      ]
    )
  }

  const handleManualRefresh = async () => {
    setManualRefreshing(true)
    try {
      await Promise.all([refetchWallet(), refetchStats(), refetchTx()])
    } finally {
      setManualRefreshing(false)
    }
  }

  const codHolding = wallet?.cod_holding || 0
  const balance = wallet?.balance || 0
  const totalCodInTransit = (activeDeliveries || []).reduce(
    (sum, d) => sum + Number(d.cod_amount ?? 0),
    0
  )

  if (walletLoading && !wallet) {
    return <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <Header title="Ví & Cod" />
      <WalletSkeleton />
    </SafeAreaView>
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <Header
        title="Ví & Cod"
        right={
          <IconButton
            name="notifications-outline"
            label="Thông báo"
            onPress={() => navigation.navigate('Notification')}
          />
        }
      />
      {walletError && (
        <EmptyState
          title="Chưa tải được ví"
          description="Kiểm tra kết nối và thử lại để xem số dư mới nhất."
          retry={handleManualRefresh}
        />
      )}

      <LazyScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={handleManualRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Main Crimson Balance Card matching Mockup Screen 2 */}
        <LazySection minHeight={160}>
          <View style={styles.redBalanceCard}>
            <View style={styles.balanceHeaderRow}>
              <View style={styles.balanceIconLabel}>
                <Ionicons name="wallet-outline" size={17} color="#ffffff" />
                <Text style={styles.redBalanceLabel}>Số dư ví Shipper</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#ffffff" />
            </View>
            <Text style={styles.redBalanceValue}>
              {walletLoading || walletError ? '—' : formatCurrency(balance)}
            </Text>
          </View>
        </LazySection>

        {/* Stats Row White Card below Balance Card */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Tổng đơn</Text>
            <Text style={styles.statValue}>{stats?.total_deliveries || 1}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Hoàn thành hôm nay</Text>
            <Text style={styles.statValue}>{stats?.completed_today || 1}</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Đánh giá</Text>
            <Text style={styles.statValue}>
              ⭐ {Number(stats?.rating || shipper?.rating || 4.5).toFixed(1)}
            </Text>
          </View>
        </View>

        {/* COD Card matching Mockup Screen 2 */}
        <LazySection minHeight={160}>
          <View style={styles.codCard}>
            <View style={styles.codHeaderRow}>
              <View style={styles.codIconWrap}>
                <Ionicons name="cash-outline" size={20} color="#ea580c" />
              </View>
              <Text style={styles.codTitle}>Tiền thu hộ (Cod) đang giữ</Text>
              <Ionicons name="information-circle-outline" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
            </View>

            <Text style={styles.codAmountText}>
              {walletLoading || walletError ? '—' : formatCurrency(codHolding)}
            </Text>

            {totalCodInTransit > 0 && (
              <View style={styles.infoBox}>
                <Ionicons name="time-outline" size={15} color={colors.info} />
                <Text style={styles.infoText}>
                  Đang giao đơn thu hộ · Ước tính thêm {formatCurrency(totalCodInTransit)}
                </Text>
              </View>
            )}

            <Text style={styles.codDesc}>
              Vui lòng nộp lại tiền thu hộ cho quầy cửa hàng trước cuối ca làm việc.
            </Text>

            {/* Breakdown by Branch */}
            {wallet?.cod_details && Object.values(wallet.cod_details).some((v) => v > 0) ? (
              <View style={{ marginTop: 10 }}>
                {Object.entries(wallet.cod_details).map(([branch, amount]) =>
                  amount > 0 ? (
                    <View key={branch} style={styles.branchRemitRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={styles.branchRemitTitle}>{getBranchName(branch)}</Text>
                        <Text style={styles.branchRemitAmount}>{formatCurrency(amount)}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.remitBtn}
                        onPress={() => handleRemitCOD(branch, amount)}
                        disabled={remitMutation.isPending}
                      >
                        {remitMutation.isPending ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.remitBtnText}>Nộp</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : null
                )}
              </View>
            ) : (
              codHolding > 0 && (
                <TouchableOpacity
                  style={styles.remitBtnFull}
                  onPress={() => handleRemitCOD('LEGACY_COD', codHolding)}
                  disabled={remitMutation.isPending}
                >
                  {remitMutation.isPending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.remitBtnTextFull}>Nộp tiền thu hộ</Text>
                  )}
                </TouchableOpacity>
              )
            )}
          </View>
        </LazySection>

        {/* Recent Transactions matching Mockup Screen 2 */}
        <View style={styles.txSection} onLayout={(event) => setTransactionY(event.nativeEvent.layout.y)}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Giao dịch gần đây</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Report')}>
              <Text style={styles.seeAllText}>Xem tất cả &gt;</Text>
            </TouchableOpacity>
          </View>

          {txLoading ? (
            <TransactionSkeleton count={3} />
          ) : txError ? (
            <EmptyState
              title="Chưa tải được giao dịch"
              description="Kiểm tra kết nối để xem các giao dịch mới nhất."
              retry={refetchTx}
            />
          ) : !transactions?.length ? (
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={40} color="#94a3b8" />
              <Text style={styles.emptyTitle}>Chưa có giao dịch gần đây</Text>
            </View>
          ) : (
            txPages.items.map((tx, i) => (
              <Reveal key={tx.id || i}>
                <TxItem tx={tx} />
              </Reveal>
            ))
          )}

          {txPages.pages > 1 && (
            <Pagination
              page={txPages.page}
              pages={txPages.pages}
              total={txPages.total}
              onChange={(page) => {
                txPages.setPage(page)
                scrollRef.current?.scrollTo({ y: transactionY, animated: false })
              }}
            />
          )}
        </View>
      </LazyScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },
  redBalanceCard: {
    backgroundColor: '#b22830',
    borderRadius: 18,
    padding: 18,
    marginBottom: 10,
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceIconLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  redBalanceLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  redBalanceValue: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 12,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    paddingVertical: 14,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#f1f5f9',
  },
  statLabel: {
    color: '#64748b',
    fontSize: 11,
    marginBottom: 4,
    textAlign: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  codCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 16,
    marginBottom: 14,
  },
  codHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  codIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fffbeb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  codAmountText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#b22830',
    marginVertical: 10,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    gap: 6,
  },
  infoText: {
    fontSize: 11,
    color: '#2563eb',
    flex: 1,
  },
  codDesc: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 16,
  },
  branchRemitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
  },
  branchRemitTitle: {
    fontWeight: '600',
    color: '#ea580c',
    fontSize: 12,
    marginBottom: 2,
  },
  branchRemitAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  remitBtn: {
    backgroundColor: '#b22830',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  remitBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 12,
  },
  remitBtnFull: {
    backgroundColor: '#b22830',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  remitBtnTextFull: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  txSection: {
    marginTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  seeAllText: {
    fontSize: 12,
    color: '#b22830',
    fontWeight: '600',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 28,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  emptyTitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
  },
})
