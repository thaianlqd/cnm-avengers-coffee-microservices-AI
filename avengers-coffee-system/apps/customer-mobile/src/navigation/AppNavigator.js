import React from 'react'
import { ActivityIndicator, View, Text, StyleSheet, Platform } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useQuery } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import { getUserId, normalizeCartItem, safeArray } from '../lib/customerData'
import { colors, shadows, radius } from '../theme'
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

const Stack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()

const TAB_ICONS = {
  Home: { focused: 'sparkles', unfocused: 'sparkles-outline' },
  Menu: { focused: 'cafe', unfocused: 'cafe-outline' },
  Cart: { focused: 'bag-handle', unfocused: 'bag-handle-outline' },
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
  const { user } = useUser()
  const userId = getUserId(user)

  const cartCountQuery = useQuery({
    queryKey: ['customer', 'cart', userId, 'count'],
    queryFn: async () => {
      const response = await apiClient.get(`/cart/${userId}`)
      return safeArray(response).map(normalizeCartItem).reduce((sum, item) => sum + Number(item.so_luong || 0), 0)
    },
    enabled: Boolean(userId),
    staleTime: 10 * 1000,
  })

  const cartCount = cartCountQuery.data || 0

  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#8e8e93',
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 84 : 68,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10,
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
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Tài khoản' }}
      />
    </Tabs.Navigator>
  )
}

export function AppNavigator() {
  const { user, hydrated } = useUser()

  if (!hydrated) {
    return (
      <View style={styles.loadingWrap}>
        <LinearGradient
          colors={['#1a0c05', '#3d1a08', '#f26b1d']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.loadingGradient}
        >
          <View style={styles.logoBadge}>
            <Text style={styles.loadingEmoji}>☕</Text>
          </View>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Đang kết nối Avengers Coffee...</Text>
          <Text style={styles.loadingBrand}>AVENGERS COFFEE</Text>
        </LinearGradient>
      </View>
    )
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
      <Stack.Screen name="Wallet" component={WalletScreen} />
      <Stack.Screen name="Orders" component={OrdersScreen} />
      <Stack.Screen name="Vouchers" component={VouchersScreen} />
      <Stack.Screen name="Stores" component={StoresScreen} />
      <Stack.Screen name="News" component={NewsScreen} />
      <Stack.Screen name="Membership" component={MembershipScreen} />
      <Stack.Screen name="LuckyWheel" component={LuckyWheelScreen} />
      <Stack.Screen name="GiftCard" component={GiftCardScreen} />
      <Stack.Screen name="About" component={AboutScreen} />
      <Stack.Screen name="Support" component={SupportScreen} />
      <Stack.Screen name="Survey" component={SurveyScreen} />
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
    backgroundColor: '#fff4ed',
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

