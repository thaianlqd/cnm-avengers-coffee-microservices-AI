import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, Linking, ActivityIndicator } from 'react-native'
import { coordinates } from '../lib/location'
import { colors } from '../theme'
export default function StoreMap({ branches, selected }) {
  const branch = selected || branches[0]
  const point = coordinates(branch)
  const query = branch?.dia_chi ? `${branch.ten_chi_nhanh}, ${branch.dia_chi}` : point ? `${point.latitude},${point.longitude}` : ''
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setLoaded(false) }, [query])
  if (!query) return <View style={{ padding: 24 }}><Text>Chưa có địa chỉ cửa hàng để hiển thị.</Text></View>
  const encoded = encodeURIComponent(query)
  return <View style={{ height: 265, backgroundColor: '#f5f5f5' }}>
    <iframe key={query} title={`Google Maps · ${branch?.ten_chi_nhanh || 'Cửa hàng'}`} src={`https://www.google.com/maps?q=${encoded}&output=embed`} style={{ width: '100%', height: 230, border: 0 }} loading="lazy" onLoad={() => setLoaded(true)} allowFullScreen />
    {!loaded && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 230, alignItems: 'center', justifyContent: 'center', gap: 10 }}><ActivityIndicator color={colors.primary} /><Text style={{ fontSize: 12, color: colors.muted }}>Đang tải Google Maps…</Text></View>}
    <Pressable onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`)} style={{ padding: 9, backgroundColor: '#fff' }}><Text style={{ color: colors.primary, fontSize: 12 }}>Mở trên Google Maps ↗</Text></Pressable>
  </View>
}
