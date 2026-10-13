import Pagination, { usePagination } from '../components/Pagination'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Pressable, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import ScreenHeader from '../components/ScreenHeader'
import Image from '../components/CachedImage'
import { LazyScrollView, LazySection } from '../components/LazyScrollView'
import { ReviewPanel, ReviewEditor } from '../components/Reviews'
import { ProductDetailModal } from './MenuScreen'
import { useUser } from '../context/UserContext'
import { useCart } from '../hooks/useCart'
import { useFeedback } from '../context/FeedbackContext'
import { getUserId, normalizeProduct, normalizeOrder, safeArray, formatCurrency, formatDateTime } from '../lib/customerData'
import { catalogVariantRows, variantMap } from '../lib/productOptions.mjs'
import api from '../lib/apiClient'
import { colors } from '../theme'

export function ProductDetailScreen({ route, navigation }) {
  const id = String(route.params?.productId || ''), { user } = useUser(), userId = getUserId(user), cart = useCart(), notify = useFeedback(), scroll = useRef(null)
  const [adding, setAdding] = useState(false), [review, setReview] = useState(null)
  const productQuery = useQuery({ queryKey: ['customer', 'product', id], queryFn: async () => normalizeProduct(await api.get(`/menu/san-pham/${encodeURIComponent(id)}`)), enabled: Boolean(id), staleTime: 30000 })
  const catalog = useQuery({ queryKey: ['customer', 'menu-products-all'], queryFn: async () => safeArray(await api.get('/menu/san-pham')).map(normalizeProduct), staleTime: 60000 })
  const orders = useQuery({ queryKey: ['customer', 'orders', userId, 'product-reviews', id], queryFn: async () => safeArray(await api.get(`/customers/${userId}/orders?status=HOAN_THANH&limit=100&q=${encodeURIComponent(id)}`)).map(normalizeOrder), enabled: Boolean(userId), staleTime: 30000 })
  const product = productQuery.data
  const eligible = (orders.data || []).filter(o => o.trang_thai_don_hang === 'HOAN_THANH' && o.chi_tiet.some(line => String(line.ma_san_pham) === id))
  const reviewOrders = usePagination(eligible, `${userId}:${id}`)
  const variants = useMemo(() => variantMap(catalogVariantRows(product ? [product] : [])), [product])
  const related = (catalog.data || []).filter(p => String(p.ma_san_pham) !== id && String(p.danh_muc_id) === String(product?.danh_muc_id) && p.trang_thai).slice(0, 4)
  useEffect(() => { setAdding(false); setReview(null); scroll.current?.scrollTo({ y: 0, animated: false }) }, [id])
  const add = async (item, quantity, size, options) => {
    await cart.add(item, quantity, { size, toppings: options.toppings || [], luong_da: options.luongDa || '', do_ngot: options.doNgot || '', loai_sua: options.loaiSua || '', custom_attributes: { ...(options.custom_attributes || {}), ghi_chu: options.note || '' } })
    notify(`Đã thêm ${quantity} ${item.ten_san_pham} vào giỏ hàng`)
  }
  return <View style={{ flex: 1, backgroundColor: '#fff' }}>
    <ScreenHeader title="Chi tiết sản phẩm" onBack={() => navigation.goBack()} right={<Pressable onPress={() => navigation.navigate('Cart')} accessibilityLabel={`Giỏ hàng: ${cart.count} món`} style={{ padding: 8 }}><Ionicons name="bag-outline" size={24} />{!!cart.count && <Text style={{ color: colors.primary, fontSize: 11, textAlign: 'center' }}>{cart.count}</Text>}</Pressable>} />
    {productQuery.isPending ? <ActivityIndicator color={colors.primary} style={{ margin: 32 }} /> : productQuery.isError ? <Pressable onPress={() => productQuery.refetch()} style={{ padding: 24 }}><Text>Chưa tải được món. Chạm để thử lại.</Text></Pressable> : product && <>
      <LazyScrollView ref={scroll} key={id} contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 24 }}>
        <Image source={{ uri: product.hinh_anh_url }} style={{ width: '100%', aspectRatio: 1, borderRadius: 14, backgroundColor: '#f8f7f4' }} resizeMode="contain" />
        <View style={{ gap: 9 }}><Text style={{ color: colors.muted, fontSize: 12 }}>{product.danh_muc}</Text><Text style={{ fontSize: 24, fontWeight: '700', lineHeight: 31 }}>{product.ten_san_pham}</Text><Text style={{ color: product.trang_thai ? '#16784a' : colors.primary }}>{product.trang_thai ? 'Đang bán' : 'Tạm hết món'}</Text><Text style={{ fontSize: 24, color: colors.primary, fontWeight: '700' }}>{formatCurrency(product.gia_ban)}</Text></View>
        <View style={{ gap: 10 }}><Text style={{ fontSize: 18, fontWeight: '600' }}>Về món này</Text><Text style={{ fontSize: 14, lineHeight: 23, color: colors.text }}>{product.mo_ta || 'Cửa hàng chưa cập nhật mô tả cho món này.'}</Text>{!!Object.keys(variants[id]?.sizes || {}).length && <Text style={{ color: colors.muted, lineHeight: 22 }}>Kích cỡ: {Object.keys(variants[id].sizes).join(' · ')}</Text>}</View>
        <LazySection minHeight={220}><ReviewPanel id={id} /></LazySection>
        <LazySection minHeight={150}><View style={{ gap: 10 }}><Text style={{ fontSize: 17, fontWeight: '600' }}>Chia sẻ trải nghiệm</Text>{!userId ? <Pressable onPress={() => navigation.navigate('Login')}><Text style={{ color: colors.primary }}>Đăng nhập để đánh giá món đã mua</Text></Pressable> : orders.isPending ? <ActivityIndicator color={colors.primary} /> : orders.isError ? <Pressable onPress={() => orders.refetch()}><Text>Chưa tải được đơn đã mua. Thử lại</Text></Pressable> : !eligible.length ? <Text style={{ color: colors.muted, lineHeight: 21 }}>Bạn có thể đánh giá sau khi đơn có món này hoàn thành.</Text> : reviewOrders.items.map(o => <Pressable key={o.ma_don_hang} onPress={() => setReview({ type: 'product', id, name: product.ten_san_pham, order: o })} style={{ borderWidth: 1, borderColor: '#eee', padding: 12, borderRadius: 8 }}><Text style={{ color: colors.primary }}>Đánh giá đơn #{o.ma_don_hang.slice(0,8)}</Text><Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>{formatDateTime(o.ngay_tao)}</Text></Pressable>)}<Pagination {...reviewOrders} onChange={reviewOrders.setPage} /></View></LazySection>
        {!!related.length && <LazySection minHeight={180}><Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Cùng danh mục</Text>{related.map(p => <Pressable key={p.id} onPress={() => navigation.navigate('ProductDetail', { productId: p.ma_san_pham })} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10 }}><Image source={{ uri: p.hinh_anh_url }} style={{ width: 64, height: 64, borderRadius: 8 }} /><View style={{ flex: 1 }}><Text style={{ fontWeight: '600' }}>{p.ten_san_pham}</Text><Text style={{ color: colors.primary, marginTop: 5 }}>{formatCurrency(p.gia_ban)}</Text></View><Ionicons name="chevron-forward" size={18} /></Pressable>)}</LazySection>}
      </LazyScrollView>
      <Pressable disabled={!product.trang_thai || cart.busy} onPress={() => setAdding(true)} style={{ margin: 12, padding: 15, borderRadius: 12, backgroundColor: colors.primary, opacity: !product.trang_thai || cart.busy ? .5 : 1, alignItems: 'center' }}><Text style={{ color: '#fff', fontWeight: '600' }}>{product.trang_thai ? 'Chọn món · Thêm vào giỏ' : 'Tạm hết món'}</Text></Pressable>
    </>}
    {adding && product && <ProductDetailModal product={product} visible onClose={() => setAdding(false)} onAddToCart={add} userId={userId} allProducts={catalog.data || []} varMap={variants} optionsReady={productQuery.isSuccess} onRetryOptions={() => productQuery.refetch()} />}
    {review && <ReviewEditor key={`${review.id}:${review.order.ma_don_hang}`} target={review} onClose={() => setReview(null)} />}
  </View>
}
