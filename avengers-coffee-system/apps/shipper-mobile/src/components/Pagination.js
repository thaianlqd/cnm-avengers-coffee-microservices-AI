import React, { useEffect, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../theme'
export const PAGE_SIZE = 10
export function usePagination(items, resetKey = '') {
  const [requested, setPage] = useState(1)
  const pages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const page = Math.min(requested, pages)
  useEffect(() => { setPage(1) }, [resetKey])
  return { page, pages, setPage, total: items.length, items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) }
}
export default function Pagination({ page, pages, total, onChange }) {
  if (!total) return null
  const start = Math.max(1, Math.min(page - 1, pages - 2))
  const numbers = Array.from({ length: Math.min(3, pages) }, (_, i) => start + i)
  return <View style={{ backgroundColor: '#fff', borderTopWidth: 1, borderColor: '#eee', paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
    <Text style={{ flex: 1, fontSize: 11, color: colors.muted }}>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}</Text>
    <Pressable accessibilityLabel="Trang trước" disabled={page <= 1} onPress={() => onChange(page - 1)} style={{ padding: 7, opacity: page <= 1 ? .3 : 1 }}><Ionicons name="chevron-back" size={18} color={colors.primary} /></Pressable>
    {numbers.map(n => <Pressable accessibilityLabel={`Trang ${n}`} accessibilityState={{ selected: n === page }} key={n} onPress={() => onChange(n)} style={{ width: 30, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: n === page ? colors.primary : '#f7f7f7' }}><Text style={{ color: n === page ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>{n}</Text></Pressable>)}
    <Pressable accessibilityLabel="Trang sau" disabled={page >= pages} onPress={() => onChange(page + 1)} style={{ padding: 7, opacity: page >= pages ? .3 : 1 }}><Ionicons name="chevron-forward" size={18} color={colors.primary} /></Pressable>
  </View>
}
