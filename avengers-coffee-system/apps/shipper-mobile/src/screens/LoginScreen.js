import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useShipper } from '../context/ShipperContext'
import { colors, radius, spacing, typography, shadows } from '../theme'
import { Ionicons } from '@expo/vector-icons'

const { width, height } = Dimensions.get('window')

export function LoginScreen() {
  const { login } = useShipper()
  const [username, setUsername] = useState('shipper01')
  const [password, setPassword] = useState('123456')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)

  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(40)).current
  const logoScale = useRef(new Animated.Value(0.8)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start()
  }, [])

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ tài khoản và mật khẩu')
      return
    }
    setLoading(true)
    setError('')
    try {
      await login({ username, password })
    } catch (err) {
      setError(err.response?.data?.message || 'Tài khoản hoặc mật khẩu không đúng')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Red gradient header */}
      <LinearGradient
        colors={['#B5141C', '#E31A23', '#FF4D55']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        {/* Decorative circles */}
        <View style={styles.circle1} />
        <View style={styles.circle2} />
        <View style={styles.circle3} />

        <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
          {/* VTP-style badge */}
          <View style={styles.logoBadge}>
            <Ionicons name="bicycle" size={44} color="#fff" />
          </View>
          <Text style={styles.appName}>AVENGERS</Text>
          <Text style={styles.appBrand}>SHIPPER</Text>
          <View style={styles.taglineRow}>
            <View style={styles.taglineDot} />
            <Text style={styles.tagline}>ĐỐI TÁC GIAO HÀNG CHUYÊN NGHIỆP</Text>
            <View style={styles.taglineDot} />
          </View>
        </Animated.View>
      </LinearGradient>

      {/* Form white card */}
      <Animated.View
        style={[
          styles.formCard,
          { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
        ]}
      >
        <Text style={styles.formTitle}>Đăng nhập</Text>
        <Text style={styles.formSubtitle}>Chào mừng bạn quay trở lại 👋</Text>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color={colors.primary} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Username */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Tài khoản</Text>
          <View style={styles.inputWrapper}>
            <View style={styles.inputIconBox}>
              <Ionicons name="person" size={18} color={colors.primary} />
            </View>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={(t) => { setUsername(t); setError('') }}
              placeholder="Nhập tên đăng nhập"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              editable={!loading}
            />
          </View>
        </View>

        {/* Password */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Mật khẩu</Text>
          <View style={styles.inputWrapper}>
            <View style={styles.inputIconBox}>
              <Ionicons name="lock-closed" size={18} color={colors.primary} />
            </View>
            <TextInput
              style={[styles.input, { paddingRight: 50 }]}
              value={password}
              onChangeText={(t) => { setPassword(t); setError('') }}
              placeholder="Nhập mật khẩu"
              placeholderTextColor={colors.placeholder}
              secureTextEntry={!showPass}
              editable={!loading}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPass(!showPass)}
            >
              <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Login Button */}
        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={loading ? ['#ccc', '#ccc'] : ['#E31A23', '#B5141C']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.loginBtn}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-in" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.loginBtnText}>ĐĂNG NHẬP</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {/* Info note */}
        <View style={styles.infoNote}>
          <Ionicons name="information-circle-outline" size={16} color={colors.muted} />
          <Text style={styles.infoText}>Mật khẩu mặc định: 123456</Text>
        </View>
      </Animated.View>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
        <Text style={styles.bottomText}>Avengers Coffee © 2025 — Bảo mật cao</Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  // Header gradient
  headerGradient: {
    height: height * 0.38,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  circle1: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40,
  },
  circle2: {
    position: 'absolute', width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.08)', bottom: -30, left: -20,
  },
  circle3: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.06)', top: 20, left: 30,
  },
  logoContainer: {
    alignItems: 'center',
    zIndex: 10,
  },
  logoBadge: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    ...shadows.lg,
  },
  appName: {
    fontSize: 26, fontWeight: '900', color: '#fff',
    letterSpacing: 4, lineHeight: 30,
  },
  appBrand: {
    fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)',
    letterSpacing: 6, marginTop: 2,
  },
  taglineRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6,
  },
  taglineDot: {
    width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.6)',
  },
  tagline: {
    fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.5,
  },

  // Form card
  formCard: {
    flex: 1,
    backgroundColor: colors.surface,
    marginHorizontal: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    ...shadows.lg,
  },
  formTitle: {
    fontSize: 22, fontWeight: '800', color: colors.text,
  },
  formSubtitle: {
    fontSize: 14, color: colors.muted, marginTop: 4, marginBottom: spacing.lg,
  },

  // Error
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primaryBg,
    padding: spacing.md, borderRadius: radius.md,
    marginBottom: spacing.md,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
    gap: 8,
  },
  errorText: { color: colors.primaryDark, fontSize: 13, flex: 1 },

  // Inputs
  inputGroup: { marginBottom: spacing.md },
  label: {
    fontSize: 13, fontWeight: '700', color: colors.text,
    marginBottom: 6, letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border,
    overflow: 'hidden',
  },
  inputIconBox: {
    width: 46, height: 52, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primaryBg,
    borderRightWidth: 1, borderRightColor: colors.border,
  },
  input: {
    flex: 1, height: 52,
    paddingHorizontal: spacing.md,
    fontSize: 15, color: colors.text,
  },
  eyeBtn: {
    position: 'absolute', right: 14, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },

  // Login Button
  loginBtn: {
    height: 54, borderRadius: radius.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.sm,
    ...shadows.primary,
  },
  loginBtnText: {
    color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 1.5,
  },

  // Info note
  infoNote: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', marginTop: spacing.md, gap: 6,
  },
  infoText: { fontSize: 12, color: colors.muted },

  // Bottom
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    gap: 6,
  },
  bottomText: { fontSize: 11, color: colors.muted },
})
