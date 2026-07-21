import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  TextInput,
  Linking,
  Image,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import apiClient from '../lib/apiClient'
import { normalizeBranch, safeArray } from '../lib/customerData'
import { colors, spacing, shadows, radius } from '../theme'

function BranchCard({ branch, onPress }) {
  const isOpen = (() => {
    if (!branch.gio_mo_cua || !branch.gio_dong_cua) return true
    const now = new Date()
    const [openH, openM] = branch.gio_mo_cua.split(':').map(Number)
    const [closeH, closeM] = branch.gio_dong_cua.split(':').map(Number)
    const nowMinutes = now.getHours() * 60 + now.getMinutes()
    const openMinutes = openH * 60 + openM
    const closeMinutes = closeH * 60 + closeM
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes
  })()

  return (
    <Pressable
      onPress={() => onPress(branch)}
      style={({ pressed }) => [styles.branchCard, shadows.sm, pressed && { opacity: 0.92 }]}
    >
      {/* Branch Image */}
      {branch.hinh_anh_url ? (
        <Image source={{ uri: branch.hinh_anh_url }} style={styles.branchImage} resizeMode="cover" />
      ) : (
        <LinearGradient colors={['#f26b1d', '#3d1a08']} style={[styles.branchImage, styles.branchImageGradient]}>
          <Ionicons name="storefront-outline" size={36} color="#fff" />
          <Text style={styles.branchInitials}>
            {String(branch.ten_chi_nhanh || '')[0]?.toUpperCase() || '☕'}
          </Text>
        </LinearGradient>
      )}

      {/* Open/Closed Badge */}
      <View style={[styles.openBadge, { backgroundColor: isOpen ? '#f0fdf4' : '#fef2f2' }]}>
        <View style={[styles.openDot, { backgroundColor: isOpen ? '#22c55e' : '#ef4444' }]} />
        <Text style={[styles.openText, { color: isOpen ? '#16a34a' : '#dc2626' }]}>
          {isOpen ? 'Đang mở' : 'Đã đóng'}
        </Text>
      </View>

      {/* Info */}
      <View style={styles.branchInfo}>
        <Text style={styles.branchName}>{branch.ten_chi_nhanh}</Text>

        <View style={styles.branchDetailRow}>
          <Ionicons name="location-outline" size={14} color={colors.primary} />
          <Text style={styles.branchAddress} numberOfLines={2}>{branch.dia_chi}</Text>
        </View>

        {branch.thanh_pho || branch.quan_huyen ? (
          <View style={styles.branchDetailRow}>
            <Ionicons name="map-outline" size={14} color={colors.muted} />
            <Text style={styles.branchCity}>
              {[branch.quan_huyen, branch.thanh_pho].filter(Boolean).join(', ')}
            </Text>
          </View>
        ) : null}

        {branch.gio_mo_cua && branch.gio_dong_cua ? (
          <View style={styles.branchDetailRow}>
            <Ionicons name="time-outline" size={14} color={colors.muted} />
            <Text style={styles.branchHours}>
              {branch.gio_mo_cua} - {branch.gio_dong_cua}
            </Text>
          </View>
        ) : null}

        {branch.so_dien_thoai ? (
          <View style={styles.branchDetailRow}>
            <Ionicons name="call-outline" size={14} color={colors.muted} />
            <Text style={styles.branchPhone}>{branch.so_dien_thoai}</Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.branchActions}>
          {branch.so_dien_thoai ? (
            <Pressable
              onPress={() => Linking.openURL(`tel:${branch.so_dien_thoai}`).catch(() => {})}
              style={styles.branchActionBtn}
            >
              <Ionicons name="call-outline" size={15} color={colors.primary} />
              <Text style={styles.branchActionText}>Gọi ngay</Text>
            </Pressable>
          ) : null}
          {branch.map_url ? (
            <Pressable
              onPress={() => Linking.openURL(branch.map_url).catch(() => {})}
              style={[styles.branchActionBtn, styles.branchActionBtnPrimary]}
            >
              <Ionicons name="navigate-outline" size={15} color="#fff" />
              <Text style={[styles.branchActionText, { color: '#fff' }]}>Chỉ đường</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

export function StoresScreen({ navigation }) {
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('all')

  const branchesQuery = useQuery({
    queryKey: ['customer', 'branches-all'],
    queryFn: async () => {
      const response = await apiClient.get('/users/branches/public')
      return safeArray(response?.items || response).map(normalizeBranch)
    },
    staleTime: 5 * 60 * 1000,
  })

  const branches = branchesQuery.data || []

  const cities = ['all', ...new Set(branches.map(b => b.thanh_pho).filter(Boolean))]

  const filtered = branches.filter(b => {
    const matchSearch = !search.trim() ||
      b.ten_chi_nhanh.toLowerCase().includes(search.toLowerCase()) ||
      b.dia_chi.toLowerCase().includes(search.toLowerCase()) ||
      b.thanh_pho?.toLowerCase().includes(search.toLowerCase())
    const matchCity = cityFilter === 'all' || b.thanh_pho === cityFilter
    return matchSearch && matchCity
  })

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => navigation?.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#1e293b" />
          </Pressable>
          <View>
            <Text style={styles.headerTitle}>Cửa hàng của chúng tôi</Text>
            <Text style={styles.headerSubtitle}>{branches.length} chi nhánh trên toàn quốc</Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color="#64748b" style={styles.searchIcon} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm chi nhánh, địa chỉ..."
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
          />
          {search ? (
            <Pressable onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#94a3b8" />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* City Filter */}
      {cities.length > 1 ? (
        <View style={styles.cityBar}>
          <View style={[styles.cityList, { flexDirection: 'row', flexWrap: 'wrap' }]}>
            {cities.map(item => (
              <Pressable
                key={item}
                onPress={() => setCityFilter(item)}
                style={[styles.cityChip, cityFilter === item && styles.cityChipActive]}
              >
                <Text style={[styles.cityText, cityFilter === item && styles.cityTextActive]}>
                  {item === 'all' ? '🗺️ Tất cả' : item}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {/* Loading */}
      {branchesQuery.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Đang tải chi nhánh...</Text>
        </View>
      ) : null}

      {/* Empty */}
      {!branchesQuery.isLoading && filtered.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="storefront-outline" size={56} color={colors.border} />
          <Text style={styles.emptyTitle}>Không tìm thấy chi nhánh</Text>
          <Text style={styles.emptyText}>Thử thay đổi từ khóa tìm kiếm.</Text>
          <Pressable onPress={() => { setSearch(''); setCityFilter('all') }} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Xóa bộ lọc</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Branch List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id || item.ma_chi_nhanh}
        renderItem={({ item }) => (
          <BranchCard branch={item} onPress={() => {}} />
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onRefresh={() => branchesQuery.refetch()}
        refreshing={branchesQuery.isFetching && !branchesQuery.isLoading}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1e293b',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 2,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    height: 46,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#1e293b',
    fontSize: 14,
    fontWeight: '500',
  },
  cityBar: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  cityList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  cityChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.cream,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cityChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  cityText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  cityTextActive: {
    color: '#fff',
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 13,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  clearBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  clearBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },

  // Branch Card
  branchCard: {
    backgroundColor: colors.card,
    borderRadius: radius.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.borderLight,
    position: 'relative',
  },
  branchImage: {
    width: '100%',
    height: 180,
    backgroundColor: colors.cream,
  },
  branchImageGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  branchInitials: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
  },
  openBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  openDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  openText: {
    fontSize: 11,
    fontWeight: '900',
  },
  branchInfo: {
    padding: spacing.md,
    gap: 8,
  },
  branchName: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  branchDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  branchAddress: {
    flex: 1,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    fontWeight: '500',
  },
  branchCity: {
    flex: 1,
    fontSize: 12,
    color: colors.muted,
  },
  branchHours: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '700',
  },
  branchPhone: {
    fontSize: 13,
    color: colors.muted,
  },
  branchActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
  },
  branchActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#fff9f5',
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ffe0c8',
    flex: 1,
    justifyContent: 'center',
  },
  branchActionBtnPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    flex: 1.5,
  },
  branchActionText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
})
