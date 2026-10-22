import React, { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useIsFocused } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { deliveryArray } from '../lib/deliverySummary.mjs'
import { formatCurrency } from '../lib/shipperData'
import { LazyScrollView } from '../components/LazyScrollView'
import { Header, Button, Skeleton, EmptyState, ui } from '../components/Experience'
import OrderRouteCard from '../components/OrderRouteCard'
import { colors } from '../theme'

export default function AvailableOrderDetail({ route, navigation }) {
  const orderId = route.params.orderId
  const { shipper } = useShipper()
  const client = useQueryClient()
  const focused = useIsFocused()
  const [feedback, setFeedback] = useState('')

  const query = useQuery({
    queryKey: ['availableOrderDetail', shipper?.id, orderId],
    enabled: focused && !!shipper?.id,
    queryFn: async () => {
      const pool = deliveryArray(await apiClient.get('/shippers/available-orders', { params: { shipper_id: shipper.id } }))
      const order = pool.find((row) => (row.ma_don_hang || row.id) === orderId)
      if (!order) throw new Error('Đơn này không còn trong danh sách có thể nhận. Quay lại và làm mới danh sách nhé.')
      return order
    },
    retry: false,
  })

  const accept = useMutation({
    mutationFn: () => {
      setFeedback('')
      return apiClient.post(`/shippers/${shipper.id}/accept/${orderId}`)
    },
    onSuccess: (res) => {
      client.invalidateQueries({ queryKey: ['availableOrders'] })
      client.invalidateQueries({ queryKey: ['acceptedOrders'] })
      client.invalidateQueries({ queryKey: ['shipperStats', shipper.id] })
      if (!res?.delivery?.id) {
        setFeedback('Đơn đã nhận. Mở tab Đang giao để xem chuyến mới.')
        return
      }
      navigation.navigate('OrderDetail', { deliveryId: res.delivery.id, orderId: null })
    },
    onError: (error) =>
      setFeedback(error.response?.data?.message || 'Chưa nhận được đơn. Bạn làm mới danh sách rồi thử lại nhé.'),
  })

  const order = query.data
  const online = shipper?.status === 'ACTIVE'

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={ui.screen}>
      <Header
        title="Chi tiết đơn hàng"
        onBack={() => navigation.goBack()}
        right={
          <View style={s.badge}>
            <Text style={s.badgeText}>Đơn mới</Text>
          </View>
        }
      />
      {query.isLoading ? (
        <Skeleton count={2} />
      ) : query.isError ? (
        <EmptyState
          title="Đơn chưa sẵn sàng để nhận"
          description={
            query.error?.response
              ? 'Không tải được thông tin đơn. Kiểm tra kết nối rồi thử lại.'
              : query.error?.message
          }
          retry={() => query.refetch()}
        />
      ) : (
        order && (
          <>
            <LazyScrollView contentContainerStyle={s.body}>
              {/* Order Status Card */}
              <View style={s.statusCard}>
                <View style={s.statusIconCircle}>
                  <Ionicons name="sparkles" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.statusTitle}>Đơn mới sẵn sàng nhận</Text>
                  <Text style={s.orderCode}>#{String(orderId).slice(0, 8)}</Text>
                </View>
              </View>

              <OrderRouteCard order={order} />

              {/* Products Section matching Mockup */}
              <View style={s.itemsCard}>
                <Text style={s.sectionTitle}>Sản phẩm</Text>
                {(order.items || []).map((item, index) => (
                  <View key={index} style={s.itemRow}>
                    <View style={s.itemThumb}>
                      <Ionicons name="cafe-outline" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.itemName} numberOfLines={1}>
                        {item.ten_san_pham}
                      </Text>
                      {item.kich_co ? (
                        <Text style={s.itemSize}>Size {item.kich_co}</Text>
                      ) : null}
                    </View>
                    <Text style={s.itemQty}>x{item.so_luong || 1}</Text>
                    <Text style={s.itemPrice}>
                      {item.gia_ban != null ? formatCurrency(item.gia_ban) : ''}
                    </Text>
                  </View>
                ))}

                <View style={s.calcDivider} />

                <View style={s.calcRow}>
                  <Text style={s.calcLabel}>Phí giao</Text>
                  <Text style={s.calcValuePositive}>
                    +{order.delivery_fee != null ? formatCurrency(order.delivery_fee) : '15.000đ'}
                  </Text>
                </View>

                <View style={s.calcRow}>
                  <Text style={s.calcLabel}>Tiền thu hộ (Cod)</Text>
                  <Text style={s.calcValue}>
                    {order.cod_amount != null ? formatCurrency(order.cod_amount) : '0đ'}
                  </Text>
                </View>

                <View style={s.calcDivider} />

                <View style={s.calcRow}>
                  <Text style={s.calcTotalLabel}>Tổng cần thu</Text>
                  <Text style={s.calcTotalValue}>
                    {order.cod_amount != null ? formatCurrency(order.cod_amount) : '0đ'}
                  </Text>
                </View>
              </View>

              {!online && (
                <Text style={s.notice}>
                  Bạn đang ngoại tuyến. Bật Sẵn sàng nhận đơn tại Công việc để nhận đơn này.
                </Text>
              )}
              {feedback !== '' && (
                <Text accessibilityRole="alert" style={s.notice}>
                  {Array.isArray(feedback) ? feedback.join(' ') : feedback}
                </Text>
              )}
            </LazyScrollView>

            <View style={s.actionBar}>
              <View>
                <Text style={s.feeLabel}>Phí nhận</Text>
                <Text style={s.fee}>
                  {order.delivery_fee != null ? formatCurrency(order.delivery_fee) : '—'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="Nhận đơn này"
                  icon="checkmark-outline"
                  disabled={!online || accept.isPending}
                  busy={accept.isPending}
                  onPress={() => accept.mutate()}
                />
              </View>
            </View>
          </>
        )
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  body: {
    padding: 16,
    gap: 12,
    paddingBottom: 24,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 14,
  },
  statusIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff1f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  orderCode: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#fff1f2',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  itemsCard: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  itemThumb: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fff1f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  itemSize: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  itemQty: {
    fontSize: 12,
    color: '#64748b',
    marginHorizontal: 8,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  calcDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 10,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 4,
  },
  calcLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  calcValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  calcValuePositive: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.success,
  },
  calcTotalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  calcTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  notice: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.primary,
    paddingHorizontal: 8,
  },
  actionBar: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  feeLabel: {
    fontSize: 11,
    color: '#64748b',
  },
  fee: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.success,
    marginTop: 2,
  },
})
