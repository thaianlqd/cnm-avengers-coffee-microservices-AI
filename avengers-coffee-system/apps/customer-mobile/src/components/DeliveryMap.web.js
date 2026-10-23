import React from 'react'
import { View } from 'react-native'
import LeafletFrame from '../../../shared-ui/LeafletFrame.web'
import JourneyOverlay from '../../../shared-ui/JourneyOverlay'
import useDeliveryRoute from '../hooks/useDeliveryRoute'
import { coordinate } from '../lib/trackingSession'
import { journeyProgress, measuredRouteSummary } from '../../../web-customer/src/components/map/deliveryMapPresentation'
export default function DeliveryMap({ delivery }) {
  const route=useDeliveryRoute(delivery)
  const points=Object.entries({store:delivery?.tracking?.store_location,destination:delivery?.tracking?.destination_location,driver:delivery?.shipper_location}).map(([kind,value]) => {const p=coordinate(value);return p?{...p,id:kind,kind,label:kind==='store'?'Cửa hàng':kind==='driver'?delivery?.shipper?.full_name||'Tài xế':'Điểm giao'}:null}).filter(Boolean)
  return <View style={{gap:8}}><View style={{height:380,borderRadius:22,overflow:'hidden'}}><LeafletFrame title="Bản đồ hành trình đơn hàng" points={points} route={route.data?.coordinates} followDriver /></View><JourneyOverlay floating={false} progress={journeyProgress(delivery?.shipper_delivery?.status,points.some(p=>p.kind==='driver'))} metrics={measuredRouteSummary(route.data)} notice={route.isError?'Chưa tải được tuyến đường.':route.data?.approximate?'Tuyến dự phòng OSRM theo đường ô tô; thời gian tham khảo.':undefined} /></View>
}
