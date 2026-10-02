import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { colors, shadows } from '../theme'
import { statusLabels } from '../data/demo'

const toneMap = {
  PENDING: ['#fff7ed', '#ffffff'],
  CONFIRMED: ['#eff6ff', '#ffffff'],
  PICKING_UP: ['#ffedd5', '#ffffff'],
  IN_TRANSIT: ['#ede9fe', '#ffffff'],
  DELIVERED: ['#dcfce7', '#ffffff'],
  FAILED: ['#fee2e2', '#ffffff'],
}

const badgeMap = {
  PENDING: colors.warning,
  CONFIRMED: colors.secondary,
  PICKING_UP: '#ea580c',
  IN_TRANSIT: '#7c3aed',
  DELIVERED: colors.success,
  FAILED: colors.danger,
}

export function DeliveryCard({ item, onPress }) {
  return (
    <Pressable onPress={() => onPress?.(item)} style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}>
      <LinearGradient colors={toneMap[item.status] || toneMap.PENDING} style={[styles.card, shadows.card]}>
        <View style={styles.topRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderId}>{item.ma_don_hang}</Text>
            <Text style={styles.customer}>{item.customer_name || 'Khách lẻ'}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: badgeMap[item.status] || colors.primary }]}>
            <Text style={styles.badgeText}>{statusLabels[item.status] || item.status}</Text>
          </View>
        </View>

        <Text style={styles.address} numberOfLines={2}>{item.delivery_address}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Phí</Text>
            <Text style={styles.metaValue}>{Number(item.delivery_fee || 0).toLocaleString('vi-VN')} đ</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>ETA</Text>
            <Text style={styles.metaValue}>{item.estimated_time_minutes || 0} phút</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaLabel}>Món</Text>
            <Text style={styles.metaValue}>{item.items_count || 0}</Text>
          </View>
        </View>

        {item.delivery_note ? <Text style={styles.note} numberOfLines={1}>Ghi chú: {item.delivery_note}</Text> : null}
      </LinearGradient>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.96,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  orderId: {
    color: colors.coffee,
    fontSize: 17,
    fontWeight: '800',
  },
  customer: {
    color: colors.muted,
    marginTop: 2,
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  address: {
    color: colors.coffee,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  metaPill: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#f1e4d6',
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '600',
  },
  metaValue: {
    color: colors.coffee,
    fontSize: 13,
    marginTop: 2,
    fontWeight: '700',
  },
  note: {
    color: '#8b5e34',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
  },
})
