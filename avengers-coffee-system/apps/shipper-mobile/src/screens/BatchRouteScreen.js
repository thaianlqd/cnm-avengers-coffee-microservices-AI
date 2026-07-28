import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
  Linking,
  Alert,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { formatCurrency } from '../lib/shipperData'

// Load react-native-maps chỉ trên native
let MapView = null, Marker = null, Polyline = null, AnimatedRegion = null
if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps')
    MapView = maps.default
    Marker = maps.Marker
    Polyline = maps.Polyline
    AnimatedRegion = maps.AnimatedRegion
  } catch (e) {}
}

// ─── Haversine distance (km) ───────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Nearest Neighbor (Greedy TSP) ────────────────────────────────
// points[0] LUÔN là điểm xuất phát (Shop), giữ cố định
function nearestNeighborTSP(points) {
  if (!points || points.length === 0) return []
  if (points.length <= 2) return [...points]

  const visited = new Array(points.length).fill(false)
  const result = []

  let currentIdx = 0
  visited[0] = true
  result.push(points[0])

  for (let step = 1; step < points.length; step++) {
    let minDist = Infinity
    let nextIdx = -1

    for (let i = 0; i < points.length; i++) {
      if (!visited[i]) {
        const d = haversine(
          points[currentIdx].lat, points[currentIdx].lng,
          points[i].lat, points[i].lng
        )
        if (d < minDist) {
          minDist = d
          nextIdx = i
        }
      }
    }

    if (nextIdx !== -1) {
      visited[nextIdx] = true
      result.push(points[nextIdx])
      currentIdx = nextIdx
    }
  }

  return result
}

// Tính tổng km của một route
function totalRouteDistance(orderedPoints) {
  let total = 0
  for (let i = 0; i < orderedPoints.length - 1; i++) {
    total += haversine(
      orderedPoints[i].lat, orderedPoints[i].lng,
      orderedPoints[i + 1].lat, orderedPoints[i + 1].lng
    )
  }
  return total
}

