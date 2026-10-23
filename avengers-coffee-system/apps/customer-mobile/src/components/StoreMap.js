import React, { useEffect, useRef } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import { coordinates, distanceKm } from '../lib/location'
import { colors } from '../theme'
export default function StoreMap({ branches, selected, onSelect }) {
  const map = useRef(null), point = coordinates(selected) || branches.map(coordinates).find(Boolean)
  const visible = branches.filter(b => coordinates(b)).sort((a, b) => distanceKm(point, coordinates(a)) - distanceKm(point, coordinates(b))).slice(0, 100)
  useEffect(() => { if (point) map.current?.animateToRegion({ ...point, latitudeDelta: .025, longitudeDelta: .025 }, 350) }, [point?.latitude, point?.longitude])
  if (!point) return <View style={{ padding: 24 }}><Text>Chưa có tọa độ cửa hàng để hiển thị.</Text></View>
  return <View style={{ height: 245 }}><MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={{ ...point, latitudeDelta: .04, longitudeDelta: .04 }} showsPointsOfInterest showsBuildings mapType="standard" toolbarEnabled={false}>{visible.map(b => <Marker key={b.ma_chi_nhanh} coordinate={coordinates(b)} title={b.ten_chi_nhanh} description={b.dia_chi} pinColor={colors.primary} onPress={() => onSelect(b)} />)}</MapView></View>
}
