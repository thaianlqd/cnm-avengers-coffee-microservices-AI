import React, { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAdmin } from '../context/AdminContext'
import apiClient from '../lib/apiClient'
import { safeArray, formatCurrency, formatDateTime } from '../lib/adminData'
import { colors, spacing, radius, shadows } from '../theme'

const TABS = [
  { id: 'overview', label: 'Tổng quan', icon: 'grid-outline' },
  { id: 'users', label: 'Người dùng', icon: 'people-outline' },
  { id: 'branches', label: 'Chi nhánh', icon: 'map-outline' },
  { id: 'categories', label: 'Danh mục', icon: 'pricetag-outline' },
  { id: 'menu', label: 'Menu tổng', icon: 'restaurant-outline' },
  { id: 'promotions', label: 'Khuyến mãi', icon: 'gift-outline' },
  { id: 'ai', label: 'AI', icon: 'sparkles-outline' },
  { id: 'account', label: 'Hồ sơ', icon: 'person-outline' },
]

function statValue(value) {
  if (value == null) return '0'
  if (typeof value === 'number') return value.toLocaleString('vi-VN')
  return String(value)
}

function SectionCard({ title, subtitle, children, rightLabel }) {
  return (
    <View style={[styles.sectionCard, shadows.sm]}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
        </View>
        {rightLabel ? <Text style={styles.sectionRightLabel}>{rightLabel}</Text> : null}
      </View>
      {children}
    </View>
  )
}

function RowCard({ label, value, sub }) {
  return (
    <View style={styles.rowCard}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
    </View>
  )
}

