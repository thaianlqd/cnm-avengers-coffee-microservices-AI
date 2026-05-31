import React, { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useShipper } from '../context/ShipperContext'
import { buildApiUrl } from '../lib/apiClient'
import { colors, shadows } from '../theme'

export function LoginScreen() {
  const { loginWithDemo, updateSession } = useShipper()
  const [username, setUsername] = useState('shipper_demo')
  const [password, setPassword] = useState('123456')
  const [loading, setLoading] = useState(false)

  const tryLogin = async () => {
    setLoading(true)
    try {
      const response = await fetch(buildApiUrl('/shippers/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!response.ok) {
        throw new Error('Login failed')
      }

      const data = await response.json()
      const nextShip = data.shipper || data.user || { id: 'shipper-001', username, full_name: 'Shipper Mobile' }
      await updateSession(nextShip, data.access_token || `token-${Date.now()}`)
    } catch (error) {
      Alert.alert('Đăng nhập demo', 'Backend chưa có endpoint shipper login, app sẽ chuyển sang chế độ demo xịn xò.')
      await loginWithDemo()
    } finally {
      setLoading(false)
    }
  }

  return (
    <LinearGradient colors={['#2f2119', '#f26b1d', '#2563eb']} style={styles.shell}>
      <View style={styles.overlay}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Avengers Delivery</Text>
          <Text style={styles.title}>Shipper mobile app</Text>
          <Text style={styles.desc}>
            Giao diện điện thoại riêng cho shipper, tối ưu thao tác 1 tay, tông màu đồng bộ với hệ thống hiện tại.
          </Text>

          <View style={styles.featureRow}>
            <Text style={styles.featureChip}>Nhanh</Text>
            <Text style={styles.featureChip}>Đẹp</Text>
            <Text style={styles.featureChip}>Dễ chạm</Text>
          </View>
        </View>

        <View style={[styles.formCard, shadows.card]}>
          <Text style={styles.formTitle}>Đăng nhập shipper</Text>
          <Text style={styles.formSub}>Có thể dùng demo nếu backend chưa mở login</Text>

          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Tên đăng nhập"
            placeholderTextColor="#a17a62"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Mật khẩu"
            placeholderTextColor="#a17a62"
            secureTextEntry
            style={styles.input}
          />

          <Pressable onPress={tryLogin} disabled={loading} style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.92 }]}>
            <Text style={styles.primaryText}>{loading ? 'Đang vào...' : 'Vào app'}</Text>
          </Pressable>

          <Pressable onPress={loginWithDemo} style={({ pressed }) => [styles.demoBtn, pressed && { opacity: 0.92 }]}>
            <Text style={styles.demoText}>Dùng demo ngay</Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    gap: 18,
  },
  heroCard: {
    backgroundColor: 'rgba(255,248,237,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 28,
    padding: 22,
  },
  eyebrow: {
    color: '#ffd6b3',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fff',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
    marginTop: 8,
  },
  desc: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    fontWeight: '500',
  },
  featureRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 14,
  },
  featureChip: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '800',
  },
  formCard: {
    backgroundColor: '#fffdf8',
    borderRadius: 28,
    padding: 18,
    gap: 12,
  },
  formTitle: {
    color: colors.coffee,
    fontSize: 22,
    fontWeight: '900',
  },
  formSub: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -2,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: colors.coffee,
    fontSize: 15,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 15,
  },
  demoBtn: {
    backgroundColor: '#eff6ff',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  demoText: {
    color: colors.secondary,
    fontWeight: '900',
    fontSize: 15,
  },
})
