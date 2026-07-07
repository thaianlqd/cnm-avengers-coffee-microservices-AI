import React from 'react'
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import { colors } from '../theme'

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
import { ExceptionScreen } from '../screens/ExceptionScreen'
import { VehicleScreen } from '../screens/VehicleScreen'
import { NotificationScreen } from '../screens/NotificationScreen'

const Stack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()

function TabBarIcon({ routeName, color, size, focused }) {
  const ICONS = {
    Home: { focused: 'bicycle', unfocused: 'bicycle-outline' },
    Wallet: { focused: 'wallet', unfocused: 'wallet-outline' },
    History: { focused: 'time', unfocused: 'time-outline' },
    Profile: { focused: 'person-circle', unfocused: 'person-circle-outline' },
  }
  const icons = ICONS[routeName] || { focused: 'ellipse', unfocused: 'ellipse-outline' }
  return <Ionicons name={focused ? icons.focused : icons.unfocused} size={size} color={color} />
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.borderLight,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, size, focused }) => (
          <TabBarIcon routeName={route.name} color={color} size={size} focused={focused} />
        ),
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: 'Nhận Đơn' }} />
      <Tabs.Screen name="Wallet" component={WalletScreen} options={{ title: 'Ví & COD' }} />
      <Tabs.Screen name="History" component={HistoryScreen} options={{ title: 'Lịch Sử' }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'Hồ Sơ' }} />
    </Tabs.Navigator>
  )
}

export function AppNavigator() {
  const { shipper, hydrated } = useShipper()

  if (!hydrated) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Đang khởi động Avengers Shipper...</Text>
      </View>
    )
  }

  return (
    <Stack.Navigator key={shipper ? 'auth' : 'guest'} screenOptions={{ headerShown: false }}>
      {!shipper ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="OrderDetail" component={OrderDetailScreen} />
          <Stack.Screen name="Map" component={MapScreen} />
          <Stack.Screen name="Report" component={ReportScreen} />
          <Stack.Screen name="Schedule" component={ScheduleScreen} />
          <Stack.Screen name="BatchOrder" component={BatchOrderScreen} />
          <Stack.Screen name="Exception" component={ExceptionScreen} />
          <Stack.Screen name="Vehicle" component={VehicleScreen} />
          <Stack.Screen name="Notification" component={NotificationScreen} />
        </>
      )}
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    backgroundColor: colors.darkBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
