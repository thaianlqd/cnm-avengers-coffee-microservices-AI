import React from 'react'
import { View, Text, StyleSheet, FlatList } from 'react-native'
import { colors, spacing, shadows } from '../theme'
import { demoOrders, orderStatusLabels } from '../data/demo'

export function OrdersScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Quản lý đơn hàng</Text>
      <FlatList
        data={demoOrders}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={[styles.orderCard, shadows.sm]}>
            <View style={styles.orderHeader}>
              <Text style={styles.orderNumber}>{item.ma_don_hang}</Text>
              <Text style={[styles.orderStatus, { backgroundColor: item.trang_thai_don_hang === 'DANG_CHUAN_BI' ? colors.warning : colors.info }]}>
                {orderStatusLabels[item.trang_thai_don_hang]}
              </Text>
            </View>
            <View style={styles.orderDetails}>
              <Text style={styles.detailText}>Sản phẩm: {item.so_luong_san_pham}</Text>
              <Text style={styles.detailText}>Tổng: {Number(item.tong_tien).toLocaleString('vi-VN')}đ</Text>
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
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
  },
  orderStatus: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    textTransform: 'uppercase',
  },
  orderDetails: {
    gap: spacing.xs,
  },
  detailText: {
    fontSize: 12,
    color: colors.muted,
  },
})
