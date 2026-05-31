import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Alert,
  Dimensions
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import apiClient from '../lib/apiClient'
import { radius, shadows, spacing } from '../theme'
import { safeArray } from '../lib/adminData'

const TEAL = '#2563eb' // Xanh đậm theo web admin
const CARD_BG = '#fff'
const { width } = Dimensions.get('window')

function fmtNum(v, decimals = 0) {
  return Number(v || 0).toLocaleString('vi-VN', { maximumFractionDigits: decimals })
}
function fmtMoney(v) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v || 0)
}
function fmtDate(iso) {
  if (!iso) return '---'
  try { return new Date(iso).toLocaleString('vi-VN') } catch { return iso }
}

function HorizontalBar({ label, value, max, note }) {
  const pct = max > 0 ? Math.max(6, Math.round((value / max) * 100)) : 0
  return (
    <View style={styles.hBarContainer}>
      <Text style={styles.hBarLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.hBarTrack}>
        <View style={[styles.hBarFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.hBarNote}>{note || fmtNum(value)}</Text>
    </View>
  )
}

export function AdminAnalyticsScreen() {
  const [loading, setLoading] = useState(true)
  
  // Data
  const [stats, setStats] = useState(null)
  const [behavior, setBehavior] = useState(null)
  const [forecast, setForecast] = useState(null)

  // Settings
  const [branchCode, setBranchCode] = useState('ALL')
  const [behaviorDays, setBehaviorDays] = useState(30)
  const [metric, setMetric] = useState('orders')

  // Test Recommend
  const [testUserId, setTestUserId] = useState('')
  const [testingRec, setTestingRec] = useState(false)
  const [recommendations, setRecommendations] = useState([])

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [st, bh, fc] = await Promise.all([
        apiClient.get('/ai/model/stats').catch(() => null),
        apiClient.get(`/ai/behavior/insights?branch_code=${branchCode}&limit=6&days=${behaviorDays}`).catch(() => null),
        apiClient.get(`/ai/forecast/combined?branch_code=${branchCode}&metric=${metric}&history_days=30&forecast_days=14`).catch(() => null)
      ])
      console.log('STATS PAYLOAD:', st)
      console.log('BEHAVIOR PAYLOAD:', bh)
      console.log('FORECAST PAYLOAD:', fc)
      
      let mappedBh = null
      if (bh) {
        const hourMap = new Map((bh.hour_groups || []).map((item) => [String(item?.bucket || '').toUpperCase(), Number(item?.total_orders || 0)]))
        mappedBh = {
          totalOrders: Number(bh.total_orders || 0),
          topProducts: (bh.top_products || []).map((item) => ({
            name: String(item?.product_name || item?.product_id || 'Sản phẩm'),
            qty: Number(item?.total_qty || 0),
          })),
          customerSyncTopProducts: (bh.customer_sync_top_products || []).map((item) => ({
            name: String(item?.product_name || item?.product_id || 'Sản phẩm'),
            qty: Number(item?.total_qty || 0),
            score: Number(item?.sync_score || 0),
          })),
          paymentMix: (bh.payment_mix || []).map((item) => ({
            name: String(item?.payment_method || 'Khác'),
            count: Number(item?.total_orders || 0),
          })),
          timeDistribution: [
            { name: 'Sáng', count: Number(hourMap.get('SANG') || 0) },
            { name: 'Trưa', count: Number(hourMap.get('TRUA') || 0) },
            { name: 'Chiều', count: Number(hourMap.get('CHIEU') || 0) },
            { name: 'Tối', count: Number(hourMap.get('TOI') || 0) },
          ].filter(x => x.count > 0)
        }
      }

      setStats(st)
      setBehavior(mappedBh)
      setForecast(fc)
    } catch (e) {
      console.log('Error loading AI data', e)
    } finally {
      setLoading(false)
    }
  }, [branchCode, behaviorDays, metric])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const runTest = async () => {
    if (!testUserId.trim()) return
    setTestingRec(true)
    try {
      const res = await apiClient.get(`/ai/recommend/${encodeURIComponent(testUserId.trim())}?limit=6`)
      const recs = safeArray(res?.recommendations || res)
      setRecommendations(recs)
      if (recs.length === 0) Alert.alert('Thông báo', 'Không có gợi ý cho ID này')
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể lấy gợi ý AI cho User ID này')
    } finally {
      setTestingRec(false)
    }
  }

  const retrainModel = async (type) => {
    try {
      Alert.alert('Thành công', `Đang gửi yêu cầu cập nhật mô hình ${type === 'recommend' ? 'Gợi ý' : 'Dự báo'}`)
      if (type === 'recommend') await apiClient.post('/ai/recommend/train')
      if (type === 'forecast') await apiClient.post('/ai/forecast/train')
      setTimeout(loadAll, 2000)
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể kết nối đến AI Service')
    }
  }

  const topProductsSummaryRows = useMemo(() => {
    if (!behavior) return []
    const syncRows = behavior.customerSyncTopProducts || []
    if (syncRows.length) return syncRows.slice(0, 5)
    return (behavior.topProducts || []).slice(0, 5).map((item) => ({
      name: item.name,
      score: Number(item.qty || 0)
    }))
  }, [behavior])

  if (loading && !stats) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={TEAL} />
      </View>
    )
  }

  const isAiDown = !stats
  
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={{ height: 60 }} />
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Phân tích mua sắm</Text>
        <Text style={styles.pageSubtitle}>Tách biệt hoàn toàn giao diện để vận hành hệ thống</Text>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        
        {/* Banner */}
        <View style={styles.heroBanner}>
          <Text style={styles.heroTitle}>Gợi ý sản phẩm và Dự báo nhu cầu</Text>
          <Text style={styles.heroDesc}>
            Hệ thống AI tổng hợp hành vi mua hàng để gợi ý sản phẩm phù hợp, đồng thời dự báo số đơn hoặc doanh thu trong các ngày tiếp theo để hỗ trợ vận hành.
          </Text>
          <View style={styles.heroActions}>
            <TouchableOpacity style={styles.heroBtn} onPress={() => retrainModel('recommend')}>
              <Text style={styles.heroBtnText}>Cập nhật mô hình gợi ý</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroBtn} onPress={() => retrainModel('forecast')}>
              <Text style={styles.heroBtnText}>Cập nhật mô hình dự báo</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isAiDown && (
          <View style={styles.errorBox}>
            <Ionicons name="warning" size={24} color="#dc2626" />
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>AI Service đang tạm dừng</Text>
              <Text style={styles.errorDesc}>Không thể lấy thông số từ hệ thống AI.</Text>
            </View>
          </View>
        )}

        {/* Stats Grid */}
        {stats && (
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>MÔ HÌNH GỢI Ý</Text>
              <Text style={[styles.statValue, { color: stats.collaborative_filtering?.is_trained ? '#16a34a' : '#dc2626' }]}>
                {stats.collaborative_filtering?.is_trained ? '● Sẵn sàng' : '● Chưa sẵn sàng'}
              </Text>
              <Text style={styles.statSub}>{fmtNum(stats.collaborative_filtering?.total_users)} khách có lịch sử</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statLabel}>PHẠM VI HỌC GỢI Ý</Text>
              <Text style={styles.statValue}>{fmtNum(stats.collaborative_filtering?.total_items)}</Text>
              <Text style={styles.statSub}>{fmtNum(stats.collaborative_filtering?.total_interactions)} lượt tương tác</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statLabel}>MÔ HÌNH DỰ BÁO</Text>
              <Text style={[styles.statValue, { color: stats.demand_forecasting?.is_trained ? '#16a34a' : '#dc2626' }]}>
                {stats.demand_forecasting?.is_trained ? '● Sẵn sàng' : '● Chưa sẵn sàng'}
              </Text>
              <Text style={styles.statSub}>{stats.demand_forecasting?.engine || 'N/A'}</Text>
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statLabel}>DỮ LIỆU DỰ BÁO</Text>
              <Text style={styles.statValue}>{fmtNum(stats.demand_forecasting?.history_days)}</Text>
              <Text style={styles.statSub}>chi nhánh</Text>
            </View>
          </View>
        )}

        {/* Table Diễn giải hành vi */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bảng diễn giải hành vi mua hàng</Text>
          <Text style={styles.cardDesc}>Bảng này giúp quản trị viên đọc nhanh AI đang nhìn thấy gì từ dữ liệu.</Text>
          <View style={styles.table}>
            <View style={[styles.tr, styles.trHeader]}>
              <Text style={[styles.th, { flex: 2 }]}>Chỉ số</Text>
              <Text style={[styles.th, { flex: 1 }]}>Giá trị</Text>
            </View>
            <View style={styles.tr}>
              <Text style={[styles.tdName, { flex: 2 }]}>Khách đã có lịch sử mua</Text>
              <Text style={[styles.td, { flex: 1, fontWeight: '700' }]}>{fmtNum(stats?.collaborative_filtering?.total_users)}</Text>
            </View>
            <View style={styles.tr}>
              <Text style={[styles.tdName, { flex: 2 }]}>Sản phẩm trong mô hình gợi ý</Text>
              <Text style={[styles.td, { flex: 1, fontWeight: '700' }]}>{fmtNum(stats?.collaborative_filtering?.total_items)}</Text>
            </View>
            <View style={styles.tr}>
              <Text style={[styles.tdName, { flex: 2 }]}>Tổng lượt tương tác mua hàng</Text>
              <Text style={[styles.td, { flex: 1, fontWeight: '700' }]}>{fmtNum(stats?.collaborative_filtering?.total_interactions)}</Text>
            </View>
            <View style={[styles.tr, { borderBottomWidth: 0 }]}>
              <Text style={[styles.tdName, { flex: 2 }]}>Tần suất mua trung bình / khách</Text>
              <Text style={[styles.td, { flex: 1, fontWeight: '700' }]}>
                {stats?.collaborative_filtering?.total_users ? (stats.collaborative_filtering.total_interactions / stats.collaborative_filtering.total_users).toFixed(2) : 0} lượt
              </Text>
            </View>
          </View>
        </View>

        {/* Biểu đồ hành vi mua sắm */}
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Biểu đồ hành vi mua sắm khách hàng</Text>
              <Text style={styles.cardDesc}>Tổng hợp dữ liệu thực từ đơn hàng, đánh giá, yêu thích để đồng bộ với logic gợi ý.</Text>
            </View>
          </View>
          <View style={styles.syncBadge}>
            <Text style={styles.syncText}>Đồng bộ customer</Text>
          </View>

          {behavior && (
            <>
              {/* Top sản phẩm đồng bộ */}
              <View style={[styles.table, { marginTop: 12 }]}>
                <View style={[styles.tr, styles.trHeader]}>
                  <Text style={[styles.th, { width: 30 }]}>#</Text>
                  <Text style={[styles.th, { flex: 1 }]}>Top 5 sản phẩm đồng bộ customer</Text>
                  <Text style={[styles.th, { width: 70, textAlign: 'right' }]}>Điểm</Text>
                </View>
                {topProductsSummaryRows.map((item, idx) => (
                  <View key={idx} style={[styles.tr, idx === topProductsSummaryRows.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={[styles.td, { width: 30, fontWeight: '700' }]}>{idx + 1}</Text>
                    <Text style={[styles.tdName, { flex: 1 }]}>{item.name}</Text>
                    <Text style={[styles.td, { width: 70, textAlign: 'right', color: '#1d4ed8', fontWeight: '700' }]}>{fmtNum(item.score, 2)}</Text>
                  </View>
                ))}
                {topProductsSummaryRows.length === 0 && (
                  <View style={[styles.tr, { borderBottomWidth: 0, justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 13, color: '#64748b', paddingVertical: 8 }}>Chưa có dữ liệu đồng bộ</Text>
                  </View>
                )}
              </View>

              {/* Các Bar Chart */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }} contentContainerStyle={{ paddingRight: 20 }}>
                {behavior.topProducts && behavior.topProducts.length > 0 && (
                  <View style={styles.chartBlock}>
                    <Text style={styles.chartTitle}>Top sản phẩm được mua nhiều</Text>
                    {behavior.topProducts.map(item => (
                      <HorizontalBar key={item.name} label={item.name} value={item.qty} max={behavior.topProducts[0]?.qty || 1} note={`${fmtNum(item.qty)} lượt`} />
                    ))}
                  </View>
                )}

                {behavior.paymentMix && behavior.paymentMix.length > 0 && (
                  <View style={styles.chartBlock}>
                    <Text style={styles.chartTitle}>Tỷ lệ phương thức thanh toán</Text>
                    {behavior.paymentMix.map(item => (
                      <HorizontalBar key={item.name} label={item.name} value={item.count} max={behavior.paymentMix[0]?.count || 1} note={`${fmtNum(item.count)} đơn`} />
                    ))}
                  </View>
                )}

                {behavior.timeDistribution && behavior.timeDistribution.length > 0 && (
                  <View style={styles.chartBlock}>
                    <Text style={styles.chartTitle}>Khung giờ mua sắm nổi bật</Text>
                    {behavior.timeDistribution.map(item => (
                      <HorizontalBar key={item.name} label={item.name} value={item.count} max={behavior.timeDistribution[0]?.count || 1} note={`${fmtNum(item.count)} đơn`} />
                    ))}
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </View>

        {/* Dự báo nhu cầu mua hàng */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dự báo nhu cầu mua hàng</Text>
          <Text style={styles.cardDesc}>Công cụ Holt-Winters (NumPy) - Cập nhật: {fmtDate(new Date())}</Text>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 20 }}>
            {/* Vẽ Vertical Bar chart */}
            {forecast && forecast.forecast && forecast.history && (
              <View style={styles.verticalChartContainer}>
                {/* Lịch sử */}
                {forecast.history.slice(-7).map((p, i) => {
                  const maxVal = Math.max(...forecast.forecast.map(x=>x.yhat_upper), ...forecast.history.map(x=>x.yhat)) || 1
                  const heightPct = Math.min(100, Math.max(0, (p.yhat / maxVal) * 100))
                  return (
                    <View key={`hist-${i}`} style={styles.vBarWrap}>
                      <Text style={styles.vBarVal}>{fmtNum(p.yhat)}</Text>
                      <View style={styles.vBarTrack}>
                        <View style={[styles.vBarFill, { height: `${heightPct}%`, backgroundColor: '#1d4ed8' }]} />
                      </View>
                      <Text style={styles.vBarLabel}>{p.ds.slice(5)}</Text>
                    </View>
                  )
                })}
                
                {/* Divider Hôm nay */}
                <View style={{ width: 1, backgroundColor: '#f59e0b', marginHorizontal: 8, height: 160 }} />

                {/* Dự báo */}
                {forecast.forecast.slice(0, 7).map((p, i) => {
                  const maxVal = Math.max(...forecast.forecast.map(x=>x.yhat_upper), ...forecast.history.map(x=>x.yhat)) || 1
                  const heightPct = Math.min(100, Math.max(0, (p.yhat / maxVal) * 100))
                  return (
                    <View key={`fc-${i}`} style={styles.vBarWrap}>
                      <Text style={[styles.vBarVal, { color: '#3b82f6' }]}>{fmtNum(p.yhat)}</Text>
                      <View style={styles.vBarTrack}>
                        <View style={[styles.vBarFill, { height: `${heightPct}%`, backgroundColor: '#3b82f6' }]} />
                      </View>
                      <Text style={styles.vBarLabel}>{p.ds.slice(5)}</Text>
                    </View>
                  )
                })}
              </View>
            )}
          </ScrollView>

          {forecast && forecast.forecast && (
            <View style={[styles.table, { marginTop: 12 }]}>
              <View style={[styles.tr, styles.trHeader]}>
                <Text style={[styles.th, { flex: 1.5 }]}>Ngày dự báo</Text>
                <Text style={[styles.th, { flex: 1 }]}>Trung bình</Text>
                <Text style={[styles.th, { flex: 1 }]}>Thấp</Text>
                <Text style={[styles.th, { flex: 1 }]}>Cao</Text>
              </View>
              {forecast.forecast.slice(0, 7).map((p, idx) => (
                <View key={idx} style={[styles.tr, idx === 6 && { borderBottomWidth: 0 }]}>
                  <Text style={[styles.tdName, { flex: 1.5, fontSize: 11 }]}>{p.ds}</Text>
                  <Text style={[styles.td, { flex: 1, fontSize: 11 }]}>{fmtNum(p.yhat)}</Text>
                  <Text style={[styles.td, { flex: 1, fontSize: 11, color: '#64748b' }]}>{fmtNum(p.yhat_lower)}</Text>
                  <Text style={[styles.td, { flex: 1, fontSize: 11, color: '#64748b' }]}>{fmtNum(p.yhat_upper)}</Text>
                </View>
              ))}
            </View>
          )}

        </View>

        {/* Recommendation Tester */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Thử nghiệm gợi ý món ăn (AI)</Text>
          <Text style={styles.cardDesc}>Nhập UUID khách hàng thực tế để xem danh sách món AI đề xuất</Text>
          
          <View style={styles.testRow}>
            <TextInput
              style={styles.input}
              placeholder="Nhập User ID..."
              value={testUserId}
              onChangeText={setTestUserId}
            />
            <TouchableOpacity style={styles.runBtn} onPress={runTest} disabled={testingRec || !testUserId.trim()}>
              {testingRec ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.runBtnText}>Thử</Text>}
            </TouchableOpacity>
          </View>

          {recommendations.length > 0 && (
            <View style={styles.recList}>
              {recommendations.map((item, idx) => (
                <View key={idx} style={styles.recItem}>
                  <View style={styles.recImg}>
                    <Text style={{ fontSize: 24 }}>☕</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recName}>{item.name}</Text>
                    <Text style={styles.recPrice}>{fmtMoney(item.price)}</Text>
                    <View style={styles.tagWrap}>
                      <Text style={styles.tagText}>{item.reason}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.scoreLabel}>Score</Text>
                    <Text style={styles.scoreVal}>{Number(item.score || 0).toFixed(2)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
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
  
  heroBanner: {
    backgroundColor: TEAL,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  heroDesc: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 6, marginBottom: 12 },
  heroActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  heroBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  heroBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  
  errorBox: {
    flexDirection: 'row',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 12,
  },
  errorTitle: { fontSize: 14, fontWeight: '700', color: '#991b1b' },
  errorDesc: { fontSize: 13, color: '#991b1b', opacity: 0.8 },
  
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    width: '48%',
    backgroundColor: CARD_BG,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statLabel: { fontSize: 9, color: '#64748b', fontWeight: '800', marginBottom: 6 },
  statValue: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  statSub: { fontSize: 11, color: '#94a3b8', marginTop: 4 },

  card: {
    backgroundColor: CARD_BG,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: spacing.md,
    ...shadows.sm,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  cardDesc: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 12 },
  
  table: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: radius.md, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', padding: 10 },
  trHeader: { backgroundColor: '#f8fafc', paddingVertical: 10 },
  th: { fontSize: 12, fontWeight: '700', color: '#475569' },
  tdName: { fontSize: 13, fontWeight: '600', color: '#0f172a' },
  td: { fontSize: 13, color: '#0f172a' },

  syncBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 12 },
  syncText: { fontSize: 11, color: '#1d4ed8', fontWeight: '700' },

  chartBlock: { width: width * 0.7, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: radius.md, padding: 14, backgroundColor: '#f8fafc', marginRight: 12 },
  chartTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  
  hBarContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  hBarLabel: { width: 90, fontSize: 11, color: '#334155', fontWeight: '600' },
  hBarTrack: { flex: 1, height: 8, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden', marginHorizontal: 8 },
  hBarFill: { height: '100%', backgroundColor: '#38bdf8' },
  hBarNote: { width: 50, fontSize: 11, color: '#0f172a', fontWeight: '700', textAlign: 'right' },

  verticalChartContainer: { flexDirection: 'row', alignItems: 'flex-end', height: 160 },
  vBarWrap: { width: 32, alignItems: 'center', marginHorizontal: 4 },
  vBarVal: { fontSize: 9, color: '#64748b', marginBottom: 4, fontWeight: '700' },
  vBarTrack: { width: 14, height: 100, backgroundColor: '#e2e8f0', borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  vBarFill: { width: '100%', borderRadius: 4 },
  vBarLabel: { fontSize: 9, color: '#94a3b8', marginTop: 4 },

  testRow: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: radius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#f8fafc',
  },
  runBtn: {
    width: 60,
    height: 44,
    backgroundColor: TEAL,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  runBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  
  recList: { gap: 12, marginTop: 16 },
  recItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    padding: 10,
    borderRadius: radius.md,
  },
  recImg: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  recName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  recPrice: { fontSize: 13, color: '#ea580c', fontWeight: '600', marginTop: 2 },
  tagWrap: { alignSelf: 'flex-start', backgroundColor: '#e0f2fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4 },
  tagText: { color: '#0284c7', fontSize: 10, fontWeight: '600' },
  scoreLabel: { fontSize: 10, color: '#94a3b8' },
  scoreVal: { fontSize: 14, fontWeight: '800', color: '#334155' },
})
