import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Brain,
  CheckCircle2,
  Clock,
  Coins,
  CreditCard,
  Database,
  FolderOpen,
  Package,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sliders,
  Store,
  TrendingUp,
  UserCheck,
  XCircle,
  Zap,
} from 'lucide-react'
import { API_BASE_URL } from '../../admin-dashboard/constants'

const CONFIG_KEY = 'avengers-system-ops-config'

const DEFAULT_CONFIG = {
  pollSeconds: 20,
  latencyWarnMs: 800,
  cancelWarnCount: 5,
}

function readSavedConfig() {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY)
    if (!raw) return DEFAULT_CONFIG
    const parsed = JSON.parse(raw)
    return {
      pollSeconds: Number(parsed?.pollSeconds || DEFAULT_CONFIG.pollSeconds),
      latencyWarnMs: Number(parsed?.latencyWarnMs || DEFAULT_CONFIG.latencyWarnMs),
      cancelWarnCount: Number(parsed?.cancelWarnCount || DEFAULT_CONFIG.cancelWarnCount),
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

function fmtNum(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

function fmtMoney(value) {
  return Number(value || 0).toLocaleString('vi-VN') + ' đ'
}

function fmtCompactMoney(value) {
  const amount = Number(value || 0)
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}tr`
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`
  return `${Math.round(amount)}`
}

function MiniTrendChart({ points = [], color = '#2563eb', title = '', valueFormatter = fmtNum }) {
  const W = 480
  const H = 140
  const L = 42
  const R = 15
  const T = 15
  const B = 28

  if (!points.length) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
        Chưa có dữ liệu {title.toLowerCase()}
      </div>
    )
  }

  const values = points.map((item) => Number(item?.value || 0))
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = Math.max(max - min, 1)
  const chartW = W - L - R
  const chartH = H - T - B

  const xScale = (idx) => (values.length === 1 ? L + chartW / 2 : L + (idx / Math.max(values.length - 1, 1)) * chartW)
  const yScale = (value) => T + chartH - ((value - min) / range) * chartH

  const linePath = values
    .map((value, idx) => `${idx === 0 ? 'M' : 'L'} ${xScale(idx)} ${yScale(value)}`)
    .join(' ')

  const areaPath = `${linePath} L ${xScale(values.length - 1)} ${T + chartH} L ${xScale(0)} ${T + chartH} Z`
  const yTicks = Array.from({ length: 4 }, (_, idx) => {
    const value = min + ((3 - idx) / 3) * range
    return { y: yScale(value), value }
  })

  const tickStep = Math.max(1, Math.floor(points.length / 5))
  const xTicks = points
    .map((item, idx) => ({ idx, label: item?.label || '' }))
    .filter((item, idx, arr) => idx % tickStep === 0 || idx === arr.length - 1)

  const first = values[0]
  const last = values[values.length - 1]
  const trendPct = first > 0 ? ((last - first) / first) * 100 : 0

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {yTicks.map((tick, idx) => (
        <line key={`grid-${idx}`} x1={L} y1={tick.y} x2={W - R} y2={tick.y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3,3" />
      ))}

      <path d={areaPath} fill={`url(#grad-${title})`} />
      <path d={linePath} stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />

      {values.map((value, idx) => (
        <circle key={`dot-${idx}`} cx={xScale(idx)} cy={yScale(value)} r="3" fill="#ffffff" stroke={color} strokeWidth="2" />
      ))}

      {yTicks.map((tick, idx) => (
        <text key={`ylabel-${idx}`} x={L - 6} y={tick.y + 3} textAnchor="end" fontSize="9" fontWeight="500" fill="#94a3b8">
          {valueFormatter(tick.value)}
        </text>
      ))}

      {xTicks.map((tick) => (
        <text key={`xlabel-${tick.idx}`} x={xScale(tick.idx)} y={H - 8} textAnchor="middle" fontSize="9" fontWeight="500" fill="#94a3b8">
          {tick.label}
        </text>
      ))}

      <text x={W - R} y={T + 2} textAnchor="end" fontSize="10" fontWeight="700" fill={trendPct >= 0 ? '#16a34a' : '#dc2626'}>
        {trendPct >= 0 ? '▲ +' : '▼ '} {Math.abs(trendPct).toFixed(1)}%
      </text>
    </svg>
  )
}

