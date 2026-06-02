import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import {
  canCancelOrder,
  formatCurrency,
  formatDateTime,
  getUserId,
  normalizeOrder,
  orderStatusLabels,
  paymentStatusLabels,
  safeArray,
} from '../lib/customerData'
import { colors, spacing, shadows, radius } from '../theme'

function InvoiceModal({ order, visible, onClose }) {
  if (!order) return null
  const paymentStyle = {
    DA_THANH_TOAN: { color: '#22c55e', label: 'Đã thanh toán', icon: 'checkmark-circle' },
    CHO_THANH_TOAN: { color: '#0ea5e9', label: 'Chờ thanh toán', icon: 'time-outline' },
    CHO_THANH_TOAN_KHI_NHAN_HANG: { color: '#f97316', label: 'Thanh toán khi nhận', icon: 'cash-outline' },
    CHO_XU_LY: { color: '#f59e0b', label: 'Chờ xử lý', icon: 'hourglass-outline' },
    THAT_BAI: { color: '#ef4444', label: 'Thất bại', icon: 'close-circle-outline' },
  }
  const ps = paymentStyle[order.trang_thai_thanh_toan] || { color: colors.muted, label: order.trang_thai_thanh_toan, icon: 'help-circle-outline' }
  const subTotal = order.chi_tiet.reduce((sum, i) => sum + Number(i.gia_ban || 0) * Number(i.so_luong || 0), 0)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={invoiceStyles.container}>
        <View style={invoiceStyles.header}>
          <Text style={invoiceStyles.headerTitle}>Hóa đơn</Text>
          <Pressable onPress={onClose} style={invoiceStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={invoiceStyles.body}>
          {/* Store Info */}
          <View style={invoiceStyles.storeSection}>
            <Text style={invoiceStyles.storeName}>☕ AVENGERS COFFEE</Text>
            <Text style={invoiceStyles.storeSlogan}>Hương vị ngọt ngào mỗi ngày</Text>
          </View>

          <View style={invoiceStyles.dashed} />

          {/* Invoice Info */}
          <View style={invoiceStyles.infoSection}>
            <View style={invoiceStyles.infoRow}>
              <Text style={invoiceStyles.infoLabel}>Mã đơn hàng</Text>
              <Text style={invoiceStyles.infoValueBold}>{order.ma_don_hang}</Text>
            </View>
            <View style={invoiceStyles.infoRow}>
              <Text style={invoiceStyles.infoLabel}>Ngày đặt</Text>
              <Text style={invoiceStyles.infoValue}>{formatDateTime(order.ngay_tao)}</Text>
            </View>
            <View style={invoiceStyles.infoRow}>
              <Text style={invoiceStyles.infoLabel}>Địa chỉ</Text>
              <Text style={invoiceStyles.infoValue} numberOfLines={2}>{order.dia_chi_giao_hang || 'N/A'}</Text>
            </View>
            <View style={invoiceStyles.infoRow}>
              <Text style={invoiceStyles.infoLabel}>Thanh toán</Text>
              <View style={[invoiceStyles.payBadge, { backgroundColor: `${ps.color}15` }]}>
                <Ionicons name={ps.icon} size={12} color={ps.color} />
                <Text style={[invoiceStyles.payBadgeText, { color: ps.color }]}>{ps.label}</Text>
              </View>
            </View>
          </View>

          <View style={invoiceStyles.dashed} />

          {/* Items Header */}
          <View style={invoiceStyles.itemsHeader}>
            <Text style={[invoiceStyles.colName, { flex: 3 }]}>Sản phẩm</Text>
            <Text style={[invoiceStyles.colName, { flex: 1, textAlign: 'center' }]}>SL</Text>
            <Text style={[invoiceStyles.colName, { flex: 2, textAlign: 'right' }]}>Thành tiền</Text>
          </View>

          {/* Items */}
          {order.chi_tiet.map((item, index) => (
            <View key={item.id || index} style={invoiceStyles.itemRow}>
              <View style={{ flex: 3 }}>
                <Text style={invoiceStyles.itemName} numberOfLines={2}>{item.ten_san_pham}</Text>
                <Text style={invoiceStyles.itemPrice}>{formatCurrency(item.gia_ban)}</Text>
              </View>
              <Text style={[invoiceStyles.itemQty, { flex: 1 }]}>x{item.so_luong}</Text>
              <Text style={[invoiceStyles.itemTotal, { flex: 2 }]}>
                {formatCurrency(Number(item.gia_ban) * Number(item.so_luong))}
              </Text>
            </View>
          ))}

          <View style={invoiceStyles.dashed} />

          {/* Totals */}
          <View style={invoiceStyles.totalsSection}>
            <View style={invoiceStyles.totalRow}>
              <Text style={invoiceStyles.totalLabel}>Tạm tính ({order.chi_tiet.length} món)</Text>
              <Text style={invoiceStyles.totalValue}>{formatCurrency(subTotal)}</Text>
            </View>
            {order.so_tien_giam > 0 ? (
              <View style={invoiceStyles.totalRow}>
                <Text style={[invoiceStyles.totalLabel, { color: colors.success }]}>Giảm giá</Text>
                <Text style={[invoiceStyles.totalValue, { color: colors.success }]}>-{formatCurrency(order.so_tien_giam)}</Text>
              </View>
            ) : null}
            <View style={invoiceStyles.dashed} />
            <View style={invoiceStyles.totalRow}>
              <Text style={invoiceStyles.grandTotalLabel}>TỔNG CỘNG</Text>
              <Text style={invoiceStyles.grandTotalValue}>{formatCurrency(order.tong_tien)}</Text>
            </View>
          </View>

          <View style={invoiceStyles.dashed} />

          {/* Footer */}
          <View style={invoiceStyles.footer}>
            <Text style={invoiceStyles.footerText}>Cảm ơn quý khách đã sử dụng dịch vụ!</Text>
            <Text style={invoiceStyles.footerText}>Avengers Coffee ♥</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'MOI_TAO', label: 'Vừa tạo' },
  { value: 'DA_XAC_NHAN', label: 'Đã xác nhận' },
  { value: 'DANG_CHUAN_BI', label: 'Đang chuẩn bị' },
  { value: 'DANG_GIAO', label: 'Đang giao' },
  { value: 'HOAN_THANH', label: 'Hoàn thành' },
  { value: 'DA_HUY', label: 'Đã hủy' },
]

