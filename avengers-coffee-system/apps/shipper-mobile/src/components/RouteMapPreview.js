import React, { useEffect, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import MapView, { Marker, Polyline, UrlTile } from 'react-native-maps'
import { nativeTileUrl, detailedNativeStyle } from '../../../shared-ui/nativeBasemap'
import { JourneyPin } from '../../../shared-ui/JourneyOverlay'
export default function RouteMapPreview({ store, destination, order }) {
  const map = useRef(null), [line,setLine] = useState(null)
  const points = [store,destination].filter(Boolean).map(([latitude,longitude])=>({latitude,longitude}))
  const signature = [store?.join(','),destination?.join(',')].join('|')
  const tile = nativeTileUrl(process.env.EXPO_PUBLIC_VIETMAP_TILE_KEY)
  useEffect(()=>{
    const key = process.env.EXPO_PUBLIC_VIETMAP_API_KEY
    if (!key || !store || !destination) return
    const controller = new AbortController(), params=new URLSearchParams({'api-version':'1.1',apikey:key,vehicle:'motorcycle',points_encoded:'false'})
    ;[store,destination].forEach(p=>params.append('point',p.join(',')))
    fetch(`https://maps.vietmap.vn/api/route?${params}`,{signal:controller.signal}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{
      const coordinates=data.paths?.[0]?.points?.coordinates
      if(!controller.signal.aborted && Array.isArray(coordinates))setLine({signature,points:coordinates.map(([longitude,latitude])=>({latitude,longitude}))})
    }).catch(()=>{})
    return ()=>controller.abort()
  },[signature])
  return <View style={{height:190,borderRadius:12,overflow:'hidden'}} testID="order-route-map"><MapView ref={map} style={StyleSheet.absoluteFillObject} customMapStyle={detailedNativeStyle} mapType={tile?'none':'standard'} initialRegion={{...points[0],latitudeDelta:.012,longitudeDelta:.012}} onMapReady={()=>map.current?.fitToCoordinates(points,{edgePadding:{top:60,right:32,bottom:22,left:32},animated:false})} scrollEnabled={false} zoomEnabled={false} rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false}>
    {tile && <UrlTile urlTemplate={tile} maximumZ={19} tileSize={256} />}
    {store && <Marker coordinate={{latitude:store[0],longitude:store[1]}} title={order.store_name || 'Cửa hàng'}><JourneyPin kind="store" /></Marker>}
    {destination && <Marker coordinate={{latitude:destination[0],longitude:destination[1]}} title="Điểm giao"><JourneyPin kind="destination" /></Marker>}
    {line?.signature===signature && <Polyline coordinates={line.points} strokeColor="#4378dd" strokeWidth={4} />}
  </MapView></View>
}
