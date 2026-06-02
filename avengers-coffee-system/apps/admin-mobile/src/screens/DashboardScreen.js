import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAdmin } from '../context/AdminContext'
import apiClient from '../lib/apiClient'
import { formatCurrency, safeArray } from '../lib/adminData'
import { colors, radius, shadows, spacing } from '../theme'

const OVERVIEW_TIME_RANGES = [
  { id: '24h', label: '24 giờ', value: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7 ngày', value: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30 ngày', value: 30 * 24 * 60 * 60 * 1000 },
]

const ORDER_STATUS_LABEL = {
  MOI_TAO: 'Mới tạo',
  DA_XAC_NHAN: 'Đã xác nhận',
  DANG_CHUAN_BI: 'Đang chuẩn bị',
  DANG_GIAO: 'Đang giao',
  HOAN_THANH: 'Hoàn thành',
  DA_HUY: 'Đã hủy',
}

const PAYMENT_METHOD_LABEL = {
  THANH_TOAN_KHI_NHAN_HANG: 'COD',
  QR_CODE: 'QR',
  VNPAY: 'VNPAY',
}

const STATUS_COLOR = {
  MOI_TAO: '#3b82f6',
  DA_XAC_NHAN: '#8b5cf6',
  DANG_CHUAN_BI: '#f59e0b',
  DANG_GIAO: '#06b6d4',
  HOAN_THANH: '#10b981',
  DA_HUY: '#ef4444',
}

const PAYMENT_COLOR = {
  THANH_TOAN_KHI_NHAN_HANG: '#3b82f6',
  QR_CODE: '#10b981',
  VNPAY: '#f59e0b',
}

