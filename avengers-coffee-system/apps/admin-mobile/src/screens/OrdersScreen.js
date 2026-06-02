import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAdmin } from '../context/AdminContext'
import apiClient from '../lib/apiClient'
import { formatCurrency, formatDateTime } from '../lib/adminData'
import { colors, radius, shadows, spacing } from '../theme'

const ORDER_STATUSES = ['MOI_TAO', 'DA_XAC_NHAN', 'DANG_CHUAN_BI', 'DANG_GIAO', 'HOAN_THANH', 'DA_HUY']

const STATUS_LABEL = {
  MOI_TAO: 'Mới tạo',
  DA_XAC_NHAN: 'Đã xác nhận',
  DANG_CHUAN_BI: 'Đang chuẩn bị',
  DANG_GIAO: 'Đang giao',
  HOAN_THANH: 'Hoàn thành',
  DA_HUY: 'Đã hủy',
}

const STATUS_COLOR = {
  MOI_TAO: '#f59e0b',
  DA_XAC_NHAN: '#d97706',
  DANG_CHUAN_BI: colors.info,
  DANG_GIAO: '#6366f1',
  HOAN_THANH: colors.success,
  DA_HUY: colors.danger,
}

const ORDER_TRANSITIONS = {
  MOI_TAO: ['DA_XAC_NHAN', 'DA_HUY'],
  DA_XAC_NHAN: ['DANG_CHUAN_BI', 'DA_HUY'],
  DANG_CHUAN_BI: ['DANG_GIAO', 'HOAN_THANH', 'DA_HUY'],
  DANG_GIAO: ['HOAN_THANH', 'DA_HUY'],
  HOAN_THANH: [],
  DA_HUY: [],
}

const PAYMENT_LABEL = {
  THANH_TOAN_KHI_NHAN_HANG: 'COD',
  VNPAY: 'VNPAY',
  NGAN_HANG_QR: 'QR',
}