// Màu sắc cho từng chặng đường trên bản đồ
const ROUTE_COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981']

  export function BatchRouteScreen({ route, navigation }) {
    const { batch, deliveries: deliveriesParam, storeLat, storeLng, storeName, shopLat: routeShopLat, shopLng: routeShopLng, shopName: routeShopName } = route.params || {}
  
    const deliveries = typeof deliveriesParam === 'string' ? JSON.parse(deliveriesParam) : (deliveriesParam || batch?.deliveries || [])
    const shopLat = storeLat || routeShopLat || 10.7834 // District 3 Default
    const shopLng = storeLng || routeShopLng || 106.6802 // District 3 Default
    const actualStoreName = storeName || routeShopName || 'Avengers Coffee - Điểm lấy hàng'
  
    const [shipperLocation, setShipperLocation] = useState(null)
    const [optimizedRoute, setOptimizedRoute] = useState([])
    const [naiveDistance, setNaiveDistance] = useState(0)
    const [optimizedDistance, setOptimizedDistance] = useState(0)
    const [routeSegments, setRouteSegments] = useState([])
    const [isLoadingRoutes, setIsLoadingRoutes] = useState(true)
    const [selectedStop, setSelectedStop] = useState(null)
    
    const { shipper } = useShipper()
    const queryClient = useQueryClient()
    const [cameraPermission, requestCameraPermission] = useCameraPermissions()
    const [showCamera, setShowCamera] = useState(false)
    const cameraRef = useRef(null)
  
    // Interactive Simulation State
    const [currentStepIndex, setCurrentStepIndex] = useState(0)
    const mapRef = useRef(null)
    
    const [isAnimating, setIsAnimating] = useState(false)
    const shipperCoord = useRef(AnimatedRegion ? new AnimatedRegion({
      latitude: shopLat,
      longitude: shopLng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01
    }) : null).current
  
    const updateStatusMutation = useMutation({
      mutationFn: async ({ deliveryId, action, payload = {} }) => {
        return apiClient.post(`/shippers/${shipper.id}/deliveries/${deliveryId}/${action}`, payload)
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['availableOrders'] })
        queryClient.invalidateQueries({ queryKey: ['acceptedOrders'] })
        queryClient.invalidateQueries({ queryKey: ['deliveriesHistory'] })
        queryClient.invalidateQueries({ queryKey: ['shipperStats', shipper?.id] })
      },
      onError: (err) => {
        Alert.alert('Lỗi', err.response?.data?.message || 'Có lỗi xảy ra khi cập nhật trạng thái')
      },
    })
  
    // Intro animation
    const slideAnim = useRef(new Animated.Value(80)).current
    const opacityAnim = useRef(new Animated.Value(0)).current
  
    useEffect(() => {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]).start()
    }, [])
  
    useEffect(() => {
      let cancelled = false
  
      const init = async () => {
        try {
          // 1. Vị trí shipper (có timeout bao cả khâu xin quyền)
          let myLat = shopLat, myLng = shopLng
          try {
            const loc = await Promise.race([
              (async () => {
                const { status } = await Location.requestForegroundPermissionsAsync()
                if (status === 'granted') {
                  return await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
                }
                throw new Error('Permission not granted')
              })(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Location Timeout')), 3000))
            ])
            
            if (loc && loc.coords) {
              myLat = loc.coords.latitude
              myLng = loc.coords.longitude
              if (!cancelled) setShipperLocation({ latitude: myLat, longitude: myLng })
            }
          } catch (e) {
            console.log('Location timeout or error, using default')
          }
  
          // 2. Build điểm: Shop + các điểm giao
          const shopPoint = {
            id: 'shop',
            lat: shopLat, lng: shopLng,
            label: 'Cửa hàng', type: 'shop',
            orderCode: null,
            address: actualStoreName,
            fee: 0, delivery: null,
          }
  
          const deliveryPoints = deliveries.map((d, idx) => ({
          id: d.id || `d${idx}`,
          lat: d.tracking?.destination_latitude ? Number(d.tracking.destination_latitude) : (d.delivery_latitude ? Number(d.delivery_latitude) : shopLat + (idx + 1) * 0.006),
          lng: d.tracking?.destination_longitude ? Number(d.tracking.destination_longitude) : (d.delivery_longitude ? Number(d.delivery_longitude) : shopLng + (idx + 1) * 0.006),
          label: `Điểm ${idx + 1}`,
          type: 'delivery',
          orderCode: (d.ma_don_hang || d.id || '').slice(0, 8).toUpperCase(),
          address: d.delivery_address || `Địa chỉ giao hàng ${idx + 1}`,
          fee: Number(d.delivery_fee) || 15000,
          delivery: d,
        }))

        const allPoints = [shopPoint, ...deliveryPoints]

        // 3. Naive distance (thứ tự gốc)
        const naive = totalRouteDistance(allPoints)
        if (!cancelled) setNaiveDistance(naive)

        // 4. Tối ưu bằng Nearest Neighbor (cho shop và các điểm giao)
        const optimized = nearestNeighborTSP(allPoints)
        
        const shipperPoint = {
          id: 'shipper', lat: myLat, lng: myLng,
          label: 'Vị trí của bạn', type: 'shipper',
          orderCode: null, address: 'Vị trí hiện tại',
          fee: 0, delivery: null,
        }
        
        // Lộ trình cuối cùng: Shipper -> [Quán -> Các điểm giao]
        const finalRoute = [shipperPoint, ...optimized]
        
        const optDist = totalRouteDistance(finalRoute)
        if (!cancelled) {
          setOptimizedRoute(finalRoute)
          setOptimizedDistance(optDist)
        }

        // Helper fetch with timeout
        const fetchWithTimeout = (url, ms = 2500) => {
          return Promise.race([
            fetch(url),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), ms))
          ])
        }

        // 5. Fetch OSRM polylines cho từng đoạn đường (trên finalRoute)
        const segments = []
        for (let i = 0; i < finalRoute.length - 1; i++) {
          const from = finalRoute[i]
          const to = finalRoute[i + 1]
          
          const distStraight = haversine(from.lat, from.lng, to.lat, to.lng)
          
          const fallbackSegment = {
            fromIdx: i, toIdx: i + 1,
            coordinates: [{ latitude: from.lat, longitude: from.lng }, { latitude: to.lat, longitude: to.lng }],
            distanceKm: distStraight,
            durationMin: distStraight > 0 ? (distStraight / 30 * 60) : 0,
          }

          // CHỐNG LỖI BẢN ĐỒ (SNAPPING BUG):
          // Nếu hai điểm cách nhau < 50 mét (0.05km), không gọi OSRM nữa.
          // Vì OSRM là bản đồ xe ô tô/xe máy, nếu 2 điểm nằm ở 2 bên đường quốc lộ có lươn cứng,
          // nó sẽ bắt xe máy chạy vòng 3.5km để quay đầu! Shipper giao chung cư thì đi bộ cho lẹ.
          if (distStraight < 0.05) {
            segments.push(fallbackSegment)
            continue
          }

          try {
            const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full`
            const res = await fetchWithTimeout(url, 2500)
            const data = await res.json()
            if (data.code === 'Ok' && data.routes?.length > 0) {
              segments.push({
                fromIdx: i, toIdx: i + 1,
                coordinates: data.routes[0].geometry.coordinates.map(c => ({ latitude: c[1], longitude: c[0] })),
                distanceKm: data.routes[0].distance / 1000,
                durationMin: data.routes[0].duration / 60,
              })
            } else {
              segments.push(fallbackSegment)
            }
          } catch (e) {
            console.log('OSRM fetch failed or timeout, using fallback')
            segments.push(fallbackSegment)
          }
        }

        if (!cancelled) {
          setRouteSegments(segments)
        }
      } catch (err) {
        console.error('BatchRoute init crashed:', err)
      } finally {
        if (!cancelled) {
          setIsLoadingRoutes(false)
        }
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  const totalFee = deliveries.reduce((s, d) => s + (Number(d.delivery_fee) || 0), 0)
  const savedKm = Math.max(0, naiveDistance - optimizedDistance)
  const totalEstimatedMin = routeSegments.reduce((s, seg) => s + (seg.durationMin || 0), 0)

  // Tính vùng bản đồ để fit tất cả điểm
  const allLats = optimizedRoute.map(p => p.lat)
  const allLngs = optimizedRoute.map(p => p.lng)
  const centerLat = allLats.length > 0 ? allLats.reduce((a, b) => a + b, 0) / allLats.length : shopLat
  const centerLng = allLngs.length > 0 ? allLngs.reduce((a, b) => a + b, 0) / allLngs.length : shopLng
  const latDelta = allLats.length > 1 ? (Math.max(...allLats) - Math.min(...allLats)) * 1.8 + 0.015 : 0.05
  const lngDelta = allLngs.length > 1 ? (Math.max(...allLngs) - Math.min(...allLngs)) * 1.8 + 0.015 : 0.05

  const openGoogleMaps = (point) => {
    const addr = encodeURIComponent(point.address || '')
    Linking.openURL(`https://maps.google.com/maps?daddr=${addr}`)
  }

  const handleNextStep = () => {
    if (isAnimating) return
    if (currentStepIndex >= optimizedRoute.length - 1) {
      Alert.alert(
        '🎉 Hoàn thành nhóm ghép!',
        'Tuyệt vời! Bạn đã hoàn thành toàn bộ tuyến đường.',
        [{ text: 'Về trang chủ', onPress: () => navigation.navigate('Home') }]
      )
      return
    }

    const nextIdx = currentStepIndex + 1
    const targetPoint = optimizedRoute[nextIdx]
    const segment = routeSegments[currentStepIndex] // Chặng đường từ điểm hiện tại đến điểm tiếp theo

    if (!segment || !segment.coordinates || segment.coordinates.length < 2) {
      // Fallback nhảy thẳng nếu không có toạ độ chi tiết
      arriveAtTarget(nextIdx, targetPoint)
      return
    }

    // Bắt đầu Animation
    setIsAnimating(true)
    
    // Di chuyển camera bản đồ bám theo đoạn đường
    mapRef.current?.fitToCoordinates(segment.coordinates, { edgePadding: { top: 80, right: 50, bottom: 300, left: 50 }, animated: true })
    
    // Animation dọc theo đường mòn (Polyline)
    const coords = segment.coordinates
    let step = 0
    
    // Đặt vị trí ban đầu của AnimatedRegion
    if (shipperCoord && coords.length > 0) {
      shipperCoord.setValue({ latitude: coords[0].latitude, longitude: coords[0].longitude })
    }

    const animateLoop = () => {
      if (step >= coords.length) {
        setIsAnimating(false)
        arriveAtTarget(nextIdx, targetPoint)
        return
      }
      
      const coord = coords[step]
      if (shipperCoord && (Platform.OS === 'ios' || Platform.OS === 'android')) {
        shipperCoord.timing({
          latitude: coord.latitude,
          longitude: coord.longitude,
          duration: 40, // Đã giảm từ 300ms xuống 40ms để xe chạy siêu tốc!
          useNativeDriver: false
        }).start(() => {
          step++
          animateLoop()
        })
      } else {
        // Fallback for Web/Errors
        step++
        animateLoop()
      }
    }
    
    animateLoop()
  }

  const arriveAtTarget = (nextIdx, targetPoint) => {
    if (targetPoint.type === 'shop') {
      setCurrentStepIndex(nextIdx)
      Alert.alert('📦 Đã lấy hàng', 'Tài xế đã lấy hàng thành công tại Quán.')
    } else {
      // Đây là điểm giao hàng khách -> Mở Camera xác thực
      if (!cameraPermission?.granted) {
        requestCameraPermission().then(res => {
          if (res.granted) setShowCamera(true)
          else {
            Alert.alert('Lỗi quyền', 'Cần quyền Camera để chụp ảnh xác thực giao hàng!')
            setCurrentStepIndex(nextIdx)
          }
        })
      } else {
        setShowCamera(true)
      }
    }
  }

  const handleTakePhoto = async () => {
    if (cameraRef.current) {
      try {
        // Chụp ảnh nén 50%
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.5 })
        setShowCamera(false)
        
        const nextIdx = currentStepIndex + 1
        const targetPoint = optimizedRoute[nextIdx]
        const realDeliveryId = targetPoint.delivery?.id || targetPoint.id
        
        // Gọi API backend hoàn thành đơn hàng THẬT
        updateStatusMutation.mutate(
          { 
            deliveryId: realDeliveryId, 
            action: 'complete', 
            payload: { proof_image_url: 'https://avengers-coffee-demo.com/proof.jpg', is_batched: true } // Gắn cờ đơn ghép
          },
          {
            onSuccess: async () => {
              // Lưu vào bộ nhớ tạm để UI Lịch sử đọc được ngay cả khi backend chưa restart
              try {
                const existing = await AsyncStorage.getItem('localBatchedMap')
                const map = existing ? JSON.parse(existing) : {}
                map[realDeliveryId] = true
                const orderCode = targetPoint.delivery?.ma_don_hang
                if (orderCode) map[orderCode] = true
                await AsyncStorage.setItem('localBatchedMap', JSON.stringify(map))
              } catch (e) {}
              
              setCurrentStepIndex(nextIdx)
              Alert.alert('✅ Giao thành công', `Đã giao xong ${targetPoint.label}! Đơn hàng đã được đánh dấu Hoàn thành thực tế trên hệ thống.`)
            }
          }
        )
      } catch (e) {
        Alert.alert('Lỗi Camera', 'Không thể chụp ảnh xác thực.')
      }
    }
  }
  const handleCompleteAll = async () => {
    if (isAnimating || updateStatusMutation.isPending) return;

    Alert.alert(
      'Xác nhận Hoàn Thành Tất Cả',
      'Thao tác này sẽ tự động báo cáo giao thành công cho tất cả các đơn hàng còn lại trong nhóm ghép này. Bạn có chắc chắn không?',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Hoàn thành',
          style: 'destructive',
          onPress: async () => {
            const remainingDeliveries = optimizedRoute.slice(currentStepIndex + 1).filter(p => p.type === 'delivery');
            if (remainingDeliveries.length === 0) {
              setCurrentStepIndex(optimizedRoute.length - 1);
              return;
            }

            try {
              setIsAnimating(true); // Tạm khoá giao diện
              
              // Chạy vòng lặp Promise.all để gọi API cho tất cả đơn còn lại
              await Promise.all(remainingDeliveries.map(p => {
                const realDeliveryId = p.delivery?.id || p.id;
                return updateStatusMutation.mutateAsync({
                  deliveryId: realDeliveryId,
                  action: 'complete',
                  payload: { proof_image_url: 'https://avengers-coffee-demo.com/proof.jpg', is_batched: true }
                });
              }));

              // Lưu vào bộ nhớ tạm để UI Lịch sử đọc được ngay
              try {
                const existing = await AsyncStorage.getItem('localBatchedMap')
                const map = existing ? JSON.parse(existing) : {}
                remainingDeliveries.forEach(p => {
                  const id = p.delivery?.id || p.id
                  const code = p.delivery?.ma_don_hang
                  if (id) map[id] = true
                  if (code) map[code] = true
                })
                await AsyncStorage.setItem('localBatchedMap', JSON.stringify(map))
              } catch (e) {}

              setIsAnimating(false);
              setCurrentStepIndex(optimizedRoute.length - 1);
              Alert.alert('✅ Thành công', 'Đã hoàn thành toàn bộ đơn ghép!');
            } catch (err) {
              setIsAnimating(false);
              Alert.alert('Lỗi', 'Không thể hoàn thành tất cả các đơn. Vui lòng thử lại.');
            }
          }
        }
      ]
    )
  }

  let ctaTitle = ''
  let ctaIcon = 'navigate-circle'
  if (optimizedRoute[currentStepIndex + 1]) {
    const nextPoint = optimizedRoute[currentStepIndex + 1]
    if (nextPoint.type === 'shop') {
      ctaTitle = `Đã đến lấy hàng tại ${actualStoreName}`
      ctaIcon = 'storefront'
    } else {
      ctaTitle = `Đã giao xong ${nextPoint.label}`
      ctaIcon = 'checkmark-circle'
    }
  } else {
    ctaTitle = 'Hoàn thành Chuyến đi!'
    ctaIcon = 'flag'
  }

  return (
    <View style={styles.container}>
      {/* ─── Bản đồ ─────────────────────────────────────────────── */}
      {MapView && optimizedRoute.length > 0 ? (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{ latitude: centerLat, longitude: centerLng, latitudeDelta: latDelta, longitudeDelta: lngDelta }}
          showsUserLocation={false}
          showsCompass={true}
        >

          {/* Các điểm dừng theo thứ tự tối ưu */}
          {optimizedRoute.map((point, idx) => {
            const isCompleted = idx < currentStepIndex
            const isCurrentTarget = idx === currentStepIndex + 1
            const isShipper = point.type === 'shipper'
            const isShop = point.type === 'shop'
            
            // Nếu là vị trí shipper gốc (index 0) và đã đi qua thì ẩn đi
            if (isShipper && idx !== currentStepIndex) return null
            
            // Nếu shipper đang ở chặng hiện tại, đổi icon thành xe máy
            if (idx === currentStepIndex) {
              if (isAnimating && AnimatedRegion && shipperCoord) {
                return (
                  <Marker.Animated key={`current-${idx}`} coordinate={shipperCoord} zIndex={200}>
                    <View style={styles.markerShipper}>
                      <Text style={{ fontSize: 22 }}>🛵</Text>
                    </View>
                  </Marker.Animated>
                )
              }
              return (
                <Marker key={`current-${idx}`} coordinate={{ latitude: point.lat, longitude: point.lng }} zIndex={200}>
                  <View style={styles.markerShipper}>
                    <Text style={{ fontSize: 22 }}>🛵</Text>
                  </View>
                </Marker>
              )
            }

            return (
              <Marker
                key={point.id}
                coordinate={{ latitude: point.lat, longitude: point.lng }}
                title={point.label}
                description={point.address}
                onPress={() => setSelectedStop(selectedStop === idx ? null : idx)}
                zIndex={isCurrentTarget ? 150 : 50}
              >
                <View style={[
                  styles.routeMarker,
                  isShop ? styles.routeMarkerShop : { backgroundColor: ROUTE_COLORS[(idx - 1) % ROUTE_COLORS.length] },
                  selectedStop === idx && styles.routeMarkerSelected,
                  isCompleted && { backgroundColor: '#B0B0B0', opacity: 0.7 } // Mờ đi nếu đã qua
                ]}>
                  {isShop ? (
                    <Ionicons name="storefront" size={14} color="#fff" />
                  ) : (
                    <Text style={styles.routeMarkerText}>{idx - 1}</Text>
                  )}
                </View>
              </Marker>
            )
          })}

          {/* Đường đi từng chặng - màu khác nhau */}
          {Polyline && routeSegments.map((seg, idx) => {
            const isCompleted = seg.toIdx <= currentStepIndex
            const isCurrent = seg.fromIdx === currentStepIndex
            
            if (isCompleted) return null // Ẩn đường đã đi qua
            
            return (
              <Polyline
                key={`route-${idx}`}
                coordinates={seg.coordinates}
                strokeColor={ROUTE_COLORS[idx % ROUTE_COLORS.length]}
                strokeWidth={isCurrent ? 6 : 4}
                zIndex={isCurrent ? 50 : 10}
              />
            )
          })}
        </MapView>
      ) : (
        <View style={styles.mapPlaceholder}>
          <Ionicons name="map-outline" size={48} color={colors.muted} />
          <Text style={styles.mapPlaceholderText}>
            {Platform.OS === 'web' ? 'Bản đồ không hỗ trợ Web' : 'Đang khởi tạo bản đồ...'}
          </Text>
        </View>
      )}

      {/* ─── Panel dưới ─────────────────────────────────────────── */}
      <Animated.View style={[styles.bottomPanel, { transform: [{ translateY: slideAnim }], opacity: opacityAnim }]}>

        {/* Header */}
        <LinearGradient colors={colors.gradientRed} style={styles.panelHeader}>
          <SafeAreaView>
            <View style={styles.panelHeaderRow}>
              <TouchableOpacity onPress={() => navigation.goBack()} style={styles.panelBackBtn}>
                <Ionicons name="arrow-back" size={22} color="#fff" />
              </TouchableOpacity>
              <View style={styles.panelHeaderCenter}>
                <Text style={styles.panelTitle}>🧠 Lộ Trình Tối Ưu</Text>
                <Text style={styles.panelSubtitle}>
                  {optimizedRoute.filter(p => p.type === 'delivery').length} điểm giao • Thuật toán AI
                </Text>
              </View>
              <View style={{ width: 40 }} />
            </View>
          </SafeAreaView>
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          {/* Banner tiết kiệm km */}
          {naiveDistance > 0 && (
            <View style={styles.savingsBanner}>
              <View style={styles.savingsLeft}>
                <View style={styles.savingsIconWrap}>
                  <Ionicons name="trending-down" size={22} color={colors.success} />
                </View>
                <View style={{ marginLeft: spacing.sm, flex: 1 }}>
                  <Text style={styles.savingsTitle}>
                    {savedKm > 0.05
                      ? `AI tiết kiệm ~${savedKm.toFixed(1)} km cho bạn!`
                      : '✅ Thứ tự giao đã tối ưu sẵn!'}
                  </Text>
                  <Text style={styles.savingsSubtitle}>
                    Thứ tự gốc: {naiveDistance.toFixed(1)} km → Tối ưu: {optimizedDistance.toFixed(1)} km
                  </Text>
                </View>
              </View>
              <View style={styles.aiBadge}>
                <Text style={styles.aiBadgeText}>AI</Text>
              </View>
            </View>
          )}

          {/* Thống kê tổng hợp */}
          <View style={styles.statsCard}>
            <View style={styles.statBox}>
              <Ionicons name="navigate-circle" size={22} color={colors.primary} />
              <Text style={styles.statVal}>{optimizedDistance.toFixed(1)} km</Text>
              <Text style={styles.statLabel}>Tổng quãng đường</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Ionicons name="time" size={22} color={colors.warning} />
              <Text style={styles.statVal}>
                ~{Math.round(totalEstimatedMin > 0 ? totalEstimatedMin : optimizedDistance / 30 * 60)} phút
              </Text>
              <Text style={styles.statLabel}>Ước tính</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Ionicons name="cash" size={22} color={colors.success} />
              <Text style={[styles.statVal, { color: colors.success }]}>{formatCurrency(totalFee)}</Text>
              <Text style={styles.statLabel}>Tổng phí ship</Text>
            </View>
          </View>

          {/* Danh sách điểm theo thứ tự */}
          <Text style={styles.sectionTitle}>Thứ tự giao đề xuất</Text>

          {isLoadingRoutes ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.loadingText}>Đang tính toán lộ trình tối ưu nhất...</Text>
            </View>
          ) : (
            <View style={styles.stopsList}>
              {optimizedRoute.map((point, idx) => {
                if (point.type === 'shipper') return null // Không hiển thị Shipper trong list điểm giao
                
                const segToPrev = routeSegments[idx - 1]
                const isShop = point.type === 'shop'
                const isSelected = selectedStop === idx
                const isCompleted = idx <= currentStepIndex // Đã đi qua
                const isCurrentTarget = idx === currentStepIndex + 1 // Đang đi tới
                
                const dotColor = isShop ? colors.accent : ROUTE_COLORS[(idx - 1) % ROUTE_COLORS.length]

                return (
                  <View key={point.id} style={[styles.stopWrapper, isCompleted && { opacity: 0.5 }]}>
                    {/* Connector */}
                    {idx < optimizedRoute.length - 1 && (
                      <View style={[styles.connector, { backgroundColor: ROUTE_COLORS[idx % ROUTE_COLORS.length] + '80' }]} />
                    )}

                    <TouchableOpacity
                      style={[
                        styles.stopCard, 
                        isSelected && { borderColor: dotColor, borderWidth: 2 },
                        isCurrentTarget && { borderColor: colors.primary, borderWidth: 1, backgroundColor: '#FFF5F5' } // Highlight chặng đang đi tới
                      ]}
                      onPress={() => setSelectedStop(isSelected ? null : idx)}
                      activeOpacity={0.85}
                    >
                      {/* Badge số thứ tự */}
                      <View style={[styles.stopBadge, { backgroundColor: dotColor }]}>
                        {isShop ? (
                          <Ionicons name="storefront" size={15} color="#fff" />
                        ) : (
                          <Text style={styles.stopBadgeNum}>{idx}</Text>
                        )}
                      </View>

                      <View style={styles.stopContent}>
                        <View style={styles.stopTopRow}>
                          <View style={styles.stopLabelWrap}>
                            <Text style={styles.stopLabel}>
                              {isShop ? `📦 Lấy hàng tại ${point.address}` : point.label}
                            </Text>
                            {!isShop && (
                              <Text style={styles.stopOrderCode}>Đơn #{point.orderCode}</Text>
                            )}
                          </View>
                          {!isShop && (
                            <Text style={styles.stopFee}>{formatCurrency(point.fee)}</Text>
                          )}
                        </View>

                        <Text style={styles.stopAddress} numberOfLines={isSelected ? 3 : 1}>{point.address}</Text>

                        {/* Khoảng cách từ điểm trước */}
                        {segToPrev && (
                          <View style={styles.stopDistRow}>
                            <View style={[styles.distDot, { backgroundColor: ROUTE_COLORS[(idx - 1) % ROUTE_COLORS.length] }]} />
                            <Text style={[styles.stopDist, { color: ROUTE_COLORS[(idx - 1) % ROUTE_COLORS.length] }]}>
                              {segToPrev.distanceKm.toFixed(1)} km •{' '}
                              {segToPrev.durationMin > 0
                                ? `~${Math.round(segToPrev.durationMin)} phút`
                                : `~${Math.round(segToPrev.distanceKm / 30 * 60)} phút`}
                            </Text>
                          </View>
                        )}

                        {/* Actions khi expand */}
                        {isSelected && !isShop && (
                          <View style={styles.stopActions}>
                            <TouchableOpacity
                              style={styles.stopActionBtn}
                              onPress={() => openGoogleMaps(point)}
                            >
                              <Ionicons name="navigate-outline" size={15} color={colors.primary} />
                              <Text style={styles.stopActionText}>Chỉ đường</Text>
                            </TouchableOpacity>
                            {point.delivery && (
                              <TouchableOpacity
                                style={[styles.stopActionBtn, { backgroundColor: colors.successBg, borderColor: colors.success + '50' }]}
                                onPress={() => {
                                  Alert.alert(
                                    'Chi tiết đơn (Demo)',
                                    'Bạn đang xem chế độ Demo Ghép tuyến.\n\nHãy Nhận đơn này ở ngoài màn hình chính để xem chi tiết thực tế!',
                                    [{ text: 'Đã hiểu' }]
                                  )
                                }}
                              >
                                <Ionicons name="receipt-outline" size={15} color={colors.success} />
                                <Text style={[styles.stopActionText, { color: colors.success }]}>Chi tiết đơn</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}
                      </View>

                      {/* Arrow */}
                      <Ionicons
                        name={isSelected ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.muted}
                        style={{ marginLeft: 4 }}
                      />
                    </TouchableOpacity>
                  </View>
                )
              })}
            </View>
          )}

          {/* Chú thích màu */}
          {!isLoadingRoutes && routeSegments.length > 0 && (
            <View style={styles.legend}>
              <Text style={styles.legendTitle}>Màu sắc các chặng đường</Text>
              <View style={styles.legendItems}>
                {routeSegments.map((seg, idx) => (
                  <View key={idx} style={styles.legendItem}>
                    <View style={[styles.legendLine, { backgroundColor: ROUTE_COLORS[idx % ROUTE_COLORS.length] }]} />
                    <Text style={styles.legendText}>
                      Chặng {idx + 1}: {seg.distanceKm.toFixed(1)}km
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>

        {/* CTA Button Động */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity style={styles.ctaBtn} onPress={handleNextStep} activeOpacity={0.85}>
            <LinearGradient colors={colors.gradientRed} style={styles.ctaGradient}>
              <Ionicons name={ctaIcon} size={26} color="#fff" />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.ctaTitle}>{ctaTitle}</Text>
                {optimizedRoute[currentStepIndex + 1] && (
                  <Text style={styles.ctaSub}>Bấm để mô phỏng hoàn thành chặng này</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </TouchableOpacity>

          {currentStepIndex > 0 && currentStepIndex < optimizedRoute.length - 1 && (
            <TouchableOpacity 
              style={{ marginTop: 12, alignItems: 'center', paddingVertical: 8 }}
              onPress={handleCompleteAll}
              disabled={isAnimating || updateStatusMutation.isPending}
            >
              <Text style={{ color: colors.primary, fontWeight: 'bold', fontSize: 15 }}>
                🚀 Hoàn thành tất cả (Demo)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* ─── Camera Overlay ─────────────────────────────────────────────── */}
      {showCamera && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, backgroundColor: '#000' }]}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back">
            <View style={{ flex: 1, justifyContent: 'space-between', padding: 20, backgroundColor: 'transparent' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: Platform.OS === 'ios' ? 40 : 20 }}>
                <TouchableOpacity onPress={() => setShowCamera(false)} style={{ padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}>
                  <Ionicons name="close" size={28} color="#fff" />
                </TouchableOpacity>
              </View>
              <View style={{ alignItems: 'center', marginBottom: 40 }}>
                <TouchableOpacity
                  onPress={handleTakePhoto}
                  disabled={updateStatusMutation.isPending}
                  style={{
                    width: 76, height: 76, borderRadius: 38,
                    backgroundColor: 'rgba(255,255,255,0.3)',
                    justifyContent: 'center', alignItems: 'center',
                  }}
                >
                  <View style={{
                    width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff',
                    justifyContent: 'center', alignItems: 'center'
                  }}>
                    {updateStatusMutation.isPending && <ActivityIndicator color={colors.primary} size="large" />}
                  </View>
                </TouchableOpacity>
                <Text style={{ color: '#fff', marginTop: 10, fontWeight: 'bold' }}>Chụp ảnh gói hàng</Text>
              </View>
            </View>
          </CameraView>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e5e7eb' },

  // Map
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  mapPlaceholderText: { color: colors.muted, marginTop: 12, fontSize: 14 },

  markerShipper: { backgroundColor: '#fff', padding: 3, borderRadius: 22, borderWidth: 2, borderColor: '#4F46E5', ...shadows.md },
  routeMarker: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff', ...shadows.sm,
  },
  routeMarkerShop: { backgroundColor: colors.accent, width: 36, height: 36, borderRadius: 18 },
  routeMarkerSelected: { transform: [{ scale: 1.3 }] },
  routeMarkerText: { color: '#fff', fontWeight: '900', fontSize: 14 },

  // Bottom Panel
  bottomPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: '70%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl,
    overflow: 'hidden', ...shadows.lg,
  },
  panelHeader: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl },
  panelHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.md,
  },
  panelBackBtn: { padding: spacing.xs },
  panelHeaderCenter: { alignItems: 'center' },
  panelTitle: { color: '#fff', fontWeight: '900', fontSize: 17 },
  panelSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 11, marginTop: 2 },

  // Savings Banner
  savingsBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.successBg, margin: spacing.md,
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: colors.success + '40',
  },
  savingsLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  savingsIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    ...shadows.xs,
  },
  savingsTitle: { color: colors.success, fontWeight: '800', fontSize: 14 },
  savingsSubtitle: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  aiBadge: {
    backgroundColor: colors.success, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: radius.full,
  },
  aiBadgeText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 1 },

  // Stats Card
  statsCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, marginHorizontal: spacing.md, marginBottom: spacing.md,
    borderRadius: radius.lg, padding: spacing.md, ...shadows.xs,
    borderWidth: 1, borderColor: colors.borderLight,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 4 },
  statVal: { ...typography.h4, color: colors.text, fontSize: 16 },
  statLabel: { ...typography.caption, color: colors.muted, textAlign: 'center' },
  statDivider: { width: 1, height: 44, backgroundColor: colors.borderLight },

  // Section Title
  sectionTitle: {
    ...typography.label, color: colors.textSecondary,
    marginHorizontal: spacing.md, marginBottom: spacing.sm,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },

  scrollContent: { paddingBottom: 130 },

  // Loading
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg, justifyContent: 'center' },
  loadingText: { color: colors.textSecondary, fontSize: 14 },

  // Stop list
  stopsList: { marginHorizontal: spacing.md },
  stopWrapper: { position: 'relative' },
  connector: { position: 'absolute', left: 26, top: 50, width: 2, height: 20, zIndex: 5 },

  stopCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.borderLight,
    ...shadows.xs,
  },
  stopBadge: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm, flexShrink: 0, ...shadows.sm,
  },
  stopBadgeNum: { color: '#fff', fontWeight: '900', fontSize: 15 },
  stopContent: { flex: 1 },
  stopTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  stopLabelWrap: { flex: 1, marginRight: 8 },
  stopLabel: { ...typography.bodyBold, color: colors.text, fontSize: 14 },
  stopOrderCode: { color: colors.primary, fontSize: 11, fontWeight: '700', marginTop: 1 },
  stopFee: { color: colors.success, fontWeight: '800', fontSize: 14, flexShrink: 0 },
  stopAddress: { ...typography.caption, color: colors.textSecondary, marginTop: 4, lineHeight: 16 },
  stopDistRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  distDot: { width: 8, height: 8, borderRadius: 4 },
  stopDist: { fontSize: 11, fontWeight: '700' },
  stopActions: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  stopActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    backgroundColor: colors.infoBg, paddingVertical: 8, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.info + '40',
  },
  stopActionText: { color: colors.primary, fontWeight: '700', fontSize: 12 },

  // Legend
  legend: {
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    padding: spacing.md, backgroundColor: colors.surface,
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderLight,
  },
  legendTitle: { ...typography.caption, color: colors.muted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  legendItems: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendLine: { width: 20, height: 4, borderRadius: 2 },
  legendText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },

  // CTA
  ctaContainer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: spacing.md, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.borderLight, ...shadows.lg,
  },
  ctaBtn: { borderRadius: radius.xl, overflow: 'hidden', ...shadows.primary },
  ctaGradient: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  ctaTitle: { color: '#fff', fontWeight: '900', fontSize: 16 },
  ctaSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },
})