const STATUS_STYLE = {
  MOI_TAO:       { color: '#f59e0b', bg: '#fffbeb', icon: 'time-outline' },
  DA_XAC_NHAN:   { color: '#0ea5e9', bg: '#f0f9ff', icon: 'checkmark-outline' },
  DANG_CHUAN_BI: { color: '#8b5cf6', bg: '#f5f3ff', icon: 'cafe-outline' },
  DANG_GIAO:     { color: '#f97316', bg: '#fff7ed', icon: 'bicycle-outline' },
  HOAN_THANH:    { color: '#22c55e', bg: '#f0fdf4', icon: 'checkmark-circle-outline' },
  DA_HUY:        { color: '#ef4444', bg: '#fef2f2', icon: 'close-circle-outline' },
}

const PAYMENT_STATUS_STYLE = {
  CHO_XU_LY:                    { color: '#f59e0b', label: 'Chờ xử lý' },
  CHO_THANH_TOAN:               { color: '#0ea5e9', label: 'Chờ thanh toán' },
  CHO_THANH_TOAN_KHI_NHAN_HANG: { color: '#f97316', label: 'Thanh toán khi nhận' },
  DA_THANH_TOAN:                { color: '#22c55e', label: 'Đã thanh toán' },
  THAT_BAI:                     { color: '#ef4444', label: 'Thất bại' },
}

