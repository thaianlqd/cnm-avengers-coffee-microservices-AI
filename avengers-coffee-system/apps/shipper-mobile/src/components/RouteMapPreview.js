import React, { useEffect, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import { fetchRoadRoute } from '../../../web-customer/src/lib/maps/deliveryRouting.mjs'
import { JourneyPin } from '../../../shared-ui/JourneyOverlay'
export default function RouteMapPreview({ store, destination, order }) {
  const map = useRef(null), [line,setLine] = useState(null)
  const points = [store,destination].filter(Boolean).map(([latitude,longitude])=>({latitude,longitude}))
  const signature = [store?.join(','),destination?.join(',')].join('|')
  useEffect(()=>{
    const key = process.env.EXPO_PUBLIC_VIETMAP_API_KEY
    if (!store || !destination) return
    const controller=new AbortController()
    fetchRoadRoute(points,{key,signal:controller.signal}).then(route=>{
      if(!controller.signal.aborted)setLine({signature,points:route.coordinates})
    }).catch(()=>{if(!controller.signal.aborted)setLine(null)})
    return ()=>controller.abort()
  },[signature])
  return <View style={{height:190,borderRadius:12,overflow:'hidden'}} testID="order-route-map"><MapView ref={map} style={StyleSheet.absoluteFillObject} mapType="standard" initialRegion={{...points[0],latitudeDelta:.012,longitudeDelta:.012}} onMapReady={()=>map.current?.fitToCoordinates(points,{edgePadding:{top:60,right:32,bottom:22,left:32},animated:false})} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false}>

    {store && <Marker coordinate={{latitude:store[0],longitude:store[1]}} title={order.store_name || 'Cửa hàng'}><JourneyPin kind="store" /></Marker>}
    {destination && <Marker coordinate={{latitude:destination[0],longitude:destination[1]}} title="Điểm giao"><JourneyPin kind="destination" /></Marker>}
    {line?.signature===signature && <Polyline coordinates={line.points} strokeColor="#4378dd" strokeWidth={4} />}
  </MapView></View>
}
