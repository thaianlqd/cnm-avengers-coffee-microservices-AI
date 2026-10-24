import React, { useMemo, useState } from "react";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Table } from "../../components/ui/table";
import SearchableSelect from "../../components/console/SearchableSelect";
import StatusBadge from "../../components/console/StatusBadge";
import { PaginatedList } from "../../components/console/CompactPagination";
import {
  Search,
  CreditCard,
  Wallet,
} from "../../components/console/WorkspaceIcons";
const money = (value) => Number(value || 0).toLocaleString("vi-VN") + "đ";
const date = (value) =>
  value ? new Date(value).toLocaleDateString("vi-VN") : "Chưa có";
const names = {
  KHOI_TAO: "Phí nhượng quyền ban đầu",
  NGUYEN_LIEU: "Công nợ nguyên liệu",
  ROYALTY: "Chia sẻ doanh thu",
  PHAT_TRE_HAN: "Phí trả chậm",
};
export default function KioskDebtPanel({
  debts = [],
  scope,
  onSettle,
  onWalletPay,
  onVnpayPay,
}) {
  const [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [paying, setPaying] = useState(null);
  const rows = useMemo(
    () =>
      debts
        .filter(
          (debt) =>
            (status === "all" || debt.trang_thai === status) &&
            `${names[debt.loai_phat_sinh] || ""} ${debt.id} ${debt.kiosk?.ten_kiosk || ""}`
              .toLocaleLowerCase("vi")
              .includes(query.toLocaleLowerCase("vi")),
        )
        .sort((a, b) => new Date(b.ngay_tao || 0) - new Date(a.ngay_tao || 0)),
    [debts, query, status],
  );
  const pay = async (debt, method) => {
    setPaying(debt.id);
    try {
      await method(debt);
    } finally {
      setPaying(null);
    }
  };
  return (
    <div className="kiosk-debt-panel">
      <div className="kiosk-debt-tools">
        <div className="kiosk-search-field">
          <Search size={17} />
          <Input
            aria-label="Tìm công nợ"
            placeholder="Tìm tên hoặc mã công nợ…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <SearchableSelect
          aria-label="Trạng thái công nợ"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "all", label: "Tất cả trạng thái" },
            { value: "CON_NO", label: "Chưa thanh toán" },
            { value: "QUA_HAN", label: "Quá hạn" },
            { value: "DA_THANH_TOAN", label: "Đã thanh toán" },
          ]}
        />
      </div>
      <div className="kiosk-record-table">
        <Table>
          <thead>
            <tr>
              <th>Khoản công nợ</th>
              <th>Thời gian</th>
              <th>Số tiền</th>
              <th>Trạng thái</th>
              <th>Thanh toán</th>
            </tr>
          </thead>
          <tbody>
            <PaginatedList
              items={rows}
              resetKey={`${scope}-${query}-${status}`}
              layout="table"
              columns={5}
            >
              {(debt) => (
                <tr key={debt.id}>
                  <td>
                    <strong>
                      {names[debt.loai_phat_sinh] || debt.loai_phat_sinh}
                    </strong>
                    <small>
                      #{String(debt.id).slice(0, 8).toUpperCase()} ·{" "}
                      {debt.kiosk?.ma_kiosk || "—"}
                    </small>
                    {debt.ghi_chu && <small>{debt.ghi_chu}</small>}
                  </td>
                  <td>
                    <span>Tạo {date(debt.ngay_tao)}</span>
                    <small>Hạn {date(debt.han_thanh_toan)}</small>
                    {debt.ngay_xac_nhan_thanh_toan && (
                      <small>
                        Đã trả {date(debt.ngay_xac_nhan_thanh_toan)}
                      </small>
                    )}
                  </td>
                  <td>
                    <strong>
                      {money(
                        Number(debt.so_tien) +
                          Number(debt.phi_phat_tre_han || 0),
                      )}
                    </strong>
                    {Number(debt.phi_phat_tre_han) > 0 && (
                      <small>
                        Gồm phí trả chậm {money(debt.phi_phat_tre_han)}
                      </small>
                    )}
                  </td>
                  <td>
                    <StatusBadge
                      status={
                        debt.trang_thai === "QUA_HAN"
                          ? "REJECTED"
                          : debt.trang_thai === "DA_THANH_TOAN"
                            ? "COMPLETED"
                            : "PENDING"
                      }
                    >
                      {debt.trang_thai === "DA_THANH_TOAN"
                        ? "Đã thanh toán"
                        : debt.trang_thai === "QUA_HAN"
                          ? "Quá hạn"
                          : "Chưa thanh toán"}
                    </StatusBadge>
                  </td>
                  <td>
                    {debt.trang_thai === "DA_THANH_TOAN" ? (
                      <span className="kiosk-muted">Đã hoàn tất</span>
                    ) : (
                      <div className="kiosk-inline-actions">
                        {debt.loai_phat_sinh === "KHOI_TAO" ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => onSettle(debt)}
                          >
                            <CreditCard size={14} />
                            Tất toán
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={paying === debt.id}
                              onClick={() => pay(debt, onWalletPay)}
                            >
                              <Wallet size={14} />
                              Ví
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={paying === debt.id}
                              onClick={() => pay(debt, onVnpayPay)}
                            >
                              <CreditCard size={14} />
                              VNPay
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </PaginatedList>
            {!rows.length && (
              <tr>
                <td colSpan={5} className="operation-empty">
                  Không có công nợ phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
