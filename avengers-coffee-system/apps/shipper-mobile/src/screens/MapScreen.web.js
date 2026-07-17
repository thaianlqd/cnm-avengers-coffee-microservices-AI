import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, shadows } from '../theme';
import { useShipper } from '../context/ShipperContext';
import apiClient from '../lib/apiClient';

const getBranchInfo = (code) => {
  switch (code) {
    case 'NVL_DN': 
      return { address: 'Avengers Coffee - 200 Nguyễn Văn Linh, Đà Nẵng', storeLoc: { latitude: 16.0544, longitude: 108.2022 }, destLoc: { latitude: 16.0700, longitude: 108.2200 } };
    case 'HBT_HCM': 
      return { address: 'Avengers Coffee - 15 Hai Bà Trưng, TP.HCM', storeLoc: { latitude: 10.7769, longitude: 106.7009 }, destLoc: { latitude: 10.7800, longitude: 106.7100 } };
    case 'PD_HN': 
      return { address: 'Avengers Coffee - 10 Phạm Đình Hổ, Hà Nội', storeLoc: { latitude: 21.0285, longitude: 105.8542 }, destLoc: { latitude: 21.0350, longitude: 105.8600 } };
    case 'MAC_DINH_CHI': 
      return { address: 'Avengers Coffee - 30 Mạc Đĩnh Chi, TP.HCM', storeLoc: { latitude: 10.7831, longitude: 106.6992 }, destLoc: { latitude: 10.7900, longitude: 106.7050 } };
    case 'HCM_DIEN_BIEN_PHU': 
      return { address: 'Avengers Coffee - Điện Biên Phủ, TP.HCM', storeLoc: { latitude: 10.7930, longitude: 106.7000 }, destLoc: { latitude: 10.8000, longitude: 106.7100 } };
    default: 
      return { address: `Avengers Coffee - ${code || 'Cửa hàng'}`, storeLoc: { latitude: 10.7769, longitude: 106.7009 }, destLoc: { latitude: 10.7800, longitude: 106.7100 } };
  }
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
  
  const storeLocation = branchInfo.storeLoc;
  const destinationLocation = branchInfo.destLoc;
  
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
