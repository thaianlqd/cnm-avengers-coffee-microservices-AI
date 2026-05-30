import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useUser } from '../context/UserContext'
import { colors, spacing, shadows, radius } from '../theme'

export function LoginScreen() {
  const { login } = useUser()
  const [taiKhoan, setTaiKhoan] = useState('')
  const [matKhau, setMatKhau] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [focusField, setFocusField] = useState('')

  const handleLogin = async () => {
    const identifier = String(taiKhoan || '').trim()
    const password = String(matKhau || '').trim()

    if (!identifier || !password) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tài khoản và mật khẩu để tiếp tục.')
      return
    }

    setLoading(true)
    try {
      await login({ taiKhoan: identifier, matKhau: password })
    } catch (error) {
      const backendMessage = error?.response?.data?.message
      const statusCode = error?.response?.status ? ` (${error.response.status})` : ''
      const message = backendMessage || error?.message || `Không thể đăng nhập${statusCode}. Kiểm tra lại tài khoản hoặc mật khẩu.`
      Alert.alert('Đăng nhập thất bại', message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <LinearGradient
      colors={['#1a0a02', '#3d1a08', '#5c2910']}
      style={styles.container}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Brand */}
          <View style={styles.brandWrap}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>☕</Text>
            </View>
            <Text style={styles.brandName}>Avengers Coffee</Text>
            <Text style={styles.brandTagline}>Hương vị ngọt ngào mỗi ngày</Text>
          </View>

          {/* Login Card */}
          <View style={[styles.card, shadows.lg]}>
            <Text style={styles.cardTitle}>Chào mừng trở lại!</Text>
            <Text style={styles.cardSubtitle}>Đăng nhập để tiếp tục đặt hàng</Text>

            {/* Email / Username */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Email hoặc tên đăng nhập</Text>
              <View style={[styles.inputWrap, focusField === 'account' && styles.inputWrapFocus]}>
                <Ionicons name="person-outline" size={18} color={focusField === 'account' ? colors.primary : colors.muted} style={styles.inputIcon} />
                <TextInput
                  value={taiKhoan}
                  onChangeText={setTaiKhoan}
                  placeholder="Nhập email hoặc tài khoản"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  onFocus={() => setFocusField('account')}
                  onBlur={() => setFocusField('')}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Mật khẩu</Text>
              <View style={[styles.inputWrap, focusField === 'password' && styles.inputWrapFocus]}>
                <Ionicons name="lock-closed-outline" size={18} color={focusField === 'password' ? colors.primary : colors.muted} style={styles.inputIcon} />
                <TextInput
                  value={matKhau}
                  onChangeText={setMatKhau}
                  placeholder="Nhập mật khẩu"
                  placeholderTextColor={colors.placeholder}
                  secureTextEntry={!showPassword}
                  style={[styles.input, { flex: 1 }]}
                  onFocus={() => setFocusField('password')}
                  onBlur={() => setFocusField('')}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            {/* Login Button */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.88 }, loading && styles.loginBtnDisabled]}
            >
              <LinearGradient
                colors={loading ? ['#ccc', '#bbb'] : ['#f26b1d', '#d4560e']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginBtnGradient}
              >
                {loading ? (
                  <Text style={styles.loginBtnText}>Đang đăng nhập...</Text>
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={20} color="#fff" />
                    <Text style={styles.loginBtnText}>Đăng nhập</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>

            {/* Info */}
            <View style={styles.infoRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.muted} />
              <Text style={styles.infoText}>Đăng nhập bảo mật qua hệ thống tập trung</Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footerRow}>
            <Ionicons name="cafe-outline" size={14} color="rgba(255,255,255,0.5)" />
            <Text style={styles.footerText}>Avengers Coffee © 2024</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  brandWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(242, 107, 29, 0.2)',
    borderWidth: 2,
    borderColor: 'rgba(242, 107, 29, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  logoEmoji: {
    fontSize: 44,
  },
  brandName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
  },
  brandTagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 6,
    fontWeight: '500',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.xl,
    fontWeight: '500',
  },
  fieldWrap: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  inputWrapFocus: {
    borderColor: colors.primary,
    backgroundColor: '#fff9f5',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  eyeBtn: {
    padding: 4,
  },
  loginBtn: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  loginBtnDisabled: {
    opacity: 0.7,
  },
  loginBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  loginBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  infoText: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.xl,
  },
  footerText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
  },
})