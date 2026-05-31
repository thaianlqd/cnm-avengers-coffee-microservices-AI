import React, { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { BrandHeader } from '../components/BrandHeader'
import { StatCard } from '../components/StatCard'
import { colors } from '../theme'
import { demoDeliveries, demoStats } from '../data/demo'
import { useShipper } from '../context/ShipperContext'
import { apiClient } from '../lib/apiClient'

function formatGreeting() {
  const hour = new Date().getHours()
  if (hour < 11) return 'Chào buổi sáng'
  if (hour < 17) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

export function HomeScreen({ navigation }) {
  const { shipper } = useShipper()

  const statsQuery = useQuery({
    queryKey: ['shipper-mobile', 'stats', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return demoStats
      try {
        const { data } = await apiClient.get(`/shippers/${shipper.id}/stats`)
        return data || demoStats
      } catch (error) {
        console.log('[HomeScreen] Stats error:', error.message)
        return demoStats
      }
    },
  })

  const deliveriesQuery = useQuery({
    queryKey: ['shipper-mobile', 'deliveries', shipper?.id],
    queryFn: async () => {
      if (!shipper?.id) return demoDeliveries
      try {
        const { data } = await apiClient.get(`/shippers/${shipper.id}/deliveries`)
        return Array.isArray(data) ? data : demoDeliveries
      } catch (error) {
        console.log('[HomeScreen] Deliveries error:', error.message)
        return demoDeliveries
      }
    },
  })

  const activeItems = useMemo(
    () => (deliveriesQuery.data || demoDeliveries).filter((item) => item.status !== 'DELIVERED').slice(0, 3),
    [deliveriesQuery.data],
  )

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <BrandHeader
        title={`${formatGreeting()}, ${shipper?.full_name?.split(' ')[0] || 'shipper'}`}
        subtitle={`Chi nhánh ${shipper?.branch_code || 'HN001'} • ${shipper?.vehicle_type || 'MOTORBIKE'}`}
      />

      <View style={styles.heroPanel}>
        <Text style={styles.heroLabel}>Hôm nay bạn đang làm rất tốt</Text>
        <Text style={styles.heroValue}>{statsQuery.data?.completed_today || demoStats.completed_today} đơn</Text>
        <Text style={styles.heroHint}>Hoàn thành theo nhịp vận hành, đừng để đơn chờ lâu hơn 30 phút.</Text>
      </View>

      <View style={styles.grid}>
        <StatCard label="Tổng giao" value={statsQuery.data?.total_deliveries || demoStats.total_deliveries} icon="🚚" />
        <StatCard label="Xếp hạng" value={(statsQuery.data?.rating || demoStats.rating).toFixed(1)} icon="⭐" tone="secondary" />
      </View>

      <View style={styles.grid}>
        <StatCard label="Đang chờ" value={statsQuery.data?.pending_deliveries || demoStats.pending_deliveries} icon="⏳" />
        <StatCard label="Thất bại" value={statsQuery.data?.failed_deliveries || demoStats.failed_deliveries} icon="⚠️" tone="secondary" />
      </View>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Đơn cần xử lý nhanh</Text>
        <Text style={styles.sectionSub}>Ưu tiên đơn đang pending / confirmed</Text>
      </View>

      {activeItems.map((item) => (
        <View key={item.id} style={styles.compactCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.compactTitle}>{item.ma_don_hang}</Text>
            <Text style={styles.compactText} numberOfLines={1}>{item.delivery_address}</Text>
          </View>
          <Text style={styles.compactBadge}>{item.status}</Text>
        </View>
      ))}

      <View style={styles.footerCard}>
        <Text style={styles.footerTitle}>Shipper mobile app</Text>
        <Text style={styles.footerText}>
          Màn hình này được tối ưu cho thao tác nhanh: xem đơn, mở chi tiết, xử lý từng bước giao hàng trên điện thoại.
        </Text>
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
    paddingBottom: 24,
  },
  heroPanel: {
    backgroundColor: colors.surface,
    borderRadius: 28,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroLabel: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 13,
  },
  heroValue: {
    color: colors.coffee,
    fontSize: 38,
    fontWeight: '900',
    marginTop: 4,
  },
  heroHint: {
    color: colors.muted,
    marginTop: 6,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
  },
  sectionHead: {
    marginTop: 4,
  },
  sectionTitle: {
    color: colors.coffee,
    fontSize: 20,
    fontWeight: '900',
  },
  sectionSub: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 13,
  },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 14,
    gap: 12,
  },
  compactTitle: {
    color: colors.coffee,
    fontWeight: '900',
    fontSize: 15,
  },
  compactText: {
    color: colors.muted,
    marginTop: 4,
    fontSize: 12,
  },
  compactBadge: {
    color: colors.primary,
    fontWeight: '900',
    fontSize: 12,
    backgroundColor: '#fff4e8',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
  },
  footerCard: {
    backgroundColor: '#2f2119',
    borderRadius: 24,
    padding: 18,
  },
  footerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
  },
  footerText: {
    color: 'rgba(255,255,255,0.84)',
    marginTop: 8,
    lineHeight: 21,
  },
})
