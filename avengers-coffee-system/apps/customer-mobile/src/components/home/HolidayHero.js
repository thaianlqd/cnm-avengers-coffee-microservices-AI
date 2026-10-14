import React, { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, AppState, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useIsFocused } from '@react-navigation/native'
import { LinearGradient } from 'expo-linear-gradient'
import Image from '../CachedImage'
import AppModal from '../AppModal'
import HolidayOrnaments from './HolidayOrnaments'

const slides = [
  { image: require('../../../assets/campaigns/highlands-christmas-office.jpg'), title: 'Một chút ấm áp.\nMột mùa bên nhau.', description: 'Hẹn một ly cà phê, đón những khoảnh khắc cuối năm.', source: 'Không gian Highlands Coffee' },
  { image: require('../../../assets/campaigns/holiday-reference-1.jpg'), title: 'Chạm vào\nkhông khí Giáng sinh.', description: 'Những cuộc hẹn nhỏ, những câu chuyện thật ấm.', source: 'Ảnh cảm hứng lễ hội' },
  { image: require('../../../assets/campaigns/holiday-reference-2.jpg'), title: 'Mùa đông\nthêm ngọt ngào.', description: 'Tìm món bạn yêu thích cho ngày thật nhiều niềm vui.', source: 'Ảnh cảm hứng lễ hội' },
]
const links = [
  ['Thực đơn', 'cafe-outline', 'Menu'], ['Đơn hàng của tôi', 'receipt-outline', 'Orders'],
  ['Trò chuyện', 'chatbubbles-outline', 'Chat'], ['Ưu đãi', 'ticket-outline', 'Vouchers'],
  ['Cửa hàng', 'storefront-outline', 'StoresTab'], ['Thẻ thành viên', 'ribbon-outline', 'Membership'],
  ['Tài khoản', 'person-outline', 'Profile'], ['Hỗ trợ', 'help-circle-outline', 'Support'],
]
export default function HolidayHero({ navigation, cartCount, unread, user, topInset = 0 }) {
  const [index, setIndex] = useState(0), [paused, setPaused] = useState(false), [menu, setMenu] = useState(false)
  const [reduced, setReduced] = useState(true), [active, setActive] = useState(AppState.currentState !== 'background')
  const focused = useIsFocused(), { height } = useWindowDimensions()
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (alive) setReduced(value) }).catch(() => {})
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced)
    const app = AppState.addEventListener('change', state => setActive(state === 'active'))
    return () => { alive = false; listener.remove(); app.remove() }
  }, [])
  useEffect(() => {
    if (!focused || !active || paused || menu || reduced) return
    const timer = setInterval(() => setIndex(i => (i + 1) % slides.length), 7000)
    return () => clearInterval(timer)
  }, [focused, active, paused, menu, reduced, index])
  useEffect(() => {
    opacity.stopAnimation()
    opacity.setValue(reduced ? 1 : .85)
    if (!reduced) Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: Platform.OS !== 'web' }).start()
    return () => opacity.stopAnimation()
  }, [index, reduced, opacity])
  const selected = slides[index]
  const go = (route, params) => { setMenu(false); navigation.navigate(route, params) }
  return <>
    <View style={[styles.hero, { height: Math.max(510, Math.min(660, height * .76)) }]} testID="holiday-hero">
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity }]}><Image source={selected.image} allowDownscaling={false} style={StyleSheet.absoluteFillObject} resizeMode="cover" accessibilityLabel={selected.source} /></Animated.View>
      <LinearGradient pointerEvents="none" colors={['#15120f55', '#15120f00', '#15120fe8']} locations={[0, .45, 1]} style={StyleSheet.absoluteFillObject} />
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
      <HolidayOrnaments moving={focused && active && !paused && !menu && !reduced} />
      <View style={styles.copy}>
        <View style={styles.season}><Ionicons name="snow-outline" size={14} color="#ebd4a4" /><Text style={styles.eyebrow}>THE HOLIDAY EDIT</Text></View>
        <Text style={styles.title}>{selected.title}</Text><Text style={styles.description}>{selected.description}</Text>
        <Pressable accessibilityLabel="Khám phá thực đơn mùa lễ hội" onPress={() => go('Menu')} style={styles.cta}><Text style={styles.ctaText}>KHÁM PHÁ THỰC ĐƠN</Text><Ionicons name="arrow-forward" size={17} color="#202020" /></Pressable>
        <View style={styles.bottom}><Text style={styles.source}>{selected.source}</Text><View style={styles.controls}>{slides.map((_,i) => <Pressable key={i} accessibilityLabel={`Xem ảnh lễ hội ${i+1}`} accessibilityState={{ selected: i===index }} onPress={() => setIndex(i)} hitSlop={10} style={[styles.dot,i===index && styles.selectedDot]} />)}<Pressable accessibilityLabel={reduced ? 'Chuyển ảnh tự động đã tắt' : paused ? 'Tiếp tục chuyển ảnh' : 'Tạm dừng chuyển ảnh'} disabled={reduced} onPress={() => setPaused(value => !value)} style={styles.pause}><Ionicons name={paused || reduced ? 'play' : 'pause'} size={12} color="#fff" /></Pressable></View></View>
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
  hero:{backgroundColor:'#33221a',position:'relative',overflow:'hidden'},header:{paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{width:86,height:66,alignItems:'center',justifyContent:'center',backgroundColor:'#fff',borderRadius:44,overflow:'hidden'},headerActions:{flexDirection:'row',gap:2},icon:{width:38,height:42,alignItems:'center',justifyContent:'center'},badge:{position:'absolute',top:0,right:0,minWidth:16,height:16,borderRadius:8,backgroundColor:'#cf2c34',alignItems:'center',justifyContent:'center',paddingHorizontal:3},badgeText:{fontSize:9,fontWeight:'600',color:'#fff'},categories:{flexDirection:'row',paddingHorizontal:18,marginTop:9,gap:24},category:{paddingVertical:8},categoryText:{color:'#fff',fontSize:11,letterSpacing:1.2},copy:{position:'absolute',bottom:0,left:0,right:0,padding:22},season:{flexDirection:'row',gap:7,alignItems:'center'},eyebrow:{fontSize:10,letterSpacing:2,color:'#ebd4a4',fontWeight:'500'},title:{fontSize:26,fontWeight:'600',lineHeight:33,letterSpacing:-.4,color:'#fff',marginTop:12},description:{fontSize:13,lineHeight:21,color:'#f3ede8',maxWidth:330,marginTop:10},cta:{alignSelf:'flex-start',backgroundColor:'#fff',paddingVertical:12,paddingHorizontal:15,flexDirection:'row',gap:14,alignItems:'center',marginTop:19,borderRadius:2},ctaText:{fontSize:10,fontWeight:'600',letterSpacing:.7},bottom:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginTop:20},source:{fontSize:9,color:'#d3cac3',flex:1},controls:{flexDirection:'row',alignItems:'center',gap:7},dot:{width:5,height:5,borderRadius:3,backgroundColor:'#ffffff66'},selectedDot:{width:22,backgroundColor:'#fff'},pause:{width:28,height:28,borderWidth:1,borderColor:'#ffffff40',borderRadius:14,alignItems:'center',justifyContent:'center'},menu:{backgroundColor:'#fff',borderTopLeftRadius:18,borderTopRightRadius:18,maxHeight:'82%',paddingBottom:16},menuHeading:{flexDirection:'row',alignItems:'center',padding:18,borderBottomWidth:1,borderColor:'#eee'},menuTitle:{flex:1,fontSize:17,fontWeight:'600'},menuClose:{padding:6},menuLink:{flexDirection:'row',alignItems:'center',gap:14,paddingVertical:16,paddingHorizontal:22,borderBottomWidth:1,borderColor:'#f2f2f2'},menuLabel:{flex:1,fontSize:14,color:'#252525'},
})
