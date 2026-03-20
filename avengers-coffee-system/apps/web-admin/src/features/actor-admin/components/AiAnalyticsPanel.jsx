import { useMemo } from 'react'
import { useAiAnalytics } from '../hooks/useAiAnalytics'

// ─── tiny helpers ─────────────────────────────────────────────────────────────

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

function StatusDot({ ok }) {
  return (
    <span style={{
      display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
      background: ok ? '#22c55e' : '#ef4444', marginRight: 6, verticalAlign: 'middle',
    }} />
  )
}

// ─── SVG Forecast Chart ───────────────────────────────────────────────────────

function ForecastChart({ history = [], forecast = [], metric }) {
  const W = 820, H = 260, PL = 56, PR = 20, PT = 18, PB = 38

  const all = [...history, ...forecast]
  if (all.length === 0) {
    return <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>Chưa có dữ liệu dự báo</div>
  }

  const isMoney = metric === 'revenue'
  const yValues = all.flatMap(p => [p.yhat, p.yhat_lower, p.yhat_upper].filter(v => v != null))
  const yMin = Math.max(0, Math.min(...yValues) * 0.85)
  const yMax = Math.max(...yValues) * 1.1

  const iW = W - PL - PR
  const iH = H - PT - PB
  const n = all.length

  const xScale = (i) => PL + (i / (n - 1)) * iW
  const yScale = (v) => PT + iH - ((v - yMin) / (yMax - yMin || 1)) * iH

  // Split forecast with confidence band
  const fcPoints = forecast.map((p, i) => ({ x: xScale(history.length + i), y: yScale(p.yhat), lo: yScale(p.yhat_upper ?? p.yhat), hi: yScale(p.yhat_lower ?? p.yhat) }))
  const histPoints = history.map((p, i) => ({ x: xScale(i), y: yScale(p.yhat) }))

  const polyline = (pts) => pts.map(p => `${p.x},${p.y}`).join(' ')
  const bandPath = fcPoints.length > 0
    ? `M ${fcPoints.map(p => `${p.x},${p.lo}`).join(' L ')} L ${[...fcPoints].reverse().map(p => `${p.x},${p.hi}`).join(' L ')} Z`
    : ''

  // X-axis labels: show every ~5th point
  const labelStep = Math.max(1, Math.floor(n / 8))
  const xLabels = all.filter((_, i) => i % labelStep === 0 || i === n - 1).map((p, _, arr) => {
    const idx = all.findIndex(a => a.ds === p.ds)
    return { x: xScale(idx), label: p.ds.slice(5) }
  })

  // Y-axis labels
  const ySteps = 5
  const yLabels = Array.from({ length: ySteps + 1 }, (_, i) => {
    const v = yMin + (i / ySteps) * (yMax - yMin)
    return { y: yScale(v), label: isMoney ? `${(v / 1000).toFixed(0)}k` : fmtNum(v) }
  })

  // Today divider
  const todayX = history.length > 0 ? xScale(history.length - 1) : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>
      {/* Grid lines */}
      {yLabels.map((l, i) => (
        <line key={i} x1={PL} y1={l.y} x2={W - PR} y2={l.y} stroke="#f3f4f6" strokeWidth="1" />
      ))}

      {/* Confidence band (forecast) */}
      {bandPath && <path d={bandPath} fill="#3b82f6" fillOpacity="0.12" />}

      {/* Today divider */}
      {todayX && (
        <>
          <line x1={todayX} y1={PT} x2={todayX} y2={H - PB} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="4,3" />
          <text x={todayX + 4} y={PT + 10} fill="#f59e0b" fontSize="9" fontWeight="600">Hôm nay</text>
        </>
      )}

      {/* Historical line */}
      {histPoints.length > 1 && (
        <polyline points={polyline(histPoints)} fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinejoin="round" />
      )}

      {/* Forecast line (dashed) */}
      {fcPoints.length > 1 && (
        <polyline points={polyline(fcPoints)} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="6,3" strokeLinejoin="round" />
      )}

      {/* Connect history → forecast */}
      {histPoints.length > 0 && fcPoints.length > 0 && (
        <line
          x1={histPoints[histPoints.length - 1].x} y1={histPoints[histPoints.length - 1].y}
          x2={fcPoints[0].x} y2={fcPoints[0].y}
          stroke="#3b82f6" strokeWidth="2" strokeDasharray="4,3"
        />
      )}

      {/* Forecast dots */}
      {fcPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="#3b82f6" fillOpacity="0.8" />
      ))}

      {/* Y-axis labels */}
      {yLabels.map((l, i) => (
        <text key={i} x={PL - 6} y={l.y + 4} textAnchor="end" fontSize="9" fill="#6b7280">{l.label}</text>
      ))}

      {/* X-axis labels */}
      {xLabels.map((l, i) => (
        <text key={i} x={l.x} y={H - 6} textAnchor="middle" fontSize="9" fill="#6b7280">{l.label}</text>
      ))}

      {/* Legend */}
      <rect x={W - PR - 140} y={PT} width={10} height={3} fill="#1d4ed8" rx="1" />
      <text x={W - PR - 126} y={PT + 5} fontSize="9" fill="#374151">Thực tế</text>
      <rect x={W - PR - 85} y={PT} width={10} height={3} fill="#3b82f6" rx="1" />
      <text x={W - PR - 71} y={PT + 5} fontSize="9" fill="#374151">Dự báo</text>
      <rect x={W - PR - 30} y={PT - 3} width={10} height={10} fill="#3b82f6" fillOpacity="0.15" rx="1" />
      <text x={W - PR - 16} y={PT + 5} fontSize="9" fill="#374151">CI</text>
    </svg>
  )
}

