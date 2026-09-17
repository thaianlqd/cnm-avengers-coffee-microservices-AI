import { useEffect, useRef, useState } from 'react';

/**
 * ShipperMapView — Bản đồ Leaflet hiện vị trí shipper real-time.
 *
 * Features:
 * - Marker shipper (biểu tượng xe máy), cửa hàng (pickup), điểm giao (destination)
 * - Auto-center theo shipper khi di chuyển
 * - Smooth animation khi vị trí cập nhật
 * - Responsive, hoạt động với OpenStreetMap tiles (miễn phí)
 *
 * Props:
 * - shipperLocation: { latitude, longitude } | null
 * - storeLocation: { latitude, longitude } | null
 * - destinationLocation: { latitude, longitude } | null
 * - shipperName: string
 * - deliveryStatus: string
 * - height: CSS height string
 */
export default function ShipperMapView({
  shipperLocation = null,
  storeLocation = null,
  destinationLocation = null,
  shipperName = 'Shipper',
  deliveryStatus = '',
  storeAddress = 'Avengers Coffee',
  height = '400px',
  onRouteInfo = null,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const shipperMarkerRef = useRef(null);
  const storeMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const routeToStoreRef = useRef(null);
  const routeToCustomerRef = useRef(null);
  const nextManeuverRef = useRef(null);
  const hasFitBoundsRef = useRef(false);

  // Cached static routes
  const cachedRouteStore = useRef(null);
  const cachedRouteCustomer = useRef(null);
  const cachedStepsStore = useRef([]);
  const cachedStepsCustomer = useRef([]);

  const calcDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  // Dynamically import Leaflet (vì leaflet cần DOM)
  useEffect(() => {
    let cancelled = false;

    const loadLeaflet = async () => {
      try {
        // Import leaflet + CSS
        const L = await import('leaflet');
        await import('leaflet/dist/leaflet.css');

        if (!cancelled) {
          window._L = L.default || L;
          setLeafletLoaded(true);
        }
      } catch (err) {
        console.warn('Leaflet load failed, falling back to CDN:', err);
        // Fallback: load from CDN
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }
        if (!document.getElementById('leaflet-js')) {
          const script = document.createElement('script');
          script.id = 'leaflet-js';
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = () => {
            if (!cancelled) setLeafletLoaded(true);
          };
          document.head.appendChild(script);
        } else if (window.L) {
          window._L = window.L;
          if (!cancelled) setLeafletLoaded(true);
        }
      }
    };

    loadLeaflet();
    return () => { cancelled = true; };
  }, []);

  // Initialize map
  useEffect(() => {
    if (!leafletLoaded || !mapContainerRef.current || mapRef.current) return;

    const L = window._L || window.L;
    if (!L) return;

    // Default center: Đà Nẵng (vì bạn có cửa hàng ở ĐN)
    const defaultCenter = [16.0544, 108.2022];
    const center = storeLocation
      ? [storeLocation.latitude, storeLocation.longitude]
      : shipperLocation
      ? [shipperLocation.latitude, shipperLocation.longitude]
      : defaultCenter;

    const map = L.map(mapContainerRef.current, {
      center,
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
    });

    const VIETMAP_TILE_KEY = import.meta.env.VITE_VIETMAP_TILE_KEY || '63e6a5440de2164d709068a9c3f434c41e831b01fab07c4b';

    // Vietmap Tiles
    L.tileLayer(`https://maps.vietmap.vn/tm/{z}/{x}/{y}@2x.png?apikey=${VIETMAP_TILE_KEY}`, {
      maxZoom: 19,
      tileSize: 256,
      attribution: '© Vietmap',
    }).addTo(map);

    mapRef.current = map;


    // Cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        hasFitBoundsRef.current = false;
        routeToStoreRef.current = null;
        routeToCustomerRef.current = null;
        nextManeuverRef.current = null;
      }
    };
  }, [leafletLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Custom icons with high-end SVG designs
  const getIcon = (type) => {
    const L = window._L || window.L;
    if (!L) return null;

    if (type === 'store') {
      const storeHtml = `
        <div class="custom-marker-pin store-marker-pin">
          <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="store-pin-grad" x1="4" y1="2" x2="36" y2="40" gradientUnits="userSpaceOnUse">
                <stop stop-color="#10B981"/>
                <stop offset="0.55" stop-color="#059669"/>
                <stop offset="1" stop-color="#047857"/>
              </linearGradient>
            </defs>
            <path d="M20 2C10.6 2 3 9.6 3 19C3 28.5 17.5 43.5 20 45.5C22.5 43.5 37 28.5 37 19C37 9.6 29.4 2 20 2Z" fill="url(#store-pin-grad)" stroke="#FFFFFF" stroke-width="2.5"/>
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
        <div class="custom-marker-pin dest-marker-pin">
          <div class="dest-ground-pulse"></div>
          <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="dest-pin-grad" x1="4" y1="2" x2="36" y2="40" gradientUnits="userSpaceOnUse">
                <stop stop-color="#FB7185"/>
                <stop offset="0.55" stop-color="#E11D48"/>
                <stop offset="1" stop-color="#BE123C"/>
              </linearGradient>
            </defs>
            <path d="M20 2C10.6 2 3 9.6 3 19C3 28.5 17.5 43.5 20 45.5C22.5 43.5 37 28.5 37 19C37 9.6 29.4 2 20 2Z" fill="url(#dest-pin-grad)" stroke="#FFFFFF" stroke-width="2.5"/>
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

    // Default: Shipper Delivery Scooter
    const shipperHtml = `
      <div class="custom-marker-shipper">
        <div class="shipper-pulse-ring"></div>
        <div class="shipper-marker-badge">
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

  // Update markers
  useEffect(() => {
    if (!mapRef.current || !leafletLoaded) return;
    const L = window._L || window.L;
    if (!L) return;
    const map = mapRef.current;

    const storePopupHtml = `
      <div style="font-family: inherit; min-width: 175px; padding: 2px 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
          <span style="display: inline-flex; width: 24px; height: 24px; border-radius: 7px; background: linear-gradient(135deg, #10B981, #059669); align-items: center; justify-content: center; color: white; box-shadow: 0 2px 6px rgba(5,150,105,0.35);">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>
          </span>
          <span style="font-size: 13px; font-weight: 800; color: #111827;">Cửa Hàng Xuất Phát</span>
        </div>
        <p style="margin: 0; font-size: 11px; color: #4B5563; line-height: 1.45; font-weight: 500;">${storeAddress}</p>
      </div>
    `;

    const destPopupHtml = `
      <div style="font-family: inherit; min-width: 175px; padding: 2px 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
          <span style="display: inline-flex; width: 24px; height: 24px; border-radius: 7px; background: linear-gradient(135deg, #FB7185, #E11D48); align-items: center; justify-content: center; color: white; box-shadow: 0 2px 6px rgba(225,29,72,0.35);">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </span>
          <span style="font-size: 13px; font-weight: 800; color: #111827;">Điểm Nhận Hàng</span>
        </div>
        <p style="margin: 0; font-size: 11px; color: #4B5563; line-height: 1.45; font-weight: 500;">Địa chỉ giao hàng của quý khách</p>
      </div>
    `;

    const statusText = 
      deliveryStatus === 'IN_TRANSIT' || deliveryStatus === 'DANG_GIAO' ? 'Đang giao tận nơi' :
      deliveryStatus === 'PICKING_UP' ? 'Đang lấy hàng tại quán' :
      deliveryStatus === 'CONFIRMED' ? 'Đã tiếp nhận đơn hàng' :
      deliveryStatus === 'DELIVERED' || deliveryStatus === 'HOAN_THANH' ? 'Giao hàng thành công' :
      'Đang kết nối tài xế';

    const shipperPopupHtml = `
      <div style="font-family: inherit; min-width: 175px; padding: 2px 0;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
          <span style="display: inline-flex; width: 24px; height: 24px; border-radius: 7px; background: linear-gradient(135deg, #6366F1, #4F46E5); align-items: center; justify-content: center; color: white; box-shadow: 0 2px 6px rgba(79,70,229,0.35);">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>
          </span>
          <span style="font-size: 13px; font-weight: 800; color: #111827;">${shipperName}</span>
        </div>
        <p style="margin: 0; font-size: 11px; font-weight: 700; color: #4F46E5;">${statusText}</p>
      </div>
    `;

    // Store marker
    if (storeLocation?.latitude && storeLocation?.longitude) {
      if (storeMarkerRef.current) {
        storeMarkerRef.current.setLatLng([storeLocation.latitude, storeLocation.longitude]);
        storeMarkerRef.current.setIcon(getIcon('store'));
        storeMarkerRef.current.setPopupContent(storePopupHtml);
      } else {
        storeMarkerRef.current = L.marker(
          [storeLocation.latitude, storeLocation.longitude],
          { icon: getIcon('store') },
        )
          .addTo(map)
          .bindPopup(storePopupHtml);
      }
    }

    // Destination marker
    if (destinationLocation?.latitude && destinationLocation?.longitude) {
      if (destMarkerRef.current) {
        destMarkerRef.current.setLatLng([destinationLocation.latitude, destinationLocation.longitude]);
        destMarkerRef.current.setIcon(getIcon('destination'));
        destMarkerRef.current.setPopupContent(destPopupHtml);
      } else {
        destMarkerRef.current = L.marker(
          [destinationLocation.latitude, destinationLocation.longitude],
          { icon: getIcon('destination') },
        )
          .addTo(map)
          .bindPopup(destPopupHtml);
      }
    }

    // Shipper marker
    if (shipperLocation?.latitude && shipperLocation?.longitude) {
      if (shipperMarkerRef.current) {
        shipperMarkerRef.current.setLatLng([shipperLocation.latitude, shipperLocation.longitude]);
        shipperMarkerRef.current.setIcon(getIcon('shipper'));
        shipperMarkerRef.current.setPopupContent(shipperPopupHtml);
      } else {
        shipperMarkerRef.current = L.marker(
          [shipperLocation.latitude, shipperLocation.longitude],
          { icon: getIcon('shipper') },
        )
          .addTo(map)
          .bindPopup(shipperPopupHtml);
      }
    }

    // Vẽ route line
    const fetchAndDrawRoute = async () => {
      let totalDistance = 0;
      let totalDuration = 0;
      let allCoords = [];
      let activeSteps = [];

      try {
        const VIETMAP_API_KEY = import.meta.env.VITE_VIETMAP_API_KEY || 'dbdd3165b3cb0d85239a7f59f410a9fa925974c4a6d4c54b';

        // 1. Shipper -> Store (Lộ trình xe máy Vietmap)
        if (storeLocation?.latitude && shipperLocation?.latitude) {
          if (!cachedRouteStore.current) {
            const url1 = `https://maps.vietmap.vn/api/route?api-version=1.1&apikey=${VIETMAP_API_KEY}&point=${shipperLocation.latitude},${shipperLocation.longitude}&point=${storeLocation.latitude},${storeLocation.longitude}&vehicle=motorcycle&points_encoded=false`;
            const res1 = await fetch(url1);
            const data1 = await res1.json();
            const path1 = data1.paths?.[0];
            if (path1?.points?.coordinates) {
              cachedRouteStore.current = path1.points.coordinates.map((c) => [c[1], c[0]]);
              cachedStepsStore.current = (path1.instructions || []).map((ins) => ({
                maneuver: {
                  location: path1.points.coordinates[ins.interval?.[0] || 0],
                  instruction: ins.text,
                },
                name: ins.street_name,
              }));
              totalDistance += path1.distance;
              totalDuration += path1.time / 1000;
            }
          }

          if (cachedRouteStore.current) {
            const blueStyle = { 
              color: '#2563EB', 
              weight: 5,
              opacity: 0.95,
              lineJoin: 'round',
              lineCap: 'round',
            };
            
            if (routeToStoreRef.current) {
              routeToStoreRef.current.setLatLngs(cachedRouteStore.current);
              routeToStoreRef.current.setStyle(blueStyle);
            } else {
              routeToStoreRef.current = L.polyline(cachedRouteStore.current, blueStyle).addTo(map);
            }
            allCoords.push(...cachedRouteStore.current);

            if (deliveryStatus === 'PICKING_UP' || deliveryStatus === 'CONFIRMED') {
              activeSteps = cachedStepsStore.current;
            }
          }
        }
        
        // 2. Store -> Customer (Lộ trình xe máy Vietmap)
        if (storeLocation?.latitude && destinationLocation?.latitude) {
          if (!cachedRouteCustomer.current) {
            const url2 = `https://maps.vietmap.vn/api/route?api-version=1.1&apikey=${VIETMAP_API_KEY}&point=${storeLocation.latitude},${storeLocation.longitude}&point=${destinationLocation.latitude},${destinationLocation.longitude}&vehicle=motorcycle&points_encoded=false`;
            const res2 = await fetch(url2);
            const data2 = await res2.json();
            const path2 = data2.paths?.[0];
            if (path2?.points?.coordinates) {
              cachedRouteCustomer.current = path2.points.coordinates.map((c) => [c[1], c[0]]);
              cachedStepsCustomer.current = (path2.instructions || []).map((ins) => ({
                maneuver: {
                  location: path2.points.coordinates[ins.interval?.[0] || 0],
                  instruction: ins.text,
                },
                name: ins.street_name,
              }));
              totalDistance += path2.distance;
              totalDuration += path2.time / 1000;
            }
          }

          if (cachedRouteCustomer.current) {
            const customerRouteStyle = {
              color: '#2563EB',
              weight: 5,
              opacity: 0.95,
              lineJoin: 'round',
              lineCap: 'round',
            };

            if (routeToCustomerRef.current) {
              routeToCustomerRef.current.setLatLngs(cachedRouteCustomer.current);
              routeToCustomerRef.current.setStyle(customerRouteStyle);
            } else {
              routeToCustomerRef.current = L.polyline(cachedRouteCustomer.current, customerRouteStyle).addTo(map);
            }
            
            allCoords.push(...cachedRouteCustomer.current);
            
            const isDelivering = deliveryStatus === 'IN_TRANSIT' || deliveryStatus === 'DANG_GIAO';
            if (isDelivering) {
              activeSteps = cachedStepsCustomer.current;
            }
          }
        }

        if (onRouteInfo && totalDistance > 0) {
          onRouteInfo({ distance: totalDistance / 1000, duration: totalDuration / 60 });
        }

        // Draw Next Maneuver Guide Point
        if (activeSteps.length > 0 && shipperLocation?.latitude) {
          let minD = Infinity;
          let closestIdx = 0;
          for (let i = 0; i < activeSteps.length; i++) {
            const step = activeSteps[i];
            if (step.maneuver && step.maneuver.location) {
              const d = calcDistance(shipperLocation.latitude, shipperLocation.longitude, step.maneuver.location[1], step.maneuver.location[0]);
              if (d < minD) {
                minD = d;
                closestIdx = i;
              }
            }
          }
          if (minD < 0.05 && closestIdx + 1 < activeSteps.length) {
            closestIdx++;
          }
          const nextStep = activeSteps[closestIdx];
          if (nextStep?.maneuver?.location) {
            const latlng = [nextStep.maneuver.location[1], nextStep.maneuver.location[0]];
            if (nextManeuverRef.current) {
              nextManeuverRef.current.setLatLng(latlng);
            } else {
              nextManeuverRef.current = L.circleMarker(latlng, {
                color: '#FFFFFF',
                weight: 2.5,
                fillColor: '#2563EB',
                fillOpacity: 1,
                radius: 7,
              }).addTo(map);
            }
          }
        } else if (nextManeuverRef.current) {
          nextManeuverRef.current.remove();
          nextManeuverRef.current = null;
        }

        if (!hasFitBoundsRef.current && allCoords.length > 0) {
          const bounds = L.latLngBounds(allCoords);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
          hasFitBoundsRef.current = true;
        }

      } catch (error) {
        console.error("Route calculation error:", error);
      }
    };

    fetchAndDrawRoute();
  }, [shipperLocation, storeLocation, destinationLocation, leafletLoaded, shipperName, deliveryStatus, storeAddress]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-200/80 shadow-lg">
      {/* Map container */}
      <div
        ref={mapContainerRef}
        style={{ height, width: '100%', zIndex: 1 }}
      />

      {/* Overlay: Shipper info card */}
      {shipperLocation?.latitude && (
        <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-md rounded-2xl p-2.5 shadow-lg border border-gray-100/90 flex items-center gap-2.5 transition-all">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center shadow-md shadow-indigo-200 shrink-0">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="6" cy="17" r="3" stroke="currentColor" strokeWidth="1.8" fill="rgba(255,255,255,0.15)"/>
              <circle cx="6" cy="17" r="1.2" fill="currentColor"/>
              <circle cx="18" cy="17" r="3" stroke="currentColor" strokeWidth="1.8" fill="rgba(255,255,255,0.15)"/>
              <circle cx="18" cy="17" r="1.2" fill="currentColor"/>
              <path d="M6 17H9.5L13 10.5H16L18 14.5H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M18 17L16 7.5H13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="2" y="7.5" width="5.5" height="5.5" rx="1.2" fill="currentColor"/>
              <path d="M3.2 10.2H6.2" stroke="#4F46E5" strokeWidth="1" strokeLinecap="round"/>
              <circle cx="15.5" cy="5.2" r="1.8" fill="currentColor"/>
            </svg>
          </div>
          <div className="pr-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-black text-gray-900 tracking-tight">{shipperName}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[11px] font-bold text-indigo-600 flex items-center gap-1">
              {deliveryStatus === 'IN_TRANSIT' || deliveryStatus === 'DANG_GIAO' ? 'Đang giao tận nơi' :
               deliveryStatus === 'PICKING_UP' ? 'Đang lấy hàng tại quán' :
               deliveryStatus === 'CONFIRMED' ? 'Đã tiếp nhận đơn hàng' :
               deliveryStatus === 'DELIVERED' || deliveryStatus === 'HOAN_THANH' ? 'Giao hàng thành công' :
               'Đang kết nối tài xế'}
            </p>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-white/95 backdrop-blur-md rounded-xl p-2.5 shadow-md border border-gray-100 text-[11px] font-bold text-gray-700 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center shadow-xs">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 9H16C16 13.5 13.5 15.5 10 15.5C6.5 15.5 4 13.5 4 9Z" fill="currentColor"/>
              <path d="M16 10H17.5C18.5 10 19.5 10.8 19.5 12C19.5 13.2 18.5 14 17.5 14H16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M3 18H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </span>
          <span>Cửa hàng</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 text-white flex items-center justify-center shadow-xs">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="6" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
              <circle cx="18" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M6 17H9.5L13 11H16L18 15H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </span>
          <span>Tài xế giao hàng</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-gradient-to-tr from-rose-600 to-red-500 text-white flex items-center justify-center shadow-xs">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 10L12 3L21 10V19.5C21 20.3 20.3 21 19.5 21H15V15H9V21H4.5C3.7 21 3 20.3 3 19.5V10Z" fill="currentColor"/>
            </svg>
          </span>
          <span>Điểm nhận hàng</span>
        </div>
      </div>

      {/* Loading state */}
      {!leafletLoaded && (
        <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs font-bold text-gray-600">Đang tải bản đồ...</p>
          </div>
        </div>
      )}

      {/* No shipper location */}
      {leafletLoaded && !shipperLocation?.latitude && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-50/95 backdrop-blur-sm border border-amber-200 rounded-xl px-4 py-2 shadow-sm">
          <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Chưa có vị trí tài xế. Đang chờ kết nối...
          </p>
        </div>
      )}

      {/* Pulse and Marker Styles */}
      <style>{`
        .custom-map-marker {
          background: transparent !important;
          border: none !important;
          overflow: visible !important;
        }
        .custom-marker-shipper {
          position: relative;
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .shipper-pulse-ring {
          position: absolute;
          top: 0;
          left: 0;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          background: rgba(99, 102, 241, 0.35);
          animation: pulse-shipper-radar 2.2s cubic-bezier(0.2, 0.6, 0.35, 1) infinite;
          pointer-events: none;
        }
        @keyframes pulse-shipper-radar {
          0% { transform: scale(0.8); opacity: 0.9; }
          70% { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .shipper-marker-badge {
          position: relative;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366F1 0%, #4F46E5 50%, #4338CA 100%);
          border: 2.5px solid #FFFFFF;
          box-shadow: 0 4px 14px rgba(79, 70, 229, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .shipper-marker-badge:hover {
          transform: scale(1.12);
        }

        .custom-marker-pin {
          position: relative;
          width: 40px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .custom-marker-pin:hover {
          transform: translateY(-3px) scale(1.08);
        }
        .store-marker-pin svg {
          filter: drop-shadow(0 4px 8px rgba(5, 150, 105, 0.4));
        }
        .dest-marker-pin svg {
          filter: drop-shadow(0 4px 8px rgba(225, 29, 72, 0.4));
        }

        .dest-ground-pulse {
          position: absolute;
          bottom: 0px;
          left: 50%;
          transform: translateX(-50%);
          width: 24px;
          height: 10px;
          border-radius: 50%;
          border: 2px solid #E11D48;
          background: rgba(225, 29, 72, 0.2);
          animation: dest-ground-pulse-anim 2s ease-out infinite;
          pointer-events: none;
        }
        @keyframes dest-ground-pulse-anim {
          0% { transform: translateX(-50%) scale(0.6); opacity: 1; }
          100% { transform: translateX(-50%) scale(1.8); opacity: 0; }
        }
        .leaflet-container {
          font-family: inherit;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 16px !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
          padding: 4px !important;
          border: 1px solid rgba(229, 231, 235, 0.8) !important;
        }
        .leaflet-popup-content {
          margin: 10px 14px !important;
          line-height: 1.4 !important;
        }
        .leaflet-popup-tip {
          box-shadow: 0 4px 10px rgba(0,0,0,0.1) !important;
        }
      `}</style>
    </div>
  );
}
