import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { coordinate } from '../lib/trackingSession'
import useDeliveryRoute from '../hooks/useDeliveryRoute'
import RouteSummary from './RouteSummary'
import { colors } from '../theme'
const hues = { store: '#00a77d', destination: '#ed3f74', driver: '#7945ff' }
function pin(kind) {
  const symbol = kind === 'store' ? '☕' : kind === 'destination' ? '⌂' : '➤'
  return L.divIcon({ className: '', html: `<div style="width:32px;height:32px;background:${hues[kind]};color:white;border:3px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 7px #3335"><span style="display:block;text-align:center;line-height:26px;font-size:19px;transform:rotate(45deg)">${symbol}</span></div>`, iconSize: [32,38], iconAnchor: [16,38] })
}
export default function DeliveryMap({ delivery }) {
  const container = useRef(null), map = useRef(null), markers = useRef({}), line = useRef(null), fitted = useRef(false), animation = useRef(null), follow = useRef(true)
  const [failed, setFailed] = useState(false), [loaded, setLoaded] = useState(false)
  const route = useDeliveryRoute(delivery)
  const driver = coordinate(delivery?.shipper_location), store = coordinate(delivery?.tracking?.store_location), destination = coordinate(delivery?.tracking?.destination_location)
  const first = driver || store || destination, points = [store,destination,driver].filter(Boolean)
  const fit = () => { if (map.current && points.length) map.current.fitBounds(L.latLngBounds(points.map(p => [p.latitude,p.longitude])), { padding: [45,45], maxZoom: 16 }) }
  useEffect(() => {
    if (!container.current || !first || map.current) return
    const instance = L.map(container.current, { zoomControl: true, scrollWheelZoom: false }).setView([first.latitude,first.longitude],15)
    map.current = instance
    const key = process.env.EXPO_PUBLIC_VIETMAP_TILE_KEY
    const tiles = L.tileLayer(key ? `https://maps.vietmap.vn/tm/{z}/{x}/{y}@2x.png?apikey=${encodeURIComponent(key)}` : 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png', { maxZoom: 19, attribution: key ? '© Vietmap' : '© OpenStreetMap' }).addTo(instance)
    let errors = 0
    tiles.on('tileload', () => { setLoaded(true); setFailed(false) }).on('tileerror', () => { if (++errors >= 4) setFailed(true) })
    instance.on('dragstart', () => { follow.current = false })
    const observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(container.current)
    return () => { observer.disconnect(); cancelAnimationFrame(animation.current); instance.remove(); map.current = null; markers.current = {}; line.current = null; fitted.current = false }
  }, [Boolean(first)])
  useEffect(() => {
    if (!map.current) return
    Object.entries({ store,destination,driver }).forEach(([kind,p]) => {
      let marker = markers.current[kind]
      if (!p) { if (marker) { marker.remove(); delete markers.current[kind] } return }
      const target = L.latLng(p.latitude,p.longitude)
      if (!marker) { marker = L.marker(target,{ icon: pin(kind) }).addTo(map.current); const label = document.createElement('span'); label.textContent = kind === 'store' ? delivery?.tracking?.branch_name || 'Cửa hàng' : kind === 'driver' ? delivery?.shipper?.full_name || 'Tài xế' : 'Điểm nhận hàng'; marker.bindTooltip(label); markers.current[kind] = marker }
      else if (kind !== 'driver') marker.setLatLng(target)
      else { cancelAnimationFrame(animation.current); const from = marker.getLatLng(), started = performance.now(); const move = now => { if (!map.current) return; const t = Math.min((now-started)/900,1); marker.setLatLng([from.lat+(target.lat-from.lat)*t,from.lng+(target.lng-from.lng)*t]); if (t < 1) animation.current = requestAnimationFrame(move) }; animation.current = requestAnimationFrame(move) }
    })
    if (!fitted.current && points.length) { fit(); fitted.current = true }
    else if (follow.current && driver) map.current.panTo([driver.latitude,driver.longitude], { animate: true })
  }, [driver?.latitude,driver?.longitude,store?.latitude,store?.longitude,destination?.latitude,destination?.longitude])
  useEffect(() => { if (!map.current) return; line.current?.remove(); line.current = route.data ? L.polyline(route.data.coordinates.map(p => [p.latitude,p.longitude]), { color: '#507fe5', weight: 5, opacity: .9 }).addTo(map.current) : null }, [route.data,Boolean(first)])
  if (!first) return <View style={{ padding: 24, backgroundColor: '#f5f5f5', borderRadius: 12 }}><Text style={{ color: colors.muted, lineHeight: 22 }}>Bản đồ sẽ hiển thị khi hệ thống có vị trí cửa hàng hoặc tài xế.</Text></View>
  return <View style={{ gap: 8 }}><View style={{ height: 300, borderRadius: 14, overflow: 'hidden', position: 'relative', backgroundColor: '#f3f1e8' }}>
    <div ref={container} aria-label="Bản đồ hành trình đơn hàng" style={{ width: '100%', height: '100%' }} />
    <Pressable onPress={() => { follow.current = true; fit() }} accessibilityLabel="Đưa bản đồ về hành trình đơn hàng" style={{ position: 'absolute', top: 12, right: 12, zIndex: 1000, padding: 10, borderRadius: 8, backgroundColor: '#fff' }}><Text style={{ color: colors.primary, fontSize: 12 }}>Định tâm</Text></Pressable>
    {(!loaded || failed) && <View pointerEvents="none" style={{ position: 'absolute', left: 12, bottom: 12, right: 12, zIndex: 1000, backgroundColor: '#fff', padding: 10, borderRadius: 8 }}><Text style={{ fontSize: 12 }}>{failed ? 'Chưa tải được nền bản đồ. Kiểm tra kết nối mạng.' : 'Đang tải bản đồ…'}</Text></View>}
  </View><RouteSummary route={route} delivery={delivery} /></View>
}
