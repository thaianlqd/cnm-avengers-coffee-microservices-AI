import React, { useMemo, useState } from 'react'
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { BrandHeader } from '../components/BrandHeader'
import { DeliveryCard } from '../components/DeliveryCard'
import { DeliveryDetailModal } from '../components/DeliveryDetailModal'
import { colors } from '../theme'
import { demoDeliveries } from '../data/demo'
import { useShipper } from '../context/ShipperContext'
import { apiClient } from '../lib/apiClient'

const filters = ['Tất cả', 'PENDING', 'CONFIRMED', 'IN_TRANSIT', 'DELIVERED']

export function DeliveriesScreen() {
  const { shipper } = useShipper()
  const [selectedFilter, setSelectedFilter] = useState('Tất cả')
  const [selectedItem, setSelectedItem] = useState(null)

  const deliveriesQuery = useQuery({
    queryKey: ['shipper-mobile', 'deliveries', shipper?.id, selectedFilter],
    queryFn: async () => {
      if (!shipper?.id) return demoDeliveries
      try {
        const params = selectedFilter === 'Tất cả' ? {} : { status: selectedFilter }
        const response = await apiClient.get(`/shippers/${shipper.id}/deliveries`, { params })
        return response?.length ? response : demoDeliveries
      } catch {
        return demoDeliveries
      }
    },
  })

  const list = useMemo(() => {
    const data = deliveriesQuery.data || demoDeliveries
    if (selectedFilter === 'Tất cả') return data
    return data.filter((item) => item.status === selectedFilter)
  }, [deliveriesQuery.data, selectedFilter])

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <BrandHeader title="Đơn hàng" subtitle="Xử lý giao hàng theo thao tác 1 chạm" />

        <View style={styles.filterRow}>
          {filters.map((filter) => (
            <Pressable
              key={filter}
              onPress={() => setSelectedFilter(filter)}
              style={({ pressed }) => [
                styles.filterChip,
                selectedFilter === filter && styles.filterChipActive,
                pressed && { opacity: 0.92 },
              ]}
            >
              <Text style={[styles.filterText, selectedFilter === filter && styles.filterTextActive]}>{filter}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Danh sách đơn hiện tại</Text>
          <Text style={styles.summaryText}>{list.length} đơn sẵn sàng thao tác</Text>
        </View>

        <FlatList
          scrollEnabled={false}
          data={list}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DeliveryCard item={item} onPress={setSelectedItem} />}
          ListEmptyComponent={<Text style={styles.empty}>Không có đơn ở trạng thái này.</Text>}
        />
      </ScrollView>

      <DeliveryDetailModal
        visible={!!selectedItem}
        item={selectedItem}
        shipperId={shipper?.id}
        onClose={() => setSelectedItem(null)}
        onChanged={() => setSelectedItem(null)}
      />
    </View>
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 12,
  },
  filterTextActive: {
    color: '#fff',
  },
  summaryBox: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: {
    color: colors.coffee,
    fontSize: 18,
    fontWeight: '900',
  },
  summaryText: {
    color: colors.muted,
    marginTop: 4,
  },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: 20,
    fontWeight: '600',
  },
})
