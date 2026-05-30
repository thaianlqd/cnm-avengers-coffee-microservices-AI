import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { useAdmin } from '../context/AdminContext'
import { colors, spacing, shadows } from '../theme'

export function ProfileScreen() {
  const { admin, logout } = useAdmin()

  const handleLogout = async () => {
    await logout()
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.profileCard, shadows.card]}>
        <Text style={styles.profileTitle}>Hồ sơ quản trị viên</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Tên:</Text>
          <Text style={styles.value}>{admin?.full_name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Email:</Text>
          <Text style={styles.value}>{admin?.email}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Vai trò:</Text>
          <Text style={styles.value}>{admin?.role}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Chi nhánh:</Text>
          <Text style={styles.value}>{admin?.branch_code}</Text>
        </View>
      </View>

      <Pressable
        onPress={handleLogout}
        style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.8 }]}
      >
        <Text style={styles.logoutBtnText}>Đăng xuất</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.md,
  },
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  profileTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  logoutBtn: {
    backgroundColor: colors.danger,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
})
