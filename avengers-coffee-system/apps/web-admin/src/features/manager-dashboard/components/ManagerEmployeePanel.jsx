import { useMemo, useState } from 'react'
import { formatMinutesLabel, getAttendanceInsight } from '../../workforce/attendance'

function toDateOnlyLocal(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function statusBadgeConfig(statusKey) {
  switch (statusKey) {
    case 'CHECKED_IN':
      return { label: 'Đang trong ca', className: 'employee-status-pill employee-status-pill--present' }
    case 'COMPLETED':
      return { label: 'Đã check-out', className: 'employee-status-pill employee-status-pill--done' }
    case 'LATE':
      return { label: 'Đi muộn / cần chú ý', className: 'employee-status-pill employee-status-pill--late' }
    case 'SCHEDULED':
      return { label: 'Có lịch, chưa vào', className: 'employee-status-pill employee-status-pill--assigned' }
    case 'ABSENT':
      return { label: 'Vắng mặt', className: 'employee-status-pill employee-status-pill--absent' }
    default:
      return { label: 'Nghỉ / không có lịch', className: 'employee-status-pill employee-status-pill--off' }
  }
}

function toShiftLabel(shift) {
  if (!shift) return 'Chưa có lịch hôm nay'
  const shiftName = shift.ten_ca || shift.shift_code || 'Ca làm'
  return `${shiftName}: ${shift.gio_bat_dau || '--:--'} - ${shift.gio_ket_thuc || '--:--'}`
}

export function ManagerEmployeePanel({
  workShiftState,
  workforceUsersState,
  onUpdateAttendance,
  updatingWorkShiftId,
}) {
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  const todayKey = useMemo(() => toDateOnlyLocal(new Date()), [])

  const employeeRows = useMemo(() => {
    const shiftByUser = new Map()

    ;(workShiftState.items || [])
      .filter((item) => item?.ngay_lam_viec === todayKey)
      .forEach((item) => {
        const key = item.staff_username || item.staff_name || ''
        if (!key) return
        if (!shiftByUser.has(key)) shiftByUser.set(key, [])
        shiftByUser.get(key).push(item)
      })

    shiftByUser.forEach((shifts) => {
      shifts.sort((a, b) => String(a.gio_bat_dau || '').localeCompare(String(b.gio_bat_dau || '')))
    })

    return (workforceUsersState.items || []).map((user) => {
      const username = user.ten_dang_nhap || user.username || ''
      const shiftsToday = shiftByUser.get(username) || []

      const assignedShift = shiftsToday.find((item) => item.trang_thai_cham_cong === 'ASSIGNED') || null
      const absentShift = shiftsToday.find((item) => item.trang_thai_cham_cong === 'ABSENT') || null
      const detailedShift = shiftsToday.find((item) => {
        const insight = getAttendanceInsight(item)
        return insight.isCheckedIn || insight.isCheckedOut || insight.isLate || insight.leftEarly
      }) || null

      let statusKey = 'OFF'
      let primaryShift = detailedShift || shiftsToday[0] || null
      const primaryInsight = primaryShift ? getAttendanceInsight(primaryShift) : null

      if (primaryInsight?.isLate || primaryInsight?.leftEarly) {
        statusKey = 'LATE'
      } else if (primaryInsight?.isCheckedOut) {
        statusKey = 'COMPLETED'
      } else if (primaryInsight?.isCheckedIn) {
        statusKey = 'CHECKED_IN'
      } else if (assignedShift) {
        statusKey = 'SCHEDULED'
        primaryShift = assignedShift
      } else if (absentShift) {
        statusKey = 'ABSENT'
        primaryShift = absentShift
      }

      return {
        user,
        username,
        fullName: user.ho_ten || username || 'Nhân viên',
        email: user.email || 'Chưa cập nhật',
        phone: user.so_dien_thoai || user.soDienThoai || 'Chưa cập nhật',
        branchName: user.co_so_ten || user.coSoTen || 'Đang cập nhật',
        role: user.vai_tro || user.vaiTro || 'STAFF',
        statusKey,
        statusMeta: statusBadgeConfig(statusKey),
        shiftsToday,
        primaryShift,
        primaryInsight,
      }
    })
  }, [todayKey, workShiftState.items, workforceUsersState.items])

  const filteredRows = useMemo(() => {
    const normalizedKeyword = normalizeText(keyword)

    return employeeRows.filter((row) => {
      if (statusFilter !== 'ALL' && row.statusKey !== statusFilter) return false

      if (!normalizedKeyword) return true

      const haystack = normalizeText(
        [
          row.fullName,
          row.username,
          row.email,
          row.phone,
          row.branchName,
        ].join(' '),
      )

      return haystack.includes(normalizedKeyword)
    })
  }, [employeeRows, keyword, statusFilter])

  const summary = useMemo(() => {
    return employeeRows.reduce(
      (acc, row) => {
        acc.total += 1
        acc[row.statusKey] += 1
        return acc
      },
      { total: 0, CHECKED_IN: 0, COMPLETED: 0, LATE: 0, SCHEDULED: 0, ABSENT: 0, OFF: 0 },
    )
  }, [employeeRows])

  return (
    <section className="panel employee-panel">
      <div className="panel-head">
        <h2>Quản lý nhân viên</h2>
        <span>Theo dõi thông tin nhân sự và trạng thái vào ca trong ngày</span>
      </div>

      <div className="employee-kpi-grid">
        <article>
          <p>Tổng nhân viên</p>
          <strong>{summary.total}</strong>
        </article>
        <article>
          <p>Đang vào ca</p>
          <strong>{summary.CHECKED_IN}</strong>
        </article>
        <article>
          <p>Đã check-out</p>
          <strong>{summary.COMPLETED}</strong>
        </article>
        <article>
          <p>Đi muộn / về sớm</p>
          <strong>{summary.LATE}</strong>
        </article>
        <article>
          <p>Có lịch chưa vào</p>
          <strong>{summary.SCHEDULED}</strong>
        </article>
        <article>
          <p>Vắng mặt</p>
          <strong>{summary.ABSENT}</strong>
        </article>
      </div>

      <div className="employee-filter-row">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Tìm theo tên, username, email, số điện thoại"
        />

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">Tất cả trạng thái</option>
          <option value="CHECKED_IN">Đang vào ca</option>
          <option value="COMPLETED">Đã check-out</option>
          <option value="LATE">Đi muộn / về sớm</option>
          <option value="SCHEDULED">Có lịch chưa vào</option>
          <option value="ABSENT">Vắng mặt</option>
          <option value="OFF">Nghỉ / không có lịch</option>
        </select>
      </div>

      {workforceUsersState.error ? <p className="error-text">{workforceUsersState.error}</p> : null}
      {workShiftState.error ? <p className="error-text">{workShiftState.error}</p> : null}
      {workforceUsersState.loading || workShiftState.loading ? <p>Đang tải dữ liệu nhân sự...</p> : null}

      <div className="employee-list">
        {!workforceUsersState.loading && !filteredRows.length ? (
          <p className="employee-empty">Không có nhân viên nào phù hợp với bộ lọc.</p>
        ) : null}

        {filteredRows.map((row) => (
          <article key={row.user.ma_nguoi_dung || row.username} className="employee-card">
            <div className="employee-card-head">
              <div>
                <h3>{row.fullName}</h3>
                <p>@{row.username || 'unknown'}</p>
              </div>
              <span className={row.statusMeta.className}>{row.statusMeta.label}</span>
            </div>

            <div className="employee-meta-grid">
              <span>Email: {row.email}</span>
              <span>SDT: {row.phone}</span>
              <span>Vai trò: {row.role}</span>
              <span>Cơ sở: {row.branchName}</span>
            </div>

            <div className="employee-shift-box">
              <strong>{toShiftLabel(row.primaryShift)}</strong>
              <small>Số ca hôm nay: {row.shiftsToday.length}</small>
            </div>

            {row.primaryInsight ? (
              <div className="workforce-flag-row">
                {row.primaryInsight.flags.length ? row.primaryInsight.flags.map((flag) => (
                  <span key={flag} className="workforce-flag-pill workforce-flag-pill--warning">{flag}</span>
                )) : <span className="workforce-flag-pill workforce-flag-pill--good">Chấm công ổn định</span>}
              </div>
            ) : null}

            {row.primaryShift ? (
              <div className="employee-meta-grid employee-meta-grid--attendance">
                <span>Check-in: {row.primaryShift.check_in_at ? new Date(row.primaryShift.check_in_at).toLocaleString('vi-VN') : 'Chưa có'}</span>
                <span>Check-out: {row.primaryShift.check_out_at ? new Date(row.primaryShift.check_out_at).toLocaleString('vi-VN') : 'Chưa có'}</span>
                <span>
                  Giờ thực tế: {row.primaryInsight?.workedHours || 0}
                  {row.primaryInsight?.isLate ? ` • Muộn ${formatMinutesLabel(row.primaryInsight.lateMinutes)}` : ''}
                  {row.primaryInsight?.leftEarly ? ` • Về sớm ${formatMinutesLabel(row.primaryInsight.earlyLeaveMinutes)}` : ''}
                </span>
              </div>
            ) : null}

            {row.primaryShift ? (
              <div className="employee-quick-actions">
                <button
                  type="button"
                  onClick={() => onUpdateAttendance(row.primaryShift.ma_ca_lam_viec, { attendance_status: 'PRESENT', check_in_at: new Date().toISOString() })}
                  disabled={updatingWorkShiftId === row.primaryShift.ma_ca_lam_viec}
                >
                  Check-in ngay
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onUpdateAttendance(row.primaryShift.ma_ca_lam_viec, { attendance_status: 'PRESENT', check_out_at: new Date().toISOString() })}
                  disabled={updatingWorkShiftId === row.primaryShift.ma_ca_lam_viec}
                >
                  Check-out ngay
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => onUpdateAttendance(row.primaryShift.ma_ca_lam_viec, { attendance_status: 'ABSENT' })}
                  disabled={updatingWorkShiftId === row.primaryShift.ma_ca_lam_viec}
                >
                  Danh dau vang
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
