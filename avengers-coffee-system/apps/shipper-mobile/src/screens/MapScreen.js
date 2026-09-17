import React, { useState, useEffect, useRef } from 'react'
import { View, StyleSheet, TouchableOpacity, Text, SafeAreaView, Linking, Platform, Alert, ScrollView, Modal, Image, Animated } from 'react-native'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { useShipper, globalState } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { formatBranchName, formatBranchFullTitle, formatBranchAddress, setGlobalBranchList } from '../lib/branchHelper'
import { openGoogleMapsNavigation } from '../lib/navigationHelper'
import { startBackgroundLocationTracking, stopBackgroundLocationTracking } from '../lib/backgroundLocationManager'

let MapView, Marker, Polyline
if (Platform.OS !== 'web') {
  try {
    const maps = require('react-native-maps')
    MapView = maps.default
    Marker = maps.Marker
    Polyline = maps.Polyline
  } catch (e) {
    console.warn('react-native-maps not found')
  }
}

let CameraView = null
let useCameraPermissions = null
if (Platform.OS !== 'web') {
  try {
    const cam = require('expo-camera')
    CameraView = cam.CameraView
    useCameraPermissions = cam.useCameraPermissions
  } catch (e) {
    console.warn('expo-camera not found')
  }
}

const VIETMAP_API_KEY = process.env.EXPO_PUBLIC_VIETMAP_API_KEY || 'dbdd3165b3cb0d85239a7f59f410a9fa925974c4a6d4c54b';
const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN || '';


function formatETA(distanceKm) {
  const minutes = Math.round((distanceKm / 30) * 60)
  if (minutes < 1) return '< 1 phút'
  if (minutes < 60) return `~${minutes} phút`
  return `~${Math.floor(minutes / 60)}h ${minutes % 60}p`
}

function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getManeuverText(step) {
  if (!step || !step.maneuver) return 'Tiếp tục di chuyển'
  if (step.maneuver.instruction) return step.maneuver.instruction
  const { type, modifier } = step.maneuver
  const road = step.name || 'đường phía trước'

  if (type === 'turn') {
    if (modifier?.includes('left')) return `↰ Rẽ trái vào ${road}`
    if (modifier?.includes('right')) return `↱ Rẽ phải vào ${road}`
  }
  if (type === 'arrive') return `📍 Đã đến ${road}`
  return `↑ Đi tiếp trên ${road}`
}


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

function usePodCamera() {
  if (useCameraPermissions) {
    return useCameraPermissions()
  }
  return [null, null]
}

