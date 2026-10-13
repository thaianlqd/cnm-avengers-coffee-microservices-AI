import React, { useState, useRef } from 'react'
import { View, Text, Pressable, StyleSheet, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import { useQuery } from '@tanstack/react-query'
import { LinearGradient } from 'expo-linear-gradient'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors } from '../theme'
import { formatCurrency, formatDateTime, deliveryStatusLabels } from '../lib/shipperData'
import { deliveryArray, deliveriesInRange, summarizeDeliveries } from '../lib/deliverySummary.mjs'
import { Header, IconButton, Skeleton, EmptyState, Reveal, ui } from '../components/Experience'
import { LazyScrollView, LazySection } from '../components/LazyScrollView'
import Pagination, { usePagination } from '../components/Pagination'
const ranges = [{ id: 'today', label: 'Hôm nay' }, { id: 'week', label: '7 ngày' }, { id: 'month', label: 'Tháng này' }]
export function ReportScreen({ navigation }) {
  const { shipper } = useShipper(), focused = useIsFocused(), scroll = useRef(null)
  const [range,setRange] = useState('today'), [historyY,setHistoryY] = useState(0)
  const query = useQuery({ queryKey: ['reportDeliveries',shipper?.id], enabled: focused && !!shipper?.id, queryFn: async () => deliveryArray(await apiClient.get(`/shippers/${shipper.id}/deliveries`)) })
  const deliveries = deliveriesInRange(query.data || [],range).sort((a,b) => new Date(b.delivered_at || b.updated_at)-new Date(a.delivered_at || a.updated_at))
  const summary = summarizeDeliveries(deliveries), paging = usePagination(deliveries,`${shipper?.id}:${range}`)
  const money = summary.total_income == null ? 'Chưa đủ dữ liệu' : formatCurrency(summary.total_income)
  return <SafeAreaView edges={['top','left','right']} style={ui.screen}>
    <Header title="Thu nhập của bạn" subtitle="Từ những chuyến giao thực tế" onBack={() => navigation.goBack()} right={<IconButton name="refresh-outline" label="Làm mới thu nhập" onPress={() => query.refetch()} />} />
    <View style={s.ranges}>{ranges.map(r => <Pressable key={r.id} accessibilityRole="tab" accessibilityState={{ selected: range === r.id }} onPress={() => setRange(r.id)} style={[s.range,range === r.id && { backgroundColor: colors.primary }]}><Text style={{ color: range === r.id ? '#fff' : colors.textSecondary,fontSize: 13,fontWeight: '600' }}>{r.label}</Text></Pressable>)}</View>
    {query.isLoading ? <Skeleton /> : query.isError ? <EmptyState title="Chưa tải được báo cáo" description="Kiểm tra kết nối và thử lại. Thu nhập chỉ hiển thị khi có dữ liệu đơn giao." retry={() => query.refetch()} /> : <LazyScrollView ref={scroll} contentContainerStyle={{ padding: 16,gap: 16,paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} />}>
      <LazySection minHeight={170}><LinearGradient colors={colors.gradientRed} style={s.hero}><Text style={s.heroLabel}>THU NHẬP · {ranges.find(r => r.id === range).label.toUpperCase()}</Text><Text style={s.heroValue}>{money}</Text><Text style={s.heroDescription}>Phí giao từ {summary.completed} đơn đã hoàn thành</Text><View style={s.heroBottom}><Text style={s.heroDescription}>Tiền thu hộ COD được quản lý riêng trong ví</Text></View></LinearGradient></LazySection>
      <LazySection minHeight={160}><View style={s.stats}>{[{ label: 'Giao thành công',value: summary.completed,color: colors.success },{ label: 'Giao thất bại',value: summary.failed,color: colors.danger },{ label: 'Tỷ lệ thành công',value: summary.success_rate == null ? '—' : `${summary.success_rate}%`,color: colors.text },{ label: 'Thời gian giao TB',value: summary.avg_delivery_time == null ? '—' : `${summary.avg_delivery_time} phút`,color: colors.text }].map(stat => <View key={stat.label} style={s.stat}><Text style={[s.statValue,{ color: stat.color }]}>{stat.value}</Text><Text style={ui.caption}>{stat.label}</Text></View>)}</View></LazySection>
      <View onLayout={e => setHistoryY(e.nativeEvent.layout.y)} style={ui.card}><Text style={[ui.heading,{ marginBottom: 12 }]}>Các chuyến trong kỳ · {deliveries.length}</Text>{!deliveries.length ? <EmptyState title="Chưa có chuyến giao" description="Các đơn giao trong khoảng thời gian đã chọn sẽ được cập nhật ở đây." /> : paging.items.map(d => <Reveal key={d.id}><Pressable accessibilityRole="button" onPress={() => navigation.navigate('OrderDetail',{ deliveryId: d.id })} style={s.delivery}><View style={{ flex: 1,minWidth: 0 }}><Text style={s.deliveryTitle}>#{String(d.ma_don_hang || d.id).slice(0,8).toUpperCase()}</Text><Text style={ui.caption} numberOfLines={1}>{d.delivery_address || 'Chưa cập nhật địa chỉ'}</Text><Text style={ui.caption}>{formatDateTime(d.delivered_at || d.updated_at)}</Text><Text style={[ui.caption,{ color: d.status === 'DELIVERED' ? colors.success : colors.textSecondary }]}>{deliveryStatusLabels[d.status] || d.status}</Text></View><Text style={s.fee}>{d.status === 'DELIVERED' && d.delivery_fee != null ? `+${formatCurrency(d.delivery_fee)}` : '—'}</Text></Pressable></Reveal>)}<Pagination page={paging.page} pages={paging.pages} total={paging.total} onChange={page => { paging.setPage(page); scroll.current?.scrollTo({ y: historyY,animated: false }) }} /></View>
    </LazyScrollView>}
  </SafeAreaView>
}
const s = StyleSheet.create({
  ranges: { flexDirection: 'row',padding: 12,gap: 6,backgroundColor: '#fff' },range: { flex: 1,alignItems: 'center',paddingVertical: 12,borderRadius: 12,backgroundColor: colors.bg },hero: { padding: 24,borderRadius: 22 },heroLabel: { color: '#f1c9ce',fontSize: 11,letterSpacing: 1,fontWeight: '600' },heroValue: { color: '#fff',fontSize: 30,fontWeight: '700',marginVertical: 12 },heroDescription: { color: '#f7e1e4',fontSize: 12,lineHeight: 19 },heroBottom: { borderTopWidth: 1,borderColor: '#ffffff25',marginTop: 16,paddingTop: 12 },stats: { flexDirection: 'row',flexWrap: 'wrap',gap: 12 },stat: { width: '47%',padding: 16,backgroundColor: '#fff',borderRadius: 16,borderWidth: 1,borderColor: '#e9ecf0' },statValue: { fontSize: 24,fontWeight: '700',marginBottom: 5 },delivery: { flexDirection: 'row',alignItems: 'center',gap: 10,paddingVertical: 14,borderBottomWidth: 1,borderColor: '#eef0f3' },deliveryTitle: { fontSize: 13,fontWeight: '700',color: colors.text,marginBottom: 4 },fee: { fontSize: 13,fontWeight: '700',color: colors.success },
})
