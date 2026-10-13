import { selectChartPeriod, vietnamDay } from '../../../components/console/chartPeriod';
import { money, number } from "../../../components/console/chartModel";
import { useState } from "react";
import { Users, Store, Coffee, UserCheck, Search } from "lucide-react";
import {
  Chart,
  Metric,
  DashboardSkeleton,
} from "../../../components/console/DashboardCharts";
const roles = {
  ADMIN: "Quản trị viên",
  MANAGER: "Quản lý",
  STAFF: "Nhân viên",
  CUSTOMER: "Khách hàng",
  ACCOUNTANT: "Kế toán",
  FRANCHISEE: "Đối tác kiosk",
  FRANCHISE_STAFF: "Nhân viên kiosk",
  SHIPPER: "Shipper",
  KIOSK_STAFF: "Nhân viên điểm bán",
};
const statuses = {
  MOI_TAO: "Mới tạo",
  CHO_XAC_NHAN: "Chờ xác nhận",
  DA_XAC_NHAN: "Đã xác nhận",
  DANG_CHUAN_BI: "Đang chuẩn bị",
  DANG_GIAO: "Đang giao",
  HOAN_THANH: "Hoàn thành",
  DA_HUY: "Đã hủy",
};

export function AdminOverviewDashboardPanel({
  statsState = {},
  dashboardSummary = {},
  branchChartRows = [],
  recentOrders = [],
  recentOrdersState = {},
  recentUsers = [],
  branchesState = {},
  menuState = {},
  promotionsState = {},
}) {
  const [days, setDays] = useState(7);
  const [keyword, setKeyword] = useState("");
  const period = selectChartPeriod(recentOrders, days);
  const orders = period.rows;
  const daily = orders.reduce((groups, order) => {
    const key = vietnamDay(order.ngay_tao || order.created_at || order.createdAt);
    groups[key] =
      (groups[key] || 0) +
      Number(order.tong_tien ?? order.thanh_tien ?? order.totalAmount ?? 0);
    return groups;
  }, {});
  const counts = orders.reduce((groups, order) => {
    const status = order.trang_thai_don_hang || order.status || "Chưa xác định";
    groups[status] = (groups[status] || 0) + 1;
    return groups;
  }, {});
  const roleRows = Object.entries(statsState.data?.by_role || {}).map(
    ([role, value]) => ({ label: roles[role] || role, value }),
  );
  const activities = [
    ...recentOrders.map((order, index) => ({
      id: "order-" + index,
      title:
        "Đơn #" + String(order.ma_don_hang || order.id || "—").slice(0, 12),
      description:
        statuses[order.trang_thai_don_hang] ||
        order.trang_thai_don_hang ||
        "Đơn hàng",
      date: order.ngay_tao || order.created_at || order.createdAt,
    })),
    ...recentUsers.map((user, index) => ({
      id: "user-" + index,
      title: user.ho_ten || user.ten_dang_nhap || "Tài khoản mới",
      description: roles[user.vai_tro] || user.vai_tro,
      date: user.ngay_tao || user.created_at || user.createdAt,
    })),
  ]
    .sort(
      (a, b) =>
        (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0),
    )
    .filter((item) =>
      (item.title + " " + item.description)
        .toLocaleLowerCase("vi")
        .includes(keyword.toLocaleLowerCase("vi")),
    )
    .slice(0, 10);
  return (
    <section className="console-dashboard">
      <div className="console-page-heading">
        <div>
          <span className="console-eyebrow">AVENGERS · SYSTEM OVERVIEW</span>
          <h1>Tổng quan hệ thống</h1>
          <p>Nắm tình hình mạng lưới, tài khoản và các hoạt động mới nhất.</p>
        </div>
        <span className="console-chart-badge">Dữ liệu hiện có</span>
      </div>
      {statsState.loading ? (
        <DashboardSkeleton />
      ) : statsState.error && !statsState.data ? (
        <div className="console-error" role="alert">
          Không tải được thống kê: {statsState.error}
        </div>
      ) : (
        <>
          <div className="console-kpis">
            <Metric
              label="Tài khoản hệ thống"
              value={number(dashboardSummary.totalUsers)}
              icon={Users}
            />
            <Metric
              label="Tài khoản hoạt động"
              value={number(dashboardSummary.activeUsers)}
              note={number(dashboardSummary.activeRate) + "% tài khoản"}
              icon={UserCheck}
              tone="teal"
            />
            <Metric
              label="Chi nhánh đã tải"
              value={branchesState.loading ? '…' : number(branchesState.items?.length)}
              icon={Store}
              tone="amber"
            />
            <Metric
              label="Sản phẩm thực đơn"
              value={menuState.loading ? '…' : number(menuState.items?.length)}
              note={
                number(promotionsState.items?.length) +
                " chương trình khuyến mãi đã tải"
              }
              icon={Coffee}
            />
          </div>
          <div className="console-charts">
            <Chart
              title="Tài khoản theo vai trò"
              type="donut"
              rows={roleRows}
            />
            <Chart
              title="Tài khoản theo chi nhánh"
              subtitle="10 chi nhánh có nhiều tài khoản nhất"
              rows={branchChartRows
                .slice(0, 10)
                .map((row) => ({ label: row.label, value: row.count }))}
            />
          </div>
        </>
      )}
      <div className="console-page-heading">
        <div>
          <h2 style={{ fontSize: 17, margin: 0 }}>
            Hoạt động đơn hàng gần đây
          </h2>
          <p>
            Biểu đồ dùng tập đơn gần đây đã tải; đây không phải tổng doanh thu
            toàn hệ thống.
          </p>
        </div>
        <div className="console-segments">
          {[7, 30].map((value) => (
            <button
              key={value}
              aria-pressed={days === value}
              onClick={() => setDays(value)}
            >
              {value} ngày
            </button>
          ))}
        </div>
      </div>
      {period.fallback && <p className="workspace-chart-note">Kỳ đã chọn chưa đủ dữ liệu. Biểu đồ dùng kỳ gần nhất có dữ liệu: {period.label}. Chỉ áp dụng cho tập đơn đã tải.</p>}
      <div className="console-charts">
        <Chart
          loading={recentOrdersState.loading}
          error={recentOrdersState.error}
          title="Giá trị đơn theo ngày"
          subtitle={`Tập đơn đã tải · ${period.label} · bao gồm các trạng thái đơn`}
          type="line"
          format={money}
          rows={Object.entries(daily)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, value]) => ({
              label: date.slice(8) + "/" + date.slice(5, 7),
              value,
            }))}
        />
        <Chart
          loading={recentOrdersState.loading}
          error={recentOrdersState.error}
          subtitle={`Tập đơn đã tải · ${period.label}`}
          title="Trạng thái đơn gần đây"
          rows={Object.entries(counts).map(([status, value]) => ({
            label: statuses[status] || status,
            value,
          }))}
        />
      </div>
      <article className="console-card">
        <div className="console-page-heading workspace-section-heading">
          <h3 style={{ margin: 0 }}>Nhật ký hoạt động</h3>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={16} />
            <input
              aria-label="Tìm hoạt động"
              placeholder="Tìm đơn, tài khoản…"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </label>
        </div>
        <div className="console-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Hoạt động</th>
                <th>Nội dung</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{item.description}</td>
                  <td>
                    {item.date && Number.isFinite(new Date(item.date).getTime())
                      ? new Date(item.date).toLocaleString("vi-VN")
                      : "Chưa có thời gian"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!activities.length && (
            <p className="console-muted">Không có hoạt động phù hợp.</p>
          )}
        </div>
      </article>
    </section>
  );
}
