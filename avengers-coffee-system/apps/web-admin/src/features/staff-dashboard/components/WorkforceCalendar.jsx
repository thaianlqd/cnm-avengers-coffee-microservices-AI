import { Fragment } from 'react'
import { getAttendanceInsight, getAttendanceToneClass, getMonday, toDateOnlyLocal } from '../../workforce/attendance'

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
const SLOT_ORDER = ['SANG', 'CHIEU', 'TOI']
const SLOT_LABEL = {
  SANG: 'Sáng',
  CHIEU: 'Chiều',
  TOI: 'Tối',
}
function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function formatDayHeader(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

function formatWeekRange(start) {
  const end = addDays(start, 6)
  const startText = `${String(start.getDate()).padStart(2, '0')}/${String(start.getMonth() + 1).padStart(2, '0')}`
  const endText = `${String(end.getDate()).padStart(2, '0')}/${String(end.getMonth() + 1).padStart(2, '0')}`
  return `${startText} - ${endText}/${end.getFullYear()}`
}

export function WorkforceCalendar({
  items,
  weekStart,
  onChangeWeek,
  onResetWeek,
  onSelectItem,
  selectedItemId,
  mode = 'staff',
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))

  return (
    <section className="workforce-calendar-card">
      <div className="workforce-calendar-toolbar">
        <div>
          <h3>Lịch làm theo tuần</h3>
          <p>{formatWeekRange(weekStart)}</p>
        </div>
        <div className="workforce-calendar-actions">
          <button type="button" className="pg-btn" onClick={() => onChangeWeek(-1)}>
            Tuần trước
          </button>
          <button type="button" className="pg-btn" onClick={onResetWeek}>
            Hiện tại
          </button>
          <button type="button" className="pg-btn" onClick={() => onChangeWeek(1)}>
            Tuần sau
          </button>
        </div>
      </div>

      <div className="workforce-calendar-grid">
        <div className="workforce-grid-corner">Ca làm</div>
        {days.map((day, index) => (
          <div key={toDateOnlyLocal(day)} className="workforce-grid-day-head">
            <strong>{DAY_LABELS[index]}</strong>
            <span>{formatDayHeader(day)}</span>
          </div>
        ))}

        {SLOT_ORDER.map((slot) => (
          <Fragment key={slot}>
            <div className="workforce-grid-slot-label">
              <strong>{SLOT_LABEL[slot]}</strong>
              <span>{slot === 'SANG' ? '07:00 - 12:00/14:00' : slot === 'CHIEU' ? '12:00/14:00 - 17:00/22:00' : '17:00 - 22:00'}</span>
            </div>
            {days.map((day) => {
              const dayKey = toDateOnlyLocal(day)
              const cellItems = items.filter((item) => item.ngay_lam_viec === dayKey && item.ma_khung_ca === slot)

              return (
                <div key={`${slot}-${dayKey}`} className="workforce-grid-cell">
                  {cellItems.length === 0 ? <span className="workforce-empty-slot">Trống</span> : null}
                  {cellItems.map((item) => {
                    const insight = getAttendanceInsight(item)
                    return (
                      <button
                        key={item.ma_ca_lam_viec}
                        type="button"
                        className={[
                          'workforce-shift-chip',
                          getAttendanceToneClass(insight),
                          selectedItemId === item.ma_ca_lam_viec ? 'active' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => onSelectItem?.(item)}
                      >
                        <strong>{mode === 'manager' ? item.staff_name || item.staff_username : item.ten_ca}</strong>
                        <span>{item.gio_bat_dau} - {item.gio_ket_thuc}</span>
                        <small>{insight.shortLabel}</small>
                        {insight.flags.length ? <em>{insight.flags[0]}</em> : null}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </section>
  )
}

export function getInitialWeekStart() {
  return getMonday(new Date())
}
