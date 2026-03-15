import { useMemo, useState } from 'react'

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
    case 'IN_SHIFT':
      return { label: 'Dang vao ca', className: 'employee-status-pill employee-status-pill--present' }
    case 'SCHEDULED':
      return { label: 'Co lich, chua vao', className: 'employee-status-pill employee-status-pill--assigned' }
    case 'ABSENT':
      return { label: 'Vang mat', className: 'employee-status-pill employee-status-pill--absent' }
    default:
      return { label: 'Nghi / khong co lich', className: 'employee-status-pill employee-status-pill--off' }
  }
}

function toShiftLabel(shift) {
  if (!shift) return 'Chua co lich hom nay'
  const shiftName = shift.ten_ca || shift.shift_code || 'Ca lam'
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

      const presentShift = shiftsToday.find((item) => item.trang_thai_cham_cong === 'PRESENT') || null
      const assignedShift = shiftsToday.find((item) => item.trang_thai_cham_cong === 'ASSIGNED') || null
      const absentShift = shiftsToday.find((item) => item.trang_thai_cham_cong === 'ABSENT') || null

      let statusKey = 'OFF'
      let primaryShift = shiftsToday[0] || null
      if (presentShift) {
        statusKey = 'IN_SHIFT'
        primaryShift = presentShift
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
        fullName: user.ho_ten || username || 'Nhan vien',
        email: user.email || 'Chua cap nhat',
        phone: user.so_dien_thoai || user.soDienThoai || 'Chua cap nhat',
        branchName: user.co_so_ten || user.coSoTen || 'Dang cap nhat',
        role: user.vai_tro || user.vaiTro || 'STAFF',
        statusKey,
        statusMeta: statusBadgeConfig(statusKey),
        shiftsToday,
        primaryShift,
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
      { total: 0, IN_SHIFT: 0, SCHEDULED: 0, ABSENT: 0, OFF: 0 },
    )
  }, [employeeRows])

  return (
    <section className="panel employee-panel">
      <div className="panel-head">
        <h2>Quan ly nhan vien</h2>
        <span>Theo doi thong tin nhan su va trang thai vao ca trong ngay</span>
      </div>

      <div className="employee-kpi-grid">
        <article>
          <p>Tong nhan vien</p>
          <strong>{summary.total}</strong>
        </article>
        <article>
          <p>Dang vao ca</p>
          <strong>{summary.IN_SHIFT}</strong>
        </article>
        <article>
          <p>Co lich chua vao</p>
          <strong>{summary.SCHEDULED}</strong>
        </article>
        <article>
          <p>Vang mat</p>
          <strong>{summary.ABSENT}</strong>
        </article>
      </div>

      <div className="employee-filter-row">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Tim theo ten, username, email, so dien thoai"
        />

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">Tat ca trang thai</option>
          <option value="IN_SHIFT">Dang vao ca</option>
          <option value="SCHEDULED">Co lich chua vao</option>
          <option value="ABSENT">Vang mat</option>
          <option value="OFF">Nghi / khong co lich</option>
        </select>
      </div>

      {workforceUsersState.error ? <p className="error-text">{workforceUsersState.error}</p> : null}
      {workShiftState.error ? <p className="error-text">{workShiftState.error}</p> : null}
      {workforceUsersState.loading || workShiftState.loading ? <p>Dang tai du lieu nhan su...</p> : null}

      <div className="employee-list">
        {!workforceUsersState.loading && !filteredRows.length ? (
          <p className="employee-empty">Khong co nhan vien nao phu hop voi bo loc.</p>
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
              <span>Vai tro: {row.role}</span>
              <span>Co so: {row.branchName}</span>
            </div>

            <div className="employee-shift-box">
              <strong>{toShiftLabel(row.primaryShift)}</strong>
              <small>So ca hom nay: {row.shiftsToday.length}</small>
            </div>

            {row.primaryShift ? (
              <div className="employee-quick-actions">
                <button
                  type="button"
                  onClick={() => onUpdateAttendance(row.primaryShift.ma_ca_lam_viec, { attendance_status: 'PRESENT' })}
                  disabled={updatingWorkShiftId === row.primaryShift.ma_ca_lam_viec}
                >
                  Cho vao ca
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
