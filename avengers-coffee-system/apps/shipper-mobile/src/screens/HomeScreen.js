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
  SafeAreaView,
  AppState,
  Alert,
  Animated,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import { LinearGradient } from 'expo-linear-gradient'
import { useFocusEffect } from '@react-navigation/native'
import { useShipper, globalState } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency, formatDateTime } from '../lib/shipperData'

const GPS_INTERVAL_MS = 10000 // broadcast vị trí mỗi 10 giây

export function HomeScreen({ navigation }) {
  const { shipper, updateStatus } = useShipper()
  const queryClient = useQueryClient()
  const [isBatching, setIsBatching] = useState(false)
  const [activeTab, setActiveTab] = useState('AVAILABLE') // 'AVAILABLE' | 'ACCEPTED' | 'BATCH'
  const [isOnline, setIsOnline] = useState(shipper?.status === 'ACTIVE')
  const [locationGranted, setLocationGranted] = useState(false)
  const [currentLocation, setCurrentLocation] = useState(null)
  const [demoBatch, setDemoBatch] = useState(null) // batch tự ghép để test
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
  const { data: deliveries, isLoading, refetch } = useQuery({
    queryKey: ['availableOrders', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return []
      // apiClient queue automatically prevents OkHttp HTTP/2 concurrent deadlock over Ngrok!
      const [available, mine] = await Promise.all([
        apiClient.get(`/shippers/available-orders`),
        apiClient.get(`/shippers/${shipper.id}/deliveries?status=CONFIRMED`),
      ])
      
      const availList = Array.isArray(available) ? available : []
      const mineListRaw = Array.isArray(mine) ? mine : []
      
      // Enrich mineList with co_so_ma by fetching details if the backend hasn't been updated yet
      const mineList = await Promise.all(mineListRaw.map(async (d) => {
        if (!d.co_so_ma) {
          try {
            const detail = await apiClient.get(`/shippers/${shipper.id}/deliveries/${d.id}`)
            return { ...d, co_so_ma: detail?.order?.co_so_ma }
          } catch (e) {
            return d
          }
        }
        return d
      }))

      const mineOrderIds = new Set(mineList.map(d => d.ma_don_hang))
      const newAvail = availList.filter(o => !mineOrderIds.has(o.ma_don_hang))
      return [...mineList.map(d => ({ ...d, _already_accepted: true })), ...newAvail]
    },
    enabled: !!shipper?.id,
    refetchInterval: 20000, // auto-refresh mỗi 20s
  })

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

  // ─── Tạo Demo Batch từ đơn hiện có ─────────────────────────────
  const createDemoBatch = async () => {
    if (!deliveries || deliveries.length === 0) {
      Alert.alert('Thông báo', 'Không có đơn hàng nào để ghép.')
      return
    }

    // CHỈ ghép các đơn ĐÃ NHẬN (nằm trong tab Tiếp tục giao)
    const accepted = deliveries.filter(d => d._already_accepted)
    const toGroup = accepted.slice(0, 4)

    if (toGroup.length < 2) {
      Alert.alert(
        'Chưa đủ đơn hàng để ghép',
        `Bạn cần nhận ít nhất 2 đơn hàng (đơn sẽ chuyển sang tab Tiếp tục giao) để có thể ghép tuyến thực tế!`,
        [{ text: 'OK' }]
      )
      return
    }

    setIsBatching(true)

    // Dictionary tọa độ các Quận/Huyện HCM để fallback
    const districtCoords = {
      'bình tân': { lat: 10.7653, lng: 106.6083 },
      'btan': { lat: 10.7653, lng: 106.6083 }, // alias
      'bình thạnh': { lat: 10.8106, lng: 106.7093 },
      'gò vấp': { lat: 10.8387, lng: 106.6661 },
      'phú nhuận': { lat: 10.7991, lng: 106.6781 },
      'tân bình': { lat: 10.8015, lng: 106.6526 },
      'tân phú': { lat: 10.7901, lng: 106.6262 },
      'thủ đức': { lat: 10.8494, lng: 106.7537 },
      'quận 1': { lat: 10.7756, lng: 106.7019 },
      'quận 2': { lat: 10.7876, lng: 106.7416 },
      'quận 3': { lat: 10.7834, lng: 106.6802 },
      'quận 4': { lat: 10.7588, lng: 106.7012 },
      'quận 5': { lat: 10.7540, lng: 106.6631 },
      'quận 6': { lat: 10.7481, lng: 106.6353 },
      'quận 7': { lat: 10.7340, lng: 106.7216 },
      'quận 8': { lat: 10.7249, lng: 106.6346 },
      'quận 9': { lat: 10.8277, lng: 106.8123 },
      'quận 10': { lat: 10.7743, lng: 106.6675 },
      'quận 11': { lat: 10.7628, lng: 106.6455 },
      'quận 12': { lat: 10.8671, lng: 106.6413 },
      'hóc môn': { lat: 10.8841, lng: 106.5930 },
      'bình chánh': { lat: 10.6865, lng: 106.5933 },
      'nhà bè': { lat: 10.6558, lng: 106.7247 },
      'củ chi': { lat: 11.0252, lng: 106.4975 },
      'cần giờ': { lat: 10.5050, lng: 106.8770 }
    }

    // Helper fetch toạ độ từ Nominatim (OpenStreetMap)
    const geocodeAddress = async (address) => {
      try {
        // Tối ưu chuỗi tìm kiếm cho Nominatim (bỏ các từ phường, quận, số nhà quá chi tiết có thể làm Nominatim bối rối)
        const cleanAddr = address
          .replace(/phường\s*[a-zA-Z0-9]*\s*,?/gi, '')
          .replace(/quận\s*/gi, '')
          .replace(/thành phố\s*/gi, '')
          .replace(/tỉnh\s*/gi, '')
          .trim()
        
        const query = encodeURIComponent(cleanAddr + ', Hồ Chí Minh, Việt Nam')
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`, {
          headers: { 'User-Agent': 'AvengersCoffeeShipperApp/2.0' }
        })
        const data = await res.json()
        if (data && data.length > 0) {
          return { lat: Number(data[0].lat), lng: Number(data[0].lon) }
        }
      } catch (e) {
        console.log('Geocode error:', e)
      }
      return null
    }

    // Lưu tọa độ ảo theo địa chỉ để các đơn cùng địa chỉ sẽ cùng chung cụm tọa độ
    const addressMockCoords = {}
    let mockCounter = 0
    const resolvedDeliveries = []

    for (let i = 0; i < toGroup.length; i++) {
      const d = toGroup[i]
      let lat = Number(d.delivery_latitude)
      let lng = Number(d.delivery_longitude)
      const rawAddr = d.delivery_address || `Địa chỉ giao hàng ${i + 1}`

      // Nếu không có tọa độ thực từ backend -> Call Nominatim
      if (!lat || !lng) {
        const geo = await geocodeAddress(rawAddr)
        if (geo) {
          lat = geo.lat
          lng = geo.lng
        } else {
          // Fallback cuối cùng nếu Nominatim không tìm thấy: Tìm theo Quận/Huyện trong chuỗi địa chỉ
          const addrKey = rawAddr.toLowerCase().trim()
          let fallbackLat = 10.7769 // Bến Thành default
          let fallbackLng = 106.7009

          for (const [district, coords] of Object.entries(districtCoords)) {
             if (addrKey.includes(district)) {
                fallbackLat = coords.lat
                fallbackLng = coords.lng
                break
             }
          }

          if (addressMockCoords[addrKey]) {
             lat = addressMockCoords[addrKey].lat + 0.0002
             lng = addressMockCoords[addrKey].lng + 0.0002
             addressMockCoords[addrKey] = { lat, lng }
          } else {
             mockCounter++
             // Cộng thêm một chút random offset (từ -0.01 đến 0.01) để các đơn trong cùng 1 quận không đè lên nhau nếu Nominatim tạch
             lat = fallbackLat + (Math.random() * 0.01 - 0.005)
             lng = fallbackLng + (Math.random() * 0.01 - 0.005)
             addressMockCoords[addrKey] = { lat, lng }
          }
        }
      }

      resolvedDeliveries.push({
        id: d.id || d.ma_don_hang,
        ma_don_hang: d.ma_don_hang || d.id,
        delivery_address: rawAddr,
        delivery_latitude: lat,
        delivery_longitude: lng,
        delivery_fee: d.delivery_fee || 15000,
        cod_amount: d.cod_amount || 0,
      })
    }

    // Tạo batch object giả lập
    const mockBatch = {
      id: `DEMO_BATCH_${Date.now()}`,
      zone_label: 'Tuyến đường AI Tối ưu',
      total_distance_km: (resolvedDeliveries.length * 1.8).toFixed(1),
      estimated_time: resolvedDeliveries.length * 12,
      deliveries: resolvedDeliveries,
    }

    setDemoBatch(mockBatch)
    setIsBatching(false)
    setActiveTab('BATCH')
  }

  // Lấy danh sách chi nhánh public từ DB thật
  const { data: publicBranchPayload } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      try {
        // Tuỳ theo API backend trả về data luôn hay bọc trong data
        const response = await apiClient.get('/users/branches/public')
        return response?.data || response || { items: [] }
      } catch (error) {
        // Silent fail for public branches as we have fallback logic.
        // Prevents spamming the console when Ngrok free-tier drops connections (503).
        return { items: [] }
      }
    },
    staleTime: 10 * 60 * 1000,
  })

  // Toạ độ mặc định fallback cho các chi nhánh (do CSDL gốc không lưu toạ độ)
  const BRANCH_COORDS_FALLBACK = {
    // Chi nhánh TP.HCM
    'HCM_DIEN_BIEN_PHU': { lat: 10.7834, lng: 106.6802 },
    'HCM_LY_TU_TRONG': { lat: 10.7756, lng: 106.7019 },
    'HCM_TON_THAT_THIEP': { lat: 10.7730, lng: 106.7030 },
    // Chi nhánh Hà Nội
    'HN_LINH_DAM_CT3': { lat: 20.9631, lng: 105.8249 },
    'HN_LAM_VIEN_COMPLEX': { lat: 21.0378, lng: 105.7942 },
    'HN_DU_THUYEN': { lat: 21.0461, lng: 105.8361 },
    // Đà Nẵng
    'DN_INDOCHINA_RIVERSIDE': { lat: 16.0683, lng: 108.2241 },
    'INDOCHINA_RIVERSIDE': { lat: 16.0683, lng: 108.2241 },
    'DN_NGUYEN_VAN_THOAI': { lat: 16.0560, lng: 108.2435 },
    'DN_VTV8_BACH_DANG': { lat: 16.0645, lng: 108.2238 },
  }

  const handleStartDemoBatch = () => {
    if (!demoBatch) return
    const totalFee = demoBatch.deliveries.reduce((s, d) => s + (d.delivery_fee || 0), 0)
    
    const branchKey = shipper?.branch_code || 'HCM_DIEN_BIEN_PHU'
    let storeName = 'Avengers Coffee'
    let storeLat = 10.7836
    let storeLng = 106.6896
    
    // 1. Gán Tên Quán CHUẨN XÁC từ API (CSDL Thật)
    const allBranches = publicBranchPayload?.items || []
    const realBranch = allBranches.find(b => 
       b.ma_chi_nhanh === branchKey || 
       b.co_so_ma === branchKey || 
       b.branch_code === branchKey
    )
    if (realBranch) {
       storeName = realBranch.ten_chi_nhanh || realBranch.ten_co_so || realBranch.name || storeName
       if (realBranch.toa_do?.lat || realBranch.lat || realBranch.latitude) {
         storeLat = Number(realBranch.toa_do?.lat || realBranch.lat || realBranch.latitude)
         storeLng = Number(realBranch.toa_do?.lng || realBranch.lng || realBranch.longitude)
       } else if (BRANCH_COORDS_FALLBACK[branchKey]) {
         storeLat = BRANCH_COORDS_FALLBACK[branchKey].lat
         storeLng = BRANCH_COORDS_FALLBACK[branchKey].lng
       }
    } else if (BRANCH_COORDS_FALLBACK[branchKey]) {
       // Nếu API chưa kịp load thì fallback
       storeLat = BRANCH_COORDS_FALLBACK[branchKey].lat
       storeLng = BRANCH_COORDS_FALLBACK[branchKey].lng
       storeName = branchKey
    }

    Alert.alert(
      '🗺️ Bắt đầu tuyến ghép Demo',
      `${demoBatch.deliveries.length} đơn • Tổng phí: ${formatCurrency(totalFee)}\n\nAI sẽ sắp xếp lộ trình xuất phát từ ${storeName}!`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: '🚀 Xem Lộ Trình AI',
          onPress: () => navigation.navigate('BatchRoute', {
            batch: demoBatch,
            deliveries: demoBatch.deliveries,
            storeLat,
            storeLng,
            storeName,
          }),
        },
      ]
    )
  }

  const renderBatchTab = () => {
    const allOrders = deliveries || []
    const hasBatch = !!demoBatch

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.batchScrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={colors.primary} />
        }
      >
        {/* Header card */}
        <View style={styles.batchInfoCard}>
          <View style={styles.batchInfoLeft}>
            <View style={styles.batchAiBadge}>
              <Text style={styles.batchAiBadgeText}>🧠</Text>
            </View>
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.batchInfoTitle}>Smart Batching - Ghép đơn tuyến</Text>
              <Text style={styles.batchInfoSub}>
                Ghép nhiều đơn → AI sắp xếp lộ trình ngắn nhất tự động
              </Text>
            </View>
          </View>
        </View>

        {!hasBatch ? (
          /* Chưa có batch → hiện nút tạo */
          <View style={styles.batchEmpty}>
            <View style={styles.batchEmptyIcon}>
              <Text style={{ fontSize: 52 }}>🗺️</Text>
            </View>
            <Text style={styles.batchEmptyTitle}>Chưa có nhóm đơn nào</Text>
            <Text style={styles.batchEmptyDesc}>
              Bấm nút bên dưới để tự động ghép tối đa{' '}
              {Math.min(allOrders.length, 4)} đơn hiện có thành 1 tuyến và xem
              AI sắp xếp lộ trình tối ưu!
            </Text>

            {allOrders.length === 0 && (
              <View style={styles.batchNoOrderHint}>
                <Ionicons name="information-circle-outline" size={16} color={colors.info} />
                <Text style={styles.batchNoOrderHintText}>
                  Hiện chưa có đơn nào. Hãy bật nhận đơn hoặc chờ đơn mới.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.batchCreateBtn, (allOrders.length === 0 || isBatching) && { opacity: 0.5 }]}
              onPress={createDemoBatch}
              activeOpacity={0.85}
              disabled={allOrders.length === 0 || isBatching}
            >
              {isBatching ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="layers" size={22} color="#fff" />
              )}
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.batchCreateBtnText}>
                  {isBatching ? 'Đang gọi API định vị...' : 'Tạo nhóm ghép Demo'}
                </Text>
                <Text style={styles.batchCreateBtnSub}>
                  {isBatching ? 'Vui lòng chờ AI sắp xếp...' : `Ghép ${Math.min(allOrders.length, 4)} đơn hiện có`}
                </Text>
              </View>
              {!isBatching && <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.7)" />}
            </TouchableOpacity>
          </View>
        ) : (
          /* Đã có batch → hiện chi tiết */
          <View>
            {/* Banner tiết kiệm */}
            <View style={styles.batchSavingsBanner}>
              <Ionicons name="trending-down" size={22} color={colors.success} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.batchSavingsTitle}>
                  AI đã tối ưu xong! Sẵn sàng giao {demoBatch.deliveries.length} điểm
                </Text>
                <Text style={styles.batchSavingsSub}>
                  Ước tính {demoBatch.total_distance_km} km • ~{demoBatch.estimated_time} phút
                </Text>
              </View>
              <View style={styles.aiBadgeSm}>
                <Text style={styles.aiBadgeSmText}>DEMO</Text>
              </View>
            </View>

            {/* Danh sách đơn trong batch */}
            <View style={styles.batchDeliveryList}>
              <Text style={styles.batchDeliveryListTitle}>Đơn trong tuyến ghép:</Text>
              {demoBatch.deliveries.map((d, idx) => (
                <View key={String(d.id || idx)} style={styles.batchDeliveryRow}>
                  <View style={[styles.batchDot, { backgroundColor: ['#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'][idx % 4] }]}>
                    <Text style={styles.batchDotNum}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={styles.batchDeliveryCode}>
                      #{String(d.ma_don_hang || d.id || '').slice(0, 8).toUpperCase()}
                    </Text>
                    <Text style={styles.batchDeliveryAddr} numberOfLines={1}>
                      {d.delivery_address}
                    </Text>
                  </View>
                  <Text style={styles.batchDeliveryFee}>{formatCurrency(d.delivery_fee)}</Text>
                </View>
              ))}
            </View>

            {/* Nút hành động */}
            <TouchableOpacity
              style={styles.batchStartBtn}
              onPress={handleStartDemoBatch}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate-circle" size={24} color="#fff" />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.batchStartBtnText}>Xem Lộ Trình AI Tối Ưu</Text>
                <Text style={styles.batchStartBtnSub}>
                  {demoBatch.deliveries.length} điểm • {demoBatch.total_distance_km} km
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.batchResetBtn}
              onPress={() => setDemoBatch(null)}
            >
              <Ionicons name="refresh" size={16} color={colors.textSecondary} />
              <Text style={styles.batchResetText}>Tạo nhóm ghép mới</Text>
            </TouchableOpacity>
          </View>
        )}
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
              <Text style={styles.routeLabel}>
                {(() => {
                   const code = item?.co_so_ma || item?.branch_code || shipper?.branch_code || 'MAC_DINH_CHI';
                   let branch = publicBranchPayload?.items?.find(b => (b.ma_chi_nhanh || b.co_so_ma || b.branch_code) === code);
                   return branch ? (branch.ten_chi_nhanh || branch.ten_co_so || branch.name) : `Cửa hàng (Mã: ${code})`;
                })()}
              </Text>
              <Text style={styles.routeAddress} numberOfLines={2}>
                {(() => {
                   const code = item?.co_so_ma || item?.branch_code || shipper?.branch_code || 'MAC_DINH_CHI';
                   let branch = publicBranchPayload?.items?.find(b => (b.ma_chi_nhanh || b.co_so_ma || b.branch_code) === code);
                   const addr = branch?.dia_chi || branch?.address || item?.pickup_address;
                   if (addr) return addr;
                   return branch?.ten_chi_nhanh ? `Avengers Coffee - ${branch.ten_chi_nhanh}` : `Avengers Coffee - ${code}`;
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
            >
              <Text style={[styles.tabText, activeTab === 'AVAILABLE' && styles.tabTextActive]}>Nhận đơn</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'ACCEPTED' && styles.tabBtnActive]}
              onPress={() => setActiveTab('ACCEPTED')}
            >
              <Text style={[styles.tabText, activeTab === 'ACCEPTED' && styles.tabTextActive]}>Tiếp tục giao</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'BATCH' && styles.tabBtnActive]}
              onPress={() => setActiveTab('BATCH')}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.tabText, activeTab === 'BATCH' && styles.tabTextActive]}>Ghép đơn</Text>
                <View style={styles.tabAiBadge}>
                  <Text style={styles.tabAiBadgeText}>🧠</Text>
                </View>
              </View>
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
          )}
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

  // Tabs
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.borderLight,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.md,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  tabText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '800',
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

  // ─── Tab AI Badge ────────────────────────────────────────────────
  tabAiBadge: {
    backgroundColor: colors.primaryBg, borderRadius: 8,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  tabAiBadgeText: { fontSize: 10 },

  // ─── Batch Tab ───────────────────────────────────────────────────
  batchTabContainer: { paddingHorizontal: 0, paddingBottom: spacing.xxl + 40 },
  batchScrollContent: { paddingHorizontal: 0, paddingBottom: spacing.xxl + 80 },

  batchInfoCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.infoBg,
    ...shadows.xs,
  },
  batchInfoLeft: { flexDirection: 'row', alignItems: 'center' },
  batchAiBadge: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  batchAiBadgeText: { fontSize: 20 },
  batchInfoTitle: { ...typography.bodyBold, color: colors.text, fontSize: 15 },
  batchInfoSub: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },

  batchEmpty: { alignItems: 'center', paddingVertical: spacing.xl },
  batchEmptyIcon: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.primaryBg,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  batchEmptyTitle: { ...typography.h4, color: colors.text, marginBottom: spacing.sm },
  batchEmptyDesc: {
    ...typography.body, color: colors.textSecondary, textAlign: 'center',
    paddingHorizontal: spacing.lg, lineHeight: 22, marginBottom: spacing.xl,
  },
  batchNoOrderHint: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.infoBg,
    padding: spacing.sm, borderRadius: radius.md, marginBottom: spacing.lg,
    paddingHorizontal: spacing.md, gap: spacing.sm,
  },
  batchNoOrderHintText: { color: colors.info, fontSize: 13, flex: 1 },
  batchCreateBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primary, borderRadius: radius.xl,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    width: '100%', ...shadows.primary,
  },
  batchCreateBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  batchCreateBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },

  batchSavingsBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.successBg, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.success + '40',
  },
  batchSavingsTitle: { color: colors.success, fontWeight: '800', fontSize: 14 },
  batchSavingsSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  aiBadgeSm: {
    backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: radius.full,
  },
  aiBadgeSmText: { color: '#fff', fontWeight: '900', fontSize: 10, letterSpacing: 1 },

  batchDeliveryList: {
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.borderLight, ...shadows.xs,
  },
  batchDeliveryListTitle: {
    ...typography.caption, color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm,
  },
  batchDeliveryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  batchDot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  batchDotNum: { color: '#fff', fontWeight: '900', fontSize: 13 },
  batchDeliveryCode: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  batchDeliveryAddr: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  batchDeliveryFee: { color: colors.success, fontWeight: '800', fontSize: 13, flexShrink: 0 },

  batchStartBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primary, borderRadius: radius.xl,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm, ...shadows.primary,
  },
  batchStartBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  batchStartBtnSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 1 },

  batchResetBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: spacing.sm,
  },
  batchResetText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
})

