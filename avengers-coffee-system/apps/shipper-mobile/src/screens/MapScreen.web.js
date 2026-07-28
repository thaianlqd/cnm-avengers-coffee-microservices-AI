import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadows } from '../theme';
import { useShipper } from '../context/ShipperContext';
import apiClient from '../lib/apiClient';

const getBranchInfo = (code) => {
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
  const normalized = (code || '').toUpperCase().replace(/-/g, '_');
  const branch = branches[code] || branches[normalized];
  if (branch) {
    return {
      address: branch.address,
      storeLoc: branch.storeLoc,
      destLoc: { latitude: branch.storeLoc.latitude + 0.003, longitude: branch.storeLoc.longitude + 0.003 },
    };
  }
  return {
    address: `Avengers Coffee - ${code || 'Cửa hàng'}`,
    storeLoc: { latitude: 10.7836, longitude: 106.6896 },
    destLoc: { latitude: 10.7866, longitude: 106.6926 },
  };
};

export function MapScreen({ route, navigation }) {
  const { delivery } = route.params || {};
  const { shipper } = useShipper();
  
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const shipperMarkerRef = useRef(null);
  const movementIntervalRef = useRef(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  const branchCode = delivery?.order?.co_so_ma || delivery?.branch_code;
  const branchInfo = getBranchInfo(branchCode);
  
  const storeLocation = {
    latitude: delivery?.tracking?.store_latitude ? Number(delivery.tracking.store_latitude) : branchInfo.storeLoc.latitude,
    longitude: delivery?.tracking?.store_longitude ? Number(delivery.tracking.store_longitude) : branchInfo.storeLoc.longitude
  };
  const destinationLocation = {
    latitude: delivery?.tracking?.destination_latitude ? Number(delivery.tracking.destination_latitude) : (delivery?.delivery_latitude ? Number(delivery.delivery_latitude) : branchInfo.destLoc.latitude),
    longitude: delivery?.tracking?.destination_longitude ? Number(delivery.tracking.destination_longitude) : (delivery?.delivery_longitude ? Number(delivery.delivery_longitude) : branchInfo.destLoc.longitude)
  };
  
  const [shipperLocation, setShipperLocation] = useState({
    latitude: storeLocation.latitude + (destinationLocation.latitude - storeLocation.latitude) * 0.3,
    longitude: storeLocation.longitude + (destinationLocation.longitude - storeLocation.longitude) * 0.3,
  });

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    if (!window.document.getElementById('leaflet-css')) {
      const link = window.document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      window.document.head.appendChild(link);
    }
    if (!window.document.getElementById('leaflet-js')) {
      const script = window.document.createElement('script');
      script.id = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        window._L = window.L;
        setLeafletLoaded(true);
      };
      window.document.body.appendChild(script);
    } else if (window.L) {
      window._L = window.L;
      setLeafletLoaded(true);
    }

    return () => {
      if (movementIntervalRef.current) clearInterval(movementIntervalRef.current);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || !leafletLoaded) return;
    const L = window._L;
    if (!L) return;

    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([storeLocation.latitude, storeLocation.longitude], 14);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    const getIcon = (type) => {
      const iconHtml = {
        shipper: `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#4F46E5,#7C3AED);display:flex;align-items:center;justify-content:center;color:white;font-size:20px;box-shadow:0 4px 14px rgba(79,70,229,.45);border:3px solid white;animation: pulse-shipper 2s ease-in-out infinite;">🛵</div>`,
        store: `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#059669,#10B981);display:flex;align-items:center;justify-content:center;color:white;font-size:18px;box-shadow:0 3px 10px rgba(5,150,105,.4);border:3px solid white;">🏪</div>`,
        destination: `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#DC2626,#EF4444);display:flex;align-items:center;justify-content:center;color:white;font-size:18px;box-shadow:0 3px 10px rgba(220,38,38,.4);border:3px solid white;">📍</div>`,
      };
      return L.divIcon({
        html: iconHtml[type],
        className: 'custom-map-marker',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -24],
      });
    };

    L.marker([storeLocation.latitude, storeLocation.longitude], { icon: getIcon('store') }).addTo(map).bindPopup(`<b>🏪 Lấy hàng</b><br/>${branchInfo.address}`);
    L.marker([destinationLocation.latitude, destinationLocation.longitude], { icon: getIcon('destination') }).addTo(map).bindPopup('<b>📍 Giao hàng</b>');
    
    if (!shipperMarkerRef.current) {
      shipperMarkerRef.current = L.marker([shipperLocation.latitude, shipperLocation.longitude], { icon: getIcon('shipper') }).addTo(map).bindPopup('<b>🛵 Vị trí của bạn</b>');
    }

    // Vẽ đường route từ Shop → Khách bằng OSRM (fallback đường thẳng)
    const drawRoute = async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${storeLocation.longitude},${storeLocation.latitude};${destinationLocation.longitude},${destinationLocation.latitude}?geometries=geojson&overview=full`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
          const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
          // Đường nền mờ (border effect)
          L.polyline(coords, { color: '#1E40AF', weight: 8, opacity: 0.3 }).addTo(map);
          // Đường chính màu xanh dương gradient
          L.polyline(coords, { color: '#3B82F6', weight: 5, opacity: 0.9, dashArray: null }).addTo(map);
          // Hiển thị khoảng cách
          const distKm = (data.routes[0].distance / 1000).toFixed(1);
          const durationMin = Math.round(data.routes[0].duration / 60);
          const midIdx = Math.floor(coords.length / 2);
          L.marker(coords[midIdx], {
            icon: L.divIcon({
              html: `<div style="background:rgba(59,130,246,0.9);color:white;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:bold;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.3);">📏 ${distKm} km · ⏱ ${durationMin} phút</div>`,
              className: '',
              iconAnchor: [60, 12],
            })
          }).addTo(map);
        } else {
          throw new Error('OSRM no route');
        }
      } catch (e) {
        // Fallback: vẽ đường thẳng nét đứt
        L.polyline(
          [[storeLocation.latitude, storeLocation.longitude], [destinationLocation.latitude, destinationLocation.longitude]],
          { color: '#3B82F6', weight: 4, opacity: 0.7, dashArray: '10, 8' }
        ).addTo(map);
      }
    };
    drawRoute();

    const bounds = L.latLngBounds([
      [storeLocation.latitude, storeLocation.longitude],
      [destinationLocation.latitude, destinationLocation.longitude],
      [shipperLocation.latitude, shipperLocation.longitude]
    ]);
    map.fitBounds(bounds, { padding: [50, 50] });

  }, [leafletLoaded, storeLocation, destinationLocation]); // Only run once on mount

  // Update shipper marker smoothly when shipperLocation state changes
  useEffect(() => {
    if (shipperMarkerRef.current) {
      shipperMarkerRef.current.setLatLng([shipperLocation.latitude, shipperLocation.longitude]);
      
      // Optionally pan map to follow shipper
      if (mapRef.current) {
        mapRef.current.panTo([shipperLocation.latitude, shipperLocation.longitude], { animate: true });
      }
    }
  }, [shipperLocation]);

  const simulateMovement = (targetLat, targetLng) => {
    if (!shipper?.id) return;
    if (movementIntervalRef.current) clearInterval(movementIntervalRef.current);
    
    const steps = 40; 
    const intervalMs = 200; 
    
    let currentStep = 0;
    const startLat = shipperLocation.latitude;
    const startLng = shipperLocation.longitude;

    movementIntervalRef.current = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      const newLat = startLat + (targetLat - startLat) * progress;
      const newLng = startLng + (targetLng - startLng) * progress;
      
      setShipperLocation({ latitude: newLat, longitude: newLng });
      
      // CHỈ GỬI API UPDATE LÊN BACKEND MỖI 10 BƯỚC (2 GIÂY) ĐỂ TRÁNH QUÁ TẢI SERVER
      if (currentStep % 10 === 0 || currentStep === steps) {
        apiClient.patch(`/shippers/${shipper.id}/location`, {
          latitude: newLat,
          longitude: newLng,
        }).catch((err) => console.log('Location update error:', err?.message))
      }

      if (currentStep >= steps) {
        clearInterval(movementIntervalRef.current);
        movementIntervalRef.current = null;
      }
    }, intervalMs);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bản đồ tuyến đường</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        {Platform.OS === 'web' ? (
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%', zIndex: 1 }} />
        ) : (
          <Text>Chỉ hỗ trợ Web trong preview này</Text>
        )}
        
        {Platform.OS === 'web' && (
          <View style={styles.demoPanel}>
             <TouchableOpacity style={styles.demoBtn} onPress={() => simulateMovement(storeLocation.latitude, storeLocation.longitude)}>
               <Ionicons name="storefront" size={20} color="#fff" style={{marginRight: 8}} />
               <Text style={styles.demoBtnText}>Giả lập chạy tới Shop</Text>
             </TouchableOpacity>
             <TouchableOpacity style={[styles.demoBtn, {backgroundColor: colors.danger}]} onPress={() => simulateMovement(destinationLocation.latitude, destinationLocation.longitude)}>
               <Ionicons name="person" size={20} color="#fff" style={{marginRight: 8}} />
               <Text style={styles.demoBtnText}>Giả lập chạy tới Khách</Text>
             </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.default },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border.light,
    ...shadows.sm,
    zIndex: 10,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { ...typography.h3, color: colors.text.primary },
  content: {
    flex: 1,
    backgroundColor: '#eee',
    position: 'relative'
  },
  demoPanel: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    zIndex: 100,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10
  },
  demoBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.primary.main || '#059669',
    padding: 12,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.md,
  },
  demoBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  }
});
