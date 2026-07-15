import React, { useState, useRef, useEffect } from 'react'
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
  Dimensions,
  FlatList,
  ActivityIndicator,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useUser } from '../context/UserContext'
import { colors, spacing, shadows } from '../theme'

const BANNERS = [
  { id: '1', url: 'https://minio.thecoffeehouse.com/image/admin/1781597754_banner-1029x720.png' },
  { id: '2', url: 'https://minio.thecoffeehouse.com/image/admin/1782873302_banner-app-1029x720px.jpg' },
  { id: '3', url: 'https://minio.thecoffeehouse.com/image/admin/1779874593_banner-app-1029x720px.jpg' },
  { id: '4', url: 'https://minio.thecoffeehouse.com/image/admin/1779874611_banner-app-1029x720px.jpg' },
]

export function LoginScreen({ navigation }) {
  const { login } = useUser()
  const { width: windowWidth } = useWindowDimensions()
  const [sliderWidth, setSliderWidth] = useState(windowWidth || Dimensions.get('window').width)

  const bannerWidth = sliderWidth > 0 ? sliderWidth : (windowWidth || Dimensions.get('window').width || 400)
  const bannerHeight = Math.round(bannerWidth * (720 / 1029))

  const [taiKhoan, setTaiKhoan] = useState('')
  const [matKhau, setMatKhau] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [focusField, setFocusField] = useState('')
  const [activeSlide, setActiveSlide] = useState(0)

  const flatListRef = useRef(null)

  // Auto-slide banner every 3.5s
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((prev) => {
        const nextIndex = (prev + 1) % BANNERS.length
        flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true })
        return nextIndex
      })
    }, 3500)
    return () => clearInterval(timer)
  }, [])

  const handleBack = () => {
    if (navigation?.canGoBack()) {
      navigation.goBack()
    } else {
      navigation?.navigate('Tabs')
    }
  }

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
      handleBack()
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
    <View style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Banner Slider Section */}
          <View
            style={[styles.bannerContainer, { width: '100%', height: bannerHeight }]}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width
              if (w > 0 && Math.abs(w - sliderWidth) > 1) {
                setSliderWidth(w)
              }
            }}
          >
            <FlatList
              ref={flatListRef}
              data={BANNERS}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.id}
              onMomentumScrollEnd={(event) => {
                const offsetX = event.nativeEvent.contentOffset.x
                const index = Math.round(offsetX / bannerWidth)
                if (index >= 0 && index < BANNERS.length) {
                  setActiveSlide(index)
                }
              }}
              getItemLayout={(data, index) => ({
                length: bannerWidth,
                offset: bannerWidth * index,
                index,
              })}
              renderItem={({ item }) => (
                <View style={{ width: bannerWidth, height: bannerHeight }}>
                  <Image source={{ uri: item.url }} style={styles.slideImage} resizeMode="contain" />
                </View>
              )}
            />

            {/* Back Arrow Button (Top Left) */}
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] }]}
              hitSlop={12}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </Pressable>

            {/* Pagination Dots */}
            <View style={styles.paginationWrap}>
              {BANNERS.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    activeSlide === index ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              ))}
            </View>
          </View>

          {/* Form Content Section matching TCH style */}
          <View style={styles.formContainer}>
            <Text style={styles.welcomeTitle}>Chào mừng</Text>
            <Text style={styles.welcomeSubtitle}>Nhập số điện thoại của bạn để đăng nhập</Text>

            {/* Account / Phone Input */}
            <View style={[styles.inputPill, focusField === 'account' && styles.inputPillFocus]}>
              <Ionicons
                name="phone-portrait-outline"
                size={20}
                color={focusField === 'account' ? '#ea8025' : '#64748b'}
                style={styles.inputIcon}
              />
              <TextInput
                value={taiKhoan}
                onChangeText={setTaiKhoan}
                placeholder="Số điện thoại di động hoặc tài khoản"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                onFocus={() => setFocusField('account')}
                onBlur={() => setFocusField('')}
              />
            </View>

            {/* Password Input */}
            <View style={[styles.inputPill, focusField === 'password' && styles.inputPillFocus, { marginTop: 14 }]}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={focusField === 'password' ? '#ea8025' : '#64748b'}
                style={styles.inputIcon}
              />
              <TextInput
                value={matKhau}
                onChangeText={setMatKhau}
                placeholder="Nhập mật khẩu"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPassword}
                style={[styles.input, { flex: 1 }]}
                onFocus={() => setFocusField('password')}
                onBlur={() => setFocusField('')}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                hitSlop={10}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color="#64748b"
                />
              </Pressable>
            </View>

            {/* Continue Button */}
            <Pressable
              onPress={handleLogin}
              disabled={loading}
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
                loading && styles.submitBtnDisabled,
              ]}
            >
              <LinearGradient
                colors={loading ? ['#cbd5e1', '#94a3b8'] : ['#f26b1d', '#ea8025']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitBtnGradient}
              >
                {loading ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.submitBtnText}>ĐANG XỬ LÝ...</Text>
                  </View>
                ) : (
                  <Text style={styles.submitBtnText}>TIẾP TỤC</Text>
                )}
              </LinearGradient>
            </Pressable>

            {/* Back Link */}
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [styles.backLinkBtn, pressed && { opacity: 0.7 }]}
              hitSlop={16}
            >
              <Text style={styles.backLinkText}>Quay lại</Text>
            </Pressable>

            {/* Footer Security Note */}
            <View style={styles.securityRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color="#94a3b8" />
              <Text style={styles.securityText}>Bảo mật thông tin đăng nhập bởi Avengers Coffee</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    backgroundColor: '#ffffff',
    paddingBottom: 40,
  },
  bannerContainer: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#f8fafc', // Clean light backdrop for banner
    overflow: 'hidden',
  },
  slideWrap: {
    width: '100%',
    height: '100%',
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  backBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 48 : 28,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  paginationWrap: {
    position: 'absolute',
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 20,
    backgroundColor: '#ea8025',
  },
  dotInactive: {
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
  },
  formContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingTop: 32,
    alignItems: 'center',
  },
  welcomeTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ea8025',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 28,
    textAlign: 'center',
    fontWeight: '500',
  },
  inputPill: {
    width: '100%',
    height: 52,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#94a3b8',
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  inputPillFocus: {
    borderColor: '#ea8025',
    borderWidth: 1.5,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
  },
  eyeBtn: {
    paddingLeft: 8,
    paddingRight: 4,
  },
  submitBtn: {
    width: '100%',
    height: 52,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 24,
    ...shadows.sm,
  },
  submitBtnDisabled: {
    opacity: 0.7,
  },
  submitBtnGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  backLinkBtn: {
    marginTop: 24,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  backLinkText: {
    color: '#1e3a8a',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 36,
  },
  securityText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
})