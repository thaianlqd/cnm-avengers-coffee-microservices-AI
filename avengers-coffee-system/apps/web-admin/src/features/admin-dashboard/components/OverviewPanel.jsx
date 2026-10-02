import React from 'react'
import {
  ORDER_STATUS_LABEL,
  OVERVIEW_TIME_RANGES,
  PAYMENT_COLOR,
  PAYMENT_METHOD_LABEL,
  STATUS_COLOR,
} from '../constants'
import { fmtMoney, normalizeViText } from '../utils'
import {
  Store,
  TrendingUp,
  Clock,
  Coffee,
  Coins,
  ShoppingBag,
  Calendar,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Activity,
  BarChart3,
  PieChart,
  Award,
  ShieldCheck,
  Filter,
  Sparkles,
  Zap,
  Check,
  Layers,
  ArrowUpRight
} from 'lucide-react'

export function OverviewPanel({ branchName, totals, overviewData, overviewRange, setOverviewRange }) {
  const rangeMeta = OVERVIEW_TIME_RANGES.find((range) => range.id === overviewRange) || OVERVIEW_TIME_RANGES[1]
  const summary = overviewData.summary || {}

  const donutRows = (overviewData.paymentRows || []).slice(0, 4)
  const donutTotal = Math.max(
    1,
    donutRows.reduce((sum, row) => sum + Number(row.count || 0), 0),
  )
  let donutStart = 0
  const donutStops = donutRows.map((row) => {
    const percent = (Number(row.count || 0) / donutTotal) * 100
    const end = donutStart + percent
    const stop = `${PAYMENT_COLOR[row.code] || '#4f46e5'} ${donutStart}% ${end}%`
    donutStart = end
    return stop
  })
  if (donutStart < 100) {
    donutStops.push(`#e2e8f0 ${donutStart}% 100%`)
  }
  const donutBackground = `conic-gradient(${donutStops.join(', ')})`
  const primaryAlert = summary.alerts?.[0] || 'Tất cả các chỉ số vận hành đều ổn định.'

  return (
    <div className="panel-container" style={{
      padding: '1.75rem',
      background: '#f8fafc',
      borderRadius: '20px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem'
    }}>
      
      {/* HERO SECTION */}
      <section style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '18px',
        padding: '1.5rem',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '1.5rem',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.775rem', fontWeight: '700', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <Sparkles size={16} color="#10b981" />
            <span>Báo cáo hoạt động chi nhánh tổng quan</span>
          </div>

          <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(16, 185, 129, 0.25)'
            }}>
              <Store size={22} />
            </div>
            Cơ sở {branchName}
          </h2>

          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', lineHeight: '1.5' }}>
            Theo dõi tình hình kinh doanh, doanh thu thực tế, chỉ số hiệu suất vận hành và số lượng đơn hàng theo bộ lọc thời gian.
          </p>

          {/* Time Range Filter Switcher */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginRight: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Filter size={14} color="#64748b" /> Bộ lọc:
            </span>
            {OVERVIEW_TIME_RANGES.map((range) => {
              const isActive = overviewRange === range.id
              return (
                <button
                  key={range.id}
                  type="button"
                  onClick={() => setOverviewRange(range.id)}
                  style={{
                    padding: '0.35rem 0.85rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: isActive ? '700' : '500',
                    border: isActive ? '1px solid #10b981' : '1px solid #e2e8f0',
                    backgroundColor: isActive ? '#10b981' : '#ffffff',
                    color: isActive ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {range.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Efficiency Score Ring & Key Health Ratios */}
        <div style={{
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          flexWrap: 'wrap',
          gap: '1.25rem'
        }}>
          {/* Circular Score Gauge */}
          <div style={{
            position: 'relative',
            width: '108px',
            height: '108px',
            borderRadius: '50%',
            background: `conic-gradient(#10b981 0% ${summary.efficiencyScore || 0}%, #e2e8f0 ${summary.efficiencyScore || 0}% 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(16,185,129,0.2)'
          }}>
            <div style={{
              width: '88px',
              height: '88px',
              borderRadius: '50%',
              backgroundColor: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <strong style={{ fontSize: '1.45rem', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>
                {summary.efficiencyScore || 0}
              </strong>
              <span style={{ fontSize: '0.675rem', color: '#64748b', fontWeight: '700', marginTop: '0.2rem' }}>
                Điểm vận hành
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div>
              <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Tỷ lệ hoàn thành đơn</span>
              <strong style={{ fontSize: '1.05rem', color: '#059669', fontWeight: '800' }}>{summary.completionRate || 0}%</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Tỷ lệ hủy đơn</span>
              <strong style={{ fontSize: '1.05rem', color: '#ef4444', fontWeight: '800' }}>{summary.cancelRate || 0}%</strong>
            </div>
            <div>
              <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Giá trị trung bình / đơn</span>
              <strong style={{ fontSize: '1.05rem', color: '#2563eb', fontWeight: '800' }}>{fmtMoney(summary.averageOrderValue || 0)}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* KPI STATS CARDS GRID */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <article style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '1.15rem 1.25rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#ecfdf5',
            color: '#059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <TrendingUp size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Doanh thu hoàn thành</span>
            <strong style={{ fontSize: '1.25rem', color: '#059669', fontWeight: '800', marginTop: '0.1rem', display: 'block' }}>
              {fmtMoney(totals.revenue)}
            </strong>
          </div>
        </article>

        <article style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '1.15rem 1.25rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#eff6ff',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Clock size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Đơn đang xử lý</span>
            <strong style={{ fontSize: '1.25rem', color: '#2563eb', fontWeight: '800', marginTop: '0.1rem', display: 'block' }}>
              {totals.inProgress} đơn
            </strong>
          </div>
        </article>

        <article style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '1.15rem 1.25rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#fffbeb',
            color: '#d97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Coins size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Tổng giá trị đơn</span>
            <strong style={{ fontSize: '1.25rem', color: '#d97706', fontWeight: '800', marginTop: '0.1rem', display: 'block' }}>
              {fmtMoney(totals.gross)}
            </strong>
          </div>
        </article>

        <article style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '1.15rem 1.25rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#fef2f2',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Coffee size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Món đang mở bán</span>
            <strong style={{ fontSize: '1.25rem', color: '#ef4444', fontWeight: '800', marginTop: '0.1rem', display: 'block' }}>
              {totals.activeMenu} món
            </strong>
          </div>
        </article>

        <article style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '1.15rem 1.25rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#fffbeb',
            color: '#d97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Clock size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Tiền COD Chờ duyệt</span>
            <strong style={{ fontSize: '1.25rem', color: '#d97706', fontWeight: '800', marginTop: '0.1rem', display: 'block' }}>
              {fmtMoney(totals.codPending || 0)}
            </strong>
          </div>
        </article>

        <article style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '1.15rem 1.25rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#f0fdf4',
            color: '#16a34a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500', display: 'block' }}>Tiền COD Đã thu</span>
            <strong style={{ fontSize: '1.25rem', color: '#16a34a', fontWeight: '800', marginTop: '0.1rem', display: 'block' }}>
              {fmtMoney(totals.codConfirmed || 0)}
            </strong>
          </div>
        </article>
      </section>

      {/* METRICS STRIP */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700' }}>SẢN LƯỢNG BÁN RA</span>
          <strong style={{ fontSize: '1.15rem', color: '#0f172a', fontWeight: '800' }}>{summary.totalItemsSold || 0} món</strong>
          <span style={{ fontSize: '0.725rem', color: '#94a3b8' }}>{summary.averageItemsPerOrder || 0} món / đơn trung bình</span>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700' }}>GIỜ CAO ĐIỂM BÁN HÀNG</span>
          <strong style={{ fontSize: '1.15rem', color: '#0f172a', fontWeight: '800' }}>{summary.peakHour?.label || '--:--'}</strong>
          <span style={{ fontSize: '0.725rem', color: '#94a3b8' }}>{summary.peakHour?.value || 0} đơn ở mốc cao nhất</span>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700' }}>NGÀY DOANH THU CAO NHẤT</span>
          <strong style={{ fontSize: '1.15rem', color: '#0f172a', fontWeight: '800' }}>{summary.bestRevenueDay?.label || 'Chưa có'}</strong>
          <span style={{ fontSize: '0.725rem', color: '#94a3b8' }}>{summary.bestRevenueDay ? fmtMoney(summary.bestRevenueDay.amount) : '---'}</span>
        </div>

        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '700' }}>PHƯƠNG THỨC TT DẪN ĐẦU</span>
          <strong style={{ fontSize: '1.15rem', color: '#0f172a', fontWeight: '800' }}>
            {summary.topPaymentMethod ? (PAYMENT_METHOD_LABEL[summary.topPaymentMethod.code] || summary.topPaymentMethod.code) : '---'}
          </strong>
          <span style={{ fontSize: '0.725rem', color: '#94a3b8' }}>{summary.topPaymentMethod?.count || 0} đơn hàng</span>
        </div>
      </section>

      {/* SIGNALS & HEALTH CARDS */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        <article style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.975rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Activity size={18} color="#10b981" /> Cảnh báo & Tín hiệu vận hành
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Cập nhật tự động</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {(summary.alerts || [primaryAlert]).map((alert, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', backgroundColor: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <AlertCircle size={16} color="#d97706" style={{ flexShrink: 0 }} />
                <strong style={{ fontSize: '0.825rem', color: '#334155', fontWeight: '600' }}>{alert}</strong>
              </div>
            ))}
          </div>
        </article>

        <article style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.975rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <ShieldCheck size={18} color="#059669" /> Chỉ số sức khỏe chi nhánh
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Tổng quan chỉ số</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Tỷ lệ hoàn thành</span>
              <strong style={{ display: 'block', fontSize: '1.1rem', color: '#059669', marginTop: '0.2rem' }}>{summary.completionRate || 0}%</strong>
            </div>
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Tỷ lệ hủy đơn</span>
              <strong style={{ display: 'block', fontSize: '1.1rem', color: '#ef4444', marginTop: '0.2rem' }}>{summary.cancelRate || 0}%</strong>
            </div>
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Độ phủ tồn kho</span>
              <strong style={{ display: 'block', fontSize: '1.1rem', color: '#4f46e5', marginTop: '0.2rem' }}>{summary.inventoryHealthRate || 0}%</strong>
            </div>
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Đơn hoàn thành</span>
              <strong style={{ display: 'block', fontSize: '1.1rem', color: '#0f172a', marginTop: '0.2rem' }}>{summary.completedOrders || 0}</strong>
            </div>
          </div>
        </article>
      </section>

      {/* HOURLY TREND CHARTS */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem' }}>
        <article style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.975rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <BarChart3 size={18} color="#10b981" /> Biểu đồ xu hướng đơn hàng (8 giờ gần nhất)
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Tự làm mới mỗi 30s</span>
          </div>

          <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1rem', overflowX: 'auto' }}>
            <svg viewBox="0 0 700 220" style={{ width: '100%', height: 'auto', minWidth: '550px' }}>
              <defs>
                <linearGradient id="emeraldLineFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {(overviewData.hourly || []).map((point, index) => {
                const maxH = Math.max(1, overviewData.maxHourly || 1)
                const x = 40 + index * 90
                const y = 190 - (point.value / maxH) * 140
                return (
                  <g key={point.key || index}>
                    <circle cx={x} cy={y} r="5" fill="#10b981" stroke="#ffffff" strokeWidth="2" />
                    <text x={x} y="210" textAnchor="middle" fill="#64748b" fontSize="12" fontWeight="600">
                      {point.label}
                    </text>
                    <text x={x} y={y - 10} textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="700">
                      {point.value}
                    </text>
                  </g>
                )
              })}

              {(overviewData.hourly || []).length > 0 && (
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  points={overviewData.hourly
                    .map((point, index) => {
                      const maxH = Math.max(1, overviewData.maxHourly || 1)
                      const x = 40 + index * 90
                      const y = 190 - (point.value / maxH) * 140
                      return `${x},${y}`
                    })
                    .join(' ')}
                />
              )}

              {(overviewData.hourly || []).length > 0 && (
                <polygon
                  fill="url(#emeraldLineFill)"
                  points={`${overviewData.hourly
                    .map((point, index) => {
                      const maxH = Math.max(1, overviewData.maxHourly || 1)
                      const x = 40 + index * 90
                      const y = 190 - (point.value / maxH) * 140
                      return `${x},${y}`
                    })
                    .join(' ')} 670,190 40,190`}
                />
              )}
            </svg>
          </div>
        </article>
      </section>

      {/* TOP ITEMS & DISTRIBUTION GRID */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
        
        {/* Top Best Sellers */}
        <article style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.975rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Award size={18} color="#eab308" /> Top món bán chạy nhất
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Xếp theo số lượng</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {(overviewData.topItems || []).length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: 0, fontStyle: 'italic' }}>Chưa có dữ liệu món bán chạy.</p>
            ) : null}

            {(overviewData.topItems || []).map((item, index) => (
              <div key={item.ma_san_pham} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.65rem 0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: index === 0 ? '#fef08a' : index === 1 ? '#e2e8f0' : index === 2 ? '#ffedd5' : '#f1f5f9',
                    color: index === 0 ? '#854d0e' : index === 1 ? '#475569' : index === 2 ? '#9a3412' : '#64748b',
                    fontSize: '0.75rem',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {index + 1}
                  </span>
                  <strong style={{ fontSize: '0.85rem', color: '#0f172a' }}>{normalizeViText(item.ten_san_pham)}</strong>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <strong style={{ display: 'block', fontSize: '0.85rem', color: '#059669' }}>{item.so_luong} món</strong>
                  <span style={{ fontSize: '0.725rem', color: '#64748b' }}>{fmtMoney(item.doanh_thu)}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        {/* Status Distribution */}
        <article style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.975rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <PieChart size={18} color="#2563eb" /> Phân bổ trạng thái đơn hàng
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Realtime</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {(overviewData.statusRows || []).length === 0 ? (
              <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: 0, fontStyle: 'italic' }}>Chưa có dữ liệu trạng thái.</p>
            ) : null}

            {(overviewData.statusRows || []).map((row) => (
              <div key={row.status} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.825rem', fontWeight: '600', color: '#0f172a' }}>
                  <span>{ORDER_STATUS_LABEL[row.status] || row.status}</span>
                  <span style={{ color: '#059669' }}>{row.count} đơn ({fmtMoney(row.revenue)})</span>
                </div>

                <div style={{ height: '8px', width: '100%', backgroundColor: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.max(8, (row.count / (overviewData.maxStatus || 1)) * 100)}%`,
                      backgroundColor: STATUS_COLOR[row.status] || '#10b981',
                      borderRadius: '9999px'
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </article>

        {/* Donut Payment Chart */}
        <article style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.975rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <CreditCard size={18} color="#4f46e5" /> Cơ cấu thanh toán đơn
            </h3>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Tỷ trọng đơn</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{
              position: 'relative',
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: donutBackground,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(0,0,0,0.05)'
            }}>
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <strong style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', lineHeight: 1 }}>{overviewData.paymentTotal || 0}</strong>
                <span style={{ fontSize: '0.65rem', color: '#64748b' }}>đơn</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {donutRows.length === 0 ? <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: 0, fontStyle: 'italic' }}>Chưa có dữ liệu.</p> : null}
              {donutRows.map((row) => {
                const percent = Math.round((Number(row.count || 0) / donutTotal) * 100)
                return (
                  <div key={row.code} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.825rem' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: PAYMENT_COLOR[row.code] || '#10b981' }} />
                    <strong style={{ color: '#0f172a' }}>{PAYMENT_METHOD_LABEL[row.code] || row.code}</strong>
                    <span style={{ color: '#64748b' }}>({percent}%)</span>
                  </div>
                )
              })}
            </div>
          </div>
        </article>

      </section>

    </div>
  )
}
