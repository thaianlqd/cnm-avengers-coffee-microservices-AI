if (typeof globalThis !== 'undefined' && typeof globalThis.location === 'undefined') {
  try {
    globalThis.location = {
      href: 'http://localhost:8081/',
      protocol: 'http:',
      host: 'localhost:8081',
      hostname: 'localhost',
      port: '8081',
      pathname: '/',
      search: '',
      hash: '',
      origin: 'http://localhost:8081',
    }
  } catch {}
}
if (typeof window !== 'undefined' && typeof window.location === 'undefined') {
  try {
    window.location = globalThis.location
  } catch {}
}
if (typeof global !== 'undefined' && typeof global.location === 'undefined') {
  try {
    global.location = globalThis.location
  } catch {}
}

import 'react-native-gesture-handler'
import React from 'react'
import { View, Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ShipperProvider, useShipper } from './src/context/ShipperContext'
import { AppNavigator } from './src/navigation/AppNavigator'
import { colors } from './src/theme'
import { WebAlertBridge } from './src/components/WebAlertBridge'
import './src/lib/backgroundLocationManager'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
    },
  },
})

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.surface,
    primary: colors.primary,
    text: colors.text,
    border: colors.border,
  },
}

function SessionActivity({ children }) {
  const { touchSession } = useShipper()
  return <View style={{ flex: 1 }} onTouchStartCapture={touchSession}>{children}</View>
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center' }}><View style={{ width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, flex: 1, backgroundColor: colors.bg }}><SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ShipperProvider>
            <SessionActivity><NavigationContainer theme={navigationTheme}>
              <AppNavigator />
              <StatusBar style="dark" />
              <WebAlertBridge />
            </NavigationContainer></SessionActivity>
          </ShipperProvider>
        </QueryClientProvider>
      </SafeAreaProvider></View></View>
    </GestureHandlerRootView>
  )
}