// ─── Recommendation Result Card ───────────────────────────────────────────────

function RecommendCard({ item }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px',
      display: 'flex', gap: 12, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 8, background: '#f3f4f6', flexShrink: 0,
        overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {item.image
          ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 22 }}>☕</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: '#111827' }}>{item.name}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>{item.category || 'Sản phẩm'}</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 700, color: '#d65a12' }}>
          {fmtMoney(item.price)}
        </p>
        <span style={{
          display: 'inline-block', marginTop: 4, fontSize: 10, padding: '2px 7px',
          borderRadius: 99, background: '#eff6ff', color: '#2563eb', fontWeight: 600,
        }}>
          {item.reason}
        </span>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: '#9ca3af' }}>Score</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>{item.score.toFixed(2)}</div>
      </div>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function AiAnalyticsPanel() {
  const {
    branchCode, setBranchCode,
    metric, setMetric,
    historyDays, setHistoryDays,
    forecastDays, setForecastDays,
    testUserId, setTestUserId,

    modelStatsQuery,
    forecastQuery,
    recommendQuery,

    retrainCfMutation,
    retrainForecastMutation,
    runRecommendTest,
  } = useAiAnalytics()

  const stats = modelStatsQuery.data
  const fc = forecastQuery.data
  const recs = recommendQuery.data

  const behaviorSummary = useMemo(() => {
    const totalUsers = Number(stats?.collaborative_filtering?.total_users || 0)
    const totalItems = Number(stats?.collaborative_filtering?.total_items || 0)
    const totalInteractions = Number(stats?.collaborative_filtering?.total_interactions || 0)
    const avgInteraction = totalUsers > 0 ? totalInteractions / totalUsers : 0

    return [
      {
        label: 'Khách đã có lịch sử mua',
        value: fmtNum(totalUsers),
        note: totalUsers > 0 ? 'AI có đủ dữ liệu để gợi ý cá nhân hóa' : 'Chưa có tệp khách đủ lớn cho gợi ý sâu',
      },
      {
        label: 'Sản phẩm trong mô hình gợi ý',
        value: fmtNum(totalItems),
        note: totalItems > 0 ? 'Danh mục đã được AI học' : 'Nên kiểm tra dữ liệu menu đầu vào',
      },
      {
        label: 'Tổng lượt tương tác mua hàng',
        value: fmtNum(totalInteractions),
        note: totalInteractions > 0 ? 'Hệ thống đã ghi nhận hành vi đặt món' : 'Cần thêm dữ liệu đơn hàng để tăng độ chính xác',
      },
      {
        label: 'Tần suất mua trung bình / khách',
        value: `${fmtNum(avgInteraction, 2)} lượt`,
        note: avgInteraction >= 2 ? 'Khách quay lại tốt, phù hợp chiến lược bán chéo' : 'Nên chạy ưu đãi kéo tần suất quay lại',
      },
    ]
  }, [stats])

  const forecastRows = useMemo(() => {
    const rows = (fc?.forecast || []).slice(0, 7)
    return rows.map((item) => ({
      ds: item.ds,
      yhat: Number(item.yhat || 0),
      lo: Number(item.yhat_lower ?? item.yhat ?? 0),
      hi: Number(item.yhat_upper ?? item.yhat ?? 0),
    }))
  }, [fc])

  const branchOptions = useMemo(() => {
    const base = [{ value: 'ALL', label: 'Tất cả chi nhánh' }]
    const branches = stats?.demand_forecasting?.branches || []
    branches.forEach(b => base.push({ value: b, label: b.replace(/_/g, ' ') }))
    return base
  }, [stats])

  const isAiDown = modelStatsQuery.isError

  return (
    <div style={{ padding: '0 0 40px' }}>

      {/* ── Hero banner ────────────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 60%, #3b82f6 100%)',
        borderRadius: 16, padding: '28px 32px', marginBottom: 28, color: '#fff',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: 2, opacity: 0.7, textTransform: 'uppercase' }}>
            Trung tâm phân tích AI
          </p>
          <h2 style={{ margin: '6px 0 8px', fontSize: 22, fontWeight: 900 }}>
            Gợi ý sản phẩm và Dự báo nhu cầu
          </h2>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.8, maxWidth: 500 }}>
            Hệ thống tổng hợp hành vi mua hàng để gợi ý sản phẩm phù hợp,
            đồng thời dự báo số đơn hoặc doanh thu trong các ngày tiếp theo để hỗ trợ vận hành.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            disabled={retrainCfMutation.isPending}
            onClick={() => retrainCfMutation.mutate()}
            style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, backdropFilter: 'blur(4px)',
            }}
          >
            {retrainCfMutation.isPending ? 'Đang cập nhật mô hình gợi ý...' : 'Cập nhật mô hình gợi ý'}
          </button>
          <button
            type="button"
            disabled={retrainForecastMutation.isPending}
            onClick={() => retrainForecastMutation.mutate()}
            style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', borderRadius: 8, padding: '8px 16px', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, backdropFilter: 'blur(4px)',
            }}
          >
            {retrainForecastMutation.isPending ? 'Đang cập nhật mô hình dự báo...' : 'Cập nhật mô hình dự báo'}
          </button>
        </div>
      </div>

      {/* ── AI Service Down Banner ───────────────────────────────────────── */}
      {isAiDown && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
          padding: '14px 20px', marginBottom: 24, color: '#991b1b',
        }}>
          <strong>⚠️ AI Service chưa khởi động</strong>
          <span style={{ marginLeft: 10, fontSize: 13 }}>
            Chạy lệnh: <code style={{ background: '#fee2e2', padding: '2px 6px', borderRadius: 4 }}>docker compose up -d --build ai-service api-gateway</code>
          </span>
        </div>
      )}

      {/* ── Model Status Cards ───────────────────────────────────────────── */}
      {modelStatsQuery.isLoading && (
        <p style={{ color: '#9ca3af', marginBottom: 24 }}>Đang kết nối AI service...</p>
      )}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 16, marginBottom: 28 }}>
          {[
            {
              label: 'Mô hình gợi ý', value: stats.collaborative_filtering?.is_trained ? 'Sẵn sàng' : 'Chưa sẵn sàng',
              sub: `${fmtNum(stats.collaborative_filtering?.total_users)} khách có lịch sử`, ok: stats.collaborative_filtering?.is_trained,
            },
            {
              label: 'Phạm vi học gợi ý', value: fmtNum(stats.collaborative_filtering?.total_items),
              sub: `${fmtNum(stats.collaborative_filtering?.total_interactions)} lượt tương tác`, ok: true,
            },
            {
              label: 'Mô hình dự báo', value: stats.demand_forecasting?.is_trained ? 'Sẵn sàng' : 'Chưa sẵn sàng',
              sub: stats.demand_forecasting?.engine || 'N/A', ok: stats.demand_forecasting?.is_trained,
            },
            {
              label: 'Du lieu du bao', value: fmtNum(stats.demand_forecasting?.total_records),
              sub: `${stats.demand_forecasting?.branches?.length || 0} chi nhánh`, ok: true,
            },
            {
              label: 'Lần cập nhật gợi ý', value: fmtDate(stats.collaborative_filtering?.trained_at)?.split(',')[0] || '---',
              sub: fmtDate(stats.collaborative_filtering?.trained_at)?.split(',')[1] || '', ok: true,
            },
            {
              label: 'Trạng thái dịch vụ', value: stats.service || 'ai-v1',
              sub: stats.uptime_ok ? 'Đang hoạt động' : 'Tạm dừng', ok: stats.uptime_ok,
            },
          ].map((card, i) => (
            <div key={i} style={{
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
              padding: '16px 18px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#111827', marginBottom: 4 }}>
                <StatusDot ok={card.ok} />
                {card.value}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af' }}>{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {stats && (
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16,
          padding: '20px 24px', marginBottom: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>
            Bảng diễn giải hành vi mua hàng
          </h3>
          <p style={{ margin: '6px 0 14px', fontSize: 12, color: '#6b7280' }}>
            Bảng này giúp quản trị đọc nhanh AI đang nhìn thấy gì từ dữ liệu mua hàng để ra quyết định bán hàng.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#374151' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>Chi so</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>Giá trị</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>Diễn giải cho quản trị</th>
                </tr>
              </thead>
              <tbody>
                {behaviorSummary.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>{row.label}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#0f172a' }}>{row.value}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Forecast Chart ───────────────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16,
        padding: '24px', marginBottom: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111827' }}>
              Du bao nhu cau mua hang
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
              {fc ? `Cong cu: ${fc.model_engine} · Cap nhat: ${fmtDate(fc.trained_at)}` : 'Đang tải...'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select value={branchCode} onChange={e => setBranchCode(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600 }}>
              {branchOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={metric} onChange={e => setMetric(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600 }}>
              <option value="orders">Số đơn hàng</option>
              <option value="revenue">Doanh thu (VNĐ)</option>
            </select>
            <select value={historyDays} onChange={e => setHistoryDays(Number(e.target.value))}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600 }}>
              <option value={14}>14 ngày lịch sử</option>
              <option value={30}>30 ngày lịch sử</option>
              <option value={60}>60 ngày lịch sử</option>
            </select>
            <select value={forecastDays} onChange={e => setForecastDays(Number(e.target.value))}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600 }}>
              <option value={7}>Dự báo 7 ngày</option>
              <option value={14}>Dự báo 14 ngày</option>
              <option value={30}>Dự báo 30 ngày</option>
            </select>
          </div>
        </div>

        {forecastQuery.isLoading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Đang tải dữ liệu dự báo...</div>
        )}
        {forecastQuery.isError && (
          <div style={{ textAlign: 'center', padding: 40, color: '#ef4444' }}>
            Lỗi kết nối AI service. Vui lòng kiểm tra container đã chạy chưa.
          </div>
        )}
        {fc && (
          <>
            <ForecastChart history={fc.history} forecast={fc.forecast} metric={metric} />

            {/* Summary row */}
            <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'TB dự báo', value: metric === 'revenue' ? fmtMoney(fc.summary?.avg_forecast) : fmtNum(fc.summary?.avg_forecast, 1) },
                { label: 'Cao nhất', value: metric === 'revenue' ? fmtMoney(fc.summary?.max_forecast) : fmtNum(fc.summary?.max_forecast, 1) },
                { label: 'Thấp nhất', value: metric === 'revenue' ? fmtMoney(fc.summary?.min_forecast) : fmtNum(fc.summary?.min_forecast, 1) },
                {
                  label: 'Xu hướng',
                  value: `${fc.summary?.trend_pct > 0 ? '↑' : '↓'} ${Math.abs(fc.summary?.trend_pct || 0)}%`,
                  color: fc.summary?.trend_pct > 0 ? '#16a34a' : '#dc2626',
                },
              ].map((s, i) => (
                <div key={i} style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 16px', minWidth: 130 }}>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: s.color || '#111827', marginTop: 4 }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#374151' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Ngay du bao</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Du kien trung binh</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Muc dao dong thap</th>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #e5e7eb' }}>Muc dao dong cao</th>
                  </tr>
                </thead>
                <tbody>
                  {forecastRows.map((row) => (
                    <tr key={row.ds}>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', fontWeight: 700 }}>{row.ds}</td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9' }}>
                        {metric === 'revenue' ? fmtMoney(row.yhat) : fmtNum(row.yhat, 1)}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>
                        {metric === 'revenue' ? fmtMoney(row.lo) : fmtNum(row.lo, 1)}
                      </td>
                      <td style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#64748b' }}>
                        {metric === 'revenue' ? fmtMoney(row.hi) : fmtNum(row.hi, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ── Recommendation Test Lab ──────────────────────────────────────── */}
      <div style={{
        background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16,
        padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#111827' }}>
          Thử nghiệm gợi ý theo hành vi khách
        </h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#6b7280' }}>
          Nhập mã người dùng để xem danh sách món AI đề xuất dựa trên lịch sử mua. Nếu là tài khoản mới, hệ thống trả về món phổ biến.
        </p>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <input
            value={testUserId}
            onChange={e => setTestUserId(e.target.value)}
            placeholder="Nhập User ID (UUID) hoặc để trống = popular items"
            style={{
              flex: 1, padding: '10px 14px', border: '1px solid #e5e7eb',
              borderRadius: 8, fontSize: 13, outline: 'none',
            }}
            onKeyDown={e => e.key === 'Enter' && runRecommendTest(testUserId)}
          />
          <button
            type="button"
            onClick={() => runRecommendTest(testUserId || 'guest-test-user')}
            style={{
              background: '#1d4ed8', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
            }}
          >
            🔍 Gợi ý
          </button>
        </div>

        {recommendQuery.isLoading && (
          <p style={{ color: '#9ca3af' }}>Đang truy vấn AI model...</p>
        )}

        {recs && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                background: recs.is_personalized ? '#dcfce7' : '#fef3c7',
                color: recs.is_personalized ? '#16a34a' : '#92400e',
              }}>
                {recs.is_personalized ? '✓ Gợi ý cá nhân hóa' : '★ Sản phẩm phổ biến (cold start)'}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>
                Model: {recs.model} · User: {recs.user_id?.slice(0, 16)}…
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
              {(recs.items || []).map((item, i) => (
                <RecommendCard key={i} item={item} />
              ))}
            </div>
          </>
        )}

        {recommendQuery.isError && (
          <p style={{ color: '#ef4444' }}>Lỗi kết nối AI service hoặc user ID không hợp lệ.</p>
        )}
      </div>
    </div>
  )
}
