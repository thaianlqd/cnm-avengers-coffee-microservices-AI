import React, { useState, useEffect, useRef } from 'react'
import { View, StyleSheet, TouchableOpacity, Text, SafeAreaView, Linking, Platform, Alert, ScrollView, Modal, Image, Animated } from 'react-native'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { useShipper, globalState } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'

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

const getBranchInfo = (code) => {
  // Toạ độ khớp chính xác với BRANCH_LOCATIONS trong backend thanh-toan.service.ts
  const branches = {
    'DN_INDOCHINA_RIVERSIDE': { address: 'Avengers Coffee - Indochina Riverside, Đà Nẵng', storeLoc: { latitude: 16.0717, longitude: 108.2241 } },
    'DN_NGUYEN_VAN_THOAI':   { address: 'Avengers Coffee - Nguyễn Văn Thoại, Đà Nẵng', storeLoc: { latitude: 16.0543, longitude: 108.2435 } },
    'DN_VTV8_BACH_DANG':     { address: 'Avengers Coffee - VTV8 Bạch Đằng, Đà Nẵng',   storeLoc: { latitude: 16.0645, longitude: 108.2230 } },
    'HCM_DIEN_BIEN_PHU':    { address: 'Avengers Coffee - 220 Điện Biên Phủ, Q.3',     storeLoc: { latitude: 10.7836, longitude: 106.6896 } },
    'HCM_LY_TU_TRONG':      { address: 'Avengers Coffee - Lý Tự Trọng, Q.1',           storeLoc: { latitude: 10.7745, longitude: 106.6983 } },
    'HCM_TON_THAT_THIEP':   { address: 'Avengers Coffee - Tôn Thất Thiệp, Q.1',        storeLoc: { latitude: 10.7743, longitude: 106.7031 } },
    'HN_DU_THUYEN':          { address: 'Avengers Coffee - Du Thuyền, Hà Nội',           storeLoc: { latitude: 21.0456, longitude: 105.8369 } },
    'HN_LAM_VIEN_COMPLEX':  { address: 'Avengers Coffee - Làm Viên Complex, Hà Nội',   storeLoc: { latitude: 21.0401, longitude: 105.7904 } },
    'HN_LINH_DAM_CT3':      { address: 'Avengers Coffee - Linh Đàm CT3, Hà Nội',       storeLoc: { latitude: 20.9634, longitude: 105.8306 } },
  };

  // Normalize code: thử cả dạng gốc và dạng uppercase + replace dashes
  const normalized = (code || '').toUpperCase().replace(/-/g, '_');
  const branch = branches[code] || branches[normalized];

  if (branch) {
    return {
      address: branch.address,
      storeLoc: branch.storeLoc,
      destLoc: { latitude: branch.storeLoc.latitude + 0.003, longitude: branch.storeLoc.longitude + 0.003 },
    };
  }

  // Default fallback: HCM Điện Biên Phủ
  return {
    address: `Avengers Coffee - ${code || 'Cửa hàng'}`,
    storeLoc: { latitude: 10.7836, longitude: 106.6896 },
    destLoc: { latitude: 10.7866, longitude: 106.6926 },
  };
};

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

  const branchCode = delivery?.order?.co_so_ma || delivery?.branch_code;
  const branchInfo = getBranchInfo(branchCode);
  
  const storeLat = delivery?.tracking?.store_latitude 
    ? Number(delivery.tracking.store_latitude) 
    : branchInfo.storeLoc.latitude;
  const storeLng = delivery?.tracking?.store_longitude 
    ? Number(delivery.tracking.store_longitude) 
    : branchInfo.storeLoc.longitude;

  const destLat = delivery?.tracking?.destination_latitude 
    ? Number(delivery.tracking.destination_latitude) 
    : (delivery?.delivery_latitude ? Number(delivery.delivery_latitude) : branchInfo.destLoc.latitude);
  const destLng = delivery?.tracking?.destination_longitude 
    ? Number(delivery.tracking.destination_longitude) 
    : (delivery?.delivery_longitude ? Number(delivery.delivery_longitude) : branchInfo.destLoc.longitude);

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
    ;(async () => {
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

      try {
        const resStore = await fetch(`http://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${storeLng},${storeLat}?alternatives=true&geometries=geojson&overview=full&steps=true`);
        const dataStore = await resStore.json();
        if (dataStore.code === 'Ok' && dataStore.routes) {
          const parsedStore = dataStore.routes.map(r => ({
            distance: r.distance / 1000,
            duration: r.duration / 60,
            coordinates: r.geometry.coordinates.map(c => ({ latitude: c[1], longitude: c[0] })),
            steps: r.legs[0]?.steps || []
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
        console.warn('OSRM error (store):', err);
      }

      try {
        const resCust = await fetch(`http://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${destLng},${destLat}?alternatives=true&geometries=geojson&overview=full&steps=true`);
        const dataCust = await resCust.json();
        if (dataCust.code === 'Ok' && dataCust.routes) {
          const parsedCust = dataCust.routes.map(r => ({
            distance: r.distance / 1000,
            duration: r.duration / 60,
            coordinates: r.geometry.coordinates.map(c => ({ latitude: c[1], longitude: c[0] })),
            steps: r.legs[0]?.steps || []
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
        console.warn('OSRM error (customer):', err);
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
            }).catch(() => {})
          }
        }
      )
    })()
    
    return () => { 
      if (sub) sub.remove();
      if (simulationInterval.current) clearInterval(simulationInterval.current);
      globalState.isSimulating = false;
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

    const steps = 150;
    const intervalMs = 200;
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
      
      if (currentStep % 25 === 0 || currentStep === steps) {
        apiClient.patch(`/shippers/${shipper.id}/location`, {
          latitude: newLat,
          longitude: newLng,
        }).catch(() => {});
      }
      
      setDistance(calcDistance(newLat, newLng, destLat, destLng));
      
      if (currentStep >= steps) {
        clearInterval(simulationInterval.current);
        simulationInterval.current = null;
      }
    }, intervalMs);
  };

  const openExternalNav = () => {
    const address = encodeURIComponent(delivery?.delivery_address || '')
    const googleUrl = `https://maps.google.com/maps?daddr=${address}`
    const appleUrl = `maps:?daddr=${address}`
    const url = Platform.OS === 'ios' ? appleUrl : googleUrl
    Linking.openURL(url).catch(() => Linking.openURL(googleUrl))
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
        <MapView style={styles.map} region={mapRegion} showsUserLocation={false} showsMyLocationButton>
          <Marker coordinate={{ latitude: storeLat, longitude: storeLng }} title="Cửa hàng Avengers" description="Lấy hàng tại đây">
            <View style={styles.markerStore}>
              <Ionicons name="storefront" size={20} color={colors.surface} />
            </View>
          </Marker>

          <Marker coordinate={{ latitude: destLat, longitude: destLng }} title="Khách hàng" description={delivery?.delivery_address}>
            <View style={styles.markerDest}>
              <Ionicons name="location" size={24} color={colors.surface} />
            </View>
          </Marker>

          {location && (
            <Marker coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }} title="Shipper" zIndex={100}>
              <View style={styles.markerShipper}>
                <Text style={{fontSize: 20}}>🛵</Text>
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
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle}>Bản đồ điều hướng</Text>
            <Text style={styles.headerSub}>#{delivery?.ma_don_hang?.slice(0, 8).toUpperCase()}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {currentStepText ? (
          <View style={styles.navInstruction}>
            <Text style={styles.navInstructionText}>{currentStepText}</Text>
            {etaText ? <Text style={styles.navEtaText}>{etaText} • {distance?.toFixed(1)}km</Text> : null}
          </View>
        ) : null}
        
        <View style={styles.demoControls}>
          <TouchableOpacity style={[styles.demoBtn, {backgroundColor: colors.primary}]} onPress={() => simulateMovement(storeLat, storeLng)}>
             <Text style={styles.demoBtnText}>Tới Shop</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.demoBtn, {backgroundColor: colors.danger}]} onPress={() => simulateMovement(destLat, destLng)}>
             <Text style={styles.demoBtnText}>Tới Khách</Text>
          </TouchableOpacity>

          {(delivery?.status === 'PICKING_UP' || delivery?.status === 'CONFIRMED') && (
            <TouchableOpacity style={[styles.demoBtn, {backgroundColor: colors.success}]} onPress={async () => {
              try {
                await apiClient.post(`/shippers/${shipper.id}/deliveries/${delivery.id}/start`, {
                  latitude: location?.coords?.latitude,
                  longitude: location?.coords?.longitude
                });
                navigation.setParams({ delivery: { ...delivery, status: 'IN_TRANSIT' } });
                Alert.alert('Thành công', 'Đã lấy hàng thành công!');
              } catch (error) {
                Alert.alert('Lỗi', error.response?.data?.message || 'Không thể cập nhật trạng thái');
              }
            }}>
               <Text style={styles.demoBtnText}>Đã Lấy Hàng</Text>
            </TouchableOpacity>
          )}

          {(delivery?.status === 'IN_TRANSIT' || delivery?.status === 'DANG_GIAO') && (
            <TouchableOpacity style={[styles.demoBtn, {backgroundColor: colors.success}]} onPress={handleCompleteDelivery}>
               <Text style={styles.demoBtnText}>Hoàn Thành</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.demoBtn, {backgroundColor: '#6b7280'}]} onPress={async () => { 
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
                }).catch(() => {});
              }
            } catch (e) {
              console.log("Could not get real location on cancel");
            }
          }}>
             <Text style={styles.demoBtnText}>Hủy giả lập</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={styles.floatingActions} pointerEvents="box-none">
        {delivery?.customer_phone && (
          <TouchableOpacity style={[styles.floatingFab, {backgroundColor: colors.success}]} onPress={callCustomer}>
            <Ionicons name="call" size={24} color="#fff" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.floatingFab, {backgroundColor: '#3b82f6'}]} onPress={openExternalNav}>
          <Ionicons name="navigate" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.footerPanel} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {routesToStore.length > 1 && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: '#3b82f6', marginBottom: 4 }}>
              Chọn tuyến tới Shop (Lấy hàng):
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {routesToStore.map((r, i) => (
                <TouchableOpacity 
                  key={i} 
                  style={[styles.routeBtn, selectedRouteStoreIndex === i && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' }]}
                  onPress={() => setSelectedRouteStoreIndex(i)}
                >
                  <Text style={[styles.routeBtnText, selectedRouteStoreIndex === i && {color: '#fff'}]}>
                    Tuyến {i+1} ({Math.round(r.duration)}p)
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {routesToCustomer.length > 1 && (
          <View style={{ marginBottom: spacing.md }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', color: colors.textSecondary, marginBottom: 4 }}>
              Chọn tuyến tới Khách Hàng:
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
                  <Text style={[styles.routeBtnText, selectedRouteCustomerIndex === i && {color: '#fff'}]}>
                    Tuyến {i+1} ({Math.round(r.duration)}p)
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {distance !== null && (
          <View style={styles.etaRow}>
            <View style={styles.etaItem}>
              <Ionicons name="navigate" size={18} color={colors.primary} />
              <Text style={styles.etaValue}>{distance.toFixed(1)} km</Text>
              <Text style={styles.etaLabel}>Quãng đường</Text>
            </View>
            <View style={styles.etaDivider} />
            <View style={styles.etaItem}>
              <Ionicons name="time-outline" size={18} color={colors.primary} />
              <Text style={styles.etaValue}>{formatETA(distance)}</Text>
              <Text style={styles.etaLabel}>Thời gian dự kiến</Text>
            </View>
          </View>
        )}

        <View style={styles.addressBox}>
          <Ionicons name="location" size={22} color={colors.danger} />
          <View style={styles.addressContent}>
            <Text style={styles.addressLabel}>Giao đến:</Text>
            <Text style={styles.addressValue} numberOfLines={2}>
              {delivery?.delivery_address || 'Địa chỉ khách hàng'}
            </Text>
          </View>
        </View>

        {errorMsg && <Text style={styles.errText}>{errorMsg}</Text>}

        <View style={styles.actionBtns}>
          <TouchableOpacity style={[styles.fab, { flex: 1, marginRight: 8 }]} onPress={openExternalNav}>
            <Ionicons name="navigate-outline" size={18} color="#fff" />
            <Text style={styles.fabText}>Mở Google Maps</Text>
          </TouchableOpacity>
          {delivery?.customer_phone && (
            <TouchableOpacity style={[styles.fab, { backgroundColor: colors.success, width: 48 }]} onPress={callCustomer}>
              <Ionicons name="call" size={20} color="#fff" />
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
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  headerWrap: { position: 'absolute', top: 0, left: 0, right: 0 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface, padding: spacing.sm, margin: spacing.md,
    borderRadius: radius.lg, ...shadows.sm,
  },
  demoControls: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginHorizontal: spacing.md, flexWrap: 'wrap' },
  demoBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, ...shadows.sm },
  demoBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  backBtn: { padding: spacing.sm },
  headerInfo: { alignItems: 'center' },
  headerTitle: { ...typography.bodyBold, color: colors.text },
  headerSub: { ...typography.caption, color: colors.primary },
  markerStore: { backgroundColor: colors.primary, padding: 8, borderRadius: 20, borderWidth: 2, borderColor: colors.surface, ...shadows.sm },
  markerDest: { backgroundColor: colors.danger, padding: 6, borderRadius: 20, borderWidth: 2, borderColor: colors.surface, ...shadows.sm },
  markerShipper: { backgroundColor: 'white', padding: 2, borderRadius: 25, borderWidth: 2, borderColor: '#4F46E5', ...shadows.md },
  footerPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xxl,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...shadows.lg,
  },
  etaRow: { flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, alignItems: 'center' },
  etaItem: { flex: 1, alignItems: 'center' },
  etaValue: { ...typography.h4, color: colors.text, marginTop: 4 },
  etaLabel: { ...typography.caption, color: colors.muted },
  etaDivider: { width: 1, height: 40, backgroundColor: colors.borderLight },
  addressBox: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.md },
  addressContent: { marginLeft: spacing.md, flex: 1 },
  addressLabel: { ...typography.caption, color: colors.textSecondary },
  addressValue: { ...typography.bodyBold, color: colors.text, marginTop: 4 },
  errText: { color: colors.danger, fontSize: 12, marginBottom: spacing.sm },
  actionBtns: { flexDirection: 'row', alignItems: 'center' },
  fab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, paddingVertical: spacing.md, borderRadius: radius.lg, gap: 8, ...shadows.sm },
  fabText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  routeBtn: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border,
  },
  routeBtnSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  routeBtnText: { fontSize: 12, fontWeight: 'bold', color: colors.textSecondary },
  navInstruction: {
    backgroundColor: colors.primary, marginHorizontal: spacing.md,
    marginTop: spacing.sm, padding: spacing.md,
    borderRadius: radius.lg, ...shadows.md, alignItems: 'center',
  },
  navInstructionText: { color: '#fff', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  navEtaText: { color: '#dbeafe', fontSize: 14, marginTop: 4 },
  floatingActions: { position: 'absolute', right: spacing.md, bottom: 250, gap: spacing.md },
  floatingFab: {
    width: 50, height: 50, borderRadius: 25,
    justifyContent: 'center', alignItems: 'center',
    ...shadows.lg, borderWidth: 2, borderColor: '#fff',
  },

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


