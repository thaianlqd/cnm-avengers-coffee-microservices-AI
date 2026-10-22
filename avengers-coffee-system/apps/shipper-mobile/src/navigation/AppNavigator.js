import React from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import { colors } from '../theme'
import { ShipperHomeSkeleton } from '../components/Experience'

import { LoginScreen } from '../screens/LoginScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { WalletScreen } from '../screens/WalletScreen'
import { HistoryScreen } from '../screens/HistoryScreen'
import { ProfileScreen } from '../screens/ProfileScreen'
import { OrderDetailScreen } from '../screens/OrderDetailScreen'
import { MapScreen } from '../screens/MapScreen'
import { ReportScreen } from '../screens/ReportScreen'
import { ScheduleScreen } from '../screens/ScheduleScreen'
import { BatchOrderScreen } from '../screens/BatchOrderScreen'
import { BatchRouteScreen } from '../screens/BatchRouteScreen'
import { ExceptionScreen } from '../screens/ExceptionScreen'
import { VehicleScreen } from '../screens/VehicleScreen'
import { NotificationScreen } from '../screens/NotificationScreen'

const Stack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()

function TabBarIcon({ routeName, color, size, focused }) {
  const ICONS = {
    Home: { focused: 'navigate', unfocused: 'navigate-outline' },
    Wallet: { focused: 'wallet', unfocused: 'wallet-outline' },
    History: { focused: 'time', unfocused: 'time-outline' },
    Profile: { focused: 'person', unfocused: 'person-outline' },
  }
  const icons = ICONS[routeName] || { focused: 'ellipse', unfocused: 'ellipse-outline' }
  return <Ionicons name={focused ? icons.focused : icons.unfocused} size={size} color={color} />
}

function MainTabs() {
  const insets = useSafeAreaInsets()
  return (
    <Tabs.Navigator backBehavior="history"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#f1f5f9',
          borderTopWidth: 1,
          height: 60 + insets.bottom,
          paddingBottom: Math.max(8, insets.bottom),
          paddingTop: 8,
        },
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, size, focused }) => (
          <TabBarIcon routeName={route.name} color={color} size={22} focused={focused} />
        ),
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: 'Công việc' }} />
      <Tabs.Screen name="Wallet" component={WalletScreen} options={{ title: 'Ví & Cod' }} />
      <Tabs.Screen name="History" component={HistoryScreen} options={{ title: 'Lịch sử' }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'Hồ sơ' }} />
          <Tabs.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: 'Chi tiết đơn', unmountOnBlur: true, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="Map" component={MapScreen} options={{ title: 'Hành trình', unmountOnBlur: true, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="Report" component={ReportScreen} options={{ title: 'Thu nhập', unmountOnBlur: true, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="Schedule" component={ScheduleScreen} options={{ title: 'Lịch làm việc', unmountOnBlur: true, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="BatchOrder" component={BatchOrderScreen} options={{ title: 'Giao ghép', unmountOnBlur: true, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="BatchRoute" component={BatchRouteScreen} options={{ title: 'Lộ trình ghép', unmountOnBlur: true, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="Exception" component={ExceptionScreen} options={{ title: 'Báo cáo ngoại lệ', unmountOnBlur: true, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="Vehicle" component={VehicleScreen} options={{ title: 'Phương tiện', unmountOnBlur: true, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
          <Tabs.Screen name="Notification" component={NotificationScreen} options={{ title: 'Thông báo', unmountOnBlur: true, tabBarButton: () => null, tabBarItemStyle: { display: 'none' } }} />
    </Tabs.Navigator>
  )
}
export function AppNavigator() {
  const { shipper, hydrated } = useShipper()
  const insets = useSafeAreaInsets()

  if (!hydrated) {
    return <ShipperHomeSkeleton topInset={insets.top} />
  }

  return (
    <Stack.Navigator key={shipper ? 'auth' : 'guest'} screenOptions={{ headerShown: false }}>
      {!shipper ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />

        </>
      )}
    </Stack.Navigator>
  )
}
