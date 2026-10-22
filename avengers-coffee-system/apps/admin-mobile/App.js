import 'react-native-gesture-handler'
import React from 'react'
import { View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AdminProvider, useAdmin } from './src/context/AdminContext'
import { AppNavigator } from './src/navigation/AppNavigator'
import { colors } from './src/theme'

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
  const { touchSession } = useAdmin()
  return <View style={{ flex: 1 }} onTouchStart={touchSession} onKeyDown={touchSession} onScroll={touchSession}>{children}</View>
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AdminProvider>
            <SessionActivity><NavigationContainer theme={navigationTheme}>
              <AppNavigator />
              <StatusBar style="light" />
            </NavigationContainer></SessionActivity>
          </AdminProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
