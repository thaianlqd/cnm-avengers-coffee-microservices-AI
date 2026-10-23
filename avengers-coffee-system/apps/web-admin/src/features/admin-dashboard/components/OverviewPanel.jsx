import { money, number } from "../../../components/console/chartModel";
import { Store, ShoppingBag, Coffee, CheckCircle2, Wallet } from '../../../components/console/WorkspaceIcons';
import {
  OVERVIEW_TIME_RANGES,
  ORDER_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
} from "../constants";
import {
  Chart,
  Metric,
  DashboardSkeleton,
} from "../../../components/console/DashboardCharts";

export function OverviewPanel({
  branchName,
  totals,
  overviewData,
  overviewRange,
  setOverviewRange,
  loading,
  error,
}) {
  const summary = overviewData.summary || {};
  const chartData = overviewData.chartData || overviewData;
  return (
    <section className="console-dashboard">
      <div className="console-page-heading">
        <div>
          <span className="console-eyebrow">VẬN HÀNH CHI NHÁNH</span>
          <h1>
            <Store size={24} /> {branchName || "Tổng quan cửa hàng"}
          </h1>
          <p>
            Đơn hàng, giá trị bán hàng và tình hình thực đơn trong cùng một góc
            nhìn.
          </p>
        </div>
        <div className="console-segments" aria-label="Khoảng thời gian">
          {OVERVIEW_TIME_RANGES.map((range) => (
            <button
              key={range.id}
              onClick={() => setOverviewRange(range.id)}
              aria-pressed={overviewRange === range.id}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>
      {error ? (
        <div className="console-error" role="alert">
          Không tải được đầy đủ số liệu: {error}
        </div>
      ) : loading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="console-kpis">
            <Metric
              label="Đơn trong khoảng đã chọn"
              value={number(overviewData.filteredCount)}
              icon={ShoppingBag}
            />
            <Metric
              label="Giá trị đơn hoàn thành"
              value={money(summary.completedRevenue)}
              icon={Wallet}
              tone="teal"
            />
            <Metric
              label="Tỷ lệ hoàn thành"
              value={summary.completionRate + "%"}
              note={number(summary.completedOrders) + " đơn hoàn thành"}
              icon={CheckCircle2}
              tone="teal"
            />
            <Metric
              label="Món đang có hàng"
              value={number(overviewData.stockSummary?.available)}
              note="Tồn kho hiện tại"
              icon={Coffee}
              tone="amber"
            />
          </div>
          {overviewData.chartPeriod?.fallback && <p className="workspace-chart-note">Biểu đồ dùng kỳ gần nhất có dữ liệu: {overviewData.chartPeriod.label}. Các chỉ số bên trên vẫn thuộc kỳ đã chọn; tồn kho là hiện tại.</p>}
          <div className="console-charts">
            <Chart
              title="Giá trị đơn theo ngày"
              subtitle={`Giá trị mọi trạng thái · ${overviewData.chartPeriod?.label || 'kỳ đã chọn'}`}
              type="line"
              format={money}
              rows={(chartData.revenueByDay || []).map((row) => ({
                label: row.label,
                value: row.amount,
              }))}
            />
            <Chart
              title="Trạng thái đơn hàng"
              subtitle={`Số đơn · ${overviewData.chartPeriod?.label || 'kỳ đã chọn'}`}
              rows={(chartData.statusRows || []).map((row) => ({
                label: ORDER_STATUS_LABEL[row.status] || row.status,
                value: row.count,
              }))}
            />
            <Chart
              title="Phương thức thanh toán"
              subtitle={`Theo số đơn · ${overviewData.chartPeriod?.label || 'kỳ đã chọn'} · chưa thể hiện tiền đã thu`}
              type="donut"
              rows={(chartData.paymentRows || []).map((row) => ({
                label: PAYMENT_METHOD_LABEL[row.code] || row.code,
                value: row.count,
              }))}
            />
            <Chart
              title="Số lượng món được đặt"
              subtitle={`Mọi trạng thái đơn · ${overviewData.chartPeriod?.label || 'kỳ đã chọn'}`}
              rows={(chartData.topItems || []).map(item => ({ label: item.ten_san_pham, value: item.so_luong }))}
            />
            <Chart
              title="Tình trạng tồn kho"
              subtitle="Số món theo tồn kho hiện tại; mỗi món thuộc một nhóm"
              type="donut"
              rows={[
                { label: 'Còn hàng trên mức cảnh báo', value: Math.max(0, (overviewData.stockSummary?.available || 0) - (overviewData.stockSummary?.lowStock || 0)), color: '#3b82f6' },
                { label: 'Sắp hết hàng', value: overviewData.stockSummary?.lowStock || 0, color: '#eba341' },
                { label: 'Hết hàng', value: overviewData.stockSummary?.outOfStock || 0, color: '#e65d78' },
              ]}
            />
            <Chart
              title="Phân bố đơn theo khung giờ"
              subtitle={`Mật độ đặt hàng gần đây · ${overviewData.chartPeriod?.label || 'kỳ đã chọn'}`}
              rows={(overviewData.hourly || []).map((h) => ({
                label: h.label,
                value: h.value,
              }))}
            />
          </div>
          <div className="console-two-columns">
            <article className="console-card">
              <h3>Món được đặt nhiều</h3>
              <p className="console-muted">
                Theo cùng kỳ với biểu đồ, bao gồm các trạng thái đơn.
              </p>
              <div className="console-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Món</th>
                      <th>Số lượng</th>
                      <th>Giá trị</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(chartData.topItems || []).map((item, i) => (
                      <tr key={item.ma_san_pham || i}>
                        <td>{item.ten_san_pham}</td>
                        <td>{number(item.so_luong)}</td>
                        <td>{money(item.doanh_thu)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!chartData.topItems?.length && (
                  <p className="console-muted">
                    Chưa có món được đặt trong khoảng này.
                  </p>
                )}
              </div>
            </article>
            <article className="console-card">
              <h3>Đối soát và tồn kho hiện tại</h3>
              <div className="console-summary-row">
                <span>COD chờ duyệt</span>
                <b>{money(totals.codPending)}</b>
              </div>
              <div className="console-summary-row">
                <span>COD đã thu</span>
                <b>{money(totals.codConfirmed)}</b>
              </div>
              <div className="console-summary-row">
                <span>Món hết hàng</span>
                <b>{number(overviewData.stockSummary?.outOfStock)}</b>
              </div>
              <div className="console-summary-row">
                <span>Món sắp hết</span>
                <b>{number(overviewData.stockSummary?.lowStock)}</b>
              </div>
            </article>
          </div>
        </>
      )}
    </section>
  );
}
