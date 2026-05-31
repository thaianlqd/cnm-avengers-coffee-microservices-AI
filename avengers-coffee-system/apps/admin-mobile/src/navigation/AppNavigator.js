import React from 'react'
import {
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
} from 'react-native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { LinearGradient } from 'expo-linear-gradient'
import { useAdmin } from '../context/AdminContext'

import { LoginScreen } from '../screens/LoginScreen'
import { MainShell } from '../components/MainShell'

const Stack = createNativeStackNavigator()

export function AppNavigator() {
  const { admin, hydrated } = useAdmin()

  if (!hydrated) {
    return (
      <View style={styles.loadingScreen}>
        <LinearGradient colors={['#0d0a08', '#1a1410', '#2d1e0f']} style={styles.loadingGradient}>
          <LinearGradient colors={['#f26b1d', '#d4560e']} style={styles.loadingLogo}>
            <Text style={styles.loadingEmoji}>☕</Text>
          </LinearGradient>
          <ActivityIndicator size="large" color="#f26b1d" style={{ marginTop: 20 }} />
          <Text style={styles.loadingBrand}>Avengers Admin</Text>
          <Text style={styles.loadingText}>Đang khởi động...</Text>
        </LinearGradient>
      </View>
    )
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!admin ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : (
        <Stack.Screen name="Main" component={MainShell} />
      )}
    </Stack.Navigator>
  )
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, backgroundColor: '#0d0a08' },
  loadingGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f26b1d',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  loadingEmoji: { fontSize: 38 },
  loadingBrand: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    marginTop: 8,
    letterSpacing: -0.5,
  },
  loadingText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
})
