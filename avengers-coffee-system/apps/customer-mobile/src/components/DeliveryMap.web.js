import { installDetailedBasemap } from '../../../web-customer/src/components/mapBasemap'
import '../../../web-customer/src/components/features_thaian/DeliveryJourney.css'
import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import L from 'leaflet'
import './leaflet.web.css'
import { coordinate } from '../lib/trackingSession'
import useDeliveryRoute from '../hooks/useDeliveryRoute'
import JourneyOverlay from '../../../shared-ui/JourneyOverlay'
import { journeyProgress, measuredRouteSummary, mapPinHtml } from '../../../web-customer/src/components/deliveryMapPresentation'
import { colors } from '../theme'
function pin(kind) {
  return L.divIcon({ className: '', html: mapPinHtml(kind), iconSize: [44,54], iconAnchor: [22,52] })
}
export default function DeliveryMap({ delivery }) {
  const container = useRef(null), map = useRef(null), markers = useRef({}), line = useRef(null), fitted = useRef(false), animation = useRef(null), follow = useRef(true)
  const [failed, setFailed] = useState(false), [loaded, setLoaded] = useState(false)
  const route = useDeliveryRoute(delivery)
  const driver = coordinate(delivery?.shipper_location), store = coordinate(delivery?.tracking?.store_location), destination = coordinate(delivery?.tracking?.destination_location)
  const first = driver || store || destination, points = [store,destination,driver].filter(Boolean)
  const fit = () => { if (map.current && points.length) map.current.fitBounds(L.latLngBounds(points.map(p => [p.latitude,p.longitude])), { paddingTopLeft: [70,60], paddingBottomRight: [70,55], maxZoom: 17 }) }
  useEffect(() => {
    if (!container.current || !first || map.current) return
    const instance = L.map(container.current, { zoomControl: false, scrollWheelZoom: false }).setView([first.latitude,first.longitude],15)
    map.current = instance
    const key = process.env.EXPO_PUBLIC_VIETMAP_TILE_KEY
    const disposeBasemap = installDetailedBasemap(L,instance,{tileKey:key,onLoaded:()=>{setLoaded(true);setFailed(false)},onError:()=>setFailed(true)})
    L.control.zoom({ position:'bottomright' }).addTo(instance)
    instance.on('dragstart', () => { follow.current = false })
    const observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(container.current)
    return () => { disposeBasemap(); observer.disconnect(); cancelAnimationFrame(animation.current); instance.remove(); map.current = null; markers.current = {}; line.current = null; fitted.current = false }
  }, [Boolean(first)])
  useEffect(() => {
    if (!map.current) return
    Object.entries({ store,destination,driver }).forEach(([kind,p]) => {
      let marker = markers.current[kind]
      if (!p) { if (marker) { marker.remove(); delete markers.current[kind] } return }
      const target = L.latLng(p.latitude,p.longitude)
      if (!marker) { marker = L.marker(target,{ icon: pin(kind) }).addTo(map.current); const label = document.createElement('span'); label.textContent = kind === 'store' ? 'Cửa hàng' : kind === 'driver' ? delivery?.shipper?.full_name || 'Tài xế' : 'Điểm giao'; marker.bindTooltip(label, { permanent:kind !== 'driver', direction:'top', offset:[0,-47], className:'journey-marker-label' }); markers.current[kind] = marker }
      else if (kind !== 'driver') marker.setLatLng(target)
      else { cancelAnimationFrame(animation.current); const from = marker.getLatLng(), started = performance.now(); const move = now => { if (!map.current) return; const t = Math.min((now-started)/900,1); marker.setLatLng([from.lat+(target.lat-from.lat)*t,from.lng+(target.lng-from.lng)*t]); if (t < 1) animation.current = requestAnimationFrame(move) }; animation.current = requestAnimationFrame(move) }
    })
    if (!fitted.current && points.length) { fit(); fitted.current = true }
    else if (follow.current && driver) map.current.panTo([driver.latitude,driver.longitude], { animate: true })
  }, [driver?.latitude,driver?.longitude,store?.latitude,store?.longitude,destination?.latitude,destination?.longitude])
  useEffect(() => { if (!map.current) return; line.current?.remove(); line.current = route.data ? L.polyline(route.data.coordinates.map(p => [p.latitude,p.longitude]), { color: '#507fe5', weight: 5, opacity: .9 }).addTo(map.current) : null }, [route.data,Boolean(first)])
  if (!first) return <View style={{ padding: 24, backgroundColor: '#f5f5f5', borderRadius: 12 }}><Text style={{ color: colors.muted, lineHeight: 22 }}>Bản đồ sẽ hiển thị khi hệ thống có vị trí cửa hàng hoặc tài xế.</Text></View>
  return <View style={{ gap: 8 }}><View style={{ height: 380, borderRadius: 22, overflow: 'hidden', position: 'relative', zIndex: 0, backgroundColor: '#f3f1e8' }}>
    <div ref={container} aria-label="Bản đồ hành trình đơn hàng" style={{ width: '100%', height: '100%' }} />
    <Pressable onPress={() => { follow.current = true; fit() }} accessibilityLabel="Đưa bản đồ về hành trình đơn hàng" style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, padding: 12, borderRadius: 22, backgroundColor: '#fff' }}><Text style={{ color: colors.primary, fontSize: 12 }}>Định tâm</Text></Pressable>
  </View><JourneyOverlay floating={false} progress={journeyProgress(delivery?.shipper_delivery?.status || delivery?.order?.trang_thai_don_hang, Boolean(driver))} metrics={measuredRouteSummary(route.data)} notice={failed ? 'Chưa tải được nền bản đồ. Kiểm tra kết nối mạng.' : !loaded ? 'Đang tải bản đồ…' : route.isError ? 'Chưa tải được tuyến đường. Kéo xuống để thử lại.' : !driver ? 'Chưa có vị trí tài xế. Thời gian tuyến không phải ETA trực tiếp.' : undefined} />
  </View>
}