export function MapScreen({ route, navigation }) {
  const { delivery } = route.params
  const { shipper } = useShipper()
  const [location, setLocation] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [distance, setDistance] = useState(null)

  const [routesToStore, setRoutesToStore] = useState([])
  const [routesToCustomer, setRoutesToCustomer] = useState([])

  const [selectedRouteStoreIndex, setSelectedRouteStoreIndex] = useState(0)
  const [selectedRouteCustomerIndex, setSelectedRouteCustomerIndex] = useState(0)

  const [currentStepText, setCurrentStepText] = useState('Đang tìm đường...')
  const [etaText, setEtaText] = useState('')
  const [nextManeuverLocation, setNextManeuverLocation] = useState(null)

  const [podStep, setPodStep] = useState('idle')
  const [podImage, setPodImage] = useState(null)
  const [watermarkTime, setWatermarkTime] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const podScaleAnim = useRef(new Animated.Value(0)).current
  const podSuccessAnim = useRef(new Animated.Value(0)).current
  const cameraRef = useRef(null)

  const [cameraPermission, requestCameraPermission] = usePodCamera()

  const isSimulatingRef = useRef(false)
  const simulationInterval = useRef(null)

  const activeStepsRef = useRef([])
  const currentStepIndexRef = useRef(0)

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

  const branchList = Array.isArray(publicBranchPayload?.items)
    ? publicBranchPayload.items
    : (Array.isArray(publicBranchPayload?.data) ? publicBranchPayload.data : (Array.isArray(publicBranchPayload) ? publicBranchPayload : []));

  const branchCode = delivery?.order?.co_so_ma || delivery?.branch_code || shipper?.branch_code;
  const normalizedCode = (branchCode || '').trim().toUpperCase();

  const matchedBranch = branchList.find(b => {
    const bCode = String(b.ma_chi_nhanh || b.co_so_ma || b.branch_code || b.id || '').trim().toUpperCase();
    return bCode === normalizedCode || bCode.replace(/-/g, '_') === normalizedCode.replace(/-/g, '_');
  });

  const branchName = (delivery?.store_name && !delivery.store_name.includes('_'))
    ? (delivery.store_name.toLowerCase().includes('avengers coffee') ? delivery.store_name : `Avengers Coffee - ${delivery.store_name}`)
    : formatBranchFullTitle(branchCode, publicBranchPayload);

  const branchAddress = (delivery?.store_address && !delivery.store_address.includes('_'))
    ? delivery.store_address
    : formatBranchAddress(branchCode, publicBranchPayload, delivery?.pickup_address);

  const storeLat = delivery?.tracking?.store_latitude
    ? Number(delivery.tracking.store_latitude)
    : (matchedBranch?.vi_do ? Number(matchedBranch.vi_do) : 10.80734);
  const storeLng = delivery?.tracking?.store_longitude
    ? Number(delivery.tracking.store_longitude)
    : (matchedBranch?.kinh_do ? Number(matchedBranch.kinh_do) : 106.717612);

  const destLat = delivery?.tracking?.destination_latitude
    ? Number(delivery.tracking.destination_latitude)
    : (delivery?.delivery_latitude ? Number(delivery.delivery_latitude) : storeLat + 0.006);
  const destLng = delivery?.tracking?.destination_longitude
    ? Number(delivery.tracking.destination_longitude)
    : (delivery?.delivery_longitude ? Number(delivery.delivery_longitude) : storeLng + 0.006);

  const customerAddress = String(
    delivery?.delivery_address ||
    delivery?.dia_chi_giao_hang ||
    delivery?.order?.dia_chi_giao_hang ||
    delivery?.tracking?.delivery_address ||
    ''
  ).trim();

  const openPodModal = () => {
    setPodStep('camera')
    setWatermarkTime(formatWatermarkTime())
    Animated.spring(podScaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }).start()
  }

  const closePodModal = () => {
    Animated.timing(podScaleAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setPodStep('idle')
      setPodImage(null)
    })
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.headerWrap}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Ionicons name="map-outline" size={64} color={colors.textSecondary} />
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 10 }}>Bản đồ không hỗ trợ Web</Text>
          <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 5 }}>
            Vui lòng sử dụng ứng dụng di động để xem bản đồ điều hướng.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  useEffect(() => {
    let sub = null
      ; (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status !== 'granted') {
          setErrorMsg('Cần quyền truy cập vị trí')
          return
        }
        const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        setLocation(initial)
        const d = calcDistance(initial.coords.latitude, initial.coords.longitude, destLat, destLng)
        setDistance(d)

        const startLat = initial.coords.latitude;
        const startLng = initial.coords.longitude;

        // 1. Lộ trình từ vị trí Shipper -> Cửa hàng (Vietmap Motorcycle Route)
        try {
          const urlStore = `https://maps.vietmap.vn/api/route?api-version=1.1&apikey=${VIETMAP_API_KEY}&point=${startLat},${startLng}&point=${storeLat},${storeLng}&vehicle=motorcycle&points_encoded=false`;
          const resStore = await fetch(urlStore);
          const dataStore = await resStore.json();
          if (dataStore.code === 'OK' && dataStore.paths) {
            const parsedStore = dataStore.paths.map((p) => ({
              distance: p.distance / 1000,
              duration: p.time / 1000 / 60,
              coordinates: (p.points?.coordinates || []).map((c) => ({ latitude: c[1], longitude: c[0] })),
              steps: (p.instructions || []).map((ins) => ({
                maneuver: {
                  location: p.points?.coordinates?.[ins.interval?.[0] || 0] || [0, 0],
                  instruction: ins.text,
                },
                name: ins.street_name,
              })),
            }));
            setRoutesToStore(parsedStore);
            if (delivery?.status === 'PICKING_UP' || delivery?.status === 'CONFIRMED') {
              activeStepsRef.current = parsedStore[0]?.steps || [];
              currentStepIndexRef.current = 0;
              if (activeStepsRef.current.length > 0) {
                setCurrentStepText(getManeuverText(activeStepsRef.current[0]));
              }
            }
          }
        } catch (err) {
          console.warn('Vietmap route error (store):', err);
        }

        // 2. Lộ trình từ Cửa hàng -> Khách nhận hàng (Vietmap Motorcycle Route)
        try {
          const urlCust = `https://maps.vietmap.vn/api/route?api-version=1.1&apikey=${VIETMAP_API_KEY}&point=${storeLat},${storeLng}&point=${destLat},${destLng}&vehicle=motorcycle&points_encoded=false`;
          const resCust = await fetch(urlCust);
          const dataCust = await resCust.json();
          if (dataCust.code === 'OK' && dataCust.paths) {
            const parsedCust = dataCust.paths.map((p) => ({
              distance: p.distance / 1000,
              duration: p.time / 1000 / 60,
              coordinates: (p.points?.coordinates || []).map((c) => ({ latitude: c[1], longitude: c[0] })),
              steps: (p.instructions || []).map((ins) => ({
                maneuver: {
                  location: p.points?.coordinates?.[ins.interval?.[0] || 0] || [0, 0],
                  instruction: ins.text,
                },
                name: ins.street_name,
              })),
            }));
            setRoutesToCustomer(parsedCust);
            if (parsedCust.length > 0) {
              setDistance(parsedCust[0].distance);
              setEtaText(formatETA(parsedCust[0].distance));
              if (delivery?.status !== 'PICKING_UP' && delivery?.status !== 'CONFIRMED') {
                activeStepsRef.current = parsedCust[0]?.steps || [];
                currentStepIndexRef.current = 0;
                if (activeStepsRef.current.length > 0) {
                  setCurrentStepText(getManeuverText(activeStepsRef.current[0]));
                }
              }
            }
          }
        } catch (err) {
          console.warn('Vietmap route error (customer):', err);
        }


        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 10 },
          (newLoc) => {
            if (isSimulatingRef.current) return;
            setLocation(newLoc)
            updateNavInstruction(newLoc.coords.latitude, newLoc.coords.longitude);

            const newD = calcDistance(newLoc.coords.latitude, newLoc.coords.longitude, destLat, destLng)
            setDistance(newD)
            if (shipper?.id) {
              apiClient.patch(`/shippers/${shipper.id}/location`, {
                latitude: newLoc.coords.latitude,
                longitude: newLoc.coords.longitude,
              }).catch(() => { })
            }
          }
        )

        // Tự động kích hoạt Background Location Tracking cho đơn hàng đang giao
        if (shipper?.id) {
          startBackgroundLocationTracking(shipper.id).catch(() => {});
        }
      })()

    return () => {
      if (sub) sub.remove();
      if (simulationInterval.current) clearInterval(simulationInterval.current);
      globalState.isSimulating = false;
      stopBackgroundLocationTracking().catch(() => {});
    }
  }, [])

  const updateNavInstruction = (lat, lng) => {
    const steps = activeStepsRef.current;
    if (!steps || steps.length === 0) return;

    let minD = Infinity;
    let closestIdx = currentStepIndexRef.current;

    for (let i = currentStepIndexRef.current; i < steps.length; i++) {
      const step = steps[i];
      if (step.maneuver && step.maneuver.location) {
        const d = calcDistance(lat, lng, step.maneuver.location[1], step.maneuver.location[0]);
        if (d < minD) {
          minD = d;
          closestIdx = i;
        }
      }
    }

    if (minD < 0.05 && closestIdx + 1 < steps.length) {
      closestIdx = closestIdx + 1;
    }

    currentStepIndexRef.current = closestIdx;
    setCurrentStepText(getManeuverText(steps[closestIdx]));

    if (steps[closestIdx]?.maneuver?.location) {
      setNextManeuverLocation({
        latitude: steps[closestIdx].maneuver.location[1],
        longitude: steps[closestIdx].maneuver.location[0]
      });
    }
  };

  const simulateMovement = (targetLat, targetLng) => {
    if (!shipper?.id || !location) return;

    isSimulatingRef.current = true;
    globalState.isSimulating = true;
    if (simulationInterval.current) clearInterval(simulationInterval.current);

    let pathCoords = [];
    if (targetLat === destLat && targetLng === destLng && routesToCustomer.length > 0) {
      pathCoords = routesToCustomer[selectedRouteCustomerIndex].coordinates;
      activeStepsRef.current = routesToCustomer[selectedRouteCustomerIndex].steps;
      currentStepIndexRef.current = 0;
    } else if (targetLat === storeLat && targetLng === storeLng && routesToStore.length > 0) {
      pathCoords = routesToStore[selectedRouteStoreIndex].coordinates;
      activeStepsRef.current = routesToStore[selectedRouteStoreIndex].steps;
      currentStepIndexRef.current = 0;
    } else {
      pathCoords = [
        { latitude: location.coords.latitude, longitude: location.coords.longitude },
        { latitude: targetLat, longitude: targetLng }
      ];
    }

    const steps = 75;
    const intervalMs = 200; // Trả lại tốc độ cũ (tổng 15s) để khớp với polling 15s của app Customer
    let currentStep = 0;

    simulationInterval.current = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;

      const totalSegments = pathCoords.length - 1;
      const exactIndex = progress * totalSegments;
      const lowerIndex = Math.floor(exactIndex);
      const upperIndex = Math.min(Math.ceil(exactIndex), totalSegments);
      const segmentProgress = exactIndex - lowerIndex;

      const p1 = pathCoords[lowerIndex];
      const p2 = pathCoords[upperIndex];

      const newLat = p1.latitude + (p2.latitude - p1.latitude) * segmentProgress;
      const newLng = p1.longitude + (p2.longitude - p1.longitude) * segmentProgress;

      const newLoc = { coords: { latitude: newLat, longitude: newLng } };
      setLocation(newLoc);
      updateNavInstruction(newLat, newLng);

      if (currentStep === 1 || currentStep % 5 === 0 || currentStep === steps) {
        apiClient.patch(`/shippers/${shipper.id}/location`, {
          latitude: newLat,
          longitude: newLng,
        }).catch(() => { });
      }

      setDistance(calcDistance(newLat, newLng, destLat, destLng));

      if (currentStep >= steps) {
        clearInterval(simulationInterval.current);
        simulationInterval.current = null;
      }
    }, intervalMs);
  };

  const openExternalNav = async () => {
    // 1. Cập nhật vị trí tức thời lên server trước khi chuyển màn hình sang Google Maps
    try {
      const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (cur?.coords && shipper?.id) {
        apiClient.patch(`/shippers/${shipper.id}/location`, {
          latitude: cur.coords.latitude,
          longitude: cur.coords.longitude,
        }).catch(() => {});
      }
    } catch (e) {}

    // 2. Kích hoạt Background Location Tracking chạy ngầm
    if (shipper?.id) {
      startBackgroundLocationTracking(shipper.id).catch(() => {});
    }

    // 3. Mở Google Maps
    openGoogleMapsNavigation(customerAddress, { latitude: destLat, longitude: destLng });
  }

  const callCustomer = () => {
    const phone = delivery?.customer_phone
    if (!phone) return
    Linking.openURL(`tel:${phone}`)
  }

  const handleCompleteDelivery = async () => {
    if (CameraView && requestCameraPermission) {
      if (!cameraPermission?.granted) {
        const result = await requestCameraPermission()
        if (!result.granted) {
          Alert.alert('Cần quyền Camera', 'Ứng dụng cần quyền truy cập camera để chụp ảnh bằng chứng giao hàng.')
          return
        }
      }
      openPodModal()
    } else {
      openPodModal()
    }
  };

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
      setPodImage(photo.uri)
      setPodStep('preview')
    } catch (err) {
      Alert.alert('Lỗi camera', 'Không thể chụp ảnh. Thử lại.')
    }
  };

  const handleDemoPhoto = () => {
    setPodImage('https://images.unsplash.com/photo-1610632380989-7f09b1a64f8a?w=600&q=80')
    setWatermarkTime(formatWatermarkTime())
    setPodStep('preview')
  };

  const submitCompleteDelivery = async () => {
    if (!shipper?.id || !delivery?.id) return;

    setIsSubmitting(true);
    setPodStep('submitting');
    try {
      await apiClient.post(`/shippers/${shipper.id}/deliveries/${delivery.id}/complete`, {
        latitude: location?.coords?.latitude || destLat,
        longitude: location?.coords?.longitude || destLng,
        proof_image_url: podImage,
        proof_metadata: {
          timestamp: watermarkTime,
          gps_lat: formatCoord(location?.coords?.latitude || destLat),
          gps_lng: formatCoord(location?.coords?.longitude || destLng),
          order_code: delivery?.ma_don_hang?.slice(0, 8).toUpperCase(),
        }
      });

      setPodStep('done')
      stopBackgroundLocationTracking().catch(() => {});
      Animated.spring(podSuccessAnim, { toValue: 1, useNativeDriver: true, tension: 50, friction: 6 }).start()
      setTimeout(() => {
        closePodModal();
        navigation.goBack();
      }, 2200);
    } catch (err) {
      setIsSubmitting(false);
      setPodStep('preview');
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể hoàn thành đơn hàng.');
    }
  };

  const mapRegion = {
    latitude: location?.coords.latitude || storeLat,
    longitude: location?.coords.longitude || storeLng,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  }

  const currentLat = location?.coords?.latitude
  const currentLng = location?.coords?.longitude
  const orderCode = delivery?.ma_don_hang?.slice(0, 8).toUpperCase() || 'UNKNOWN'

  return (
    <View style={styles.container}>
      {MapView && (
        <MapView style={styles.map} initialRegion={mapRegion} showsUserLocation={true} showsMyLocationButton={true}>
          <Marker coordinate={{ latitude: storeLat, longitude: storeLng }} title="Cửa hàng Avengers" description="Lấy hàng tại đây">
            <View style={styles.markerStore}>
              <Ionicons name="storefront" size={20} color={colors.surface} />
            </View>
          </Marker>

          <Marker coordinate={{ latitude: destLat, longitude: destLng }} title="Khách hàng" description={customerAddress || 'Địa chỉ khách hàng'}>
            <View style={styles.markerDest}>
              <Ionicons name="location" size={24} color={colors.surface} />
            </View>
          </Marker>

          {location && (
            <Marker coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }} title="Shipper" zIndex={100}>
              <View style={styles.markerShipper}>
                <Text style={{ fontSize: 20 }}>🛵</Text>
              </View>
            </Marker>
          )}

          {nextManeuverLocation && (
            <Marker coordinate={nextManeuverLocation} title="Điểm rẽ tiếp theo" zIndex={50}>
              <View style={{
                width: 16, height: 16, borderRadius: 8, backgroundColor: '#ef4444',
                borderWidth: 2, borderColor: '#fff',
                shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 2
              }} />
            </Marker>
          )}

          {routesToStore.map((route, index) => {
            const isSelected = index === selectedRouteStoreIndex;
            return (
              <Polyline
                key={`store-route-${index}`}
                coordinates={route.coordinates}
                strokeColor={isSelected ? '#3b82f6' : '#93c5fd'}
                strokeWidth={isSelected ? 5 : 3}
                zIndex={isSelected ? 9 : 1}
                tappable={true}
                onPress={() => setSelectedRouteStoreIndex(index)}
              />
            );
          })}

          {routesToCustomer.map((route, index) => {
            const isSelected = index === selectedRouteCustomerIndex;
            return (
              <Polyline
                key={`cust-route-${index}`}
                coordinates={route.coordinates}
                strokeColor={isSelected ? '#3b82f6' : '#93c5fd'}
                strokeWidth={isSelected ? 6 : 4}
                zIndex={isSelected ? 10 : 2}
                tappable={true}
                onPress={() => {
                  setSelectedRouteCustomerIndex(index);
                  setDistance(route.distance);
                }}
              />
            );
          })}

          {routesToCustomer.length === 0 && routesToStore.length === 0 && location && (
            <Polyline
              coordinates={[
                { latitude: location.coords.latitude, longitude: location.coords.longitude },
                { latitude: storeLat, longitude: storeLng },
                { latitude: destLat, longitude: destLng },
              ]}
              strokeColor={colors.primary}
              strokeWidth={4}
              lineDashPattern={[10, 5]}
            />
          )}
        </MapView>
      )}

      <SafeAreaView style={styles.headerWrap} pointerEvents="box-none">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Bản đồ điều hướng</Text>
            <Text style={styles.headerSub}>
              #{(delivery?.ma_don_hang || delivery?.id || '').slice(0, 8).toUpperCase()}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerRightBtn}
            onPress={() => {
              if (delivery?.customer_phone) callCustomer();
              else openExternalNav();
            }}
          >
            <Ionicons name="call-outline" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {currentStepText ? (
          <View style={styles.navInstructionPill}>
            <Ionicons name="navigate-circle" size={18} color="#38BDF8" style={{ marginRight: 6 }} />
            <Text style={styles.navInstructionPillText} numberOfLines={1}>
              {currentStepText}
            </Text>
            {distance !== null && (
              <Text style={styles.navInstructionPillEta}>
                • {distance.toFixed(1)} km
              </Text>
            )}
          </View>
        ) : null}
      </SafeAreaView>

      <ScrollView style={styles.footerPanel} contentContainerStyle={{ paddingBottom: spacing.xxl + 24 }} showsVerticalScrollIndicator={false}>
        {/* THANH CHỈ DẪN ĐIỀU HƯỚNG CHI TIẾT (ĐƯỢC ĐƯA XUỐNG DƯỚI) */}
        {currentStepText ? (
          <View style={styles.navInstructionCard}>
            <View style={styles.navInstructionIconWrap}>
              <Ionicons name="navigate" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.navInstructionTitle}>{currentStepText}</Text>
              {etaText ? (
                <Text style={styles.navInstructionSub}>{etaText} • Cách {distance?.toFixed(1)} km</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* CỤM NÚT ĐIỀU KHIỂN MÔ PHỎNG & TRẠNG THÁI (ĐƯỢC ĐƯA XUỐNG DƯỚI) */}
        <View style={styles.controlSection}>
          <Text style={styles.controlSectionTitle}>ĐIỀU HƯỚNG VÀ MÔ PHỎNG VỊ TRÍ</Text>
          <View style={styles.demoButtonsGrid}>
            <TouchableOpacity
              style={[styles.simBtn, { backgroundColor: '#2563EB' }]}
              onPress={() => simulateMovement(storeLat, storeLng)}
            >
              <Ionicons name="storefront-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.simBtnText}>Mô phỏng tới Quán</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.simBtn, { backgroundColor: '#7C3AED' }]}
              onPress={() => simulateMovement(destLat, destLng)}
            >
              <Ionicons name="person-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.simBtnText}>Mô phỏng tới Khách</Text>
            </TouchableOpacity>
          </View>

          {/* Nút hành động đơn hàng */}
          <View style={{ marginTop: 8 }}>
            {(delivery?.status === 'PICKING_UP' || delivery?.status === 'CONFIRMED') && (
              <TouchableOpacity
                style={[styles.actionStatusBtn, { backgroundColor: colors.success }]}
                onPress={async () => {
                  try {
                    await apiClient.post(`/shippers/${shipper.id}/deliveries/${delivery.id}/start`, {
                      latitude: location?.coords?.latitude,
                      longitude: location?.coords?.longitude,
                    });
                    navigation.setParams({ delivery: { ...delivery, status: 'IN_TRANSIT' } });
                    Alert.alert('Thành công', 'Đã lấy hàng và bắt đầu giao hàng!');
                  } catch (error) {
                    Alert.alert('Lỗi', error.response?.data?.message || 'Không thể cập nhật trạng thái');
                  }
                }}
              >
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.actionStatusBtnText}>XÁC NHẬN ĐÃ LẤY HÀNG</Text>
              </TouchableOpacity>
            )}

            {(delivery?.status === 'IN_TRANSIT' || delivery?.status === 'DANG_GIAO') && (
              <TouchableOpacity
                style={[styles.actionStatusBtn, { backgroundColor: colors.success }]}
                onPress={handleCompleteDelivery}
              >
                <Ionicons name="shield-checkmark-outline" size={20} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.actionStatusBtnText}>HOÀN THÀNH GIAO HÀNG (CHỤP ẢNH POD)</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.simCancelBtn, { marginTop: 8 }]}
              onPress={async () => {
                isSimulatingRef.current = false;
                globalState.isSimulating = false;
                if (simulationInterval.current) {
                  clearInterval(simulationInterval.current);
                  simulationInterval.current = null;
                }
                try {
                  const realLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                  setLocation(realLoc);
                  if (shipper?.id) {
                    apiClient.patch(`/shippers/${shipper.id}/location`, {
                      latitude: realLoc.coords.latitude,
                      longitude: realLoc.coords.longitude,
                    }).catch(() => { });
                  }
                } catch (e) {
                  console.log("Could not get real location on cancel");
                }
              }}
            >
              <Ionicons name="stop-circle-outline" size={18} color={colors.danger} style={{ marginRight: 6 }} />
              <Text style={styles.simCancelBtnText}>Dừng mô phỏng GPS</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CHỌN TUYẾN ĐƯỜNG NẾU CÓ NHIỀU TUYẾN */}
        {routesToStore.length > 1 && (
          <View style={{ marginBottom: spacing.sm, marginTop: 4 }}>
            <Text style={styles.routeSectionLabel}>
              Chọn tuyến tới Quán (Lấy hàng):
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {routesToStore.map((r, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.routeBtn, selectedRouteStoreIndex === i && { backgroundColor: '#2563EB', borderColor: '#2563EB' }]}
                  onPress={() => setSelectedRouteStoreIndex(i)}
                >
                  <Text style={[styles.routeBtnText, selectedRouteStoreIndex === i && { color: '#fff' }]}>
                    Tuyến {i + 1} ({Math.round(r.duration)} phút)
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {routesToCustomer.length > 1 && (
          <View style={{ marginBottom: spacing.sm }}>
            <Text style={styles.routeSectionLabel}>
              Chọn tuyến tới Khách hàng:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {routesToCustomer.map((r, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.routeBtn, selectedRouteCustomerIndex === i && styles.routeBtnSelected]}
                  onPress={() => {
                    setSelectedRouteCustomerIndex(i);
                    setDistance(r.distance);
                  }}
                >
                  <Text style={[styles.routeBtnText, selectedRouteCustomerIndex === i && { color: '#fff' }]}>
                    Tuyến {i + 1} ({Math.round(r.duration)} phút)
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* THẺ QUÃNG ĐƯỜNG VÀ THỜI GIAN */}
        {distance !== null && (
          <View style={styles.etaRow}>
            <View style={styles.etaItem}>
              <Ionicons name="navigate-circle-outline" size={22} color="#2563EB" />
              <Text style={styles.etaValue}>{distance.toFixed(1)} km</Text>
              <Text style={styles.etaLabel}>Quãng đường</Text>
            </View>
            <View style={styles.etaDivider} />
            <View style={styles.etaItem}>
              <Ionicons name="time-outline" size={22} color="#059669" />
              <Text style={styles.etaValue}>{formatETA(distance)}</Text>
              <Text style={styles.etaLabel}>Thời gian dự kiến</Text>
            </View>
          </View>
        )}

        {/* CHI TIẾT TUYẾN ĐƯỜNG ĐIỂM LẤY VÀ ĐIỂM GIAO */}
        <View style={styles.routeDetailBox}>
          <View style={styles.routePointRow}>
            <View style={[styles.pointIconWrap, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="storefront" size={16} color="#059669" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.pointLabel}>Điểm lấy hàng:</Text>
              <Text style={styles.pointTitle}>{branchName}</Text>
              <Text style={styles.pointSub} numberOfLines={2}>{branchAddress}</Text>
            </View>
          </View>

          <View style={styles.pointConnectLine} />

          <View style={styles.routePointRow}>
            <View style={[styles.pointIconWrap, { backgroundColor: '#FEF2F2' }]}>
              <Ionicons name="location" size={16} color="#DC2626" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.pointLabel}>Giao đến:</Text>
              <Text style={styles.pointTitle}>{delivery?.customer_name || 'Khách nhận hàng'}</Text>
              <Text style={styles.pointSub} numberOfLines={2}>
                {customerAddress || 'Địa chỉ khách hàng'}
              </Text>
            </View>
          </View>
        </View>

        {errorMsg && <Text style={styles.errText}>{errorMsg}</Text>}

        {/* HÀNG NÚT DƯỚI CÙNG (NÚT MỞ GOOGLE MAPS XANH DƯƠNG THÂN THIỆN) */}
        <View style={styles.actionBtns}>
          <TouchableOpacity style={[styles.fab, { flex: 1, backgroundColor: '#2563EB', marginRight: 8 }]} onPress={openExternalNav}>
            <Ionicons name="map-outline" size={20} color="#fff" />
            <Text style={styles.fabText}>Mở Google Maps</Text>
          </TouchableOpacity>
          {delivery?.customer_phone && (
            <TouchableOpacity style={[styles.fab, { backgroundColor: colors.success, paddingHorizontal: 16 }]} onPress={callCustomer}>
              <Ionicons name="call" size={20} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.fabText}>Gọi Khách</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

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
                      <Text style={styles.podSubtitle}>Proof of Delivery (P.O.D)</Text>
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
                    <Text style={styles.cameraPlaceholderSub}>Chọn "Ảnh Demo" để tiếp tục test</Text>
                  </View>
                )}

                <View style={styles.watermarkPreviewRow}>
                  <Ionicons name="location" size={14} color={colors.primary} />
                  <Text style={styles.watermarkPreviewText} numberOfLines={1}>
                    GPS: {formatCoord(currentLat)}°N, {formatCoord(currentLng)}°E  •  {watermarkTime}
                  </Text>
                </View>

                <View style={styles.podCameraActions}>
                  {CameraView && cameraPermission?.granted ? (
                    <TouchableOpacity style={styles.captureBtn} onPress={handleTakePhoto}>
                      <View style={styles.captureInner} />
                    </TouchableOpacity>
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
                          {formatCoord(currentLat)}°N, {formatCoord(currentLng)}°E
                        </Text>
                      </View>
                      <View style={styles.watermarkRow}>
                        <Ionicons name="time" size={11} color="#fbbf24" />
                        <Text style={styles.watermarkTime}>{watermarkTime}</Text>
                      </View>
                      <View style={styles.watermarkRow}>
                        <Ionicons name="receipt" size={11} color="#fbbf24" />
                        <Text style={styles.watermarkOrder}>Đơn #{orderCode}</Text>
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
                    Ảnh và tọa độ GPS sẽ được lưu làm bằng chứng. Không thể chỉnh sửa sau khi xác nhận.
                  </Text>
                </View>

                <View style={styles.podPreviewActions}>
                  <TouchableOpacity style={styles.retakeBtn} onPress={() => setPodStep('camera')}>
                    <Ionicons name="camera-reverse-outline" size={18} color={colors.textSecondary} />
                    <Text style={styles.retakeBtnText}>Chụp lại</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.confirmDeliveryBtn} onPress={submitCompleteDelivery}>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.confirmDeliveryBtnText}>Xác nhận Giao Xong</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {podStep === 'submitting' && (
              <View style={styles.podCenterState}>
                <View style={styles.podSpinnerWrap}>
                  <Ionicons name="cloud-upload" size={48} color={colors.primary} />
                </View>
                <Text style={styles.podStateTitle}>Đang xử lý...</Text>
                <Text style={styles.podStateSubtitle}>Đang gửi ảnh bằng chứng lên hệ thống</Text>
              </View>
            )}

            {podStep === 'done' && (
              <View style={styles.podCenterState}>
                <Animated.View style={[styles.podSuccessCircle, { transform: [{ scale: podSuccessAnim }] }]}>
                  <Ionicons name="checkmark-circle" size={80} color={colors.success} />
                </Animated.View>
                <Text style={styles.podStateTitle}>Giao hàng thành công! 🎉</Text>
                <Text style={styles.podStateSubtitle}>Ảnh bằng chứng đã được lưu vào hệ thống</Text>
                <View style={styles.podDoneInfoRow}>
                  <Ionicons name="location" size={14} color={colors.muted} />
                  <Text style={styles.podDoneInfoText}>{formatCoord(currentLat)}°N, {formatCoord(currentLng)}°E</Text>
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
  container: { flex: 1, backgroundColor: '#f9fafb' },
  map: { width: '100%', height: '100%' },
  headerWrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 50 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.95)', paddingVertical: 10, paddingHorizontal: 14,
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    borderRadius: 20, ...shadows.md,
    borderWidth: 1, borderColor: 'rgba(243, 244, 246, 0.8)',
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  headerInfo: { alignItems: 'center', flex: 1 },
  headerTitle: { ...typography.bodyBold, color: colors.text, fontSize: 15 },
  headerSub: { ...typography.caption, color: colors.primary, fontWeight: '700', fontSize: 11 },
  headerRightBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },

  navInstructionPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    marginTop: 8, paddingVertical: 7, paddingHorizontal: 14,
    borderRadius: 20, alignSelf: 'center', maxWidth: '90%',
    ...shadows.sm,
  },
  navInstructionPillText: { color: '#F8FAFC', fontSize: 12, fontWeight: '700', flexShrink: 1 },
  navInstructionPillEta: { color: '#38BDF8', fontSize: 12, fontWeight: '800', marginLeft: 4 },

  markerStore: { backgroundColor: colors.primary, padding: 8, borderRadius: 20, borderWidth: 2, borderColor: colors.surface, ...shadows.sm },
  markerDest: { backgroundColor: colors.danger, padding: 6, borderRadius: 20, borderWidth: 2, borderColor: colors.surface, ...shadows.sm },
  markerShipper: { backgroundColor: 'white', padding: 2, borderRadius: 25, borderWidth: 2, borderColor: '#4F46E5', ...shadows.md },

  footerPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    maxHeight: '54%',
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingTop: spacing.md,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    ...shadows.lg,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)',
  },

  navInstructionCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1E1B4B',
    padding: 12, borderRadius: 16, marginBottom: 12,
    ...shadows.md,
  },
  navInstructionIconWrap: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#3730A3',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  navInstructionTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
  navInstructionSub: { color: '#93C5FD', fontSize: 12, fontWeight: '600', marginTop: 2 },

  controlSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18, padding: 12,
    marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  controlSectionTitle: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.5, marginBottom: 8 },
  demoButtonsGrid: { flexDirection: 'row', gap: 8 },
  simBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 12, ...shadows.sm,
  },
  simBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  actionStatusBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 14, ...shadows.sm,
  },
  actionStatusBtnText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.3 },

  simCancelBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, borderRadius: 12,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA',
  },
  simCancelBtnText: { color: colors.danger, fontSize: 12, fontWeight: '700' },

  routeSectionLabel: { fontSize: 12, fontWeight: '800', color: colors.text, marginBottom: 6 },
  routeBtn: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 14, backgroundColor: '#F1F5F9',
    borderWidth: 1, borderColor: '#CBD5E1',
  },
  routeBtnSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  routeBtnText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },

  etaRow: {
    flexDirection: 'row', backgroundColor: '#F8FAFC',
    borderRadius: 16, padding: 10, marginBottom: 12,
    alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0',
  },
  etaItem: { flex: 1, alignItems: 'center' },
  etaValue: { ...typography.h4, color: colors.text, fontSize: 17, marginTop: 2 },
  etaLabel: { ...typography.caption, color: colors.muted, fontSize: 11 },
  etaDivider: { width: 1, height: 32, backgroundColor: '#E2E8F0' },

  routeDetailBox: {
    backgroundColor: '#fff', borderRadius: 16,
    padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  routePointRow: { flexDirection: 'row', alignItems: 'flex-start' },
  pointIconWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  pointLabel: { fontSize: 10, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  pointTitle: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 1 },
  pointSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
  pointConnectLine: { width: 2, height: 16, backgroundColor: '#E5E7EB', marginLeft: 13, marginVertical: 4 },

  errText: { color: colors.danger, fontSize: 12, marginBottom: spacing.sm },
  actionBtns: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  fab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 14, gap: 8, ...shadows.sm,
  },
  fabText: { color: '#fff', fontWeight: '800', fontSize: 14 },

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


