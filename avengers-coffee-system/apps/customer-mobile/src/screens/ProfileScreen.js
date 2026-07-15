import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import {
  formatDateOnly,
  formatCurrency,
  getUserDisplayName,
  getUserId,
  normalizeAddress,
  safeArray,
} from '../lib/customerData'
import { colors, spacing, shadows, radius } from '../theme'

const MEMBERSHIP_CONFIG = {
  MEMBER:  { label: 'Thành viên', color: '#9ca3af', bg: '#f9fafb', gradient: ['#9ca3af', '#6b7280'], icon: '🎖️' },
  SILVER:  { label: 'Bạc',        color: '#64748b', bg: '#f8fafc', gradient: ['#94a3b8', '#64748b'], icon: '🥈' },
  GOLD:    { label: 'Vàng',       color: '#d97706', bg: '#fffbeb', gradient: ['#fbbf24', '#d97706'], icon: '🥇' },
  DIAMOND: { label: 'Kim Cương',  color: '#0ea5e9', bg: '#f0f9ff', gradient: ['#38bdf8', '#0ea5e9'], icon: '💎' },
}

const TABS = [
  { id: 'profile', label: 'Hồ sơ', icon: 'person-outline' },
  { id: 'password', label: 'Mật khẩu', icon: 'lock-closed-outline' },
  { id: 'addresses', label: 'Địa chỉ', icon: 'location-outline' },
  { id: 'reviews', label: 'Đánh giá', icon: 'star-outline' },
]

function StarRating({ rating, onRate, size = 24 }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Pressable key={star} onPress={() => onRate?.(star)}>
          <Ionicons
            name={star <= rating ? 'star' : 'star-outline'}
            size={size}
            color={star <= rating ? '#f59e0b' : colors.border}
          />
        </Pressable>
      ))}
    </View>
  )
}

