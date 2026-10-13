import React from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { colors } from '../theme'
export default function RouteSummary({ route, delivery }) {
  const terminal = ['HOAN_THANH', 'DA_HUY'].includes(delivery?.order?.trang_thai_don_hang)
  return <View style={{ padding: 12, borderRadius: 10, backgroundColor: '#fff', gap: 8 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{[['#009c74','Cửa hàng'],['#6240d9','Tài xế'],['#ed4779','Điểm giao']].map(([color,label]) => <Text key={label} style={{ color: colors.muted, fontSize: 11 }}><Text style={{ color }}>● </Text>{label}</Text>)}</View>
    {route.data ? <View style={{ flexDirection: 'row', gap: 20 }}><View style={{ flex: 1 }}><Text style={{ color: colors.muted, fontSize: 11 }}>{terminal || !delivery?.shipper_location ? 'Thời gian tuyến đường' : 'Thời gian đến dự kiến'}</Text><Text style={{ color: '#6240d9', fontSize: 22, fontWeight: '700', marginTop: 4 }}>~{Math.max(1, Math.ceil(route.data.durationMinutes))} phút</Text></View><View style={{ flex: 1 }}><Text style={{ color: colors.muted, fontSize: 11 }}>Khoảng cách đường bộ</Text><Text style={{ fontSize: 22, fontWeight: '700', marginTop: 4 }}>{route.data.distanceKm.toFixed(1)} km</Text></View></View> : route.possible && route.configured && route.isPending ? <ActivityIndicator color={colors.primary} /> : route.isError ? <Pressable onPress={() => route.refetch()}><Text style={{ color: colors.primary }}>Chưa tải được tuyến đường · Thử lại</Text></Pressable> : <Text style={{ fontSize: 12, color: colors.muted }}>Chờ đủ vị trí để tính tuyến đường.</Text>}
    {!terminal && !delivery?.shipper_location && <Text style={{ fontSize: 12, color: '#9d6a16', lineHeight: 19 }}>Chưa có vị trí tài xế. Đang chờ kết nối…</Text>}
  </View>
}
