import React from 'react'
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { useAdmin } from '../context/AdminContext'
import { colors } from '../theme'
import { LoginScreen } from '../screens/LoginScreen'
import { DashboardScreen } from '../screens/DashboardScreen'
import { OrdersScreen } from '../screens/OrdersScreen'
import { InventoryScreen } from '../screens/InventoryScreen'
import { ShiftsScreen } from '../screens/ShiftsScreen'
import { ProfileScreen } from '../screens/ProfileScreen'

const Stack = createNativeStackNavigator()
const Tabs = createBottomTabNavigator()

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#8b7f78',
        tabBarStyle: {
          height: 70,
          paddingBottom: 10,
          paddingTop: 8,
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap = {
            Dashboard: focused ? 'stats-chart' : 'stats-chart-outline',
            Orders: focused ? 'receipt' : 'receipt-outline',
            Inventory: focused ? 'cube' : 'cube-outline',
            Shifts: focused ? 'calendar' : 'calendar-outline',
            Profile: focused ? 'person-circle' : 'person-circle-outline',
          }
          return <Ionicons name={iconMap[route.name] || 'ellipse'} size={size} color={color} />
        },
      })}
    >
      <Tabs.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="Orders" component={OrdersScreen} options={{ title: 'Đơn hàng' }} />
      <Tabs.Screen name="Inventory" component={InventoryScreen} options={{ title: 'Tồn kho' }} />
      <Tabs.Screen name="Shifts" component={ShiftsScreen} options={{ title: 'Ca làm' }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ title: 'Hồ sơ' }} />
    </Tabs.Navigator>
  )
}

export function AppNavigator() {
  const { admin, hydrated } = useAdmin()

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
      {!admin ? (
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
  },
  loadingText: {
    marginTop: 12,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
})
