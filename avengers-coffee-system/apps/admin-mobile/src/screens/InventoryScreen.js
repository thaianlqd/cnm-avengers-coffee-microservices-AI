import React, { useState, useCallback } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAdmin } from '../context/AdminContext'
import apiClient from '../lib/apiClient'
import { formatCurrency } from '../lib/adminData'
import { colors, radius, shadows, spacing } from '../theme'

export function InventoryScreen() {
  const { sessionBranchCode } = useAdmin()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('ALL')
  const [savingId, setSavingId] = useState(0)

  const loadData = useCallback(async () => {
    try {
      const branchCode = sessionBranchCode || 'MAC_DINH_CHI'
      const [menuRes, invRes] = await Promise.all([
        apiClient.get('/menu/items'),
        apiClient.get(`/inventory/items?branch_code=${encodeURIComponent(branchCode)}`),
      ])

      const menuArr = menuRes?.items || (Array.isArray(menuRes) ? menuRes : [])
      const invArr = Array.isArray(invRes) ? invRes : (invRes?.items || [])

      const invMap = new Map(invArr.map((row) => [Number(row.ma_san_pham), row]))
      const merged = menuArr.map((item) => {
        const productId = Number(item.id)
        const stock = invMap.get(productId)
        const dangBan =
          stock?.dang_kinh_doanh !== undefined
            ? Boolean(stock.dang_kinh_doanh)
            : item.dang_ban !== undefined
              ? Boolean(item.dang_ban)
              : Boolean(item.trang_thai)
        return {
          ma_san_pham: productId,
          name: item.name || item.ten_san_pham || '',
          category: item.category || item.danh_muc || '',
          price: Number(item.price || 0),
          so_luong_ton: Number(stock?.so_luong_ton ?? 0),
          muc_canh_bao: Number(stock?.muc_canh_bao ?? 0),
          dang_ban: dangBan,
        }
      })

      setItems(merged)
      setError('')
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không tải được thực đơn')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [sessionBranchCode])

  React.useEffect(() => { loadData() }, [loadData])

  const toggleStatus = async (productId, currentDangBan) => {
    const item = items.find((i) => i.ma_san_pham === productId)
    if (!item) return

    const nextDangBan = !currentDangBan
    Alert.alert(
      'Xác nhận',
      `${nextDangBan ? 'Bật bán' : 'Tạm ngưng bán'} món "${item.name}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: nextDangBan ? 'Bật bán' : 'Ngưng bán',
          style: nextDangBan ? 'default' : 'destructive',
          onPress: async () => {
            setSavingId(productId)
            try {
              const branchCode = sessionBranchCode || 'MAC_DINH_CHI'
              await apiClient.post('/inventory/items', {
                ma_san_pham: productId,
                so_luong_ton: Number(item.so_luong_ton || 0),
                muc_canh_bao: Number(item.muc_canh_bao || 0),
                dang_kinh_doanh: nextDangBan,
                branch_code: branchCode,
              })
              setItems((prev) =>
                prev.map((i) => i.ma_san_pham === productId ? { ...i, dang_ban: nextDangBan } : i)
              )
            } catch (err) {
              Alert.alert('Lỗi', err?.response?.data?.message || err?.message || 'Cập nhật thất bại')
            } finally {
              setSavingId(0)
            }
          },
        },
      ]
    )
  }

  const categories = ['ALL', ...new Set(items.map((i) => i.category).filter(Boolean))]

  const filtered = items.filter((i) => {
    if (filterCat !== 'ALL' && i.category !== filterCat) return false
    if (search.trim()) {
      const kw = search.trim().toLowerCase()
      if (!String(i.name || '').toLowerCase().includes(kw)) return false
    }
    return true
  })

  const activeCount = items.filter((i) => i.dang_ban).length
  const outOfStock = items.filter((i) => i.so_luong_ton <= 0).length

  return (
    <View style={styles.screen}>
      <View style={{ height: 60 }} />
      <View style={styles.headerTitleContainer}>
        <Text style={styles.pageTitle}>Quản lý thực đơn</Text>
        <View style={styles.headerStats}>
          <View style={styles.statPill}>
            <Text style={styles.statText}>{activeCount} đang bán</Text>
          </View>
          <View style={[styles.statPill, { backgroundColor: outOfStock > 0 ? colors.dangerBg : colors.successBg }]}>
            <Text style={[styles.statText, { color: outOfStock > 0 ? colors.danger : colors.success }]}>
              {outOfStock} hết hàng
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.searchWrap, shadows.sm]}>
        <Ionicons name="search-outline" size={16} color={colors.muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm tên món..."
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
        />
        {search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color={colors.muted} /></Pressable> : null}
      </View>

      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catList}
        >
          {categories.map((item) => {
            const isActive = filterCat === item
            return (
              <Pressable
                key={item}
                onPress={() => setFilterCat(item)}
                style={[styles.catChip, isActive && styles.catChipActive]}
              >
                <Text style={[styles.catText, isActive && styles.catTextActive]}>
                  {item === 'ALL' ? 'Tất cả' : item}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.ma_san_pham)}
        renderItem={({ item }) => {
          const isSaving = savingId === item.ma_san_pham
          const isLowStock = item.muc_canh_bao > 0 && item.so_luong_ton > 0 && item.so_luong_ton <= item.muc_canh_bao
          const isOutOfStock = item.so_luong_ton <= 0

          return (
            <View style={[styles.itemCard, shadows.sm]}>
              <View style={styles.itemLeft}>
                <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                {item.category ? <Text style={styles.itemCat}>{item.category}</Text> : null}
                <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
                <View style={styles.stockRow}>
                  <Ionicons
                    name={isOutOfStock ? 'alert-circle' : isLowStock ? 'warning' : 'checkmark-circle'}
                    size={14}
                    color={isOutOfStock ? colors.danger : isLowStock ? colors.warning : colors.success}
                  />
                  <Text style={[styles.stockText, { color: isOutOfStock ? colors.danger : isLowStock ? colors.warning : colors.textSecondary }]}>
                    Tồn kho: {item.so_luong_ton}
                    {isLowStock ? ' (sắp hết)' : isOutOfStock ? ' (HẾT HÀNG)' : ''}
                  </Text>
                </View>
              </View>
              <View style={styles.itemRight}>
                {isSaving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Switch
                    value={item.dang_ban}
                    onValueChange={() => toggleStatus(item.ma_san_pham, item.dang_ban)}
                    trackColor={{ false: colors.border, true: colors.successBg }}
                    thumbColor={item.dang_ban ? colors.success : colors.muted}
                    ios_backgroundColor={colors.border}
                  />
                )}
                <Text style={[styles.statusLabel, { color: item.dang_ban ? colors.success : colors.muted }]}>
                  {item.dang_ban ? 'Đang bán' : 'Tạm ngưng'}
                </Text>
              </View>
            </View>
          )
        }}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingWrap}><ActivityIndicator color={colors.primary} size="large" /></View>
          ) : (
            <View style={styles.emptyWrap}>
              <Ionicons name="restaurant-outline" size={44} color={colors.border} />
              <Text style={styles.emptyText}>Không có món nào</Text>
            </View>
          )
        }
        onRefresh={() => { setRefreshing(true); loadData() }}
        refreshing={refreshing}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerTitleContainer: { marginBottom: spacing.sm, paddingLeft: 60, paddingRight: spacing.lg },
  pageTitle: { fontSize: 24, fontWeight: '900', color: colors.text, marginBottom: 8 },
  headerStats: { flexDirection: 'row', gap: 8 },
  statPill: {
    backgroundColor: colors.infoBg,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statText: { fontSize: 12, fontWeight: '700', color: colors.info },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '500' },
  catList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: 8, paddingRight: spacing.lg + 20 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  catText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  catTextActive: { color: colors.primaryDark },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.dangerBg,
    borderRadius: radius.sm,
    padding: 10,
  },
  errorText: { flex: 1, fontSize: 13, color: colors.danger },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 100, gap: 12 },
  loadingWrap: { alignItems: 'center', paddingVertical: 40 },
  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 13, color: colors.muted },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 12,
  },
  itemLeft: { flex: 1, gap: 4 },
  itemName: { fontSize: 15, fontWeight: '800', color: colors.text },
  itemCat: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  itemPrice: { fontSize: 15, fontWeight: '900', color: colors.text },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  stockText: { fontSize: 12, fontWeight: '600' },
  itemRight: { alignItems: 'center', gap: 4, minWidth: 60 },
  statusLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
})