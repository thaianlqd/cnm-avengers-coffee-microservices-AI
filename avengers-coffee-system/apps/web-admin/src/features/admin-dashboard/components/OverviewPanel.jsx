import {
  ORDER_STATUS_LABEL,
  OVERVIEW_TIME_RANGES,
  PAYMENT_COLOR,
  PAYMENT_METHOD_LABEL,
  STATUS_COLOR,
} from '../constants'
import { fmtMoney, normalizeViText, paymentTag } from '../utils'

export function OverviewPanel({ totals, overviewData, overviewRange, setOverviewRange }) {
  return (
    <>
      <section className="stats-grid">
        <article className="kpi-card kpi-amber">
          <p>Doanh thu theo bộ lọc</p>
          <h3>{fmtMoney(totals.revenue)}</h3>
        </article>
        <article className="kpi-card kpi-blue">
          <p>Đơn đang xử lý</p>
          <h3>{totals.inProgress} đơn</h3>
        </article>
        <article className="kpi-card kpi-green">
          <p>Món đang mở bán</p>
          <h3>{totals.activeMenu} món</h3>
        </article>
        <article className="kpi-card kpi-brown">
          <p>Tổng giá trị đơn trên bảng</p>
          <h3>{fmtMoney(totals.gross)}</h3>
        </article>
      </section>

      <section className="overview-grid overview-grid-luxe">
        <article className="chart-card chart-card-glow chart-filter-card">
          <div className="panel-head">
            <h2>Bộ lọc phân tích</h2>
            <span>{overviewData.filteredCount} đơn trong phạm vi</span>
          </div>
          <div className="filter-chip-row">
            {OVERVIEW_TIME_RANGES.map((range) => (
              <button
                key={range.id}
                type="button"
                className={overviewRange === range.id ? 'filter-chip active' : 'filter-chip'}
                onClick={() => setOverviewRange(range.id)}
              >
                {range.label}
              </button>
            ))}
          </div>
          <small>Dữ liệu biểu đồ và KPI sẽ cập nhật theo khoảng thời gian đã chọn.</small>
        </article>

        <article className="chart-card chart-card-glow chart-span-2">
          <div className="panel-head">
            <h2>Xu hướng đơn 8 giờ gần nhất</h2>
            <span>Tự làm mới mỗi 30 giây</span>
          </div>
          <div className="line-chart-box luxe-chart-bg">
            <svg viewBox="0 0 700 220" role="img" aria-label="Biểu đồ xu hướng đơn hàng theo giờ">
              <defs>
                <linearGradient id="lineFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#ff8c4d" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#ff8c4d" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {overviewData.hourly.map((point, index) => {
                const x = 40 + index * 90
                const y = 190 - (point.value / overviewData.maxHourly) * 140
                return (
                  <g key={point.key}>
                    <circle cx={x} cy={y} r="4" fill="#d65a12" />
                    <text x={x} y="210" textAnchor="middle" className="axis-label">
                      {point.label}
                    </text>
                    <text x={x} y={y - 10} textAnchor="middle" className="value-label">
                      {point.value}
                    </text>
                  </g>
                )
              })}
              <polyline
                fill="none"
                stroke="#d65a12"
                strokeWidth="4"
                points={overviewData.hourly
                  .map((point, index) => {
                    const x = 40 + index * 90
                    const y = 190 - (point.value / overviewData.maxHourly) * 140
                    return `${x},${y}`
                  })
                  .join(' ')}
              />
              <polygon
                fill="url(#lineFill)"
                points={`${overviewData.hourly
                  .map((point, index) => {
                    const x = 40 + index * 90
                    const y = 190 - (point.value / overviewData.maxHourly) * 140
                    return `${x},${y}`
                  })
                  .join(' ')} 670,190 40,190`}
              />
            </svg>
          </div>
        </article>

        <article className="chart-card chart-card-glow">
          <div className="panel-head">
            <h2>Phân bổ trạng thái đơn</h2>
            <span>Realtime từ đơn hàng</span>
          </div>
          <div className="bar-list">
            {overviewData.statusRows.length === 0 ? <p>Chưa có dữ liệu trạng thái.</p> : null}
            {overviewData.statusRows.map((row) => (
              <div key={row.status} className="bar-row">
                <div className="bar-row-head">
                  <strong>{ORDER_STATUS_LABEL[row.status] || row.status}</strong>
                  <span>{row.count} đơn</span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.max(8, (row.count / overviewData.maxStatus) * 100)}%`,
                      background: STATUS_COLOR[row.status] || '#d65a12',
                    }}
                  />
                </div>
                <small>Giá trị: {fmtMoney(row.revenue)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="chart-card chart-card-glow">
          <div className="panel-head">
            <h2>Cơ cấu thanh toán và tồn kho</h2>
            <span>COD / VNPAY / QR</span>
          </div>
          <div className="payment-list">
            {overviewData.paymentRows.length === 0 ? <p>Chưa có dữ liệu thanh toán.</p> : null}
            {overviewData.paymentRows.map((row) => {
              const percent = overviewData.paymentTotal > 0 ? Math.round((row.count / overviewData.paymentTotal) * 100) : 0
              return (
                <div key={row.code} className="payment-row">
                  <div className="payment-head">
                    <strong>{paymentTag(row.code)}</strong>
                    <span>{row.count} đơn ({percent}%)</span>
                  </div>
                  <div className="payment-track">
                    <div
                      className="payment-fill"
                      style={{
                        width: `${Math.max(8, percent)}%`,
                        background: PAYMENT_COLOR[row.code] || '#d65a12',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <div className="stock-chips">
            <span>Tổng món: {overviewData.stockSummary.total}</span>
            <span>Đang bán: {overviewData.stockSummary.available}</span>
            <span>Sắp hết: {overviewData.stockSummary.lowStock}</span>
            <span>Tạm hết: {overviewData.stockSummary.outOfStock}</span>
          </div>
        </article>

        <article className="chart-card chart-card-glow">
          <div className="panel-head">
            <h2>Doanh thu theo ngày</h2>
            <span>Trong phạm vi lọc</span>
          </div>
          <div className="bar-list">
            {overviewData.revenueByDay.length === 0 ? <p>Chưa có dữ liệu doanh thu theo ngày.</p> : null}
            {overviewData.revenueByDay.map((row) => (
              <div key={row.key} className="bar-row">
                <div className="bar-row-head">
                  <strong>{row.label}</strong>
                  <span>{row.orders} đơn</span>
                </div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: `${Math.max(6, (row.amount / overviewData.maxRevenueDay) * 100)}%`,
                      background: '#d65a12',
                    }}
                  />
                </div>
                <small>{fmtMoney(row.amount)}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="chart-card chart-card-glow">
          <div className="panel-head">
            <h2>Top món bán chạy</h2>
            <span>Xếp theo số lượng bán</span>
          </div>
          <div className="top-items-table">
            <div className="top-items-head">
              <span>Món</span>
              <span>SL</span>
              <span>Doanh thu</span>
            </div>
            {overviewData.topItems.length === 0 ? <p>Chưa có dữ liệu món bán chạy.</p> : null}
            {overviewData.topItems.map((item) => (
              <div key={item.ma_san_pham} className="top-items-row">
                <strong>{normalizeViText(item.ten_san_pham)}</strong>
                <span>{item.so_luong}</span>
                <span>{fmtMoney(item.doanh_thu)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  )
}
