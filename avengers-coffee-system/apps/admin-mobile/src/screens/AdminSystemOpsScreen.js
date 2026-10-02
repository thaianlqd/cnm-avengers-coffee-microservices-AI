import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import apiClient from '../lib/apiClient'
import { radius, shadows, spacing } from '../theme'

const TEAL = '#0ea5e9'
const CARD_BG = '#fff'

function fmtNum(v) {
  return Number(v || 0).toLocaleString('vi-VN')
}

async function timedFetch(path) {
  const start = Date.now()
  let ok = false
  let status = 500
  let payload = {}
  try {
    const res = await apiClient.get(path)
    ok = true
    status = 200
    payload = res
  } catch (e) {
    ok = false
    status = e.response?.status || 503
  }
  const latency = Date.now() - start
  return { ok, status, latency, payload }
}

export function AdminSystemOpsScreen() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [endpoints, setEndpoints] = useState([])
  
  // Settings
  const [pollSeconds, setPollSeconds] = useState(20)

  const runMonitoring = useCallback(async () => {
    try {
      const checks = await Promise.all([
        timedFetch('/users/admin/stats'),
        timedFetch('/menu/categories'),
        timedFetch('/users/admin/branches'),
        timedFetch('/ai/model/stats'),
        timedFetch('/staff/analytics/realtime?branch_code=MAC_DINH_CHI')
      ])

      const endpointRows = [
        { id: 'identity', name: 'Identity stats', ...checks[0] },
        { id: 'menu', name: 'Menu categories', ...checks[1] },
        { id: 'branch', name: 'Branch data', ...checks[2] },
        { id: 'ai', name: 'AI model stats', ...checks[3] },
        { id: 'realtime', name: 'Order realtime', ...checks[4] },
      ]

      setEndpoints(endpointRows)
      const now = new Date()
      setLastUpdatedAt(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} ${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`)
    } catch (e) {
      console.log('Error monitoring', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    runMonitoring()
    const timer = setInterval(() => {
      runMonitoring()
    }, pollSeconds * 1000)
    return () => clearInterval(timer)
  }, [runMonitoring, pollSeconds])

  const onRefresh = () => {
    setRefreshing(true)
    runMonitoring()
  }

  const healthScore = useMemo(() => {
    if (!endpoints.length) return 0
    const ok = endpoints.filter((item) => item.ok).length
    return Math.round((ok / endpoints.length) * 100)
  }, [endpoints])

  // Extract realtime totals
  const realtime = useMemo(() => {
    const p = endpoints.find(e => e.id === 'realtime')?.payload || {}
    return {
      orders_created: Number(p.orders_created || 0),
      orders_completed: Number(p.orders_completed || 0),
      orders_cancelled: Number(p.orders_cancelled || 0),
      revenue: Number(p.revenue_completed || 0),
    }
  }, [endpoints])

  if (loading && !endpoints.length) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    )
  }

  return (
    <ScrollView 
      style={styles.screen} 
      contentContainerStyle={{ paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ height: 60 }} />
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Giám sát hệ thống</Text>
        <Text style={styles.pageSubtitle}>Theo dõi sức khỏe dịch vụ, API</Text>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>

        {/* Cấu hình & Tổng quan */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Tổng quan theo dõi</Text>
              <Text style={styles.cardSub}>Lần cập nhật gần nhất: {lastUpdatedAt || '...'}</Text>
            </View>
            <TouchableOpacity onPress={onRefresh}>
              <Ionicons name="refresh-circle" size={28} color={TEAL} />
            </TouchableOpacity>
          </View>

          <View style={styles.overviewGrid}>
            <View style={styles.overviewBox}>
              <Text style={styles.boxLabel}>Health score</Text>
              <Text style={[styles.boxValue, { color: healthScore === 100 ? '#16a34a' : '#ea580c' }]}>{healthScore}%</Text>
              <Text style={styles.boxSub}>{endpoints.filter(e => e.ok).length}/{endpoints.length} dịch vụ OK</Text>
            </View>

            <View style={styles.overviewBox}>
              <Text style={styles.boxLabel}>Đơn tạo</Text>
              <Text style={styles.boxValue}>{fmtNum(realtime.orders_created)}</Text>
              <Text style={styles.boxSub}>Hôm nay</Text>
            </View>

            <View style={styles.overviewBox}>
              <Text style={styles.boxLabel}>Đơn hủy</Text>
              <Text style={[styles.boxValue, { color: realtime.orders_cancelled > 0 ? '#dc2626' : '#0f172a' }]}>{fmtNum(realtime.orders_cancelled)}</Text>
              <Text style={styles.boxSub}>Hôm nay</Text>
            </View>
          </View>
        </View>

        {/* Trạng thái kết nối dịch vụ */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Trạng thái kết nối API</Text>
          <Text style={styles.cardSub}>Ping trực tiếp từ client đến gateway</Text>
          
          <View style={styles.table}>
            <View style={[styles.tr, styles.trHeader]}>
              <Text style={[styles.th, { flex: 2 }]}>Dịch vụ</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>HTTP</Text>
              <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Độ trễ</Text>
            </View>
            {endpoints.map((e, idx) => (
              <View key={e.id} style={[styles.tr, idx === endpoints.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 2 }}>
                  <Text style={styles.tdName}>{e.name}</Text>
                  <View style={[styles.statusPill, { backgroundColor: e.ok ? '#dcfce7' : '#fee2e2' }]}>
                    <Text style={[styles.statusText, { color: e.ok ? '#166534' : '#991b1b' }]}>
                      {e.ok ? 'Hoạt động' : 'Lỗi'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.td, { flex: 1, textAlign: 'center', fontWeight: '700', color: e.ok ? '#0f172a' : '#dc2626' }]}>
                  {e.status}
                </Text>
                <Text style={[styles.td, { flex: 1, textAlign: 'right', color: e.latency > 800 ? '#ea580c' : '#64748b' }]}>
                  {e.latency}ms
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Nhật ký */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nhật ký sự kiện</Text>
          <Text style={styles.cardSub}>Cảnh báo từ quá trình quét</Text>
          <View style={styles.logBox}>
            {endpoints.filter(e => !e.ok).length > 0 ? (
              <Text style={{ color: '#dc2626', fontSize: 13, lineHeight: 20 }}>
                ⚠️ Cảnh báo: Có {endpoints.filter(e => !e.ok).length} dịch vụ đang bị lỗi kết nối hoặc phản hồi mã lỗi 500. Vui lòng kiểm tra container docker backend!
              </Text>
            ) : endpoints.filter(e => e.latency > 800).length > 0 ? (
              <Text style={{ color: '#ea580c', fontSize: 13, lineHeight: 20 }}>
                ⚠️ Cảnh báo: Có {endpoints.filter(e => e.latency > 800).length} dịch vụ phản hồi chậm ({'>'}800ms).
              </Text>
            ) : (
              <Text style={{ color: '#16a34a', fontSize: 13 }}>
                Hệ thống đang vận hành ổn định.
              </Text>
            )}
          </View>
        </View>

      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  loadingScreen: { flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    paddingHorizontal: spacing.lg,
    paddingLeft: 68,
    marginBottom: spacing.md,
  },
  pageTitle: { fontSize: 24, fontWeight: '800', color: '#0f172a' },
  pageSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  
  card: {
    backgroundColor: CARD_BG,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...shadows.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  cardSub: { fontSize: 12, color: '#64748b', marginTop: 2, marginBottom: 12 },
  
  overviewGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  overviewBox: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#f8fafc',
    borderRadius: radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  boxLabel: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  boxValue: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginVertical: 4 },
  boxSub: { fontSize: 10, color: '#94a3b8' },

  table: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: radius.md, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', padding: 12 },
  trHeader: { backgroundColor: '#f8fafc', paddingVertical: 10 },
  th: { fontSize: 12, fontWeight: '700', color: '#475569' },
  tdName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  td: { fontSize: 13, color: '#0f172a' },
  
  statusPill: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  statusText: { fontSize: 10, fontWeight: '700' },

  logBox: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  }
})
