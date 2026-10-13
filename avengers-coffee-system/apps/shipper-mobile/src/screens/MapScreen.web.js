import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Linking, StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors } from '../theme'
import { formatCurrency, deliveryStatusLabels } from '../lib/shipperData'
import { Header, Button, EmptyState, Skeleton, ui } from '../components/Experience'
import { LazyScrollView, LazySection } from '../components/LazyScrollView'
function point(latitude,longitude) {
  if (latitude == null || longitude == null || latitude === '' || longitude === '') return null
  const lat = Number(latitude),lng = Number(longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0) ? [lat,lng] : null
}
let leafletPromise
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L)
  if (!leafletPromise) leafletPromise = new Promise((resolve,reject) => {
    if (!document.getElementById('shipper-leaflet-css')) { const link = document.createElement('link'); link.id = 'shipper-leaflet-css'; link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link) }
    const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.onload = () => resolve(window.L); script.onerror = () => { script.remove(); leafletPromise = null; reject(new Error('Không tải được bản đồ')) }; document.head.appendChild(script)
  })
  return leafletPromise
}
function JourneyMap({ store,destination,driver }) {
  const element = useRef(null),map = useRef(null),markers = useRef({}),line = useRef(null),fitted = useRef(false)
  const [ready,setReady] = useState(false),[failed,setFailed] = useState(false),[loaded,setLoaded] = useState(false),[attempt,setAttempt] = useState(0)
  const first = store || destination || driver
  const fit = () => { const points = [store,destination,driver].filter(Boolean); if (map.current && points.length) map.current.fitBounds(points,{ padding: [40,40],maxZoom: 16 }) }
  useEffect(() => {
    if (!first || !element.current) return
    let cancelled = false,observer
    loadLeaflet().then(L => {
      if (cancelled) return
      const instance = L.map(element.current,{ scrollWheelZoom: false }).setView(first,15); map.current = instance
      const key = process.env.EXPO_PUBLIC_VIETMAP_TILE_KEY
      const tiles = L.tileLayer(key ? `https://maps.vietmap.vn/tm/{z}/{x}/{y}@2x.png?apikey=${encodeURIComponent(key)}` : 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png',{ maxZoom: 19,attribution: key ? '© Vietmap' : '© OpenStreetMap' }).addTo(instance)
      let errors = 0
      tiles.on('tileload',() => { if (!cancelled) { setLoaded(true); setFailed(false) } }); tiles.on('tileerror',() => { if (!cancelled && ++errors > 3) setFailed(true) })
      observer = new ResizeObserver(() => instance.invalidateSize()); observer.observe(element.current); setReady(true)
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; observer?.disconnect(); map.current?.remove(); map.current = null; markers.current = {}; line.current = null; fitted.current = false; setReady(false) }
  },[Boolean(first),attempt])
  useEffect(() => {
    if (!ready || !map.current) return
    const L = window.L
    Object.entries({ store,destination,driver }).forEach(([kind,p]) => {
      if (!p) { markers.current[kind]?.remove(); delete markers.current[kind]; return }
      if (markers.current[kind]) markers.current[kind].setLatLng(p)
      else { const hue = kind === 'store' ? '#00a77d' : kind === 'driver' ? '#507fe5' : '#B42332'; const icon = L.divIcon({ className: '',html: `<div style="width:28px;height:28px;border:3px solid white;border-radius:50%;background:${hue};box-shadow:0 2px 7px #3335"></div>`,iconSize: [28,28],iconAnchor: [14,14] }); markers.current[kind] = L.marker(p,{ icon }).addTo(map.current).bindTooltip(kind === 'store' ? 'Lấy món' : kind === 'driver' ? 'Vị trí tài xế đã cập nhật' : 'Giao cho khách') }
    })
    if (!fitted.current) { fit(); fitted.current = true }
  },[ready,store?.[0],store?.[1],destination?.[0],destination?.[1],driver?.[0],driver?.[1]])
  useEffect(() => {
    const key = process.env.EXPO_PUBLIC_VIETMAP_API_KEY
    if (!ready || !store || !destination || !key) return
    const controller = new AbortController()
    fetch(`https://maps.vietmap.vn/api/route?api-version=1.1&apikey=${encodeURIComponent(key)}&point=${store.join(',')}&point=${destination.join(',')}&vehicle=motorcycle&points_encoded=false`,{ signal: controller.signal }).then(r => r.json()).then(data => { const coords = data.paths?.[0]?.points?.coordinates; if (!controller.signal.aborted && coords && map.current) { line.current?.remove(); line.current = window.L.polyline(coords.map(c => [c[1],c[0]]),{ color: '#507fe5',weight: 5 }).addTo(map.current) } }).catch(() => {})
    return () => controller.abort()
  },[ready,store?.[0],store?.[1],destination?.[0],destination?.[1]])
  if (!first) return <EmptyState icon="map-outline" title="Chưa có tọa độ hành trình" description="Bạn vẫn có thể mở Google Maps bằng địa chỉ ở bên dưới." />
  return <View style={s.map}><div ref={element} aria-label="Bản đồ hành trình lấy và giao hàng" style={{ width: '100%',height: '100%' }} /><View style={s.mapControl}><Button secondary icon="locate-outline" label="Định tâm" onPress={fit} /></View>{(!loaded || failed) && <View style={s.mapNotice}><Text style={ui.caption}>{failed ? 'Chưa tải được nền bản đồ. Kiểm tra kết nối.' : 'Đang tải bản đồ…'}</Text>{failed && <Button secondary label="Tải lại" onPress={() => { setFailed(false); setLoaded(false); setAttempt(a => a+1) }} />}</View>}</View>
}
export function MapScreen({ route,navigation }) {
  const { shipper } = useShipper(),focused = useIsFocused(),initial = route.params?.delivery
  const query = useQuery({ queryKey: ['deliveryDetail',initial?.id],enabled: focused && !!shipper?.id && !!initial?.id,queryFn: () => apiClient.get(`/shippers/${shipper.id}/deliveries/${initial.id}`),refetchInterval: focused ? 15000 : false })
  const delivery = query.data || initial
  const tracking = useQuery({ queryKey: ['shipperTracking',delivery?.ma_don_hang],enabled: focused && !!delivery?.ma_don_hang,queryFn: () => apiClient.get(`/shippers/delivery/tracking/${delivery.ma_don_hang}`),refetchInterval: focused ? 15000 : false })
  const t = tracking.data?.tracking
  const store = point(t?.store_location?.latitude ?? delivery?.tracking?.store_latitude ?? delivery?.pickup_latitude,t?.store_location?.longitude ?? delivery?.tracking?.store_longitude ?? delivery?.pickup_longitude)
  const destination = point(t?.destination_location?.latitude ?? delivery?.tracking?.destination_latitude ?? delivery?.delivery_latitude,t?.destination_location?.longitude ?? delivery?.tracking?.destination_longitude ?? delivery?.delivery_longitude)
  const driver = point(tracking.data?.shipper_location?.latitude,tracking.data?.shipper_location?.longitude)
  const pickupAddress = delivery?.store_address || delivery?.pickup_address || t?.branch_address
  const targetPickup = ['PENDING','CONFIRMED','PICKING_UP'].includes(delivery?.status)
  const address = targetPickup ? pickupAddress : delivery?.delivery_address
  const target = targetPickup ? store : destination
  const openMaps = () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(target ? target.join(',') : address || '')}`)
  const refresh = () => { query.refetch(); tracking.refetch() }
  return <SafeAreaView edges={['top','left','right']} style={ui.screen}><Header title="Hành trình giao hàng" subtitle={`#${String(delivery?.ma_don_hang || delivery?.id || '').slice(0,8).toUpperCase()}`} onBack={() => navigation.goBack()} />
    {!delivery ? <EmptyState title="Chưa có thông tin đơn" description="Mở hành trình từ chi tiết đơn hàng." /> : <LazyScrollView contentContainerStyle={{ padding: 16,gap: 16,paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={query.isRefetching || tracking.isRefetching} onRefresh={refresh} />}>
      <View style={s.status}><Ionicons name="navigate-outline" size={22} color={colors.primary} /><View style={{ flex: 1 }}><Text style={ui.heading}>{deliveryStatusLabels[delivery.status] || delivery.status}</Text><Text style={ui.caption}>{driver ? 'Vị trí được cập nhật từ hệ thống' : 'Chưa có vị trí tài xế mới'}</Text>{query.isError && <Text style={ui.caption}>Chưa đồng bộ được trạng thái mới. Kéo xuống để thử lại.</Text>}</View></View>
      <LazySection minHeight={320}>{tracking.isLoading ? <Skeleton count={1} /> : <JourneyMap store={store} destination={destination} driver={driver} />}</LazySection>
      <LazySection minHeight={180}><View style={[ui.card,{ gap: 14 }]}><Text style={ui.caption}>ĐIỂM LẤY MÓN</Text><Text style={ui.heading}>{delivery.store_name || t?.branch_name || 'Cửa hàng phục vụ'}</Text><Text style={ui.caption}>{pickupAddress || 'Chưa cập nhật địa chỉ'}</Text><View style={s.divider} /><Text style={ui.caption}>GIAO CHO KHÁCH</Text><Text style={ui.heading}>{delivery.customer_name || 'Người nhận'}</Text><Text style={ui.caption}>{delivery.delivery_address || 'Chưa cập nhật địa chỉ'}</Text>{delivery.customer_phone && <Button secondary label={`Gọi ${delivery.customer_phone}`} icon="call-outline" onPress={() => Linking.openURL(`tel:${delivery.customer_phone}`)} />}</View></LazySection>
      <View style={s.status}><Text style={[ui.caption,{ flex: 1 }]}>Tiền thu hộ COD</Text><Text style={ui.heading}>{delivery.cod_amount != null ? formatCurrency(delivery.cod_amount) : 'Chưa cập nhật'}</Text></View>
      <Button icon="navigate-outline" label={targetPickup ? 'Đi đến cửa hàng · Google Maps' : 'Đi đến khách · Google Maps'} disabled={!target && !address} onPress={openMaps} />
      <Button secondary icon="receipt-outline" label="Chi tiết và cập nhật đơn" onPress={() => navigation.navigate('OrderDetail',{ deliveryId: delivery.id })} />
    </LazyScrollView>}
  </SafeAreaView>
}
const s = StyleSheet.create({ status: { flexDirection: 'row',gap: 12,alignItems: 'center',padding: 16,backgroundColor: '#fff',borderRadius: 16,borderWidth: 1,borderColor: '#e9ecf0' },map: { height: 320,borderRadius: 18,overflow: 'hidden',position: 'relative',backgroundColor: '#e8ecef' },mapControl: { position: 'absolute',top: 12,right: 12,zIndex: 1000 },mapNotice: { position: 'absolute',bottom: 12,left: 12,right: 12,padding: 12,borderRadius: 12,backgroundColor: '#fff',zIndex: 1000,gap: 8 },divider: { height: 1,backgroundColor: '#eef0f3' } })
