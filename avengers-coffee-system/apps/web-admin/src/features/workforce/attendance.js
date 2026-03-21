const LATE_TOLERANCE_MINUTES = 5
const EARLY_LEAVE_TOLERANCE_MINUTES = 5

export function normalizeAttendanceStatus(value) {
  return String(value || 'ASSIGNED').trim().toUpperCase()
}

export function toDateOnlyLocal(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getMonday(date) {
  const next = new Date(date)
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function parseShiftDateTime(shiftDate, timeValue) {
  if (!shiftDate || !timeValue) return null
  const normalizedTime = String(timeValue).trim().slice(0, 5)
  const parsed = new Date(`${shiftDate}T${normalizedTime}:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parseDateTime(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function calcWorkedHours(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0
  const inTs = new Date(checkIn).getTime()
  const outTs = new Date(checkOut).getTime()
  if (Number.isNaN(inTs) || Number.isNaN(outTs) || outTs <= inTs) return 0
  return Number(((outTs - inTs) / (1000 * 60 * 60)).toFixed(2))
}

export function formatMinutesLabel(minutes) {
  const rounded = Math.max(0, Math.round(Number(minutes || 0)))
  if (!rounded) return '0 phút'
  if (rounded < 60) return `${rounded} phút`
  const hours = Math.floor(rounded / 60)
  const remain = rounded % 60
  return remain ? `${hours} giờ ${remain} phút` : `${hours} giờ`
}

export function getAttendanceInsight(shift, nowInput = new Date()) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput)
  const normalizedStatus = normalizeAttendanceStatus(shift?.trang_thai_cham_cong)
  const scheduledStart = parseShiftDateTime(shift?.ngay_lam_viec, shift?.gio_bat_dau)
  const scheduledEnd = parseShiftDateTime(shift?.ngay_lam_viec, shift?.gio_ket_thuc)
  const checkInDate = parseDateTime(shift?.check_in_at)
  const checkOutDate = parseDateTime(shift?.check_out_at)
  const workedHours = calcWorkedHours(shift?.check_in_at, shift?.check_out_at)
  const lateMinutes = scheduledStart && checkInDate
    ? Math.max(0, Math.round((checkInDate.getTime() - scheduledStart.getTime()) / 60000))
    : 0
  const earlyLeaveMinutes = scheduledEnd && checkOutDate
    ? Math.max(0, Math.round((scheduledEnd.getTime() - checkOutDate.getTime()) / 60000))
    : 0
  const isCheckedIn = Boolean(checkInDate)
  const isCheckedOut = Boolean(checkOutDate)
  const hasActualAttendance = normalizedStatus === 'PRESENT' || isCheckedIn || isCheckedOut
  const isFutureShift = Boolean(scheduledStart && scheduledStart.getTime() > now.getTime())
  const isPastShift = Boolean(scheduledEnd && scheduledEnd.getTime() < now.getTime())
  const isLate = lateMinutes > LATE_TOLERANCE_MINUTES
  const leftEarly = earlyLeaveMinutes > EARLY_LEAVE_TOLERANCE_MINUTES

  let stateKey = 'scheduled'
  let tone = 'scheduled'
  let shortLabel = 'Đã xếp lịch'

  if (normalizedStatus === 'ABSENT') {
    stateKey = 'absent'
    tone = 'absent'
    shortLabel = 'Vắng mặt'
  } else if (isCheckedOut) {
    stateKey = 'completed'
    tone = isLate || leftEarly ? 'warning' : 'good'
    shortLabel = 'Đã check-out'
  } else if (isCheckedIn) {
    stateKey = 'checked-in'
    tone = isLate ? 'warning' : 'active'
    shortLabel = 'Đã check-in'
  } else if (isPastShift && !hasActualAttendance) {
    stateKey = 'missed'
    tone = 'warning'
    shortLabel = 'Chưa chấm công'
  }

  const flags = []
  if (isLate) flags.push(`Đi muộn ${formatMinutesLabel(lateMinutes)}`)
  if (leftEarly) flags.push(`Về sớm ${formatMinutesLabel(earlyLeaveMinutes)}`)
  if (stateKey === 'missed') flags.push('Quá ca nhưng chưa có check-in')
  if (normalizedStatus === 'ABSENT') flags.push('Manager đã đánh dấu vắng')

  return {
    normalizedStatus,
    scheduledStart,
    scheduledEnd,
    checkInDate,
    checkOutDate,
    workedHours,
    lateMinutes,
    earlyLeaveMinutes,
    isCheckedIn,
    isCheckedOut,
    isLate,
    leftEarly,
    isFutureShift,
    isPastShift,
    hasActualAttendance,
    stateKey,
    tone,
    shortLabel,
    flags,
  }
}

export function getAttendanceToneClass(insightOrShift) {
  const insight = insightOrShift?.stateKey ? insightOrShift : getAttendanceInsight(insightOrShift)
  return `workforce-tone workforce-tone--${insight.tone}`
}

function countDistinctDates(items) {
  return new Set(items.map((item) => item.ngay_lam_viec).filter(Boolean)).size
}

export function getAttendanceMetrics(items, nowInput = new Date()) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput)
  const weekStart = getMonday(now)
  const weekEnd = addDays(weekStart, 6)
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const rows = (items || []).map((item) => ({
    item,
    insight: getAttendanceInsight(item, now),
  }))

  const attendedRows = rows.filter(({ insight }) => insight.hasActualAttendance && insight.normalizedStatus !== 'ABSENT')
  const completedRows = rows.filter(({ insight }) => insight.isCheckedOut)
  const checkedInRows = rows.filter(({ insight }) => insight.isCheckedIn && !insight.isCheckedOut)
  const lateRows = rows.filter(({ insight }) => insight.isLate)
  const earlyLeaveRows = rows.filter(({ insight }) => insight.leftEarly)
  const absentRows = rows.filter(({ insight }) => insight.normalizedStatus === 'ABSENT')
  const weekRows = rows.filter(({ item }) => {
    const day = parseDateTime(`${item.ngay_lam_viec}T00:00:00`)
    return day && day.getTime() >= weekStart.getTime() && day.getTime() <= weekEnd.getTime()
  })
  const monthRows = rows.filter(({ item }) => String(item.ngay_lam_viec || '').slice(0, 7) === monthKey)

  return {
    totalShifts: rows.length,
    scheduledHours: Number(rows.reduce((sum, { item }) => sum + Number(item.so_gio_ca || 0), 0).toFixed(2)),
    workedHours: Number(rows.reduce((sum, { insight }) => sum + Number(insight.workedHours || 0), 0).toFixed(2)),
    attendedDaysWeek: countDistinctDates(weekRows.filter(({ insight }) => insight.hasActualAttendance && insight.normalizedStatus !== 'ABSENT').map(({ item }) => item)),
    attendedDaysMonth: countDistinctDates(monthRows.filter(({ insight }) => insight.hasActualAttendance && insight.normalizedStatus !== 'ABSENT').map(({ item }) => item)),
    checkedInCount: checkedInRows.length,
    completedCount: completedRows.length,
    lateCount: lateRows.length,
    earlyLeaveCount: earlyLeaveRows.length,
    absentCount: absentRows.length,
    assignedCount: rows.filter(({ insight }) => insight.normalizedStatus === 'ASSIGNED').length,
    attendanceRate: rows.length ? Math.round((attendedRows.length / rows.length) * 100) : 0,
  }
}