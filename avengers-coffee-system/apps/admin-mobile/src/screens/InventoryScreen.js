import React from 'react'
import { View, Text, StyleSheet, FlatList } from 'react-native'
import { colors, spacing, shadows } from '../theme'
import { demoInventory } from '../data/demo'

export function InventoryScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Quản lý tồn kho</Text>
      <FlatList
        data={demoInventory}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.inventoryCard, shadows.sm]}>
            <Text style={styles.itemName}>{item.ten_san_pham}</Text>
            <View style={styles.stockRow}>
              <View style={styles.stockInfo}>
                <Text style={styles.label}>Tồn kho</Text>
                <Text style={styles.value}>{item.ton_kho}</Text>
              </View>
              <View style={styles.stockInfo}>
                <Text style={styles.label}>Tổng cộng</Text>
                <Text style={styles.value}>{item.tong_ton}</Text>
              </View>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: item.trang_thai === 'LOW_STOCK' ? colors.danger : colors.success }]}>
              <Text style={styles.statusText}>{item.trang_thai === 'LOW_STOCK' ? '⚠️ Hết/Ít' : '✓ Sẵn sàng'}</Text>
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
  inventoryCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  stockRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  stockInfo: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '600',
  },
  value: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.primary,
    marginTop: 4,
  },
  statusBadge: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
})
