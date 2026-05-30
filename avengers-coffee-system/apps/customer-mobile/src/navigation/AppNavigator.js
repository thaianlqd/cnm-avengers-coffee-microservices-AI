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
import { colors } from '../theme'
import { LoginScreen } from '../screens/LoginScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { MenuScreen } from '../screens/MenuScreen'
import { CartScreen } from '../screens/CartScreen'
import { OrdersScreen } from '../screens/OrdersScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { VouchersScreen } from '../screens/VouchersScreen'
import { StoresScreen } from '../screens/StoresScreen'
import { NewsScreen } from '../screens/NewsScreen'

const Stack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()

const TAB_ICONS = {
  Home:     { focused: 'home',           unfocused: 'home-outline' },
  Menu:     { focused: 'restaurant',     unfocused: 'restaurant-outline' },
  Cart:     { focused: 'bag',            unfocused: 'bag-outline' },
  Orders:   { focused: 'receipt',        unfocused: 'receipt-outline' },
  Vouchers: { focused: 'ticket',         unfocused: 'ticket-outline' },
  Stores:   { focused: 'storefront',     unfocused: 'storefront-outline' },
  News:     { focused: 'newspaper',      unfocused: 'newspaper-outline' },
  Profile:  { focused: 'person-circle',  unfocused: 'person-circle-outline' },
}

function TabBarIcon({ routeName, color, size, focused }) {
  const icons = TAB_ICONS[routeName] || { focused: 'ellipse', unfocused: 'ellipse-outline' }
  return <Ionicons name={focused ? icons.focused : icons.unfocused} size={size} color={color} />
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
        tabBarInactiveTintColor: '#9b8a7c',
        tabBarStyle: {
          height: Platform.OS === 'ios' ? 82 : 70,
          paddingBottom: Platform.OS === 'ios' ? 22 : 10,
          paddingTop: 8,
          backgroundColor: '#fffdf8',
          borderTopColor: '#ead8c6',
          borderTopWidth: 1,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
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
        options={{ title: 'Menu' }}
      />
      <Tabs.Screen
        name="Cart"
        component={CartScreen}
        options={{
          title: 'Giỏ hàng',
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            color: '#fff',
            fontSize: 10,
            fontWeight: '900',
            minWidth: 18,
          },
        }}
      />
      <Tabs.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ title: 'Đơn hàng' }}
      />
      <Tabs.Screen
        name="Vouchers"
        component={VouchersScreen}
        options={{ title: 'Voucher' }}
      />
      <Tabs.Screen
        name="Stores"
        component={StoresScreen}
        options={{ title: 'Cửa hàng' }}
      />
      <Tabs.Screen
        name="News"
        component={NewsScreen}
        options={{ title: 'Tin tức' }}
      />
      <Tabs.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Hồ sơ' }}
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
          colors={['#1a0a02', '#3d1a08', '#f26b1d']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.loadingGradient}
        >
          <Text style={styles.loadingEmoji}>☕</Text>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Đang khởi động ứng dụng...</Text>
          <Text style={styles.loadingBrand}>Avengers Coffee</Text>
        </LinearGradient>
      </View>
    )
  }

  return (
    <Stack.Navigator key={user ? 'authenticated' : 'guest'} screenOptions={{ headerShown: false }}>
      {!user ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <Stack.Screen name="Tabs" component={MainTabs} />
      )}
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: '#1a0a02',
  },
  loadingGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingEmoji: {
    fontSize: 60,
    marginBottom: 8,
  },
  loadingText: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingBrand: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    marginTop: 8,
    letterSpacing: -0.5,
  },
})
