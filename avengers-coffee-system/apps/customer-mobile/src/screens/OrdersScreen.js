import TextInput from '../components/TextInput'
import React, { useEffect, useRef, useState } from 'react'
import { View, Text, FlatList, Pressable,  ScrollView, ActivityIndicator, Linking, StyleSheet } from 'react-native'
import { useIsFocused } from '@react-navigation/native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import ScreenHeader from '../components/ScreenHeader'
import OrderActionsSheet from '../components/OrderActionsSheet'
import DeliveryMap from '../components/DeliveryMap'
import Image from '../components/CachedImage'
import Pagination, { PAGE_SIZE } from '../components/Pagination'
import Reveal, { useListReveal } from '../components/Reveal'
import { LazyScrollView, LazySection } from '../components/LazyScrollView'
import { ReviewEditor } from '../components/Reviews'
import { OrderDetailSkeleton, SkeletonBlock } from '../components/common/Skeleton'
import useDeliveryTracking from '../hooks/useDeliveryTracking'
import { useUser } from '../context/UserContext'
import { useFeedback, errorMessage } from '../context/FeedbackContext'
import api from '../lib/apiClient'
import Alert from '../lib/alert'
import { formatAddress } from '../lib/addressContract.mjs'
import { canCancelOrder, formatCurrency, formatDateTime, getUserId, normalizeOrder, orderStatusLabels, paymentStatusLabels, paymentMethodLabels, safeArray } from '../lib/customerData'
import { colors } from '../theme'

