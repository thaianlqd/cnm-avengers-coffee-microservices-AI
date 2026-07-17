import React, { useState, useEffect, useRef } from 'react'
import { View, StyleSheet, TouchableOpacity, Text, SafeAreaView, Linking, Platform, Alert, ScrollView } from 'react-native'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { colors, radius, spacing, shadows, typography } from '../theme'
import { useShipper } from '../context/ShipperContext'
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
  
  const isSimulatingRef = useRef(false)
  const simulationInterval = useRef(null)

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
        const resStore = await fetch(`http://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${storeLng},${storeLat}?alternatives=true&geometries=geojson&overview=full`);
        const dataStore = await resStore.json();
        if (dataStore.code === 'Ok' && dataStore.routes) {
          const parsedStore = dataStore.routes.map(r => ({
            distance: r.distance / 1000,
            duration: r.duration / 60,
            coordinates: r.geometry.coordinates.map(c => ({ latitude: c[1], longitude: c[0] }))
          }));
          setRoutesToStore(parsedStore);
        }
      } catch (err) {
        console.warn('OSRM error (store):', err);
      }

      // Fetch OSRM routes to Customer (Store -> Customer)
      try {
        const resCust = await fetch(`http://router.project-osrm.org/route/v1/driving/${storeLng},${storeLat};${destLng},${destLat}?alternatives=true&geometries=geojson&overview=full`);
        const dataCust = await resCust.json();
        if (dataCust.code === 'Ok' && dataCust.routes) {
          const parsedCust = dataCust.routes.map(r => ({
            distance: r.distance / 1000,
            duration: r.duration / 60,
            coordinates: r.geometry.coordinates.map(c => ({ latitude: c[1], longitude: c[0] }))
          }));
          setRoutesToCustomer(parsedCust);
          if (parsedCust.length > 0) setDistance(parsedCust[0].distance);
        }
      } catch (err) {
        console.warn('OSRM error (customer):', err);
      }

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 10 },
        (newLoc) => {
          if (isSimulatingRef.current) return; // Bỏ qua GPS thật nếu đang giả lập
          
          setLocation(newLoc)
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
    }
  }, [])

  const simulateMovement = (targetLat, targetLng) => {
    if (!shipper?.id || !location) return;
    
    isSimulatingRef.current = true;
    if (simulationInterval.current) clearInterval(simulationInterval.current);
    
    let pathCoords = [];
    if (targetLat === destLat && targetLng === destLng && routesToCustomer.length > 0) {
      // Đi tới khách -> dùng tuyến đường từ Shop tới Khách
      pathCoords = routesToCustomer[selectedRouteCustomerIndex].coordinates;
    } else if (targetLat === storeLat && targetLng === storeLng && routesToStore.length > 0) {
      // Đi tới shop -> dùng tuyến đường từ Vị trí tới Shop
      pathCoords = routesToStore[selectedRouteStoreIndex].coordinates;
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
    if (!shipper?.id || !delivery?.id) return;
    
    try {
      await apiClient.post(`/shippers/${shipper.id}/deliveries/${delivery.id}/complete`, {
        latitude: location?.coords?.latitude || destLat,
        longitude: location?.coords?.longitude || destLng,
      });
      
      Alert.alert('Thành công', 'Đã hoàn thành đơn hàng!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err) {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể hoàn thành đơn hàng.');
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
        <MapView style={styles.map} region={mapRegion} showsUserLocation={!isSimulatingRef.current} showsMyLocationButton>
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

          {isSimulatingRef.current && location && (
            <Marker coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }} title="Shipper giả lập">
              <View style={styles.markerShipper}>
                <Text style={{fontSize: 20}}>🛵</Text>
              </View>
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
                strokeColor={isSelected ? colors.primary : '#fdba74'} // Orange for customer
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
      <SafeAreaView style={styles.headerWrap}>
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
        
        {/* Nút giả lập demo - hiển thị trên cùng để dễ nhấn */}
        <View style={styles.demoControls}>
          <TouchableOpacity style={[styles.demoBtn, {backgroundColor: colors.primary}]} onPress={() => simulateMovement(storeLat, storeLng)}>
             <Text style={styles.demoBtnText}>Tới Shop</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.demoBtn, {backgroundColor: colors.danger}]} onPress={() => simulateMovement(destLat, destLng)}>
             <Text style={styles.demoBtnText}>Tới Khách</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.demoBtn, {backgroundColor: '#6b7280'}]} onPress={() => { isSimulatingRef.current = false; }}>
             <Text style={styles.demoBtnText}>Hủy giả lập</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.demoBtn, {backgroundColor: colors.success}]} onPress={handleCompleteDelivery}>
             <Text style={styles.demoBtnText}>Hoàn Thành</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

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
  routeBtnText: {
    fontSize: 12, fontWeight: 'bold', color: colors.textSecondary,
  },
})
