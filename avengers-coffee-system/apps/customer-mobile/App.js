import 'react-native-gesture-handler'
import React, { useEffect } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Platform, View, StyleSheet } from 'react-native'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { UserProvider, useUser } from './src/context/UserContext'
import { AppNavigator } from './src/navigation/AppNavigator'
import { FulfillmentProvider } from './src/context/FulfillmentContext'
import { FeedbackProvider } from './src/context/FeedbackContext'
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
  const { touchSession } = useUser()
  return <View style={{ flex: 1 }} onTouchStartCapture={touchSession}>{children}</View>
}

export default function App() {
  useEffect(() => {
    if (Platform.OS !== 'web') return
    const style = document.createElement('style')
    style.textContent = `input[data-customer-input], textarea[data-customer-input] { outline: none !important; box-shadow: none !important; }
      div:has(> input[data-customer-input]:focus-visible), div:has(> textarea[data-customer-input]:focus-visible) { border-color: #b22830; }
      input[data-customer-input]:focus, textarea[data-customer-input]:focus { border-color: #b22830; }
      input[data-customer-input]:focus-visible, textarea[data-customer-input]:focus-visible { background-color: #fff; }`
    document.head.appendChild(style)
    return () => style.remove()
  }, [])
  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.webContainer}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <UserProvider>
              <SessionActivity><FulfillmentProvider><FeedbackProvider><NavigationContainer theme={navigationTheme} documentTitle={{ formatter: (options, route) => `${options?.title || route?.name || 'Trang chủ'} | Avengers Coffee` }}>
                <AppNavigator />
                <StatusBar style="dark" />
              </NavigationContainer></FeedbackProvider></FulfillmentProvider></SessionActivity>
            </UserProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#e5e7eb',
  },
  webContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    ...(Platform.OS === 'web'
      ? {
          maxWidth: 480,
          width: '100%',
          marginHorizontal: 'auto',
          boxShadow: '0 0 20px rgba(0,0,0,0.1)',
          height: '100vh',
          overflow: 'hidden',
        }
      : {}),
  },
})
