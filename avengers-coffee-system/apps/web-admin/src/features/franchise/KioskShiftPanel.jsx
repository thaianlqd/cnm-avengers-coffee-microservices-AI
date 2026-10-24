import React, { useState } from "react";
import { Button } from "../../components/ui/button";
import { Table } from "../../components/ui/table";
import { PaginatedList } from "../../components/console/CompactPagination";
import StatusBadge from "../../components/console/StatusBadge";
import {
  RefreshCw,
  Plus,
  Receipt,
  Check,
  X,
  ShieldAlert,
} from "../../components/console/WorkspaceIcons";

const money = (value) => Number(value || 0).toLocaleString("vi-VN") + "đ";
const date = (value) =>
  value
    ? new Date(value).toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";
const labels = {
  OPEN: "Đang mở",
  CLOSE_PENDING: "Chờ đối soát",
  CLOSED: "Đã xác nhận",
  FORCE_CLOSED: "Đóng bắt buộc",
  CLOSE_REJECTED: "Cần kiểm tra lại",
};
function CashDifference({ value }) {
  const amount = Number(value || 0);
  return <StatusBadge tone={amount < 0 ? 'destructive' : amount > 0 ? 'warning' : 'success'} status={amount === 0 ? 'SUCCESS' : 'PENDING'}>{amount < 0 ? `Thiếu ${money(-amount)}` : amount > 0 ? `Dư ${money(amount)}` : 'Khớp tiền'}</StatusBadge>;
}
export function KioskTableLoading({ label = "Đang tải dữ liệu", rows = 5 }) {
  return (
    <div className="kiosk-table-loading" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="workspace-shimmer" aria-hidden="true" />
      ))}
    </div>
  );
}
export default function KioskShiftPanel({
  active,
  history = [],
  loading,
  historyLoading,
  busy,
  onRefresh,
  onOpen,
  onClose,
  onForceClose,
  onOrders,
  onReview,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const current = active?.has_open_shift ? active.active_shift : null;
  const stats = active?.live_stats;
  const selected = history.find((item) => item.id === selectedId);
  return (
    <div className="kiosk-shifts-panel">
      <div className="kiosk-panel-toolbar">
        <span>
          {history.filter((item) => item.trang_thai === "CLOSE_PENDING").length}{" "}
          ca chờ đối soát
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw size={15} />
          Làm mới
        </Button>
      </div>
      {loading ? (
        <KioskTableLoading label="Đang tải ca hiện tại" rows={2} />
      ) : (
        <section className="kiosk-current-shift">
          <header>
            <div>
              <StatusBadge status={current ? "ACTIVE" : "INACTIVE"}>
                {current ? "Đang hoạt động" : "Chưa mở ca"}
              </StatusBadge>
              <h2>
                {current
                  ? current.staff_name || current.staff_username
                  : "Sẵn sàng cho ca bán hàng mới"}
              </h2>
              <p>
                {current
                  ? `@${current.staff_username} · Mở lúc ${date(current.thoi_gian_mo_ca)}`
                  : "Các ca đã chốt tiếp tục chờ đối soát trong lịch sử. Bạn có thể mở ca mới ngay."}
              </p>
            </div>
            <div className="kiosk-inline-actions">
              {current ? (
                <>
                  <Button type="button" variant="outline" onClick={onOrders}>
                    <Receipt size={15} />
                    Xem đơn
                  </Button>
                  <Button type="button" onClick={onClose}>
                    Chốt ca
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    data-intent="danger"
                    title="Cưỡng chế đóng ca"
                    aria-label="Cưỡng chế đóng ca"
                    onClick={onForceClose}
                  >
                    <ShieldAlert size={16} />
                  </Button>
                </>
              ) : (
                <Button type="button" onClick={onOpen}>
                  <Plus size={16} />
                  Mở ca mới
                </Button>
              )}
            </div>
          </header>
          {current && (
            <dl className="kiosk-shift-totals">
              <div>
                <dt>Tiền đầu ca</dt>
                <dd>{money(current.tien_dau_ca)}</dd>
              </div>
              <div>
                <dt>Doanh thu</dt>
                <dd>{money(stats?.total_revenue)}</dd>
              </div>
              <div>
                <dt>Đơn đã bán</dt>
                <dd>{stats?.total_orders || 0} đơn</dd>
              </div>
              <div>
                <dt>Tiền mặt kỳ vọng</dt>
                <dd>{money(stats?.expected_cash)}</dd>
              </div>
            </dl>
          )}
        </section>
      )}
      <section className="kiosk-shift-history">
        <header>
          <h2>Lịch sử chốt ca</h2>
          <span>{history.length} ca đã ghi nhận</span>
        </header>
        {historyLoading ? (
          <KioskTableLoading label="Đang tải lịch sử chốt ca" />
        ) : !history.length ? (
          <p className="operation-empty">Chưa có ca bán hàng được ghi nhận.</p>
        ) : (
          <div className="kiosk-record-table">
            <Table>
              <thead>
                <tr>
                  <th>Thời gian ca</th>
                  <th>Nhân viên</th>
                  <th>Doanh thu</th>
                  <th>Tiền mặt cuối ca</th>
                  <th>Chênh lệch</th>
                  <th>Đối soát</th>
                </tr>
              </thead>
              <tbody>
                <PaginatedList
                  items={history}
                  resetKey={history[0]?.co_so_ma}
                  layout="table"
                  columns={6}
                >
                  {(shift) => {
                    const pending = shift.trang_thai === "CLOSE_PENDING",
                      open = shift.trang_thai === "OPEN",
                      diff = Number(shift.chenh_lech || 0);
                    return (
                      <tr key={shift.id}>
                        <td>
                          <strong>{date(shift.thoi_gian_mo_ca)}</strong>
                          <small>
                            Đến{" "}
                            {date(
                              shift.thoi_gian_dong_ca ||
                                shift.close_requested_at,
                            )}
                          </small>
                        </td>
                        <td>
                          <strong>
                            {shift.staff_name || shift.staff_username}
                          </strong>
                          <small>@{shift.staff_username}</small>
                        </td>
                        <td>
                          <strong>{money(shift.doanh_thu_he_thong)}</strong>
                          <small>{shift.tong_don_hang || 0} đơn</small>
                        </td>
                        <td>
                          <strong>
                            {open ? "—" : money(shift.tien_cuoi_ca)}
                          </strong>
                          <small>Kỳ vọng {money(shift.tien_mat_ky_vong)}</small>
                        </td>
                        <td className={diff ? "kiosk-amount-difference" : ""}>
                          {open
                            ? "Chưa chốt"
                            : <CashDifference value={diff} />}
                        </td>
                        <td className="kiosk-review-cell">
                          <StatusBadge
                            status={
                              pending
                                ? "PENDING"
                                : shift.trang_thai === "CLOSE_REJECTED"
                                  ? "REJECTED"
                                  : open
                                    ? "ACTIVE"
                                    : "COMPLETED"
                            }
                          >
                            {labels[shift.trang_thai] || shift.trang_thai}
                          </StatusBadge>
                          {!open && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedId(shift.id)}
                            >
                              {pending ? "Kiểm tra đối soát" : "Xem chi tiết"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  }}
                </PaginatedList>
              </tbody>
            </Table>
          </div>
        )}
        {selected && (
          <section className="kiosk-shift-review" aria-label="Chi tiết đối soát ca">
            <header>
              <div>
                <h3>
                  Đối soát ca của{" "}
                  {selected.staff_name || selected.staff_username}
                </h3>
                <p>
                  {date(selected.thoi_gian_mo_ca)} –{" "}
                  {date(
                    selected.thoi_gian_dong_ca || selected.close_requested_at,
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Đóng chi tiết ca"
                onClick={() => setSelectedId(null)}
              >
                <X size={16} />
              </Button>
            </header>
            <dl className="kiosk-shift-totals">
              <div className="kiosk-cash-opening">
                <dt>Tiền mặt đầu ca</dt>
                <dd>{money(selected.tien_dau_ca)}</dd>
              </div>
              <div className="kiosk-cash-expected">
                <dt>Tiền mặt kỳ vọng cuối ca</dt>
                <dd>{money(selected.tien_mat_ky_vong)}</dd>
              </div>
              <div className="kiosk-cash-counted">
                <dt>Tiền mặt thực đếm</dt>
                <dd>{money(selected.tien_cuoi_ca)}</dd>
              </div>
              <div className="kiosk-cash-difference">
                <dt>Kết quả kiểm đếm</dt>
                <dd><CashDifference value={selected.chenh_lech} /></dd>
                <small>Chênh lệch {money(selected.chenh_lech)}</small>
              </div>
            </dl>
            <p>Ghi chú: {selected.ghi_chu || "Không có"}</p>
            {selected.close_approval_note && (
              <p>Nhận xét đối soát: {selected.close_approval_note}</p>
            )}
            {selected.trang_thai === "CLOSE_PENDING" && (
              <footer>
                <span>Việc duyệt đối soát không ảnh hưởng đến ca đang mở.</span>
                <Button
                  type="button"
                  variant="outline"
                  data-intent="danger"
                  disabled={busy}
                  onClick={() => onReview("REJECT", selected)}
                >
                  <X size={15} />
                  Cần kiểm tra lại
                </Button>
                <Button
                  type="button"
                  variant="default"
                  disabled={busy}
                  onClick={() => onReview("APPROVE", selected)}
                >
                  <Check size={15} />
                  Xác nhận đối soát
                </Button>
              </footer>
            )}
          </section>
        )}
      </section>
    </div>
  );
}
