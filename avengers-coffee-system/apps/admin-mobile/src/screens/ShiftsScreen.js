import React from 'react'
import { View, Text, StyleSheet, FlatList } from 'react-native'
import { colors, spacing, shadows } from '../theme'
import { demoShifts } from '../data/demo'

export function ShiftsScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Quản lý ca làm</Text>
      <FlatList
        data={demoShifts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.shiftCard, shadows.sm]}>
            <View style={styles.shiftHeader}>
              <Text style={styles.nhanVien}>{item.nhan_vien}</Text>
              <Text style={[styles.statusBadge, { color: item.trang_thai === 'DANG_LHAM' ? colors.success : colors.warning }]}>
                {item.trang_thai === 'DANG_LHAM' ? '🟢 On duty' : '🟡 Chưa bắt đầu'}
              </Text>
            </View>
            <View style={styles.shiftDetails}>
              <Text style={styles.caLam}>Ca {item.ca_lam === 'SANG' ? 'Sáng' : item.ca_lam === 'CHIEU' ? 'Chiều' : 'Tối'}</Text>
              <Text style={styles.time}>{item.gio_bat_dau} - {item.gio_ket_thuc}</Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  shiftCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  shiftHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  nhanVien: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  statusBadge: {
    fontSize: 12,
    fontWeight: '600',
  },
  shiftDetails: {
    gap: spacing.xs,
  },
  caLam: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  time: {
    fontSize: 12,
    color: colors.muted,
  },
})