function buildAuthHeaders(session) {
  const token = session?.token || session?.accessToken || session?.access_token || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function timedFetch(path, session) {
  const started = performance.now()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: buildAuthHeaders(session),
  })
  const latency = Math.round(performance.now() - started)
  const payload = await response.json().catch(() => ({}))
  return {
    ok: response.ok,
    status: response.status,
    latency,
    payload,
  }
}

function toNumber(value) {
  return Number(value || 0)
}

function getVnDateKey(input = new Date()) {
  const source = new Date(input)
  const vn = new Date(source.getTime() + 7 * 60 * 60 * 1000)
  const y = vn.getUTCFullYear()
  const m = String(vn.getUTCMonth() + 1).padStart(2, '0')
  const d = String(vn.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function buildEmptyRealtimeSummary() {
  return {
    branch_code: 'ALL_ACTIVE',
    date_key: new Date().toISOString().slice(0, 10),
    orders_created: 0,
    orders_completed: 0,
    orders_cancelled: 0,
    revenue_gross: 0,
    revenue_completed: 0,
    payments_succeeded: 0,
    notifications_created: 0,
    redis_enabled: false,
    branch_count: 0,
  }
}

function aggregateRealtimePayload(payloads, branchCount) {
  const total = payloads.reduce((acc, item) => {
    const payload = item?.payload || {}
    acc.orders_created += toNumber(payload.orders_created)
    acc.orders_completed += toNumber(payload.orders_completed)
    acc.orders_cancelled += toNumber(payload.orders_cancelled)
    acc.revenue_gross += toNumber(payload.revenue_gross)
    acc.revenue_completed += toNumber(payload.revenue_completed)
    acc.payments_succeeded += toNumber(payload.payments_succeeded)
    acc.notifications_created += toNumber(payload.notifications_created)
    acc.redis_enabled = acc.redis_enabled || Boolean(payload.redis_enabled)
    if (payload.date_key) acc.date_key = payload.date_key
    return acc
  }, buildEmptyRealtimeSummary())

  total.branch_count = branchCount
  return total
}

function aggregateTodayOrdersPayload(payloads, branchCount) {
  const todayKey = getVnDateKey()
  const total = buildEmptyRealtimeSummary()
  total.date_key = todayKey
  total.branch_count = branchCount

  payloads.forEach((entry) => {
    const orders = entry?.payload?.orders || []
    orders.forEach((order) => {
      const createdDateKey = getVnDateKey(order?.ngay_tao || order?.created_at || new Date())
      if (createdDateKey !== todayKey) return

      const orderAmount = toNumber(order?.tong_tien)
      const orderStatus = String(order?.trang_thai_don_hang || '').toUpperCase()
      const paymentStatus = String(order?.trang_thai_thanh_toan || '').toUpperCase()

      total.orders_created += 1
      total.revenue_gross += orderAmount

      if (orderStatus === 'HOAN_THANH') {
        total.orders_completed += 1
        total.revenue_completed += orderAmount
      }

      if (orderStatus === 'DA_HUY') {
        total.orders_cancelled += 1
      }

      if (paymentStatus === 'DA_THANH_TOAN') {
        total.payments_succeeded += 1
      }
    })
  })

  return total
}

function mergeRealtimeAndSnapshot(realtimeSummary, snapshotSummary) {
  return {
    ...realtimeSummary,
    date_key: snapshotSummary?.date_key || realtimeSummary?.date_key,
    branch_count: Math.max(toNumber(realtimeSummary?.branch_count), toNumber(snapshotSummary?.branch_count)),
    orders_created: Math.max(toNumber(realtimeSummary?.orders_created), toNumber(snapshotSummary?.orders_created)),
    orders_completed: Math.max(toNumber(realtimeSummary?.orders_completed), toNumber(snapshotSummary?.orders_completed)),
    orders_cancelled: Math.max(toNumber(realtimeSummary?.orders_cancelled), toNumber(snapshotSummary?.orders_cancelled)),
    revenue_gross: Math.max(toNumber(realtimeSummary?.revenue_gross), toNumber(snapshotSummary?.revenue_gross)),
    revenue_completed: Math.max(toNumber(realtimeSummary?.revenue_completed), toNumber(snapshotSummary?.revenue_completed)),
    payments_succeeded: Math.max(toNumber(realtimeSummary?.payments_succeeded), toNumber(snapshotSummary?.payments_succeeded)),
  }
}

export function SystemOpsPanel({ session }) {
  const [config, setConfig] = useState(readSavedConfig)
  const [loading, setLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [endpoints, setEndpoints] = useState([])
  const [realtime, setRealtime] = useState(buildEmptyRealtimeSummary())
  const [history, setHistory] = useState([])
  const [eventLogs, setEventLogs] = useState([])

  const runMonitoring = async () => {
    setLoading(true)
    try {
      const checks = await Promise.all([
        timedFetch('/users/admin/stats', session),
        timedFetch('/menu/categories', session),
        timedFetch('/users/admin/branches', session),
        timedFetch('/ai/model/stats', session),
      ])

      const branchRows = checks[2]?.payload?.items || []
      const activeBranchCodes = branchRows
        .filter((item) => String(item?.trang_thai || '').toUpperCase() === 'ACTIVE')
        .map((item) => String(item?.ma_chi_nhanh || '').trim())
        .filter(Boolean)

      const realtimeChecks = await Promise.all(
        (activeBranchCodes.length ? activeBranchCodes : ['MAC_DINH_CHI']).map((branchCode) =>
          timedFetch(`/staff/analytics/realtime?branch_code=${encodeURIComponent(branchCode)}`, session),
        ),
      )

      const orderSnapshotChecks = await Promise.all(
        (activeBranchCodes.length ? activeBranchCodes : ['MAC_DINH_CHI']).map((branchCode) =>
          timedFetch(`/staff/orders?branch_code=${encodeURIComponent(branchCode)}`, session),
        ),
      )

      const realtimePayload = aggregateRealtimePayload(realtimeChecks, activeBranchCodes.length)
      const orderSnapshotPayload = aggregateTodayOrdersPayload(orderSnapshotChecks, activeBranchCodes.length)
      const mergedPayload = mergeRealtimeAndSnapshot(realtimePayload, orderSnapshotPayload)

      const realtimeLatency = realtimeChecks.length
        ? Math.round(realtimeChecks.reduce((sum, item) => sum + toNumber(item.latency), 0) / realtimeChecks.length)
        : 0
      const realtimeStatusOk = realtimeChecks.length ? realtimeChecks.every((item) => item.ok) : false

      const endpointRows = [
        { id: 'identity', name: 'Identity Service', icon: UserCheck, ...checks[0] },
        { id: 'menu', name: 'Menu & Category API', icon: FolderOpen, ...checks[1] },
        {
          id: 'order-analytics',
          name: `Order Analytics Realtime (${Math.max(activeBranchCodes.length, 1)} chi nhánh)`,
          icon: BarChart3,
          ok: realtimeStatusOk,
          status: realtimeStatusOk ? 200 : 503,
          latency: realtimeLatency,
          payload: mergedPayload,
        },
        { id: 'ai', name: 'AI Prediction Service', icon: Brain, ...checks[3] },
      ]

      setEndpoints(endpointRows)
      setRealtime(mergedPayload)

      const now = new Date()
      setLastUpdatedAt(now.toLocaleTimeString('vi-VN'))

      setHistory((prev) => {
        const prevLast = prev[prev.length - 1]
        const currentOrders = Number(mergedPayload.orders_created || 0)
        const currentRevenue = Number(mergedPayload.revenue_completed || 0)
        const prevOrders = Number(prevLast?.ordersCreated || 0)
        const prevRevenue = Number(prevLast?.revenueCompleted || 0)

        const deltaOrders = currentOrders >= prevOrders ? currentOrders - prevOrders : currentOrders
        const deltaRevenue = currentRevenue >= prevRevenue ? currentRevenue - prevRevenue : currentRevenue

        const next = [
          ...prev,
          {
            time: now.toLocaleTimeString('vi-VN'),
            ordersCreated: currentOrders,
            revenueCompleted: currentRevenue,
            deltaOrders,
            deltaRevenue,
          },
        ]
        return next.slice(-20)
      })

      const highLatency = endpointRows.filter((row) => row.latency > config.latencyWarnMs)
      const warnMessages = []
      if (highLatency.length) {
        warnMessages.push(`Độ trễ cao: ${highLatency.map((row) => `${row.name} (${row.latency}ms)`).join(', ')}`)
      }

      const downServices = endpointRows.filter((row) => !row.ok)
      if (downServices.length) {
        warnMessages.push(`Dịch vụ gián đoạn: ${downServices.map((row) => row.name).join(', ')}`)
      }

      if (Number(mergedPayload.orders_cancelled || 0) >= config.cancelWarnCount) {
        warnMessages.push(`Số đơn hủy hôm nay đạt ${mergedPayload.orders_cancelled} đơn, đạt ngưỡng cảnh báo`)
      }

      const eventText = warnMessages.length ? warnMessages.join(' | ') : 'Tất cả dịch vụ hệ thống hoạt động ổn định'
      const eventType = warnMessages.length ? (downServices.length ? 'ERROR' : 'WARN') : 'INFO'
      setEventLogs((prev) => [{ at: now.toLocaleString('vi-VN'), text: eventText, type: eventType }, ...prev].slice(0, 30))
    } catch (error) {
      const now = new Date().toLocaleString('vi-VN')
      setEventLogs((prev) => [{ at: now, text: `Lỗi kiểm tra hệ thống: ${error.message || 'Không thể phản hồi'}`, type: 'ERROR' }, ...prev].slice(0, 30))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runMonitoring()
    const intervalMs = Math.max(5, Number(config.pollSeconds || 20)) * 1000
    const timer = window.setInterval(runMonitoring, intervalMs)
    return () => window.clearInterval(timer)
  }, [config.pollSeconds, config.latencyWarnMs, config.cancelWarnCount])

  const healthScore = useMemo(() => {
    if (!endpoints.length) return 0
    const ok = endpoints.filter((item) => item.ok).length
    return Math.round((ok / endpoints.length) * 100)
  }, [endpoints])

  const orderTrend = useMemo(
    () => history.map((item) => ({ label: String(item.time || '').slice(0, 5), value: item.deltaOrders || 0 })),
    [history],
  )
  const revenueTrend = useMemo(
    () => history.map((item) => ({ label: String(item.time || '').slice(0, 5), value: item.deltaRevenue || 0 })),
    [history],
  )
  const hasRealtimeEvents = useMemo(
    () =>
      Number(realtime?.orders_created || 0) > 0 ||
      Number(realtime?.orders_completed || 0) > 0 ||
      Number(realtime?.orders_cancelled || 0) > 0 ||
      Number(realtime?.revenue_completed || 0) > 0 ||
      Number(realtime?.payments_succeeded || 0) > 0,
    [realtime],
  )

  const saveConfig = () => {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    window.alert('Đã lưu cấu hình giám sát hệ thống thành công!')
  }

  return (
    <div style={{ padding: '1.5rem', backgroundColor: '#f8fafc', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '0.875rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
              Giám sát &amp; Vận hành Hệ thống
            </h1>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: healthScore === 100 ? '#dcfce7' : healthScore >= 75 ? '#fef3c7' : '#fee2e2', color: healthScore === 100 ? '#15803d' : healthScore >= 75 ? '#b45309' : '#b91c1c' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: healthScore === 100 ? '#22c55e' : healthScore >= 75 ? '#f59e0b' : '#ef4444' }} />
              {healthScore === 100 ? 'Hệ thống tối ưu' : `Sức khỏe ${healthScore}%`}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
            Theo dõi thời gian thực độ trễ API, trạng thái dịch vụ và chỉ số vận hành trên các chi nhánh
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.78125rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Clock size={14} color="#94a3b8" />
            <span>Cập nhật: <strong>{lastUpdatedAt || 'Đang tải...'}</strong></span>
          </div>
          <button
            type="button"
            onClick={runMonitoring}
            disabled={loading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff', color: '#1e293b', fontWeight: '600', fontSize: '0.8125rem',
              cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              opacity: loading ? 0.7 : 1, transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
            {loading ? 'Đang làm mới...' : 'Làm mới ngay'}
          </button>
        </div>
      </div>

      {/* Top 2 Columns: Config & Health Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        
        {/* Config Card */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '0.875rem', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
              <Sliders size={18} color="#2563eb" />
              <h2 style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Cấu hình cảnh báo hệ thống
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.875rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569' }}>Tần suất quét (s)</label>
                <input
                  type="number"
                  min="5"
                  value={config.pollSeconds}
                  onChange={(e) => setConfig((p) => ({ ...p, pollSeconds: Number(e.target.value) || 20 }))}
                  style={{ padding: '0.45rem 0.65rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', fontSize: '0.8125rem', fontWeight: '600', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569' }}>Ngưỡng độ trễ (ms)</label>
                <input
                  type="number"
                  min="100"
                  value={config.latencyWarnMs}
                  onChange={(e) => setConfig((p) => ({ ...p, latencyWarnMs: Number(e.target.value) || 800 }))}
                  style={{ padding: '0.45rem 0.65rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', fontSize: '0.8125rem', fontWeight: '600', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569' }}>Ngưỡng đơn hủy/ngày</label>
                <input
                  type="number"
                  min="1"
                  value={config.cancelWarnCount}
                  onChange={(e) => setConfig((p) => ({ ...p, cancelWarnCount: Number(e.target.value) || 5 }))}
                  style={{ padding: '0.45rem 0.65rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', fontSize: '0.8125rem', fontWeight: '600', outline: 'none' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end', paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
            <button
              type="button"
              onClick={saveConfig}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.45rem 1rem', borderRadius: '0.5rem', backgroundColor: '#2563eb', color: '#ffffff', border: 'none', fontWeight: '600', fontSize: '0.8125rem', cursor: 'pointer', boxShadow: '0 1px 2px rgba(37, 99, 235, 0.2)' }}
            >
              <Save size={14} /> Lưu cấu hình
            </button>
          </div>
        </div>

        {/* Health Score Overview */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: '0.875rem', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={18} color="#059669" />
              <h2 style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Tổng quan sức khỏe dịch vụ
              </h2>
            </div>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Chi nhánh đang chạy</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', textAlign: 'center' }}>
            <div style={{ padding: '0.75rem 0.5rem', borderRadius: '0.625rem', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 0.25rem', fontWeight: '600' }}>Health Score</p>
              <strong style={{ fontSize: '1.5rem', fontWeight: '800', color: healthScore === 100 ? '#16a34a' : healthScore >= 75 ? '#d97706' : '#dc2626' }}>
                {healthScore}%
              </strong>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>
                {endpoints.filter((i) => i.ok).length}/{endpoints.length} dịch vụ OK
              </p>
            </div>

            <div style={{ padding: '0.75rem 0.5rem', borderRadius: '0.625rem', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 0.25rem', fontWeight: '600' }}>Chi nhánh theo dõi</p>
              <strong style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>
                {fmtNum(realtime?.branch_count)}
              </strong>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>Toàn hệ thống</p>
            </div>

            <div style={{ padding: '0.75rem 0.5rem', borderRadius: '0.625rem', backgroundColor: '#f8fafc', border: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 0.25rem', fontWeight: '600' }}>Bộ nhớ Analytics</p>
              <strong style={{ fontSize: '1.125rem', fontWeight: '700', color: realtime?.redis_enabled ? '#0284c7' : '#64748b', display: 'block', marginTop: '0.2rem' }}>
                {realtime?.redis_enabled ? 'Redis Cache' : 'DB Direct'}
              </strong>
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>{realtime?.date_key || '-'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        
        <div style={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '1rem 1.125rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Đơn mới trong ngày</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.375rem', fontWeight: '800', color: '#0f172a' }}>
            {fmtNum(realtime?.orders_created)}
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '1rem 1.125rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Đơn hoàn thành</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.375rem', fontWeight: '800', color: '#16a34a' }}>
            {fmtNum(realtime?.orders_completed)}
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '1rem 1.125rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Đơn bị hủy</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <XCircle size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.375rem', fontWeight: '800', color: realtime?.orders_cancelled >= config.cancelWarnCount ? '#dc2626' : '#0f172a' }}>
            {fmtNum(realtime?.orders_cancelled)}
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '1rem 1.125rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Doanh thu hoàn thành</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#fffbe8', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Coins size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#d97706', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {fmtMoney(realtime?.revenue_completed)}
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '1rem 1.125rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Thanh toán thành công</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#f0f9ff', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CreditCard size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.375rem', fontWeight: '800', color: '#0f172a' }}>
            {fmtNum(realtime?.payments_succeeded)}
          </div>
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', padding: '1rem 1.125rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Thông báo đã gửi</span>
            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#faf5ff', color: '#9333ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.375rem', fontWeight: '800', color: '#0f172a' }}>
            {fmtNum(realtime?.notifications_created)}
          </div>
        </div>

      </div>

      {/* Realtime Trends Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        
        <div style={{ backgroundColor: '#ffffff', borderRadius: '0.875rem', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Xu hướng đơn hàng mới
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.15rem 0 0' }}>20 mốc gần nhất theo chu kỳ quét</p>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#2563eb', backgroundColor: '#eff6ff', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              Đơn hàng
            </span>
          </div>
          <MiniTrendChart points={orderTrend} color="#2563eb" title="đơn hàng" valueFormatter={fmtNum} />
        </div>

        <div style={{ backgroundColor: '#ffffff', borderRadius: '0.875rem', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Xu hướng doanh thu
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.15rem 0 0' }}>20 mốc gần nhất (doanh thu tăng thêm)</p>
            </div>
            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#16a34a', backgroundColor: '#f0fdf4', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              Doanh thu
            </span>
          </div>
          <MiniTrendChart points={revenueTrend} color="#16a34a" title="doanh thu" valueFormatter={fmtCompactMoney} />
        </div>

      </div>

      {/* Service Endpoints Status Table */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '0.875rem', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Trạng thái kết nối dịch vụ API
            </h2>
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.15rem 0 0' }}>Kiểm tra độ trễ và phản hồi của từng Microservice</p>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
            {endpoints.filter((i) => i.ok).length}/{endpoints.length} Hoạt động
          </span>
        </div>

        <div style={{ width: '100%', overflowX: 'hidden', borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff' }}>
          <table style={{ width: '100%', minWidth: 0, tableLayout: 'fixed', borderCollapse: 'collapse', margin: 0 }}>
            <thead>
              <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ width: '42%', textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tên Dịch vụ</th>
                <th style={{ width: '23%', textAlign: 'left', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Trạng thái</th>
                <th style={{ width: '15%', textAlign: 'center', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mã HTTP</th>
                <th style={{ width: '20%', textAlign: 'right', padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Độ trễ (Latency)</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((item) => {
                const IconComp = item.icon || Server
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ textAlign: 'left', padding: '0.75rem 1rem', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', overflow: 'hidden' }}>
                        <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: '#f1f5f9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <IconComp size={15} />
                        </div>
                        <strong style={{ fontSize: '0.84375rem', color: '#0f172a', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.name}>
                          {item.name}
                        </strong>
                      </div>
                    </td>
                    <td style={{ textAlign: 'left', padding: '0.75rem 1rem', verticalAlign: 'middle' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                        padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600',
                        backgroundColor: item.ok ? '#dcfce7' : '#fee2e2',
                        color: item.ok ? '#15803d' : '#b91c1c', whiteSpace: 'nowrap'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.ok ? '#22c55e' : '#ef4444' }} />
                        {item.ok ? 'Sẵn sàng' : 'Gián đoạn'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '0.75rem 1rem', verticalAlign: 'middle' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', fontWeight: '700', color: item.status === 200 ? '#16a34a' : '#dc2626' }}>
                        {item.status || '503'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.75rem 1rem', verticalAlign: 'middle' }}>
                      <span style={{
                        fontSize: '0.8125rem', fontWeight: '700', whiteSpace: 'nowrap',
                        color: item.latency < 500 ? '#16a34a' : item.latency < 1000 ? '#d97706' : '#dc2626'
                      }}>
                        {item.latency} ms
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Event Logs */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '0.875rem', border: '1px solid #e2e8f0', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
          <div>
            <h2 style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Nhật ký sự kiện &amp; Cảnh báo
            </h2>
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.15rem 0 0' }}>Tự động ghi nhận trong các chu kỳ quét hệ thống</p>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{eventLogs.length} sự kiện</span>
        </div>

        <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {eventLogs.map((log, idx) => {
            const isError = log.type === 'ERROR'
            const isWarn = log.type === 'WARN'
            return (
              <div
                key={`${log.at}-${idx}`}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.625rem 0.875rem',
                  borderRadius: '0.5rem', fontSize: '0.8125rem',
                  backgroundColor: isError ? '#fef2f2' : isWarn ? '#fffbe8' : '#f8fafc',
                  border: `1px solid ${isError ? '#fecaca' : isWarn ? '#fef08a' : '#f1f5f9'}`
                }}
              >
                <div style={{ flexShrink: 0, marginTop: '0.1rem' }}>
                  {isError ? <XCircle size={14} color="#dc2626" /> : isWarn ? <AlertTriangle size={14} color="#d97706" /> : <CheckCircle2 size={14} color="#16a34a" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.15rem' }}>
                    <span style={{ fontWeight: '600', color: isError ? '#991b1b' : isWarn ? '#854d0e' : '#1e293b' }}>
                      {log.text}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', flexShrink: 0 }}>{log.at}</span>
                  </div>
                </div>
              </div>
            )
          })}

          {!eventLogs.length ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', margin: '1.5rem 0' }}>
              Chưa có nhật ký cảnh báo nào trong phiên làm việc này.
            </p>
          ) : null}
        </div>
      </div>

    </div>
  )
}
