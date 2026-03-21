import { useEffect, useMemo, useState } from 'react'
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

function statusLabel(ok) {
  return ok ? 'Hoạt động' : 'Lỗi'
}

function MiniTrendChart({ points = [], color = '#2563eb', title = '', valueFormatter = fmtNum }) {
  const W = 330
  const H = 126
  const L = 38
  const R = 10
  const T = 10
  const B = 24

  if (!points.length) {
    return <div style={{ color: '#94a3b8', fontSize: 12 }}>Chưa có dữ liệu {title.toLowerCase()}</div>
  }

  const values = points.map((item) => toNumber(item?.value))
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
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      <rect x="0" y="0" width={W} height={H} rx="10" fill="#f8fafc" />

      {yTicks.map((tick, idx) => (
        <line key={`grid-${idx}`} x1={L} y1={tick.y} x2={W - R} y2={tick.y} stroke="#e2e8f0" strokeWidth="1" />
      ))}

      <path d={areaPath} fill={color} opacity="0.12" />
      <path d={linePath} stroke={color} strokeWidth="2.5" fill="none" />

      {values.map((value, idx) => (
        <circle key={`dot-${idx}`} cx={xScale(idx)} cy={yScale(value)} r="2.2" fill={color} />
      ))}

      {yTicks.map((tick, idx) => (
        <text key={`ylabel-${idx}`} x={L - 5} y={tick.y + 3} textAnchor="end" fontSize="9" fill="#64748b">
          {valueFormatter(tick.value)}
        </text>
      ))}

      {xTicks.map((tick) => (
        <text key={`xlabel-${tick.idx}`} x={xScale(tick.idx)} y={H - 7} textAnchor="middle" fontSize="9" fill="#64748b">
          {tick.label}
        </text>
      ))}

      <text x={W - R} y={12} textAnchor="end" fontSize="9" fill={trendPct >= 0 ? '#166534' : '#b91c1c'}>
        {trendPct >= 0 ? '▲' : '▼'} {Math.abs(trendPct).toFixed(1)}%
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
        { id: 'identity', name: 'Identity stats', ...checks[0] },
        { id: 'menu', name: 'Menu categories', ...checks[1] },
        {
          id: 'order-analytics',
          name: `Order analytics realtime + DB (${Math.max(activeBranchCodes.length, 1)} chi nhánh)`,
          ok: realtimeStatusOk,
          status: realtimeStatusOk ? 200 : 503,
          latency: realtimeLatency,
          payload: mergedPayload,
        },
        { id: 'ai', name: 'AI model stats', ...checks[3] },
      ]

      setEndpoints(endpointRows)
      setRealtime(mergedPayload)

      const now = new Date()
      setLastUpdatedAt(now.toLocaleString('vi-VN'))

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
        warnMessages.push(`Độ trễ cao: ${highLatency.map((row) => `${row.name} ${row.latency}ms`).join(', ')}`)
      }

      const downServices = endpointRows.filter((row) => !row.ok)
      if (downServices.length) {
        warnMessages.push(`Dịch vụ lỗi: ${downServices.map((row) => row.name).join(', ')}`)
      }

      if (Number(mergedPayload.orders_cancelled || 0) >= config.cancelWarnCount) {
        warnMessages.push(`Đơn hủy hôm nay đạt ${mergedPayload.orders_cancelled}, cần kiểm tra nguyên nhân`)
      }

      const eventText = warnMessages.length ? warnMessages.join(' | ') : 'Hệ thống vận hành ổn định'
      setEventLogs((prev) => [{ at: now.toLocaleString('vi-VN'), text: eventText }, ...prev].slice(0, 30))
    } catch (error) {
      const now = new Date().toLocaleString('vi-VN')
      setEventLogs((prev) => [{ at: now, text: `Lỗi theo dõi hệ thống: ${error.message || 'Không xác định'}` }, ...prev].slice(0, 30))
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
    window.alert('Đã lưu cấu hình giám sát hệ thống')
  }

  return (
    <section className="panel system-admin-panel">
      <div className="panel-head system-admin-panel-head">
        <h2>Cấu hình và giám sát hệ thống</h2>
        <span>Theo dõi sức khỏe dịch vụ, độ trễ API và chỉ số vận hành theo thời gian thực</span>
      </div>

      <div className="system-ops-top-grid">
        <div className="system-admin-card">
          <div className="panel-head">
            <h2>Cấu hình cảnh báo</h2>
            <span>Lần cập nhật gần nhất: {lastUpdatedAt || 'Đang chờ dữ liệu'}</span>
          </div>
          <div className="system-admin-form-grid" style={{ marginBottom: '0.7rem' }}>
            <label>
              <span>Tần suất quét (giây)</span>
              <input type="number" min="5" value={config.pollSeconds} onChange={(e) => setConfig((p) => ({ ...p, pollSeconds: Number(e.target.value) || 20 }))} />
            </label>
            <label>
              <span>Ngưỡng độ trễ cảnh báo (ms)</span>
              <input type="number" min="100" value={config.latencyWarnMs} onChange={(e) => setConfig((p) => ({ ...p, latencyWarnMs: Number(e.target.value) || 800 }))} />
            </label>
            <label>
              <span>Ngưỡng số đơn hủy / ngày</span>
              <input type="number" min="1" value={config.cancelWarnCount} onChange={(e) => setConfig((p) => ({ ...p, cancelWarnCount: Number(e.target.value) || 5 }))} />
            </label>
          </div>
          <div className="system-admin-form-actions">
            <button type="button" onClick={saveConfig}>Lưu cấu hình</button>
            <button type="button" className="secondary" onClick={runMonitoring}>Làm mới ngay</button>
          </div>
        </div>

        <div className="system-admin-card">
          <div className="panel-head">
            <h2>Tổng quan theo dõi</h2>
            <span>Dữ liệu thực tế theo chi nhánh đang hoạt động</span>
          </div>
          <div className="system-ops-summary-grid">
            <article>
              <p>Health score</p>
              <strong>{healthScore}%</strong>
              <small>{endpoints.filter((item) => item.ok).length}/{endpoints.length || 0} dịch vụ OK</small>
            </article>
            <article>
              <p>Chi nhánh theo dõi</p>
              <strong>{fmtNum(realtime?.branch_count)}</strong>
              <small>Đang lấy dữ liệu toàn hệ thống</small>
            </article>
            <article>
              <p>Redis analytics</p>
              <strong>{realtime?.redis_enabled ? 'Bật' : 'Tắt'}</strong>
              <small>{realtime?.date_key || '-'}</small>
            </article>
          </div>
        </div>
      </div>

      {!hasRealtimeEvents ? (
        <div className="system-admin-card system-ops-block">
          <p style={{ margin: 0, color: '#7b5b45', fontWeight: 700 }}>
            Chưa có sự kiện đơn hàng mới trong ngày nên các chỉ số realtime đang là 0. Hệ thống vẫn hoạt động bình thường.
          </p>
        </div>
      ) : null}

      <div className="system-admin-insight-grid system-ops-kpi-grid">
        <article>
          <p>Đơn tạo trong ngày</p>
          <strong>{fmtNum(realtime?.orders_created)}</strong>
        </article>
        <article>
          <p>Đơn hoàn thành</p>
          <strong>{fmtNum(realtime?.orders_completed)}</strong>
        </article>
        <article>
          <p>Đơn bị hủy</p>
          <strong>{fmtNum(realtime?.orders_cancelled)}</strong>
        </article>
        <article>
          <p>Doanh thu hoàn thành</p>
          <strong>{fmtMoney(realtime?.revenue_completed)}</strong>
        </article>
        <article>
          <p>Thanh toán thành công</p>
          <strong>{fmtNum(realtime?.payments_succeeded)}</strong>
        </article>
        <article>
          <p>Thông báo đã gửi</p>
          <strong>{fmtNum(realtime?.notifications_created)}</strong>
        </article>
      </div>

      <div className="system-admin-menu-layout system-ops-trend-grid">
        <section className="system-admin-card">
          <div className="panel-head"><h2>Xu hướng đơn hàng</h2><span>20 mốc gần nhất (đơn mới mỗi lần quét)</span></div>
          <MiniTrendChart points={orderTrend} color="#1d4ed8" title="đơn hàng" valueFormatter={fmtNum} />
        </section>
        <section className="system-admin-card">
          <div className="panel-head"><h2>Xu hướng doanh thu</h2><span>20 mốc gần nhất (doanh thu tăng thêm mỗi lần quét)</span></div>
          <MiniTrendChart points={revenueTrend} color="#15803d" title="doanh thu" valueFormatter={fmtCompactMoney} />
        </section>
      </div>

      <div className="system-admin-card system-ops-block">
        <div className="panel-head"><h2>Trạng thái kết nối dịch vụ</h2><span>{loading ? 'Đang cập nhật...' : 'Đã cập nhật'}</span></div>
        <div className="system-admin-table-wrap">
          <table className="system-admin-table">
            <thead>
              <tr>
                <th>Dịch vụ</th>
                <th>Trạng thái</th>
                <th>HTTP</th>
                <th>Độ trễ</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>
                    <span className={`system-ops-status-pill ${item.ok ? 'ok' : 'down'}`}>{statusLabel(item.ok)}</span>
                  </td>
                  <td>{item.status}</td>
                  <td>{item.latency} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="system-admin-card">
        <div className="panel-head"><h2>Nhật ký cảnh báo</h2><span>Tự động cập nhật theo chu kỳ giám sát</span></div>
        <div className="system-admin-table-wrap">
          <table className="system-admin-table">
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Sự kiện</th>
              </tr>
            </thead>
            <tbody>
              {eventLogs.map((log, idx) => (
                <tr key={`${log.at}-${idx}`}>
                  <td>{log.at}</td>
                  <td>{log.text}</td>
                </tr>
              ))}
              {!eventLogs.length ? (
                <tr>
                  <td colSpan={2}>Chưa có cảnh báo nào trong phiên theo dõi hiện tại.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