function OrderDetailModal({ order, visible, onClose, onCancel, onViewInvoice }) {
  if (!order) return null
  const statusStyle = STATUS_STYLE[order.trang_thai_don_hang] || { color: colors.muted, bg: colors.cream, icon: 'help-circle-outline' }
  const paymentStyle = PAYMENT_STATUS_STYLE[order.trang_thai_thanh_toan] || { color: colors.muted, label: order.trang_thai_thanh_toan }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={detailStyles.container}>
        <View style={detailStyles.header}>
          <Text style={detailStyles.headerTitle}>Chi tiết đơn hàng</Text>
          <Pressable onPress={onClose} style={detailStyles.closeBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Status Banner */}
          <View style={[detailStyles.statusBanner, { backgroundColor: statusStyle.bg }]}>
            <Ionicons name={statusStyle.icon} size={28} color={statusStyle.color} />
            <View>
              <Text style={[detailStyles.statusText, { color: statusStyle.color }]}>
                {orderStatusLabels[order.trang_thai_don_hang] || order.trang_thai_don_hang}
              </Text>
              <Text style={detailStyles.orderCode}>{order.ma_don_hang}</Text>
            </View>
          </View>

          <View style={detailStyles.body}>
            {/* Order Info */}
            <View style={detailStyles.infoCard}>
              <Text style={detailStyles.infoTitle}>Thông tin đơn hàng</Text>
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Ngày đặt</Text>
                <Text style={detailStyles.infoValue}>{formatDateTime(order.ngay_tao)}</Text>
              </View>
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Địa chỉ giao</Text>
                <Text style={detailStyles.infoValue} numberOfLines={2}>{order.dia_chi_giao_hang || 'N/A'}</Text>
              </View>
              {order.khung_gio_giao ? (
                <View style={detailStyles.infoRow}>
                  <Text style={detailStyles.infoLabel}>Khung giờ giao</Text>
                  <Text style={detailStyles.infoValue}>{order.khung_gio_giao}</Text>
                </View>
              ) : null}
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Phương thức TT</Text>
                <Text style={detailStyles.infoValue}>{order.phuong_thuc_thanh_toan || 'N/A'}</Text>
              </View>
              <View style={detailStyles.infoRow}>
                <Text style={detailStyles.infoLabel}>Trạng thái TT</Text>
                <Text style={[detailStyles.infoValue, { color: paymentStyle.color }]}>{paymentStyle.label}</Text>
              </View>
              {order.ghi_chu ? (
                <View style={detailStyles.infoRow}>
                  <Text style={detailStyles.infoLabel}>Ghi chú</Text>
                  <Text style={detailStyles.infoValue}>{order.ghi_chu}</Text>
                </View>
              ) : null}
            </View>

            {/* Order Items */}
            <View style={detailStyles.itemsCard}>
              <Text style={detailStyles.infoTitle}>Sản phẩm ({order.chi_tiet.length})</Text>
              {order.chi_tiet.map((item, index) => (
                <View key={item.id || index} style={detailStyles.orderItem}>
                  {item.hinh_anh_url ? (
                    <Image source={{ uri: item.hinh_anh_url }} style={detailStyles.orderItemImage} resizeMode="cover" />
                  ) : (
                    <View style={[detailStyles.orderItemImage, detailStyles.orderItemImagePlaceholder]}>
                      <Ionicons name="cafe-outline" size={18} color={colors.muted} />
                    </View>
                  )}
                  <View style={detailStyles.orderItemInfo}>
                    <Text style={detailStyles.orderItemName} numberOfLines={2}>{item.ten_san_pham}</Text>
                    {item.kich_co ? <Text style={detailStyles.orderItemMeta}>Size: {item.kich_co}</Text> : null}
                    <View style={detailStyles.orderItemPriceRow}>
                      <Text style={detailStyles.orderItemQty}>x{item.so_luong}</Text>
                      <Text style={detailStyles.orderItemPrice}>{formatCurrency(item.gia_ban)}</Text>
                    </View>
                  </View>
                  <Text style={detailStyles.orderItemSubtotal}>
                    {formatCurrency(Number(item.gia_ban) * Number(item.so_luong))}
                  </Text>
                </View>
              ))}
            </View>

            {/* Total */}
            <View style={detailStyles.totalCard}>
              {order.so_tien_giam > 0 ? (
                <>
                  <View style={detailStyles.totalRow}>
                    <Text style={detailStyles.totalLabel}>Tạm tính</Text>
                    <Text style={detailStyles.totalValue}>{formatCurrency(order.tong_tien + order.so_tien_giam)}</Text>
                  </View>
                  <View style={detailStyles.totalRow}>
                    <Text style={[detailStyles.totalLabel, { color: colors.success }]}>Giảm giá</Text>
                    <Text style={[detailStyles.totalValue, { color: colors.success }]}>-{formatCurrency(order.so_tien_giam)}</Text>
                  </View>
                </>
              ) : null}
              <View style={detailStyles.totalFinalRow}>
                <Text style={detailStyles.totalFinalLabel}>Tổng thanh toán</Text>
                <Text style={detailStyles.totalFinalValue}>{formatCurrency(order.tong_tien)}</Text>
              </View>
            </View>

            {/* Cancel Button */}
            {canCancelOrder(order.trang_thai_don_hang) ? (
              <Pressable
                onPress={() => {
                  onClose()
                  onCancel(order.ma_don_hang)
                }}
                style={detailStyles.cancelBtn}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
                <Text style={detailStyles.cancelBtnText}>Hủy đơn hàng</Text>
              </Pressable>
            ) : null}

            {/* View Invoice */}
            <Pressable
              onPress={() => onViewInvoice?.(order)}
              style={detailStyles.invoiceBtn}
            >
              <Ionicons name="document-text-outline" size={18} color={colors.primary} />
              <Text style={detailStyles.invoiceBtnText}>Xem hóa đơn</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

export function OrdersScreen() {
  const { user } = useUser()
  const userId = getUserId(user)
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [invoiceOrder, setInvoiceOrder] = useState(null)

  const ordersQuery = useQuery({
    queryKey: ['customer', 'orders', userId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const response = await apiClient.get(`/customers/${userId}/orders${params.toString() ? `?${params.toString()}` : ''}`)
      return safeArray(response?.orders).map(normalizeOrder)
    },
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  })

  const cancelMutation = useMutation({
    mutationFn: async ({ orderId }) =>
      apiClient.patch(`/customers/${userId}/orders/${orderId}/cancel`, {
        reason: 'Khách hàng hủy đơn từ ứng dụng',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'orders', userId] })
    },
    onError: (error) => {
      const message = error?.response?.data?.message || 'Không thể hủy đơn hàng.'
      Alert.alert('Lỗi', message)
    },
  })

  const orders = ordersQuery.data || []

  const handleCancel = (orderId) => {
    Alert.alert(
      'Xác nhận hủy đơn',
      'Bạn chắc chắn muốn hủy đơn hàng này không?',
      [
        { text: 'Không', style: 'cancel' },
        {
          text: 'Hủy đơn',
          style: 'destructive',
          onPress: () => cancelMutation.mutate({ orderId }),
        },
      ]
    )
  }

  const renderOrderCard = ({ item }) => {
    const statusStyle = STATUS_STYLE[item.trang_thai_don_hang] || { color: colors.muted, bg: colors.cream, icon: 'help-circle-outline' }

    return (
      <Pressable
        onPress={() => {
          setSelectedOrder(item)
          setIsDetailOpen(true)
        }}
        style={({ pressed }) => [styles.orderCard, shadows.sm, pressed && { opacity: 0.93 }]}
      >
        {/* Header row */}
        <View style={styles.orderCardHeader}>
          <View style={styles.orderCodeWrap}>
            <Text style={styles.orderCode}>{item.ma_don_hang}</Text>
            <Text style={styles.orderDate}>{formatDateTime(item.ngay_tao)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Ionicons name={statusStyle.icon} size={13} color={statusStyle.color} />
            <Text style={[styles.statusText, { color: statusStyle.color }]}>
              {orderStatusLabels[item.trang_thai_don_hang] || item.trang_thai_don_hang}
            </Text>
          </View>
        </View>

        <View style={styles.orderDivider} />

        {/* Body */}
        <View style={styles.orderBody}>
          <View style={styles.orderInfoRow}>
            <Ionicons name="location-outline" size={13} color={colors.muted} />
            <Text style={styles.orderInfoText} numberOfLines={1}>{item.dia_chi_giao_hang || 'Chưa có địa chỉ'}</Text>
          </View>
          <View style={styles.orderInfoRow}>
            <Ionicons name="restaurant-outline" size={13} color={colors.muted} />
            <Text style={styles.orderInfoText}>{item.chi_tiet.length} sản phẩm</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.orderCardFooter}>
          <View>
            <Text style={styles.orderTotalLabel}>Tổng tiền</Text>
            <Text style={styles.orderTotal}>{formatCurrency(item.tong_tien)}</Text>
          </View>
          <View style={styles.orderActions}>
            {canCancelOrder(item.trang_thai_don_hang) ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.()
                  handleCancel(item.ma_don_hang)
                }}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Hủy đơn</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => {
                setSelectedOrder(item)
                setIsDetailOpen(true)
              }}
              style={styles.detailBtn}
            >
              <Text style={styles.detailBtnText}>Chi tiết</Text>
              <Ionicons name="chevron-forward" size={13} color={colors.primary} />
            </Pressable>
          </View>
        </View>
      </Pressable>
    )
  }

  return (
    <View style={styles.screen}>
      {/* Header */}
      <LinearGradient colors={['#1a0a02', '#3d1a08']} style={styles.header}>
        <Text style={styles.headerTitle}>Đơn hàng của tôi</Text>
        <Text style={styles.headerSubtitle}>{orders.length} đơn hàng</Text>
      </LinearGradient>

      {/* Status Filters */}
      <View style={styles.filterBar}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_FILTERS}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => {
            const isActive = statusFilter === item.value
            return (
              <Pressable
                onPress={() => setStatusFilter(item.value)}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            )
          }}
        />
      </View>

      {/* Loading */}
      {ordersQuery.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Đang tải đơn hàng...</Text>
        </View>
      ) : null}

      {/* Empty */}
      {!ordersQuery.isLoading && !orders.length ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="receipt-outline" size={56} color={colors.border} />
          <Text style={styles.emptyTitle}>Chưa có đơn hàng nào</Text>
          <Text style={styles.emptyText}>
            {statusFilter !== 'all'
              ? `Không có đơn hàng với trạng thái "${orderStatusLabels[statusFilter] || statusFilter}".`
              : 'Hãy đặt hàng đầu tiên của bạn!'}
          </Text>
          {statusFilter !== 'all' ? (
            <Pressable onPress={() => setStatusFilter('all')} style={styles.clearFilterBtn}>
              <Text style={styles.clearFilterText}>Xem tất cả đơn</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Orders List */}
      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrderCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onRefresh={() => ordersQuery.refetch()}
        refreshing={ordersQuery.isFetching && !ordersQuery.isLoading}
      />

      {/* Detail Modal */}
      <OrderDetailModal
        order={selectedOrder}
        visible={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false)
          setSelectedOrder(null)
        }}
        onCancel={handleCancel}
        onViewInvoice={(order) => {
          setIsDetailOpen(false)
          setInvoiceOrder(order)
        }}
      />

      {/* Invoice Modal */}
      <InvoiceModal
        order={invoiceOrder}
        visible={Boolean(invoiceOrder)}
        onClose={() => setInvoiceOrder(null)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerTitle: {
    fontSize: 28,
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
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  filterList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  filterTextActive: {
    color: '#fff',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
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
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 22,
  },
  clearFilterBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.cream,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearFilterText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },

  // Order Card
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  orderCodeWrap: {
    flex: 1,
  },
  orderCode: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0.3,
  },
  orderDate: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 3,
    fontWeight: '500',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  orderDivider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: spacing.md,
  },
  orderBody: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: 5,
  },
  orderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  orderInfoText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    paddingTop: 4,
  },
  orderTotalLabel: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  orderTotal: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.primary,
  },
  orderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cancelBtn: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  cancelBtnText: {
    color: colors.danger,
    fontWeight: '800',
    fontSize: 12,
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#fff9f5',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#ffe0c8',
  },
  detailBtnText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 12,
  },
})

