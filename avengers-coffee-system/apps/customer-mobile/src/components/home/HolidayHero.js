import React, { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useIsFocused } from '@react-navigation/native'
import Image from '../CachedImage'
import AppModal from '../AppModal'

const slides = [
  { image: require('../../../assets/campaigns/home-noel.jpg'), source: 'Giáng sinh tại Highlands Coffee' },
  { image: require('../../../assets/campaigns/home-thousand.jpg'), source: 'Highlands Coffee — 1.000 cửa hàng' },
  { image: require('../../../assets/campaigns/home-matcha.jpg'), source: 'Matcha Highlands Coffee' },
  { image: require('../../../assets/campaigns/home-store.jpg'), source: 'Không gian Highlands Coffee' },
]
const links = [
  ['Thực đơn', 'cafe-outline', 'Menu'], ['Đơn hàng của tôi', 'receipt-outline', 'Orders'],
  ['Trò chuyện', 'chatbubbles-outline', 'Chat'], ['Ưu đãi', 'ticket-outline', 'Vouchers'],
  ['Cửa hàng', 'storefront-outline', 'StoresTab'], ['Thẻ thành viên', 'ribbon-outline', 'Membership'],
  ['Tài khoản', 'person-outline', 'Profile'], ['Hỗ trợ', 'help-circle-outline', 'Support'],
]
export default function HolidayHero({ navigation, cartCount, unread, user, topInset = 0 }) {
  const [index, setIndex] = useState(0), [menu, setMenu] = useState(false)
  const [reduced, setReduced] = useState(true), [active, setActive] = useState(AppState.currentState !== 'background')
  const focused = useIsFocused(), { width } = useWindowDimensions()
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value) }).catch(() => {})
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    const app = AppState.addEventListener('change', state => setActive(state === 'active'))
    return () => { alive = false; listener.remove(); app.remove() }
  }, [])
  useEffect(() => {
    if (!focused || !active || menu) return
    const timer = setInterval(() => setIndex(i => (i + 1) % slides.length), 10000)
    return () => clearInterval(timer)
  }, [focused, active, menu])
  useEffect(() => {
    opacity.stopAnimation()
    opacity.setValue(reduced ? 1 : .85)
    if (!reduced) Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: Platform.OS !== 'web' }).start()
    return () => opacity.stopAnimation()
  }, [index, reduced, opacity])
  const selected = slides[index]
  const go = (route, params) => { setMenu(false); navigation.navigate(route, params) }
  return <>
    <View style={styles.hero} testID="holiday-hero">
      <View style={[styles.header, { paddingTop: topInset + 14 }]}>
        <Pressable accessibilityLabel="Tài khoản" onPress={() => go(user ? 'Profile' : 'Login')} style={styles.brand}><Image source={require('../../../assets/branding/logo.png')} resizeMode="contain" allowDownscaling={false} style={{ width: 78, height: 60 }} accessibilityLabel="Highlands Coffee" /></Pressable>
        <View style={styles.headerActions}>
          <Pressable accessibilityLabel="Tìm món" onPress={() => go('Menu', { focusSearch: true })} style={styles.icon}><Ionicons name="search-outline" size={23} color="#fff" /></Pressable>
          <Pressable accessibilityLabel="Mở nhắn tin" onPress={() => go('Chat', { mode: 'staff' })} style={styles.icon}><Ionicons name="chatbubble-ellipses-outline" size={22} color="#fff" /></Pressable>
          <Pressable accessibilityLabel={`Giỏ hàng ${cartCount} món`} onPress={() => go('Cart')} style={styles.icon}><Ionicons name="cart-outline" size={24} color="#fff" />{cartCount > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{cartCount > 99 ? '99+' : cartCount}</Text></View>}</Pressable>
          <Pressable accessibilityLabel="Mở menu trang chủ" accessibilityState={{ expanded: menu }} onPress={() => setMenu(true)} style={styles.icon}><Ionicons name="menu-outline" size={25} color="#fff" /></Pressable>
        </View>
      </View>
      <View style={styles.categories}>{[['CÀ PHÊ','cà phê'],['TRÀ','trà'],['BÁNH','bánh']].map(([label,query]) => <Pressable key={label} onPress={() => go('Menu', { searchQuery: query })} style={styles.category}><Text style={styles.categoryText}>{label}</Text></Pressable>)}</View>
      <View style={{ height: Math.min(width, 600) * 926 / 1920, position: 'relative' }}>
        <Pressable accessibilityLabel="Khám phá thực đơn mùa lễ hội" onPress={() => go('Menu')} style={StyleSheet.absoluteFillObject}>
          <Animated.View style={[StyleSheet.absoluteFillObject, { opacity }]}><Image source={selected.image} allowDownscaling={false} style={StyleSheet.absoluteFillObject} resizeMode="cover" accessibilityLabel={selected.source} /></Animated.View>
        </Pressable>

      </View>
    </View>
    <AppModal visible={menu} transparent onRequestClose={() => setMenu(false)}>
      <Pressable style={{ flex: 1 }} accessibilityLabel="Đóng menu" onPress={() => setMenu(false)} />
      <View style={styles.menu}><View style={styles.menuHeading}><Text style={styles.menuTitle}>Khám phá Avengers</Text><Pressable accessibilityLabel="Đóng menu" onPress={() => setMenu(false)} style={styles.menuClose}><Ionicons name="close" size={22} color="#242424" /></Pressable></View>
        <ScrollView>{links.map(([label,icon,route]) => <Pressable key={route} onPress={() => go(route,route==='Chat'?{mode:'staff'}:undefined)} style={styles.menuLink}><Ionicons name={icon} size={21} color="#a9252b" /><Text style={styles.menuLabel}>{label}</Text><Ionicons name="chevron-forward" size={15} color="#888" /></Pressable>)}
          <Pressable onPress={() => go(user ? 'Profile' : 'Login',user?{initialTab:'notifications'}:undefined)} style={styles.menuLink}><Ionicons name="notifications-outline" size={21} color="#a9252b" /><Text style={styles.menuLabel}>Thông báo{unread>0 ? ` (${unread})` : ''}</Text><Ionicons name="chevron-forward" size={15} color="#888" /></Pressable>
        </ScrollView>
      </View>
    </AppModal>
  </>
}
const styles=StyleSheet.create({
  hero:{backgroundColor:'#a9252b',position:'relative',overflow:'hidden'},header:{paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{width:86,height:66,alignItems:'center',justifyContent:'center',backgroundColor:'#fff',borderRadius:44,overflow:'hidden'},headerActions:{flexDirection:'row',gap:2},icon:{width:38,height:42,alignItems:'center',justifyContent:'center'},badge:{position:'absolute',top:0,right:0,minWidth:16,height:16,borderRadius:8,backgroundColor:'#cf2c34',alignItems:'center',justifyContent:'center',paddingHorizontal:3},badgeText:{fontSize:9,fontWeight:'600',color:'#fff'},categories:{flexDirection:'row',paddingHorizontal:18,marginTop:9,gap:24},category:{paddingVertical:8},categoryText:{color:'#fff',fontSize:11,letterSpacing:1.2},menu:{backgroundColor:'#fff',borderTopLeftRadius:18,borderTopRightRadius:18,maxHeight:'82%',paddingBottom:16},menuHeading:{flexDirection:'row',alignItems:'center',padding:18,borderBottomWidth:1,borderColor:'#eee'},menuTitle:{flex:1,fontSize:17,fontWeight:'600'},menuClose:{padding:6},menuLink:{flexDirection:'row',alignItems:'center',gap:14,paddingVertical:16,paddingHorizontal:22,borderBottomWidth:1,borderColor:'#f2f2f2'},menuLabel:{flex:1,fontSize:14,color:'#252525'},
})
