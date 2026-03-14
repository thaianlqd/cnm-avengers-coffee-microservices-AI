import { useMemo, useState } from 'react'
import { WorkforceCalendar, getInitialWeekStart } from './WorkforceCalendar'

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

export function StaffWorkShiftsPanel({ myWorkShiftState, staffUsername }) {
  const [weekStart, setWeekStart] = useState(getInitialWeekStart)
  const [selectedShift, setSelectedShift] = useState(null)

  const summary = useMemo(() => {
    const total = myWorkShiftState.items.length
    const present = myWorkShiftState.items.filter((item) => item.trang_thai_cham_cong === 'PRESENT').length
    const assigned = myWorkShiftState.items.filter((item) => item.trang_thai_cham_cong === 'ASSIGNED').length
    const totalHours = myWorkShiftState.items.reduce((sum, item) => sum + Number(item.so_gio_ca || 0), 0)
    return { total, present, assigned, totalHours }
  }, [myWorkShiftState.items])

  const selectedShiftDetails = selectedShift
    ? myWorkShiftState.items.find((item) => item.ma_ca_lam_viec === selectedShift.ma_ca_lam_viec) || selectedShift
    : null

  return (
    <section className="panel workforce-panel">
      <div className="panel-head">
        <h2>Lịch làm của bạn</h2>
        <span>{staffUsername || 'staff'}</span>
      </div>

      <div className="workforce-summary-grid">
        <article>
          <strong>{summary.total}</strong>
          <span>Tổng ca đã xếp</span>
        </article>
        <article>
          <strong>{summary.assigned}</strong>
          <span>Ca sắp tới</span>
        </article>
        <article>
          <strong>{summary.present}</strong>
          <span>Ca đã chấm công</span>
        </article>
        <article>
          <strong>{summary.totalHours}</strong>
          <span>Tổng giờ đã lên lịch</span>
        </article>
      </div>

      {myWorkShiftState.loading ? <p>Đang tải lịch ca của bạn...</p> : null}
      {myWorkShiftState.error ? <p className="error-text">{myWorkShiftState.error}</p> : null}

      <WorkforceCalendar
        items={myWorkShiftState.items}
        weekStart={weekStart}
        onChangeWeek={(delta) => setWeekStart((prev) => addWeeks(prev, delta))}
        onResetWeek={() => setWeekStart(getInitialWeekStart())}
        onSelectItem={setSelectedShift}
        selectedItemId={selectedShiftDetails?.ma_ca_lam_viec || ''}
        mode="staff"
      />

      <div className="workforce-detail-card">
        {!selectedShiftDetails ? (
          <p>Chọn một ô lịch để xem chi tiết ca làm trong tuần.</p>
        ) : (
          <>
            <div className="workforce-detail-head">
              <div>
                <h3>{selectedShiftDetails.ten_ca}</h3>
                <p>
                  {selectedShiftDetails.ngay_lam_viec} | {selectedShiftDetails.gio_bat_dau} - {selectedShiftDetails.gio_ket_thuc}
                </p>
              </div>
              <span className="workforce-status-pill">{ATTENDANCE_LABEL[selectedShiftDetails.trang_thai_cham_cong] || selectedShiftDetails.trang_thai_cham_cong}</span>
            </div>
            <div className="workforce-detail-meta">
              <span>Số giờ ca: {selectedShiftDetails.so_gio_ca}</span>
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
