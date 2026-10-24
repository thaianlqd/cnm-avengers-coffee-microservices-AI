import React, { Fragment, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover";
import { Input } from "../../components/ui/input";
import SearchableSelect from "../../components/console/SearchableSelect";
import { Button } from "../../components/ui/button";
import StatusBadge from "../../components/console/StatusBadge";
import {
  Store,
  MapPin,
  ArrowRight,
  Plus,
  Trash2,
  Check,
  X,
  Calendar,
  ChevronDown,
  Search,
} from "../../components/console/WorkspaceIcons";
const statusLabels = {
  DANG_HOAT_DONG: "Đang hoạt động",
  TAM_NGUNG: "Tạm ngưng",
  TAM_DUNG: "Tạm dừng",
  NGUNG_HOAT_DONG: "Ngừng hoạt động",
  CHO_KY_HOP_DONG: "Chờ ký hợp đồng",
  CHO_DUYET: "Chờ duyệt",
  DANG_THIET_LAP: "Đang thiết lập",
  CHO_BAN_GIAO: "Chờ bàn giao",
  DONG_CUA: "Đã đóng cửa",
};
export function KioskIdentity({ kiosk, children }) {
  return (
    <section className="kiosk-context-summary" aria-label="Kiosk hiện tại">
      <Store size={22} />
      <div>
        <strong>{kiosk?.ten_kiosk || "Kiosk được phân công"}</strong>
        <span>
          {kiosk?.ma_kiosk || "Chưa được gắn kiosk"}
          {kiosk?.dia_chi ? ` · ${kiosk.dia_chi}` : ""}
        </span>
      </div>
      {kiosk?.trang_thai && (
        <StatusBadge status={kiosk.trang_thai}>
          {statusLabels[kiosk.trang_thai] || kiosk.trang_thai}
        </StatusBadge>
      )}
      {children}
    </section>
  );
}
export function KioskPosPicker({ kiosks = [], onSelect }) {
  return (
    <section className="kiosk-pos-picker" aria-label="Chọn kiosk bán hàng">
      {!kiosks.length ? (
        <div className="operation-empty">
          Tài khoản chưa có kiosk. Kiểm tra thông tin điểm bán trước khi tạo
          đơn.
        </div>
      ) : (
        <div className="kiosk-choice-grid">
          {kiosks.map((kiosk) => {
            const active = kiosk.trang_thai === "DANG_HOAT_DONG";
            return (
              <article key={kiosk.id} className="kiosk-choice">
                <div className="kiosk-choice-top">
                  <Store size={24} />
                  <StatusBadge status={kiosk.trang_thai}>
                    {statusLabels[kiosk.trang_thai] ||
                      kiosk.trang_thai ||
                      "Chưa xác định"}
                  </StatusBadge>
                </div>
                <h3>{kiosk.ten_kiosk}</h3>
                <small>
                  {kiosk.ma_kiosk} ·{" "}
                  {{
                    XE_LUU_DONG: "Xe lưu động",
                    KIOSK_CO_DINH: "Kiosk cố định",
                    CONTAINER_CAFE: "Container café",
                  }[kiosk.loai_kiosk] || kiosk.loai_kiosk}
                </small>
                <p>
                  <MapPin size={16} />
                  <span>
                    {[kiosk.dia_chi, kiosk.thanh_pho]
                      .filter(Boolean)
                      .join(", ") || "Chưa cập nhật địa chỉ"}
                  </span>
                </p>
                <Button
                  type="button"
                  variant={active ? "default" : "outline"}
                  disabled={!active}
                  onClick={() => onSelect(kiosk.id)}
                >
                  {active ? "Vào bán hàng" : "Chưa thể bán hàng"}
                  {active && <ArrowRight size={16} />}
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
export function KioskScheduleGrid({
  days,
  templates,
  items = [],
  loading,
  onAssign,
  onDelete,
  onApprove,
  onReject,
  handlingId,
  onAttendance,
  readOnly = false,
  canAssign = () => true,
  currentUsername,
}) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = items.find(
    (item) => (item.ma_ca_lam_viec || item.id) === selectedId,
  );
  const pending = selected?.trang_thai_yeu_cau === "PENDING";
  const attendanceLabels = {
    ASSIGNED: "Chờ nhận ca",
    PRESENT: "Có mặt",
    CHECKED_IN: "Đã vào ca",
    COMPLETED: "Hoàn tất",
    LATE: "Đi muộn",
    ABSENT: "Vắng mặt",
  };
  if (loading)
    return (
      <div
        className="kiosk-table-loading"
        role="status"
        aria-label="Đang tải lịch phân ca"
      >
        <div className="workspace-shimmer" />
        <div className="workspace-shimmer" />
        <div className="workspace-shimmer" />
      </div>
    );
  return (
    <section
      aria-label="Lịch phân ca theo tuần"
      className="kiosk-week-schedule"
    >
      <div className="kiosk-schedule-scroll">
        <div className="kiosk-schedule-grid">
          <div className="kiosk-schedule-corner">
            <Calendar size={16} />
            Khung ca
          </div>
          {days.map((day) => (
            <div
              key={day.dateKey}
              className={`kiosk-schedule-day ${day.isToday ? "is-today" : ""}`}
            >
              <strong>{day.label}</strong>
              <span>
                {String(day.date.getDate()).padStart(2, "0")}/
                {String(day.date.getMonth() + 1).padStart(2, "0")}
              </span>
              {day.isToday && <small>Hôm nay</small>}
            </div>
          ))}
          {templates.map((template) => {
            const Icon = template.icon;
            return (
              <Fragment key={template.id}>
                <div className="kiosk-schedule-slot">
                  <Icon size={18} />
                  <strong>{template.name}</strong>
                  <span>
                    {template.start}–{template.end}
                  </span>
                </div>
                {days.map((day) => {
                  const shifts = items.filter(
                    (s) =>
                      s.ngay_lam_viec === day.dateKey &&
                      s.ma_khung_ca === template.id &&
                      s.trang_thai_yeu_cau !== "REJECTED",
                  );
                  return (
                    <div key={day.dateKey} className="kiosk-schedule-cell">
                      {shifts.map((shift) => {
                        const id = shift.ma_ca_lam_viec || shift.id,
                          name = `${shift.staff_name || shift.staff_username}${currentUsername === shift.staff_username ? " (Tôi)" : ""}`;
                        return readOnly ? (
                          <span key={id} className="kiosk-employee-tag">
                            {name}
                          </span>
                        ) : (
                          <Button
                            key={id}
                            type="button"
                            variant="outline"
                            className="kiosk-employee-tag"
                            aria-pressed={selectedId === id}
                            aria-label={`Xem ca ${name}`}
                            title={name}
                            onClick={() => setSelectedId(id)}
                          >
                            {name}
                          </Button>
                        );
                      })}
                      {canAssign(day.dateKey) && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="kiosk-assign-slot"
                          onClick={() => onAssign(day.dateKey, template.id)}
                          aria-label={`${readOnly ? "Đăng ký" : "Phân"} ${template.name} ${day.dateKey}`}
                        >
                          <Plus size={13} />
                          <span>{readOnly ? "Đăng ký" : "Phân ca"}</span>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>
      {!readOnly &&
        (selected ? (
          <div className="kiosk-attendance-panel">
            <header>
              <div>
                <h3>{selected.staff_name || selected.staff_username}</h3>
                <p>
                  {selected.ngay_lam_viec?.split("-").reverse().join("/")} ·{" "}
                  {
                    templates.find(
                      (template) => template.id === selected.ma_khung_ca,
                    )?.name
                  }
                </p>
              </div>
              <StatusBadge
                status={
                  pending
                    ? "PENDING"
                    : selected.trang_thai_cham_cong || "ASSIGNED"
                }
              >
                {pending
                  ? "Chờ duyệt"
                  : attendanceLabels[selected.trang_thai_cham_cong] ||
                    "Chờ nhận ca"}
              </StatusBadge>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Đóng chấm công"
                onClick={() => setSelectedId(null)}
              >
                <X size={15} />
              </Button>
            </header>
            {(selected.ghi_chu || selected.note) && (
              <p>{selected.ghi_chu || selected.note}</p>
            )}
            <div className="kiosk-attendance-actions">
              {pending ? (
                <>
                  <Button
                    type="button"
                    disabled={handlingId === selectedId}
                    onClick={() => onApprove(selectedId)}
                  >
                    <Check size={15} />
                    Duyệt
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    data-intent="danger"
                    disabled={handlingId === selectedId}
                    onClick={() => onReject(selectedId)}
                  >
                    Từ chối
                  </Button>
                </>
              ) : (
                <>
                  <SearchableSelect
                    aria-label={`Chấm công ${selected.staff_name || selected.staff_username}`}
                    value={selected.trang_thai_cham_cong || "ASSIGNED"}
                    onChange={(e) => onAttendance(selectedId, e.target.value)}
                    options={["ASSIGNED", "PRESENT", "LATE", "ABSENT"].map(
                      (value) => ({ value, label: attendanceLabels[value] }),
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    data-intent="danger"
                    onClick={() => {
                      onDelete(selectedId);
                      setSelectedId(null);
                    }}
                  >
                    <Trash2 size={15} />
                    Hủy phân công
                  </Button>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="kiosk-calendar-hint">
            Chọn tên nhân viên trên lịch để duyệt đăng ký hoặc cập nhật chấm
            công.
          </p>
        ))}
    </section>
  );
}

export function KioskScopePicker({
  kiosks = [],
  value,
  onChange,
  allowAll = false,
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState("");
  const chosen = kiosks.find((kiosk) => kiosk.id === value);
  const label =
    chosen?.ten_kiosk || (allowAll && !value ? "Tất cả kiosk" : "Chọn kiosk");
  const normalize = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .trim();
  const matches = kiosks.filter((kiosk) =>
    normalize(`${kiosk.ten_kiosk} ${kiosk.ma_kiosk} ${kiosk.dia_chi}`).includes(
      normalize(query),
    ),
  );
  if (kiosks.length === 1 && !allowAll)
    return (
      <div className="kiosk-scope-single">
        <Store size={18} />
        <span>
          <small>{kiosks[0].ma_kiosk || "Kiosk áp dụng"}</small>
          <strong title={kiosks[0].ten_kiosk}>{kiosks[0].ten_kiosk}</strong>
        </span>
      </div>
    );
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="kiosk-scope-trigger"
          aria-label={`Kiosk áp dụng: ${label}`}
        >
          <Store size={19} />
          <span>
            <small>{chosen?.ma_kiosk || "Kiosk áp dụng"}</small>
            <strong title={label}>{label}</strong>
          </span>
          <ChevronDown size={15} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="kiosk-scope-popover"
        aria-label="Chọn kiosk áp dụng"
      >
        <div className="kiosk-scope-search">
          <Search size={16} />
          <Input
            aria-label="Tìm kiosk"
            placeholder="Tìm tên hoặc mã kiosk…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="kiosk-scope-options">
          {allowAll && !query && (
            <Button
              type="button"
              variant="ghost"
              aria-pressed={!value}
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              <Store size={18} />
              <span>
                <strong>Tất cả kiosk</strong>
                <small>{kiosks.length} điểm bán trong tài khoản</small>
              </span>
              {!value && <Check size={15} />}
            </Button>
          )}
          {matches.map((kiosk) => (
            <Button
              type="button"
              variant="ghost"
              key={kiosk.id}
              aria-pressed={value === kiosk.id}
              onClick={() => {
                onChange(kiosk.id);
                setOpen(false);
                setQuery("");
              }}
            >
              <Store size={18} />
              <span>
                <strong>{kiosk.ten_kiosk}</strong>
                <small>
                  {kiosk.ma_kiosk} ·{" "}
                  {statusLabels[kiosk.trang_thai] || "Chưa cập nhật"}
                </small>
              </span>
              {value === kiosk.id && <Check size={15} />}
            </Button>
          ))}
          {!matches.length && <p>Không tìm thấy kiosk phù hợp.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