export function AdminSystemConsoleScreen() {
  const { admin, logout } = useAdmin()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('overview')

  const statsQuery = useQuery({
    queryKey: ['admin', 'system', 'stats'],
    queryFn: async () => apiClient.get('/users/admin/stats'),
    staleTime: 60 * 1000,
  })

  const usersQuery = useQuery({
    queryKey: ['admin', 'system', 'users'],
    queryFn: async () => {
      const response = await apiClient.get('/users/admin/accounts?limit=200')
      return safeArray(response?.items || response)
    },
    staleTime: 60 * 1000,
  })

  const branchesQuery = useQuery({
    queryKey: ['admin', 'system', 'branches'],
    queryFn: async () => {
      const response = await apiClient.get('/users/admin/branches')
      return safeArray(response?.items || response)
    },
    staleTime: 60 * 1000,
  })

  const categoriesQuery = useQuery({
    queryKey: ['admin', 'system', 'categories'],
    queryFn: async () => {
      const response = await apiClient.get('/menu/categories')
      return safeArray(response?.items || response)
    },
    staleTime: 60 * 1000,
  })

  const menuQuery = useQuery({
    queryKey: ['admin', 'system', 'menu'],
    queryFn: async () => {
      const response = await apiClient.get('/menu/items?sort=price_desc')
      return safeArray(response?.items || response)
    },
    staleTime: 60 * 1000,
  })

  const promotionsQuery = useQuery({
    queryKey: ['admin', 'system', 'promotions'],
    queryFn: async () => {
      const response = await apiClient.get('/promotions/admin')
      return safeArray(response?.items || response)
    },
    staleTime: 60 * 1000,
  })

  const aiStatsQuery = useQuery({
    queryKey: ['admin', 'system', 'ai'],
    queryFn: async () => {
      try {
        return await apiClient.get('/ai/model/stats')
      } catch {
        return null
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  const refreshMutation = useMutation({
    mutationFn: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'system', 'stats'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'system', 'users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'system', 'branches'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'system', 'categories'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'system', 'menu'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'system', 'promotions'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'system', 'ai'] }),
      ])
    },
  })

  const stats = statsQuery.data || {}
  const users = usersQuery.data || []
  const branches = branchesQuery.data || []
  const categories = categoriesQuery.data || []
  const menuItems = menuQuery.data || []
  const promotions = promotionsQuery.data || []
  const aiStats = aiStatsQuery.data || {}

  const roleBreakdown = useMemo(() => {
    const counts = { ADMIN: 0, MANAGER: 0, STAFF: 0, CUSTOMER: 0 }
    for (const user of users) {
      const role = String(user.vai_tro || user.vaiTro || user.role || 'STAFF').toUpperCase()
      counts[role] = (counts[role] || 0) + 1
    }
    return counts
  }, [users])

  const renderOverview = () => (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pagePad}>
      <View style={styles.kpiGrid}>
        <RowCard label="Tổng tài khoản" value={statValue(stats?.totalUsers || users.length)} sub={`${statValue(stats?.branchCount || branches.length)} chi nhánh`}/>
        <RowCard label="Hoạt động" value={`${statValue(stats?.activeRate || 0)}%`} sub={`${statValue(stats?.activeUsers || 0)} active`}/>
        <RowCard label="Khối vận hành" value={statValue(stats?.workforceCount || 0)} sub={`${statValue(stats?.workforceRate || 0)}% STAFF/MANAGER`}/>
        <RowCard label="Khách hàng" value={statValue(stats?.customerCount || 0)} sub={`${statValue(stats?.customerRate || 0)}% toàn hệ thống`}/>
      </View>

      <SectionCard title="Phân tích lực lượng" subtitle="ADMIN / MANAGER / STAFF / CUSTOMER">
        <View style={styles.pillGrid}>
          {Object.entries(roleBreakdown).map(([role, count]) => (
            <View key={role} style={styles.rolePill}>
              <Text style={styles.rolePillLabel}>{role}</Text>
              <Text style={styles.rolePillValue}>{statValue(count)}</Text>
            </View>
          ))}
        </View>
      </SectionCard>

      <SectionCard title="AI / hệ thống" subtitle="Tình trạng mô hình & thống kê nhanh">
        <View style={styles.kpiGridCompact}>
          <RowCard label="Model" value={aiStats?.model_name || aiStats?.modelName || 'AI'} sub={aiStats?.status || 'Chưa xác định'} />
          <RowCard label="Độ chính xác" value={aiStats?.accuracy != null ? `${aiStats.accuracy}%` : '---'} sub="Mô hình đề xuất" />
          <RowCard label="Huấn luyện" value={statValue(aiStats?.trained_samples || aiStats?.samples || 0)} sub="mẫu dữ liệu" />
          <RowCard label="Cảnh báo" value={statValue(aiStats?.warnings || 0)} sub="Cần theo dõi" />
        </View>
      </SectionCard>
    </ScrollView>
  )

  const renderList = (data, emptyTitle, emptySub, renderItem) => (
    <FlatList
      data={data}
      keyExtractor={(item, idx) => String(item.id || item.code || item.ma_khuyen_mai || idx)}
      renderItem={renderItem}
      contentContainerStyle={styles.listPad}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Ionicons name="information-circle-outline" size={42} color={colors.border} />
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyText}>{emptySub}</Text>
        </View>
      }
      refreshing={refreshMutation.isPending}
      onRefresh={() => refreshMutation.mutate()}
    />
  )

  const content = (() => {
    if (activeTab === 'overview') return renderOverview()

    if (activeTab === 'users') {
      return renderList(users, 'Chưa có tài khoản', 'Dữ liệu users sẽ hiển thị ở đây.', ({ item }) => (
        <View style={[styles.itemCard, shadows.xs]}>
          <View style={styles.itemHead}>
            <Text style={styles.itemTitle}>{item.ho_ten || item.ten || item.tenDangNhap || item.email || 'User'}</Text>
            <Text style={styles.itemBadge}>{String(item.vai_tro || item.vaiTro || item.role || 'STAFF').toUpperCase()}</Text>
          </View>
          <Text style={styles.itemMeta}>{item.tenDangNhap || item.ten_dang_nhap || item.email || ''}</Text>
          <Text style={styles.itemMeta}>{item.co_so_ten || item.coSoTen || item.branch_code || '---'}</Text>
        </View>
      ))
    }

    if (activeTab === 'branches') {
      return renderList(branches, 'Chưa có chi nhánh', 'Danh sách chi nhánh hệ thống.', ({ item }) => (
        <View style={[styles.itemCard, shadows.xs]}>
          <View style={styles.itemHead}>
            <Text style={styles.itemTitle}>{item.ten_chi_nhanh || item.ten || item.name || item.ma_chi_nhanh || 'Branch'}</Text>
            <Text style={styles.itemBadge}>{String(item.trang_thai || 'ACTIVE').toUpperCase()}</Text>
          </View>
          <Text style={styles.itemMeta}>{item.ma_chi_nhanh || item.code || item.id || ''}</Text>
          <Text style={styles.itemMeta}>{item.dia_chi || item.address || ''}</Text>
        </View>
      ))
    }

    if (activeTab === 'categories') {
      return renderList(categories, 'Chưa có danh mục', 'Các danh mục menu tổng.', ({ item }) => (
        <View style={[styles.itemCard, shadows.xs]}>
          <Text style={styles.itemTitle}>{item.ten_danh_muc || item.label || item.name || 'Danh mục'}</Text>
          <Text style={styles.itemMeta}>Mã: {item.code || item.id || '---'}</Text>
        </View>
      ))
    }

    if (activeTab === 'menu') {
      return renderList(menuItems, 'Chưa có menu', 'Danh sách menu tổng.', ({ item }) => (
        <View style={[styles.itemCard, shadows.xs]}>
          <View style={styles.itemHead}>
            <Text style={styles.itemTitle}>{item.ten_san_pham || item.name || 'Sản phẩm'}</Text>
            <Text style={styles.itemBadge}>{formatCurrency(item.gia_ban || item.price || 0)}</Text>
          </View>
          <Text style={styles.itemMeta}>{item.danh_muc || item.category || '---'}</Text>
          <Text style={styles.itemMeta}>{item.dang_ban === false ? 'Tạm ngưng bán' : 'Đang bán'}</Text>
        </View>
      ))
    }

    if (activeTab === 'promotions') {
      return renderList(promotions, 'Chưa có khuyến mãi', 'Các chương trình khuyến mãi & voucher.', ({ item }) => (
        <View style={[styles.itemCard, shadows.xs]}>
          <View style={styles.itemHead}>
            <Text style={styles.itemTitle}>{item.ma_khuyen_mai || item.code || 'PROMO'}</Text>
            <Text style={styles.itemBadge}>{String(item.trang_thai || 'ACTIVE').toUpperCase()}</Text>
          </View>
          <Text style={styles.itemMeta}>{item.ten_khuyen_mai || item.name || ''}</Text>
          <Text style={styles.itemMeta}>{item.loai_khuyen_mai || item.type || ''}</Text>
        </View>
      ))
    }

    return (
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.pagePad}>
        <SectionCard title="Giám sát hệ thống" subtitle="Kết nối dữ liệu hệ thống và AI">
          <View style={styles.kpiGridCompact}>
            <RowCard label="Users" value={statValue(users.length)} sub="Tài khoản" />
            <RowCard label="Branches" value={statValue(branches.length)} sub="Chi nhánh" />
            <RowCard label="Menu" value={statValue(menuItems.length)} sub="Sản phẩm" />
            <RowCard label="Promotions" value={statValue(promotions.length)} sub="Khuyến mãi" />
          </View>
        </SectionCard>
      </ScrollView>
    )
  })()

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#0d0a08', '#1a1410', '#2d1e0f']} style={styles.header}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>System-wide Control</Text>
            <Text style={styles.headerTitle}>Bảng điều khiển Quản trị viên hệ thống</Text>
            <Text style={styles.headerSubtitle}>Tách biệt hoàn toàn với Manager/Staff để quản trị dữ liệu hệ thống.</Text>
          </View>
          <Pressable onPress={() => refreshMutation.mutate()} style={styles.refreshBtn}>
            <Ionicons name="refresh-outline" size={18} color="#fff" />
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {TABS.map((tab) => (
            <Pressable key={tab.id} onPress={() => setActiveTab(tab.id)} style={[styles.tabChip, activeTab === tab.id && styles.tabChipActive]}>
              <Ionicons name={tab.icon} size={14} color={activeTab === tab.id ? '#fff' : colors.muted} />
              <Text style={[styles.tabChipText, activeTab === tab.id && styles.tabChipTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </LinearGradient>

      {statsQuery.isLoading || usersQuery.isLoading || branchesQuery.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Đang tải dữ liệu hệ thống...</Text>
        </View>
      ) : null}

      {content}

      <View style={styles.footer}>
        <View>
          <Text style={styles.footerUser}>{admin?.ho_ten || admin?.tenDangNhap || admin?.email || 'Administrator'}</Text>
          <Text style={styles.footerSub}>Toàn hệ thống cửa hàng</Text>
        </View>
        <Pressable onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Đăng xuất</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 52, paddingHorizontal: spacing.lg, paddingLeft: 68, paddingBottom: spacing.md, gap: spacing.md },
  headerRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  kicker: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, color: '#f9c79a', textTransform: 'uppercase' },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#fff', lineHeight: 30 },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.68)', marginTop: 4 },
  refreshBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  tabRow: { gap: 8, paddingBottom: 4 },
  tabChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  tabChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabChipText: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.72)' },
  tabChipTextActive: { color: '#fff' },
  loadingWrap: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: spacing.lg },
  loadingText: { color: colors.muted, fontSize: 13 },
  pagePad: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl + 70 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  kpiGridCompact: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rowCard: { width: '48.3%', backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight },
  rowLabel: { fontSize: 11, color: colors.muted, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  rowValue: { fontSize: 20, color: colors.text, fontWeight: '900', marginTop: 6 },
  rowSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  sectionCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, gap: spacing.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: colors.text },
  sectionSubtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  sectionRightLabel: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rolePill: { width: '48%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  rolePillLabel: { fontSize: 11, color: colors.muted, fontWeight: '800' },
  rolePillValue: { fontSize: 20, fontWeight: '900', color: colors.text, marginTop: 2 },
  listPad: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl + 70 },
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  itemCard: { backgroundColor: colors.card, borderRadius: radius.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.borderLight, gap: 4 },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  itemTitle: { fontSize: 14, fontWeight: '900', color: colors.text, flex: 1 },
  itemBadge: { fontSize: 10, fontWeight: '900', color: colors.primary, backgroundColor: colors.primary + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  itemMeta: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, backgroundColor: 'rgba(255,255,255,0.96)', borderTopWidth: 1, borderTopColor: colors.border },
  footerUser: { fontSize: 13, fontWeight: '900', color: colors.text },
  footerSub: { fontSize: 11, color: colors.muted },
  logoutBtn: { backgroundColor: '#ef4444', borderRadius: radius.full, paddingHorizontal: 14, paddingVertical: 10 },
  logoutText: { color: '#fff', fontWeight: '900', fontSize: 12 },
})