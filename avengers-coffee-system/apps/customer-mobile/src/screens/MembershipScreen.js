import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useUser } from '../context/UserContext'
import apiClient from '../lib/apiClient'
import { formatCurrency, getUserId, getUserDisplayName } from '../lib/customerData'
import { colors, shadows } from '../theme'

export function MembershipScreen() {
  const navigation = useNavigation()
  const { user, updateSession } = useUser()
  const userId = getUserId(user) || user?.ma_nguoi_dung || user?.id || ''
  const queryClient = useQueryClient()

  const [showBirthdayModal, setShowBirthdayModal] = useState(false)
  const [birthDateInput, setBirthDateInput] = useState('')

  const { data: memData, isLoading, refetch } = useQuery({
    queryKey: ['membership', userId],
    queryFn: async () => {
      if (!userId) return null
      const response = await apiClient.get(`/users/${userId}/membership`)
      return response.data || response
    },
    enabled: Boolean(userId),
    staleTime: 10 * 1000,
  })

  // Format existing birthday string
  const existingBirthday = memData?.ngay_sinh || user?.ngay_sinh || null
  const formattedBirthdayText = existingBirthday
    ? String(existingBirthday).substring(0, 10)
    : null

  useEffect(() => {
    if (formattedBirthdayText) {
      setBirthDateInput(formattedBirthdayText)
    }
  }, [formattedBirthdayText])

  const updateBirthdayMutation = useMutation({
    mutationFn: async (ngaySinh) => {
      const response = await apiClient.patch(`/users/${userId}/birthday`, { ngay_sinh: ngaySinh })
      return response.data || response
    },
    onSuccess: async (data) => {
      const savedDate = data?.ngay_sinh || birthDateInput
      if (user) {
        await updateSession({ ...user, ngay_sinh: savedDate })
      }
      queryClient.invalidateQueries({ queryKey: ['membership', userId] })
      setShowBirthdayModal(false)
      Alert.alert('Thành công 🎉', 'Đã lưu ngày sinh thành công và nhận ưu đãi sinh nhật!')
    },
    onError: (err) => {
      Alert.alert('Lỗi', err?.response?.data?.message || 'Không thể lưu ngày sinh. Vui lòng thử lại.')
    },
  })

  const handleSaveBirthday = () => {
    const trimmed = birthDateInput.trim()
    if (!trimmed || !/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      Alert.alert('Định dạng chưa đúng', 'Vui lòng nhập ngày sinh theo chuẩn YYYY-MM-DD (VD: 2000-05-15)')
      return
    }
    updateBirthdayMutation.mutate(trimmed)
  }

  const {
    diem_loyalty = user?.loyalty_points || 0,
    diem_kha_dung = user?.diem_kha_dung || 0,
    tong_chi_tieu = user?.tong_chi_tieu || 0,
    chi_tieu_thang_nay = 0,
    chi_tieu_toi_thieu_thang = 0,
    con_thieu_thang_nay = 0,
    dat_dieu_kien_dac_quyen = true,
    hang_hien_tai = {},
    tat_ca_hang = [],
  } = memData || {}

  const currentTierCode = String(
    hang_hien_tai?.ma_hang || user?.membership_tier || 'MEMBER'
  ).toUpperCase()

  const currentTierName =
    hang_hien_tai?.ten_hang ||
    (currentTierCode === 'DIAMOND' ? 'Kim Cương' : currentTierCode === 'GOLD' ? 'Vàng' : currentTierCode === 'SILVER' ? 'Bạc' : 'Thành Viên')

  const tierGradients = {
    MEMBER: ['#64748b', '#334155'],
    SILVER: ['#94a3b8', '#475569'],
    GOLD: ['#f59e0b', '#b45309'],
    DIAMOND: ['#0284c7', '#0369a1'],
  }

  const cardColors = tierGradients[currentTierCode] || tierGradients.MEMBER

  return (
    <View style={styles.container}>
      {/* Top Header with prominent back button */}
      <LinearGradient colors={['#1a0c05', '#3d1a08']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>Đặc Quyền Thành Viên</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {!userId ? (
          <View style={styles.guestBox}>
            <Ionicons name="ribbon-outline" size={56} color="#b22830" />
            <Text style={styles.guestTitle}>Hạng Thành Viên Avengers Coffee</Text>
            <Text style={styles.guestSub}>Vui lòng đăng nhập tài khoản để xem hạng Kim Cương, tích điểm và nhận voucher quà sinh nhật.</Text>
            <Pressable onPress={() => navigation.navigate('Login')} style={styles.loginBtn}>
              <LinearGradient colors={['#b22830', '#8f1d24']} style={styles.loginBtnGrad}>
                <Text style={styles.loginBtnText}>ĐĂNG NHẬP NGAY</Text>
              </LinearGradient>
            </Pressable>
          </View>
        ) : isLoading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#b22830" />
            <Text style={styles.loadingText}>Đang đồng bộ dữ liệu thành viên từ hệ thống...</Text>
          </View>
        ) : (
          <>
            {/* Hero Membership Card - Synced with Web */}
            <LinearGradient colors={cardColors} style={styles.cardHero}>
              <View style={styles.cardTop}>
                <View>
                  <Text style={styles.cardBrand}>AVENGERS COFFEE MEMBERSHIP</Text>
                  <Text style={styles.userName}>{getUserDisplayName(user)}</Text>
                </View>
                <View style={styles.badgePill}>
                  <Text style={styles.badgePillText}>HẠNG {currentTierName.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.cardStatsRow}>
                <View>
                  <Text style={styles.statLabel}>Điểm xét hạng</Text>
                  <Text style={styles.statValue}>{Number(diem_loyalty).toLocaleString('vi-VN')}</Text>
                </View>
                <View>
                  <Text style={styles.statLabel}>Điểm khả dụng</Text>
                  <Text style={styles.statValue}>{Number(diem_kha_dung).toLocaleString('vi-VN')}</Text>
                </View>
                <View>
                  <Text style={styles.statLabel}>Tổng chi tiêu</Text>
                  <Text style={styles.statValue}>{formatCurrency(tong_chi_tieu)}</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Monthly Spending & Tier Privilege Status Card */}
            {currentTierCode !== 'MEMBER' && chi_tieu_toi_thieu_thang > 0 && (
              <View style={[styles.birthdayBox, { backgroundColor: dat_dieu_kien_dac_quyen ? '#ecfdf5' : '#fff7ed', borderColor: dat_dieu_kien_dac_quyen ? '#a7f3d0' : '#fed7aa', borderWidth: 1 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: dat_dieu_kien_dac_quyen ? '#047857' : '#c2410c' }}>
                    {dat_dieu_kien_dac_quyen ? '✅ Đã đủ chi tiêu duy trì đặc quyền Tháng' : `⚠️ Cần chi tiêu thêm ${formatCurrency(con_thieu_thang_nay)} trong tháng`}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
                    Chi tiêu tháng này: {formatCurrency(chi_tieu_thang_nay)} / Yêu cầu hạng {currentTierName}: {formatCurrency(chi_tieu_toi_thieu_thang)}
                  </Text>
                </View>
              </View>
            )}

            {/* Birthday Section */}
            <View style={styles.birthdayBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.birthdayTitle}>🎁 Ngày sinh của bạn</Text>
                <Text style={styles.birthdaySub}>
                  {formattedBirthdayText
                    ? `Ngày sinh đã lưu: ${formattedBirthdayText}`
                    : 'Cập nhật ngày sinh để nhận ngay Voucher quà sinh nhật đặc biệt!'}
                </Text>
              </View>
              <Pressable onPress={() => setShowBirthdayModal(true)} style={styles.updateBtn}>
                <Text style={styles.updateBtnText}>{formattedBirthdayText ? 'Thay đổi' : 'Cập nhật'}</Text>
              </Pressable>
            </View>

            {/* All Tiers List */}
            <Text style={styles.sectionTitle}>Các hạng thẻ thành viên</Text>
            {(tat_ca_hang.length > 0
              ? tat_ca_hang
              : [
                  { id: '1', ma_hang: 'MEMBER', ten_hang: 'Thành Viên', chi_tieu_toi_thieu: 0 },
                  { id: '2', ma_hang: 'SILVER', ten_hang: 'Bạc', chi_tieu_toi_thieu: 500000 },
                  { id: '3', ma_hang: 'GOLD', ten_hang: 'Vàng', chi_tieu_toi_thieu: 2000000 },
                  { id: '4', ma_hang: 'DIAMOND', ten_hang: 'Kim Cương', chi_tieu_toi_thieu: 5000000 },
                ]
            ).map((tier) => {
              const code = String(tier.ma_hang || tier.ma).toUpperCase()
              const isCurrent = code === currentTierCode
              return (
                <View key={tier.id || code} style={[styles.tierCard, isCurrent && styles.tierCardActive]}>
                  <View style={styles.tierHeader}>
                    <Text style={styles.tierName}>{tier.ten_hang || tier.ten}</Text>
                    <Text style={styles.tierSpentRule}>Từ {formatCurrency(tier.chi_tieu_toi_thieu || tier.diem || 0)}</Text>
                    {isCurrent && (
                      <View style={styles.currentTag}>
                        <Text style={styles.currentTagText}>HIỆN TẠI</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.benefitRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#b22830" />
                    <Text style={styles.benefitText}>Tích điểm chi tiêu & Voucher sinh nhật độc quyền</Text>
                  </View>
                </View>
              )
            })}
          </>
        )}
      </ScrollView>

      {/* Birthday Modal */}
      <Modal visible={showBirthdayModal} transparent animationType="fade" onRequestClose={() => setShowBirthdayModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Cập nhật ngày sinh</Text>
            <Text style={styles.modalSub}>Nhập ngày sinh theo định dạng YYYY-MM-DD:</Text>
            <TextInput
              value={birthDateInput}
              onChangeText={setBirthDateInput}
              placeholder="VD: 2000-05-15"
              placeholderTextColor={colors.placeholder}
              style={styles.modalInput}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setShowBirthdayModal(false)} style={styles.modalCancelBtn}>
                <Text style={styles.modalCancelText}>Hủy</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveBirthday}
                disabled={updateBirthdayMutation.isPending}
                style={styles.modalSaveBtn}
              >
                <Text style={styles.modalSaveText}>{updateBirthdayMutation.isPending ? 'Đang lưu...' : 'Lưu ngày sinh'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfbf9' },
  header: { paddingTop: 48, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  content: { padding: 16 },
  guestBox: { backgroundColor: '#fff', borderRadius: 24, padding: 24, alignItems: 'center', marginVertical: 20, borderBorderWidth: 1, borderColor: colors.borderLight, ...shadows.sm },
  guestTitle: { fontSize: 18, fontWeight: '900', color: colors.text, marginTop: 12 },
  guestSub: { fontSize: 13, color: colors.muted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  loginBtn: { marginTop: 20, width: '100%', borderRadius: 9999, overflow: 'hidden' },
  loginBtnGrad: { paddingVertical: 14, alignItems: 'center' },
  loginBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  loadingBox: { paddingVertical: 40, alignItems: 'center' },
  loadingText: { marginTop: 12, color: colors.muted, fontSize: 13 },
  cardHero: { borderRadius: 24, padding: 20, marginBottom: 16, ...shadows.lg },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardBrand: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  userName: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 4 },
  badgePill: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 9999 },
  badgePillText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  cardStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  statLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  statValue: { color: '#fff', fontSize: 14, fontWeight: '900', marginTop: 2 },
  birthdayBox: { backgroundColor: '#fff', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#f1f5f9', ...shadows.sm },
  birthdayTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  birthdaySub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  updateBtn: { backgroundColor: '#fff4ed', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 9999, borderWidth: 1, borderColor: '#b22830' },
  updateBtnText: { color: '#b22830', fontSize: 12, fontWeight: '800' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 12 },
  tierCard: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9', ...shadows.sm },
  tierCardActive: { borderColor: '#b22830', borderWidth: 2 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tierName: { fontSize: 16, fontWeight: '900', color: colors.text },
  tierSpentRule: { fontSize: 12, color: colors.muted },
  currentTag: { backgroundColor: '#fff4ed', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  currentTagText: { color: '#b22830', fontSize: 10, fontWeight: '900' },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  benefitText: { fontSize: 13, color: colors.textSecondary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  modalSub: { fontSize: 13, color: colors.muted, marginTop: 4, marginBottom: 16 },
  modalInput: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 20, color: colors.text },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  modalCancelBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 9999 },
  modalCancelText: { color: colors.muted, fontWeight: '700' },
  modalSaveBtn: { backgroundColor: '#b22830', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 9999 },
  modalSaveText: { color: '#fff', fontWeight: '800' },
})
