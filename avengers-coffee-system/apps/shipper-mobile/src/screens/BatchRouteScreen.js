import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Platform,
  Linking,
  Alert,
  Modal,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import * as Location from 'expo-location'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { openGoogleMapsNavigation } from '../lib/navigationHelper'
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

const VIETMAP_API_KEY = process.env.EXPO_PUBLIC_VIETMAP_API_KEY || 'dbdd3165b3cb0d85239a7f59f410a9fa925974c4a6d4c54b';
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';

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

function formatCoord(val) {
  if (val == null) return '---'
  return Number(val).toFixed(5)
}

function formatWatermarkTime() {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const mo = String(now.getMonth() + 1).padStart(2, '0')
  const yy = now.getFullYear()
  return `${hh}:${mm} ${dd}/${mo}/${yy}`
}

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
  const cameraRef = useRef(null)

  // Proof of Delivery (P.O.D) State - Chuẩn quy trình như đơn lẻ
  const [podStep, setPodStep] = useState('idle') // 'idle' | 'camera' | 'preview' | 'submitting' | 'done'
  const [podImage, setPodImage] = useState(null)
  const [watermarkTime, setWatermarkTime] = useState('')
  const [pendingTargetPoint, setPendingTargetPoint] = useState(null)
  const [pendingNextIdx, setPendingNextIdx] = useState(null)
  const podScaleAnim = useRef(new Animated.Value(0)).current
  const podSuccessAnim = useRef(new Animated.Value(0)).current

  const openPodModal = (targetPoint, nextIdx) => {
    setPendingTargetPoint(targetPoint)
    setPendingNextIdx(nextIdx)
    setWatermarkTime(formatWatermarkTime())
    setPodStep('camera')
    if (!cameraPermission?.granted && requestCameraPermission) {
      requestCameraPermission().catch(() => {})
    }
    Animated.spring(podScaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }).start()
  }

  const closePodModal = () => {
    Animated.timing(podScaleAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setPodStep('idle')
      setPodImage(null)
      setPendingTargetPoint(null)
      setPendingNextIdx(null)
    })
  }
  
    // Interactive Simulation State
    const [currentStepIndex, setCurrentStepIndex] = useState(0)
    const mapRef = useRef(null)

    const unifiedRouteCoordinates = React.useMemo(() => {
      const coords = []
      routeSegments.forEach(seg => {
        if (seg.toIdx <= currentStepIndex) return
        if (seg.coordinates && seg.coordinates.length > 0) {
          coords.push(...seg.coordinates)
        }
      })
      return coords
    }, [routeSegments, currentStepIndex])
    
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
            const url = `https://maps.vietmap.vn/api/route?api-version=1.1&apikey=${VIETMAP_API_KEY}&point=${from.lat},${from.lng}&point=${to.lat},${to.lng}&vehicle=motorcycle&points_encoded=false`;
            const res = await fetchWithTimeout(url, 3500);
            const data = await res.json();
            const path = data.paths?.[0];
            if (data.code === 'OK' && path?.points?.coordinates) {
              segments.push({
                fromIdx: i, toIdx: i + 1,
                coordinates: path.points.coordinates.map(c => ({ latitude: c[1], longitude: c[0] })),
                distanceKm: path.distance / 1000,
                durationMin: path.time / 1000 / 60,
              });
            } else {
              segments.push(fallbackSegment);
            }
          } catch (e) {
            console.log('Vietmap route fetch failed or timeout, using fallback');
            segments.push(fallbackSegment);
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
    openGoogleMapsNavigation(point.address, { latitude: point.lat, longitude: point.lng });
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

    // Sử dụng thuật toán nội suy cố định 15 giây (giống MapScreen của đơn lẻ)
    const steps = 75;
    const intervalMs = 200; // 75 * 200ms = 15s
    let currentStep = 0;

    const simulationInterval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;

      const totalSegments = coords.length - 1;
      const exactIndex = progress * totalSegments;
      const lowerIndex = Math.floor(exactIndex);
      const upperIndex = Math.min(Math.ceil(exactIndex), totalSegments);
      const segmentProgress = exactIndex - lowerIndex;

      const p1 = coords[lowerIndex];
      const p2 = coords[upperIndex];

      const newLat = p1.latitude + (p2.latitude - p1.latitude) * segmentProgress;
      const newLng = p1.longitude + (p2.longitude - p1.longitude) * segmentProgress;

      if (shipperCoord) {
        if (Platform.OS === 'ios' || Platform.OS === 'android') {
          shipperCoord.timing({
            latitude: newLat,
            longitude: newLng,
            duration: intervalMs,
            useNativeDriver: false
          }).start();
        } else {
          shipperCoord.setValue({ latitude: newLat, longitude: newLng });
        }
      }

      // Phát realtime toạ độ giả lập để Khách hàng thấy chạy mượt mà
      if (currentStep === 1 || currentStep % 5 === 0 || currentStep === steps) {
        if (shipper?.id) {
          apiClient.patch(`/shippers/${shipper.id}/location`, {
            latitude: newLat,
            longitude: newLng,
          }).catch(() => {});
        }
      }

      if (currentStep >= steps) {
        clearInterval(simulationInterval);
        setIsAnimating(false);
        arriveAtTarget(nextIdx, targetPoint);
      }
    }, intervalMs);
  }

  const arriveAtTarget = (nextIdx, targetPoint) => {
    if (targetPoint.type === 'shop') {
      setCurrentStepIndex(nextIdx)
      Alert.alert('Đã lấy hàng', 'Tài xế đã lấy hàng thành công tại điểm lấy hàng.')
    } else {
      // Đây là điểm giao hàng khách -> Mở Camera xác thực P.O.D chuẩn giống đơn lẻ
      openPodModal(targetPoint, nextIdx)
    }
  }

  const handleTakePhoto = async () => {
    if (!cameraRef.current) {
      handleDemoPhoto()
      return
    }
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        skipProcessing: false,
      })
      if (photo?.uri) {
        setPodImage(photo.uri)
        setPodStep('preview')
      } else {
        handleDemoPhoto()
      }
    } catch (err) {
      Alert.alert('Lỗi máy ảnh', 'Không thể chụp ảnh lúc này. Bạn có thể chọn ảnh mẫu để tiếp tục.', [
        { text: 'Dùng ảnh mẫu', onPress: handleDemoPhoto },
        { text: 'Thử lại', style: 'cancel' }
      ])
    }
  }

  const handleDemoPhoto = () => {
    setPodImage('https://images.unsplash.com/photo-1610632380989-7f09b1a64f8a?w=600&q=80')
    setWatermarkTime(formatWatermarkTime())
    setPodStep('preview')
  }

  const submitCompleteBatchDelivery = async () => {
    if (!pendingTargetPoint || pendingNextIdx == null) return

    const realDeliveryId = pendingTargetPoint.delivery?.id || pendingTargetPoint.id
    const pointLat = pendingTargetPoint.lat || shipperLocation?.latitude
    const pointLng = pendingTargetPoint.lng || shipperLocation?.longitude
    const code = pendingTargetPoint.orderCode || pendingTargetPoint.delivery?.ma_don_hang?.slice(0, 8).toUpperCase() || 'GH'

    setPodStep('submitting')

    try {
      await updateStatusMutation.mutateAsync({
        deliveryId: realDeliveryId,
        action: 'complete',
        payload: {
          latitude: shipperLocation?.latitude || pointLat,
          longitude: shipperLocation?.longitude || pointLng,
          proof_image_url: podImage || 'https://avengers-coffee-demo.com/proof.jpg',
          is_batched: true,
          proof_metadata: {
            timestamp: watermarkTime,
            gps_lat: formatCoord(shipperLocation?.latitude || pointLat),
            gps_lng: formatCoord(shipperLocation?.longitude || pointLng),
            order_code: code,
          }
        }
      })

      // Lưu vào bộ nhớ tạm localBatchedMap
      try {
        const existing = await AsyncStorage.getItem('localBatchedMap')
        const map = existing ? JSON.parse(existing) : {}
        map[realDeliveryId] = true
        const orderCode = pendingTargetPoint.delivery?.ma_don_hang
        if (orderCode) map[orderCode] = true
        await AsyncStorage.setItem('localBatchedMap', JSON.stringify(map))
      } catch (e) {}

      setPodStep('done')
      Animated.spring(podSuccessAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 6 }).start()

      setTimeout(() => {
        const nextIdx = pendingNextIdx
        setCurrentStepIndex(nextIdx)
        closePodModal()
      }, 1800)
    } catch (err) {
      setPodStep('preview')
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể cập nhật trạng thái đơn hàng.')
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

            const deliveryNumber = idx - 1

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
                  isShop && styles.routeMarkerShop,
                  !isShop && styles.routeMarkerDelivery,
                  isCurrentTarget && styles.routeMarkerTarget,
                  selectedStop === idx && styles.routeMarkerSelected,
                  isCompleted && styles.routeMarkerCompleted,
                ]}>
                  {isShop ? (
                    <Ionicons name="storefront" size={14} color="#fff" />
                  ) : (
                    <Text style={styles.routeMarkerText}>{deliveryNumber > 0 ? deliveryNumber : 1}</Text>
                  )}
                </View>
              </Marker>
            )
          })}

          {/* Một lộ trình liên tục duy nhất tối ưu nhất */}
          {Polyline && unifiedRouteCoordinates.length > 1 && (
            <>
              {/* Viền ngoài xanh đậm tạo độ tương phản cao trên bản đồ */}
              <Polyline
                coordinates={unifiedRouteCoordinates}
                strokeColor="#1E3A8A"
                strokeWidth={7}
                zIndex={40}
              />
              {/* Tuyến đường chính màu xanh dương sáng rõ nét */}
              <Polyline
                coordinates={unifiedRouteCoordinates}
                strokeColor="#2563EB"
                strokeWidth={4.5}
                zIndex={41}
              />
            </>
          )}
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

        {/* Header hiện đại, thanh thoát */}
        <View style={styles.panelHeaderClean}>
          <View style={styles.dragHandle} />
          <View style={styles.panelHeaderRowClean}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.panelBackBtnClean}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <View style={styles.panelHeaderCenterClean}>
              <Text style={styles.panelTitleClean}>Lộ Trình Giao Hàng</Text>
              <Text style={styles.panelSubtitleClean}>
                {optimizedRoute.filter(p => p.type === 'delivery').length} điểm giao • Tuyến đường tối ưu
              </Text>
            </View>
            <View style={{ width: 36 }} />
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

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
          <Text style={styles.sectionTitle}>Thứ tự giao hàng</Text>

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
                const isCompleted = idx < currentStepIndex
                const isCurrentTarget = idx === currentStepIndex + 1
                const deliveryNumber = idx - 1
                
                const dotColor = isShop ? colors.success : (isCompleted ? '#9CA3AF' : '#2563EB')

                return (
                  <View key={point.id} style={[styles.stopWrapper, isCompleted && { opacity: 0.5 }]}>
                    {/* Connector */}
                    {idx < optimizedRoute.length - 1 && (
                      <View style={[styles.connector, { backgroundColor: '#E2E8F0' }]} />
                    )}

                    <TouchableOpacity
                      style={[
                        styles.stopCard, 
                        isSelected && { borderColor: dotColor, borderWidth: 2 },
                        isCurrentTarget && { borderColor: colors.primary, borderWidth: 1.5, backgroundColor: '#FFF7ED' }
                      ]}
                      onPress={() => setSelectedStop(isSelected ? null : idx)}
                      activeOpacity={0.85}
                    >
                      {/* Badge số thứ tự */}
                      <View style={[styles.stopBadge, { backgroundColor: dotColor }]}>
                        {isShop ? (
                          <Ionicons name="storefront" size={15} color="#fff" />
                        ) : (
                          <Text style={styles.stopBadgeNum}>{deliveryNumber > 0 ? deliveryNumber : 1}</Text>
                        )}
                      </View>

                      <View style={styles.stopContent}>
                        <View style={styles.stopTopRow}>
                          <View style={styles.stopLabelWrap}>
                            <Text style={styles.stopLabel}>
                              {isShop ? `Lấy hàng tại ${point.address}` : point.label}
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
                            <Ionicons name="navigate-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                            <Text style={styles.stopDist}>
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
                                  const dId = point.delivery?.id || point.delivery?.ma_don_hang || point.id
                                  navigation.navigate('OrderDetail', { deliveryId: dId })
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
        </ScrollView>

        {/* CTA Button Động */}
        <View style={styles.ctaContainer}>
          <TouchableOpacity style={styles.ctaBtn} onPress={handleNextStep} activeOpacity={0.85}>
            <LinearGradient colors={['#16A34A', '#15803D']} style={styles.ctaGradient}>
              <Ionicons name={ctaIcon} size={26} color="#fff" />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.ctaTitle}>{ctaTitle}</Text>
                {optimizedRoute[currentStepIndex + 1] && (
                  <Text style={styles.ctaSub}>Nhấn để xác nhận hoàn thành điểm dừng</Text>
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
                Hoàn thành tất cả các đơn
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      {/* ─── Proof of Delivery (P.O.D) Modal Chuẩn Giống Đơn Lẻ ─── */}
      <Modal visible={podStep !== 'idle'} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.podOverlay}>
          <Animated.View style={[styles.podContainer, { transform: [{ scale: podScaleAnim }] }]}>
            {podStep === 'camera' && (
              <>
                <View style={styles.podHeader}>
                  <View style={styles.podHeaderLeft}>
                    <View style={styles.podIconBadge}>
                      <Ionicons name="camera" size={20} color="#fff" />
                    </View>
                    <View>
                      <Text style={styles.podTitle}>Chụp ảnh bằng chứng</Text>
                      <Text style={styles.podSubtitle}>
                        {pendingTargetPoint?.label || 'Điểm giao'} • Đơn #{pendingTargetPoint?.orderCode || ''}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={closePodModal} style={styles.podCloseBtn}>
                    <Ionicons name="close" size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                {CameraView && cameraPermission?.granted ? (
                  <View style={styles.cameraContainer}>
                    <CameraView ref={cameraRef} style={styles.cameraView} facing="back">
                      <View style={styles.cameraOverlay}>
                        <View style={styles.scanFrame}>
                          <View style={[styles.corner, styles.cornerTL]} />
                          <View style={[styles.corner, styles.cornerTR]} />
                          <View style={[styles.corner, styles.cornerBL]} />
                          <View style={[styles.corner, styles.cornerBR]} />
                        </View>
                        <Text style={styles.cameraHint}>Hướng camera vào hàng đã giao</Text>
                      </View>
                    </CameraView>
                  </View>
                ) : (
                  <View style={styles.cameraPlaceholder}>
                    <Ionicons name="camera-outline" size={56} color={colors.muted} />
                    <Text style={styles.cameraPlaceholderText}>
                      {!cameraPermission?.granted ? 'Camera chưa được cấp quyền' : 'Camera không khả dụng'}
                    </Text>
                    {!cameraPermission?.granted && (
                      <TouchableOpacity 
                        style={{ marginTop: 8, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: colors.primaryBg, borderRadius: 8 }}
                        onPress={() => requestCameraPermission()}
                      >
                        <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 13 }}>Cấp quyền Camera</Text>
                      </TouchableOpacity>
                    )}
                    <Text style={styles.cameraPlaceholderSub}>Hoặc chọn "Ảnh Demo" để tiếp tục</Text>
                  </View>
                )}

                <View style={styles.watermarkPreviewRow}>
                  <Ionicons name="location" size={14} color={colors.primary} />
                  <Text style={styles.watermarkPreviewText} numberOfLines={1}>
                    GPS: {formatCoord(shipperLocation?.latitude || pendingTargetPoint?.lat)}°N, {formatCoord(shipperLocation?.longitude || pendingTargetPoint?.lng)}°E  •  {watermarkTime}
                  </Text>
                </View>

                <View style={styles.podCameraActions}>
                  {CameraView && cameraPermission?.granted ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, width: '100%' }}>
                      <TouchableOpacity style={styles.captureBtn} onPress={handleTakePhoto}>
                        <View style={styles.captureInner} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.demoPhotoSmallBtn} onPress={handleDemoPhoto}>
                        <Ionicons name="images-outline" size={18} color={colors.textSecondary} />
                        <Text style={styles.demoPhotoSmallText}>Ảnh mẫu</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.demoPhotoBtn} onPress={handleDemoPhoto}>
                      <Ionicons name="images-outline" size={20} color="#fff" />
                      <Text style={styles.demoPhotoBtnText}>Ảnh Demo (Test)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            {podStep === 'preview' && (
              <>
                <View style={styles.podHeader}>
                  <View style={styles.podHeaderLeft}>
                    <View style={[styles.podIconBadge, { backgroundColor: '#8b5cf6' }]}>
                      <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    </View>
                    <View>
                      <Text style={styles.podTitle}>Xác nhận ảnh bằng chứng</Text>
                      <Text style={styles.podSubtitle}>Kiểm tra ảnh trước khi gửi</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => setPodStep('camera')} style={styles.podCloseBtn}>
                    <Ionicons name="refresh" size={22} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.watermarkedImageContainer}>
                  <Image source={{ uri: podImage }} style={styles.podPreviewImage} resizeMode="cover" />

                  <View style={styles.watermarkOverlay}>
                    <View style={styles.watermarkHeader}>
                      <Ionicons name="shield-checkmark" size={12} color="#fff" />
                      <Text style={styles.watermarkBrand}>AVENGERS COFFEE DELIVERY</Text>
                    </View>
                    <View style={styles.watermarkFooter}>
                      <View style={styles.watermarkRow}>
                        <Ionicons name="location" size={11} color="#fbbf24" />
                        <Text style={styles.watermarkGPS}>
                          {formatCoord(shipperLocation?.latitude || pendingTargetPoint?.lat)}°N, {formatCoord(shipperLocation?.longitude || pendingTargetPoint?.lng)}°E
                        </Text>
                      </View>
                      <View style={styles.watermarkRow}>
                        <Ionicons name="time" size={11} color="#fbbf24" />
                        <Text style={styles.watermarkTime}>{watermarkTime}</Text>
                      </View>
                      <View style={styles.watermarkRow}>
                        <Ionicons name="receipt" size={11} color="#fbbf24" />
                        <Text style={styles.watermarkOrder}>Đơn #{pendingTargetPoint?.orderCode || ''}</Text>
                      </View>
                      <View style={[styles.watermarkRow, { marginTop: 3 }]}>
                        <View style={styles.watermarkBadge}>
                          <Text style={styles.watermarkBadgeText}>✓ GIAO THÀNH CÔNG</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.podInfoBanner}>
                  <Ionicons name="information-circle" size={16} color={colors.info} />
                  <Text style={styles.podInfoText}>
                    Ảnh và tọa độ GPS sẽ được lưu làm bằng chứng giao hàng. Không thể chỉnh sửa sau khi xác nhận.
                  </Text>
                </View>

                <View style={styles.podPreviewActions}>
                  <TouchableOpacity style={styles.retakeBtn} onPress={() => setPodStep('camera')}>
                    <Ionicons name="camera-reverse-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.retakeBtnText}>Chụp lại</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmDeliveryBtn} onPress={submitCompleteBatchDelivery}>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.confirmDeliveryBtnText}>Xác nhận Giao Xong</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {podStep === 'submitting' && (
              <View style={styles.podCenterState}>
                <View style={styles.podSpinnerWrap}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
                <Text style={styles.podStateTitle}>Đang xử lý...</Text>
                <Text style={styles.podStateSubtitle}>Đang cập nhật trạng thái đơn hàng</Text>
              </View>
            )}

            {podStep === 'done' && (
              <View style={styles.podCenterState}>
                <Animated.View style={[styles.podSuccessCircle, { transform: [{ scale: podSuccessAnim }] }]}>
                  <Ionicons name="checkmark-circle" size={80} color={colors.success} />
                </Animated.View>
                <Text style={styles.podStateTitle}>Giao hàng thành công!</Text>
                <Text style={styles.podStateSubtitle}>Đã hoàn thành điểm giao #{pendingTargetPoint?.orderCode || ''}</Text>
                <View style={styles.podDoneInfoRow}>
                  <Ionicons name="location" size={14} color={colors.muted} />
                  <Text style={styles.podDoneInfoText}>
                    {formatCoord(shipperLocation?.latitude || pendingTargetPoint?.lat)}°N, {formatCoord(shipperLocation?.longitude || pendingTargetPoint?.lng)}°E
                  </Text>
                </View>
                <View style={styles.podDoneInfoRow}>
                  <Ionicons name="time" size={14} color={colors.muted} />
                  <Text style={styles.podDoneInfoText}>{watermarkTime}</Text>
                </View>
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#e5e7eb' },

  // Map
  map: { flex: 1 },
  mapPlaceholder: { flex: 1, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  mapPlaceholderText: { color: colors.muted, marginTop: 12, fontSize: 14 },

  markerShipper: { backgroundColor: '#fff', padding: 3, borderRadius: 22, borderWidth: 2, borderColor: '#2563EB', ...shadows.md },
  routeMarker: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#fff', ...shadows.sm,
  },
  routeMarkerDelivery: { backgroundColor: '#2563EB' },
  routeMarkerShop: { backgroundColor: '#16A34A', width: 36, height: 36, borderRadius: 18 },
  routeMarkerTarget: { borderWidth: 3, borderColor: '#FB923C', transform: [{ scale: 1.18 }], ...shadows.md },
  routeMarkerCompleted: { backgroundColor: '#9CA3AF', opacity: 0.7 },
  routeMarkerSelected: { transform: [{ scale: 1.25 }] },
  routeMarkerText: { color: '#fff', fontWeight: '900', fontSize: 13 },

  // Bottom Panel
  bottomPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: '65%',
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden', ...shadows.lg,
    borderTopWidth: 1, borderColor: '#E2E8F0',
  },
  panelHeaderClean: {
    backgroundColor: '#FFFFFF',
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    alignItems: 'center',
  },
  dragHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 8,
  },
  panelHeaderRowClean: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.md,
  },
  panelBackBtnClean: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelHeaderCenterClean: {
    alignItems: 'center',
    flex: 1,
  },
  panelTitleClean: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  panelSubtitleClean: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },

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

  // ─── POD Modal Styles ──────────────────────────────────────────
  podOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  podContainer: {
    backgroundColor: colors.surface, borderRadius: radius.xl,
    width: '100%', maxWidth: 420, overflow: 'hidden', ...shadows.lg,
  },
  podHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  podHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  podIconBadge: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  podTitle: { ...typography.bodyBold, color: colors.text, fontSize: 16 },
  podSubtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  podCloseBtn: { padding: spacing.xs },

  // Camera
  cameraContainer: { height: 280, margin: spacing.md, borderRadius: radius.lg, overflow: 'hidden' },
  cameraView: { flex: 1 },
  cameraOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scanFrame: { width: 200, height: 200, position: 'relative' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#fff', borderWidth: 3 },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 4 },
  cameraHint: {
    color: '#fff', fontSize: 12, fontWeight: '600',
    marginTop: 16, textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  cameraPlaceholder: {
    height: 220, margin: spacing.md, borderRadius: radius.lg,
    backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed',
  },
  cameraPlaceholderText: { color: colors.textSecondary, fontWeight: '600', fontSize: 15, marginTop: 12 },
  cameraPlaceholderSub: { color: colors.muted, fontSize: 12, marginTop: 4 },

  watermarkPreviewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.primaryBg, marginHorizontal: spacing.md,
    borderRadius: radius.md, marginBottom: spacing.sm,
  },
  watermarkPreviewText: { flex: 1, color: colors.primary, fontSize: 11, fontWeight: '600' },

  podCameraActions: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, alignItems: 'center' },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff',
    borderWidth: 4, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', ...shadows.primary,
  },
  captureInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary },
  demoPhotoSmallBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: radius.md, backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border,
  },
  demoPhotoSmallText: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  demoPhotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#8b5cf6', paddingVertical: 14, paddingHorizontal: 32,
    borderRadius: radius.xl, ...shadows.sm,
  },
  demoPhotoBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  // Preview + Watermark
  watermarkedImageContainer: {
    margin: spacing.md, borderRadius: radius.lg,
    overflow: 'hidden', position: 'relative',
  },
  podPreviewImage: { width: '100%', height: 220 },
  watermarkOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between' },
  watermarkHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(227, 26, 35, 0.88)',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  watermarkBrand: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 0.5 },
  watermarkFooter: { backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: 10, paddingVertical: 8 },
  watermarkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  watermarkGPS: {
    color: '#fff', fontSize: 11, fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  watermarkTime: { color: '#fff', fontSize: 11, fontWeight: '700' },
  watermarkOrder: { color: '#fbbf24', fontSize: 11, fontWeight: '900' },
  watermarkBadge: { backgroundColor: colors.success, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  watermarkBadgeText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  podInfoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.infoBg, marginHorizontal: spacing.md,
    borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm,
  },
  podInfoText: { flex: 1, color: colors.info, fontSize: 11, lineHeight: 16 },

  podPreviewActions: { flexDirection: 'row', gap: 10, padding: spacing.md, paddingTop: 0 },
  retakeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14, borderRadius: radius.lg,
  },
  retakeBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
  confirmDeliveryBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.success, paddingVertical: 14,
    borderRadius: radius.lg, ...shadows.success,
  },
  confirmDeliveryBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },

  // Submitting & Done states
  podCenterState: { padding: spacing.xl, alignItems: 'center' },
  podSpinnerWrap: { marginBottom: spacing.md },
  podSuccessCircle: { marginBottom: spacing.md },
  podStateTitle: { ...typography.h4, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  podStateSubtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.md },
  podDoneInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  podDoneInfoText: { color: colors.muted, fontSize: 12 },
})
