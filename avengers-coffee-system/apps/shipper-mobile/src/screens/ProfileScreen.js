import React from 'react'
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useShipper } from '../context/ShipperContext'
import { colors, radius, spacing, shadows, typography } from '../theme'

export function ProfileScreen({ navigation }) {
  const { shipper, logout } = useShipper()

  const handleLogout = () => {
    Alert.alert(
      'Đăng xuất',
      'Bạn có chắc chắn muốn đăng xuất?',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: logout },
      ]
    )
  }

  const menuItems = [
    { icon: 'notifications-outline', title: 'Thông báo', screen: 'Notification', badge: null },
    { icon: 'calendar-outline', title: 'Lịch làm việc', screen: 'Schedule', badge: null },
    { icon: 'bar-chart-outline', title: 'Đối soát thu nhập', screen: 'Report', badge: null },
    { icon: 'copy-outline', title: 'Nhận đơn ghép tuyến', screen: 'BatchOrder', badge: null },
    { icon: 'bicycle-outline', title: 'Phương tiện của tôi', screen: 'Vehicle', badge: null },
    { icon: 'warning-outline', title: 'Báo cáo ngoại lệ', screen: 'Exception', badge: null },
  ]

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.avatarWrap}>
            <Ionicons name="person" size={40} color={colors.primary} />
          </View>
          <View style={styles.infoWrap}>
            <Text style={styles.name}>{shipper?.full_name}</Text>
            <Text style={styles.username}>@{shipper?.username}</Text>
            <View style={styles.ratingWrap}>
              <Ionicons name="star" size={14} color={colors.warning} />
              <Text style={styles.ratingText}>{shipper?.rating || 5.0} Đánh giá</Text>
            </View>
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Quản lý tài khoản</Text>
          <View style={styles.menuCard}>
            {menuItems.map((item, index) => (
              <React.Fragment key={item.title}>
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={() => navigation.navigate(item.screen)}
                >
                  <View style={styles.menuIconWrap}>
                    <Ionicons name={item.icon} size={20} color={colors.primary} />
                  </View>
                  <Text style={styles.menuText}>{item.title}</Text>
                  <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                </TouchableOpacity>
                {index < menuItems.length - 1 && <View style={styles.divider} />}
              </React.Fragment>
            ))}
          </View>
        </View>

        <View style={styles.menuSection}>
          <Text style={styles.sectionTitle}>Cài đặt</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem}>
              <View style={[styles.menuIconWrap, { backgroundColor: colors.borderLight }]}>
                <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
              </View>
              <Text style={styles.menuText}>Đổi mật khẩu</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.menuItem}>
              <View style={[styles.menuIconWrap, { backgroundColor: colors.borderLight }]}>
                <Ionicons name="help-circle-outline" size={20} color={colors.textSecondary} />
              </View>
              <Text style={styles.menuText}>Trung tâm trợ giúp</Text>
              <Ionicons name="chevron-forward" size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </TouchableOpacity>
        
        <Text style={styles.version}>Phiên bản 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: spacing.md, paddingBottom: spacing.xxl },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  avatarWrap: {
    width: 70, height: 70,
    borderRadius: 35,
    backgroundColor: colors.infoBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  infoWrap: { flex: 1 },
  name: { ...typography.h3, color: colors.text },
  username: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs },
  ratingWrap: { flexDirection: 'row', alignItems: 'center' },
  ratingText: { ...typography.caption, color: colors.warning, marginLeft: 4, fontWeight: 'bold' },

  menuSection: { marginBottom: spacing.lg },
  sectionTitle: { ...typography.label, color: colors.textSecondary, marginBottom: spacing.sm, marginLeft: spacing.xs },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  menuIconWrap: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: colors.infoBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuText: { flex: 1, ...typography.bodyBold, color: colors.text },
  divider: { height: 1, backgroundColor: colors.borderLight, marginLeft: 60 },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerBg,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  logoutText: { color: colors.danger, fontWeight: 'bold', fontSize: 16, marginLeft: spacing.sm },
  version: { textAlign: 'center', color: colors.muted, fontSize: 12 },
})
