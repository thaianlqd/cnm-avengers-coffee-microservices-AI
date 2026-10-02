import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Alert,
  StatusBar,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useFocusEffect } from '@react-navigation/native'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency } from '../lib/shipperData'
import { formatBranchName, formatBranchAddress } from '../lib/branchHelper'

const STORAGE_ACTIVE_BATCH_KEY = 'shipper_active_batch_task'

export function BatchOrderScreen({ route, navigation }) {
  const { shipper } = useShipper()
  const queryClient = useQueryClient()
  const routeBatch = route?.params?.batch
  const routeDeliveries = route?.params?.deliveries

  const [batchData, setBatchData] = useState(routeBatch || null)
  const [localCompletedMap, setLocalCompletedMap] = useState({})

  // Nạp trạng thái hoàn thành cục bộ (nếu có từ bản đồ)
  const loadLocalProgress = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem('localBatchedMap')
      if (stored) {
        setLocalCompletedMap(JSON.parse(stored))
      }
    } catch (e) {}
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadLocalProgress()
    }, [loadLocalProgress])
  )

  // Query lấy nhóm ghép đang hoạt động từ Backend
  const { data: serverBatch, isLoading, isError, refetch } = useQuery({
    queryKey: ['shipperActiveBatch', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return null
      try {
        const res = await apiClient.get(`/shippers/${shipper.id}/active-batch`)
        if (res && res.active && res.batch) {
          await AsyncStorage.setItem(STORAGE_ACTIVE_BATCH_KEY, JSON.stringify(res.batch))
          return res.batch
        }
        return null
      } catch (err) {
        // Fallback đọc từ AsyncStorage
        const cached = await AsyncStorage.getItem(STORAGE_ACTIVE_BATCH_KEY)
        if (cached) return JSON.parse(cached)
        return null
      }
    },
    enabled: !!shipper?.id,
    initialData: routeBatch || undefined,
    refetchInterval: 15000,
  })

  useEffect(() => {
    if (serverBatch) {
      setBatchData(serverBatch)
    } else if (routeBatch) {
      setBatchData(routeBatch)
    }
  }, [serverBatch, routeBatch])

  // Mutation hủy nhóm ghép
  const cancelBatchMutation = useMutation({
    mutationFn: async () => {
      const batchId = batchData?.id || 'current'
      return apiClient.post(`/shippers/${shipper.id}/batch-orders/${batchId}/cancel`)
    },
    onSuccess: async () => {
      await AsyncStorage.removeItem(STORAGE_ACTIVE_BATCH_KEY)
      await AsyncStorage.removeItem('localBatchedMap')
      queryClient.invalidateQueries({ queryKey: ['availableOrders'] })
      queryClient.invalidateQueries({ queryKey: ['shipperActiveBatch'] })
      queryClient.invalidateQueries({ queryKey: ['shipperStats', shipper?.id] })
      Alert.alert(
        'Đã hủy nhóm ghép',
        'Các đơn hàng đã được tách ra để bạn có thể giao riêng lẻ.',
        [{ text: 'Về trang chủ', onPress: () => navigation.navigate('Home') }]
      )
    },
    onError: (err) => {
      Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Không thể hủy nhóm ghép')
    },
  })

  const handleConfirmCancelBatch = () => {
    Alert.alert(
      'Hủy nhóm ghép đơn',
      'Bạn có chắc chắn muốn hủy nhóm ghép đơn này? Các đơn hàng sẽ quay lại trạng thái giao riêng lẻ.',
      [
        { text: 'Giữ lại', style: 'cancel' },
        {
          text: 'Đồng ý hủy',
          style: 'destructive',
          onPress: () => cancelBatchMutation.mutate(),
        },
      ]
    )
  }

  // Chuyển sang màn hình Bản đồ lộ trình tối ưu (BatchRouteScreen)
  const handleOpenMap = () => {
    const deliveries = batchData?.deliveries || routeDeliveries || []
    if (deliveries.length === 0) {
      Alert.alert('Thông báo', 'Không có đơn hàng nào trong nhóm ghép.')
      return
    }

    const storeLat = batchData?.store_latitude || route?.params?.storeLat || 10.7834
    const storeLng = batchData?.store_longitude || route?.params?.storeLng || 106.6802
    const storeName = batchData?.store_name || route?.params?.storeName || 'Avengers Coffee'

    navigation.navigate('BatchRoute', {
      batch: batchData,
      deliveries,
      storeLat,
      storeLng,
      storeName,
    })
  }

  // Gọi điện thoại cho khách hàng
  const handleCallCustomer = (phone) => {
    if (!phone) {
      Alert.alert('Thông báo', 'Đơn hàng này không có số điện thoại người nhận.')
      return
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Lỗi', 'Không thể khởi động ứng dụng gọi điện thoại.')
    })
  }

  const deliveries = batchData?.deliveries || routeDeliveries || []
  const totalOrders = deliveries.length
  const totalCod = deliveries.reduce((sum, d) => sum + Number(d.cod_amount || 0), 0)
  const totalFee = deliveries.reduce((sum, d) => sum + Number(d.delivery_fee || 15000), 0)
  const batchCode = (batchData?.batch_code || batchData?.id || 'NHOM-GHEP').slice(0, 14).toUpperCase()

  const storeDisplayName = (() => {
    if (batchData?.store_name && !batchData.store_name.includes('_')) {
      return batchData.store_name
    }
    return formatBranchName(batchData?.branch_code || shipper?.branch_code)
  })()

  const storeDisplayAddress = (() => {
    if (batchData?.store_address && !batchData.store_address.includes('_')) {
      return batchData.store_address
    }
    return formatBranchAddress(batchData?.branch_code || shipper?.branch_code)
  })()

  if (isLoading && !batchData) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang nạp dữ liệu nhóm ghép đơn...</Text>
        </View>
      </SafeAreaView>
    )
  }

  if (!batchData && totalOrders === 0) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nhiệm Vụ Ghép Đơn</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIconBg}>
            <Ionicons name="file-tray-outline" size={48} color={colors.textSecondary} />
          </View>
          <Text style={styles.emptyTitle}>Chưa có nhóm ghép đơn nào</Text>
          <Text style={styles.emptyDesc}>
            Vui lòng chọn từ 2 đơn hàng trở lên trong danh sách nhận đơn để tạo nhóm ghép lộ trình.
          </Text>
          <TouchableOpacity
            style={styles.backHomeBtn}
            onPress={() => navigation.navigate('Home')}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back-circle-outline" size={20} color="#fff" />
            <Text style={styles.backHomeBtnText}>Quay lại nhận đơn</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Nhiệm Vụ Ghép Đơn</Text>
          <Text style={styles.headerSubtitle}>Mã nhóm: #{batchCode}</Text>
        </View>
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusBadgeText}>Đang giao</Text>
        </View>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />}
      >
        {/* Điểm lấy hàng (Cửa hàng) */}
        <View style={styles.storeCard}>
          <View style={styles.storeIconWrap}>
            <Ionicons name="storefront" size={22} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.storeTag}>Điểm lấy hàng</Text>
              <Text style={styles.storeOrderCount}>{totalOrders} đơn hàng</Text>
            </View>
            <Text style={styles.storeName} numberOfLines={1}>{storeDisplayName}</Text>
            <Text style={styles.storeAddress} numberOfLines={2}>{storeDisplayAddress}</Text>
          </View>
        </View>

        {/* Hero Button - XEM MAP LỘ TRÌNH TỐI ƯU */}
        <TouchableOpacity
          style={styles.heroMapBtn}
          onPress={handleOpenMap}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#2563EB', '#1D4ED8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroMapGradient}
          >
            <View style={styles.heroMapIconWrap}>
              <Ionicons name="map" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={styles.heroMapTitle}>Xem Bản Đồ Lộ Trình Tối Ưu</Text>
              <Text style={styles.heroMapSub}>Thuật toán tự động sắp xếp {totalOrders} điểm dừng ngắn nhất</Text>
            </View>
            <Ionicons name="chevron-forward-circle" size={28} color="#fff" style={{ opacity: 0.9 }} />
          </LinearGradient>
        </TouchableOpacity>

        {/* Tổng quan chỉ số chuyến xe */}
        <View style={styles.statsCard}>
          <View style={styles.statCol}>
            <Ionicons name="cube-outline" size={20} color={colors.primary} />
            <Text style={styles.statVal}>{totalOrders}</Text>
            <Text style={styles.statLabel}>Đơn ghép</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Ionicons name="cash-outline" size={20} color={colors.warning} />
            <Text style={[styles.statVal, { color: colors.warning }]}>{formatCurrency(totalCod)}</Text>
            <Text style={styles.statLabel}>Tổng COD</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Ionicons name="bicycle-outline" size={20} color={colors.success} />
            <Text style={[styles.statVal, { color: colors.success }]}>{formatCurrency(totalFee)}</Text>
            <Text style={styles.statLabel}>Thu nhập ship</Text>
          </View>
        </View>

        {/* Danh sách các điểm giao trong nhóm */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Danh sách điểm dừng giao hàng</Text>
          <Text style={styles.sectionCount}>{totalOrders} điểm</Text>
        </View>

        {deliveries.map((item, index) => {
          const isDone = localCompletedMap[item.id] || localCompletedMap[item.ma_don_hang] || item.status === 'DELIVERED'
          const orderCode = (item.ma_don_hang || item.id || '').slice(0, 8).toUpperCase()

          return (
            <View key={item.id || index} style={[styles.stopCard, isDone && styles.stopCardDone]}>
              <View style={styles.stopHeader}>
                <View style={styles.stopNumberBadge}>
                  <Text style={styles.stopNumberText}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.stopOrderCode}>Đơn hàng #{orderCode}</Text>
                  <Text style={styles.stopCustomerName}>{item.customer_name || 'Khách hàng'}</Text>
                </View>
                {isDone ? (
                  <View style={styles.badgeDone}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.success} />
                    <Text style={styles.badgeDoneText}>Đã giao</Text>
                  </View>
                ) : (
                  <View style={styles.badgePending}>
                    <Ionicons name="time-outline" size={14} color={colors.warning} />
                    <Text style={styles.badgePendingText}>Chờ giao</Text>
                  </View>
                )}
              </View>

              <View style={styles.stopAddressRow}>
                <Ionicons name="location-outline" size={16} color={colors.primary} style={{ marginTop: 2 }} />
                <Text style={styles.stopAddressText} numberOfLines={2}>
                  {item.delivery_address || 'Địa chỉ giao hàng'}
                </Text>
              </View>

              <View style={styles.stopFooter}>
                <View style={styles.stopMeta}>
                  <Text style={styles.stopCodText}>
                    COD: <Text style={{ fontWeight: '700', color: colors.warning }}>{formatCurrency(item.cod_amount || 0)}</Text>
                  </Text>
                  <Text style={styles.stopFeeText}>
                    Ship: <Text style={{ fontWeight: '700', color: colors.success }}>{formatCurrency(item.delivery_fee || 15000)}</Text>
                  </Text>
                </View>

                <View style={styles.stopActionBtns}>
                  {item.customer_phone ? (
                    <TouchableOpacity
                      style={styles.callBtn}
                      onPress={() => handleCallCustomer(item.customer_phone)}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="call" size={14} color="#fff" />
                      <Text style={styles.callBtnText}>Gọi khách</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    style={styles.detailBtn}
                    onPress={() => navigation.navigate('OrderDetail', { deliveryId: item.id || item.ma_don_hang })}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="receipt-outline" size={14} color={colors.text} />
                    <Text style={styles.detailBtnText}>Chi tiết</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )
        })}

        {/* Nút hủy nhóm ghép đơn */}
        <TouchableOpacity
          style={styles.cancelBatchBtn}
          onPress={handleConfirmCancelBatch}
          disabled={cancelBatchMutation.isPending}
          activeOpacity={0.85}
        >
          {cancelBatchMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <>
              <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
              <Text style={styles.cancelBatchBtnText}>Hủy nhóm ghép (Tách thành đơn lẻ)</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typography.h4,
    color: colors.text,
    fontSize: 17,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    fontSize: 11,
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    gap: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl + 20,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    ...shadows.xs,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text,
    fontSize: 18,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  backHomeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.xl,
    gap: 8,
    ...shadows.primary,
  },
  backHomeBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  storeCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  storeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  storeTag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  storeOrderCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  storeName: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 15,
    marginTop: 2,
  },
  storeAddress: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  heroMapBtn: {
    borderRadius: radius.xl,
    marginBottom: spacing.md,
    ...shadows.md,
  },
  heroMapGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
  },
  heroMapIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMapTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  heroMapSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.borderLight,
  },
  statVal: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 15,
    marginTop: 4,
  },
  statLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionTitle: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 15,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  stopCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  stopCardDone: {
    backgroundColor: '#F9FAFB',
    opacity: 0.7,
  },
  stopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stopNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopNumberText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  stopOrderCode: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  stopCustomerName: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  badgeDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgeDoneText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  badgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.warningBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  badgePendingText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.warning,
  },
  stopAddressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  stopAddressText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 19,
  },
  stopFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
  },
  stopMeta: {
    flexDirection: 'column',
    gap: 2,
  },
  stopCodText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  stopFeeText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  stopActionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    gap: 4,
  },
  callBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.borderLight,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    gap: 4,
  },
  detailBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  cancelBatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.danger + '30',
    backgroundColor: '#FEF2F2',
    borderRadius: radius.lg,
  },
  cancelBatchBtnText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
})
