import { useEffect, useMemo, useState } from 'react'
import { WorkforceCalendar, getInitialWeekStart } from '../../staff-dashboard/components/WorkforceCalendar'

const SHIFT_TEMPLATES = [
  { id: '2_CA', label: '2 ca/ngày' },
  { id: '3_CA', label: '3 ca/ngày' },
]

const SHIFT_CODES = [
  { id: 'SANG', label: 'Ca sáng' },
  { id: 'CHIEU', label: 'Ca chiều' },
  { id: 'TOI', label: 'Ca tối' },
]

const ATTENDANCE_LABEL = {
  ASSIGNED: 'Đã xếp lịch',
  PRESENT: 'Có mặt',
  ABSENT: 'Vắng mặt',
}

function addWeeks(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount * 7)
  return next
}

function toDateOnly(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function ManagerWorkforcePanel({
  workShiftState,
  workforceUsersState,
  workShiftForm,
  setWorkShiftForm,
  creatingWorkShift,
  onCreateWorkShift,
  onUpdateAttendance,
  onDeleteWorkShift,
  updatingWorkShiftId,
}) {
  const [weekStart, setWeekStart] = useState(getInitialWeekStart)
  const [selectedStaffFilter, setSelectedStaffFilter] = useState('ALL')
  const [selectedShift, setSelectedShift] = useState(null)

  const staffOptions = useMemo(
    () => workforceUsersState.items.filter((item) => item.vai_tro === 'STAFF'),
    [workforceUsersState.items],
  )

  useEffect(() => {
    if (workShiftForm.staff_username || !staffOptions.length) return
    const first = staffOptions[0]
    setWorkShiftForm((prev) => ({
      ...prev,
      staff_username: first.ten_dang_nhap,
      staff_name: first.ho_ten || first.ten_dang_nhap,
    }))
  }, [staffOptions, workShiftForm.staff_username, setWorkShiftForm])

  const calendarItems = useMemo(() => {
    return workShiftState.items.filter((item) => {
      if (selectedStaffFilter === 'ALL') return true
      return item.staff_username === selectedStaffFilter
    })
  }, [workShiftState.items, selectedStaffFilter])

  const selectedShiftDetails = selectedShift
    ? workShiftState.items.find((item) => item.ma_ca_lam_viec === selectedShift.ma_ca_lam_viec) || selectedShift
    : null

  const canSelectNightShift = workShiftForm.shift_template === '3_CA'

  return (
    <section className="panel workforce-panel workforce-panel--manager">
      <div className="panel-head">
        <h2>Quản lý lịch làm nhân viên</h2>
        <span>Chia ca theo tuần, chọn nhân viên bằng danh sách có sẵn</span>
      </div>

      <form className="workforce-form" onSubmit={onCreateWorkShift}>
        <div className="workforce-form-topbar">
          <label>
            Nhân viên
            <select
              value={workShiftForm.staff_username}
              onChange={(e) => {
                const nextUser = staffOptions.find((item) => item.ten_dang_nhap === e.target.value)
                setWorkShiftForm((prev) => ({
                  ...prev,
                  staff_username: e.target.value,
                  staff_name: nextUser?.ho_ten || e.target.value,
                }))
              }}
              disabled={!staffOptions.length}
            >
              {!staffOptions.length ? <option value="">Chưa có nhân viên</option> : null}
              {staffOptions.map((item) => (
                <option key={item.ma_nguoi_dung} value={item.ten_dang_nhap}>
                  {item.ho_ten || item.ten_dang_nhap}
                </option>
              ))}
            </select>
          </label>

          <label>
            Ngày làm
            <input
              type="date"
              value={workShiftForm.shift_date}
              onChange={(e) => setWorkShiftForm((prev) => ({ ...prev, shift_date: e.target.value }))}
              required
            />
          </label>

          <label>
            Mẫu chia ca
            <select
              value={workShiftForm.shift_template}
              onChange={(e) =>
                setWorkShiftForm((prev) => ({
                  ...prev,
                  shift_template: e.target.value,
                  shift_code: e.target.value === '2_CA' && prev.shift_code === 'TOI' ? 'CHIEU' : prev.shift_code,
                }))
              }
            >
              {SHIFT_TEMPLATES.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Khung ca
            <select
              value={workShiftForm.shift_code}
              onChange={(e) => setWorkShiftForm((prev) => ({ ...prev, shift_code: e.target.value }))}
            >
              {SHIFT_CODES.map((item) => {
                if (item.id === 'TOI' && !canSelectNightShift) return null
                return (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                )
              })}
            </select>
          </label>
        </div>

        <div className="workforce-form-bottombar">
          <label className="workforce-note-field">
            Ghi chú
            <input
              value={workShiftForm.note}
              onChange={(e) => setWorkShiftForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Ví dụ: hỗ trợ quầy mang đi"
            />
          </label>
          <button type="submit" disabled={creatingWorkShift || !workShiftForm.staff_username}>
            {creatingWorkShift ? 'Đang tạo lịch...' : 'Thêm lịch làm'}
          </button>
        </div>
      </form>

      <div className="workforce-filter-row workforce-filter-row--calendar">
        <label>
          Xem lịch theo nhân viên
          <select value={selectedStaffFilter} onChange={(e) => setSelectedStaffFilter(e.target.value)}>
            <option value="ALL">Tất cả nhân viên</option>
            {staffOptions.map((item) => (
              <option key={item.ma_nguoi_dung} value={item.ten_dang_nhap}>
                {item.ho_ten || item.ten_dang_nhap}
              </option>
            ))}
          </select>
        </label>
        <small>{calendarItems.length} ca đã xếp</small>
      </div>

      {workforceUsersState.error ? <p className="error-text">{workforceUsersState.error}</p> : null}
      {workShiftState.error ? <p className="error-text">{workShiftState.error}</p> : null}
      {workShiftState.loading ? <p>Đang tải lịch làm việc...</p> : null}

      <WorkforceCalendar
        items={calendarItems}
        weekStart={weekStart}
        onChangeWeek={(delta) => setWeekStart((prev) => addWeeks(prev, delta))}
        onResetWeek={() => setWeekStart(getInitialWeekStart())}
        onSelectItem={setSelectedShift}
        selectedItemId={selectedShiftDetails?.ma_ca_lam_viec || ''}
        mode="manager"
      />

      <div className="workforce-detail-card">
        {!selectedShiftDetails ? (
          <p>Chọn một ô lịch để xem chi tiết ca, cập nhật chấm công hoặc xóa lịch.</p>
        ) : (
          <>
            <div className="workforce-detail-head">
              <div>
                <h3>{selectedShiftDetails.staff_name || selectedShiftDetails.staff_username}</h3>
                <p>
                  {selectedShiftDetails.ngay_lam_viec} | {selectedShiftDetails.ten_ca} ({selectedShiftDetails.gio_bat_dau} - {selectedShiftDetails.gio_ket_thuc})
                </p>
              </div>
              <span className="workforce-status-pill">{ATTENDANCE_LABEL[selectedShiftDetails.trang_thai_cham_cong] || selectedShiftDetails.trang_thai_cham_cong}</span>
            </div>

            <div className="workforce-detail-actions">
              <label>
                Chấm công
                <select
                  value={selectedShiftDetails.trang_thai_cham_cong}
                  onChange={(e) =>
                    onUpdateAttendance(selectedShiftDetails.ma_ca_lam_viec, {
                      attendance_status: e.target.value,
                    })
                  }
                  disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                >
                  <option value="ASSIGNED">Đã xếp lịch</option>
                  <option value="PRESENT">Có mặt</option>
                  <option value="ABSENT">Vắng mặt</option>
                </select>
              </label>

              <button
                type="button"
                className="secondary"
                onClick={() => onDeleteWorkShift(selectedShiftDetails.ma_ca_lam_viec)}
                disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
              >
                Xóa lịch
              </button>
            </div>

            <div className="workforce-detail-meta">
              <span>Số giờ ca: {selectedShiftDetails.so_gio_ca}</span>
              <span>Quản lý tạo: {selectedShiftDetails.manager_username || 'N/A'}</span>
              <span>Check-in: {selectedShiftDetails.check_in_at ? new Date(selectedShiftDetails.check_in_at).toLocaleString('vi-VN') : 'Chưa có'}</span>
              <span>Check-out: {selectedShiftDetails.check_out_at ? new Date(selectedShiftDetails.check_out_at).toLocaleString('vi-VN') : 'Chưa có'}</span>
            </div>

            {selectedShiftDetails.note ? <p className="workforce-detail-note">Ghi chú: {selectedShiftDetails.note}</p> : null}
          </>
        )}
      </div>
    </section>
  )
}
