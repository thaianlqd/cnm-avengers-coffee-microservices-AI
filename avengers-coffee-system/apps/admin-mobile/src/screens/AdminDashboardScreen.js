import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAdmin } from '../context/AdminContext'
import apiClient from '../lib/apiClient'
import { colors, radius, shadows, spacing } from '../theme'
import { formatCurrency } from '../lib/adminData'

export function AdminDashboardScreen() {
  const { sessionUsername } = useAdmin()

  const [statsData, setStatsData] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiClient.get('/users/admin/stats')
      setStatsData(response || {})
    } catch {
      setStatsData({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const {
    dashboardSummary,
    roleChartRows,
    branchChartRows,
  } = useMemo(() => {
    if (!statsData) {
      return { dashboardSummary: {}, roleChartRows: [], branchChartRows: [] }
    }

    const totalUsers = Number(statsData.total_users || 0)
    const activeUsers = Number(statsData.active_users || 0)
    const inactiveUsers = Number(statsData.inactive_users || 0)
    const byRole = statsData.by_role || {}
    const byBranch = statsData.by_branch || {}

    const managerCount = Number(byRole.MANAGER || 0)
    const staffCount = Number(byRole.STAFF || 0)
    const customerCount = Number(byRole.CUSTOMER || 0)
    const adminCount = Number(byRole.ADMIN || 0)

    const activeRate = totalUsers ? Math.round((activeUsers / totalUsers) * 100) : 0
    const workforceCount = managerCount + staffCount
    const workforceRate = totalUsers ? Math.round((workforceCount / totalUsers) * 100) : 0
    const customerRate = totalUsers ? Math.round((customerCount / totalUsers) * 100) : 0

    // Role Chart
    const roleEntries = Object.entries(byRole)
    const rMax = Math.max(...roleEntries.map(([, v]) => v), 1)
    const roles = ['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER']
    const roleChart = roles.map(r => {
      const cnt = Number(byRole[r] || 0)
      return {
        role: r,
        count: cnt,
        percent: totalUsers > 0 ? Math.round((cnt / totalUsers) * 100) : 0,
        percentOfMax: Math.round((cnt / rMax) * 100)
      }
    })

    // Branch Chart
    const branchEntries = Object.entries(byBranch)
    const bMax = Math.max(...branchEntries.map(([, v]) => v), 1)
    const branchChart = branchEntries.map(([code, cnt]) => {
      return {
        code,
        label: code,
        count: cnt,
        percent: totalUsers > 0 ? Math.round((cnt / totalUsers) * 100) : 0,
        percentOfMax: Math.round((cnt / bMax) * 100)
      }
    }).sort((a, b) => b.count - a.count)

    const branchCount = branchChart.length

    return {
      dashboardSummary: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        managerCount,
        staffCount,
        customerCount,
        adminCount,
        workforceCount,
        activeRate,
        workforceRate,
        customerRate,
        branchCount,
      },
      roleChartRows: roleChart,
      branchChartRows: branchChart,
    }
  }, [statsData])

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={{ height: 60 }} />
      <View style={styles.headerTitleContainer}>
        <Text style={styles.pageTitle}>Quản trị viên hệ thống</Text>
        <Text style={styles.pageSubtitle}>System-wide Control</Text>
      </View>

      <View style={styles.welcomeCard}>
        <Text style={styles.welcomeTitle}>Bảng điều khiển tổng</Text>
        <Text style={styles.welcomeSubtitle}>Tách biệt hoàn toàn với giao diện Manager/Staff để tập trung vận hành và quản trị dữ liệu hệ thống.</Text>
      </View>

      <Text style={styles.sectionTitle}>Thống kê người dùng toàn hệ thống</Text>

      {/* KPI Grid */}
      <View style={styles.kpiGrid}>
        <View style={[styles.kpiCard, styles.kpiCardPrimary]}>
          <Text style={styles.kpiLabelLight}>Tổng tài khoản</Text>
          <Text style={styles.kpiValueLight}>{dashboardSummary.totalUsers}</Text>
          <Text style={styles.kpiDescLight}>{dashboardSummary.branchCount} chi nhánh đang có tài khoản</Text>
        </View>
        <View style={[styles.kpiCard, styles.kpiCardInfo]}>
          <Text style={styles.kpiLabelLight}>Tỷ lệ hoạt động</Text>
          <Text style={styles.kpiValueLight}>{dashboardSummary.activeRate}%</Text>
          <Text style={styles.kpiDescLight}>{dashboardSummary.activeUsers} active / {dashboardSummary.inactiveUsers} inactive</Text>
        </View>
        <View style={[styles.kpiCard, styles.kpiCardSuccess]}>
          <Text style={styles.kpiLabelLight}>Khối vận hành</Text>
          <Text style={styles.kpiValueLight}>{dashboardSummary.workforceCount}</Text>
          <Text style={styles.kpiDescLight}>{dashboardSummary.workforceRate}% tổng users là STAFF/MANAGER</Text>
        </View>
        <View style={[styles.kpiCard, styles.kpiCardDanger]}>
          <Text style={styles.kpiLabelLight}>Khách hàng</Text>
          <Text style={styles.kpiValueLight}>{dashboardSummary.customerCount}</Text>
          <Text style={styles.kpiDescLight}>{dashboardSummary.customerRate}% trên toàn hệ thống</Text>
        </View>
      </View>

      {/* Role Chart */}
      <View style={[styles.card, shadows.sm]}>
        <Text style={styles.cardTitle}>Biểu đồ cột theo role</Text>
        <View style={styles.barsWrap}>
          {roleChartRows.map((row) => (
            <View key={row.role} style={styles.barItem}>
              <View style={styles.barHeader}>
                <Text style={styles.barLabel}>{row.role}</Text>
                <Text style={styles.barValue}>{row.count} ({row.percent}%)</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${row.percentOfMax}%`, backgroundColor: '#e85d04' }]} />
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Force Info */}
      <View style={[styles.card, shadows.sm]}>
        <Text style={styles.cardTitle}>Phân tích lực lượng</Text>
        <View style={styles.rolePillGrid}>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillLabel}>ADMIN</Text>
            <Text style={styles.rolePillValue}>{dashboardSummary.adminCount}</Text>
          </View>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillLabel}>MANAGER</Text>
            <Text style={styles.rolePillValue}>{dashboardSummary.managerCount}</Text>
          </View>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillLabel}>STAFF</Text>
            <Text style={styles.rolePillValue}>{dashboardSummary.staffCount}</Text>
          </View>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillLabel}>CUSTOMER</Text>
            <Text style={styles.rolePillValue}>{dashboardSummary.customerCount}</Text>
          </View>
        </View>
      </View>

      {/* Branch Chart */}
      <View style={[styles.card, shadows.sm]}>
        <Text style={styles.cardTitle}>Phân bổ tài khoản theo chi nhánh</Text>
        <View style={styles.barsWrap}>
          {branchChartRows.map((row) => (
            <View key={row.code} style={styles.barItem}>
              <View style={styles.barHeader}>
                <Text style={styles.barLabel}>{row.label}</Text>
                <Text style={styles.barValue}>{row.count} tài khoản</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${row.percentOfMax}%`, backgroundColor: '#3b82f6' }]} />
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: spacing.lg },
  headerTitleContainer: { marginBottom: spacing.lg, paddingHorizontal: spacing.sm, paddingLeft: 52 },
  pageTitle: { fontSize: 28, fontWeight: '800', color: '#0f172a', letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 14, color: '#64748b', marginTop: 4, fontWeight: '500' },
  welcomeCard: {
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  welcomeTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  welcomeSubtitle: { fontSize: 14, color: '#475569', lineHeight: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: spacing.md, paddingHorizontal: spacing.sm },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.xl },
  kpiCard: {
    width: '47%',
    padding: spacing.lg,
    borderRadius: radius.md,
    justifyContent: 'center',
  },
  kpiCardPrimary: { backgroundColor: '#3b82f6' },
  kpiCardInfo: { backgroundColor: '#0ea5e9' },
  kpiCardSuccess: { backgroundColor: '#22c55e' },
  kpiCardDanger: { backgroundColor: '#ef4444' },
  kpiLabelLight: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600', marginBottom: 6 },
  kpiValueLight: { fontSize: 28, fontWeight: '800', color: '#ffffff', marginBottom: 6 },
  kpiDescLight: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: spacing.lg },
  barsWrap: { gap: spacing.md },
  barItem: {},
  barHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  barLabel: { fontSize: 13, fontWeight: '600', color: '#334155' },
  barValue: { fontSize: 13, color: '#64748b' },
  barTrack: { height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  rolePillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rolePill: {
    width: '48%',
    backgroundColor: '#fff8f1',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#ffedd5',
  },
  rolePillLabel: { fontSize: 12, color: '#9a3412', fontWeight: '600', marginBottom: 4 },
  rolePillValue: { fontSize: 20, fontWeight: '800', color: '#9a3412' },
})
