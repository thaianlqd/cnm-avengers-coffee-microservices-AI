export function storeOpenState(branch, now = new Date()) {
  if (['INACTIVE', 'CLOSED', 'DISABLED'].includes(String(branch.trang_thai || branch.status || '').toUpperCase())) return false
  const time = value => { const match = /^(\d{1,2}):(\d{2})/.exec(String(value || '')); return match && Number(match[1]) <= 23 && Number(match[2]) < 60 ? Number(match[1]) * 60 + Number(match[2]) : null }
  const open = time(branch.gio_mo_cua), close = time(branch.gio_dong_cua)
  if (open == null || close == null) return null
  const current = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
  const minute = time(current)
  return open === close ? true : open < close ? minute >= open && minute < close : minute >= open || minute < close
}
