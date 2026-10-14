import { money, number } from "../../components/console/chartModel";
import { Store, Package, Wallet, CircleAlert } from "lucide-react";
import {
  Chart,
  Metric,
  DashboardSkeleton,
} from "../../components/console/DashboardCharts";

export default function BiDashboard({ data }) {
  if (!data) return <DashboardSkeleton />;
  const trend = data.xu_huong_doanh_thu || [];
  const regions = data.doanh_thu_theo_khu_vuc || [];
  return (
    <section className="console-dashboard">
      <div className="console-page-heading">
        <div>
          <span className="console-eyebrow">TÀI CHÍNH NHƯỢNG QUYỀN</span>
          <h1>Báo cáo tài chính tổng hợp</h1>
          <p>
            Tổng quan mạng lưới, khoản đã thu và công nợ theo dữ liệu báo cáo
            hiện có.
          </p>
        </div>
      </div>
      <div className="console-kpis">
        <Metric
          label="Kiosk đang hoạt động"
          value={number(data.tong_kiosk_hoat_dong)}
          icon={Store}
        />
        <Metric
          label="Đơn nhập combo"
          value={number(data.tong_don_combo)}
          icon={Package}
          tone="amber"
        />
        <Metric
          label="Royalty đã thu"
          value={money(data.tong_royalty_da_thu)}
          icon={Wallet}
          tone="teal"
        />
        <Metric
          label="Công nợ chưa thu"
          value={money(data.tong_no_chua_thu)}
          icon={CircleAlert}
          tone="red"
        />
      </div>
      <div className="console-charts">
        <Chart
          title="Doanh thu kiosk theo tháng"
          type="line"
          format={money}
          rows={trend.map((row) => ({
            label: row.thang,
            value: row.doanh_thu_kiosk,
          }))}
        />
        <Chart
          title="Royalty theo tháng"
          format={money}
          rows={trend.map((row) => ({
            label: row.thang,
            value: row.doanh_thu_royalty,
          }))}
        />
        <Chart
          title="Doanh thu theo khu vực"
          type="donut"
          format={money}
          rows={regions.map((row) => ({
            label: row.khu_vuc,
            value: row.doanh_thu_thang,
          }))}
        />
        <Chart
          title="Số kiosk theo khu vực"
          subtitle="Phân bố điểm bán trong dữ liệu báo cáo"
          rows={regions.map(row => ({ label: row.khu_vuc, value: row.so_luong_kiosk }))}
        />
      </div>
      <article className="console-card">
        <h3>Chi tiết đóng góp theo khu vực</h3>
        <div className="console-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Khu vực</th>
                <th>Số kiosk</th>
                <th>Doanh thu tháng</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((row, i) => (
                <tr key={i}>
                  <td>{row.khu_vuc}</td>
                  <td>{number(row.so_luong_kiosk)}</td>
                  <td>{money(row.doanh_thu_thang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!regions.length && (
            <p className="console-muted">Chưa có số liệu theo khu vực.</p>
          )}
        </div>
      </article>
    </section>
  );
}
