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
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const shipperMarkerRef = useRef(null);
  const storeMarkerRef = useRef(null);
  const destMarkerRef = useRef(null);
  const routeLineRef = useRef(null);
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

    // OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map);

    mapRef.current = map;

    // Cleanup
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [leafletLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Custom icons
  const getIcon = (type) => {
    const L = window._L || window.L;
    if (!L) return null;

    const iconHtml = {
      shipper: `<div style="
        width:40px;height:40px;border-radius:50%;
        background:linear-gradient(135deg,#4F46E5,#7C3AED);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:20px;
        box-shadow:0 4px 14px rgba(79,70,229,.45);
        border:3px solid white;
        animation: pulse-shipper 2s ease-in-out infinite;
      ">🛵</div>`,
      store: `<div style="
        width:36px;height:36px;border-radius:50%;
        background:linear-gradient(135deg,#059669,#10B981);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:18px;
        box-shadow:0 3px 10px rgba(5,150,105,.4);
        border:3px solid white;
      ">☕</div>`,
      destination: `<div style="
        width:36px;height:36px;border-radius:50%;
        background:linear-gradient(135deg,#DC2626,#EF4444);
        display:flex;align-items:center;justify-content:center;
        color:white;font-size:18px;
        box-shadow:0 3px 10px rgba(220,38,38,.4);
        border:3px solid white;
      ">📍</div>`,
    };

    return L.divIcon({
      html: iconHtml[type] || iconHtml.shipper,
      className: 'custom-map-marker',
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -24],
    });
  };

  // Update markers
  useEffect(() => {
    if (!mapRef.current || !leafletLoaded) return;
    const L = window._L || window.L;
    if (!L) return;
    const map = mapRef.current;

    // Store marker
    if (storeLocation?.latitude && storeLocation?.longitude) {
      if (storeMarkerRef.current) {
        storeMarkerRef.current.setLatLng([storeLocation.latitude, storeLocation.longitude]);
      } else {
        storeMarkerRef.current = L.marker(
          [storeLocation.latitude, storeLocation.longitude],
          { icon: getIcon('store') },
        )
          .addTo(map)
          .bindPopup(`<b>🏪 Cửa hàng</b><br/>${storeAddress}`);
      }
    }

    // Destination marker
    if (destinationLocation?.latitude && destinationLocation?.longitude) {
      if (destMarkerRef.current) {
        destMarkerRef.current.setLatLng([destinationLocation.latitude, destinationLocation.longitude]);
      } else {
        destMarkerRef.current = L.marker(
          [destinationLocation.latitude, destinationLocation.longitude],
          { icon: getIcon('destination') },
        )
          .addTo(map)
          .bindPopup('<b>📍 Điểm giao hàng</b>');
      }
    }

    // Shipper marker
    if (shipperLocation?.latitude && shipperLocation?.longitude) {
      if (shipperMarkerRef.current) {
        // Smooth move
        shipperMarkerRef.current.setLatLng([shipperLocation.latitude, shipperLocation.longitude]);
      } else {
        const statusText = 
          deliveryStatus === 'IN_TRANSIT' || deliveryStatus === 'DANG_GIAO' ? 'Đang giao hàng' :
          deliveryStatus === 'PICKING_UP' ? 'Đang lấy hàng' :
          deliveryStatus === 'CONFIRMED' ? 'Đã nhận đơn' :
          deliveryStatus === 'DELIVERED' || deliveryStatus === 'HOAN_THANH' ? 'Đã giao' :
          'Đang cập nhật...';

        shipperMarkerRef.current = L.marker(
          [shipperLocation.latitude, shipperLocation.longitude],
          { icon: getIcon('shipper') },
        )
          .addTo(map)
          .bindPopup(`<b>🛵 ${shipperName}</b><br/>${statusText}`);
      }

      // Center map trên shipper
      map.panTo([shipperLocation.latitude, shipperLocation.longitude], { animate: true, duration: 1 });
    }

    // Vẽ route line
    const fetchAndDrawRoute = async () => {
      const points = [];
      if (shipperLocation?.latitude) points.push(shipperLocation);
      if (storeLocation?.latitude && (!deliveryStatus || deliveryStatus === 'PICKING_UP' || deliveryStatus === 'CONFIRMED')) {
        points.push(storeLocation);
      }
      if (destinationLocation?.latitude && (deliveryStatus === 'IN_TRANSIT' || deliveryStatus === 'DANG_GIAO' || points.length < 2)) {
        points.push(destinationLocation);
      }

      if (routeLineRef.current) {
        map.removeLayer(routeLineRef.current);
      }

      if (points.length >= 2) {
        try {
          // OSRM requires longitude,latitude
          const coordsString = points.map(p => `${p.longitude},${p.latitude}`).join(';');
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsString}?alternatives=false&geometries=geojson&overview=full`);
          const data = await res.json();
          
          let routeCoords = [];
          if (data.routes && data.routes[0] && data.routes[0].geometry) {
            // OSRM returns [longitude, latitude], Leaflet needs [latitude, longitude]
            routeCoords = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
          } else {
            // Fallback to straight lines if OSRM fails
            routeCoords = points.map(p => [p.latitude, p.longitude]);
          }

          routeLineRef.current = L.polyline(routeCoords, {
            color: '#4F46E5',
            weight: 4,
            opacity: 0.8,
            lineJoin: 'round'
          }).addTo(map);

          // Fit bounds to show the whole route
          const bounds = L.latLngBounds(routeCoords);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        } catch (error) {
          console.error("Lỗi vẽ đường OSRM:", error);
          // Fallback to straight line
          const fallbackCoords = points.map(p => [p.latitude, p.longitude]);
          routeLineRef.current = L.polyline(fallbackCoords, {
            color: '#4F46E5',
            weight: 3,
            opacity: 0.7,
            dashArray: '8, 12',
          }).addTo(map);
          const bounds = L.latLngBounds(fallbackCoords);
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
      }
    };

    fetchAndDrawRoute();
  }, [shipperLocation, storeLocation, destinationLocation, leafletLoaded, shipperName, deliveryStatus]);

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-lg">
      {/* Map container */}
      <div
        ref={mapContainerRef}
        style={{ height, width: '100%', zIndex: 1 }}
      />

      {/* Overlay: Shipper info */}
      {shipperLocation?.latitude && (
        <div className="absolute top-3 left-3 z-[1000] bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2 shadow-lg border border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">🛵</span>
            <div>
              <p className="text-xs font-black text-gray-900">{shipperName}</p>
              <p className="text-[10px] font-bold text-indigo-600">
                {deliveryStatus === 'IN_TRANSIT' || deliveryStatus === 'DANG_GIAO' ? '📦 Đang giao hàng' :
                 deliveryStatus === 'PICKING_UP' ? '🏪 Đang lấy hàng' :
                 deliveryStatus === 'CONFIRMED' ? '✅ Đã nhận đơn' :
                 deliveryStatus === 'DELIVERED' || deliveryStatus === 'HOAN_THANH' ? '🎉 Đã giao' :
                 '🔄 Đang cập nhật...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 right-3 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow text-[10px] font-bold text-gray-600 space-y-0.5">
        <div className="flex items-center gap-1"><span>☕</span> Cửa hàng</div>
        <div className="flex items-center gap-1"><span>🛵</span> Shipper</div>
        <div className="flex items-center gap-1"><span>📍</span> Điểm giao</div>
      </div>

      {/* Loading state */}
      {!leafletLoaded && (
        <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs font-bold text-gray-500">Đang tải bản đồ...</p>
          </div>
        </div>
      )}

      {/* No shipper location */}
      {leafletLoaded && !shipperLocation?.latitude && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 shadow-sm">
          <p className="text-xs font-bold text-amber-700">⏳ Chưa có vị trí shipper. Đang chờ cập nhật...</p>
        </div>
      )}

      {/* Pulse animation style */}
      <style>{`
        @keyframes pulse-shipper {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
        .custom-map-marker {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-container {
          font-family: inherit;
        }
      `}</style>
    </div>
  );
}
