import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useAdmin } from '../context/AdminContext'

const TEAL = '#0ea5e9'
const ORANGE = '#f26b1d'

export function LoginScreen() {
  const { login, loginStatus } = useAdmin()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  const handleLogin = async () => {
    const id = identifier.trim()
    if (!id || !password) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên đăng nhập và mật khẩu.')
      return
    }
    try {
      await login({ identifier: id, password })
    } catch (err) {
      // error shown via loginStatus.error
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient colors={['#0d0a08', '#1a1410', '#2a1e14']} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Logo */}
          <View style={styles.logoSection}>
            <LinearGradient colors={[ORANGE, '#d4560e']} style={styles.logoCircle}>
              <Text style={styles.logoEmoji}>☕</Text>
            </LinearGradient>
            <Text style={styles.brandName}>Avengers Admin</Text>
            <Text style={styles.brandSub}>STAFF CONSOLE</Text>
          </View>

          {/* Tag lines */}
          <View style={styles.heroSection}>
            <Text style={styles.heroTitle}>Điều hành toàn bộ{'\n'}ca làm việc trên{'\n'}một màn hình</Text>
            <Text style={styles.heroSub}>
              Theo dõi đơn hàng, cập nhật trạng thái, chốt ca tiền mặt và tạo hóa đơn POS ngay trong cùng một giao diện.
            </Text>
            <View style={styles.heroTags}>
              {['Luồng xử lý đơn', 'Thực đơn và tồn kho', 'Đối soát cuối ca'].map((tag) => (
                <View key={tag} style={styles.heroTag}>
                  <Text style={styles.heroTagText}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Đăng nhập nhân viên</Text>
            <Text style={styles.cardSub}>
              Đăng nhập bằng tài khoản đã được tạo thực tế trong hệ thống.
            </Text>

            {/* Error */}
            {loginStatus.error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
                <Text style={styles.errorText}>{loginStatus.error}</Text>
              </View>
            ) : null}

            {/* Identifier */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Tên đăng nhập hoặc Email</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="person-outline" size={18} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  value={identifier}
                  onChangeText={setIdentifier}
                  placeholder="Ví dụ: thaian_admin"
                  placeholderTextColor="#4b5563"
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="next"
                  style={styles.input}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Mật khẩu</Text>
              <View style={styles.inputWrap}>
                <Ionicons name="lock-closed-outline" size={18} color="#6b7280" style={styles.inputIcon} />
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mật khẩu theo tài khoản cấp thực tế"
                  placeholderTextColor="#4b5563"
                  secureTextEntry={!showPwd}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  style={[styles.input, { flex: 1 }]}
                />
                <Pressable onPress={() => setShowPwd((p) => !p)} style={styles.eyeBtn}>
                  <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={18} color="#6b7280" />
                </Pressable>
              </View>
            </View>

            {/* Login Button */}
            <Pressable
              onPress={handleLogin}
              disabled={loginStatus.loading}
              style={styles.loginBtnWrap}
            >
              <LinearGradient
                colors={loginStatus.loading ? ['#374151', '#374151'] : [TEAL, '#0284c7']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.loginBtnGrad}
              >
                {loginStatus.loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="log-in-outline" size={20} color="#fff" />
                )}
                <Text style={styles.loginBtnText}>
                  {loginStatus.loading ? 'Đang đăng nhập...' : 'Đăng nhập vào Admin'}
                </Text>
              </LinearGradient>
            </Pressable>

            {/* Hints */}
            <View style={styles.hintBox}>
              <Text style={styles.hintItem}>• Ví dụ: username hoặc email</Text>
              <Text style={styles.hintItem}>• Ví dụ: manager@7 hoặc manager@avengers.vn</Text>
              <Text style={styles.hintItem}>• Mật khẩu theo tài khoản được cấp thực tế</Text>
            </View>
          </View>

          {/* Role info */}
          <View style={styles.roleRow}>
            {[
              { role: 'STAFF', color: '#22c55e', desc: 'Vận hành đơn & ca' },
              { role: 'MANAGER', color: TEAL, desc: 'Quản lý chi nhánh' },
              { role: 'ADMIN', color: ORANGE, desc: 'Toàn hệ thống' },
            ].map(({ role, color, desc }) => (
              <View key={role} style={[styles.rolePill, { borderColor: color + '40' }]}>
                <View style={[styles.roleDot, { backgroundColor: color }]} />
                <View>
                  <Text style={[styles.roleLabel, { color }]}>{role}</Text>
                  <Text style={styles.roleDesc}>{desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    gap: 24,
  },
  logoSection: {
    alignItems: 'center',
    gap: 8,
  },
  logoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#f26b1d',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  logoEmoji: { fontSize: 34 },
  brandName: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  brandSub: { fontSize: 11, fontWeight: '700', color: '#6b7280', letterSpacing: 2 },
  heroSection: { gap: 12 },
  heroTitle: { fontSize: 30, fontWeight: '900', color: '#fff', lineHeight: 38 },
  heroSub: { fontSize: 13, color: '#9ca3af', lineHeight: 20 },
  heroTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  heroTag: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#374151',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1f2937',
  },
  heroTagText: { fontSize: 11, fontWeight: '700', color: '#d1d5db' },
  card: {
    backgroundColor: '#1c1c1e',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a2e',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  cardTitle: { fontSize: 20, fontWeight: '900', color: '#fff' },
  cardSub: { fontSize: 12, color: '#6b7280', lineHeight: 18, marginTop: -6 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ef444415',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ef444430',
  },
  errorText: { flex: 1, fontSize: 13, color: '#ef4444', fontWeight: '600' },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#374151',
    height: 50,
    paddingRight: 8,
  },
  inputIcon: { paddingHorizontal: 12 },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  eyeBtn: { padding: 8 },
  loginBtnWrap: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  loginBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
  },
  loginBtnText: { fontSize: 16, fontWeight: '900', color: '#fff' },
  hintBox: { gap: 4 },
  hintItem: { fontSize: 11, color: '#4b5563', fontWeight: '500' },
  roleRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  rolePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    backgroundColor: '#111827',
    minWidth: 90,
  },
  roleDot: { width: 8, height: 8, borderRadius: 4 },
  roleLabel: { fontSize: 11, fontWeight: '900' },
  roleDesc: { fontSize: 9, color: '#6b7280', fontWeight: '500' },
})