const steps = ['MOI_TAO','DA_XAC_NHAN','DANG_CHUAN_BI','DANG_GIAO','HOAN_THANH']
function Button({ children, onPress, disabled, filled = false }) { return <Pressable disabled={disabled} onPress={onPress} style={[s.button, filled && { backgroundColor: colors.primary }, disabled && { opacity: .4 }]}><Text style={{ color: filled ? '#fff' : colors.primary, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>{children}</Text></Pressable> }
function Field({ label, value }) { return value == null || value === '' ? null : <View style={{ gap: 5, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f0f0f0' }}><Text style={s.meta}>{label}</Text><Text style={{ color: colors.text, fontSize: 14, lineHeight: 22 }}>{value}</Text></View> }
function Journey({ order, timeline }) {
  const current = steps.indexOf(order.trang_thai_don_hang)
  return <View style={s.section}><Text style={s.heading}>Hành trình đơn hàng</Text>{order.trang_thai_don_hang === 'DA_HUY' ? <Text style={{ color: colors.primary }}>Đơn đã hủy</Text> : (timeline?.length ? timeline : steps.map(key => ({ key, label: orderStatusLabels[key] }))).map((step, i, all) => {
    const active = i === current, done = current >= 0 ? i < current || order.trang_thai_don_hang === 'HOAN_THANH' : Boolean(step.completed)
    return <View key={step.key} style={{ flexDirection: 'row', gap: 12 }}><View style={{ alignItems: 'center', width: 28 }}><View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: done ? colors.primary : active ? '#f8eeee' : '#f3f3f3', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={done ? 'checkmark' : active ? 'time-outline' : 'ellipse-outline'} size={15} color={done ? '#fff' : active ? colors.primary : '#bbb'} /></View>{i < all.length-1 && <View style={{ width: 1, flex: 1, minHeight: 16, backgroundColor: done ? colors.primary : '#eee' }} />}</View><View style={{ flex: 1, paddingBottom: 18, gap: 3 }}><Text style={{ fontSize: 14, fontWeight: active ? '700' : '500', color: done || active ? colors.text : colors.muted }}>{step.label || orderStatusLabels[step.key]}</Text>{step.time && <Text style={s.meta}>{formatDateTime(step.time)}</Text>}{active && !['HOAN_THANH','DA_HUY'].includes(order.trang_thai_don_hang) && <Text style={{ fontSize: 11, color: colors.primary }}>Đang thực hiện</Text>}</View></View>
  })}</View>
}
function TrackingView({ order, onBack, onDetails }) {
  const focused = useIsFocused(), state = useDeliveryTracking(order.ma_don_hang, focused)
  const delivery = state.data, current = { ...order, ...delivery?.order }
  current.dia_chi_giao_hang = formatAddress(current.dia_chi_giao_hang)
  const phone = delivery?.shipper?.so_dien_thoai || delivery?.shipper?.phone || delivery?.shipper_phone
  return <View style={s.screen}><ScreenHeader title="Theo dõi đơn hàng" onBack={onBack} right={<Pressable disabled={state.loading || state.refreshing} accessibilityLabel="Cập nhật hành trình" onPress={state.refresh} style={{ padding: 10 }}>{state.refreshing ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="refresh-outline" size={22} color={colors.primary} />}</Pressable>} />
    <LazyScrollView contentContainerStyle={s.body}>
      <View style={s.summary}><Text style={s.heading}>{orderStatusLabels[current.trang_thai_don_hang] || 'Đang cập nhật'}</Text><Text style={s.meta}>#{order.ma_don_hang}</Text><Text style={s.meta}>{state.live ? 'GPS trực tiếp · ' : ''}{state.receivedAt ? `Cập nhật ${new Date(state.receivedAt).toLocaleTimeString('vi-VN')}` : 'Đang kết nối hệ thống'}</Text></View>
      {state.error && <Text accessibilityRole="alert" style={{ color: colors.primary, lineHeight: 21 }}>{state.error}{delivery ? ' Đang hiển thị lần cập nhật trước.' : ''}</Text>}
      {state.loading ? <OrderDetailSkeleton /> : <DeliveryMap key={order.ma_don_hang} delivery={delivery} />}
      {!!delivery?.tracking?.estimated_minutes && !['HOAN_THANH','DA_HUY'].includes(current.trang_thai_don_hang) && <Text style={s.meta}>Thời gian dự kiến của đơn: {delivery.tracking.estimated_minutes} phút</Text>}
      {delivery?.shipper && <View style={s.section}><Text style={s.heading}>{delivery.shipper.full_name || delivery.shipper.ho_ten || delivery.shipper.name || 'Shipper giao hàng'}</Text>{phone && <Button onPress={() => Linking.openURL(`tel:${String(phone).replace(/[^+0-9]/g,'')}`)}>Gọi shipper · {phone}</Button>}</View>}
      <LazySection minHeight={290}><Journey order={current} timeline={delivery?.timeline} /></LazySection>
      <LazySection minHeight={160}><View style={s.section}><Field label="Cửa hàng phục vụ" value={delivery?.tracking?.branch_name} /><Field label="Địa chỉ nhận món" value={current.dia_chi_giao_hang} />{delivery?.tracking?.branch_phone && <Button onPress={() => Linking.openURL(`tel:${delivery.tracking.branch_phone}`)}>Gọi cửa hàng</Button>}<Button onPress={onDetails}>Xem thông tin và đánh giá đơn</Button></View></LazySection>
      {delivery?.shipper_delivery?.proof_image_url && <LazySection minHeight={200}><View style={s.section}><Text style={s.heading}>Ảnh giao hàng</Text><Image source={{ uri: delivery.shipper_delivery.proof_image_url }} style={{ width: '100%', aspectRatio: 4/3, borderRadius: 10 }} resizeMode="cover" /></View></LazySection>}
    </LazyScrollView>
  </View>
}
function OrderDetails({ order: snapshot, userId, navigation, onBack, onTrack, onAction, onCancel }) {
  const focused = useIsFocused(), [review, setReview] = useState(null)
  const details = useQuery({ queryKey: ['customer','order-detail',userId,snapshot.ma_don_hang], queryFn: () => api.get(`/customers/${userId}/orders/${snapshot.ma_don_hang}`), enabled: focused && Boolean(userId), staleTime: 0, refetchInterval: query => ['HOAN_THANH','DA_HUY'].includes(query.state.data?.order?.trang_thai_don_hang) ? false : 15000 })
  const order = normalizeOrder(details.data?.order || snapshot), completed = order.trang_thai_don_hang === 'HOAN_THANH'
  const delivery = useQuery({ queryKey: ['customer','order-delivery',userId,order.ma_don_hang], queryFn: () => api.get(`/shippers/delivery/tracking/${order.ma_don_hang}`), enabled: focused && completed, staleTime: 30000, retry: false })
  const branch = order.co_so_ma || order.ma_chi_nhanh || delivery.data?.tracking?.branch_code
  const branches = useQuery({ queryKey: ['public-branches'], queryFn: () => api.get('/users/branches/public'), enabled: focused && Boolean(branch), staleTime: 60000 })
  const branchData = safeArray(branches.data).find(b => String(b.ma_chi_nhanh || b.co_so_ma || b.branch_code || b.id) === String(branch))
  const branchName = delivery.data?.tracking?.branch_name || order.co_so_ten || order.ten_chi_nhanh || branchData?.ten_chi_nhanh || 'Đang cập nhật cửa hàng'
  const products = [...new Map(order.chi_tiet.filter(i => i.ma_san_pham).map(i => [String(i.ma_san_pham),i])).values()]
  return <View style={s.screen}><ScreenHeader title="Chi tiết đơn hàng" onBack={onBack} /><LazyScrollView contentContainerStyle={s.body}>
    <View style={s.summary}><Text style={s.heading}>{orderStatusLabels[order.trang_thai_don_hang] || 'Đang cập nhật'}</Text><Text selectable style={s.meta}>#{order.ma_don_hang}</Text><Text style={s.meta}>{formatDateTime(order.ngay_tao)}</Text></View>
    {details.isFetching && <ActivityIndicator color={colors.primary} />}{details.isError && <Button onPress={() => details.refetch()}>Chưa tải được chi tiết mới nhất · Thử lại</Button>}
    <View style={s.section}><Text style={s.heading}>Thông tin nhận món</Text><Field label="Cửa hàng" value={branchName} /><Field label="Cách nhận món" value={({ GIAO_TAN_NOI: 'Giao tận nơi', MANG_DI: 'Lấy tại quán', TAI_CHO: 'Dùng tại chỗ', LAY_TAI_QUAN: 'Lấy tại quán', DUNG_TAI_CHO: 'Dùng tại chỗ' })[order.loai_don_hang] || delivery.data?.tracking?.delivery_mode && ({ DELIVERY: 'Giao tận nơi', PICKUP: 'Lấy tại quán', DINE_IN: 'Dùng tại chỗ' })[delivery.data.tracking.delivery_mode]} /><Field label="Địa chỉ" value={order.dia_chi_giao_hang} /><Field label="Khung giờ" value={order.khung_gio_giao} /><Field label="Bàn" value={order.ma_ban} /><Field label="Ghi chú" value={order.ghi_chu} /></View>
    <View style={s.section}><Text style={s.heading}>Món đã đặt · {order.chi_tiet.reduce((sum,i) => sum+i.so_luong,0)}</Text>{order.chi_tiet.map((item,i) => <Pressable key={item.id || i} disabled={!item.ma_san_pham} accessibilityLabel={`Chi tiết ${item.ten_san_pham}`} onPress={() => navigation.navigate('ProductDetail',{ productId: item.ma_san_pham })} style={s.product}><Image source={{ uri: item.hinh_anh_url }} style={{ width: 64, height: 64, borderRadius: 8 }} resizeMode="contain" /><View style={{ flex: 1, gap: 4 }}><Text style={{ fontWeight: '600', lineHeight: 21 }}>{item.ten_san_pham}</Text><Text style={s.meta}>{[item.kich_co,...(item.toppings || []).map(t => typeof t === 'string' ? t : t.name || t.ten_topping),item.luong_da ? `Đá: ${item.luong_da}` : '',item.do_ngot ? `Ngọt: ${item.do_ngot}` : '',item.loai_sua].filter(Boolean).join(' · ')}</Text>{!!item.ghi_chu && <Text style={s.meta}>{item.ghi_chu}</Text>}<Text style={{ color: colors.primary, fontWeight: '600' }}>×{item.so_luong} · {formatCurrency(item.gia_ban*item.so_luong)}</Text></View></Pressable>)}</View>
    <LazySection minHeight={220}><View style={s.section}><Text style={s.heading}>Thanh toán</Text><Field label="Phương thức" value={paymentMethodLabels[order.phuong_thuc_thanh_toan] || 'Chưa cập nhật'} /><Field label="Trạng thái" value={paymentStatusLabels[order.trang_thai_thanh_toan] || 'Chưa cập nhật'} /><Field label="Mã ưu đãi" value={order.ma_voucher} />{order.so_tien_giam > 0 && <Field label="Đã giảm" value={formatCurrency(order.so_tien_giam)} />}{order.phi_giao_hang != null && <Field label="Phí giao hàng" value={formatCurrency(order.phi_giao_hang)} />}<Text style={{ fontSize: 24, fontWeight: '700', color: colors.primary, marginTop: 12 }}>{formatCurrency(order.tong_tien)}</Text><Text style={s.meta}>Tổng thanh toán</Text></View></LazySection>
    <LazySection minHeight={200}><Journey order={order} /></LazySection>
    {delivery.data?.shipper_delivery?.proof_image_url && <LazySection minHeight={200}><View style={s.section}><Text style={s.heading}>Ảnh giao hàng</Text><Image source={{ uri: delivery.data.shipper_delivery.proof_image_url }} style={{ width: '100%', aspectRatio: 4/3, borderRadius: 10 }} resizeMode="cover" /></View></LazySection>}
    {completed && <LazySection minHeight={200}><View style={s.section}><Text style={s.heading}>Đánh giá trải nghiệm</Text>{products.map(item => <Button key={item.ma_san_pham} onPress={() => setReview({ type: 'product', id: item.ma_san_pham, name: item.ten_san_pham, order })}>Đánh giá · {item.ten_san_pham}</Button>)}{branch && <Button onPress={() => setReview({ type: 'branch', id: branch, name: branchName, order })}>Đánh giá cửa hàng</Button>}{delivery.isPending ? <ActivityIndicator color={colors.primary} /> : delivery.isError ? <Button onPress={() => delivery.refetch()}>Kiểm tra thông tin shipper · Thử lại</Button> : delivery.data?.shipper_delivery?.status === 'DELIVERED' && delivery.data?.shipper && <Button onPress={() => setReview({ type: 'shipper', id: order.ma_don_hang, name: delivery.data.shipper.full_name || delivery.data.shipper.ho_ten || 'Shipper giao hàng', order })}>Đánh giá shipper</Button>}</View></LazySection>}
    <View style={{ gap: 10 }}><Button filled onPress={() => onTrack(order)}>Xem hành trình giao hàng</Button><Button onPress={() => onAction(order,'reorder')}>Đặt lại các món vào giỏ</Button>{details.data?.update_policy?.allowed && <Button onPress={() => onAction(order,'edit')}>Sửa đơn hàng</Button>}{canCancelOrder(order.trang_thai_don_hang) && <Button onPress={() => onCancel(order.ma_don_hang)}>Hủy đơn</Button>}</View>
  </LazyScrollView>{review && <ReviewEditor key={`${review.type}:${review.id}`} target={review} onClose={() => setReview(null)} onSaved={() => delivery.refetch()} />}</View>
}
export function OrdersScreen({ navigation }) {
  const { user } = useUser(), userId = getUserId(user), focused = useIsFocused(), client = useQueryClient(), notify = useFeedback(), list = useRef(null)
  const [status,setStatus] = useState('all'), [payment,setPayment] = useState('all'), [keyword,setKeyword] = useState(''), [search,setSearch] = useState(''), [view,setView] = useState(null), [action,setAction] = useState(null)
  useEffect(() => { setView(null); setAction(null) }, [userId])
  const [page,setPage] = useState(1)
  useEffect(() => { setPage(1); list.current?.scrollToOffset({ offset: 0, animated: false }) }, [userId,status,search,payment])
  const query = useQuery({ queryKey: ['customer','orders',userId,status,search,payment,page], enabled: Boolean(userId) && focused && !view, staleTime: 30000, queryFn: async () => { const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) }); if (status !== 'all') params.set('status',status); if (payment !== 'all') params.set('payment_status',payment); if (search) params.set('q',search); const data = await api.get(`/customers/${userId}/orders?${params}`); return { total: data.total, orders: safeArray(data).map(normalizeOrder) } } })
  const total = Number(query.data?.total || 0), paging = { page, pages: Math.max(1,Math.ceil(total/PAGE_SIZE)), total, items: query.data?.orders || [] }, reveal = useListReveal()
  const cancel = useMutation({ mutationFn: id => api.patch(`/customers/${userId}/orders/${id}/cancel`,{ reason: 'Khách hàng hủy đơn từ ứng dụng' }), onSuccess: () => { client.invalidateQueries({ queryKey: ['customer','orders',userId] }); client.invalidateQueries({ queryKey: ['customer','order-detail',userId] }); notify('Đã hủy đơn hàng') }, onError: e => notify(errorMessage(e),'error') })
  const handleCancel = id => Alert.alert('Hủy đơn hàng','Bạn muốn hủy đơn này?', [{ text: 'Giữ đơn',style: 'cancel' },{ text: 'Hủy đơn',style: 'destructive',onPress: () => cancel.mutate(id) }])
  const onAction = (order,type) => setAction({ id: order.ma_don_hang, type })
  const changePage = page => { setPage(page); list.current?.scrollToOffset({ offset: 0, animated: false }) }
  const chips = (items,value,change) => <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingHorizontal: 12, paddingBottom: 10 }}>{items.map(([key,label]) => <Pressable key={key} onPress={() => change(key)} style={[s.chip,value === key && { backgroundColor: colors.primary }]}><Text style={{ fontSize: 12, color: value === key ? '#fff' : colors.text }}>{label}</Text></Pressable>)}</ScrollView>
  return <View style={s.screen}>
    {view?.type === 'tracking' ? <TrackingView order={view.order} onBack={() => setView(null)} onDetails={() => setView({ ...view,type: 'detail' })} /> : view?.type === 'detail' ? <OrderDetails key={`${userId}:${view.order.ma_don_hang}`} userId={userId} order={view.order} navigation={navigation} onBack={() => setView(null)} onTrack={order => setView({ order,type: 'tracking' })} onAction={onAction} onCancel={handleCancel} /> : <>
      <ScreenHeader title="Đơn hàng của tôi" onBack={() => navigation.goBack()} />
      <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}><TextInput accessibilityLabel="Tìm mã đơn hoặc tên món" value={keyword} onChangeText={setKeyword} placeholder="Tìm mã đơn, tên món" returnKeyType="search" onSubmitEditing={() => setSearch(keyword.trim())} style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, minWidth: 0 }} /><Pressable accessibilityLabel="Tìm đơn hàng" onPress={() => setSearch(keyword.trim())} style={{ backgroundColor: colors.primary, borderRadius: 8, padding: 12 }}><Ionicons name="search" size={20} color="#fff" /></Pressable></View>
      <View style={{ flexShrink: 0 }}>{chips([['all','Tất cả thanh toán'],...Object.entries(paymentStatusLabels)],payment,setPayment)}{chips([['all','Tất cả đơn'],...Object.entries(orderStatusLabels)],status,setStatus)}</View>
      {!userId ? <Button onPress={() => navigation.navigate('Login')}>Đăng nhập để xem đơn hàng của bạn</Button> : query.isError ? <Button onPress={() => query.refetch()}>Chưa tải được đơn hàng · Thử lại</Button> : query.isPending ? (
        <View style={{ padding: 12, gap: 12 }}>
          {Array.from({ length: 3 }, (_, i) => (
            <View key={i} style={s.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <SkeletonBlock width={120} height={18} borderRadius={6} />
                <SkeletonBlock width={80} height={20} borderRadius={10} />
              </View>
              <SkeletonBlock width="80%" height={14} borderRadius={4} style={{ marginBottom: 8 }} />
              <SkeletonBlock width="50%" height={12} borderRadius={4} style={{ marginBottom: 14 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <SkeletonBlock width={90} height={20} borderRadius={6} />
                <SkeletonBlock width={100} height={34} borderRadius={8} />
              </View>
            </View>
          ))}
        </View>
      ) : <FlatList ref={list} data={paging.items} keyExtractor={item => item.id} onViewableItemsChanged={reveal.onViewableItemsChanged} viewabilityConfig={reveal.viewabilityConfig} contentContainerStyle={{ padding: 12, gap: 12 }} initialNumToRender={4} windowSize={5} onRefresh={() => query.refetch()} refreshing={query.isFetching} ListEmptyComponent={<Text style={{ padding: 24, color: colors.muted }}>Chưa có đơn phù hợp với bộ lọc.</Text>} renderItem={({ item }) => <Reveal visible={reveal.visible.has(item.id)}><View style={s.card}>
        <Pressable onPress={() => setView({ order: item,type: 'detail' })} accessibilityLabel={`Chi tiết đơn ${item.ma_don_hang}`}><View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}><View style={{ flex: 1 }}><Text style={{ fontWeight: '700', fontSize: 15 }}>Đơn #{item.ma_don_hang.slice(0,8)}</Text><Text style={[s.meta,{ marginTop: 4 }]}>{formatDateTime(item.ngay_tao)}</Text></View><Text style={{ maxWidth: '45%', fontSize: 11, color: colors.primary, backgroundColor: '#f8eeee', padding: 7, borderRadius: 6 }}>{orderStatusLabels[item.trang_thai_don_hang] || 'Đang cập nhật'}</Text></View><Text numberOfLines={2} style={[s.meta,{ marginVertical: 12 }]}>{item.dia_chi_giao_hang || item.co_so_ten || 'Xem thông tin nhận món'}</Text><Text style={s.meta}>{item.chi_tiet.reduce((sum,i) => sum+i.so_luong,0)} món · {paymentStatusLabels[item.trang_thai_thanh_toan] || 'Chưa cập nhật thanh toán'}</Text><Text style={{ fontSize: 21, color: colors.primary, fontWeight: '700', marginVertical: 12 }}>{formatCurrency(item.tong_tien)}</Text></Pressable>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}><Button onPress={() => setView({ order: item,type: 'tracking' })}>Tra cứu đơn hàng</Button><Button onPress={() => setView({ order: item,type: 'detail' })}>{item.trang_thai_don_hang === 'HOAN_THANH' ? 'Chi tiết & đánh giá' : 'Chi tiết'}</Button>{canCancelOrder(item.trang_thai_don_hang) && <Button disabled={cancel.isPending} onPress={() => handleCancel(item.ma_don_hang)}>Hủy đơn</Button>}</View>
      </View></Reveal>} />}
      <Pagination {...paging} onChange={changePage} />
    </>}
    {action && <OrderActionsSheet orderId={action.id} action={action.type} userId={userId} onClose={() => { setAction(null); client.invalidateQueries({ queryKey: ['customer','order-detail',userId] }) }} onCart={() => navigation.navigate('Cart')} />}
  </View>
}
const s = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#f7f8fa' }, body: { padding: 14, paddingBottom: 24, gap: 14 }, heading: { fontSize: 17, fontWeight: '700', color: colors.text, lineHeight: 24 }, meta: { fontSize: 12, color: colors.muted, lineHeight: 19 }, summary: { backgroundColor: '#f8eeee', borderRadius: 12, padding: 16, gap: 8 }, section: { backgroundColor: '#fff', padding: 16, borderRadius: 12, gap: 10 }, card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#eee', padding: 16 }, button: { paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: '#dbb5b8', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, product: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' }, chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 18, backgroundColor: '#ededee' } })