// Order Detail Modal Styles
const detailStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.card,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  orderCode: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
    marginTop: 2,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
    minWidth: 100,
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    fontWeight: '700',
    textAlign: 'right',
  },
  itemsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  orderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  orderItemImage: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.cream,
  },
  orderItemImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderItemInfo: {
    flex: 1,
    gap: 2,
  },
  orderItemName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 18,
  },
  orderItemMeta: {
    fontSize: 11,
    color: colors.muted,
  },
  orderItemPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderItemQty: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  orderItemPrice: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  orderItemSubtotal: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary,
  },
  totalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  totalFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  totalFinalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  totalFinalValue: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.primary,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.xl,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.danger,
  },
})

// Invoice Modal Styles
const invoiceStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: '#fff',
    margin: spacing.md,
    borderRadius: radius.xl,
    ...shadows.sm,
  },
  storeSection: {
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.sm,
  },
  storeName: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    textTransform: 'uppercase',
  },
  storeSlogan: {
    fontSize: 12,
    color: colors.muted,
  },
  dashed: {
    height: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    borderStyle: 'dashed',
    marginVertical: spacing.xs,
  },
  infoSection: {
    gap: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  infoValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
    maxWidth: '65%',
    textAlign: 'right',
  },
  infoValueBold: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '900',
  },
  payBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  payBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
  },
  colName: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  itemPrice: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
  },
  itemQty: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  itemTotal: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  totalsSection: {
    gap: 6,
  },
  grandTotalLabel: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
  },
  footer: {
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
  },
  footerText: {
    fontSize: 12,
    color: colors.muted,
    fontStyle: 'italic',
  }
})