export function DashboardScreen() {
  const { sessionBranchCode, admin } = useAdmin()
  const branchCode = sessionBranchCode || 'MAC_DINH_CHI'
  const username = admin?.tenDangNhap || admin?.ho_ten || 'staff'

  const [orders, setOrders] = useState([])
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [overviewRange, setOverviewRange] = useState('7d')

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

  const overviewData = useMemo(() => {
    const rangeMeta = OVERVIEW_TIME_RANGES.find(r => r.id === overviewRange) || OVERVIEW_TIME_RANGES[1]
    const now = Date.now()
    const minTimestamp = now - rangeMeta.value

    const filteredOrders = orders.filter((order) => {
      const createdTs = new Date(order.ngay_tao).getTime()
      return !Number.isNaN(createdTs) && createdTs >= minTimestamp
    })

    const hourly = []
    const baseDate = new Date(now)
    for (let i = 7; i >= 0; i -= 1) {
      const bucket = new Date(baseDate)
      bucket.setMinutes(0, 0, 0)
      bucket.setHours(bucket.getHours() - i)
      hourly.push({
        key: bucket.toISOString(),
        label: `${String(bucket.getHours()).padStart(2, '0')}:00`,
        value: 0,
      })
    }

    const statusMap = new Map()
    Object.keys(ORDER_STATUS_LABEL).forEach(s => statusMap.set(s, { status: s, count: 0, revenue: 0 }))
    
    const paymentMap = new Map()
    paymentMap.set('THANH_TOAN_KHI_NHAN_HANG', { code: 'THANH_TOAN_KHI_NHAN_HANG', count: 0, amount: 0 })
    paymentMap.set('QR_CODE', { code: 'QR_CODE', count: 0, amount: 0 })
    paymentMap.set('VNPAY', { code: 'VNPAY', count: 0, amount: 0 })

    const revenueByDayMap = new Map()
    const soldItemsMap = new Map()

    let completedOrders = 0
    let cancelledOrders = 0
    let totalRevenue = 0
    let gross = 0
    let inProgress = 0

    filteredOrders.forEach((order) => {
      const createdAt = new Date(order.ngay_tao)
      const hourKey = new Date(createdAt)
      hourKey.setMinutes(0, 0, 0)
      const foundHour = hourly.find((h) => h.key === hourKey.toISOString())
      if (foundHour) foundHour.value += 1

      const tongTien = Number(order.tong_tien || 0)
      gross += tongTien
      
      if (order.trang_thai_don_hang === 'HOAN_THANH') {
        completedOrders++
        totalRevenue += tongTien
      } else if (order.trang_thai_don_hang === 'DA_HUY') {
        cancelledOrders++
      } else {
        inProgress++
      }

      const statusRow = statusMap.get(order.trang_thai_don_hang)
      if (statusRow) {
        statusRow.count += 1
        statusRow.revenue += tongTien
      }

      let paymentCode = order.phuong_thuc_thanh_toan
      if (!paymentMap.has(paymentCode)) {
        if (String(paymentCode).includes('QR')) paymentCode = 'QR_CODE'
        else if (String(paymentCode).includes('VNPAY')) paymentCode = 'VNPAY'
        else paymentCode = 'THANH_TOAN_KHI_NHAN_HANG'
      }
      const paymentRow = paymentMap.get(paymentCode)
      if (paymentRow) {
        paymentRow.count += 1
        paymentRow.amount += tongTien
      }

      const m = String(createdAt.getMonth() + 1).padStart(2, '0')
      const d = String(createdAt.getDate()).padStart(2, '0')
      const dayKey = `${m}-${d}`
      if (!revenueByDayMap.has(dayKey)) {
        revenueByDayMap.set(dayKey, { key: dayKey, label: `${d}-${m}`, amount: 0, orders: 0 })
      }
      const dayRow = revenueByDayMap.get(dayKey)
      dayRow.amount += tongTien
      dayRow.orders += 1

      safeArray(order.chi_tiet || order.items).forEach((line) => {
        const productKey = String(line.ma_san_pham || line.name || 'Sản phẩm')
        if (!soldItemsMap.has(productKey)) {
          soldItemsMap.set(productKey, {
            ma_san_pham: productKey,
            ten_san_pham: line.ten_san_pham || line.name || `SP ${productKey}`,
            so_luong: 0,
            doanh_thu: 0,
          })
        }
        const itemRow = soldItemsMap.get(productKey)
        const qty = Number(line.so_luong || line.quantity || 0)
        const amount = Number(line.gia_ban || line.price || 0) * qty
        itemRow.so_luong += qty
        itemRow.doanh_thu += amount
      })
    })

    const statusRows = [...statusMap.values()].filter((row) => row.count > 0)
    const paymentRows = [...paymentMap.values()].filter((row) => row.count > 0)
    const paymentTotal = paymentRows.reduce((sum, row) => sum + row.count, 0)
    const maxHourly = Math.max(...hourly.map((h) => h.value), 1)
    const maxStatus = Math.max(...statusRows.map((h) => h.count), 1)
    const revenueByDay = [...revenueByDayMap.values()].sort((a, b) => a.key.localeCompare(b.key))
    const maxRevenueDay = Math.max(...revenueByDay.map((d) => d.amount), 1)
    const topItems = [...soldItemsMap.values()].sort((a, b) => b.so_luong - a.so_luong).slice(0, 5)

    const activeMenuCount = inventory.filter((item) => item.dang_ban || item.dang_kinh_doanh).length
    const outOfStockCount = inventory.filter(i => (i.dang_ban || i.dang_kinh_doanh) && Number(i.so_luong_ton || i.stock || 0) <= 0).length
    const lowStockCount = inventory.filter(i => (i.dang_ban || i.dang_kinh_doanh) && Number(i.so_luong_ton || i.stock || 0) > 0 && Number(i.so_luong_ton || i.stock || 0) <= Number(i.muc_canh_bao || 0)).length

    const stockSummary = {
      total: inventory.length,
      available: activeMenuCount,
      lowStock: lowStockCount,
      outOfStock: outOfStockCount,
    }

    const totalOrders = filteredOrders.length
    const completionRate = totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0
    const cancelRate = totalOrders > 0 ? Math.round((cancelledOrders / totalOrders) * 100) : 0
    const inventoryHealthRate = activeMenuCount > 0 ? Math.round(((activeMenuCount - outOfStockCount) / activeMenuCount) * 100) : 100
    const efficiencyScore = Math.round((completionRate + (100 - cancelRate) + inventoryHealthRate) / 3)

    const alerts = []
    if (outOfStockCount > 0) alerts.push(`Có ${outOfStockCount} món tạm hết cần bổ sung`)
    if (cancelRate > 10) alerts.push(`Tỷ lệ hủy đang ở mức cao (${cancelRate}%)`)
    if (alerts.length === 0) alerts.push('Tồn kho ổn định, không có món hết hàng')

    const topPaymentMethod = [...paymentRows].sort((a,b) => b.count - a.count)[0]

    return {
      filteredCount: totalOrders,
      gross,
      revenue: totalRevenue,
      inProgress,
      activeMenu: activeMenuCount,
      completedOrders,
      completionRate,
      cancelRate,
      inventoryHealthRate,
      efficiencyScore,
      averageOrderValue: completedOrders > 0 ? Math.round(totalRevenue / completedOrders) : 0,
      totalItemsSold: [...soldItemsMap.values()].reduce((sum, item) => sum + item.so_luong, 0),
      averageItemsPerOrder: completedOrders > 0 ? (([...soldItemsMap.values()].reduce((sum, item) => sum + item.so_luong, 0)) / completedOrders).toFixed(1) : 0,
      peakHour: [...hourly].sort((a,b) => b.value - a.value)[0],
      bestRevenueDay: [...revenueByDay].sort((a,b) => b.amount - a.amount)[0],
      topPaymentMethod,
      alerts,
      hourly,
      maxHourly,
      statusRows,
      maxStatus,
      paymentRows,
      paymentTotal,
      revenueByDay,
      maxRevenueDay,
      topItems,
      stockSummary,
      rangeMeta
    }
  }, [orders, inventory, overviewRange])

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  const primaryAlert = overviewData.alerts?.[0] || 'Đang đợi thêm dữ liệu vận hành'

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={{ height: 60 }} />
      <View style={styles.headerTitleContainer}>
        <Text style={styles.pageTitle}>Trung tâm vận hành</Text>
        <Text style={styles.pageSubtitle}>Xin chào {username}, cơ sở {branchCode}.</Text>
      </View>

      {/* Main KPI Hero */}
      <View style={[styles.heroCard, shadows.lg]}>
        <Text style={styles.heroKicker}>Báo cáo hoạt động chi nhánh</Text>
        <Text style={styles.heroTitle}>Cơ sở {branchCode}</Text>
        <Text style={styles.heroDesc}>
          Theo dõi doanh thu, sức khỏe vận hành, tỉ lệ hoàn thành và hiệu quả bán hàng theo phạm vi lọc {overviewData.rangeMeta.label.toLowerCase()}.
        </Text>

        <View style={styles.heroTagRow}>
          <Text style={styles.heroTag}>{overviewData.filteredCount} đơn trong phạm vi</Text>
          <Text style={styles.heroTag}>Doanh thu hoàn thành {formatCurrency(overviewData.revenue)}</Text>
          <Text style={styles.heroTagAlert}>Cảnh báo: {primaryAlert}</Text>
        </View>

        <View style={styles.heroScorecard}>
          <View style={styles.heroScoreRing}>
            <Text style={styles.heroScoreValue}>{overviewData.efficiencyScore}</Text>
            <Text style={styles.heroScoreLabel}>Điểm vận hành</Text>
          </View>
          <View style={styles.heroScoreMeta}>
            <View style={styles.heroScoreMetaItem}>
              <Text style={styles.heroScoreMetaLabel}>Tỷ lệ hoàn thành</Text>
              <Text style={styles.heroScoreMetaValue}>{overviewData.completionRate}%</Text>
            </View>
            <View style={styles.heroScoreMetaItem}>
              <Text style={styles.heroScoreMetaLabel}>Tỷ lệ hủy</Text>
              <Text style={styles.heroScoreMetaValue}>{overviewData.cancelRate}%</Text>
            </View>
            <View style={styles.heroScoreMetaItem}>
              <Text style={styles.heroScoreMetaLabel}>Giá trị trung bình / đơn</Text>
              <Text style={styles.heroScoreMetaValue}>{formatCurrency(overviewData.averageOrderValue)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.grid}>
        <View style={[styles.kpiCard, styles.kpiAmber]}>
          <Text style={styles.kpiLabel}>Doanh thu đã hoàn thành</Text>
          <Text style={styles.kpiValue}>{formatCurrency(overviewData.revenue)}</Text>
        </View>
        <View style={[styles.kpiCard, styles.kpiBlue]}>
          <Text style={styles.kpiLabel}>Đơn đang xử lý</Text>
          <Text style={styles.kpiValue}>{overviewData.inProgress} đơn</Text>
        </View>
        <View style={[styles.kpiCard, styles.kpiGreen]}>
          <Text style={styles.kpiLabel}>Món đang mở bán</Text>
          <Text style={styles.kpiValue}>{overviewData.activeMenu} món</Text>
        </View>
        <View style={[styles.kpiCard, styles.kpiBrown]}>
          <Text style={styles.kpiLabel}>Tổng giá trị đơn</Text>
          <Text style={styles.kpiValue}>{formatCurrency(overviewData.gross)}</Text>
        </View>
      </View>

      {/* Report Metric Strip */}
      <View style={styles.metricStrip}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Sản lượng bán ra</Text>
          <Text style={styles.metricValue}>{overviewData.totalItemsSold} món</Text>
          <Text style={styles.metricSub}>{overviewData.averageItemsPerOrder} món / đơn trung bình</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Giờ cao điểm</Text>
          <Text style={styles.metricValue}>{overviewData.peakHour?.label || '--:--'}</Text>
          <Text style={styles.metricSub}>{overviewData.peakHour?.value || 0} đơn ở mốc cao nhất</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Ngày doanh thu tốt nhất</Text>
          <Text style={styles.metricValue}>{overviewData.bestRevenueDay?.label || 'Chưa có'}</Text>
          <Text style={styles.metricSub}>{overviewData.bestRevenueDay ? formatCurrency(overviewData.bestRevenueDay.amount) : '---'}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Phương thức thanh toán dẫn đầu</Text>
          <Text style={styles.metricValue}>{overviewData.topPaymentMethod ? (PAYMENT_METHOD_LABEL[overviewData.topPaymentMethod.code] || overviewData.topPaymentMethod.code) : '---'}</Text>
          <Text style={styles.metricSub}>{overviewData.topPaymentMethod?.count || 0} đơn</Text>
        </View>
      </View>

      {/* Alert Grid */}
      <View style={styles.alertGrid}>
        <View style={styles.alertCard}>
          <Text style={styles.cardTitle}>Tín hiệu vận hành</Text>
          <Text style={styles.cardSub}>Cập nhật từ dữ liệu hiện có</Text>
          <View style={{ marginTop: 12 }}>
            {overviewData.alerts.map((alert, idx) => (
              <View key={idx} style={styles.alertRow}>
                <View style={styles.alertDot} />
                <Text style={styles.alertText}>{alert}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={styles.alertCard}>
          <Text style={styles.cardTitle}>Sức khỏe chi nhánh</Text>
          <Text style={styles.cardSub}>Nhìn nhanh để ra quyết định</Text>
          <View style={styles.healthGrid}>
            <View style={styles.healthItem}>
              <Text style={styles.healthLabel}>Tỷ lệ hoàn thành</Text>
              <Text style={styles.healthValue}>{overviewData.completionRate}%</Text>
            </View>
            <View style={styles.healthItem}>
              <Text style={styles.healthLabel}>Tỷ lệ hủy</Text>
              <Text style={styles.healthValue}>{overviewData.cancelRate}%</Text>
            </View>
            <View style={styles.healthItem}>
              <Text style={styles.healthLabel}>Độ phủ tồn kho sẵn sàng</Text>
              <Text style={styles.healthValue}>{overviewData.inventoryHealthRate}%</Text>
            </View>
            <View style={styles.healthItem}>
              <Text style={styles.healthLabel}>Đơn hoàn thành</Text>
              <Text style={styles.healthValue}>{overviewData.completedOrders}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Filter & Hourly Chart */}
      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Bộ lọc phân tích</Text>
        <Text style={styles.cardSub}>{overviewData.filteredCount} đơn trong phạm vi</Text>
        <View style={styles.filterRow}>
          {OVERVIEW_TIME_RANGES.map(range => (
            <Pressable
              key={range.id}
              style={[styles.filterChip, overviewRange === range.id && styles.filterChipActive]}
              onPress={() => setOverviewRange(range.id)}
            >
              <Text style={[styles.filterChipText, overviewRange === range.id && styles.filterChipTextActive]}>{range.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={{ fontSize: 11, color: colors.muted, marginBottom: 16 }}>Dữ liệu biểu đồ và KPI sẽ cập nhật theo khoảng thời gian đã chọn.</Text>
        
        <Text style={[styles.cardTitle, { marginTop: 16 }]}>Xu hướng đơn 8 giờ gần nhất</Text>
        <Text style={styles.cardSub}>Tự làm mới mỗi 30 giây</Text>
        <View style={styles.hourlyChart}>
          {overviewData.hourly.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>Chưa có dữ liệu theo giờ.</Text>
          ) : (
            overviewData.hourly.map(point => {
              const height = Math.max(12, Math.round((Number(point.value || 0) / overviewData.maxHourly) * 100))
              return (
                <View key={point.key} style={styles.hourlyCol}>
                  <Text style={styles.hourlyValue}>{point.value}</Text>
                  <View style={styles.hourlyTrack}>
                    <View style={[styles.hourlyFill, { height: `${height}%` }]} />
                  </View>
                  <Text style={styles.hourlyLabel}>{point.label}</Text>
                </View>
              )
            })
          )}
        </View>
      </View>

      {/* Status Allocation */}
      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Phân bổ trạng thái đơn</Text>
        <Text style={styles.cardSub}>Realtime từ đơn hàng</Text>
        <View style={styles.barList}>
          {overviewData.statusRows.length === 0 ? <Text style={{ color: colors.muted, fontSize: 13 }}>Chưa có dữ liệu trạng thái.</Text> : null}
          {overviewData.statusRows.map(row => (
            <View key={row.status} style={styles.barRow}>
              <View style={styles.barRowHead}>
                <Text style={styles.barRowTitle}>{ORDER_STATUS_LABEL[row.status] || row.status}</Text>
                <Text style={styles.barRowCount}>{row.count} đơn</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[
                  styles.barFill, 
                  { 
                    width: `${Math.max(5, (row.count / overviewData.maxStatus) * 100)}%`,
                    backgroundColor: STATUS_COLOR[row.status] || '#d65a12' 
                  }
                ]} />
              </View>
              <Text style={styles.barRowSub}>Giá trị: {formatCurrency(row.revenue)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Payment & Stock */}
      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Cơ cấu thanh toán và tồn kho</Text>
        <Text style={styles.cardSub}>COD / VNPAY / QR</Text>
        <View style={styles.barList}>
          {overviewData.paymentRows.length === 0 ? <Text style={{ color: colors.muted, fontSize: 13 }}>Chưa có dữ liệu thanh toán.</Text> : null}
          {overviewData.paymentRows.map(row => {
            const percent = overviewData.paymentTotal > 0 ? Math.round((row.count / overviewData.paymentTotal) * 100) : 0
            return (
              <View key={row.code} style={styles.barRow}>
                <View style={styles.barRowHead}>
                  <Text style={[styles.barRowTitle, { color: PAYMENT_COLOR[row.code] || '#333' }]}>{PAYMENT_METHOD_LABEL[row.code] || row.code}</Text>
                  <Text style={styles.barRowCount}>{row.count} đơn ({percent}%)</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[
                    styles.barFill, 
                    { 
                      width: `${Math.max(5, percent)}%`,
                      backgroundColor: PAYMENT_COLOR[row.code] || '#d65a12' 
                    }
                  ]} />
                </View>
              </View>
            )
          })}
        </View>
        <View style={styles.stockChips}>
          <Text style={styles.stockChip}>Tổng món: {overviewData.stockSummary.total}</Text>
          <Text style={styles.stockChip}>Đang bán: {overviewData.stockSummary.available}</Text>
          <Text style={styles.stockChip}>Sắp hết: {overviewData.stockSummary.lowStock}</Text>
          <Text style={styles.stockChip}>Tạm hết: {overviewData.stockSummary.outOfStock}</Text>
        </View>
      </View>
      
      {/* Payment Donut (Text representation since we don't use SVG) */}
      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Biểu đồ tròn thanh toán</Text>
        <Text style={styles.cardSub}>Tỷ trọng theo số lượng đơn</Text>
        <View style={styles.donutMock}>
          <View style={styles.donutCenter}>
            <Text style={styles.donutTotalCount}>{overviewData.paymentTotal || 0}</Text>
            <Text style={styles.donutTotalLabel}>đơn</Text>
          </View>
          <View style={styles.donutLegend}>
            {overviewData.paymentRows.map(row => {
              const percent = overviewData.paymentTotal > 0 ? Math.round((row.count / overviewData.paymentTotal) * 100) : 0
              return (
                <View key={row.code} style={styles.donutLegendRow}>
                  <View style={[styles.donutDot, { backgroundColor: PAYMENT_COLOR[row.code] || '#d65a12' }]} />
                  <Text style={styles.donutLegendTitle}>{PAYMENT_METHOD_LABEL[row.code] || row.code}</Text>
                  <Text style={styles.donutLegendPercent}>{percent}%</Text>
                </View>
              )
            })}
          </View>
        </View>
      </View>

      {/* Revenue by Day */}
      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Doanh thu theo ngày</Text>
        <Text style={styles.cardSub}>Trong phạm vi lọc</Text>
        <View style={styles.barList}>
          {overviewData.revenueByDay.length === 0 ? <Text style={{ color: colors.muted, fontSize: 13 }}>Chưa có dữ liệu doanh thu theo ngày.</Text> : null}
          {overviewData.revenueByDay.map(row => (
            <View key={row.key} style={styles.barRow}>
              <View style={styles.barRowHead}>
                <Text style={styles.barRowTitle}>{row.label}</Text>
                <Text style={styles.barRowCount}>{row.orders} đơn</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[
                  styles.barFill, 
                  { 
                    width: `${Math.max(5, (row.amount / overviewData.maxRevenueDay) * 100)}%`,
                    backgroundColor: '#d65a12' 
                  }
                ]} />
              </View>
              <Text style={styles.barRowSub}>{formatCurrency(row.amount)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Top Items */}
      <View style={styles.chartCard}>
        <Text style={styles.cardTitle}>Top món bán chạy</Text>
        <Text style={styles.cardSub}>Xếp theo số lượng bán</Text>
        <View style={styles.topItemsTable}>
          <View style={styles.topItemsHead}>
            <Text style={[styles.topItemsCol, { flex: 2 }]}>Món</Text>
            <Text style={[styles.topItemsCol, { flex: 0.5, textAlign: 'center' }]}>SL</Text>
            <Text style={[styles.topItemsCol, { flex: 1.5, textAlign: 'right' }]}>Doanh thu</Text>
          </View>
          {overviewData.topItems.length === 0 ? <Text style={{ color: colors.muted, fontSize: 13, marginTop: 12 }}>Chưa có dữ liệu món bán chạy.</Text> : null}
          {overviewData.topItems.map(item => (
            <View key={item.ma_san_pham} style={styles.topItemsRow}>
              <Text style={[styles.topItemName, { flex: 2 }]} numberOfLines={1}>{item.ten_san_pham}</Text>
              <Text style={[styles.topItemQty, { flex: 0.5 }]}>{item.so_luong}</Text>
              <Text style={[styles.topItemRev, { flex: 1.5 }]}>{formatCurrency(item.doanh_thu)}</Text>
            </View>
          ))}
        </View>
      </View>

    </ScrollView>
  )
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: 100 },
  headerTitleContainer: { marginBottom: spacing.lg, paddingLeft: 50 },
  pageTitle: { fontSize: 22, fontWeight: '900', color: colors.text, letterSpacing: -0.5 },
  pageSubtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  
  heroCard: { backgroundColor: '#111827', padding: 20, borderRadius: radius.xl, marginBottom: spacing.md },
  heroKicker: { fontSize: 11, color: '#f59e0b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#fff', marginBottom: 12 },
  heroDesc: { fontSize: 13, color: '#9ca3af', lineHeight: 20, marginBottom: 16 },
  heroTagRow: { flexWrap: 'wrap', flexDirection: 'row', gap: 8, marginBottom: 20 },
  heroTag: { backgroundColor: '#1f2937', color: '#e5e7eb', fontSize: 11, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontWeight: '600' },
  heroTagAlert: { backgroundColor: '#78350f', color: '#fcd34d', fontSize: 11, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, fontWeight: '700' },
  heroScorecard: { flexDirection: 'row', backgroundColor: '#1f2937', padding: 16, borderRadius: radius.lg, alignItems: 'center' },
  heroScoreRing: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#f59e0b', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  heroScoreValue: { fontSize: 28, fontWeight: '900', color: '#fff' },
  heroScoreLabel: { fontSize: 10, color: '#9ca3af', fontWeight: '600' },
  heroScoreMeta: { flex: 1, gap: 12 },
  heroScoreMetaItem: { flexDirection: 'row', justifyContent: 'space-between' },
  heroScoreMetaLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  heroScoreMetaValue: { fontSize: 13, color: '#fff', fontWeight: '800' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
  kpiCard: { width: '47%', padding: 16, borderRadius: radius.xl },
  kpiLabel: { fontSize: 11, fontWeight: '700', color: '#374151' },
  kpiValue: { fontSize: 18, fontWeight: '900', marginTop: 8 },
  kpiAmber: { backgroundColor: '#fef3c7', color: '#92400e' },
  kpiBlue: { backgroundColor: '#e0f2fe', color: '#075985' },
  kpiGreen: { backgroundColor: '#dcfce3', color: '#166534' },
  kpiBrown: { backgroundColor: '#ffedd5', color: '#9a3412' },

  metricStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: spacing.md },
  metricCard: { width: '47%', backgroundColor: colors.card, padding: 16, borderRadius: radius.lg, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  metricLabel: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  metricValue: { fontSize: 16, fontWeight: '900', color: colors.text, marginTop: 8 },
  metricSub: { fontSize: 11, color: colors.textSecondary, marginTop: 4 },

  alertGrid: { flexDirection: 'column', gap: spacing.md, marginBottom: spacing.md },
  alertCard: { backgroundColor: colors.card, padding: 16, borderRadius: radius.lg, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: colors.text },
  cardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  alertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b' },
  alertText: { fontSize: 13, color: colors.text, fontWeight: '600' },
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  healthItem: { width: '45%' },
  healthLabel: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  healthValue: { fontSize: 15, fontWeight: '900', color: colors.text, marginTop: 4 },

  chartCard: { backgroundColor: colors.card, padding: 16, borderRadius: radius.lg, marginBottom: spacing.md, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  filterRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.bg },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  filterChipTextActive: { color: colors.card },

  hourlyChart: { flexDirection: 'row', justifyContent: 'space-between', height: 140, marginTop: 16, alignItems: 'flex-end', paddingBottom: 24, paddingTop: 16 },
  hourlyCol: { alignItems: 'center', flex: 1 },
  hourlyValue: { fontSize: 10, fontWeight: '800', color: '#d65a12', marginBottom: 4 },
  hourlyTrack: { width: 16, height: 100, backgroundColor: '#ffedd5', borderRadius: 8, justifyContent: 'flex-end' },
  hourlyFill: { width: '100%', backgroundColor: '#d65a12', borderRadius: 8 },
  hourlyLabel: { fontSize: 9, color: colors.muted, marginTop: 4, position: 'absolute', bottom: -20 },

  barList: { marginTop: 16, gap: 16 },
  barRow: { width: '100%' },
  barRowHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  barRowTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  barRowCount: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },
  barTrack: { height: 8, backgroundColor: colors.borderLight, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  barRowSub: { fontSize: 11, color: colors.muted, marginTop: 4 },

  stockChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  stockChip: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },

  donutMock: { flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 24 },
  donutCenter: { width: 100, height: 100, borderRadius: 50, borderWidth: 8, borderColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  donutTotalCount: { fontSize: 24, fontWeight: '900', color: colors.text },
  donutTotalLabel: { fontSize: 11, color: colors.muted, fontWeight: '700' },
  donutLegend: { flex: 1, gap: 8 },
  donutLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  donutDot: { width: 12, height: 12, borderRadius: 6 },
  donutLegendTitle: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  donutLegendPercent: { fontSize: 13, fontWeight: '800', color: colors.textSecondary },

  topItemsTable: { marginTop: 16 },
  topItemsHead: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.borderLight, paddingBottom: 8, marginBottom: 8 },
  topItemsCol: { fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  topItemsRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderLight, alignItems: 'center' },
  topItemName: { fontSize: 13, fontWeight: '700', color: colors.text },
  topItemQty: { fontSize: 13, fontWeight: '900', color: colors.primary, textAlign: 'center' },
  topItemRev: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, textAlign: 'right' },
})