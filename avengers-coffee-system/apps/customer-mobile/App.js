import 'react-native-gesture-handler'
import React from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { Platform, View, StyleSheet } from 'react-native'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { UserProvider } from './src/context/UserContext'
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

export default function App() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.webContainer}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <UserProvider>
              <NavigationContainer theme={navigationTheme}>
                <AppNavigator />
                <StatusBar style="light" />
              </NavigationContainer>
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