export function ProfileScreen({ navigation }) {
  const { user, logout, updateSession } = useUser()
  const userId = getUserId(user)
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('profile')
  const [profileForm, setProfileForm] = useState({ ho_ten: '', so_dien_thoai: '', avatar_url: '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [addressForm, setAddressForm] = useState({ tenDiaChi: '', diaChiDayDu: '', ghiChu: '', macDinh: false })
  const [editingAddressId, setEditingAddressId] = useState(null)
  const [showPasswordToggle, setShowPasswordToggle] = useState({ current: false, new: false, confirm: false })
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarModalVisible, setAvatarModalVisible] = useState(false)
  const [tempAvatarUrl, setTempAvatarUrl] = useState('')

  const profileQuery = useQuery({
    queryKey: ['customer', 'profile', userId],
    queryFn: async () => apiClient.get(`/users/${userId}/profile`),
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  })

  const addressesQuery = useQuery({
    queryKey: ['customer', 'addresses', userId],
    queryFn: async () => {
      const response = await apiClient.get(`/users/${userId}/addresses`)
      return safeArray(response).map(normalizeAddress)
    },
    enabled: Boolean(userId),
  })

  const loyaltyQuery = useQuery({
    queryKey: ['customer', 'loyalty', userId, 'profile'],
    queryFn: async () => apiClient.get(`/users/${userId}/loyalty`),
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
  })

  const reviewsQuery = useQuery({
    queryKey: ['customer', 'reviews', userId],
    queryFn: async () => {
      const response = await apiClient.get(`/customers/${userId}/reviews`)
      return safeArray(response?.items || response)
    },
    enabled: Boolean(userId) && activeTab === 'reviews',
    staleTime: 30 * 1000,
  })

  const notificationsQuery = useQuery({
    queryKey: ['customer', 'notifications', userId],
    queryFn: async () => {
      const response = await apiClient.get(`/customers/${userId}/notifications?limit=10`)
      return response
    },
    enabled: Boolean(userId),
    staleTime: 30 * 1000,
  })

  const profile = profileQuery.data || null
  const addresses = addressesQuery.data || []
  const loyalty = loyaltyQuery.data || null
  const reviews = reviewsQuery.data || []
  const notifications = safeArray(notificationsQuery.data?.items || notificationsQuery.data)
  const unreadCount = Number(notificationsQuery.data?.unreadCount || 0)

  const diemLoyalty = Number(loyalty?.diem ?? user?.loyalty_points ?? 0)
  const tier = loyalty?.hang_thanh_vien?.ma_hang || user?.membership_tier || 'MEMBER'
  const tierConfig = MEMBERSHIP_CONFIG[tier] || MEMBERSHIP_CONFIG.MEMBER
  const diemCanLen = loyalty?.hang_thanh_vien?.diem_can_len_hang ?? null
  const diemBatDau = loyalty?.hang_thanh_vien?.diem_bat_dau_hang ?? 0
  const phanTram = diemCanLen != null
    ? Math.min(100, Math.round(((diemLoyalty - diemBatDau) / Math.max(diemCanLen - diemBatDau, 1)) * 100))
    : 100

  useEffect(() => {
    if (profile) {
      setProfileForm({
        ho_ten: profile.ho_ten || '',
        so_dien_thoai: profile.so_dien_thoai || '',
        avatar_url: profile.avatar_url || '',
      })
      setAvatarPreview(profile.avatar_url || null)
    }
  }, [profile])

  const updateProfileMutation = useMutation({
    mutationFn: async (payload) => apiClient.patch(`/users/${userId}/profile`, payload),
    onSuccess: async (response) => {
      const nextUser = {
        ...user,
        ...response?.user,
        full_name: response?.user?.ho_ten || profileForm.ho_ten,
        phone: response?.user?.so_dien_thoai || profileForm.so_dien_thoai,
        avatar_url: response?.user?.avatar_url || profileForm.avatar_url,
      }
      await updateSession(nextUser)
      await queryClient.invalidateQueries({ queryKey: ['customer', 'profile', userId] })
      Alert.alert('Thành công', 'Thông tin cá nhân đã được cập nhật.')
    },
    onError: (error) => {
      Alert.alert('Lỗi', error?.response?.data?.message || 'Không thể cập nhật thông tin.')
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: async (payload) => apiClient.post(`/users/${userId}/change-password`, payload),
    onSuccess: () => {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      Alert.alert('Thành công', 'Mật khẩu đã được thay đổi.')
    },
    onError: (error) => {
      Alert.alert('Lỗi', error?.response?.data?.message || 'Không thể đổi mật khẩu.')
    },
  })

  const saveAddressMutation = useMutation({
    mutationFn: async (payload) => {
      if (editingAddressId) {
        return apiClient.patch(`/users/${userId}/addresses/${editingAddressId}`, payload)
      }
      return apiClient.post(`/users/${userId}/addresses`, payload)
    },
    onSuccess: async () => {
      setAddressForm({ tenDiaChi: '', diaChiDayDu: '', ghiChu: '', macDinh: false })
      setEditingAddressId(null)
      await queryClient.invalidateQueries({ queryKey: ['customer', 'addresses', userId] })
      Alert.alert('Thành công', editingAddressId ? 'Địa chỉ đã được cập nhật.' : 'Địa chỉ đã được thêm.')
    },
    onError: (error) => {
      Alert.alert('Lỗi', error?.response?.data?.message || 'Không thể lưu địa chỉ.')
    },
  })

  const defaultAddressMutation = useMutation({
    mutationFn: async (addressId) => apiClient.patch(`/users/${userId}/addresses/${addressId}/default`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'addresses', userId] })
    },
  })

  const deleteAddressMutation = useMutation({
    mutationFn: async (addressId) => apiClient.delete(`/users/${userId}/addresses/${addressId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'addresses', userId] })
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: async () => apiClient.patch(`/customers/${userId}/notifications/read-all`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customer', 'notifications', userId] })
    },
  })

  const handleSaveProfile = () => {
    if (!profileForm.ho_ten.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập họ tên.')
      return
    }
    updateProfileMutation.mutate({
      hoTen: profileForm.ho_ten,
      soDienThoai: profileForm.so_dien_thoai,
      avatarUrl: profileForm.avatar_url,
    })
  }

  const handleChangePassword = () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      Alert.alert('Thiếu thông tin', 'Nhập mật khẩu hiện tại và mật khẩu mới.')
      return
    }
    if (passwordForm.newPassword.length < 6) {
      Alert.alert('Mật khẩu quá ngắn', 'Mật khẩu mới phải có ít nhất 6 ký tự.')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      Alert.alert('Không khớp', 'Xác nhận mật khẩu không khớp.')
      return
    }
    changePasswordMutation.mutate({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
  }

  const handleSaveAddress = () => {
    if (!addressForm.tenDiaChi.trim() || !addressForm.diaChiDayDu.trim()) {
      Alert.alert('Thiếu thông tin', 'Nhập tên địa chỉ và địa chỉ đầy đủ.')
      return
    }
    saveAddressMutation.mutate(addressForm)
  }

  const handleLogout = () => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc muốn đăng xuất khỏi ứng dụng?',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: () => logout() },
      ]
    )
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <View style={styles.tabContent}>
            {/* Avatar */}
            <View style={styles.avatarSection}>
              <Pressable onPress={() => {
                setTempAvatarUrl(profileForm.avatar_url || '')
                setAvatarModalVisible(true)
              }}>
                {avatarPreview ? (
                  <Image source={{ uri: avatarPreview }} style={styles.avatarImage} />
                ) : (
                  <LinearGradient colors={['#f26b1d', '#d4560e']} style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>
                      {String(getUserDisplayName(user))[0]?.toUpperCase() || '☕'}
                    </Text>
                  </LinearGradient>
                )}
                <View style={styles.avatarEditBadge}>
                  <Ionicons name="camera-outline" size={14} color="#fff" />
                </View>
              </Pressable>
              <View style={styles.avatarInfo}>
                <Text style={styles.avatarName}>{getUserDisplayName(user)}</Text>
                <Text style={styles.avatarEmail}>{profile?.email || user?.email || ''}</Text>
                <Text style={styles.avatarSince}>
                  Thành viên từ: {formatDateOnly(profile?.ngay_tao) || 'N/A'}
                </Text>
              </View>
            </View>

            {/* Profile Form */}
            <View style={styles.formSection}>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Họ và tên</Text>
                <TextInput
                  value={profileForm.ho_ten}
                  onChangeText={(v) => setProfileForm(p => ({ ...p, ho_ten: v }))}
                  placeholder="Nhập họ và tên"
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Email</Text>
                <TextInput
                  value={profile?.email || ''}
                  editable={false}
                  style={[styles.input, styles.inputDisabled]}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Số điện thoại</Text>
                <TextInput
                  value={profileForm.so_dien_thoai}
                  onChangeText={(v) => setProfileForm(p => ({ ...p, so_dien_thoai: v }))}
                  placeholder="Nhập số điện thoại"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>

              <Pressable
                onPress={handleSaveProfile}
                disabled={updateProfileMutation.isPending}
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.88 }]}
              >
                <LinearGradient colors={['#f26b1d', '#d4560e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnGradient}>
                  {updateProfileMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="save-outline" size={18} color="#fff" />
                  )}
                  <Text style={styles.primaryBtnText}>
                    {updateProfileMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>

            {/* Notifications Preview */}
            {notifications.length > 0 ? (
              <View style={styles.notifSection}>
                <View style={styles.notifHeader}>
                  <View style={styles.notifTitleRow}>
                    <Ionicons name="notifications-outline" size={18} color={colors.primary} />
                    <Text style={styles.notifTitle}>Thông báo</Text>
                    {unreadCount > 0 ? (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
                      </View>
                    ) : null}
                  </View>
                  {unreadCount > 0 ? (
                    <Pressable onPress={() => markAllReadMutation.mutate()}>
                      <Text style={styles.markAllRead}>Đánh dấu đọc tất</Text>
                    </Pressable>
                  ) : null}
                </View>
                {notifications.slice(0, 3).map((notif, i) => (
                  <View key={notif.id || i} style={[styles.notifItem, !notif.da_doc && styles.notifItemUnread]}>
                    <View style={[styles.notifDot, notif.da_doc && styles.notifDotRead]} />
                    <View style={styles.notifContent}>
                      <Text style={styles.notifTitle2}>{notif.tieu_de || notif.title || 'Thông báo'}</Text>
                      <Text style={styles.notifBody} numberOfLines={2}>{notif.noi_dung || notif.content || ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Login or Logout */}
            {!user || getUserId(user) === 'guest-customer' ? (
              <Pressable
                onPress={() => navigation?.navigate('Login')}
                style={({ pressed }) => [styles.logoutBtn, { borderColor: '#ea8025', backgroundColor: '#fff9f5' }, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="log-in-outline" size={20} color="#ea8025" />
                <Text style={[styles.logoutBtnText, { color: '#ea8025', fontWeight: '800' }]}>Đăng nhập ngay</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleLogout}
                style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons name="log-out-outline" size={18} color={colors.danger} />
                <Text style={styles.logoutBtnText}>Đăng xuất</Text>
              </Pressable>
            )}
          </View>
        )

      case 'password':
        return (
          <View style={styles.tabContent}>
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>Đổi mật khẩu</Text>
              <Text style={styles.formSectionSubtitle}>Nhập mật khẩu hiện tại và mật khẩu mới để cập nhật.</Text>

              {[
                { field: 'currentPassword', label: 'Mật khẩu hiện tại', toggleKey: 'current' },
                { field: 'newPassword', label: 'Mật khẩu mới', toggleKey: 'new' },
                { field: 'confirmPassword', label: 'Xác nhận mật khẩu mới', toggleKey: 'confirm' },
              ].map(({ field, label, toggleKey }) => (
                <View key={field} style={styles.formField}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <View style={styles.passwordInputWrap}>
                    <TextInput
                      value={passwordForm[field]}
                      onChangeText={(v) => setPasswordForm(p => ({ ...p, [field]: v }))}
                      placeholder={label}
                      placeholderTextColor={colors.placeholder}
                      secureTextEntry={!showPasswordToggle[toggleKey]}
                      style={[styles.input, { flex: 1, borderWidth: 0, marginBottom: 0 }]}
                    />
                    <Pressable
                      onPress={() => setShowPasswordToggle(p => ({ ...p, [toggleKey]: !p[toggleKey] }))}
                      style={styles.eyeBtn}
                    >
                      <Ionicons name={showPasswordToggle[toggleKey] ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                </View>
              ))}

              <Pressable
                onPress={handleChangePassword}
                disabled={changePasswordMutation.isPending}
                style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.88 }]}
              >
                <LinearGradient colors={['#f26b1d', '#d4560e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnGradient}>
                  {changePasswordMutation.isPending ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Ionicons name="key-outline" size={18} color="#fff" />
                  )}
                  <Text style={styles.primaryBtnText}>
                    {changePasswordMutation.isPending ? 'Đang đổi...' : 'Đổi mật khẩu'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        )

      case 'addresses':
        return (
          <View style={styles.tabContent}>
            {/* Address List */}
            {addressesQuery.isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : addresses.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="location-outline" size={40} color={colors.border} />
                <Text style={styles.emptyTitle}>Chưa có địa chỉ</Text>
                <Text style={styles.emptyText}>Thêm địa chỉ để đặt hàng nhanh hơn.</Text>
              </View>
            ) : (
              <View style={styles.addressList}>
                {addresses.map((address) => (
                  <View key={address.id} style={styles.addressCard}>
                    <View style={styles.addressCardHeader}>
                      <View style={styles.addressNameRow}>
                        <Ionicons name="location" size={14} color={colors.primary} />
                        <Text style={styles.addressName}>{address.ten_dia_chi || 'Địa chỉ'}</Text>
                        {address.mac_dinh ? (
                          <View style={styles.defaultBadge}>
                            <Text style={styles.defaultBadgeText}>Mặc định</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <Text style={styles.addressText}>{address.dia_chi_day_du}</Text>
                    {address.ghi_chu ? <Text style={styles.addressNote}>📝 {address.ghi_chu}</Text> : null}
                    <View style={styles.addressActions}>
                      {!address.mac_dinh ? (
                        <Pressable
                          onPress={() => defaultAddressMutation.mutate(address.id)}
                          style={styles.addressActionBtn}
                        >
                          <Ionicons name="star-outline" size={13} color={colors.primary} />
                          <Text style={styles.addressActionText}>Đặt mặc định</Text>
                        </Pressable>
                      ) : null}
                      <Pressable
                        onPress={() => {
                          setEditingAddressId(address.id)
                          setAddressForm({
                            tenDiaChi: address.ten_dia_chi || '',
                            diaChiDayDu: address.dia_chi_day_du || '',
                            ghiChu: address.ghi_chu || '',
                            macDinh: address.mac_dinh,
                          })
                        }}
                        style={[styles.addressActionBtn, { backgroundColor: '#fff9f5', borderColor: '#ffe0c8' }]}
                      >
                        <Ionicons name="pencil-outline" size={13} color={colors.primary} />
                        <Text style={[styles.addressActionText, { color: colors.primary }]}>Sửa</Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          Alert.alert('Xóa địa chỉ', 'Xóa địa chỉ này?', [
                            { text: 'Hủy', style: 'cancel' },
                            { text: 'Xóa', style: 'destructive', onPress: () => deleteAddressMutation.mutate(address.id) },
                          ])
                        }
                        style={[styles.addressActionBtn, { backgroundColor: colors.dangerBg, borderColor: '#fecaca' }]}
                      >
                        <Ionicons name="trash-outline" size={13} color={colors.danger} />
                        <Text style={[styles.addressActionText, { color: colors.danger }]}>Xóa</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Add/Edit Address Form */}
            <View style={styles.formSection}>
              <Text style={styles.formSectionTitle}>
                {editingAddressId ? 'Cập nhật địa chỉ' : 'Thêm địa chỉ mới'}
              </Text>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Tên địa chỉ</Text>
                <TextInput
                  value={addressForm.tenDiaChi}
                  onChangeText={(v) => setAddressForm(p => ({ ...p, tenDiaChi: v }))}
                  placeholder="VD: Nhà riêng, KTX, Văn phòng..."
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Địa chỉ đầy đủ</Text>
                <TextInput
                  value={addressForm.diaChiDayDu}
                  onChangeText={(v) => setAddressForm(p => ({ ...p, diaChiDayDu: v }))}
                  placeholder="Số nhà, đường, phường, quận, thành phố"
                  placeholderTextColor={colors.placeholder}
                  multiline
                  numberOfLines={3}
                  style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                />
              </View>
              <View style={styles.formField}>
                <Text style={styles.fieldLabel}>Ghi chú</Text>
                <TextInput
                  value={addressForm.ghiChu}
                  onChangeText={(v) => setAddressForm(p => ({ ...p, ghiChu: v }))}
                  placeholder="VD: Giao giờ hành chính, gọi trước khi giao"
                  placeholderTextColor={colors.placeholder}
                  style={styles.input}
                />
              </View>

              <Pressable
                onPress={() => setAddressForm(p => ({ ...p, macDinh: !p.macDinh }))}
                style={styles.checkboxRow}
              >
                <View style={[styles.checkbox, addressForm.macDinh && styles.checkboxActive]}>
                  {addressForm.macDinh ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text style={styles.checkboxLabel}>Đặt làm địa chỉ mặc định</Text>
              </Pressable>

              <View style={styles.formBtns}>
                <Pressable
                  onPress={handleSaveAddress}
                  disabled={saveAddressMutation.isPending}
                  style={({ pressed }) => [styles.primaryBtn, { flex: 2 }, pressed && { opacity: 0.88 }]}
                >
                  <LinearGradient colors={['#f26b1d', '#d4560e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnGradient}>
                    {saveAddressMutation.isPending ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Ionicons name={editingAddressId ? 'save-outline' : 'add-circle-outline'} size={18} color="#fff" />
                    )}
                    <Text style={styles.primaryBtnText}>
                      {saveAddressMutation.isPending ? 'Đang lưu...' : editingAddressId ? 'Cập nhật' : 'Thêm địa chỉ'}
                    </Text>
                  </LinearGradient>
                </Pressable>
                {editingAddressId ? (
                  <Pressable
                    onPress={() => {
                      setEditingAddressId(null)
                      setAddressForm({ tenDiaChi: '', diaChiDayDu: '', ghiChu: '', macDinh: false })
                    }}
                    style={[styles.secondaryBtn, { flex: 1 }]}
                  >
                    <Text style={styles.secondaryBtnText}>Hủy</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        )

      case 'reviews':
        return (
          <View style={styles.tabContent}>
            {reviewsQuery.isLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.loadingText}>Đang tải đánh giá...</Text>
              </View>
            ) : reviews.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="star-outline" size={40} color={colors.border} />
                <Text style={styles.emptyTitle}>Chưa có đánh giá</Text>
                <Text style={styles.emptyText}>Mua hàng và đánh giá sản phẩm để theo dõi tại đây.</Text>
              </View>
            ) : (
              <View style={styles.reviewsList}>
                <Text style={styles.formSectionTitle}>{reviews.length} đánh giá của bạn</Text>
                {reviews.map((review, index) => (
                  <View key={review.id || index} style={styles.reviewCard}>
                    <View style={styles.reviewHeader}>
                      <Text style={styles.reviewProductId}>Sản phẩm #{review.ma_san_pham}</Text>
                      <Text style={styles.reviewDate}>
                        {formatDateOnly(review.ngay_cap_nhat || review.ngay_tao)}
                      </Text>
                    </View>
                    <StarRating rating={Number(review.so_sao || 0)} size={18} />
                    {review.binh_luan ? (
                      <Text style={styles.reviewComment}>{review.binh_luan}</Text>
                    ) : (
                      <Text style={styles.reviewNoComment}>Không có bình luận.</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        )

      default:
        return null
    }
  }

  return (
    <View style={styles.screen}>
      {/* Header with Loyalty */}
      <LinearGradient
        colors={[...tierConfig.gradient, '#1a0a02']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Text style={styles.headerAvatarText}>
                {String(getUserDisplayName(user))[0]?.toUpperCase() || '☕'}
              </Text>
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{getUserDisplayName(user)}</Text>
            {!user || getUserId(user) === 'guest-customer' ? (
              <Pressable onPress={() => navigation?.navigate('Login')} style={{ marginTop: 4 }}>
                <Text style={{ color: '#fbbf24', fontWeight: '700', fontSize: 13, textDecorationLine: 'underline' }}>
                  👉 Đăng nhập / Đăng ký ngay
                </Text>
              </Pressable>
            ) : (
              <Text style={styles.headerEmail}>{profile?.email || user?.email || ''}</Text>
            )}
          </View>
          <View style={styles.tierBadge}>
            <Text style={styles.tierBadgeText}>{tierConfig.icon} {tierConfig.label}</Text>
          </View>
        </View>

        {/* Loyalty card */}
        <View style={styles.loyaltyCard}>
          <View style={styles.loyaltyRow}>
            <View>
              <Text style={styles.loyaltyPoints}>{diemLoyalty.toLocaleString('vi-VN')}</Text>
              <Text style={styles.loyaltyLabel}>Điểm tích lũy</Text>
            </View>
            <View style={styles.loyaltyDivider} />
            <View>
              <Text style={styles.loyaltyMemberId}>{profile?.ma_nguoi_dung || userId}</Text>
              <Text style={styles.loyaltyLabel}>Mã thành viên</Text>
            </View>
          </View>
          {diemCanLen != null ? (
            <View style={styles.loyaltyProgress}>
              <View style={styles.loyaltyProgressInfo}>
                <Text style={styles.loyaltyProgressText}>{diemLoyalty.toLocaleString('vi-VN')} / {diemCanLen.toLocaleString('vi-VN')} điểm</Text>
                <Text style={styles.loyaltyProgressText}>Lên hạng tiếp</Text>
              </View>
              <View style={styles.loyaltyProgressBar}>
                <View style={[styles.loyaltyProgressFill, { width: `${phanTram}%` }]} />
              </View>
            </View>
          ) : (
            <Text style={styles.maxTierText}>✨ Bạn đang ở hạng cao nhất!</Text>
          )}
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsList}>
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
              >
                <Ionicons name={tab.icon} size={15} color={isActive ? colors.primary : colors.muted} />
                <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>{tab.label}</Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {/* Tab Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentPadding}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderTabContent()}
      </ScrollView>

      {/* Avatar URL Modal */}
      <Modal visible={avatarModalVisible} animationType="fade" transparent onRequestClose={() => setAvatarModalVisible(false)}>
        <View style={styles.avatarModalOverlay}>
          <View style={styles.avatarModalCard}>
            <Text style={styles.avatarModalTitle}>Cập nhật ảnh đại diện</Text>
            <TextInput
              value={tempAvatarUrl}
              onChangeText={setTempAvatarUrl}
              placeholder="Nhập URL ảnh (https://...)"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              style={styles.input}
            />
            {tempAvatarUrl ? (
              <Image
                source={{ uri: tempAvatarUrl }}
                style={styles.avatarPreviewImage}
                onError={() => {}}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.formBtns}>
              <Pressable
                onPress={() => {
                  setProfileForm(p => ({ ...p, avatar_url: tempAvatarUrl }))
                  setAvatarPreview(tempAvatarUrl || null)
                  setAvatarModalVisible(false)
                }}
                style={[styles.primaryBtn, { flex: 1 }]}
              >
                <LinearGradient colors={['#f26b1d', '#d4560e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryBtnGradient}>
                  <Text style={styles.primaryBtnText}>Áp dụng</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                onPress={() => setAvatarModalVisible(false)}
                style={[styles.secondaryBtn, { flex: 1 }]}
              >
                <Text style={styles.secondaryBtnText}>Hủy</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  headerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  headerAvatarFallback: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  headerAvatarText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
  },
  headerInfo: {
    flex: 1,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  headerEmail: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  tierBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  tierBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#fff',
  },
  loyaltyCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: spacing.md,
  },
  loyaltyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loyaltyPoints: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
  },
  loyaltyLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  loyaltyDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: spacing.lg,
  },
  loyaltyMemberId: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  loyaltyProgress: {
    gap: 6,
  },
  loyaltyProgressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  loyaltyProgressText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  loyaltyProgressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  loyaltyProgressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: radius.full,
  },
  maxTierText: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '800',
    textAlign: 'center',
  },

  // Tabs Bar
  tabsBar: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tabsList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtnActive: {
    backgroundColor: '#fff9f5',
    borderColor: colors.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  tabBtnTextActive: {
    color: colors.primary,
  },

  // Content
  content: {
    flex: 1,
  },
  contentPadding: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  tabContent: {
    gap: spacing.md,
  },

  // Avatar Section
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: spacing.md,
    ...shadows.xs,
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: colors.primary,
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#fff',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarInfo: {
    flex: 1,
    gap: 3,
  },
  avatarName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  avatarEmail: {
    fontSize: 13,
    color: colors.muted,
  },
  avatarSince: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },

  // Form Section
  formSection: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  formSectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
  },
  formSectionSubtitle: {
    fontSize: 13,
    color: colors.muted,
    marginTop: -8,
    lineHeight: 20,
  },
  formField: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 0,
  },
  inputDisabled: {
    backgroundColor: '#f0f0f0',
    color: colors.muted,
  },
  passwordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cream,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 52,
  },
  eyeBtn: {
    padding: 4,
  },

  // Buttons
  primaryBtn: {
    borderRadius: radius.xl,
    overflow: 'hidden',
  },
  primaryBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryBtn: {
    backgroundColor: colors.cream,
    borderRadius: radius.xl,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: {
    color: colors.textSecondary,
    fontWeight: '800',
    fontSize: 14,
  },
  formBtns: {
    flexDirection: 'row',
    gap: spacing.sm,
  },

  // Checkbox
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxLabel: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },

  // Address
  addressList: {
    gap: spacing.sm,
  },
  addressCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  addressCardHeader: {},
  addressNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  addressName: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.text,
  },
  defaultBadge: {
    backgroundColor: '#f0fdf4',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#16a34a',
  },
  addressText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  addressNote: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
  },
  addressActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  addressActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.cream,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressActionText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
  },

  // Loading / Empty
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    marginTop: spacing.sm,
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },

  // Reviews
  reviewsList: {
    gap: spacing.md,
  },
  reviewCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewProductId: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  reviewDate: {
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  reviewComment: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  reviewNoComment: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
  },

  // Notifications
  notifSection: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.xs,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  notifTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.text,
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '900',
  },
  markAllRead: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '700',
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  notifItemUnread: {
    backgroundColor: '#fff9f5',
    borderRadius: radius.md,
    paddingHorizontal: 8,
  },
  notifDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 5,
  },
  notifDotRead: {
    backgroundColor: colors.border,
  },
  notifContent: {
    flex: 1,
    gap: 2,
  },
  notifTitle2: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  notifBody: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.xl,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  logoutBtnText: {
    fontSize: 15,
    fontWeight: '900',
    color: colors.danger,
  },

  // Avatar Modal
  avatarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  avatarModalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  avatarModalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  avatarPreviewImage: {
    width: '100%',
    height: 180,
    borderRadius: radius.xl,
    backgroundColor: colors.cream,
  },
})
