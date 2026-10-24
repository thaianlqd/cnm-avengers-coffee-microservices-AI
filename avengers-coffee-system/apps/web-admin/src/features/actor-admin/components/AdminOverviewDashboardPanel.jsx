import { Button } from '../../../components/ui/button'
import { Label } from '../../../components/ui/label'
import { Input } from '../../../components/ui/input'
import { Table } from '../../../components/ui/table'
import { selectChartPeriod, vietnamDay } from '../../../components/console/chartPeriod';
import { money, number } from "../../../components/console/chartModel";
import { useState } from "react";
import { Users, Store, Coffee, UserCheck, ShoppingBag } from '../../../components/console/WorkspaceIcons';
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
  ACCOUNTANT: "Quản lý nhượng quyền",
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
  const paymentLabels = {
    TIEN_MAT: "Tiền mặt",
    THANH_TOAN_KHI_NHAN_HANG: "Tiền mặt khi nhận",
    VNPAY: "Ví VNPay",
    ZALOPAY: "Ví ZaloPay",
    MOMO: "Ví MoMo",
    QR: "Quét mã QR",
    CONG_NO: "Công nợ kiosk",
    CHUYEN_KHOAN: "Chuyển khoản",
  };
  const paymentCounts = orders.reduce((groups, order) => {
    const raw = order.phuong_thuc_thanh_toan || order.payment_method || order.paymentMethod || "TIEN_MAT";
    const label = paymentLabels[raw] || raw;
    groups[label] = (groups[label] || 0) + 1;
    return groups;
  }, {});
  const paymentRows = Object.entries(paymentCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([label, value]) => ({ label, value }));

  const channelCounts = orders.reduce((groups, order) => {
    let channel = "Mang đi / Tại quán";
    if (order.dia_chi_giao_hang || order.dia_chi || order.loai_don_hang === "GIAO_HANG" || order.order_type === "DELIVERY") {
      channel = "Giao tận nơi";
    } else if (order.hinh_thuc_nhan === "TAI_BAN" || order.loai_don_hang === "TAI_CHO") {
      channel = "Dùng tại bàn";
    }
    groups[channel] = (groups[channel] || 0) + 1;
    return groups;
  }, {});
  const channelRows = Object.entries(channelCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([label, value]) => ({ label, value }));
  const roleRows = Object.entries(statsState.data?.by_role || {}).map(
    ([role, value]) => ({ label: roles[role] || role, value }),
  );
  const categoryCounts = (menuState.items || []).reduce((acc, item) => {
    const catName = item.danh_muc?.ten_danh_muc || item.ten_danh_muc || item.category_name || item.danh_muc_ten || 'Khác';
    acc[catName] = (acc[catName] || 0) + 1;
    return acc;
  }, {});
  const categoryRows = Object.entries(categoryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([label, value]) => ({ label, value }));

  const branchAreaCounts = (branchesState.items || []).reduce((acc, b) => {
    const area = b.tinh_thanh || b.thanh_pho || (b.dia_chi?.split(',').pop()?.trim()) || (b.trang_thai === 'HOAT_DONG' ? 'Đang hoạt động' : 'Tạm dừng') || 'Khác';
    acc[area] = (acc[area] || 0) + 1;
    return acc;
  }, {});
  const branchAreaRows = Object.entries(branchAreaCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([label, value]) => ({ label, value }));
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
              label="Tổng tài khoản"
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
            <Metric
              label="Khách hàng"
              value={number(dashboardSummary.customerCount)}
              note="Theo thống kê tài khoản hệ thống"
              icon={Users}
            />
            <Metric
              label="Đơn hàng đã tải"
              value={recentOrdersState.loading ? '…' : number(recentOrders.length)}
              note="Tập đơn gần đây, không phải tổng hệ thống"
              icon={ShoppingBag}
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
            <Chart
              title="Cơ cấu danh mục thực đơn"
              subtitle="Phân bố số lượng món theo từng nhóm danh mục"
              type="donut"
              rows={categoryRows}
            />
            <Chart
              title="Mạng lưới chi nhánh theo khu vực"
              subtitle="Số lượng cơ sở phân bố theo tỉnh / thành phố"
              rows={branchAreaRows}
            />
          </div>
        </>
      )}
      <div className="admin-dashboard-section">
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
            <Button
              key={value}
              aria-pressed={days === value}
              onClick={() => setDays(value)}
            >
              {value} ngày
            </Button>
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
        <Chart
          loading={recentOrdersState.loading}
          error={recentOrdersState.error}
          subtitle="Cơ cấu phương thức thanh toán của các đơn đã ghi nhận"
          title="Phương thức thanh toán"
          type="donut"
          rows={paymentRows}
        />
        <Chart
          loading={recentOrdersState.loading}
          error={recentOrdersState.error}
          subtitle="Tỉ trọng theo hình thức nhận món và giao hàng"
          title="Hình thức phục vụ"
          rows={channelRows}
        />
      </div>
      <article className="console-card admin-activity-card">
        <div className="console-page-heading workspace-section-heading">
          <h3 style={{ margin: 0 }}>Nhật ký hoạt động</h3>
          <Label className="workspace-field admin-activity-search">

            <Input className="ui-input"
              aria-label="Tìm hoạt động"
              placeholder="Tìm đơn, tài khoản…"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </Label>
        </div>
        <div className="console-table-scroll">
          <Table>
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Hoạt động</th>
                <th style={{ width: '30%' }}>Nội dung</th>
                <th style={{ width: '25%', textAlign: 'right' }}>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((item) => (
                <tr key={item.id}>
                  <td>{item.title}</td>
                  <td>{item.description}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {item.date && Number.isFinite(new Date(item.date).getTime())
                      ? new Date(item.date).toLocaleString("vi-VN")
                      : "Chưa có thời gian"}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!activities.length && (
            <p className="console-muted">Không có hoạt động phù hợp.</p>
          )}
        </div>
      </article>
    </section>
  );
}
