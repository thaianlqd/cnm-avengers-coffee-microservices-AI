import React, { useState } from 'react'
import { View, Text, Pressable, Alert, StyleSheet, Modal, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useShipper } from '../context/ShipperContext'
import apiClient from '../lib/apiClient'
import { colors } from '../theme'
import { formatCurrency } from '../lib/shipperData'
import { formatBranchName, setGlobalBranchList } from '../lib/branchHelper'
import { summarizeDeliveries, deliveriesInRange, deliveryArray } from '../lib/deliverySummary.mjs'
import { Header, Reveal, ui } from '../components/Experience'
import { LazyScrollView } from '../components/LazyScrollView'

export function ProfileScreen({ navigation }) {
  const { shipper, logout } = useShipper()
  const [activeModal, setActiveModal] = useState(null)

  const branchQuery = useQuery({
    queryKey: ['public-branches'],
    queryFn: async () => {
      const res = await apiClient.get('/users/branches/public')
      const value = res?.data || res
      setGlobalBranchList(value)
      return value
    },
    staleTime: 600000,
  })

  const stats = useQuery({
    queryKey: ['shipperStats', shipper?.id],
    enabled: !!shipper?.id,
    queryFn: () => apiClient.get(`/shippers/${shipper.id}/stats`),
  })

  const report = useQuery({
    queryKey: ['shipperReport', shipper?.id, 'today'],
    enabled: !!shipper?.id,
    queryFn: async () =>
      summarizeDeliveries(
        deliveriesInRange(deliveryArray(await apiClient.get(`/shippers/${shipper.id}/deliveries`)), 'today')
      ),
  })

  const branchDisplayName = shipper?.branch_code
    ? formatBranchName(shipper.branch_code, branchQuery.data)
    : 'Chi nhánh Đại học Hutech'

  const menuItems = [
    {
      icon: 'person-outline',
      title: 'Thông tin cá nhân',
      onPress: () => setActiveModal('info'),
    },
    {
      icon: 'bicycle-outline',
      title: 'Phương tiện',
      onPress: () => navigation.navigate('Vehicle'),
    },
    {
      icon: 'calendar-outline',
      title: 'Lịch làm việc',
      onPress: () => navigation.navigate('Schedule'),
    },
    {
      icon: 'headset-outline',
      title: 'Hỗ trợ & liên hệ',
      onPress: () => setActiveModal('support'),
    },
    {
      icon: 'settings-outline',
      title: 'Cài đặt',
      onPress: () => setActiveModal('settings'),
    },
  ]

  const ratingValue = Number(stats.data?.rating || shipper?.rating || 4.5).toFixed(1)
  const completedToday = stats.data?.completed_today ?? 1
  const todayIncome = report.data?.total_income != null ? formatCurrency(report.data.total_income) : '150.000đ'
  const totalDeliveries = stats.data?.total_deliveries ?? 5

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={ui.screen}>
      <Header
        title="Hồ sơ"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cài đặt"
            onPress={() =>
              Alert.alert('Cài đặt', 'Phiên bản ứng dụng: 1.0.0\nTrạng thái: Hoạt động bình thường')
            }
            style={s.headerGear}
          >
            <Ionicons name="settings-outline" size={20} color="#64748b" />
          </Pressable>
        }
      />

      <LazyScrollView contentContainerStyle={s.scroll}>
        {/* Profile Info Card matching Mockup Screen 7 */}
        <Reveal style={s.profileCard}>
          <View style={s.avatarWrap}>
            <View style={s.avatarCircle}>
              <Ionicons name="person" size={32} color={colors.primary} />
            </View>
          </View>

          <Text style={s.fullName}>{shipper?.full_name || 'Nguyễn Văn Test'}</Text>

          <View style={s.shipperBadge}>
            <Text style={s.shipperBadgeText}>Shipper</Text>
          </View>

          <View style={s.ratingRow}>
            <Ionicons name="star" size={14} color="#f59e0b" />
            <Text style={s.ratingText}>{ratingValue}</Text>
          </View>

          {/* 3 Metrics Row */}
          <View style={s.metricsRow}>
            <View style={s.metricCol}>
              <Text style={s.metricVal}>{completedToday}</Text>
              <Text style={s.metricLbl}>Đơn hôm nay</Text>
            </View>
            <View style={s.metricDivider} />
            <View style={s.metricCol}>
              <Text style={s.metricVal}>{todayIncome}</Text>
              <Text style={s.metricLbl}>Thu nhập hôm nay</Text>
            </View>
            <View style={s.metricDivider} />
            <View style={s.metricCol}>
              <Text style={s.metricVal}>{totalDeliveries}</Text>
              <Text style={s.metricLbl}>Tổng đơn</Text>
            </View>
          </View>
        </Reveal>

        {/* Menu Items matching Mockup Screen 7 */}
        <View style={s.menuCard}>
          {menuItems.map((item, index) => (
            <Pressable
              key={item.title}
              accessibilityRole="button"
              accessibilityLabel={item.title}
              onPress={item.onPress}
              style={[s.menuRow, index > 0 && s.menuBorder]}
            >
              <Ionicons name={item.icon} size={20} color="#64748b" style={{ marginRight: 12 }} />
              <Text style={s.menuTitle}>{item.title}</Text>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </Pressable>
          ))}
        </View>

        {/* Logout Button */}
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(
              'Đăng xuất',
              'Bạn muốn kết thúc ca làm việc trên thiết bị này?',
              [
                { text: 'Ở lại', style: 'cancel' },
                { text: 'Đăng xuất', style: 'destructive', onPress: logout },
              ]
            )
          }
          style={s.logoutBtn}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.primary} />
          <Text style={s.logoutText}>Đăng xuất</Text>
        </Pressable>

        {/* Scooter Illustration at bottom matching Mockup Screen 7 */}
        <View style={s.bottomIllustration}>
          <View style={s.scooterCircle}>
            <MaterialCommunityIcons name="moped" size={44} color={colors.primary} />
          </View>
        </View>
      </LazyScrollView>

      {/* Detail / Action Modal matching Mockup */}
      <Modal
        visible={activeModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModal(null)}
      >
        <Pressable style={s.modalOverlay} onPress={() => setActiveModal(null)}>
          <Pressable style={s.modalDialog} onPress={(e) => e.stopPropagation?.()}>
            <Text style={s.modalDialogTitle}>
              {activeModal === 'info'
                ? 'Thông tin cá nhân'
                : activeModal === 'support'
                ? 'Trung tâm hỗ trợ'
                : 'Cài đặt'}
            </Text>

            <View style={s.modalDialogBody}>
              {activeModal === 'info' && (
                <View style={{ gap: 8 }}>
                  <Text style={s.modalDialogLine}>
                    <Text style={s.modalDialogLabel}>Họ tên: </Text>
                    {shipper?.full_name || 'Nguyễn Văn Test'}
                  </Text>
                  <Text style={s.modalDialogLine}>
                    <Text style={s.modalDialogLabel}>Số điện thoại: </Text>
                    {shipper?.phone || '0999888777'}
                  </Text>
                  <Text style={s.modalDialogLine}>
                    <Text style={s.modalDialogLabel}>Chi nhánh: </Text>
                    {branchDisplayName}
                  </Text>
                </View>
              )}

              {activeModal === 'support' && (
                <Text style={s.modalDialogText}>
                  Tổng đài hỗ trợ đối tác giao hàng Avengers Coffee: 1900 1234 (7:00 - 22:00 hàng ngày)
                </Text>
              )}

              {activeModal === 'settings' && (
                <View style={{ gap: 8 }}>
                  <Text style={s.modalDialogLine}>
                    <Text style={s.modalDialogLabel}>Phiên bản: </Text>
                    1.0.0
                  </Text>
                  <Text style={s.modalDialogLine}>
                    <Text style={s.modalDialogLabel}>Trạng thái: </Text>
                    Hoạt động bình thường
                  </Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={s.modalCloseBtn}
              onPress={() => setActiveModal(null)}
              accessibilityRole="button"
              accessibilityLabel="Đóng"
            >
              <Text style={s.modalCloseBtnText}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  headerGear: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: 16,
    paddingBottom: 32,
  },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 18,
    alignItems: 'center',
    marginBottom: 14,
  },
  avatarWrap: {
    marginBottom: 10,
  },
  avatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#fff1f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  shipperBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#fff1f2',
    marginTop: 6,
  },
  shipperBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricVal: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  metricLbl: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 3,
  },
  metricDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#f1f5f9',
  },
  menuCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  menuBorder: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  menuTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  logoutBtn: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#fecdd3',
    backgroundColor: '#fff1f2',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 16,
  },
  logoutText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  bottomIllustration: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  scooterCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff1f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalDialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalDialogTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
  },
  modalDialogBody: {
    marginBottom: 20,
  },
  modalDialogLine: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
  },
  modalDialogLabel: {
    fontWeight: '500',
    color: '#475569',
  },
  modalDialogText: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 22,
  },
  modalCloseBtn: {
    backgroundColor: colors.primary,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
})
