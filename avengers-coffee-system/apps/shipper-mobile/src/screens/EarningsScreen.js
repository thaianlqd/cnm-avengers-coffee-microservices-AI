import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { BrandHeader } from '../components/BrandHeader'
import { colors } from '../theme'
import { demoStats } from '../data/demo'

const weeklyRevenue = [
  { day: 'T2', value: 820000 },
  { day: 'T3', value: 640000 },
  { day: 'T4', value: 910000 },
  { day: 'T5', value: 780000 },
  { day: 'T6', value: 1050000 },
  { day: 'T7', value: 1320000 },
  { day: 'CN', value: 940000 },
]

export function EarningsScreen() {
  const peak = Math.max(...weeklyRevenue.map((item) => item.value))

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <BrandHeader title="Thu nhập" subtitle="Theo dõi hiệu suất và doanh thu giao hàng" />

      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>Xếp hạng hiện tại</Text>
        <Text style={styles.heroValue}>{demoStats.rating.toFixed(1)} / 5.0</Text>
        <Text style={styles.heroDesc}>Bạn đang giữ nhịp giao rất ổn. Duy trì tốc độ này để tối ưu thưởng.</Text>
      </View>

      <View style={styles.row}>
        <View style={styles.card}>
          <Text style={styles.label}>Đơn hôm nay</Text>
          <Text style={styles.value}>{demoStats.completed_today}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Tổng đơn</Text>
          <Text style={styles.value}>{demoStats.total_deliveries}</Text>
        </View>
      </View>

      <View style={styles.sectionBox}>
        <Text style={styles.sectionTitle}>Doanh thu tuần</Text>
        <Text style={styles.sectionSub}>Biểu đồ đơn giản để xem nhịp làm việc</Text>

        <View style={styles.chartRow}>
          {weeklyRevenue.map((item) => {
            const height = Math.max(38, (item.value / peak) * 140)
            return (
              <View key={item.day} style={styles.barCol}>
                <Text style={styles.barValue}>{Math.round(item.value / 1000)}k</Text>
                <View style={[styles.bar, { height }]} />
                <Text style={styles.barDay}>{item.day}</Text>
              </View>
            )
          })}
        </View>
      </View>

      <View style={styles.sectionBox}>
        <Text style={styles.sectionTitle}>Mẹo tăng thu nhập</Text>
        <Text style={styles.tip}>• Ưu tiên đơn gần nhau để giảm thời gian chờ</Text>
        <Text style={styles.tip}>• Cập nhật trạng thái đúng lúc để admin thấy tiến độ</Text>
        <Text style={styles.tip}>• Giữ rating trên 4.8 để dễ được ưu tiên đơn đẹp</Text>
      </View>
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
  heroCard: {
    backgroundColor: '#2f2119',
    borderRadius: 28,
    padding: 18,
  },
  heroLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  heroValue: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '900',
    marginTop: 6,
  },
  heroDesc: {
    color: 'rgba(255,255,255,0.85)',
    marginTop: 8,
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  value: {
    color: colors.coffee,
    fontSize: 30,
    fontWeight: '900',
    marginTop: 6,
  },
  sectionBox: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    color: colors.coffee,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionSub: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 4,
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 18,
  },
  barCol: {
    alignItems: 'center',
    flex: 1,
  },
  barValue: {
    color: colors.muted,
    fontSize: 10,
    marginBottom: 6,
    fontWeight: '700',
  },
  bar: {
    width: '100%',
    maxWidth: 28,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  barDay: {
    color: colors.muted,
    fontWeight: '800',
    marginTop: 8,
    fontSize: 12,
  },
  tip: {
    color: colors.coffee,
    lineHeight: 21,
    marginTop: 8,
    fontWeight: '600',
  },
})
