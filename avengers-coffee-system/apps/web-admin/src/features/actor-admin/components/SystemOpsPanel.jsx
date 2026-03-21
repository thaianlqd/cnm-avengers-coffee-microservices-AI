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

function statusLabel(ok) {
  return ok ? 'On' : 'Off'
}

function MiniTrendChart({ points = [], color = '#2563eb', title = '' }) {
  const W = 320
  const H = 96
  const P = 12

  if (!points.length) {
    return <div style={{ color: '#94a3b8', fontSize: 12 }}>Chua co du lieu {title.toLowerCase()}</div>
  }

  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = Math.max(max - min, 1)

  const path = points
    .map((value, idx) => {
      const x = P + (idx / Math.max(points.length - 1, 1)) * (W - P * 2)
      const y = H - P - ((value - min) / range) * (H - P * 2)
      return `${idx === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      <rect x="0" y="0" width={W} height={H} rx="10" fill="#f8fafc" />
      <path d={path} stroke={color} strokeWidth="2.5" fill="none" />
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

export function SystemOpsPanel({ session }) {
  const [config, setConfig] = useState(readSavedConfig)
  const [loading, setLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState('')
  const [endpoints, setEndpoints] = useState([])
  const [realtime, setRealtime] = useState(null)
  const [history, setHistory] = useState([])
  const [eventLogs, setEventLogs] = useState([])

  const runMonitoring = async () => {
    setLoading(true)
    try {
      const checks = await Promise.all([
        timedFetch('/users/admin/stats', session),
        timedFetch('/menu/categories', session),
        timedFetch('/staff/analytics/realtime?branch_code=MAC_DINH_CHI', session),
        timedFetch('/ai/model/stats', session),
      ])

      const endpointRows = [
        { id: 'identity', name: 'Identity stats', ...checks[0] },
        { id: 'menu', name: 'Menu categories', ...checks[1] },
        { id: 'order-analytics', name: 'Order realtime analytics', ...checks[2] },
        { id: 'ai', name: 'AI model stats', ...checks[3] },
      ]

      setEndpoints(endpointRows)

      const realtimePayload = checks[2]?.payload || {}
      setRealtime(realtimePayload)

      const now = new Date()
      setLastUpdatedAt(now.toLocaleString('vi-VN'))

      setHistory((prev) => {
        const next = [
          ...prev,
          {
            time: now.toLocaleTimeString('vi-VN'),
            ordersCreated: Number(realtimePayload.orders_created || 0),
            revenueCompleted: Number(realtimePayload.revenue_completed || 0),
          },
        ]
        return next.slice(-20)
      })

      const highLatency = endpointRows.filter((row) => row.latency > config.latencyWarnMs)
      const warnMessages = []
      if (highLatency.length) {
        warnMessages.push(`Do tre cao: ${highLatency.map((row) => `${row.name} ${row.latency}ms`).join(', ')}`)
      }

      if (Number(realtimePayload.orders_cancelled || 0) >= config.cancelWarnCount) {
        warnMessages.push(`Don huy hom nay dat ${realtimePayload.orders_cancelled}, can kiem tra nguyen nhan`)
      }

      const eventText = warnMessages.length ? warnMessages.join(' | ') : 'He thong van hanh on dinh'
      setEventLogs((prev) => [{ at: now.toLocaleString('vi-VN'), text: eventText }, ...prev].slice(0, 30))
    } catch (error) {
      const now = new Date().toLocaleString('vi-VN')
      setEventLogs((prev) => [{ at: now, text: `Loi theo doi he thong: ${error.message || 'Khong xac dinh'}` }, ...prev].slice(0, 30))
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

  const orderTrend = useMemo(() => history.map((item) => item.ordersCreated), [history])
  const revenueTrend = useMemo(() => history.map((item) => item.revenueCompleted), [history])

  const saveConfig = () => {
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
    window.alert('Da luu cau hinh giam sat he thong')
  }

  return (
    <section className="panel system-admin-panel">
      <div className="panel-head system-admin-panel-head">
        <h2>Cau hinh va giam sat he thong</h2>
        <span>Theo doi suc khoe dich vu, do tre API va chi so van hanh theo thoi gian thuc</span>
      </div>

      <div className="system-admin-card" style={{ marginBottom: '0.9rem' }}>
        <div className="panel-head">
          <h2>Cau hinh canh bao</h2>
          <span>Lan cap nhat gan nhat: {lastUpdatedAt || 'Dang cho du lieu'}</span>
        </div>
        <div className="system-admin-form-grid" style={{ marginBottom: '0.7rem' }}>
          <label>
            <span>Tan suat quet (giay)</span>
            <input type="number" min="5" value={config.pollSeconds} onChange={(e) => setConfig((p) => ({ ...p, pollSeconds: Number(e.target.value) || 20 }))} />
          </label>
          <label>
            <span>Nguong do tre canh bao (ms)</span>
            <input type="number" min="100" value={config.latencyWarnMs} onChange={(e) => setConfig((p) => ({ ...p, latencyWarnMs: Number(e.target.value) || 800 }))} />
          </label>
          <label>
            <span>Nguong so don huy / ngay</span>
            <input type="number" min="1" value={config.cancelWarnCount} onChange={(e) => setConfig((p) => ({ ...p, cancelWarnCount: Number(e.target.value) || 5 }))} />
          </label>
        </div>
        <div className="system-admin-form-actions">
          <button type="button" onClick={saveConfig}>Luu cau hinh</button>
          <button type="button" className="secondary" onClick={runMonitoring}>Lam moi ngay</button>
        </div>
      </div>

      <div className="system-admin-insight-grid" style={{ marginBottom: '0.9rem' }}>
        <article>
          <p>Health score</p>
          <strong>{healthScore}%</strong>
        </article>
        <article>
          <p>Don tao trong ngay</p>
          <strong>{fmtNum(realtime?.orders_created)}</strong>
        </article>
        <article>
          <p>Don hoan thanh</p>
          <strong>{fmtNum(realtime?.orders_completed)}</strong>
        </article>
        <article>
          <p>Doanh thu hoan thanh</p>
          <strong>{fmtMoney(realtime?.revenue_completed)}</strong>
        </article>
        <article>
          <p>Don bi huy</p>
          <strong>{fmtNum(realtime?.orders_cancelled)}</strong>
        </article>
        <article>
          <p>Thanh toan thanh cong</p>
          <strong>{fmtNum(realtime?.payments_succeeded)}</strong>
        </article>
      </div>

      <div className="system-admin-menu-layout" style={{ marginBottom: '0.9rem' }}>
        <section className="system-admin-card">
          <div className="panel-head"><h2>Trend don hang</h2><span>20 moc gan nhat</span></div>
          <MiniTrendChart points={orderTrend} color="#2563eb" title="don hang" />
        </section>
        <section className="system-admin-card">
          <div className="panel-head"><h2>Trend doanh thu</h2><span>20 moc gan nhat</span></div>
          <MiniTrendChart points={revenueTrend} color="#16a34a" title="doanh thu" />
        </section>
      </div>

      <div className="system-admin-card" style={{ marginBottom: '0.9rem' }}>
        <div className="panel-head"><h2>Trang thai ket noi dich vu</h2><span>{loading ? 'Dang cap nhat...' : 'Da cap nhat'}</span></div>
        <div className="system-admin-table-wrap">
          <table className="system-admin-table">
            <thead>
              <tr>
                <th>Dich vu</th>
                <th>Trang thai</th>
                <th>HTTP</th>
                <th>Do tre</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong></td>
                  <td>{statusLabel(item.ok)}</td>
                  <td>{item.status}</td>
                  <td>{item.latency} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="system-admin-card">
        <div className="panel-head"><h2>Nhat ky canh bao</h2><span>Tu dong cap nhat theo chu ky giam sat</span></div>
        <div className="system-admin-table-wrap">
          <table className="system-admin-table">
            <thead>
              <tr>
                <th>Thoi gian</th>
                <th>Su kien</th>
              </tr>
            </thead>
            <tbody>
              {eventLogs.map((log, idx) => (
                <tr key={`${log.at}-${idx}`}>
                  <td>{log.at}</td>
                  <td>{log.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
