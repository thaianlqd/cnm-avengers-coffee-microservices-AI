import React, { useId, useRef, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Textarea } from '../../components/ui/textarea'
import { Table } from '../../components/ui/table'
import { PaginatedList } from '../../components/console/CompactPagination'
import CurrencyInput from '../../components/console/CurrencyInput'
import StatusBadge from '../../components/console/StatusBadge'
import { Store, Calendar, ChevronLeft, ChevronRight, RefreshCw, Send, Trash2, Clock, Key, Edit3, ArrowRight } from '../../components/console/WorkspaceIcons'
import { ChangePasswordModal, UserProfileModal } from '../shared/components/UserProfileModals'
import { KioskScheduleGrid } from './KioskWorkspaceComponents'
import { KioskTableLoading } from './KioskShiftPanel'
import { kioskMoney } from './kioskPosModel'
import './KioskStaffWorkspace.css'

const shortDate = value => String(value || '').slice(0, 10).split('-').reverse().join('/')
const dateTime = value => value ? new Date(value).toLocaleString('vi-VN', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric' }) : '—'
const requestLabels = { PENDING:'Chờ duyệt', APPROVED:'Đã duyệt', REJECTED:'Từ chối' }
const shiftLabels = { OPEN:'Đang mở', CLOSE_PENDING:'Chờ đối soát', CLOSED:'Đã xác nhận', FORCE_CLOSED:'Đã đóng', CLOSE_REJECTED:'Cần kiểm tra lại' }

export function KioskStaffHeader({ name, code, loading, active }) {
  return <div className="kiosk-staff-header-location" aria-label="Kiosk đang làm việc" title={name}>
    <Store size={18} aria-hidden="true" /><span><small>{code || 'Chưa phân công kiosk'}{loading ? ' · Đang tải' : active ? <> · <span>Đang hoạt động</span></> : ''}</small><strong>{name || 'Chưa phân công kiosk'}</strong></span>
  </div>
}

export function KioskStaffSchedulePanel({ nextWeek, templates, form, onFormChange, onSubmit, submitting, requestError, requests = [], requestsLoading, onDelete, deletingId, days, items, calendarLoading, weekOffset, onWeekChange, onRefresh, onQuickSelect, username }) {
  const registration = useRef(null)
  const noteId = useId()
  const selectedTemplate = templates.find(item => item.id === form.shift_code)
  const duplicate = requests.some(item => item.ngay_lam_viec === form.shift_date && item.ma_khung_ca === form.shift_code && ['PENDING','APPROVED'].includes(item.trang_thai_yeu_cau))
  const sortedRequests = [...requests].sort((a,b) => String(b.ngay_lam_viec).localeCompare(String(a.ngay_lam_viec)))
  return <div className="kiosk-staff-schedule">
    <div className="kiosk-staff-registration-layout">
      <section className="kiosk-staff-registration" ref={registration} aria-labelledby={`${noteId}-title`}>
        <header className="kiosk-staff-panel-heading"><div><h2 id={`${noteId}-title`}>Đăng ký ca tuần tới</h2><p>{nextWeek.nextMondayFmt} – {nextWeek.nextSundayFmt} · Hạn đăng ký: 23:59 Thứ 7.</p></div></header>
        {nextWeek.isSunday && <p className="kiosk-staff-inline-note" role="status">Đã hết hạn đăng ký tuần tới. Liên hệ quản lý nếu cần bổ sung ca.</p>}
        <form onSubmit={onSubmit} className="kiosk-staff-register-form" aria-label="Đăng ký ca làm việc">
          <fieldset disabled={submitting || nextWeek.isSunday}><legend>Ngày làm việc</legend><div className="kiosk-staff-date-options">{nextWeek.nextDays.map(day => <button type="button" key={day.dateKey} aria-label={`${day.label} ${day.display}`} aria-pressed={form.shift_date === day.dateKey} onClick={() => onFormChange({ ...form, shift_date:day.dateKey })}><span>{day.label}</span><strong>{day.display}</strong></button>)}</div></fieldset>
          <fieldset disabled={submitting || nextWeek.isSunday}><legend>Khung ca</legend><div className="kiosk-staff-slot-options">{templates.map(slot => <label key={slot.id} className={form.shift_code === slot.id ? 'is-selected' : ''}><input type="radio" aria-label={`${slot.name} ${slot.start}–${slot.end}`} name={`${noteId}-slot`} value={slot.id} checked={form.shift_code === slot.id} onChange={() => onFormChange({ ...form, shift_code:slot.id })} /><span><strong>{slot.name}</strong><small>{slot.start}–{slot.end}</small></span></label>)}</div></fieldset>
          <div className="kiosk-staff-field"><label htmlFor={noteId}>Ghi chú <span>(không bắt buộc)</span></label><Textarea id={noteId} rows={2} maxLength={500} value={form.note} disabled={submitting || nextWeek.isSunday} onChange={event => onFormChange({ ...form,note:event.target.value })} placeholder="Nhắn quản lý về ca muốn đăng ký…" /></div>
          {requestError && <p className="workspace-form-error" role="alert">{requestError}</p>}
          {duplicate && <p className="kiosk-staff-inline-note" role="status">Bạn đã đăng ký {selectedTemplate?.name.toLowerCase()} ngày {shortDate(form.shift_date)}. Xem trạng thái ở yêu cầu của tôi.</p>}
          <footer className="kiosk-staff-form-footer"><span>Quản lý kiosk sẽ xét duyệt yêu cầu.</span><Button type="submit" variant="default" disabled={submitting || nextWeek.isSunday || duplicate}><Send size={16} />{submitting ? 'Đang gửi…' : 'Gửi đăng ký'}</Button></footer>
        </form>
      </section>
      <section className="kiosk-staff-requests" aria-label="Yêu cầu đăng ký của tôi">
        <header className="kiosk-staff-panel-heading"><div><h2>Yêu cầu của tôi</h2><p>{requests.length} ca đã đăng ký</p></div></header>
        {requestsLoading ? <KioskTableLoading label="Đang tải yêu cầu đăng ký" rows={3} /> : !sortedRequests.length ? <div className="kiosk-staff-empty"><Calendar size={26} /><p>Bạn chưa có đăng ký ca.</p></div> : <div className="kiosk-staff-request-list"><PaginatedList items={sortedRequests} pageSize={4} resetKey={requests.length}>{request => {
          const slot = templates.find(item => item.id === request.ma_khung_ca)
          const id = request.ma_ca_lam_viec || request.id
          return <article key={id} className="kiosk-staff-request"><div><strong>{shortDate(request.ngay_lam_viec)} · {request.ten_ca || slot?.name}</strong><small>{String(request.gio_bat_dau || slot?.start || '').slice(0,5)}–{String(request.gio_ket_thuc || slot?.end || '').slice(0,5)}</small></div><StatusBadge status={request.trang_thai_yeu_cau}>{requestLabels[request.trang_thai_yeu_cau] || 'Đã phân công'}</StatusBadge>{request.trang_thai_yeu_cau === 'PENDING' && <Button variant="ghost" type="button" size="icon" data-intent="danger" disabled={!!deletingId} aria-label={`Hủy đăng ký ${shortDate(request.ngay_lam_viec)} ${request.ten_ca || slot?.name}`} onClick={() => onDelete(id)}><Trash2 size={15} /></Button>}{(request.ghi_chu_duyet || request.note || request.ghi_chu) && <p>{request.ghi_chu_duyet || request.note || request.ghi_chu}</p>}</article>
        }}</PaginatedList></div>}
      </section>
    </div>
    <section className="kiosk-staff-calendar" aria-label="Lịch làm việc tại kiosk">
      <header className="kiosk-staff-panel-heading"><div><h2>Lịch làm việc</h2><p>{shortDate(days[0]?.dateKey)} – {shortDate(days[6]?.dateKey)} · Ca của bạn có nhãn “Tôi”.</p></div><div className="kiosk-staff-calendar-navigation"><Button variant="outline" size="icon" aria-label="Tuần trước" onClick={() => onWeekChange(weekOffset - 1)}><ChevronLeft size={16} /></Button><Button variant={weekOffset === 0 ? 'default' : 'outline'} onClick={() => onWeekChange(0)}>Tuần này</Button><Button variant={weekOffset === 1 ? 'default' : 'outline'} onClick={() => onWeekChange(1)}>Tuần đăng ký</Button><Button variant="outline" size="icon" aria-label="Tuần sau" onClick={() => onWeekChange(weekOffset + 1)}><ChevronRight size={16} /></Button><Button variant="ghost" size="icon" aria-label="Tải lại lịch làm việc" disabled={calendarLoading} onClick={onRefresh}><RefreshCw size={16} /></Button></div></header>
      <KioskScheduleGrid days={days} templates={templates} items={items} loading={calendarLoading} readOnly currentUsername={username} canAssign={day => !nextWeek.isSunday && day >= nextWeek.nextMondayStr && day <= nextWeek.nextSundayStr} onAssign={(day,slot) => { onQuickSelect(day,slot); registration.current?.scrollIntoView({ block:'start',behavior:'smooth' }) }} />
    </section>
  </div>
}

export function KioskStaffShiftManagement({ active, loading, loadError, history = [], historyLoading, historyError, username, cashOpen, onCashOpen, cashClose, onCashClose, note, onNote, busy, error, onOpen, onClose, onRefresh, onPos }) {
  const inputId = useId()
  const shift = active?.has_open_shift ? active.active_shift : null
  const ownShift = !shift?.staff_username || shift.staff_username === username
  const expected = Number(active?.live_stats?.expected_cash ?? shift?.tien_mat_ky_vong ?? shift?.tien_dau_ca ?? 0)
  const counted = cashClose !== '' && Number.isFinite(Number(cashClose))
  const difference = Number(cashClose || 0) - expected
  const canSubmit = shift ? ownShift && counted : cashOpen !== '' && Number.isFinite(Number(cashOpen))
  return <div className="kiosk-staff-shift-management">
    {loadError && <div className="kiosk-staff-load-error" role="alert"><p>{loadError}</p><Button variant="outline" disabled={loading} onClick={onRefresh}>Thử lại</Button></div>}
    {loading ? <KioskTableLoading rows={3} label="Đang tải ca làm việc" /> : !loadError && <section className="kiosk-staff-shift-workbench">
      <div className="kiosk-staff-counting"><header className="kiosk-staff-panel-heading"><div><h2>{shift ? 'Kiểm đếm & chốt ca' : 'Mở ca mới'}</h2><p>{shift ? 'Nhập số tiền mặt thực đếm trong két để đối chiếu.' : 'Kiểm đếm tiền đầu ca để bắt đầu bán hàng.'}</p></div><StatusBadge status={shift ? 'ACTIVE' : 'INACTIVE'}>{shift ? 'Ca đang mở' : 'Chưa mở ca'}</StatusBadge></header>
        {!ownShift ? <div className="kiosk-staff-inline-note">Ca đang do {shift.staff_name || shift.staff_username} phụ trách. Người mở ca hoặc quản lý kiosk thực hiện chốt ca.</div> : <form aria-label={shift ? 'Kiểm đếm và chốt ca' : 'Mở ca mới'} onSubmit={shift ? onClose : onOpen} className="kiosk-staff-count-form">
          <div className="kiosk-staff-field"><label htmlFor={inputId}>{shift ? 'Tiền mặt thực tế cuối ca' : 'Tiền mặt đầu ca'} <span>(VNĐ)</span></label><CurrencyInput id={inputId} required allowZero value={shift ? cashClose : cashOpen} disabled={busy} onChange={event => (shift ? onCashClose : onCashOpen)(event.target.value)} placeholder="Nhập số tiền đã kiểm đếm" /></div>
          {shift && counted && <div className={`kiosk-staff-cash-difference ${difference ? 'has-difference' : 'is-balanced'}`} aria-live="polite"><span>{difference === 0 ? 'Khớp với hệ thống' : difference > 0 ? 'Dư so với hệ thống' : 'Thiếu so với hệ thống'}</span><strong>{kioskMoney(Math.abs(difference))}</strong></div>}
          <div className="kiosk-staff-field"><label htmlFor={`${inputId}-note`}>Ghi chú bàn giao <span>(không bắt buộc)</span></label><Textarea id={`${inputId}-note`} value={note} maxLength={1000} disabled={busy} rows={3} onChange={event => onNote(event.target.value)} placeholder={shift ? 'Ghi nhận chênh lệch hoặc thông tin cần bàn giao…' : 'Ghi chú tiền đầu ca hoặc thông tin bàn giao…'} /></div>
          {error && <p className="workspace-form-error" role="alert">{error}</p>}
          <footer className="kiosk-staff-form-footer"><span>{shift ? 'Gửi quản lý đối soát. Bạn có thể mở ca mới ngay sau khi chốt.' : 'Ca mới ghi nhận tại kiosk đang hiển thị trên header.'}</span><Button variant="default" type="submit" disabled={busy || !canSubmit}>{busy ? 'Đang xử lý…' : shift ? 'Chốt ca & gửi đối soát' : 'Mở ca bán hàng'}<ArrowRight size={16} /></Button></footer>
        </form>}
      </div>
      <aside className="kiosk-staff-shift-summary"><h3>{shift ? 'Thông tin ca hiện tại' : 'Sẵn sàng bắt đầu'}</h3>{shift ? <><p className="kiosk-staff-cashier">{shift.staff_name || shift.staff_username}</p><p className="kiosk-staff-shift-start">Mở lúc {dateTime(shift.thoi_gian_mo_ca)}</p><dl><div><dt>Tiền đầu ca</dt><dd>{kioskMoney(shift.tien_dau_ca)}</dd></div><div><dt>Doanh thu</dt><dd>{kioskMoney(active.live_stats?.total_revenue)}</dd></div><div><dt>Số đơn</dt><dd>{active.live_stats?.total_orders || 0} đơn</dd></div><div className="kiosk-staff-expected"><dt>Tiền mặt kỳ vọng</dt><dd>{kioskMoney(expected)}</dd></div></dl><Button variant="outline" onClick={onPos} disabled={busy}>Trở lại bán hàng <ArrowRight size={15} /></Button></> : <p>Nhập số tiền thực có trong két. Mở ca thành công là có thể tạo đơn POS.</p>}<Button variant="ghost" onClick={onRefresh} disabled={busy}><RefreshCw size={15} />Làm mới số liệu</Button></aside>
    </section>}
    <section className="kiosk-staff-shift-history" aria-label="Lịch sử chốt ca"><header className="kiosk-staff-panel-heading"><div><h2>Lịch sử ca làm việc</h2><p>{history.length} ca gần nhất tại kiosk</p></div></header>
      {historyError && <p className="workspace-form-error" role="alert">{historyError}</p>}
      {historyLoading ? <KioskTableLoading label="Đang tải lịch sử ca" rows={3} /> : !history.length ? <div className="kiosk-staff-empty"><Clock size={26} /><p>Chưa có lịch sử ca làm việc.</p></div> : <div className="kiosk-staff-history-table"><Table><thead><tr><th>Ca làm việc</th><th>Nhân viên</th><th>Tiền đầu ca</th><th>Tiền cuối ca</th><th>Chênh lệch</th><th>Đối soát</th></tr></thead><tbody><PaginatedList items={history} pageSize={8} layout="table" columns={6}>{item => <tr key={item.id}><td><strong>{dateTime(item.thoi_gian_mo_ca)}</strong><small>{item.thoi_gian_dong_ca || item.close_requested_at ? `Đến ${dateTime(item.thoi_gian_dong_ca || item.close_requested_at)}` : 'Ca chưa kết thúc'}</small></td><td>{item.staff_name || item.staff_username || '—'}</td><td>{kioskMoney(item.tien_dau_ca)}</td><td>{item.tien_cuoi_ca == null ? '—' : kioskMoney(item.tien_cuoi_ca)}</td><td><span className={Number(item.chenh_lech) ? 'kiosk-staff-difference-text' : ''}>{item.chenh_lech == null ? '—' : Number(item.chenh_lech) > 0 ? `+${kioskMoney(item.chenh_lech)}` : kioskMoney(item.chenh_lech)}</span></td><td><StatusBadge status={item.trang_thai === 'CLOSE_PENDING' ? 'PENDING' : item.trang_thai === 'CLOSE_REJECTED' ? 'REJECTED' : item.trang_thai === 'OPEN' ? 'ACTIVE' : 'COMPLETED'}>{shiftLabels[item.trang_thai] || 'Chưa cập nhật'}</StatusBadge>{item.close_approval_note && <small>{item.close_approval_note}</small>}</td></tr>}</PaginatedList></tbody></Table></div>}
    </section>
  </div>
}

export function KioskStaffAccount({ session, user, onProfileUpdated }) {
  const [editing, setEditing] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const name = user.hoTen || user.ho_ten || user.tenDangNhap || user.ten_dang_nhap || 'Nhân viên kiosk'
  const username = user.tenDangNhap || user.ten_dang_nhap || '—'
  const currentSession = { ...session,user }
  return <section className="kiosk-staff-account" aria-label="Thông tin tài khoản">
    <header><div className="kiosk-staff-avatar" aria-hidden="true">{name.split(/\s+/).filter(Boolean).slice(-2).map(word => word[0]).join('').toUpperCase()}</div><div><h2>{name}</h2><p>@{username} · Nhân viên kiosk</p></div><Button variant="outline" onClick={() => setEditing(true)}><Edit3 size={16} />Chỉnh sửa hồ sơ</Button></header>
    <dl className="kiosk-staff-account-contacts"><div><dt>Email</dt><dd>{user.email || 'Chưa cập nhật'}</dd></div><div><dt>Số điện thoại</dt><dd>{user.soDienThoai || user.so_dien_thoai || 'Chưa cập nhật'}</dd></div></dl>
    <div className="kiosk-staff-account-security"><div><Key size={20} /><div><h3>Mật khẩu đăng nhập</h3><p>Đổi mật khẩu trong cửa sổ bảo mật.</p></div></div><Button variant="outline" onClick={() => setPasswordOpen(true)}>Đổi mật khẩu</Button></div>
    <UserProfileModal isOpen={editing} onClose={() => setEditing(false)} session={currentSession} onProfileUpdated={onProfileUpdated} />
    <ChangePasswordModal isOpen={passwordOpen} onClose={() => setPasswordOpen(false)} session={currentSession} />
  </section>
}
