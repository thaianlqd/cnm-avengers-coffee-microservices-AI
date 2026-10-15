import React, { useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useIsFocused } from '@react-navigation/native'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { deliveryArray } from '../lib/deliverySummary.mjs'
import { formatCurrency } from '../lib/shipperData'
import { LazyScrollView } from '../components/LazyScrollView'
import { Header, Button, Skeleton, EmptyState, ui } from '../components/Experience'
import OrderRouteCard from '../components/OrderRouteCard'
import { colors } from '../theme'

// Available orders have order IDs. A delivery ID exists only after acceptance.
export default function AvailableOrderDetail({ route, navigation }) {
  const orderId = route.params.orderId, { shipper } = useShipper(), client = useQueryClient(), focused = useIsFocused()
  const [feedback,setFeedback] = useState('')
  const query = useQuery({ queryKey:['availableOrderDetail',shipper?.id,orderId],enabled:focused && !!shipper?.id,
    queryFn:async () => {
      const pool = deliveryArray(await apiClient.get('/shippers/available-orders',{params:{shipper_id:shipper.id}}))
      const order = pool.find(row => (row.ma_don_hang || row.id) === orderId)
      if (!order) throw new Error('Đơn này không còn trong danh sách có thể nhận. Quay lại và làm mới danh sách nhé.')
      return order
    },retry:false,
  })
  const accept = useMutation({mutationFn:() => {setFeedback('');return apiClient.post(`/shippers/${shipper.id}/accept/${orderId}`)},
    onSuccess:res => {
      client.invalidateQueries({queryKey:['availableOrders']});client.invalidateQueries({queryKey:['acceptedOrders']});client.invalidateQueries({queryKey:['shipperStats',shipper.id]})
      if (!res?.delivery?.id) {setFeedback('Đơn đã nhận. Mở tab Đang giao để xem chuyến mới.');return}
      navigation.navigate('OrderDetail',{deliveryId:res.delivery.id,orderId:null})
    },onError:error => setFeedback(error.response?.data?.message || 'Chưa nhận được đơn. Bạn làm mới danh sách rồi thử lại nhé.'),
  })
  const order = query.data, online = shipper?.status === 'ACTIVE'
  return <SafeAreaView edges={['top','left','right']} style={ui.screen}><Header title="Chi tiết đơn mới" subtitle={'#'+String(orderId).slice(0,8).toUpperCase()} onBack={() => navigation.goBack()} />
    {query.isLoading ? <Skeleton count={2} /> : query.isError ? <EmptyState title="Đơn chưa sẵn sàng để nhận" description={query.error?.response ? 'Không tải được thông tin đơn. Kiểm tra kết nối rồi thử lại.' : query.error?.message} retry={() => query.refetch()} /> : order && <>
      <LazyScrollView contentContainerStyle={s.body}>
        <View style={s.orderSummary}><View><Text style={s.eyebrow}>ĐƠN GIAO TỪ CỬA HÀNG</Text><Text style={s.orderCode}>#{String(orderId).slice(0,8).toUpperCase()}</Text></View><View style={s.badge}><Text style={s.badgeText}>Chờ nhận đơn</Text></View></View>
        <OrderRouteCard order={order} />
        <View style={s.items}><Text style={s.sectionTitle}>Món cần giao</Text>{(order.items || []).map((item,index)=><View key={index} style={s.item}><View style={s.qty}><Text style={s.qtyText}>{item.so_luong}×</Text></View><Text style={s.itemName}>{item.ten_san_pham}{item.kich_co ? ` · ${item.kich_co}` : ''}</Text><Text style={s.itemPrice}>{item.gia_ban != null ? formatCurrency(item.gia_ban) : ''}</Text></View>)}<View style={s.cod}><Text style={s.itemName}>Thu hộ khách (COD)</Text><Text style={s.codValue}>{order.cod_amount != null ? formatCurrency(order.cod_amount) : 'Chưa cập nhật'}</Text></View></View>
        {!online && <Text style={s.notice}>Bạn đang ngoại tuyến. Bật Sẵn sàng nhận đơn tại Công việc để nhận đơn này.</Text>}
        {feedback !== '' && <Text accessibilityRole="alert" style={s.notice}>{Array.isArray(feedback)?feedback.join(' '):feedback}</Text>}
      </LazyScrollView>
      <View style={s.actionBar}><View><Text style={s.eyebrow}>PHÍ GIAO CỦA BẠN</Text><Text style={s.fee}>{order.delivery_fee != null ? formatCurrency(order.delivery_fee) : 'Chưa cập nhật'}</Text></View><View style={{flex:1}}><Button label="Nhận đơn này" icon="add-outline" disabled={!online || accept.isPending} busy={accept.isPending} onPress={() => accept.mutate()} /></View></View>
    </>}

  </SafeAreaView>
}

const s=StyleSheet.create({body:{padding:16,gap:16,paddingBottom:24},orderSummary:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:4,gap:12},eyebrow:{fontSize:9,color:'#8a827e',letterSpacing:.5},orderCode:{fontSize:19,fontWeight:'700',color:'#342b28',marginTop:5},badge:{paddingHorizontal:10,paddingVertical:7,borderRadius:6,backgroundColor:'#fbe8e7'},badgeText:{fontSize:10,fontWeight:'600',color:'#b52b3b'},items:{padding:16,borderRadius:16,borderWidth:1,borderColor:'#eee9e3',backgroundColor:'#fff'},sectionTitle:{fontSize:15,fontWeight:'700',color:'#302b2a',marginBottom:12},item:{flexDirection:'row',alignItems:'center',gap:9,paddingVertical:12,borderBottomWidth:1,borderColor:'#f4f1ed'},qty:{width:29,height:29,borderRadius:7,backgroundColor:'#f7f3ef',alignItems:'center',justifyContent:'center'},qtyText:{fontSize:11,fontWeight:'600',color:'#766b63'},itemName:{fontSize:12,lineHeight:18,color:'#4a403a',flex:1},itemPrice:{fontSize:12,color:'#7e736b'},cod:{flexDirection:'row',gap:12,alignItems:'center',paddingTop:16},codValue:{fontSize:16,fontWeight:'700',color:'#342b28'},notice:{fontSize:12,lineHeight:19,color:colors.primary,paddingHorizontal:8},actionBar:{backgroundColor:'#fff',padding:16,borderTopWidth:1,borderColor:'#eee9e3',flexDirection:'row',alignItems:'center',gap:18},fee:{fontSize:20,fontWeight:'700',color:'#208765',marginTop:5}})
