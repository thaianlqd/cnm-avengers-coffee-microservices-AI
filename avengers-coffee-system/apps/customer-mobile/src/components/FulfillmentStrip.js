import React from 'react'
import { View, Text, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { useFulfillment, fulfillmentLabels } from '../context/FulfillmentContext'
import { safeArray } from '../lib/customerData'
import apiClient from '../lib/apiClient'
import { colors } from '../theme'
export default function FulfillmentStrip({ navigation }) {
  const { mode, branch } = useFulfillment()
  const branches = useQuery({ queryKey: ['public-branches'], queryFn: () => apiClient.get('/users/branches/public'), staleTime: 60000 })
  const selected = safeArray(branches.data).find(b => String(b.ma_chi_nhanh || b.id) === branch)
  return <Pressable onPress={() => navigation.navigate('StoresTab')} accessibilityLabel="Chọn hình thức nhận món và cửa hàng" style={{ backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 9 }}>
    <Ionicons name="location-outline" size={22} color="#fff" /><View style={{ flex: 1 }}><Text style={{ color: '#efccd0', fontSize: 11 }}>{fulfillmentLabels[mode]}</Text><Text numberOfLines={1} style={{ color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 2 }}>{selected?.ten_chi_nhanh || 'Chọn cửa hàng phục vụ'}</Text></View><Ionicons name="chevron-down" size={17} color="#fff" />
  </Pressable>
}
