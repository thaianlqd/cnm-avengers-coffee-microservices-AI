import LeafletFrame from '../../../shared-ui/LeafletFrame.web'
import { fetchRoadRoute } from '../../../web-customer/src/lib/maps/deliveryRouting.mjs'
import '../../../web-customer/src/components/delivery/DeliveryJourney.css'
import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Linking, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors } from '../theme'
import { formatCurrency, deliveryStatusLabels } from '../lib/shipperData'
import { Header, Button, EmptyState, Skeleton, ui } from '../components/Experience'
import JourneyOverlay, { JourneyProgress } from '../../../shared-ui/JourneyOverlay'
import { journeyProgress, mapPinHtml, measuredRouteSummary } from '../../../web-customer/src/components/map/deliveryMapPresentation'
function point(latitude,longitude) {
  if (latitude == null || longitude == null || latitude === '' || longitude === '') return null
  const lat = Number(latitude),lng = Number(longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0) ? [lat,lng] : null
}
export function JourneyMap({ store,destination,driver,delivery,preview = false,onMetrics }) {
  const [routeData,setRouteData]=useState(null)
  const pickedUp=['IN_TRANSIT','DELIVERED'].includes(delivery?.status)
  const stops=(pickedUp?[driver||store,destination]:[driver,store,destination]).filter(Boolean).filter((p,i,all)=>!i||p.join(',')!==all[i-1].join(','))
  const signature=stops.map(p=>p.map(n=>Number(n).toFixed(3)).join(',')).join('|')
  const callback=useRef(onMetrics);callback.current=onMetrics
  useEffect(()=>{
    if(stops.length<2){setRouteData(null);return}
    const controller=new AbortController()
    fetchRoadRoute(stops.map(([latitude,longitude])=>({latitude,longitude})),{key:process.env.EXPO_PUBLIC_VIETMAP_API_KEY,signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted)setRouteData({signature,...data})}).catch(()=>{if(!controller.signal.aborted)setRouteData(null)})
    return()=>controller.abort()
  },[signature])
  const route=routeData?.signature===signature?routeData:null
  useEffect(()=>{const summary=measuredRouteSummary(route);callback.current?.(summary?{...summary,approximate:route.approximate}:null)},[route])
  const points=Object.entries({store,destination,driver}).filter(([,p])=>p).map(([kind,p])=>({id:kind,kind,latitude:p[0],longitude:p[1],label:kind==='store'?'Cửa hàng':kind==='driver'?'Bạn · Tài xế':'Điểm giao'}))
  if(!points.length)return <EmptyState icon="map-outline" title="Chưa có tọa độ hành trình" />
  return <View style={[s.map,preview&&{minHeight:190}]}><LeafletFrame points={points} route={route?.coordinates} followDriver title="Bản đồ hành trình lấy và giao hàng" />
    {!preview&&!onMetrics&&<JourneyOverlay progress={journeyProgress(delivery?.status,Boolean(driver))} metrics={measuredRouteSummary(route)} showProgress={false} notice={route?.approximate?'Tuyến dự phòng OSRM theo đường ô tô; thời gian tham khảo.':undefined}/>}</View>
}
export function MapScreen({ route,navigation }) {
  const [expanded, setExpanded] = useState(false)
  const [metrics,setMetrics]=useState(null)
  const { height: windowHeight } = useWindowDimensions()
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
  const progress = journeyProgress(delivery?.status,Boolean(driver));
  return <SafeAreaView edges={['top','left','right']} style={ui.screen}><Header title="Hành trình giao hàng" onBack={() => navigation.goBack()} />
    {!delivery ? <EmptyState title="Chưa có thông tin đơn" description="Mở hành trình từ chi tiết đơn hàng." /> : <View style={{ flex:1, minHeight:0 }}>
      {tracking.isLoading ? <Skeleton count={1} /> : <JourneyMap store={store} destination={destination} driver={driver} delivery={delivery} onMetrics={setMetrics} />}
      <View style={[s.details, { height: expanded ? Math.min(windowHeight * .55, 460) : 265 }]}><Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Thu gọn chi tiết chuyến' : 'Mở rộng chi tiết chuyến'} onPress={() => setExpanded(value => !value)} style={s.sheetHeading}><View style={s.handle} /><View style={{ flexDirection:'row',alignItems:'center',gap:8 }}><Text style={{ flex:1,fontSize:13,fontWeight:'700',color:'#334155' }}>{progress.label}</Text><Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={19} color="#8798ac" /></View></Pressable>{metrics ? <View style={s.routeMetrics}><View style={{flex:1}}><Text style={s.metricLabel}>Thời gian dự kiến</Text><Text style={[s.metricValue,{color:colors.primary}]}>{metrics.duration}</Text></View><View style={{flex:1,borderLeftWidth:1,borderColor:'#eee9e3',paddingLeft:20}}><Text style={s.metricLabel}>Quãng đường</Text><Text style={s.metricValue}>{metrics.distance}</Text></View></View> : <Text style={s.metricLabel}>Chờ dữ liệu tuyến đường để tính thời gian và khoảng cách.</Text>}{metrics?.approximate&&<Text style={s.metricLabel}>Tuyến dự phòng OSRM theo đường ô tô; thời gian tham khảo.</Text>}<JourneyProgress step={progress.step} />
        {expanded ? <ScrollView style={{ flex:1 }} contentContainerStyle={{ paddingVertical:14,gap:12 }}><View style={s.point}><Ionicons name="cafe" size={22} color="#00a77d" /><View style={{ flex:1 }}><Text style={s.pointTitle}>{delivery.store_name || t?.branch_name || 'Cửa hàng lấy món'}</Text><Text style={s.address}>{pickupAddress || 'Chưa cập nhật địa chỉ'}</Text></View></View><View style={s.point}><Ionicons name="home" size={22} color="#ed3f74" /><View style={{ flex:1 }}><Text style={s.pointTitle}>{delivery.customer_name || 'Giao cho khách'}</Text><Text style={s.address}>{delivery.delivery_address || 'Chưa cập nhật địa chỉ'}</Text></View></View>
          {expanded && <><Text style={ui.caption}>Tiền thu hộ (Cod): {delivery.cod_amount != null ? formatCurrency(delivery.cod_amount) : 'Chưa cập nhật'}</Text>{delivery.customer_phone && <Button secondary label={`Gọi ${delivery.customer_phone}`} icon="call-outline" onPress={() => Linking.openURL(`tel:${delivery.customer_phone}`)} />}</>}
          {query.isError && <Text style={ui.caption}>Chưa đồng bộ được trạng thái mới.</Text>}<Pressable accessibilityRole="button" accessibilityLabel="Làm mới hành trình" onPress={refresh}><Text style={{ color:colors.primary,fontSize:12,textAlign:'center' }}>Làm mới hành trình</Text></Pressable>
        </ScrollView> : <Text numberOfLines={1} style={{ color:'#8796a9',fontSize:11,paddingVertical:12 }}>Điểm tiếp theo · {targetPickup ? pickupAddress || delivery.store_name : delivery.delivery_address || delivery.customer_name}</Text>}
        <View style={{ paddingTop:8 }}><View style={{ flexDirection:'row',gap:8 }}><View style={{ flex:1 }}><Button secondary icon="receipt-outline" label="Chi tiết đơn" onPress={() => navigation.navigate('OrderDetail',{ deliveryId:delivery.id })} /></View><View style={{ flex:1 }}><Button icon="navigate-outline" label={targetPickup ? 'Đến cửa hàng' : 'Đến khách'} disabled={!target && !address} onPress={openMaps} /></View></View></View>
      </View>
    </View>}
  </SafeAreaView>
}
const s = StyleSheet.create({routeMetrics:{flexDirection:'row',paddingVertical:12,marginBottom:10},metricLabel:{fontSize:9,color:'#938a84',letterSpacing:.5},metricValue:{fontSize:22,fontWeight:'700',color:'#302b2a',marginTop:5}, map:{ flex:1, minHeight:260, overflow:'hidden', position:'relative',backgroundColor:'#e8ecef' },mapControl:{ position:'absolute',top:12,right:12,zIndex:1000 },details:{ flexShrink:0,backgroundColor:'#fff',marginTop:-18,borderTopLeftRadius:22,borderTopRightRadius:22,paddingHorizontal:18,paddingBottom:10,borderWidth:1,borderColor:'#e8edf4' },sheetHeading:{ paddingVertical:12,gap:10 },handle:{ alignSelf:'center',width:40,height:4,borderRadius:8,backgroundColor:'#d4deeb' },point:{ flexDirection:'row',gap:12,alignItems:'flex-start' },pointTitle:{ color:'#334155',fontSize:13,fontWeight:'600' },address:{ color:'#8796a9',fontSize:11,lineHeight:17,marginTop:3 } })
