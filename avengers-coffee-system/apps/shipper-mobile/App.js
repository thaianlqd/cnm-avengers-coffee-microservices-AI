import 'react-native-gesture-handler'
import React from 'react'
import { View, Platform } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { ShipperProvider } from './src/context/ShipperContext'
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

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center' }}><View style={{ width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined, flex: 1, backgroundColor: colors.bg }}><SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ShipperProvider>
            <NavigationContainer theme={navigationTheme}>
              <AppNavigator />
              <StatusBar style="dark" />
              <WebAlertBridge />
            </NavigationContainer>
          </ShipperProvider>
        </QueryClientProvider>
      </SafeAreaProvider></View></View>
    </GestureHandlerRootView>
  )
}
