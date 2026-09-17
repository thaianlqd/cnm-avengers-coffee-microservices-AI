import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { colors, radius, spacing, typography, shadows } from '../theme';
import { useShipper } from '../context/ShipperContext';
import apiClient from '../lib/apiClient';
import { formatBranchName, formatBranchFullTitle, formatBranchAddress, setGlobalBranchList } from '../lib/branchHelper';

const VIETMAP_API_KEY = process.env.EXPO_PUBLIC_VIETMAP_API_KEY || 'dbdd3165b3cb0d85239a7f59f410a9fa925974c4a6d4c54b';
const VIETMAP_TILE_KEY = process.env.EXPO_PUBLIC_VIETMAP_TILE_KEY || '63e6a5440de2164d709068a9c3f434c41e831b01fab07c4b';

export function MapScreen({ route, navigation }) {
  const { delivery } = route.params || {};
  const { shipper } = useShipper();
  
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const shipperMarkerRef = useRef(null);
  const movementIntervalRef = useRef(null);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  const { data: publicBranchPayload } = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      try {
        const response = await apiClient.get('/users/branches/public');
        const payload = response?.data || response || { items: [] };
        setGlobalBranchList(payload);
        return payload;
      } catch (error) {
        return { items: [] };
      }
    },
    staleTime: 10 * 60 * 1000,
  });

  const branchList = Array.isArray(publicBranchPayload?.items) 
    ? publicBranchPayload.items 
    : (Array.isArray(publicBranchPayload?.data) ? publicBranchPayload.data : (Array.isArray(publicBranchPayload) ? publicBranchPayload : []));

  const branchCode = delivery?.order?.co_so_ma || delivery?.branch_code || shipper?.branch_code;
  const branchName = (delivery?.store_name && !delivery.store_name.includes('_'))
    ? (delivery.store_name.toLowerCase().includes('avengers coffee') ? delivery.store_name : `Avengers Coffee - ${delivery.store_name}`)
    : formatBranchFullTitle(branchCode, publicBranchPayload);

  const branchAddress = (delivery?.store_address && !delivery.store_address.includes('_'))
    ? delivery.store_address
    : formatBranchAddress(branchCode, publicBranchPayload, delivery?.pickup_address);

  const storeLocation = {
    latitude: delivery?.tracking?.store_latitude 
      ? Number(delivery.tracking.store_latitude) 
      : (matchedBranch?.vi_do ? Number(matchedBranch.vi_do) : 10.80734),
    longitude: delivery?.tracking?.store_longitude 
      ? Number(delivery.tracking.store_longitude) 
      : (matchedBranch?.kinh_do ? Number(matchedBranch.kinh_do) : 106.717612),
  };
  const destinationLocation = {
    latitude: delivery?.tracking?.destination_latitude 
      ? Number(delivery.tracking.destination_latitude) 
      : (delivery?.delivery_latitude ? Number(delivery.delivery_latitude) : storeLocation.latitude + 0.006),
    longitude: delivery?.tracking?.destination_longitude 
      ? Number(delivery.tracking.destination_longitude) 
      : (delivery?.delivery_longitude ? Number(delivery.delivery_longitude) : storeLocation.longitude + 0.006),
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

      L.tileLayer(`https://maps.vietmap.vn/tm/{z}/{x}/{y}@2x.png?apikey=${VIETMAP_TILE_KEY}`, {
        maxZoom: 19,
        tileSize: 256,
        attribution: '© Vietmap'
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    const getIcon = (type) => {
      if (type === 'store') {
        const storeHtml = `
          <div style="position: relative; width: 40px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 8px rgba(5,150,105,0.4));">
              <defs>
                <linearGradient id="store-pin-grad-web" x1="4" y1="2" x2="36" y2="40" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#10B981"/>
                  <stop offset="0.55" stop-color="#059669"/>
                  <stop offset="1" stop-color="#047857"/>
                </linearGradient>
              </defs>
              <path d="M20 2C10.6 2 3 9.6 3 19C3 28.5 17.5 43.5 20 45.5C22.5 43.5 37 28.5 37 19C37 9.6 29.4 2 20 2Z" fill="url(#store-pin-grad-web)" stroke="#FFFFFF" stroke-width="2.5"/>
              <g transform="translate(10.5, 9)">
                <path d="M3 7.5H13C13 11.5 10.8 13.5 8 13.5C5.2 13.5 3 11.5 3 7.5Z" fill="#FFFFFF"/>
                <path d="M13 8.2H14.5C15.5 8.2 16.5 9 16.5 10C16.5 11 15.5 11.8 14.5 11.8H12.5" stroke="#FFFFFF" stroke-width="1.4" stroke-linecap="round"/>
                <path d="M2 15.5H15" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M5.5 2.5C5.5 3.5 4.8 4 4.8 5" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round"/>
                <path d="M8 1.5C8 2.8 7.3 3.5 7.3 4.5" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round"/>
                <path d="M10.5 2.5C10.5 3.5 9.8 4 9.8 5" stroke="#FFFFFF" stroke-width="1.3" stroke-linecap="round"/>
              </g>
            </svg>
          </div>
        `;
        return L.divIcon({
          html: storeHtml,
          className: 'custom-map-marker',
          iconSize: [40, 48],
          iconAnchor: [20, 46],
          popupAnchor: [0, -46],
        });
      }

      if (type === 'destination') {
        const destHtml = `
          <div style="position: relative; width: 40px; height: 48px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 4px 8px rgba(225,29,72,0.4));">
              <defs>
                <linearGradient id="dest-pin-grad-web" x1="4" y1="2" x2="36" y2="40" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#FB7185"/>
                  <stop offset="0.55" stop-color="#E11D48"/>
                  <stop offset="1" stop-color="#BE123C"/>
                </linearGradient>
              </defs>
              <path d="M20 2C10.6 2 3 9.6 3 19C3 28.5 17.5 43.5 20 45.5C22.5 43.5 37 28.5 37 19C37 9.6 29.4 2 20 2Z" fill="url(#dest-pin-grad-web)" stroke="#FFFFFF" stroke-width="2.5"/>
              <g transform="translate(11, 9)">
                <path d="M2.5 8.5L9 2.5L15.5 8.5V15.5C15.5 16.1 15 16.5 14.5 16.5H11V11.5H7V16.5H3.5C3 16.5 2.5 16.1 2.5 15.5V8.5Z" fill="#FFFFFF"/>
                <circle cx="9" cy="6.2" r="1.3" fill="#E11D48"/>
              </g>
            </svg>
          </div>
        `;
        return L.divIcon({
          html: destHtml,
          className: 'custom-map-marker',
          iconSize: [40, 48],
          iconAnchor: [20, 46],
          popupAnchor: [0, -46],
        });
      }

      // Shipper marker
      const shipperHtml = `
        <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <div style="position: absolute; top: 0; left: 0; width: 44px; height: 44px; border-radius: 50%; background: rgba(99,102,241,0.35); pointer-events: none;"></div>
          <div style="position: relative; width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%); border: 2.5px solid #FFFFFF; box-shadow: 0 4px 14px rgba(79,70,229,0.45); display: flex; align-items: center; justify-content: center;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="6" cy="17" r="3" stroke="#FFFFFF" stroke-width="2" fill="rgba(255,255,255,0.2)"/>
              <circle cx="6" cy="17" r="1.2" fill="#FFFFFF"/>
              <circle cx="18" cy="17" r="3" stroke="#FFFFFF" stroke-width="2" fill="rgba(255,255,255,0.2)"/>
              <circle cx="18" cy="17" r="1.2" fill="#FFFFFF"/>
              <path d="M6 17H9.5L13 10.5H16L18 14.5H20" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M18 17L16 7.5H13" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <rect x="2" y="7.5" width="5.5" height="5.5" rx="1.2" fill="#FFFFFF"/>
              <path d="M3.2 10.2H6.2" stroke="#4F46E5" stroke-width="1.2" stroke-linecap="round"/>
              <circle cx="15.5" cy="5.2" r="1.8" fill="#FFFFFF"/>
              <path d="M19.5 11.5L21.5 12" stroke="#FBBF24" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
        </div>
      `;
      return L.divIcon({
        html: shipperHtml,
        className: 'custom-map-marker',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -26],
      });
    };

    const storePopup = `
      <div style="font-family: inherit; min-width: 175px; padding: 2px 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
          <span style="display: inline-flex; width: 24px; height: 24px; border-radius: 7px; background: linear-gradient(135deg, #10B981, #059669); align-items: center; justify-content: center; color: white;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>
          </span>
          <span style="font-size: 13px; font-weight: 800; color: #111827;">Lấy hàng (${branchName})</span>
        </div>
        <p style="margin: 0; font-size: 11px; color: #4B5563; line-height: 1.45;">${branchAddress}</p>
      </div>
    `;

    const destPopup = `
      <div style="font-family: inherit; min-width: 175px; padding: 2px 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
          <span style="display: inline-flex; width: 24px; height: 24px; border-radius: 7px; background: linear-gradient(135deg, #FB7185, #E11D48); align-items: center; justify-content: center; color: white;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </span>
          <span style="font-size: 13px; font-weight: 800; color: #111827;">Điểm giao hàng</span>
        </div>
        <p style="margin: 0; font-size: 11px; color: #4B5563; line-height: 1.45;">Địa chỉ người nhận</p>
      </div>
    `;

    L.marker([storeLocation.latitude, storeLocation.longitude], { icon: getIcon('store') }).addTo(map).bindPopup(storePopup);
    L.marker([destinationLocation.latitude, destinationLocation.longitude], { icon: getIcon('destination') }).addTo(map).bindPopup(destPopup);
    
    if (!shipperMarkerRef.current) {
      const shipperPopup = `
        <div style="font-family: inherit; min-width: 170px; padding: 2px 0;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
            <span style="display: inline-flex; width: 24px; height: 24px; border-radius: 7px; background: linear-gradient(135deg, #6366F1, #4F46E5); align-items: center; justify-content: center; color: white;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
            </span>
            <span style="font-size: 13px; font-weight: 800; color: #111827;">Vị trí của bạn</span>
          </div>
          <p style="margin: 0; font-size: 11px; font-weight: 700; color: #4F46E5;">Đang hoạt động</p>
        </div>
      `;
      shipperMarkerRef.current = L.marker([shipperLocation.latitude, shipperLocation.longitude], { icon: getIcon('shipper') }).addTo(map).bindPopup(shipperPopup);
    }

    // Vẽ đường route từ Shop → Khách bằng Vietmap Route (xe máy)
    const drawRoute = async () => {
      try {
        const url = `https://maps.vietmap.vn/api/route?api-version=1.1&apikey=${VIETMAP_API_KEY}&point=${storeLocation.latitude},${storeLocation.longitude}&point=${destinationLocation.latitude},${destinationLocation.longitude}&vehicle=motorcycle&points_encoded=false`;
        const res = await fetch(url);
        const data = await res.json();
        const path = data.paths?.[0];
        if (path?.points?.coordinates) {
          const coords = path.points.coordinates.map(c => [c[1], c[0]]);
          // Đường nền mờ (border effect)
          L.polyline(coords, { color: '#1E40AF', weight: 8, opacity: 0.3 }).addTo(map);
          // Đường chính màu xanh dương
          L.polyline(coords, { color: '#2563EB', weight: 5, opacity: 0.95 }).addTo(map);
          // Hiển thị khoảng cách & thời gian
          const distKm = (path.distance / 1000).toFixed(1);
          const durationMin = Math.round(path.time / 60000);
          const midIdx = Math.floor(coords.length / 2);
          L.marker(coords[midIdx], {
            icon: L.divIcon({
              html: `<div style="background:rgba(37,99,235,0.95);color:white;padding:4px 10px;border-radius:12px;font-size:12px;font-weight:bold;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,0.25);">📏 ${distKm} km · ⏱ ${durationMin} phút</div>`,
              className: '',
              iconAnchor: [60, 12],
            })
          }).addTo(map);
        } else {
          throw new Error('Vietmap no route');
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
    
    const steps = 75; 
    const intervalMs = 200; // Trả lại tốc độ cũ (tổng 15s) để khớp với tốc độ polling 15s của khách hàng
    
    let currentStep = 0;
    const startLat = shipperLocation.latitude;
    const startLng = shipperLocation.longitude;

    movementIntervalRef.current = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      const newLat = startLat + (targetLat - startLat) * progress;
      const newLng = startLng + (targetLng - startLng) * progress;
      
      setShipperLocation({ latitude: newLat, longitude: newLng });
      
      // GỬI API UPDATE LÊN BACKEND NGAY BƯỚC 1 VÀ MỖI 5 BƯỚC (1 GIÂY) ĐỂ CLIENT NHẬN REALTIME
      if (currentStep === 1 || currentStep % 5 === 0 || currentStep === steps) {
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
          <Ionicons name="arrow-back" size={24} color={colors.text} />
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
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight || colors.border,
    ...shadows.sm,
    zIndex: 10,
  },
  backBtn: { padding: spacing.xs },
  headerTitle: { ...typography.h3, color: colors.text },
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
    backgroundColor: colors.primary,
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
