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
import { formatCurrency, safeArray } from '../lib/adminData'
import { colors, radius, shadows, spacing } from '../theme'

export function DashboardScreen() {
  const { sessionBranchCode, sessionUsername, sessionRole } = useAdmin()
  const branchCode = sessionBranchCode || 'MAC_DINH_CHI'

  const [orders, setOrders] = useState([])
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [ordRes, invRes] = await Promise.all([
        apiClient.get(`/staff/orders?branch_code=${encodeURIComponent(branchCode)}`),
        apiClient.get(`/inventory/items?branch_code=${encodeURIComponent(branchCode)}`),
      ])
      setOrders(safeArray(ordRes?.orders || ordRes?.items || ordRes))
      setInventory(safeArray(invRes?.items || invRes))
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [branchCode])

  useEffect(() => { loadData() }, [loadData])

  const {
    completedOrders,
    completedRevenue,
    processingOrders,
    totalRevenue,
    completionRate,
    cancelRate,
    avgValue,
    totalItemsSold,
    outOfStockCount,
    sellingCount,
    topPaymentMethod,
    topItems,
  } = useMemo(() => {
    const total = orders.length
    let completed = 0
    let cancelled = 0
    let processing = 0
    let revCompleted = 0
    let revTotal = 0
    let itemsSold = 0

    const paymentCounts = { COD: 0, QR: 0, VNPAY: 0 }
    const itemSales = {}

    orders.forEach(o => {
      const s = String(o.trang_thai_don_hang || '').toUpperCase()
      const t = Number(o.tong_tien || 0)
      const p = String(o.phuong_thuc_thanh_toan || '').toUpperCase()

      if (s === 'HOAN_THANH') {
        completed++
        revCompleted += t
      } else if (s === 'DA_HUY') {
        cancelled++
      } else {
        processing++
      }
      revTotal += t

      if (p.includes('THANH_TOAN_KHI_NHAN_HANG') || p === 'COD') paymentCounts.COD++
      else if (p.includes('QR')) paymentCounts.QR++
      else if (p.includes('VNPAY')) paymentCounts.VNPAY++

      safeArray(o.chi_tiet || o.items).forEach(i => {
        const qty = Number(i.so_luong || i.quantity || 1)
        itemsSold += qty
        const id = i.ten_san_pham || i.name || 'Sản phẩm'
        if (!itemSales[id]) itemSales[id] = { name: id, qty: 0, rev: 0 }
        itemSales[id].qty += qty
        itemSales[id].rev += Number(i.gia_ban || i.price || 0) * qty
      })
    })

    const compRate = total > 0 ? Math.round((completed / total) * 100) : 0
    const canRate = total > 0 ? Math.round((cancelled / total) * 100) : 0
    const avg = completed > 0 ? Math.round(revCompleted / completed) : 0

    let topMethod = 'N/A'
    let max = 0
    Object.entries(paymentCounts).forEach(([k, v]) => {
      if (v > max) { max = v; topMethod = k }
    })

    const topItemsSorted = Object.values(itemSales).sort((a, b) => b.qty - a.qty).slice(0, 5)

    let outOfStock = 0
    let selling = 0
    inventory.forEach(i => {
      if (i.dang_kinh_doanh || i.dang_ban) {
        if (Number(i.so_luong_ton || i.stock || 0) <= 0) outOfStock++
        else selling++
      }
    })

    return {
      completedOrders: completed,
      completedRevenue: revCompleted,
      processingOrders: processing,
      totalRevenue: revTotal,
      completionRate: compRate,
      cancelRate: canRate,
      avgValue: avg,
      totalItemsSold: itemsSold,
      outOfStockCount: outOfStock,
      sellingCount: selling,
      topPaymentMethod: topMethod,
      topItems: topItemsSorted,
    }
  }, [orders, inventory])

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
        <Text style={styles.pageTitle}>Trung tâm vận hành</Text>
        <Text style={styles.pageSubtitle}>Cơ sở {branchCode}</Text>
      </View>

      {/* Main KPI */}
      <View style={[styles.mainKpiCard, shadows.md]}>
        <Text style={styles.mainKpiLabel}>{orders.length} đơn trong phạm vi</Text>
        <Text style={styles.mainKpiValue}>Doanh thu hoàn thành {formatCurrency(completedRevenue)}</Text>
        {outOfStockCount > 0 && (
          <View style={styles.alertBox}>
            <Ionicons name="warning" size={14} color="#b45309" />
            <Text style={styles.alertText}>Cảnh báo: Có {outOfStockCount} món tạm hết cần bổ sung</Text>
          </View>
        )}
      </View>

      {/* Operational Score */}
      <View style={styles.grid}>
        <View style={[styles.card, shadows.sm]}>
          <Text style={styles.cardLabel}>Điểm vận hành</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 4 }}>
            <Text style={{ fontSize: 32, fontWeight: '900', color: colors.success }}>{(completionRate + (100 - cancelRate)) / 2 || 0}</Text>
            <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>/ 100</Text>
          </View>
        </View>
        <View style={[styles.card, shadows.sm]}>
          <Text style={styles.cardLabel}>Tỷ lệ hoàn thành</Text>
          <Text style={{ fontSize: 24, fontWeight: '900', color: colors.success, marginTop: 4 }}>{completionRate}%</Text>
          <Text style={{ fontSize: 12, color: colors.danger, marginTop: 4 }}>Tỷ lệ hủy: {cancelRate}%</Text>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.grid}>
        <View style={[styles.statBox, shadows.sm]}>
          <Text style={styles.statLabel}>Trung bình / đơn</Text>
          <Text style={styles.statValue}>{formatCurrency(avgValue)}</Text>
        </View>
        <View style={[styles.statBox, shadows.sm]}>
          <Text style={styles.statLabel}>Đang xử lý</Text>
          <Text style={styles.statValue}>{processingOrders} đơn</Text>
        </View>
        <View style={[styles.statBox, shadows.sm]}>
          <Text style={styles.statLabel}>Món đang bán</Text>
          <Text style={styles.statValue}>{sellingCount} món</Text>
        </View>
        <View style={[styles.statBox, shadows.sm]}>
          <Text style={styles.statLabel}>Sản lượng bán</Text>
          <Text style={styles.statValue}>{totalItemsSold} món</Text>
        </View>
      </View>

      {/* Health Signals */}
      <View style={[styles.cardBlock, shadows.sm]}>
        <Text style={styles.cardTitle}>Tín hiệu vận hành</Text>
        <Text style={styles.cardSub}>Cập nhật từ dữ liệu hiện có</Text>
        {outOfStockCount > 0 ? (
          <Text style={{ color: colors.danger, fontSize: 13, marginTop: 8, fontWeight: '600' }}>• Có {outOfStockCount} món tạm hết cần bổ sung</Text>
        ) : (
          <Text style={{ color: colors.success, fontSize: 13, marginTop: 8, fontWeight: '600' }}>• Tồn kho ổn định, không có món hết hàng</Text>
        )}
        {cancelRate > 10 && (
          <Text style={{ color: colors.danger, fontSize: 13, marginTop: 4, fontWeight: '600' }}>• Tỷ lệ hủy đơn đang cao ({cancelRate}%)</Text>
        )}
      </View>

      {/* Top Items */}
      <View style={[styles.cardBlock, shadows.sm]}>
        <Text style={styles.cardTitle}>Top món bán chạy</Text>
        <Text style={styles.cardSub}>Xếp theo số lượng bán</Text>
        <View style={{ marginTop: 12, gap: 12 }}>
          {topItems.length > 0 ? topItems.map((item, idx) => (
            <View key={idx} style={styles.topItemRow}>
              <View style={{ flex: 1 }}><Text style={styles.topItemName}>{item.name}</Text></View>
              <Text style={styles.topItemQty}>{item.qty}</Text>
              <Text style={styles.topItemRev}>{formatCurrency(item.rev)}</Text>
            </View>
          )) : (
            <Text style={{ color: colors.muted, fontSize: 13 }}>Chưa có dữ liệu bán hàng.</Text>
          )}
        </View>
      </View>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 100 },
  headerTitleContainer: { marginBottom: spacing.lg, paddingLeft: 60 },
  pageTitle: { fontSize: 24, fontWeight: '900', color: colors.text },
  pageSubtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  mainKpiCard: { backgroundColor: colors.primaryLight, padding: 20, borderRadius: radius.xl, marginBottom: spacing.md },
  mainKpiLabel: { fontSize: 12, color: colors.primaryDark, fontWeight: '700', marginBottom: 6 },
  mainKpiValue: { fontSize: 24, fontWeight: '900', color: colors.primaryDark, lineHeight: 32 },
  alertBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef3c7', padding: 10, borderRadius: radius.md, marginTop: 12 },
  alertText: { fontSize: 12, color: '#b45309', fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  card: { flex: 1, backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.xl, minWidth: '45%' },
  cardLabel: { fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  statBox: { width: '47%', backgroundColor: colors.card, padding: spacing.md, borderRadius: radius.xl },
  statLabel: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  statValue: { fontSize: 18, fontWeight: '900', color: colors.text, marginTop: 6 },
  cardBlock: { backgroundColor: colors.card, padding: spacing.lg, borderRadius: radius.xl, marginBottom: spacing.md },
  cardTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  topItemRow: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.borderLight, paddingBottom: 8 },
  topItemName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  topItemQty: { color: colors.primary, fontSize: 13, fontWeight: '900', width: 30, textAlign: 'center' },
  topItemRev: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', width: 80, textAlign: 'right' },
})