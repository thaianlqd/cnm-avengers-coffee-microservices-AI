import React from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useShipper } from '../context/ShipperContext'
import { BrandHeader } from '../components/BrandHeader'
import { colors } from '../theme'

const actions = [
  { title: 'Cập nhật vị trí', hint: 'Gửi GPS hiện tại', icon: '📍' },
  { title: 'Đổi trạng thái', hint: 'Đang giao / nghỉ', icon: '🟢' },
  { title: 'Lịch sử giao', hint: 'Xem các đơn gần đây', icon: '🧾' },
  { title: 'Hỗ trợ', hint: 'Liên hệ điều phối', icon: '☎️' },
]

export function ProfileScreen() {
  const { shipper, logout } = useShipper()

  const handleLogout = () => {
    Alert.alert('Đăng xuất', 'Bạn muốn thoát khỏi ứng dụng shipper?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: logout,
      },
    ])
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <BrandHeader title="Hồ sơ" subtitle="Thông tin cá nhân và công cụ nhanh" />

      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{shipper?.full_name?.split(' ').slice(-1)[0]?.[0] || 'S'}</Text>
        </View>
        <Text style={styles.name}>{shipper?.full_name}</Text>
        <Text style={styles.meta}>{shipper?.username} • {shipper?.branch_code}</Text>
        <Text style={styles.meta}>⭐ {shipper?.rating?.toFixed?.(1) || '4.9'} • 🚚 {shipper?.total_deliveries || 0} đơn</Text>
      </View>

      <View style={styles.quickGrid}>
        {actions.map((item) => (
          <View key={item.title} style={styles.quickCard}>
            <Text style={styles.quickIcon}>{item.icon}</Text>
            <Text style={styles.quickTitle}>{item.title}</Text>
            <Text style={styles.quickHint}>{item.hint}</Text>
          </View>
        ))}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoLabel}>Trạng thái hiện tại</Text>
        <Text style={styles.infoValue}>{shipper?.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm nghỉ'}</Text>
        <Text style={styles.infoHint}>
          Đây là app mobile nội bộ của shipper, nên ưu tiên tốc độ thao tác và độ rõ ràng của trạng thái hơn là hiệu ứng rườm rà.
        </Text>
      </View>

      <Pressable onPress={handleLogout} style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.92 }]}>
        <Text style={styles.logoutText}>Đăng xuất</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: '#fff4e8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: colors.primary,
    fontSize: 30,
    fontWeight: '900',
  },
  name: {
    color: colors.coffee,
    fontSize: 22,
    fontWeight: '900',
  },
  meta: {
    color: colors.muted,
    marginTop: 4,
    fontWeight: '600',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickCard: {
    width: '48%',
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  quickIcon: {
    fontSize: 20,
  },
  quickTitle: {
    color: colors.coffee,
    fontWeight: '900',
    marginTop: 8,
  },
  quickHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  infoCard: {
    backgroundColor: '#2f2119',
    borderRadius: 28,
    padding: 18,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    textTransform: 'uppercase',
    fontWeight: '800',
  },
  infoValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 6,
  },
  infoHint: {
    color: 'rgba(255,255,255,0.84)',
    lineHeight: 20,
    marginTop: 8,
  },
  logoutBtn: {
    backgroundColor: '#fee2e2',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
  },
  logoutText: {
    color: colors.danger,
    fontWeight: '900',
    fontSize: 15,
  },
})
