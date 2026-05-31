import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAdmin } from '../context/AdminContext'
import apiClient from '../lib/apiClient'
import { getRoleBadge } from '../lib/adminData'
import { colors, spacing, shadows, radius } from '../theme'

export function ProfileScreen() {
  const { admin, updateSession, logout } = useAdmin()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('profile')
  const [profileForm, setProfileForm] = useState({
    ho_ten: admin?.full_name || '',
    so_dien_thoai: admin?.phone || '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false })

  const role = admin?.role || admin?.vaiTro || 'STAFF'
  const roleBadge = getRoleBadge(role)
  const branchName = admin?.coSoTen || admin?.branch_code || 'Cửa hàng'

  const updateProfileMutation = useMutation({
    mutationFn: async (data) => {
      return apiClient.patch(`/users/profile`, data)
    },
    onSuccess: async (res) => {
      const updatedAdmin = {
        ...admin,
        full_name: profileForm.ho_ten,
        phone: profileForm.so_dien_thoai,
      }
      await updateSession(updatedAdmin)
      Alert.alert('Thành công', 'Đã cập nhật hồ sơ.')
    },
    onError: (err) => {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể cập nhật hồ sơ.')
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: async (data) => {
      return apiClient.post('/users/change-password', data)
    },
    onSuccess: () => {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      Alert.alert('Thành công', 'Đã đổi mật khẩu thành công.')
    },
    onError: (err) => {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể đổi mật khẩu.')
    },
  })

  const handleSaveProfile = () => {
    if (!profileForm.ho_ten.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập họ tên.')
      return
    }
    updateProfileMutation.mutate({
      ho_ten: profileForm.ho_ten.trim(),
      so_dien_thoai: profileForm.so_dien_thoai.trim(),
    })
  }

  const handleChangePassword = () => {
    if (!passwordForm.currentPassword) {
      Alert.alert('Lỗi', 'Vui lòng nhập mật khẩu hiện tại.')
      return
    }
    if (passwordForm.newPassword.length < 6) {
      Alert.alert('Lỗi', 'Mật khẩu mới phải ít nhất 6 ký tự.')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      Alert.alert('Lỗi', 'Mật khẩu xác nhận không khớp.')
      return
    }
    changePasswordMutation.mutate({
      mat_khau_cu: passwordForm.currentPassword,
      mat_khau_moi: passwordForm.newPassword,
    })
  }

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          await queryClient.clear()
          await logout()
        },
      },
    ])
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.screen}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.primary }]}>
          {/* Avatar */}
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { backgroundColor: '#ffffff' }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {(admin?.full_name || admin?.tenDangNhap || 'A')[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.adminInfo}>
              <Text style={styles.adminName}>{admin?.full_name || admin?.tenDangNhap || 'Admin'}</Text>
              <Text style={styles.adminEmail}>{admin?.email || ''}</Text>
              <View style={styles.infoRowBadges}>
                <View style={[styles.rolePill, { backgroundColor: '#ffffff20' }]}>
                  <Text style={[styles.rolePillText, { color: '#ffffff' }]}>{roleBadge.label}</Text>
                </View>
                <View style={styles.branchPill}>
                  <Ionicons name="storefront-outline" size={12} color="#ffffff" />
                  <Text style={styles.branchPillText}>{branchName}</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          {[
            { value: 'profile', label: '👤 Hồ sơ' },
            { value: 'password', label: '🔑 Mật khẩu' },
          ].map((tab) => (
            <Pressable
              key={tab.value}
              onPress={() => setActiveTab(tab.value)}
              style={[styles.tab, activeTab === tab.value && styles.tabActive]}
            >
              <Text style={[styles.tabText, activeTab === tab.value && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>
          {/* Profile Tab */}
          {activeTab === 'profile' ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Thông tin cá nhân</Text>

              {/* Read-only Info */}
              <View style={styles.readOnlySection}>
                {[
                  { label: 'Tên đăng nhập', value: admin?.tenDangNhap || '—' },
                  { label: 'Email', value: admin?.email || '—' },
                  { label: 'Vai trò', value: role },
                  { label: 'Chi nhánh', value: branchName },
                ].map(({ label, value }) => (
                  <View key={label} style={styles.readOnlyRow}>
                    <Text style={styles.readOnlyLabel}>{label}</Text>
                    <Text style={styles.readOnlyValue}>{value}</Text>
                  </View>
                ))}
              </View>

              {/* Editable fields */}
              <View style={styles.editSection}>
                <Text style={styles.editSectionTitle}>Chỉnh sửa</Text>
                {[
                  { key: 'ho_ten', label: 'Họ và tên', placeholder: 'Nhập họ và tên...', keyboard: 'default' },
                  { key: 'so_dien_thoai', label: 'Số điện thoại', placeholder: 'Nhập SĐT...', keyboard: 'phone-pad' },
                ].map(({ key, label, placeholder, keyboard }) => (
                  <View key={key} style={styles.fieldWrap}>
                    <Text style={styles.fieldLabel}>{label}</Text>
                    <TextInput
                      value={profileForm[key]}
                      onChangeText={(v) => setProfileForm((p) => ({ ...p, [key]: v }))}
                      placeholder={placeholder}
                      placeholderTextColor={colors.placeholder}
                      keyboardType={keyboard}
                      style={styles.input}
                    />
                  </View>
                ))}
              </View>

              <Pressable
                onPress={handleSaveProfile}
                disabled={updateProfileMutation.isPending}
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              >
                <View style={styles.saveBtnGradient}>
                  {updateProfileMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="save-outline" size={18} color="#fff" />}
                  <Text style={styles.saveBtnText}>
                    {updateProfileMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </Text>
                </View>
              </Pressable>

              {/* Logout */}
              <Pressable onPress={handleLogout} style={styles.logoutBtn}>
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                <Text style={styles.logoutBtnText}>Đăng xuất</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Password Tab */}
          {activeTab === 'password' ? (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Đổi mật khẩu</Text>
              <Text style={styles.formSub}>Nhập mật khẩu hiện tại và mật khẩu mới.</Text>

              {[
                { key: 'currentPassword', label: 'Mật khẩu hiện tại', toggleKey: 'current' },
                { key: 'newPassword', label: 'Mật khẩu mới', toggleKey: 'new' },
                { key: 'confirmPassword', label: 'Xác nhận mật khẩu mới', toggleKey: 'confirm' },
              ].map(({ key, label, toggleKey }) => (
                <View key={key} style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <View style={styles.pwdInputWrap}>
                    <TextInput
                      value={passwordForm[key]}
                      onChangeText={(v) => setPasswordForm((p) => ({ ...p, [key]: v }))}
                      placeholder={label}
                      placeholderTextColor={colors.placeholder}
                      secureTextEntry={!showPwd[toggleKey]}
                      style={[styles.input, { flex: 1, borderWidth: 0, marginBottom: 0, height: '100%' }]}
                    />
                    <Pressable onPress={() => setShowPwd((p) => ({ ...p, [toggleKey]: !p[toggleKey] }))} style={styles.eyeBtn}>
                      <Ionicons name={showPwd[toggleKey] ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                </View>
              ))}

              <Pressable
                onPress={handleChangePassword}
                disabled={changePasswordMutation.isPending}
                style={[styles.saveBtn, { backgroundColor: colors.primary }]}
              >
                <View style={styles.saveBtnGradient}>
                  {changePasswordMutation.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="key-outline" size={18} color="#fff" />}
                  <Text style={styles.saveBtnText}>
                    {changePasswordMutation.isPending ? 'Đang đổi...' : 'Đổi mật khẩu'}
                  </Text>
                </View>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    paddingLeft: 68,
    paddingBottom: spacing.lg,
  },
  avatarRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  avatarText: { fontSize: 28, fontWeight: '900', color: '#fff' },
  adminInfo: { flex: 1, gap: 4 },
  adminName: { fontSize: 18, fontWeight: '900', color: '#fff' },
  adminEmail: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  infoRowBadges: { flexDirection: 'row', gap: 8, marginTop: 4 },
  rolePill: { borderRadius: radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  rolePillText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  branchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  branchPillText: { fontSize: 10, fontWeight: '700', color: colors.muted },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  tabTextActive: { color: '#fff' },
  content: { flex: 1 },
  contentPad: { padding: spacing.md, paddingBottom: spacing.xxl },
  formCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
    ...shadows.card,
  },
  formTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  formSub: { fontSize: 13, color: colors.muted, marginTop: -8 },
  readOnlySection: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  readOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  readOnlyLabel: { fontSize: 13, color: colors.muted, fontWeight: '600' },
  readOnlyValue: { fontSize: 13, color: colors.text, fontWeight: '700' },
  editSection: { gap: spacing.sm },
  editSectionTitle: { fontSize: 12, fontWeight: '900', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldWrap: { gap: 6 },
  fieldLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 48,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  pwdInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingRight: spacing.md,
    height: 48,
  },
  eyeBtn: { padding: 4 },
  saveBtn: { borderRadius: radius.xl, overflow: 'hidden', marginTop: 4 },
  saveBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  saveBtnText: { fontSize: 15, fontWeight: '900', color: '#fff' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.xl,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.danger + '40',
    backgroundColor: colors.dangerBg,
  },
  logoutBtnText: { fontSize: 15, fontWeight: '900', color: colors.danger },
})
