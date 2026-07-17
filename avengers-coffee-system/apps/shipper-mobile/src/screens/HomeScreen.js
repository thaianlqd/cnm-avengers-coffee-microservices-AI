import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Switch,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  AppState,
  Alert,
  Animated,
  StatusBar,
  Platform,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { LinearGradient } from 'expo-linear-gradient'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency, formatDateTime } from '../lib/shipperData'

const GPS_INTERVAL_MS = 10000 // broadcast vị trí mỗi 10 giây

export function HomeScreen({ navigation }) {
  const { shipper, updateStatus } = useShipper()
  const queryClient = useQueryClient()
  const [isOnline, setIsOnline] = useState(shipper?.status === 'ACTIVE')
  const [locationGranted, setLocationGranted] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const gpsIntervalRef = useRef(null)
  const pulseAnim = useRef(new Animated.Value(1)).current
  const appStateRef = useRef(AppState.currentState)

  // --- GPS Permission & broadcast ---
  useEffect(() => {
    ;(async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      setLocationGranted(status === 'granted')
    })()
  }, [])

  const broadcastLocation = useCallback(async () => {
    if (!shipper?.id || !locationGranted) return
    try {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
      const { latitude, longitude } = loc.coords
      setCurrentLocation({ latitude, longitude })
      await apiClient.patch(`/shippers/${shipper.id}/location`, {
        latitude,
        longitude,
        updated_at: new Date().toISOString(),
      })
    } catch {
      // Silent fail — GPS broadcast is best-effort
    }
  }, [shipper?.id, locationGranted])

  // Start / stop GPS broadcast based on online status
  useEffect(() => {
    if (isOnline && locationGranted) {
      broadcastLocation() // immediate first broadcast
      gpsIntervalRef.current = setInterval(broadcastLocation, GPS_INTERVAL_MS)
    } else {
      if (gpsIntervalRef.current) {
        clearInterval(gpsIntervalRef.current)
        gpsIntervalRef.current = null
      }
    }
    return () => {
      if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current)
    }
  }, [isOnline, locationGranted, broadcastLocation])

  // Handle app state (background → foreground)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/background|inactive/) && nextState === 'active') {
        if (isOnline) broadcastLocation()
      }
      appStateRef.current = nextState
    })
    return () => sub.remove()
  }, [isOnline, broadcastLocation])

  // Pulse animation for online dot
  useEffect(() => {
    if (!isOnline) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [isOnline, pulseAnim])

  // Fetch available orders
  const { data: deliveries, isLoading, refetch } = useQuery({
    queryKey: ['availableOrders', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return []
      const [available, mine] = await Promise.all([
        apiClient.get(`/shippers/available-orders`),
        apiClient.get(`/shippers/${shipper.id}/deliveries?status=CONFIRMED`),
      ])
      const availList = Array.isArray(available) ? available : []
      const mineList = Array.isArray(mine) ? mine : []
      const mineOrderIds = new Set(mineList.map(d => d.ma_don_hang))
      const newAvail = availList.filter(o => !mineOrderIds.has(o.ma_don_hang))
      return [...mineList.map(d => ({ ...d, _already_accepted: true })), ...newAvail]
    },
    enabled: !!shipper?.id,
    refetchInterval: 20000, // auto-refresh mỗi 20s
  })

  // Fetch stats summary
  const { data: stats } = useQuery({
    queryKey: ['shipperStats', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return null
      return apiClient.get(`/shippers/${shipper.id}/stats`)
    },
    enabled: !!shipper?.id,
  })

  const toggleStatusMutation = useMutation({
    mutationFn: async (newOnline) => {
      const statusStr = newOnline ? 'ACTIVE' : 'INACTIVE'
      if (newOnline && !locationGranted) {
        Alert.alert(
          'Cần quyền GPS',
          'Để nhận đơn, ứng dụng cần truy cập vị trí GPS của bạn.',
          [{ text: 'OK' }]
        )
        return false
      }
      await updateStatus(statusStr)
      return newOnline
    },
    onSuccess: (newOnline) => {
      if (newOnline !== false) {
        setIsOnline(newOnline)
        if (newOnline) refetch()
      }
    },
    onError: () => {
      Alert.alert('Lỗi', 'Không thể cập nhật trạng thái. Vui lòng thử lại.')
    },
  })

  const acceptDelivery = useMutation({
    mutationFn: async (item) => {
      const maDonHang = item.ma_don_hang || item.id
      if (item._already_accepted) {
        return { delivery: item, alreadyAccepted: true }
      }
      return apiClient.post(`/shippers/${shipper.id}/accept/${maDonHang}`)
    },
    onSuccess: (res, item) => {
      queryClient.invalidateQueries({ queryKey: ['availableOrders'] })
      queryClient.invalidateQueries({ queryKey: ['shipperStats', shipper?.id] })
      const deliveryId = res?.delivery?.id || item?.id || item?.ma_don_hang
      navigation.navigate('OrderDetail', { deliveryId })
    },
    onError: (e) => Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không thể nhận đơn'),
  })

  const renderDeliveryItem = ({ item }) => {
    const isAccepted = item._already_accepted
    return (
      <TouchableOpacity
        style={[styles.card, isAccepted && styles.cardAccepted]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('OrderDetail', { deliveryId: item.id || item.ma_don_hang })}
      >
        <View style={styles.cardHeader}>
          <View style={styles.orderIdBadge}>
            <Ionicons name="receipt" size={14} color={colors.primary} style={{ marginRight: 4 }} />
            <Text style={styles.orderIdText}>#{(item.ma_don_hang || item.id || '').slice(0, 8).toUpperCase()}</Text>
          </View>
          {isAccepted ? (
            <View style={[styles.newBadge, { backgroundColor: colors.successBg, borderColor: colors.success + '40', borderWidth: 1 }]}>
              <Ionicons name="checkmark-circle" size={12} color={colors.success} style={{ marginRight: 4 }} />
              <Text style={[styles.newBadgeText, { color: colors.success }]}>Đã nhận</Text>
            </View>
          ) : (
            <View style={[styles.newBadge, { backgroundColor: colors.primaryBg, borderColor: colors.primary + '40', borderWidth: 1 }]}>
              <View style={[styles.newDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.newBadgeText, { color: colors.primaryDark }]}>Đơn mới</Text>
            </View>
          )}
        </View>

        <View style={styles.routeContainer}>
          <View style={styles.routeRow}>
            <View style={[styles.routeIcon, { backgroundColor: '#F3F4F6' }]}>
              <Ionicons name="storefront" size={14} color={colors.textSecondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeLabel}>Lấy hàng</Text>
              <Text style={styles.routeAddress} numberOfLines={1}>
                {item.pickup_address || 'Cửa hàng Avengers Coffee'}
              </Text>
            </View>
          </View>
          <View style={styles.routeLine} />
          <View style={styles.routeRow}>
            <View style={[styles.routeIcon, { backgroundColor: colors.primaryBg }]}>
              <Ionicons name="location" size={14} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.routeLabel}>Giao đến</Text>
              <Text style={styles.routeAddress} numberOfLines={2}>
                {item.delivery_address || 'Chưa cập nhật địa chỉ'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaBox}>
            <Ionicons name="cash" size={16} color={colors.warning} />
            <View style={{ marginLeft: 6 }}>
              <Text style={styles.metaLabel}>Thu hộ (COD)</Text>
              <Text style={[styles.metaValue, { color: colors.warning }]}>{formatCurrency(item.cod_amount || 0)}</Text>
            </View>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaBox}>
            <Ionicons name="bicycle" size={16} color={colors.success} />
            <View style={{ marginLeft: 6 }}>
              <Text style={styles.metaLabel}>Phí ship (bạn nhận)</Text>
              <Text style={[styles.metaValue, { color: colors.success }]}>{formatCurrency(item.delivery_fee || 15000)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.assignedTime}>
            <Ionicons name="time-outline" size={12} /> {formatDateTime(item.assigned_at)}
          </Text>
          {isAccepted ? (
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: colors.success }]}
              onPress={() => navigation.navigate('OrderDetail', { deliveryId: item.id || item.ma_don_hang })}
            >
              <Text style={styles.acceptBtnText}>Tiếp tục giao</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.surface} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.acceptBtn, acceptDelivery.isPending && { opacity: 0.7 }]}
              onPress={() => acceptDelivery.mutate(item)}
              disabled={acceptDelivery.isPending}
            >
              <Text style={styles.acceptBtnText}>NHẬN ĐƠN</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      
      {/* VTP Style Header */}
      <LinearGradient colors={colors.gradientRed} style={styles.header}>
        <SafeAreaView>
          <View style={styles.headerTop}>
            <View style={styles.userInfo}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color={colors.primary} />
              </View>
              <View>
                <Text style={styles.greeting}>Xin chào, {shipper?.full_name?.split(' ').pop() || 'Shipper'}</Text>
                <View style={styles.statusBadgeWrap}>
                  <View style={[styles.statusDotHeader, { backgroundColor: isOnline ? colors.success : colors.offline }]} />
                  <Text style={styles.statusTextHeader}>{isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}</Text>
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('Notification')}>
              <Ionicons name="notifications-outline" size={24} color={colors.surface} />
              <View style={styles.notifBadge} />
            </TouchableOpacity>
          </View>

          {/* Quick Stats in Header */}
          {stats && (
            <View style={styles.headerStatsRow}>
              <View style={styles.headerStatItem}>
                <Text style={styles.headerStatLabel}>Đơn hoàn thành</Text>
                <Text style={styles.headerStatValue}>{stats.completed_today || 0}</Text>
              </View>
              <View style={styles.headerStatDivider} />
              <View style={styles.headerStatItem}>
                <Text style={styles.headerStatLabel}>Doanh thu tạm tính</Text>
                <Text style={styles.headerStatValue}>{formatCurrency((stats.completed_today || 0) * 15000)}</Text>
              </View>
            </View>
          )}
        </SafeAreaView>
      </LinearGradient>

      {/* Main Content Area */}
      <View style={styles.mainContent}>
        {/* Toggle Status Card */}
        <View style={[styles.statusCard, isOnline && styles.statusCardOnline]}>
          <View style={styles.statusLeft}>
            <View style={styles.iconCircleWrap}>
              {isOnline && (
                <Animated.View style={[styles.statusPulse, { transform: [{ scale: pulseAnim }] }]} />
              )}
              <View style={[styles.iconCircle, { backgroundColor: isOnline ? colors.successBg : colors.borderLight }]}>
                <Ionicons name="power" size={24} color={isOnline ? colors.success : colors.offline} />
              </View>
            </View>
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.statusTitle}>{isOnline ? 'Bạn đang bật nhận đơn' : 'Bạn đang ngoại tuyến'}</Text>
              <Text style={styles.statusSub}>
                {isOnline
                  ? `${deliveries?.length || 0} đơn hàng đang chờ khu vực của bạn`
                  : 'Bật nhận đơn để bắt đầu chuyến xe mới'}
              </Text>
            </View>
          </View>
          <Switch
            trackColor={{ false: colors.border, true: colors.success + '60' }}
            thumbColor={isOnline ? colors.success : '#f4f3f4'}
            ios_backgroundColor={colors.border}
            onValueChange={(v) => toggleStatusMutation.mutate(v)}
            value={isOnline}
            disabled={toggleStatusMutation.isPending}
            style={{ transform: [{ scaleX: 1.1 }, { scaleY: 1.1 }] }}
          />
        </View>

        {/* Delivery List */}
        <View style={styles.listContainer}>
          <View style={styles.listHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.sectionTitle}>
                {isOnline ? 'Đơn hàng đang chờ' : 'Đơn hàng'}
              </Text>
              {deliveries?.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{deliveries.length}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
              <Ionicons name="refresh" size={18} color={colors.textSecondary} />
              <Text style={styles.refreshText}>Làm mới</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={deliveries}
            keyExtractor={(item) => item.id || item.ma_don_hang}
            renderItem={renderDeliveryItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
            }
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.emptyState}>
                  <View style={[styles.emptyIconBg, { backgroundColor: colors.primaryBg }]}>
                    <Ionicons name="document-text-outline" size={48} color={colors.primaryLight} />
                  </View>
                  <Text style={styles.emptyTitle}>Chưa có đơn hàng mới</Text>
                  <Text style={styles.emptyDesc}>
                    {isOnline
                      ? 'Không có đơn hàng nào đang chờ. Hệ thống sẽ tự động cập nhật mỗi 20 giây.'
                      : 'Bật công tắc "Nhận đơn" ở trên để bắt đầu nhận đơn hàng.'}
                  </Text>
                </View>
              ) : null
            }
          />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // VTP Header
  header: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    ...shadows.md,
  },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  userInfo: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
  },
  greeting: { fontSize: 16, fontWeight: '800', color: colors.surface, marginBottom: 2 },
  statusBadgeWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusDotHeader: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  statusTextHeader: { fontSize: 11, color: colors.surface, fontWeight: '600' },
  notifBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  notifBadge: {
    position: 'absolute', top: 8, right: 8, width: 8, height: 8,
    backgroundColor: colors.warning, borderRadius: 4, borderWidth: 1, borderColor: colors.primary,
  },

  // Header Stats
  headerStatsRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md, marginTop: spacing.lg, paddingVertical: spacing.sm,
  },
  headerStatItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  headerStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 2 },
  headerStatValue: { fontSize: 18, fontWeight: '800', color: colors.surface },
  headerStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 8 },

  // Main
  mainContent: { flex: 1, paddingHorizontal: spacing.md, marginTop: -spacing.md },

  // Status Card
  statusCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.surface, ...shadows.card,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  statusCardOnline: { borderColor: colors.success + '40', ...shadows.success },
  statusLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconCircleWrap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  statusPulse: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: colors.success + '30' },
  statusTitle: { ...typography.bodyBold, color: colors.text, fontSize: 15 },
  statusSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2, paddingRight: 10 },

  // List
  listContainer: { flex: 1, marginTop: spacing.lg },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  sectionTitle: { ...typography.h3, color: colors.text, fontSize: 18 },
  countBadge: {
    backgroundColor: colors.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginLeft: 8,
  },
  countText: { color: colors.surface, fontSize: 11, fontWeight: '800' },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.borderLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  refreshText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  listContent: { paddingBottom: spacing.xxl + 40 },

  // Delivery Card (VTP Style)
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    marginBottom: spacing.md, overflow: 'hidden', ...shadows.card,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  cardAccepted: { borderColor: colors.success, borderWidth: 1.5, ...shadows.success },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
    backgroundColor: '#F9FAFB',
  },
  orderIdBadge: { flexDirection: 'row', alignItems: 'center' },
  orderIdText: { color: colors.text, fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },
  newBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  newDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  newBadgeText: { fontSize: 11, fontWeight: '800' },

  // Route
  routeContainer: { padding: spacing.md, paddingLeft: 12 },
  routeRow: { flexDirection: 'row', alignItems: 'flex-start' },
  routeIcon: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    marginRight: 12, marginTop: 2,
  },
  routeLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  routeAddress: { fontSize: 14, color: colors.text, fontWeight: '700', marginTop: 2, lineHeight: 20 },
  routeLine: { width: 2, height: 16, backgroundColor: colors.border, marginLeft: 13, marginVertical: 2 },

  // Meta Boxes
  cardMeta: {
    flexDirection: 'row', marginHorizontal: spacing.md, marginBottom: spacing.md,
    backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.sm,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  metaBox: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  metaDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },
  metaLabel: { fontSize: 10, color: colors.textSecondary },
  metaValue: { fontSize: 14, fontWeight: '800', marginTop: 2 },

  // Footer
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
  },
  assignedTime: { fontSize: 12, color: colors.muted },
  acceptBtn: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: 10,
    borderRadius: radius.md, ...shadows.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  acceptBtnText: { color: colors.surface, fontWeight: '800', fontSize: 14, letterSpacing: 0.5 },

  // Empty State
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  emptyIconBg: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg,
  },
  emptyTitle: { ...typography.h4, color: colors.textSecondary },
  emptyDesc: {
    ...typography.body, color: colors.muted, textAlign: 'center',
    marginTop: spacing.sm, paddingHorizontal: spacing.xl, lineHeight: 22,
  },
})