function OrderDetailModal({ order, visible, onClose, onUpdateStatus, updatingId }) {
  if (!order) return null
  const currentStatus = order.trang_thai_don_hang
  const nextStatuses = ORDER_TRANSITIONS[currentStatus] || []
  const isUpdating = updatingId === order.ma_don_hang
  const color = STATUS_COLOR[currentStatus] || colors.muted

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modalStyles.container}>
        <View style={modalStyles.header}>
          <Text style={modalStyles.title}>Chi tiết đơn hàng</Text>
          <Pressable onPress={onClose} style={modalStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView style={modalStyles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[modalStyles.metaCard, shadows.sm]}>
            <View style={modalStyles.metaRow}>
              <Text style={modalStyles.metaLabel}>Mã đơn</Text>
              <Text style={modalStyles.metaValue}>#{String(order.ma_don_hang || '').slice(0, 8).toUpperCase()}</Text>
            </View>
            <View style={modalStyles.metaRow}>
              <Text style={modalStyles.metaLabel}>Trạng thái</Text>
              <View style={[modalStyles.statusBadge, { backgroundColor: color + '15' }]}>
                <Text style={[modalStyles.statusText, { color }]}>{STATUS_LABEL[currentStatus] || currentStatus}</Text>
              </View>
            </View>
            <View style={modalStyles.metaRow}>
              <Text style={modalStyles.metaLabel}>Loại đơn</Text>
              <Text style={modalStyles.metaValue}>{order.loai_don_hang === 'TAI_CHO' ? 'Dùng tại quầy' : 'Giao hàng'}</Text>
            </View>
            <View style={modalStyles.metaRow}>
              <Text style={modalStyles.metaLabel}>Thanh toán</Text>
              <Text style={modalStyles.metaValue}>{PAYMENT_LABEL[order.phuong_thuc_thanh_toan] || order.phuong_thuc_thanh_toan}</Text>
            </View>
            {order.ten_khach_hang ? (
              <View style={modalStyles.metaRow}>
                <Text style={modalStyles.metaLabel}>Khách hàng</Text>
                <Text style={modalStyles.metaValue}>{order.ten_khach_hang}</Text>
              </View>
            ) : null}
            {order.ma_ban ? (
              <View style={modalStyles.metaRow}>
                <Text style={modalStyles.metaLabel}>Mã bàn</Text>
                <Text style={modalStyles.metaValue}>{order.ma_ban}</Text>
              </View>
            ) : null}
            <View style={modalStyles.metaRow}>
              <Text style={modalStyles.metaLabel}>Thời gian</Text>
              <Text style={modalStyles.metaValue}>{formatDateTime(order.ngay_tao)}</Text>
            </View>
          </View>

          <Text style={modalStyles.sectionLabel}>Các món đặt</Text>
          <View style={[modalStyles.itemsCard, shadows.sm]}>
            {(order.chi_tiet || []).map((item, idx) => (
              <View key={idx} style={modalStyles.itemRow}>
                <Text style={modalStyles.itemName} numberOfLines={2}>{item.ten_san_pham || `Món #${item.ma_san_pham}`}</Text>
                <Text style={modalStyles.itemQty}>x{item.so_luong}</Text>
                <Text style={modalStyles.itemPrice}>{formatCurrency(item.gia_ban)}</Text>
              </View>
            ))}
            <View style={modalStyles.totalRow}>
              <Text style={modalStyles.totalLabel}>Tổng cộng</Text>
              <Text style={modalStyles.totalValue}>{formatCurrency(order.tong_tien)}</Text>
            </View>
          </View>

          {order.ghi_chu ? (
            <View style={[modalStyles.noteBox, shadows.sm]}>
              <Ionicons name="chatbox-outline" size={14} color={colors.textSecondary} />
              <Text style={modalStyles.noteText}>{order.ghi_chu}</Text>
            </View>
          ) : null}

          {nextStatuses.length > 0 ? (
            <View style={modalStyles.actionsSection}>
              <Text style={modalStyles.sectionLabel}>Cập nhật trạng thái</Text>
              <View style={modalStyles.actionsRow}>
                {nextStatuses.map((s) => (
                  <Pressable
                    key={s}
                    disabled={isUpdating}
                    onPress={() => onUpdateStatus(order.ma_don_hang, s)}
                    style={[
                      modalStyles.actionBtn,
                      { backgroundColor: (STATUS_COLOR[s] || colors.muted) + '15', borderColor: STATUS_COLOR[s] || colors.border },
                    ]}
                  >
                    {isUpdating ? <ActivityIndicator size="small" color={STATUS_COLOR[s] || colors.text} /> : null}
                    <Text style={[modalStyles.actionBtnText, { color: STATUS_COLOR[s] || colors.textSecondary }]}>
                      {STATUS_LABEL[s] || s}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </Modal>
  )
}

export function OrdersScreen() {
  const { sessionBranchCode } = useAdmin()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [search, setSearch] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [updatingId, setUpdatingId] = useState('')

  const loadOrders = useCallback(async () => {
    try {
      const branchCode = sessionBranchCode || 'MAC_DINH_CHI'
      const response = await apiClient.get(`/staff/orders?branch_code=${encodeURIComponent(branchCode)}`)
      const arr = response?.orders || response?.items || (Array.isArray(response) ? response : [])
      setOrders(arr)
      setError('')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không tải được đơn hàng')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [sessionBranchCode])

  React.useEffect(() => { loadOrders() }, [loadOrders])

  const updateStatus = async (orderId, nextStatus) => {
    setUpdatingId(orderId)
    try {
      const branchCode = sessionBranchCode || 'MAC_DINH_CHI'
      const response = await apiClient.patch(`/staff/orders/${orderId}/status`, {
        status: nextStatus,
        branch_code: branchCode,
      })
      
      const updatedOrder = response?.order || {}
      
      setOrders(prev => prev.map(o => {
        if (o.ma_don_hang === orderId) {
          return { ...o, ...updatedOrder, trang_thai_don_hang: updatedOrder.trang_thai_don_hang || nextStatus }
        }
        return o
      }))
      
      setSelectedOrder(null)
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Cập nhật thất bại')
    } finally {
      setUpdatingId('')
    }
  }

  const filtered = orders.filter((o) => {
    if (filterStatus !== 'ALL' && o.trang_thai_don_hang !== filterStatus) return false
    if (search.trim()) {
      const kw = search.trim().toLowerCase()
      const code = String(o.ma_don_hang || '').toLowerCase()
      const customer = String(o.ten_khach_hang || '').toLowerCase()
      if (!code.includes(kw) && !customer.includes(kw)) return false
    }
    return true
  })

  const FILTER_TABS = ['ALL', ...ORDER_STATUSES]

  return (
    <View style={styles.screen}>
      <View style={{ height: 60 }} />
      <View style={styles.headerTitleContainer}>
        <Text style={styles.pageTitle}>Luồng đơn hàng</Text>
        <Text style={styles.pageSubtitle}>{orders.length} đơn · {filtered.length} đang hiển thị</Text>
      </View>

      <View style={[styles.searchWrap, shadows.sm]}>
        <Ionicons name="search-outline" size={16} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm mã đơn, tên khách hàng..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.filterList}
        >
          {FILTER_TABS.map((item) => {
            const isActive = filterStatus === item
            const color = item === 'ALL' ? colors.primary : STATUS_COLOR[item] || colors.muted
            const count = item === 'ALL' ? orders.length : orders.filter((o) => o.trang_thai_don_hang === item).length
            return (
              <Pressable
                key={item}
                onPress={() => setFilterStatus(item)}
                style={[
                  styles.filterChip,
                  { borderColor: isActive ? color : colors.border, backgroundColor: isActive ? color + '15' : colors.surface }
                ]}
              >
                <Text style={[styles.filterText, { color: isActive ? color : colors.textSecondary }]}>
                  {item === 'ALL' ? 'Tất cả' : STATUS_LABEL[item]}
                </Text>
                {count > 0 ? <View style={[styles.filterCountBadge, { backgroundColor: isActive ? color : colors.borderLight }]}><Text style={[styles.filterCount, { color: isActive ? '#fff' : colors.textSecondary }]}>{count}</Text></View> : null}
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.ma_don_hang)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const status = item.trang_thai_don_hang
          const color = STATUS_COLOR[status] || colors.muted
          return (
            <Pressable
              onPress={() => setSelectedOrder(item)}
              style={({ pressed }) => [styles.orderCard, shadows.sm, pressed && { opacity: 0.8 }]}
            >
              <View style={styles.orderTop}>
                <Text style={styles.orderCode}>#{String(item.ma_don_hang || '').slice(0, 8).toUpperCase()}</Text>
                <View style={[styles.statusBadge, { backgroundColor: color + '15' }]}>
                  <Text style={[styles.statusText, { color }]}>{STATUS_LABEL[status] || status}</Text>
                </View>
              </View>
              <View style={styles.orderMeta}>
                <View style={styles.orderMetaItem}>
                  <Ionicons name="time-outline" size={12} color={colors.muted} />
                  <Text style={styles.orderMetaText}>{formatDateTime(item.ngay_tao)}</Text>
                </View>
                <View style={styles.orderMetaItem}>
                  <Ionicons name="cafe-outline" size={12} color={colors.muted} />
                  <Text style={styles.orderMetaText}>{item.loai_don_hang === 'TAI_CHO' ? 'Tại quầy' : 'Giao hàng'}</Text>
                </View>
                <View style={styles.orderMetaItem}>
                  <Ionicons name="card-outline" size={12} color={colors.muted} />
                  <Text style={styles.orderMetaText}>{PAYMENT_LABEL[item.phuong_thuc_thanh_toan] || 'N/A'}</Text>
                </View>
              </View>
              <View style={styles.orderBottom}>
                <Text style={styles.orderItems}>{(item.chi_tiet || []).length} món</Text>
                <Text style={styles.orderAmount}>{formatCurrency(item.tong_tien)}</Text>
              </View>
            </Pressable>
          )
        }}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} size="large" />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="receipt-outline" size={44} color={colors.border} />
              <Text style={styles.emptyText}>Không có đơn hàng</Text>
            </View>
          )
        }
        onRefresh={() => { setRefreshing(true); loadOrders() }}
        refreshing={refreshing}
      />

      <OrderDetailModal
        order={selectedOrder}
        visible={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        onUpdateStatus={updateStatus}
        updatingId={updatingId}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerTitleContainer: { marginBottom: spacing.sm, paddingLeft: 60, paddingRight: spacing.lg },
  pageTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  pageSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4, fontWeight: '500' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '500' },
  filterList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 8, paddingRight: spacing.lg + 20 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  filterText: { fontSize: 12, fontWeight: '700' },
  filterCountBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.full },
  filterCount: { fontSize: 10, fontWeight: '900' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.sm,
    padding: 10,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.danger },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 100, gap: 12 },
  loadingWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 13, color: colors.muted },
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 10,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderCode: { fontSize: 15, fontWeight: '900', color: colors.text },
  statusBadge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '900' },
  orderMeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  orderMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  orderMetaText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  orderBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderLight },
  orderItems: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  orderAmount: { fontSize: 16, fontWeight: '900', color: colors.primary },
})

const modalStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingLeft: 68,
    paddingTop: 56,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.text },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, padding: spacing.lg },
  metaCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  metaLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  metaValue: { fontSize: 14, color: colors.text, fontWeight: '700' },
  statusBadge: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '900' },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 8 },
  itemsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  itemName: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
  itemQty: { fontSize: 14, color: colors.muted, fontWeight: '700' },
  itemPrice: { fontSize: 14, color: colors.text, fontWeight: '800', minWidth: 70, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginTop: 4,
  },
  totalLabel: { fontSize: 16, fontWeight: '900', color: colors.text },
  totalValue: { fontSize: 18, fontWeight: '900', color: colors.primary },
  noteBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  noteText: { flex: 1, fontSize: 13, color: colors.textSecondary, fontStyle: 'italic' },
  actionsSection: { marginBottom: 40 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 14, fontWeight: '800' },
})