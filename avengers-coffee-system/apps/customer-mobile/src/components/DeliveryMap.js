import { nativeTileUrl, detailedNativeStyle } from '../../../shared-ui/nativeBasemap'
import useDeliveryRoute from '../hooks/useDeliveryRoute'
import JourneyOverlay, { JourneyPin } from '../../../shared-ui/JourneyOverlay'
import { journeyProgress, measuredRouteSummary } from '../../../web-customer/src/components/map/deliveryMapPresentation'
import React, { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native'
import MapView, { Marker, AnimatedRegion, Polyline, UrlTile } from 'react-native-maps'
import { Ionicons } from '@expo/vector-icons'
import { coordinate } from '../lib/trackingSession'
import { colors } from '../theme'

export default function DeliveryMap({ delivery }) {
  const tileUrl = nativeTileUrl(process.env.EXPO_PUBLIC_VIETMAP_TILE_KEY)
  const route = useDeliveryRoute(delivery)
  const map = useRef(null), marker = useRef(null), fitted = useRef(false)
  const [follow, setFollow] = useState(true)
  const driver = coordinate(delivery?.shipper_location)
  const store = coordinate(delivery?.tracking?.store_location)
  const destination = coordinate(delivery?.tracking?.destination_location)
  const first = driver || store || destination
  const animated = useRef(new AnimatedRegion({ latitude: first?.latitude || 0, longitude: first?.longitude || 0, latitudeDelta: .012, longitudeDelta: .012 })).current
  const points = [store, destination, driver].filter(Boolean)
  const fit = () => {
    if (!points.length) return
    map.current?.fitToCoordinates(points, { edgePadding: { top: 75, right: 48, bottom: 55, left: 48 }, animated: true })
  }
  useEffect(() => {
    if (!driver) return
    if (Platform.OS === 'android') marker.current?.animateMarkerToCoordinate(driver, 900)
    else animated.timing({ ...driver, duration: 900, useNativeDriver: false }).start()
    if (follow && fitted.current) map.current?.animateCamera({ center: driver }, { duration: 900 })
  }, [driver?.latitude, driver?.longitude, animated, follow])
  useEffect(() => {
    if (!fitted.current && first && map.current) { fit(); fitted.current = true }
  }, [first?.latitude, first?.longitude])
  if (!first) return <View style={styles.empty}><Ionicons name="map-outline" size={30} color={colors.muted} /><Text style={styles.emptyText}>Bản đồ sẽ hiển thị khi có vị trí cửa hàng hoặc tài xế.</Text></View>
  return <View style={{ gap: 8 }}><View style={styles.wrap}>
    <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={{ ...first, latitudeDelta: .025, longitudeDelta: .025 }}
      customMapStyle={detailedNativeStyle} showsPointsOfInterest showsBuildings mapType={tileUrl && Platform.OS === 'android' ? 'none' : 'standard'}
      onMapReady={() => { fit(); fitted.current = true }} onPanDrag={() => setFollow(false)} toolbarEnabled={false}>
      {tileUrl && <UrlTile urlTemplate={tileUrl} tileSize={512} maximumZ={19} maximumNativeZ={19} minimumZ={1} zIndex={-1} />}
      {route.data && <Polyline coordinates={route.data.coordinates} strokeColor="#507fe5" strokeWidth={5} />}
      {store && <Marker coordinate={store} title={delivery?.tracking?.branch_name || 'Cửa hàng'} anchor={{ x:.5,y:1 }}><JourneyPin kind="store" /></Marker>}
      {destination && <Marker coordinate={destination} title="Địa chỉ giao hàng" anchor={{ x:.5,y:1 }}><JourneyPin kind="destination" /></Marker>}
      {driver && <Marker.Animated ref={marker} coordinate={animated} title={delivery?.shipper?.full_name || 'Tài xế'} anchor={{ x:.5,y:1 }}>
        <JourneyPin kind="driver" />
      </Marker.Animated>}
    </MapView>
    {tileUrl && <Text style={{position:'absolute',bottom:3,right:5,fontSize:10,backgroundColor:'#fffffff0',paddingHorizontal:4}}>© Vietmap</Text>}
    <Pressable style={styles.recenter} accessibilityLabel="Đưa bản đồ về hành trình đơn hàng" onPress={() => { setFollow(true); fit() }}><Ionicons name="locate-outline" size={22} color={colors.primary} /></Pressable>

  </View><JourneyOverlay floating={false} progress={journeyProgress(delivery?.shipper_delivery?.status || delivery?.order?.trang_thai_don_hang, Boolean(driver))} metrics={measuredRouteSummary(route.data)} notice={route.isError ? 'Chưa tải được tuyến đường. Kéo xuống để thử lại.' : !driver ? 'Chưa có vị trí tài xế. Thời gian tuyến không phải ETA trực tiếp.' : undefined} />
  </View>
}
const styles = StyleSheet.create({
  wrap: { height: 380, borderRadius: 22, overflow: 'hidden', backgroundColor: '#eee' },
  driver: { backgroundColor: '#7945ff', padding: 8, borderRadius: 22, borderWidth: 2, borderColor: '#fff' },
  recenter: { position: 'absolute', right: 12, top: 12, backgroundColor: '#fff', borderRadius: 22, padding: 12, elevation: 3 },
  legend: { position: 'absolute', bottom: 10, left: 10, right: 10, padding: 8, backgroundColor: '#fffffff0', borderRadius: 6 },
  legendText: { fontSize: 11, color: colors.text, textAlign: 'center' },
  empty: { height: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24, borderRadius: 12, gap: 12 },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
})
