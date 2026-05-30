import React, { useState } from 'react'
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native'
import { useAdmin } from '../context/AdminContext'
import { colors, spacing } from '../theme'

export function LoginScreen({ navigation }) {
  const { loginWithDemo } = useAdmin()
  const [loading, setLoading] = useState(false)

  const handleDemoLogin = async () => {
    setLoading(true)
    try {
      await loginWithDemo()
    } catch (error) {
      Alert.alert('Lỗi', 'Không thể đăng nhập với demo mode')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Avengers Coffee</Text>
      <Text style={styles.subtitle}>Quản trị viên</Text>
      
      <Pressable
        onPress={handleDemoLogin}
        disabled={loading}
        style={({ pressed }) => [styles.demoBtn, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.demoBtnText}>{loading ? 'Đang đăng nhập...' : 'Demo Login'}</Text>
      </Pressable>

      <Text style={styles.footer}>Phiên bản Mobile v1.0</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: colors.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 40,
  },
  demoBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  demoBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    color: colors.muted,
    fontSize: 12,
  },
})
