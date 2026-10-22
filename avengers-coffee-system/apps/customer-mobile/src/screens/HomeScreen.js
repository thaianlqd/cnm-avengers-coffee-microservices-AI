import TextInput from '../components/TextInput'
import React, { useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import Image from '../components/CachedImage'
import { LazyScrollView, LazySection } from '../components/LazyScrollView'
import { useUser } from '../context/UserContext'
import { useCart } from '../hooks/useCart'
import apiClient from '../lib/apiClient'
import { safeArray, normalizeProduct, normalizeCategory, normalizeNewsArticle, formatCurrency, getUserDisplayName } from '../lib/customerData'
import { LinearGradient } from 'expo-linear-gradient'
import { colors } from '../theme'
import HolidayHero from '../components/home/HolidayHero'
import { CategorySkeleton, ProductGridSkeleton, NewsCardSkeleton, SkeletonBlock } from '../components/common/Skeleton'
function Heading({ title, onPress }) { return <View style={styles.heading}><Text style={styles.headingText}>{title}</Text><Pressable onPress={onPress} hitSlop={8}><Text style={styles.link}>Xem tất cả <Ionicons name="chevron-forward" size={12} /></Text></Pressable></View> }
function QueryError({ query, label }) { return <Pressable onPress={() => query.refetch()} style={{ padding: 16 }}><Text style={styles.secondary}>{label}. Chạm để thử lại.</Text></Pressable> }
export function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets(), { user, activeUserId: userId } = useUser(), cart = useCart()
  const [newsVisible, setNewsVisible] = useState(false), [search, setSearch] = useState('')
  const products = useQuery({ queryKey: ['customer', 'menu-products-all'], queryFn: async () => safeArray(await apiClient.get('/menu/san-pham')).map(p => ({ ...normalizeProduct(p), danh_muc_id: String(p.danhMuc?.ma_danh_muc || p.danh_muc_id || ''), trang_thai: Boolean(p.trang_thai) })), staleTime: 60000 })
  const categories = useQuery({ queryKey: ['customer', 'menu-categories'], queryFn: async () => safeArray(await apiClient.get('/menu/danh-muc')).map(normalizeCategory), staleTime: 300000 })
  const loyalty = useQuery({ queryKey: ['customer', 'loyalty', userId], queryFn: () => apiClient.get(`/users/${userId}/loyalty`), enabled: Boolean(user), staleTime: 30000 })
  const membership = useQuery({ queryKey: ['membership', userId], queryFn: async () => { const data = await apiClient.get(`/users/${userId}/membership`); return data.data || data }, enabled: Boolean(user), staleTime: 10000 })
  const walletQuery = useQuery({ queryKey: ['userWallet', userId], queryFn: () => apiClient.get(`/customers/${userId}/wallet`), enabled: Boolean(user), staleTime: 10000 })
  const wallet = walletQuery.data?.data || walletQuery.data
  const recommendations = useQuery({ queryKey: ['customer', 'ai-recs-home', userId], queryFn: () => apiClient.get(`/ai/recommend/${userId}?limit=4`), staleTime: 300000, retry: false })
  const notifications = useQuery({ queryKey: ['customer', 'notifications', userId], queryFn: () => apiClient.get(`/customers/${userId}/notifications?limit=10`), enabled: Boolean(user), staleTime: 15000 })
  const news = useQuery({ queryKey: ['customer', 'news-home'], queryFn: async () => safeArray(await apiClient.get('/news?limit=3')).map(normalizeNewsArticle), enabled: newsVisible, staleTime: 60000 })
  const catalog = products.data || [], cats = categories.data || []
  const mainCategories = cats.filter(c => c.cap_bac === 1 || !c.ma_danh_muc_cha).map(c => {
    const childIds = cats.filter(k => k.ma_danh_muc_cha === c.id).map(k => k.id)
    return { ...c, image: catalog.find(p => [c.id, ...childIds].includes(p.danh_muc_id))?.hinh_anh_url }
  }).filter(c => c.image)
  const actualRecommendations = safeArray(recommendations.data).map(r => catalog.find(p => String(p.ma_san_pham) === String(r.id || r.ma_san_pham))).filter(Boolean)
  const featured = catalog.filter(p => p.la_hot || p.la_moi)
  const shown = (actualRecommendations.length ? actualRecommendations : featured.length ? featured : catalog).slice(0, 6)
  const unread = notifications.data?.unreadCount ?? safeArray(notifications.data).filter(n => !(n.da_doc ?? n.is_read)).length
  const member = membership.data
  const points = Number(member?.diem_loyalty ?? user?.loyalty_points ?? 0)
  const tiers = [...(member?.tat_ca_hang || [])].sort((a,b) => Number(a.diem) - Number(b.diem))
  const nextTier = member?.hang_hien_tai?.diem_can_len_hang != null ? tiers.find(t => Number(t.diem) === Number(member.hang_hien_tai.diem_can_len_hang)) : null
  const startPoints = Number(member?.hang_hien_tai?.diem_bat_dau_hang || 0)
  const progress = nextTier ? Math.max(0, Math.min(1, (points - startPoints) / Math.max(1, Number(nextTier.diem) - startPoints))) : 1
  const savedProfile = useQuery({ queryKey: ['customer', 'profile', userId], queryFn: () => apiClient.get(`/users/${userId}/profile`), enabled: false }).data
  const avatarUrl = savedProfile ? savedProfile.avatar_url : user?.avatar_url
  const memberAvatar = avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: 42, height: 42, borderRadius: 21 }} /> : <Text style={{ fontSize: 19, fontWeight: '600', color: colors.primary }}>{getUserDisplayName(user).trim().charAt(0).toUpperCase() || 'A'}</Text>
  const runSearch = () => navigation.navigate('Menu', { searchQuery: search.trim(), focusSearch: true })
  const openProduct = item => navigation.navigate('ProductDetail', { productId: item.ma_san_pham })
  return <View style={styles.screen}>
    <LazyScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
      <HolidayHero navigation={navigation} user={user} cartCount={cart.count} unread={unread} topInset={insets.top} />
      <View style={{ marginHorizontal: 16, marginTop: 22, marginBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><View style={{ flex: 1 }}><Text style={styles.secondary}>Chào {user ? getUserDisplayName(user) : 'bạn'},</Text><Text style={{ fontSize: 20, fontWeight: '500', marginTop: 4 }}>Hôm nay uống gì?</Text></View><Ionicons name="sparkles-outline" size={22} color="#b22830" /></View>
      {user && <Pressable accessibilityLabel="Thẻ thành viên của tôi" onPress={() => navigation.navigate('Membership')} style={{ marginHorizontal: 16, marginBottom: 12 }}>
        <LinearGradient colors={['#252525', '#101010']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 12, padding: 18, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -25, top: -30, width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: '#ae91534a' }} /><View style={{ position: 'absolute', right: -15, top: -20, width: 150, height: 150, borderRadius: 75, borderWidth: 1, borderColor: '#ae91534a' }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#f4f5f7', alignItems: 'center', justifyContent: 'center' }}>{memberAvatar}</View><View style={{ flex: 1 }}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{getUserDisplayName(user)}</Text>{membership.isPending ? <SkeletonBlock width={130} height={12} style={{ marginTop: 7, backgroundColor: '#796b61' }} /> : <Text style={{ color: '#d6bc87', fontSize: 12, marginTop: 5 }}>{membership.isError ? 'Chạm để tải lại thẻ thành viên' : `Hạng ${member?.hang_hien_tai?.ten_hang || member?.hang_hien_tai?.hang || user.membership_tier}`}</Text>}</View><Ionicons name="chevron-forward" size={18} color="#d6bc87" /></View>
          {!membership.isPending && !membership.isError && <View style={{ marginTop: 18 }}><View style={{ height: 4, borderRadius: 2, backgroundColor: '#ffffff24' }}><View style={{ height: 4, borderRadius: 2, backgroundColor: '#d6bc87', width: `${progress * 100}%` }} /></View><Text style={{ color: '#c9c9c9', fontSize: 11, marginTop: 8 }}>{points.toLocaleString('vi-VN')} điểm{nextTier ? ` / ${Number(nextTier.diem).toLocaleString('vi-VN')} điểm · Hạng ${nextTier.ten}` : tiers.length && member?.hang_hien_tai?.ma_hang === tiers[tiers.length - 1]?.ma ? ' · Hạng cao nhất' : ' · Điểm xét hạng'}</Text>{Number(member?.con_thieu_thang_nay) > 0 && <Text style={{ color: '#d6bc87', fontSize: 11, marginTop: 5 }}>Chi tiêu thêm {formatCurrency(member.con_thieu_thang_nay)} trong tháng để duy trì đặc quyền</Text>}</View>}
        </LinearGradient>
      </Pressable>}
      <View style={styles.rewards}>
        <Pressable style={styles.reward} onPress={() => navigation.navigate(user ? 'Wallet' : 'Login')}><View style={styles.rewardLabel}><Ionicons name="card-outline" size={16} color={colors.primary} /><Text style={styles.secondary}>Ví Avengers</Text><Ionicons name="chevron-forward" size={12} color="#999" /></View><Text style={styles.rewardValue}>{!user ? 'Đăng nhập' : walletQuery.isPending ? '…' : walletQuery.isError ? 'Chạm để xem' : formatCurrency(wallet?.wallet?.balance ?? wallet?.balance)}</Text></Pressable>
        <Pressable style={styles.reward} onPress={() => navigation.navigate(user ? 'Membership' : 'Login')}><View style={styles.rewardLabel}><Ionicons name="ribbon-outline" size={16} color={colors.primary} /><Text style={styles.secondary}>Điểm tích lũy</Text><Ionicons name="chevron-forward" size={12} color="#999" /></View><Text style={styles.rewardValue}>{!user ? 'Tham gia ngay' : loyalty.isPending ? '…' : loyalty.isError ? 'Chạm để xem' : Number(member?.diem_kha_dung ?? loyalty.data?.diem_kha_dung ?? loyalty.data?.diem ?? loyalty.data?.diem_hien_tai ?? 0).toLocaleString('vi-VN')}</Text></Pressable>
      </View>
      <View style={styles.search}><Ionicons name="search-outline" size={19} color="#999" /><TextInput accessibilityLabel="Tìm món trên trang chủ" placeholder="Tìm cà phê, trà và món bạn thích" value={search} onChangeText={setSearch} onSubmitEditing={runSearch} returnKeyType="search" style={{ flex: 1, minWidth: 0, fontSize: 13, paddingVertical: 2 }} /><Pressable accessibilityLabel="Tìm kiếm món" onPress={runSearch} hitSlop={8}><Ionicons name="arrow-forward" size={18} color={colors.primary} /></Pressable></View>
      {categories.isPending ? <CategorySkeleton count={5} /> : categories.isError ? <QueryError query={categories} label="Chưa tải được danh mục" /> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>{mainCategories.map(c => <Pressable key={c.id} style={styles.category} onPress={() => navigation.navigate('Menu', { categoryId: c.id })}><Image source={{ uri: c.image }} style={{ width: 58, height: 58 }} resizeMode="contain" /><Text style={styles.categoryText} numberOfLines={2}>{c.label}</Text></Pressable>)}</ScrollView>}
      <View style={styles.shortcuts}>{[{ label: 'Ưu đãi', icon: 'ticket-outline', route: 'Vouchers' }, { label: 'Đơn hàng', icon: 'receipt-outline', route: 'Orders' }, { label: 'Cửa hàng', icon: 'storefront-outline', route: 'StoresTab' }, { label: 'Thẻ quà tặng', icon: 'gift-outline', route: 'GiftCard' }].map(item => <Pressable key={item.route} style={styles.shortcut} onPress={() => navigation.navigate(item.route)}><Ionicons name={item.icon} size={22} color={colors.primary} /><Text style={styles.categoryText}>{item.label}</Text></Pressable>)}</View>
      <LazySection minHeight={490}><Heading title={recommendations.data?.is_personalized ? 'Dành riêng cho bạn' : 'Món ngon mỗi ngày'} onPress={() => navigation.navigate('Menu')} />{products.isPending ? <ProductGridSkeleton count={4} /> : products.isError ? <QueryError query={products} label="Chưa tải được thực đơn" /> : <View style={styles.productGrid}>{shown.map(item => <View key={item.id} style={styles.productCard}>
        <Pressable onPress={() => openProduct(item)} accessibilityLabel={`Chi tiết ${item.ten_san_pham}`}><Image source={{ uri: item.hinh_anh_url }} style={styles.productImage} resizeMode="contain" /><Text numberOfLines={2} style={styles.productName}>{item.ten_san_pham}</Text></Pressable>
        <View style={styles.productBottom}><Text style={styles.price}>{formatCurrency(item.gia_ban)}</Text><Pressable accessibilityLabel={`Thêm ${item.ten_san_pham}`} onPress={() => navigation.navigate('Menu', { selectedProduct: item })} style={styles.add}><Ionicons name="add" size={20} color="#fff" /></Pressable></View>
        <Pressable onPress={() => openProduct(item)}><Text style={[styles.secondary, { fontSize: 12 }]}>Chi tiết & lựa chọn</Text></Pressable>
      </View>)}</View>}</LazySection>
      <LazySection minHeight={260} onVisible={() => setNewsVisible(true)}><Heading title="Chuyện cà phê" onPress={() => navigation.navigate('News')} />{news.isPending ? <NewsCardSkeleton count={1} /> : news.isError ? <QueryError query={news} label="Chưa tải được tin tức" /> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>{(news.data || []).map(article => <Pressable key={article.id} onPress={() => navigation.navigate('News', { article })} style={{ width: 245 }}><Image source={article.image_source || { uri: article.image_url }} style={{ width: '100%', height: 138, borderRadius: 10 }} resizeMode="cover" /><Text style={{ fontWeight: '600', fontSize: 14, lineHeight: 20, marginTop: 8 }} numberOfLines={2}>{article.title}</Text></Pressable>)}</ScrollView>}</LazySection>
      <Pressable accessibilityLabel="Nhắn tin với nhân viên" onPress={() => navigation.navigate('Chat', { mode: 'staff' })} style={{ margin: 16, padding: 16, backgroundColor: '#fff5f2', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name="chatbubbles-outline" size={24} color={colors.primary} /><View style={{ flex: 1 }}><Text style={{ fontSize: 14, fontWeight: '600', color: '#352724' }}>Chúng mình luôn lắng nghe</Text><Text style={[styles.secondary, { fontSize: 12, marginTop: 4 }]}>Nhắn tin với nhân viên hoặc trợ lý AI.</Text></View><Ionicons name="arrow-forward" size={17} color={colors.primary} /></Pressable>
    </LazyScrollView>
  </View>
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' }, header: { padding: 16, paddingBottom: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }, avatar: { backgroundColor: '#f8eeee', borderRadius: 22, height: 42, width: 42, alignItems: 'center', justifyContent: 'center' },
  secondary: { color: colors.muted, fontSize: 13, lineHeight: 18 }, dot: { position: 'absolute', top: 8, right: 8, width: 7, height: 7, backgroundColor: colors.primary, borderRadius: 4 }, badge: { position: 'absolute', top: 1, right: -3, borderRadius: 10, minWidth: 18, height: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }, badgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  rewards: { flexDirection: 'row', marginHorizontal: 16, gap: 10 }, reward: { flex: 1, borderWidth: 1, borderColor: '#e8e8e8', backgroundColor: '#fafafa', padding: 12, borderRadius: 9 }, rewardLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }, rewardValue: { fontWeight: '700', fontSize: 17, color: colors.text, marginTop: 9 }, search: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#f4f4f4', borderRadius: 22, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  categories: { paddingHorizontal: 16, paddingTop: 14, gap: 10 }, category: { width: 74, alignItems: 'center', gap: 6 }, categoryText: { color: '#454545', fontSize: 11, textAlign: 'center', lineHeight: 15 }, shortcuts: { flexDirection: 'row', marginHorizontal: 16, borderBottomWidth: 1, borderColor: '#eee', marginTop: 12, paddingBottom: 14 }, shortcut: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 8 },
  heading: { paddingHorizontal: 16, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headingText: { fontSize: 19, fontWeight: '600', color: colors.text }, link: { color: colors.primary, fontSize: 12, fontWeight: '500' }, productGrid: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, productCard: { width: '48%', flexGrow: 1, flexBasis: '44%', borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 10 }, productImage: { width: '100%', aspectRatio: 1 }, productName: { fontSize: 14, fontWeight: '500', lineHeight: 20, minHeight: 40 }, productBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, gap: 4 }, price: { color: colors.primary, fontWeight: '700', fontSize: 14 }, add: { backgroundColor: colors.primary, borderRadius: 16, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
})
