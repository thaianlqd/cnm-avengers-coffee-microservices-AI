import { useCart } from '../hooks/useCart'
import React, { useState, useEffect } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, StyleSheet } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import { getUserId, normalizeCartItem, normalizeProduct, safeArray } from '../lib/customerData'
import { colors, shadows, radius } from '../theme'
import { CustomerHomeSkeleton } from '../components/common/Skeleton'
import { LoginScreen } from '../screens/LoginScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { MenuScreen } from '../screens/MenuScreen'
import { CartScreen } from '../screens/CartScreen'
import { OrdersScreen } from '../screens/OrdersScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { VouchersScreen } from '../screens/VouchersScreen'
import { StoresScreen } from '../screens/StoresScreen'
import { NewsScreen } from '../screens/NewsScreen'
import { ChatScreen } from '../screens/ChatScreen'
import { WalletScreen } from '../screens/WalletScreen'
import { MembershipScreen } from '../screens/MembershipScreen'
import { LuckyWheelScreen } from '../screens/LuckyWheelScreen'
import { GiftCardScreen } from '../screens/GiftCardScreen'
import { AboutScreen } from '../screens/AboutScreen'
import { SupportScreen } from '../screens/SupportScreen'
import { SurveyScreen } from '../screens/SurveyScreen'
import { ProductDetailScreen } from '../screens/ProductDetailScreen'

const Stack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()

const TAB_ICONS = {
  Home: { focused: 'home', unfocused: 'home-outline' },
  Menu: { focused: 'cafe', unfocused: 'cafe-outline' },
  Cart: { focused: 'bag-handle', unfocused: 'bag-handle-outline' },
  StoresTab: { focused: 'storefront', unfocused: 'storefront-outline' },
  Profile: { focused: 'person-circle', unfocused: 'person-circle-outline' },
}

function TabBarIcon({ routeName, color, size, focused }) {
  const icons = TAB_ICONS[routeName] || { focused: 'ellipse', unfocused: 'ellipse-outline' }
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
      <Ionicons name={focused ? icons.focused : icons.unfocused} size={focused ? 22 : 20} color={focused ? colors.primary : color} />
    </View>
  )
}

function MainTabs() {
  const insets = useSafeAreaInsets()
  const { count: cartCount } = useCart()

  return (
    <Tabs.Navigator backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarLabelPosition: 'below-icon',
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#8e8e93',
        tabBarStyle: {
          height: 56 + Math.max(insets.bottom, 10),
          paddingBottom: Math.max(insets.bottom, 10),
          paddingTop: 8,
          backgroundColor: '#ffffff',
          borderTopColor: colors.borderLight,
          borderTopWidth: 0.8,
          elevation: 12,
          shadowColor: '#1a1008',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: -2,
          letterSpacing: -0.2,
        },
        tabBarIcon: ({ color, size, focused }) => (
          <TabBarIcon routeName={route.name} color={color} size={size} focused={focused} />
        ),
      })}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Trang chủ' }}
      />
      <Tabs.Screen
        name="Menu"
        component={MenuScreen}
        options={{ title: 'Thực đơn' }}
      />
      <Tabs.Screen
        name="Cart"
        component={CartScreen}
        options={{
          title: 'Giỏ hàng',
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.brandRed,
            color: '#fff',
            fontSize: 10,
            fontWeight: '900',
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            lineHeight: 16,
          },
        }}
      />
      <Tabs.Screen name="StoresTab" component={StoresScreen} options={{ title: 'Cửa hàng' }} />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Tài khoản' }}
      />
      {Object.entries({ Orders: OrdersScreen, Vouchers: VouchersScreen, Stores: StoresScreen, News: NewsScreen, Wallet: WalletScreen, Membership: MembershipScreen, LuckyWheel: LuckyWheelScreen, GiftCard: GiftCardScreen, About: AboutScreen, Support: SupportScreen, Survey: SurveyScreen, Chat: ChatScreen, ProductDetail: ProductDetailScreen }).map(([name, component]) => <Tabs.Screen key={name} name={name} component={component} options={{ tabBarButton: () => null, tabBarItemStyle: { display: 'none' }, title: ({ Orders: 'Đơn hàng', Vouchers: 'Ưu đãi', News: 'Tin tức', ProductDetail: 'Chi tiết sản phẩm' })[name] || name }} />)}
    </Tabs.Navigator>
  )
}

export function AppNavigator() {
  const { user, hydrated } = useUser()
  const [introDone, setIntroDone] = useState(false), [booted, setBooted] = useState(false)
  useEffect(() => { const timer = setTimeout(() => setIntroDone(true), 200); return () => clearTimeout(timer) }, [])
  useQuery({ queryKey: ['customer', 'menu-products-all'], queryFn: async () => safeArray(await apiClient.get('/menu/san-pham', { timeout: 12000 })).map(p => ({ ...normalizeProduct(p), danh_muc_id: String(p.danhMuc?.ma_danh_muc || p.danh_muc_id || ''), trang_thai: Boolean(p.trang_thai) })), enabled: hydrated, staleTime: 60000, retry: false })
  useEffect(() => { if (hydrated && introDone) setBooted(true) }, [hydrated, introDone])
  if (!booted) {
    return <CustomerHomeSkeleton />
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  tabIconWrap: {
    paddingHorizontal: 12,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconWrapActive: {
    backgroundColor: '#f8eeee',
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: '#1a0c05',
  },
  loadingGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  logoBadge: {
    width: 90,
    height: 90,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: 8,
  },
  loadingEmoji: {
    fontSize: 44,
  },
  loadingText: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  loadingBrand: {
    fontSize: 24,
    fontWeight: '900',
    color: '#fff',
    marginTop: 4,
    letterSpacing: 1.5,
  },
})

