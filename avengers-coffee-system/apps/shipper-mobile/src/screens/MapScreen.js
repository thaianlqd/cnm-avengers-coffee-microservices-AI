import React, { useState, useEffect, useRef } from 'react'
import { View, StyleSheet, TouchableOpacity, Text, SafeAreaView, Linking, Platform, Alert, ScrollView, Modal, Image } from 'react-native'
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

const getBranchInfo = (code) => {
  switch (code) {
    case 'NVL_DN': return { address: 'Avengers Coffee - 200 Nguyễn Văn Linh, Đà Nẵng', storeLoc: { latitude: 16.0544, longitude: 108.2022 }, destLoc: { latitude: 16.0700, longitude: 108.2200 } };
    case 'HBT_HCM': return { address: 'Avengers Coffee - 15 Hai Bà Trưng, TP.HCM', storeLoc: { latitude: 10.7769, longitude: 106.7009 }, destLoc: { latitude: 10.7800, longitude: 106.7100 } };
    case 'PD_HN': return { address: 'Avengers Coffee - 10 Phạm Đình Hổ, Hà Nội', storeLoc: { latitude: 21.0285, longitude: 105.8542 }, destLoc: { latitude: 21.0350, longitude: 105.8600 } };
    case 'MAC_DINH_CHI': return { address: 'Avengers Coffee - 30 Mạc Đĩnh Chi, TP.HCM', storeLoc: { latitude: 10.7831, longitude: 106.6992 }, destLoc: { latitude: 10.7900, longitude: 106.7050 } };
    case 'HCM_DIEN_BIEN_PHU': return { address: 'Avengers Coffee - Điện Biên Phủ, TP.HCM', storeLoc: { latitude: 10.7930, longitude: 106.7000 }, destLoc: { latitude: 10.8000, longitude: 106.7100 } };
    default: return { address: `Avengers Coffee - ${code || 'Cửa hàng'}`, storeLoc: { latitude: 10.7769, longitude: 106.7009 }, destLoc: { latitude: 10.7800, longitude: 106.7100 } };
  }
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
  
  const [showPoDModal, setShowPoDModal] = useState(false);
  const [podImage, setPodImage] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSimulatingRef = useRef(false)
  const simulationInterval = useRef(null)
  
  const activeStepsRef = useRef([])
  const currentStepIndexRef = useRef(0)

  const branchCode = delivery?.order?.co_so_ma || delivery?.branch_code;
  const branchInfo = getBranchInfo(branchCode);
  const storeLat = branchInfo.storeLoc.latitude;
  const storeLng = branchInfo.storeLoc.longitude;

  const destLat = delivery?.delivery_latitude ? Number(delivery.delivery_latitude) : branchInfo.destLoc.latitude;
  const destLng = delivery?.delivery_longitude ? Number(delivery.delivery_longitude) : branchInfo.destLoc.longitude;

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

      // Fetch OSRM routes to Store (Shipper -> Store)
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

      // Fetch OSRM routes to Customer (Store -> Customer)
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
          if (isSimulatingRef.current) return; // Bỏ qua GPS thật nếu đang giả lập
          
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
    
    // Tìm step gần nhất kể từ step hiện tại trở đi
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

    // Nếu khoảng cách đến step tiếp theo rất gần (< 50m) thì tiến lên step tiếp theo
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
      // Đi tới khách -> dùng tuyến đường từ Shop tới Khách
      pathCoords = routesToCustomer[selectedRouteCustomerIndex].coordinates;
      activeStepsRef.current = routesToCustomer[selectedRouteCustomerIndex].steps;
      currentStepIndexRef.current = 0;
    } else if (targetLat === storeLat && targetLng === storeLng && routesToStore.length > 0) {
      // Đi tới shop -> dùng tuyến đường từ Vị trí tới Shop
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
      const progress = currentStep / steps; // 0 to 1
      
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

  const handleCompleteDelivery = () => {
    setShowPoDModal(true);
  };

  const handleSimulateCamera = () => {
    setPodImage('https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=500&q=80');
  };

  const submitCompleteDelivery = async () => {
    if (!shipper?.id || !delivery?.id) return;
    
    setIsSubmitting(true);
    try {
      await apiClient.post(`/shippers/${shipper.id}/deliveries/${delivery.id}/complete`, {
        latitude: location?.coords?.latitude || destLat,
        longitude: location?.coords?.longitude || destLng,
        proof_image_url: podImage
      });
      
      Alert.alert('Thành công', 'Đã hoàn thành đơn hàng!', [
        { text: 'OK', onPress: () => {
            setShowPoDModal(false);
            navigation.goBack();
          } 
        }
      ]);
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể hoàn thành đơn hàng.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const mapRegion = {
    latitude: location?.coords.latitude || storeLat,
    longitude: location?.coords.longitude || storeLng,
    latitudeDelta: 0.04,
    longitudeDelta: 0.04,
  }

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

          {/* Render Route to Store (Blue) */}
          {routesToStore.map((route, index) => {
            const isSelected = index === selectedRouteStoreIndex;
            return (
              <Polyline
                key={`store-route-${index}`}
                coordinates={route.coordinates}
                strokeColor={isSelected ? '#3b82f6' : '#93c5fd'} // Blue for store
                strokeWidth={isSelected ? 5 : 3}
                zIndex={isSelected ? 9 : 1}
                tappable={true}
                onPress={() => setSelectedRouteStoreIndex(index)}
              />
            );
          })}

          {/* Render Route to Customer (Orange) */}
          {routesToCustomer.map((route, index) => {
            const isSelected = index === selectedRouteCustomerIndex;
            return (
              <Polyline
                key={`cust-route-${index}`}
                coordinates={route.coordinates}
                strokeColor={isSelected ? '#3b82f6' : '#93c5fd'} // Blue for customer
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

          {/* Fallback Straight Line if OSRM not available */}
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

      {/* Header overlay */}
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

        {/* Turn-by-turn instruction */}
        {currentStepText ? (
          <View style={styles.navInstruction}>
            <Text style={styles.navInstructionText}>{currentStepText}</Text>
            {etaText ? <Text style={styles.navEtaText}>{etaText} • {distance?.toFixed(1)}km</Text> : null}
          </View>
        ) : null}
        
        {/* Nút giả lập demo - hiển thị trên cùng để dễ nhấn */}
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

      {/* Floating Actions on Map */}
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

      {/* Footer Panel */}
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
      {/* Modal Chụp Ảnh Minh Chứng (Proof of Delivery) */}
      <Modal visible={showPoDModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Chụp ảnh minh chứng</Text>
            <Text style={{ color: colors.textSecondary, marginBottom: 20, textAlign: 'center' }}>
              Vui lòng chụp ảnh gói hàng đã giao để hoàn thành đơn.
            </Text>
            
            {podImage ? (
              <Image source={{ uri: podImage }} style={styles.podPreviewImage} />
            ) : (
              <View style={styles.podPlaceholder}>
                <Ionicons name="camera-outline" size={48} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, marginTop: 10 }}>Chưa có ảnh</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cameraBtn} onPress={handleSimulateCamera}>
                <Ionicons name="camera" size={20} color="#fff" />
                <Text style={styles.cameraBtnText}>Chụp ảnh (Demo)</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.submitBtn, (!podImage || isSubmitting) && { opacity: 0.5 }]} 
                disabled={!podImage || isSubmitting}
                onPress={submitCompleteDelivery}
              >
                <Text style={styles.submitBtnText}>{isSubmitting ? 'Đang gửi...' : 'Xác nhận Giao Xong'}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => { setShowPoDModal(false); setPodImage(null); }}
              >
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  demoControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: spacing.md,
  },
  demoBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    ...shadows.sm,
  },
  demoBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  backBtn: { padding: spacing.sm },
  headerInfo: { alignItems: 'center' },
  headerTitle: { ...typography.bodyBold, color: colors.text },
  headerSub: { ...typography.caption, color: colors.primary },
  markerStore: {
    backgroundColor: colors.primary, padding: 8, borderRadius: 20,
    borderWidth: 2, borderColor: colors.surface, ...shadows.sm,
  },
  markerDest: {
    backgroundColor: colors.danger, padding: 6, borderRadius: 20,
    borderWidth: 2, borderColor: colors.surface, ...shadows.sm,
  },
  markerShipper: {
    backgroundColor: 'white',
    padding: 2,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#4F46E5',
    ...shadows.md,
  },
  footerPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xxl,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, ...shadows.lg,
  },
  etaRow: {
    flexDirection: 'row', backgroundColor: colors.bg, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md, alignItems: 'center',
  },
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
  fab: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, paddingVertical: spacing.md,
    borderRadius: radius.lg, gap: 8, ...shadows.sm,
  },
  fabText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  routeBtn: {
    paddingVertical: 6, paddingHorizontal: 12,
    borderRadius: 16, backgroundColor: colors.bg,
    borderWidth: 1, borderColor: colors.border,
  },
  routeBtnSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    backgroundColor: '#fff',
    width: '85%',
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center'
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: colors.text
  },
  podPlaceholder: {
    width: 200,
    height: 200,
    backgroundColor: '#f3f4f6',
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed'
  },
  podPreviewImage: {
    width: 200,
    height: 200,
    borderRadius: radius.md,
    marginBottom: 20,
    resizeMode: 'cover'
  },
  modalActions: {
    width: '100%',
    gap: 12
  },
  cameraBtn: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8
  },
  cameraBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16
  },
  submitBtn: {
    backgroundColor: colors.success,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: 'center'
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: 'center'
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '500'
  },
  routeBtnText: {
    fontSize: 12, fontWeight: 'bold', color: colors.textSecondary,
  },
  navInstruction: {
    backgroundColor: colors.primary,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    ...shadows.md,
    alignItems: 'center',
  },
  navInstructionText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  navEtaText: {
    color: '#dbeafe',
    fontSize: 14,
    marginTop: 4,
  },
  floatingActions: {
    position: 'absolute',
    right: spacing.md,
    bottom: 250, // above footer panel
    gap: spacing.md,
  },
  floatingFab: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.lg,
    borderWidth: 2,
    borderColor: '#fff',
  },
})

