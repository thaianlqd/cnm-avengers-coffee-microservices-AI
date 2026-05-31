import React from 'react'
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import { colors } from '../theme'
import { LoginScreen } from '../screens/LoginScreen'
import { HomeScreen } from '../screens/HomeScreen'
import { DeliveriesScreen } from '../screens/DeliveriesScreen'
import { EarningsScreen } from '../screens/EarningsScreen'
import { ProfileScreen } from '../screens/ProfileScreen'

const Stack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#9b8a7c',
        tabBarStyle: {
          height: 70,
          paddingBottom: 10,
          paddingTop: 8,
          backgroundColor: '#fffdf8',
          borderTopColor: '#ead8c6',
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap = {
            Home: focused ? 'home' : 'home-outline',
            'Đơn hàng': focused ? 'bicycle' : 'bicycle-outline',
            'Thu nhập': focused ? 'wallet' : 'wallet-outline',
            'Hồ sơ': focused ? 'person-circle' : 'person-circle-outline',
          }
          return <Ionicons name={iconMap[route.name] || 'ellipse'} size={size} color={color} />
        },
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: 'Trang chủ' }} />
      <Tabs.Screen name="Đơn hàng" component={DeliveriesScreen} options={{ title: 'Đơn hàng' }} />
      <Tabs.Screen name="Thu nhập" component={EarningsScreen} options={{ title: 'Thu nhập' }} />
      <Tabs.Screen name="Hồ sơ" component={ProfileScreen} options={{ title: 'Hồ sơ' }} />
    </Tabs.Navigator>
  )
}

export function AppNavigator() {
  const { shipper, hydrated } = useShipper()

  if (!hydrated) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Đang khởi động ứng dụng...</Text>
      </View>
    )
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!shipper ? (
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    gap: 12,
  },
  loadingText: {
    color: colors.coffee,
    fontSize: 15,
    fontWeight: '700',
  },
})
