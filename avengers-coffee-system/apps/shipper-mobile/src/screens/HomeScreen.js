import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Switch,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  AppState,
  Alert,
  Animated,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect } from '@react-navigation/native'
import { useShipper, globalState } from '../context/ShipperContext'
import apiClient, { getSocketUrl } from '../lib/apiClient'
import { io } from 'socket.io-client'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency, formatDateTime } from '../lib/shipperData'
import { formatBranchName, formatBranchFullTitle, formatBranchAddress, setGlobalBranchList, isBranchMatch } from '../lib/branchHelper'

const GPS_INTERVAL_MS = 10000 // broadcast vị trí mỗi 10 giây

export function HomeScreen({ navigation }) {
  const { shipper, updateStatus, refreshProfile } = useShipper()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('AVAILABLE') // 'AVAILABLE' | 'ACCEPTED' | 'BATCH'
  const [selectedOrderIds, setSelectedOrderIds] = useState([])
  const [isOnline, setIsOnline] = useState(shipper?.status === 'ACTIVE')
  const [locationGranted, setLocationGranted] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const gpsIntervalRef = useRef(null)
  const pulseAnim = useRef(new Animated.Value(1)).current
  const appStateRef = useRef(AppState.currentState)

  // Lấy nhóm ghép đang thực hiện của shipper
  const { data: activeBatchData, refetch: refetchActiveBatch } = useQuery({
    queryKey: ['shipperActiveBatch', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return null
      try {
        const res = await apiClient.get(`/shippers/${shipper.id}/active-batch`)
        return res?.active && res?.batch ? res.batch : null
      } catch (e) {
        return null
      }
    },
    enabled: !!shipper?.id,
    refetchInterval: 15000,
  })

  // Mutation tạo nhóm ghép đơn từ danh sách đơn đã chọn
  const createBatchMutation = useMutation({
    mutationFn: async (orderIds) => {
      return apiClient.post(`/shippers/${shipper.id}/batch-orders/create`, { order_ids: orderIds })
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['availableOrders'] })
      queryClient.invalidateQueries({ queryKey: ['shipperStats', shipper?.id] })
      queryClient.invalidateQueries({ queryKey: ['shipperActiveBatch'] })
      setSelectedOrderIds([])
      const batch = res?.batch
      if (batch) {
        navigation.navigate('BatchOrder', { batch, deliveries: batch.deliveries })
      } else {
        navigation.navigate('BatchOrder')
      }
    },
    onError: (e) => {
      Alert.alert('Lỗi ghép đơn', e?.response?.data?.message || e?.message || 'Không thể tạo nhóm ghép đơn.')
    },
  })

  const toggleSelectOrder = (item) => {
    const id = item.ma_don_hang || item.id
    setSelectedOrderIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id)
      } else {
        return [...prev, id]
      }
    })
  }

  const clearSelection = () => {
    setSelectedOrderIds([])
  }

  const selectedDeliveries = React.useMemo(() => {
    if (!deliveries || selectedOrderIds.length === 0) return []
    return deliveries.filter((d) => selectedOrderIds.includes(d.ma_don_hang || d.id))
  }, [deliveries, selectedOrderIds])

  const selectedTotalCod = React.useMemo(() => {
    return selectedDeliveries.reduce((sum, d) => sum + Number(d.cod_amount || 0), 0)
  }, [selectedDeliveries])

  const selectedTotalFee = React.useMemo(() => {
    return selectedDeliveries.reduce((sum, d) => sum + Number(d.delivery_fee || 15000), 0)
  }, [selectedDeliveries])

  const handleBatchCreate = () => {
    if (selectedOrderIds.length === 0) return
    if (selectedOrderIds.length === 1) {
      Alert.alert(
        'Gợi ý ghép đơn',
        'Bạn đang chọn 1 đơn hàng. Để đạt hiệu quả tối ưu lộ trình và giảm thời gian di chuyển, bạn nên ghép từ 2 đơn trở lên. Bạn có muốn tiếp tục ghép đơn này không?',
        [
          { text: 'Chọn thêm đơn', style: 'cancel' },
          {
            text: 'Tiếp tục',
            onPress: () => createBatchMutation.mutate(selectedOrderIds),
          },
        ]
      )
      return
    }
    createBatchMutation.mutate(selectedOrderIds)
  }

  // Sync profile on focus
  useFocusEffect(
    useCallback(() => {
      if (typeof refreshProfile === 'function') {
        refreshProfile().catch(() => {})
      }
    }, [refreshProfile])
  )

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
      
      // Only patch backend if we are NOT currently simulating
      if (!globalState.isSimulating) {
        await apiClient.patch(`/shippers/${shipper.id}/location`, {
          latitude,
          longitude,
          updated_at: new Date().toISOString(),
        })
      }
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
  const { data: deliveries, isLoading, isError, refetch } = useQuery({
    queryKey: ['availableOrders', shipper?.id, shipper?.branch_code],
    queryFn: async () => {
      if (!shipper?.id) return []
      try {
        const [available, mine] = await Promise.all([
          apiClient.get(`/shippers/available-orders`, {
            params: {
              shipper_id: shipper.id,
              branch_code: shipper.branch_code,
            },
          }).catch((e) => {
            console.warn('[availableOrders] Không thể tải danh sách đơn chung:', e?.message || e)
            return []
          }),
          apiClient.get(`/shippers/${shipper.id}/deliveries?status=CONFIRMED`).catch((e) => {
            console.warn('[availableOrders] Không thể tải danh sách đơn đã nhận:', e?.message || e)
            return []
          }),
        ])
        
        const availList = Array.isArray(available) ? available : (available?.data || [])
        const mineListRaw = Array.isArray(mine) ? mine : (mine?.data || [])
        
        // Enrich mineList with co_so_ma by fetching details if the backend hasn't been updated yet
        const mineList = await Promise.all(mineListRaw.map(async (d) => {
          if (!d.co_so_ma && d.id) {
            try {
              const detail = await apiClient.get(`/shippers/${shipper.id}/deliveries/${d.id}`)
              return { ...d, co_so_ma: detail?.order?.co_so_ma }
            } catch (e) {
              return d
            }
          }
          return d
        }))

        // Phân quyền theo cơ sở shipper (lọc cả phía client để đảm bảo 100% cách ly đơn chi nhánh khác)
        const filteredAvail = availList.filter((o) => {
          if (!shipper?.branch_code) return false;
          const orderBranch = o.branch_code || o.co_so_ma || o.tracking?.branch_code;
          return isBranchMatch(orderBranch, shipper.branch_code, publicBranchPayload);
        });

        const mineOrderIds = new Set(mineList.map(d => d.ma_don_hang))
        const newAvail = filteredAvail.filter(o => !mineOrderIds.has(o.ma_don_hang))
        return [...mineList.map(d => ({ ...d, _already_accepted: true })), ...newAvail]
      } catch (err) {
        console.warn('[availableOrders] Ngoại lệ khi tải đơn hàng:', err?.message || err)
        return []
      }
    },
    enabled: !!shipper?.id,
    retry: 1,
    refetchInterval: 60000, // Backup polling mỗi 60s, chính yếu dùng WebSocket tức thì
  })

  // --- Real-time WebSocket Order Updates ---
  useEffect(() => {
    if (!shipper?.id) return

    let socket = null
    try {
      const socketUrl = getSocketUrl()
      console.log('[HomeScreen Socket] Connecting to:', `${socketUrl}/notifications`)
      socket = io(`${socketUrl}/notifications`, {
        transports: ['websocket'],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
      })

      socket.on('connect', () => {
        console.log('[HomeScreen Socket] Connected! Subscribing to orders and notifications')
        socket.emit('orders:subscribe', { branchCode: shipper.branch_code })
        socket.emit('notifications:subscribe', { userId: shipper.id })
      })

      const onOrderChange = (data) => {
        console.log('[HomeScreen Socket] ⚡ Real-time order change received:', data)
        queryClient.invalidateQueries({ queryKey: ['availableOrders'] })
        queryClient.invalidateQueries({ queryKey: ['shipperStats', shipper?.id] })
        queryClient.invalidateQueries({ queryKey: ['activeBatch', shipper?.id] })
      }

      socket.on('order:event', onOrderChange)
      socket.on('order:new_available', onOrderChange)
      socket.on('order:refresh', onOrderChange)
      socket.on('notification:new', onOrderChange)

      socket.on('connect_error', (err) => {
        console.warn('[HomeScreen Socket] Connection error:', err.message)
      })
    } catch (err) {
      console.warn('[HomeScreen Socket] Init error:', err)
    }

    return () => {
      if (socket) socket.disconnect()
    }
  }, [shipper?.id, shipper?.branch_code, queryClient])

  const availableCount = React.useMemo(() => {
    return (deliveries || []).filter(d => !d._already_accepted).length
  }, [deliveries])

  const acceptedCount = React.useMemo(() => {
    return (deliveries || []).filter(d => d._already_accepted).length
  }, [deliveries])

  const filteredDeliveries = React.useMemo(() => {
    if (!deliveries) return []
    let list = []
    if (activeTab === 'AVAILABLE') {
      list = deliveries.filter(d => !d._already_accepted)
    } else {
      list = deliveries.filter(d => d._already_accepted)
    }
    
    // Luôn sort đơn mới nhất lên đầu (DESC)
    return list.sort((a, b) => {
      const dateA = new Date(a.assigned_at || 0).getTime();
      const dateB = new Date(b.assigned_at || 0).getTime();
      return dateB - dateA;
    });
  }, [deliveries, activeTab])

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


  // Lấy danh sách chi nhánh public từ DB thật
  const { data: publicBranchPayload } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/users/branches/public')
        const payload = response?.data || response || { items: [] }
        setGlobalBranchList(payload)
        return payload
      } catch (error) {
        return { items: [] }
      }
    },
    staleTime: 10 * 60 * 1000,
  })

  const renderBatchTab = () => {
    if (activeBatchData) {
      const bDeliveries = activeBatchData.deliveries || []
      const bCode = (activeBatchData.batch_code || activeBatchData.id || 'NHOM-GHEP').slice(0, 14).toUpperCase()
      const bStoreName = formatBranchName(activeBatchData.branch_code || shipper?.branch_code, publicBranchPayload)
      const bStoreAddress = formatBranchAddress(activeBatchData.branch_code || shipper?.branch_code, publicBranchPayload, activeBatchData.store_address)

      return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.activeBatchScroll} showsVerticalScrollIndicator={false}>
          {/* Thẻ Task Ghép Đơn Đang Chạy */}
          <View style={styles.activeBatchCard}>
            <View style={styles.activeBatchHeader}>
              <View>
                <Text style={styles.activeBatchTag}>Nhiệm Vụ Ghép Đơn Đang Chạy</Text>
                <Text style={styles.activeBatchCode}>#{bCode}</Text>
              </View>
              <View style={styles.activeBatchStatusBadge}>
                <View style={styles.activeBatchStatusDot} />
                <Text style={styles.activeBatchStatusText}>Đang giao</Text>
              </View>
            </View>

            <View style={styles.activeBatchStoreRow}>
              <View style={styles.activeBatchStoreIcon}>
                <Ionicons name="storefront" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeBatchStoreName}>{bStoreName}</Text>
                <Text style={styles.activeBatchStoreAddress} numberOfLines={2}>{bStoreAddress}</Text>
              </View>
            </View>

            <View style={styles.activeBatchStatsRow}>
              <View style={styles.activeBatchStatItem}>
                <Text style={styles.activeBatchStatLabel}>Số đơn</Text>
                <Text style={styles.activeBatchStatValue}>{bDeliveries.length}</Text>
              </View>
              <View style={styles.activeBatchStatDivider} />
              <View style={styles.activeBatchStatItem}>
                <Text style={styles.activeBatchStatLabel}>Tổng COD</Text>
                <Text style={[styles.activeBatchStatValue, { color: colors.warning }]}>{formatCurrency(activeBatchData.total_cod || 0)}</Text>
              </View>
              <View style={styles.activeBatchStatDivider} />
              <View style={styles.activeBatchStatItem}>
                <Text style={styles.activeBatchStatLabel}>Tiền ship</Text>
                <Text style={[styles.activeBatchStatValue, { color: colors.success }]}>{formatCurrency(activeBatchData.total_fee || 15000 * bDeliveries.length)}</Text>
              </View>
            </View>

            {/* Nút Xem Bản Đồ Lộ Trình Tối Ưu */}
            <TouchableOpacity
              style={styles.activeBatchMapBtn}
              onPress={() => {
                navigation.navigate('BatchRoute', {
                  batch: activeBatchData,
                  deliveries: bDeliveries,
                  storeLat: activeBatchData.store_latitude,
                  storeLng: activeBatchData.store_longitude,
                  storeName: activeBatchData.store_name,
                })
              }}
              activeOpacity={0.88}
            >
              <LinearGradient colors={['#2563EB', '#1D4ED8']} style={styles.activeBatchMapGradient}>
                <Ionicons name="map" size={22} color="#fff" />
                <Text style={styles.activeBatchMapBtnText}>Xem Bản Đồ Lộ Trình Tối Ưu</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Nút Chi Tiết Task Ghép Đơn */}
            <TouchableOpacity
              style={styles.activeBatchDetailBtn}
              onPress={() => navigation.navigate('BatchOrder', { batch: activeBatchData, deliveries: bDeliveries })}
              activeOpacity={0.85}
            >
              <Ionicons name="list-outline" size={18} color={colors.text} />
              <Text style={styles.activeBatchDetailBtnText}>Chi tiết danh sách điểm giao</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )
    }

    const availableToBatch = (deliveries || []) // Bỏ lọc !d._already_accepted để cho phép ghép cả đơn "Đang giao"
    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.devScrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.devContainer}>
          <View style={styles.devIconWrapper}>
            <View style={styles.devIconPulse}>
              <Ionicons name="git-network-outline" size={44} color={colors.primary} />
            </View>
          </View>

          <View style={styles.devBadge}>
            <Ionicons name="flash-outline" size={14} color={colors.primary} />
            <Text style={styles.devBadgeText}>Tối ưu hóa hành trình</Text>
          </View>

          <Text style={styles.devTitle}>Ghép Đơn Tuyến Đường</Text>
          <Text style={styles.devDescription}>
            Hệ thống phân tích và ghép các đơn hàng cùng lộ trình để tối ưu quãng đường di chuyển và nâng cao thu nhập cho bạn.
          </Text>

          {availableToBatch.length > 0 ? (
            <View style={styles.quickBatchBox}>
              <Text style={styles.quickBatchTitle}>Đang có {availableToBatch.length} đơn hàng có thể ghép</Text>
              <Text style={styles.quickBatchSubtitle}>
                Bạn có thể qua tab "Nhận đơn" hoặc "Đang giao", tick chọn các đơn hàng để gom chuyến và nhấn nút "GHÉP ĐƠN".
              </Text>
              <TouchableOpacity
                style={styles.goToAvailableBtn}
                onPress={() => setActiveTab('AVAILABLE')}
                activeOpacity={0.85}
              >
                <Ionicons name="checkbox-outline" size={20} color="#fff" />
                <Text style={styles.goToAvailableBtnText}>Bắt đầu chọn đơn để ghép</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.quickBatchBox}>
              <Text style={styles.quickBatchSubtitle}>
                Hiện tại chưa có đơn hàng mới nào tại chi nhánh. Hệ thống sẽ tự động cập nhật ngay khi có đơn mới.
              </Text>
              <TouchableOpacity
                style={styles.devBackBtn}
                onPress={() => setActiveTab('AVAILABLE')}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-back-circle" size={20} color="#fff" />
                <Text style={styles.devBackBtnText}>Quay lại danh sách nhận đơn</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.devFeatureList}>
            <View style={styles.devFeatureItem}>
              <View style={[styles.devFeatureIconBg, { backgroundColor: colors.infoBg }]}>
                <Ionicons name="navigate-outline" size={20} color={colors.info} />
              </View>
              <View style={styles.devFeatureTextCol}>
                <Text style={styles.devFeatureTitle}>Tối ưu hóa lộ trình</Text>
                <Text style={styles.devFeatureSub}>Tự động tính toán đường đi ngắn nhất giữa các điểm lấy và giao hàng.</Text>
              </View>
            </View>

            <View style={styles.devFeatureItem}>
              <View style={[styles.devFeatureIconBg, { backgroundColor: colors.successBg }]}>
                <Ionicons name="cash-outline" size={20} color={colors.success} />
              </View>
              <View style={styles.devFeatureTextCol}>
                <Text style={styles.devFeatureTitle}>Gia tăng thu nhập</Text>
                <Text style={styles.devFeatureSub}>Nhận đồng thời nhiều đơn hàng cùng hướng, giảm bớt chi phí di chuyển.</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    )
  }

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
      
      const resDeliveryId = res?.delivery?.id || res?.delivery?.ma_don_hang
      const fallbackId = item?.ma_don_hang || item?.id
      const deliveryId = resDeliveryId || fallbackId

      if (!deliveryId) {
        Alert.alert('Lỗi', 'Không lấy được mã đơn hàng. Vui lòng tải lại trang.')
        return
      }

      navigation.navigate('OrderDetail', { deliveryId })
    },
    onError: (e) => {
      console.error('Accept Order Error:', e?.response?.data || e?.message)
      Alert.alert('Lỗi', e?.response?.data?.message || e?.message || 'Không thể nhận đơn')
    },
  })

  const renderDeliveryItem = ({ item }) => {
    const isAccepted = item._already_accepted
    const itemId = item.ma_don_hang || item.id
    const isSelected = selectedOrderIds.includes(itemId)

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isAccepted && styles.cardAccepted,
          isSelected && styles.cardSelected,
        ]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('OrderDetail', { deliveryId: itemId })}
      >
        <View style={styles.cardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Nút tick chọn ghép đơn */}
            <TouchableOpacity
              style={styles.checkboxTouch}
              onPress={() => toggleSelectOrder(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isSelected ? (
                <View style={styles.checkboxChecked}>
                  <Ionicons name="checkmark" size={13} color="#fff" />
                </View>
              ) : (
                <View style={styles.checkboxUnchecked} />
              )}
            </TouchableOpacity>

            <View style={styles.orderIdBadge}>
              <Ionicons name="receipt" size={14} color={colors.primary} style={{ marginRight: 4 }} />
              <Text style={styles.orderIdText}>#{(item.ma_don_hang || item.id || '').slice(0, 8).toUpperCase()}</Text>
            </View>
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
              <Text style={styles.routeLabel}>
                {(() => {
                   if (item?.store_name && !item.store_name.includes('_')) {
                     return item.store_name;
                   }
                   const code = item?.co_so_ma || item?.branch_code || shipper?.branch_code;
                   return formatBranchName(code, publicBranchPayload);
                })()}
              </Text>
              <Text style={styles.routeAddress} numberOfLines={2}>
                {(() => {
                   if (item?.store_address && !item.store_address.includes('_')) {
                     return item.store_address;
                   }
                   const code = item?.co_so_ma || item?.branch_code || shipper?.branch_code;
                   return formatBranchAddress(code, publicBranchPayload, item?.pickup_address);
                })()}
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

        {(item.chi_tiet || item.items) && (item.chi_tiet || item.items).length > 0 && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <View style={{ backgroundColor: '#f8fafc', padding: 10, borderRadius: 8, borderStyle: 'dashed', borderWidth: 1, borderColor: '#cbd5e1' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6 }}>CHI TIẾT MÓN ({(item.chi_tiet || item.items).reduce((sum, i) => sum + (i.so_luong || 1), 0)}):</Text>
              {(item.chi_tiet || item.items).map((ct, idx) => (
                <Text key={idx} style={{ fontSize: 13, color: '#334155', marginBottom: 2 }}>
                  <Text style={{ fontWeight: '600' }}>{ct.so_luong || 1}x</Text> {ct.ten_san_pham} {ct.size || ct.kich_co ? `(Size ${ct.size || ct.kich_co})` : ''}
                </Text>
              ))}
            </View>
          </View>
        )}

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
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.greeting}>Xin chào, {shipper?.full_name?.split(' ').pop() || 'Shipper'}</Text>
                <View style={styles.statusRow}>
                  <View style={styles.statusBadgeWrap}>
                    <View style={[styles.statusDotHeader, { backgroundColor: isOnline ? colors.success : colors.offline }]} />
                    <Text style={styles.statusTextHeader}>{isOnline ? 'Đang hoạt động' : 'Ngoại tuyến'}</Text>
                  </View>
                  {shipper?.branch_code ? (
                    <View style={styles.branchBadgeHeader}>
                      <Ionicons name="storefront" size={11} color="#FFF7ED" />
                      <Text style={styles.branchTextHeader} numberOfLines={1}>
                        {formatBranchName(shipper.branch_code, publicBranchPayload)}
                      </Text>
                    </View>
                  ) : null}
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
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.statusTitle}>{isOnline ? 'Bạn đang bật nhận đơn' : 'Bạn đang ngoại tuyến'}</Text>
              <Text style={styles.statusSub}>
                {isOnline
                  ? (shipper?.branch_code
                      ? `${deliveries?.length || 0} đơn hàng tại ${formatBranchName(shipper.branch_code, publicBranchPayload)}`
                      : `${deliveries?.length || 0} đơn hàng đang chờ`)
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
              {filteredDeliveries?.length > 0 && (
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{filteredDeliveries.length}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
              <Ionicons name="refresh" size={18} color={colors.textSecondary} />
              <Text style={styles.refreshText}>Làm mới</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tabsContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'AVAILABLE' && styles.tabBtnActive]}
              onPress={() => setActiveTab('AVAILABLE')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="flash"
                size={14}
                color={activeTab === 'AVAILABLE' ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.tabText, activeTab === 'AVAILABLE' && styles.tabTextActive]}>
                Nhận đơn
              </Text>
              {availableCount > 0 && (
                <View style={[styles.tabBadgeMini, activeTab === 'AVAILABLE' && styles.tabBadgeMiniActive]}>
                  <Text style={[styles.tabBadgeMiniText, activeTab === 'AVAILABLE' && styles.tabBadgeMiniTextActive]}>
                    {availableCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'ACCEPTED' && styles.tabBtnActive]}
              onPress={() => setActiveTab('ACCEPTED')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="bicycle"
                size={15}
                color={activeTab === 'ACCEPTED' ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.tabText, activeTab === 'ACCEPTED' && styles.tabTextActive]}>
                Đang giao
              </Text>
              {acceptedCount > 0 && (
                <View style={[styles.tabBadgeMini, activeTab === 'ACCEPTED' && styles.tabBadgeMiniActive]}>
                  <Text style={[styles.tabBadgeMiniText, activeTab === 'ACCEPTED' && styles.tabBadgeMiniTextActive]}>
                    {acceptedCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'BATCH' && styles.tabBtnActive]}
              onPress={() => setActiveTab('BATCH')}
              activeOpacity={0.8}
            >
              <Ionicons
                name="layers"
                size={14}
                color={activeTab === 'BATCH' ? colors.primary : colors.textSecondary}
              />
              <Text style={[styles.tabText, activeTab === 'BATCH' && styles.tabTextActive]}>
                Ghép đơn
              </Text>
              {activeBatchData && (
                <View style={styles.tabActiveDot} />
              )}
            </TouchableOpacity>
          </View>

          {activeTab === 'BATCH' ? (
            renderBatchTab()
          ) : (
            <FlatList
              data={filteredDeliveries}
              keyExtractor={(item) => item.id || item.ma_don_hang}
              renderItem={renderDeliveryItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              refreshControl={
                <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
              }
              ListEmptyComponent={
                isLoading ? (
                  <View style={[styles.emptyState, { paddingTop: 40 }]}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.emptyTitle, { marginTop: 14, fontSize: 15 }]}>
                      Đang đồng bộ danh sách đơn hàng...
                    </Text>
                  </View>
                ) : isError ? (
                  <View style={[styles.emptyState, { paddingTop: 30 }]}>
                    <View style={[styles.emptyIconBg, { backgroundColor: '#fee2e2' }]}>
                      <Ionicons name="cloud-offline-outline" size={44} color="#dc2626" />
                    </View>
                    <Text style={styles.emptyTitle}>Không thể kết nối máy chủ</Text>
                    <Text style={styles.emptyDesc}>
                      Hệ thống không thể tải dữ liệu đơn hàng. Vui lòng kiểm tra kết nối mạng và thử lại.
                    </Text>
                    <TouchableOpacity
                      style={{
                        marginTop: 16,
                        backgroundColor: colors.primary,
                        paddingVertical: 10,
                        paddingHorizontal: 22,
                        borderRadius: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      }}
                      onPress={() => refetch()}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="refresh-outline" size={16} color="#ffffff" />
                      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Tải lại danh sách</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <View style={[styles.emptyIconBg, { backgroundColor: colors.primaryBg }]}>
                      <Ionicons name="document-text-outline" size={48} color={colors.primaryLight} />
                    </View>
                    <Text style={styles.emptyTitle}>Chưa có đơn hàng mới</Text>
                    <Text style={styles.emptyDesc}>
                      {isOnline
                        ? (shipper?.branch_code
                            ? `Hiện tại ${formatBranchName(shipper.branch_code, publicBranchPayload)} chưa có đơn mới. Hệ thống sẽ tự động cập nhật mỗi 20 giây.`
                            : 'Tài khoản chưa được phân công cơ sở hoạt động. Vui lòng liên hệ quản trị viên.')
                        : 'Bật công tắc "Nhận đơn" ở trên để bắt đầu nhận đơn hàng.'}
                    </Text>
                  </View>
                )
              }
            />
          )}
        </View>
      </View>

      {/* Floating Action Bar khi có đơn được chọn */}
      {selectedOrderIds.length > 0 && (
        <View style={styles.floatingActionBar}>
          <View style={styles.floatingInfo}>
            <View style={styles.floatingBadgeRow}>
              <View style={styles.floatingBadge}>
                <Ionicons name="layers-outline" size={13} color="#fff" />
                <Text style={styles.floatingBadgeText}>{selectedOrderIds.length} đơn</Text>
              </View>
              <TouchableOpacity onPress={clearSelection} style={styles.floatingClearBtn} activeOpacity={0.7}>
                <Ionicons name="close-circle-outline" size={14} color={colors.textSecondary} />
                <Text style={styles.floatingClearText}>Bỏ chọn</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.floatingMetaText} numberOfLines={1}>
              COD: <Text style={{ fontWeight: '700', color: colors.warning }}>{formatCurrency(selectedTotalCod)}</Text>
              {'  •  '}
              Ship: <Text style={{ fontWeight: '700', color: colors.success }}>{formatCurrency(selectedTotalFee)}</Text>
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.floatingActionBtn, createBatchMutation.isPending && { opacity: 0.7 }]}
            onPress={handleBatchCreate}
            disabled={createBatchMutation.isPending}
            activeOpacity={0.85}
          >
            {createBatchMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="git-network-outline" size={17} color="#fff" />
                <Text style={styles.floatingActionBtnText}>GHÉP ĐƠN</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
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
  userInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.sm },
  avatar: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
  },
  greeting: { fontSize: 16, fontWeight: '800', color: colors.surface, marginBottom: 2 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  statusBadgeWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12,
    alignSelf: 'flex-start',
  },
  branchBadgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    gap: 4,
    maxWidth: 190,
  },
  branchTextHeader: {
    fontSize: 11,
    color: colors.surface,
    fontWeight: '700',
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

  // Tabs (3 cột cân đối, thanh lịch)
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#EEF2F6',
    borderRadius: 12,
    padding: 3,
    marginBottom: spacing.md,
    height: 42,
    alignItems: 'center',
  },
  tabBtn: {
    flex: 1,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    gap: 5,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...shadows.sm,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabBadgeMini: {
    backgroundColor: '#CBD5E1',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeMiniActive: {
    backgroundColor: colors.primaryBg,
  },
  tabBadgeMiniText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  tabBadgeMiniTextActive: {
    color: colors.primary,
  },
  tabActiveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.success,
  },

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

  // ─── Tab Dev Badge ────────────────────────────────────────────────
  tabDevBadge: {
    backgroundColor: colors.borderLight,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tabDevBadgeActive: {
    backgroundColor: colors.primaryBg,
  },
  tabDevBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.muted,
  },
  tabDevBadgeTextActive: {
    color: colors.primary,
  },

  // ─── Feature In Development UI ────────────────────────────────────
  devScrollContent: {
    paddingHorizontal: 0,
    paddingBottom: spacing.xxl + 80,
  },
  devContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.card,
    marginTop: spacing.xs,
  },
  devIconWrapper: {
    marginBottom: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devIconPulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary + '30',
  },
  devBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primaryBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  devBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.3,
  },
  devTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  devDescription: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  devFeatureList: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  devFeatureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  devFeatureIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    marginTop: 2,
  },
  devFeatureTextCol: {
    flex: 1,
  },
  devFeatureTitle: {
    ...typography.bodyBold,
    color: colors.text,
    fontSize: 14,
    marginBottom: 2,
  },
  devFeatureSub: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  devBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    width: '100%',
    ...shadows.primary,
  },
  devBackBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },

  // ─── Checkbox Styles ──────────────────────────────────────────────
  checkboxTouch: {
    padding: 2,
    marginRight: 2,
  },
  checkboxUnchecked: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.8,
    borderColor: '#9CA3AF',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.xs,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
    backgroundColor: '#FFF7ED',
    ...shadows.md,
  },

  // ─── Floating Action Bar ──────────────────────────────────────────
  floatingActionBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 24 : 16,
    left: 16,
    right: 16,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: colors.primary + '30',
    ...shadows.lg,
    elevation: 8,
    zIndex: 999,
  },
  floatingInfo: {
    flex: 1,
    marginRight: 12,
  },
  floatingBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  floatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  floatingBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  floatingClearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  floatingClearText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  floatingMetaText: {
    fontSize: 12,
    color: colors.text,
    marginTop: 2,
  },
  floatingActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.success,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: radius.lg,
    ...shadows.md,
  },
  floatingActionBtnText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },

  // ─── Active Batch Tab Styles ──────────────────────────────────────
  activeBatchScroll: {
    paddingBottom: spacing.xxl + 40,
  },
  activeBatchCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary + '20',
    ...shadows.card,
    marginBottom: spacing.md,
  },
  activeBatchHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingBottom: spacing.sm,
    marginBottom: spacing.sm,
  },
  activeBatchTag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeBatchCode: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    marginTop: 1,
  },
  activeBatchStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  activeBatchStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  activeBatchStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.success,
  },
  activeBatchStoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  activeBatchStoreIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  activeBatchStoreName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  activeBatchStoreAddress: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  activeBatchStatsRow: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  activeBatchStatItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBatchStatDivider: {
    width: 1,
    backgroundColor: colors.borderLight,
    marginVertical: 4,
  },
  activeBatchStatLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  activeBatchStatValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  activeBatchMapBtn: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    ...shadows.md,
  },
  activeBatchMapGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
  },
  activeBatchMapBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  activeBatchDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.bg,
  },
  activeBatchDetailBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  quickBatchBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    marginBottom: spacing.md,
    width: '100%',
    ...shadows.xs,
  },
  quickBatchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  quickBatchSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  goToAvailableBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
    ...shadows.primary,
  },
  goToAvailableBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
})

