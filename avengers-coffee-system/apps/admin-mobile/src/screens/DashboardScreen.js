import React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { useAdmin } from '../context/AdminContext'
import { colors, spacing, shadows } from '../theme'

export function DashboardScreen() {
  const { admin } = useAdmin()

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Dashboard</Text>
      
      <View style={[styles.metricCard, shadows.card]}>
        <Text style={styles.metricLabel}>Đơn hàng hôm nay</Text>
        <Text style={styles.metricValue}>12</Text>
      </View>

      <View style={[styles.metricCard, shadows.card]}>
        <Text style={styles.metricLabel}>Doanh thu</Text>
        <Text style={styles.metricValue}>2,400,000đ</Text>
      </View>

      <View style={[styles.metricCard, shadows.card]}>
        <Text style={styles.metricLabel}>Tồn kho sẵn sàng</Text>
        <Text style={styles.metricValue}>85%</Text>
      </View>

      <View style={[styles.metricCard, shadows.card]}>
        <Text style={styles.metricLabel}>Nhân viên on duty</Text>
        <Text style={styles.metricValue}>8</Text>
      </View>

      <Text style={styles.adminInfo}>Admin: {admin?.full_name}</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  metricCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.primary,
    marginTop: spacing.sm,
  },
  adminInfo: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
})
