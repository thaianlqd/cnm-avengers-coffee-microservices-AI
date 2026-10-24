import { WorkspacePanelIntro } from '../../../components/console/OperationalPageFrame'
import { Button } from '../../../components/ui/button'
import StatusBadge from '../../../components/console/StatusBadge'
import { PageNumbers } from '../../../components/console/CompactPagination'
import { Table } from '../../../components/ui/table'
import { Badge } from '../../../components/ui/badge'
import { Label } from '../../../components/ui/label'
import { Input } from '../../../components/ui/input'
import SearchableSelect from '../../../components/console/SearchableSelect'
import { Calendar as WorkspaceSymbolCalendar, Check as WorkspaceSymbolCheck, AlertTriangle as WorkspaceSymbolAlertTriangle } from '../../../components/console/WorkspaceIcons'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlusCircle,
  Send,
  ClipboardList,
  History,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Award,
  RefreshCw,
  Trash2,
  FileText
} from '../../../components/console/WorkspaceIcons'
import { WorkforceCalendar, getInitialWeekStart } from './WorkforceCalendar'
import { formatMinutesLabel, getAttendanceInsight, getAttendanceMetrics, getAttendanceToneClass } from '../../workforce/attendance'

function addWeeks(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount * 7)
  return next
}

function toDateOnlyLocal(dateInput = new Date()) {
  const date = new Date(dateInput)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const TABS = {
  REQUEST: 'request',
  HISTORY: 'history',
  SCHEDULE: 'schedule',
}
const PAGE_SIZE = 8

export function StaffWorkShiftsPanel({
  myWorkShiftState = { items: [], loading: false, error: null },
  staffUsername,
  shiftRequestState = { items: [], loading: false, error: null },
  creatingShiftRequest,
  onRequestShift,
  onDeleteShiftRequest,
  onEditShiftRequest,
  handlingShiftRequestId,
  onSelfAttendance,
  checkingAttendanceShiftId,
  enableRequestTabs = true,
}) {
  const nextWeekRange = useMemo(() => {
    const now = new Date()
    const currentDay = now.getDay() // 0 is Sunday, 1 is Monday...
    const isSunday = currentDay === 0
    // Monday of current week
    const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (currentDay === 0 ? 6 : currentDay - 1))
    // Monday of next week
    const nextMonday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() + 7)
    // Sunday of next week
    const nextSunday = new Date(currentMonday.getFullYear(), currentMonday.getMonth(), currentMonday.getDate() + 13)

    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return {
      isSunday,
      nextMondayStr: fmt(nextMonday),
      nextSundayStr: fmt(nextSunday),
      nextMondayFmt: `${String(nextMonday.getDate()).padStart(2, '0')}/${String(nextMonday.getMonth() + 1).padStart(2, '0')}`,
      nextSundayFmt: `${String(nextSunday.getDate()).padStart(2, '0')}/${String(nextSunday.getMonth() + 1).padStart(2, '0')}`
    }
  }, [])

  const [weekStart, setWeekStart] = useState(getInitialWeekStart)
  const [selectedShift, setSelectedShift] = useState(null)
  const [activeTab, setActiveTab] = useState(enableRequestTabs ? TABS.REQUEST : TABS.SCHEDULE)
  const [requestForm, setRequestForm] = useState(() => ({
    shift_date: nextWeekRange.nextMondayStr,
    shift_code: 'SANG',
    note: '',
  }))
  const [attendanceMessage, setAttendanceMessage] = useState('')
  const [attendanceError, setAttendanceError] = useState('')
  const [historyFilter, setHistoryFilter] = useState('ALL')
  const [historyPage, setHistoryPage] = useState(1)

  const summary = useMemo(() => {
    return getAttendanceMetrics(myWorkShiftState.items || [])
  }, [myWorkShiftState.items])

  const selectedShiftDetails = selectedShift
    ? (myWorkShiftState.items || []).find((item) => item.ma_ca_lam_viec === selectedShift.ma_ca_lam_viec) || selectedShift
    : null
  const selectedInsight = selectedShiftDetails ? getAttendanceInsight(selectedShiftDetails) : null
  const todayDate = toDateOnlyLocal()
  const isFutureShift = selectedShiftDetails ? selectedShiftDetails.ngay_lam_viec > todayDate : false
  const hasCheckedIn = Boolean(selectedShiftDetails?.check_in_at)
  const hasCheckedOut = Boolean(selectedShiftDetails?.check_out_at)

  const handleSelfAttendance = async (action) => {
    if (!selectedShiftDetails || typeof onSelfAttendance !== 'function') return
    setAttendanceMessage('')
    setAttendanceError('')

    const result = await onSelfAttendance(selectedShiftDetails.ma_ca_lam_viec, action)
    if (result?.ok) {
      setAttendanceMessage(action === 'CHECK_IN' ? 'Đã điểm danh vào ca (Check-in) thành công!' : 'Đã điểm danh kết thúc (Check-out) thành công!')
      return
    }

    setAttendanceError(result?.message || 'Không thể thực hiện chấm công ca này.')
  }

  const pendingRequests = useMemo(() => {
    return (shiftRequestState?.items || []).filter(item => item.trang_thai_yeu_cau === 'PENDING')
  }, [shiftRequestState?.items])

  const approvedRequests = useMemo(() => {
    return (shiftRequestState?.items || []).filter(item => item.trang_thai_yeu_cau === 'APPROVED')
  }, [shiftRequestState?.items])

  const rejectedRequests = useMemo(() => {
    return (shiftRequestState?.items || []).filter(item => item.trang_thai_yeu_cau === 'REJECTED')
  }, [shiftRequestState?.items])

  const historyItems = useMemo(() => [...(shiftRequestState.items || [])]
    .filter(item => historyFilter === 'ALL' || item.trang_thai_yeu_cau === historyFilter)
    .sort((a,b) => String(b.ngay_lam_viec).localeCompare(String(a.ngay_lam_viec)) || String(a.gio_bat_dau).localeCompare(String(b.gio_bat_dau))), [shiftRequestState.items, historyFilter])
  const historyPages = Math.max(1, Math.ceil(historyItems.length / PAGE_SIZE))
  const safeHistoryPage = Math.min(historyPage, historyPages)
  const historyRows = historyItems.slice((safeHistoryPage-1)*PAGE_SIZE, safeHistoryPage*PAGE_SIZE)
  const requestStatusLabels = {PENDING:'Chờ duyệt',APPROVED:'Đã duyệt',REJECTED:'Từ chối',CANCELLED:'Đã hủy'}
  const historyDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value).split('-').reverse().join('/') : value || 'Chưa có ngày'

  const handleDeleteRequest = (requestId) => {
    if (confirm('Xác nhận hủy yêu cầu đăng ký ca này?')) {
      onDeleteShiftRequest(requestId)
    }
  }

  return (
    <div className="panel-container manager-personal-schedule" style={{
      padding: '1.75rem',
      background: '#f8f9f6',
      borderRadius: '20px',
      border: '1px solid #e2e4df',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)'
    }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <WorkspacePanelIntro><div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'var(--primary)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.1)'
          }}>
            <Calendar size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#252927' }}>
              Lịch Làm Việc Cá Nhân
            </h2>
            <span style={{ fontSize: '0.825rem', color: '#69736a', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <User size={14} color="var(--primary)" /> Nhân sự: <strong>{staffUsername || 'Nhân viên'}</strong>
            </span>
          </div>
        </div></WorkspacePanelIntro>
      </div>

      {/* Summary Cards Grid */}


      {/* Navigation Tabs */}
      {enableRequestTabs && (
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          background: '#ffffff',
          padding: '0.35rem',
          borderRadius: '12px',
          border: '1px solid #e2e4df',
          marginBottom: '1.5rem'
        }}>
          <Button data-selected={activeTab === TABS.REQUEST}
            type="button"
            onClick={() => setActiveTab(TABS.REQUEST)}
            style={{
              flex: 1,
              padding: '0.65rem 1rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === TABS.REQUEST ? 'var(--primary)' : 'transparent',
              color: activeTab === TABS.REQUEST ? '#ffffff' : '#69736a',
              fontWeight: activeTab === TABS.REQUEST ? '700' : '500',
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease'
            }}
          >
            <Send size={16} /> Đăng ký ca mới
          </Button>

          <Button data-selected={activeTab === TABS.HISTORY}
            type="button"
            onClick={() => setActiveTab(TABS.HISTORY)}
            style={{
              flex: 1,
              padding: '0.65rem 1rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === TABS.HISTORY ? "var(--primary)" : 'transparent',
              color: activeTab === TABS.HISTORY ? '#ffffff' : '#69736a',
              fontWeight: activeTab === TABS.HISTORY ? '700' : '500',
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease'
            }}
          >
            <History size={16} /> Lịch sử đăng ký ({shiftRequestState?.items?.length || 0})
          </Button>

          <Button data-selected={activeTab === TABS.SCHEDULE}
            type="button"
            onClick={() => setActiveTab(TABS.SCHEDULE)}
            style={{
              flex: 1,
              padding: '0.65rem 1rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === TABS.SCHEDULE ? "var(--primary)" : 'transparent',
              color: activeTab === TABS.SCHEDULE ? '#ffffff' : '#69736a',
              fontWeight: activeTab === TABS.SCHEDULE ? '700' : '500',
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s ease'
            }}
          >
            <Calendar size={16} /> Lịch làm việc tuần
          </Button>
        </div>
      )}

      {/* Tab 1: Form đăng ký ca mới */}
      {enableRequestTabs && activeTab === TABS.REQUEST && (
        <form className="workspace-form"
          onSubmit={async (event) => {
            event.preventDefault()
            if (typeof onRequestShift !== 'function') return
            if (nextWeekRange.isSunday) {
              window.alert('Hạn chót đăng ký ca cho tuần sau đã kết thúc (trước Chủ Nhật hàng tuần). Quản lý chi nhánh đang xét duyệt lịch.')
              return
            }
            if (requestForm.shift_date < nextWeekRange.nextMondayStr || requestForm.shift_date > nextWeekRange.nextSundayStr) {
              window.alert(`Chỉ được đăng ký ca làm việc cho tuần kế tiếp (${nextWeekRange.nextMondayFmt} - ${nextWeekRange.nextSundayFmt}).`)
              return
            }
            const result = await onRequestShift(requestForm)
            if (result?.ok) {
              setRequestForm({ shift_date: nextWeekRange.nextMondayStr, shift_code: 'SANG', note: '' })
            }
          }}
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e4df',
            padding: '1.5rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#252927', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <PlusCircle size={18} color="var(--primary)" /> Đăng ký nguyện vọng ca làm việc
            </h3>
            <Badge variant="outline" data-quiet-label="true" style={{
              fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 99,
              background: 'var(--primary-light)', color: 'var(--primary-hover)', border: '1px solid var(--border-light)'
            }}>
              Tuần kế tiếp: {nextWeekRange.nextMondayFmt} – {nextWeekRange.nextSundayFmt}
            </Badge>
          </div>

          {/* Banner cảnh báo nếu hôm nay là Chủ Nhật */}
          {nextWeekRange.isSunday ? (
            <div style={{
              background: "#f4f5f2", border: '1px solid #fde68a', borderRadius: 12,
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
              color: '#92400e', fontSize: 13, fontWeight: 600
            }}>
              <AlertCircle size={22} color="#d97706" style={{ flexShrink: 0 }} />
              <div>
                <strong style={{ display: 'block', color: '#b45309', marginBottom: 2 }}>Cổng đăng ký ca tuần tới đã đóng</strong>
                Thời hạn đăng ký ca kết thúc trước ngày Chủ Nhật hàng tuần (hạn chót 23:59 Thứ Bảy). Quản lý chi nhánh đang tiến hành xét duyệt lịch làm việc chính thức.
              </div>
            </div>
          ) : (
            <div style={{
              background: 'var(--primary-light)', border: '1px solid var(--border-light)', borderRadius: 12,
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
              color: 'var(--primary-hover)', fontSize: 12, fontWeight: 600
            }}>
              <Clock size={16} color="var(--primary)" style={{ flexShrink: 0 }} />
              <span>Chỉ nhận đăng ký ca cho <b>tuần kế tiếp</b> ({nextWeekRange.nextMondayFmt} – {nextWeekRange.nextSundayFmt}). Hạn chót gửi yêu cầu trước Chủ Nhật (23:59 Thứ 7).</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div>
              <Label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#414743', display: 'block', marginBottom: '0.35rem' }}>
                Ngày muốn đăng ký *
              </Label>
              <Input
                type="date"
                value={requestForm.shift_date}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, shift_date: e.target.value }))}
                min={nextWeekRange.nextMondayStr}
                max={nextWeekRange.nextSundayStr}
                disabled={nextWeekRange.isSunday}
                required
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #ccd3c7',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                  background: nextWeekRange.isSunday ? '#f4f5f2' : '#ffffff'
                }}
              />
              <span style={{ fontSize: 11, color: '#69736a', marginTop: 4, display: 'block' }}>
                Phạm vi: {nextWeekRange.nextMondayFmt} – {nextWeekRange.nextSundayFmt}
              </span>
            </div>

            <div>
              <Label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#414743', display: 'block', marginBottom: '0.35rem' }}>
                Khung ca làm *
              </Label>
              <SearchableSelect
                value={requestForm.shift_code}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, shift_code: e.target.value }))}
                disabled={nextWeekRange.isSunday}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #ccd3c7',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                  background: nextWeekRange.isSunday ? '#f4f5f2' : '#ffffff'
                }}
              >
                <option value="SANG">Ca sáng (06:00 - 12:00)</option>
                <option value="CHIEU">Ca chiều (12:00 - 18:00)</option>
                <option value="TOI">Ca tối (18:00 - 23:00)</option>
              </SearchableSelect>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <Label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#414743', display: 'block', marginBottom: '0.35rem' }}>
                Lý do / Ghi chú cho Quản lý chi nhánh
              </Label>
              <Input
                type="text"
                value={requestForm.note}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, note: e.target.value }))}
                disabled={nextWeekRange.isSunday}
                placeholder="Ví dụ: Đăng ký làm thêm ca, xin ưu tiên trực máy pha chính..."
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #ccd3c7',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box',
                  background: nextWeekRange.isSunday ? '#f4f5f2' : '#ffffff'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="submit"
              disabled={creatingShiftRequest || nextWeekRange.isSunday}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.65rem 1.25rem',
                borderRadius: '10px',
                border: 'none',
                background: nextWeekRange.isSunday ? '#85907d' : 'var(--primary)',
                color: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: '700',
                cursor: (creatingShiftRequest || nextWeekRange.isSunday) ? 'not-allowed' : 'pointer',
                boxShadow: nextWeekRange.isSunday ? 'none' : '0 4px 10px rgba(0, 0, 0, 0.15)'
              }}
            >
              <Send size={16} />
              {creatingShiftRequest ? 'Đang gửi...' : 'Gửi yêu cầu đăng ký ca'}
            </Button>
          </div>

          {shiftRequestState?.error && (
            <div style={{ padding: '0.65rem', borderRadius: '8px', background: "#f4f5f2", color: '#b91c1c', fontSize: '0.85rem' }}>
              {shiftRequestState.error}
            </div>
          )}
        </form>
      )}

      {enableRequestTabs && activeTab === TABS.HISTORY && <section className="shift-request-history">
        <header><div><h2>Lịch sử đăng ký ca</h2><p>Theo dõi kết quả duyệt và phản hồi cho từng yêu cầu.</p></div><span>{shiftRequestState.items?.length || 0} yêu cầu</span></header>
        <div className="shift-request-filters" role="group" aria-label="Lọc lịch sử đăng ký">{[['ALL','Tất cả',shiftRequestState.items?.length || 0],['PENDING','Chờ duyệt',pendingRequests.length],['APPROVED','Đã duyệt',approvedRequests.length],['REJECTED','Từ chối',rejectedRequests.length]].map(([value,label,count])=><Button key={value} type="button" variant={historyFilter===value?'default':'outline'} aria-pressed={historyFilter===value} onClick={()=>{setHistoryFilter(value);setHistoryPage(1)}}>{label}<span>{count}</span></Button>)}</div>
        {shiftRequestState.loading ? <p className="operation-empty" role="status">Đang tải lịch sử đăng ký…</p> : shiftRequestState.error ? <p className="workspace-form-error" role="alert">{shiftRequestState.error}</p> : !historyRows.length ? <p className="operation-empty">Chưa có yêu cầu đăng ký trong nhóm này.</p> : <div className="shift-request-table"><Table><thead><tr><th>Ngày làm việc</th><th>Ca đăng ký</th><th>Trạng thái</th><th>Ghi chú / phản hồi</th><th>Thao tác</th></tr></thead><tbody>{historyRows.map(item=><tr key={item.ma_ca_lam_viec}><td><span className="shift-history-date"><Calendar size={15}/>{historyDate(item.ngay_lam_viec)}</span></td><td><strong>{item.ten_ca || 'Ca làm việc'}</strong><small className="shift-history-time">{String(item.gio_bat_dau||'').slice(0,5)} – {String(item.gio_ket_thuc||'').slice(0,5)}</small></td><td><StatusBadge status={item.trang_thai_yeu_cau}>{requestStatusLabels[item.trang_thai_yeu_cau] || 'Chưa xác định'}</StatusBadge></td><td className="shift-history-notes">{item.note && <p><span>Ghi chú:</span> {item.note}</p>}{item.ghi_chu_duyet && <p><span>Phản hồi:</span> {item.ghi_chu_duyet}</p>}{!item.note && !item.ghi_chu_duyet && <small>Chưa có ghi chú</small>}</td><td>{item.trang_thai_yeu_cau==='PENDING' ? <Button type="button" variant="outline" data-intent="danger" onClick={()=>handleDeleteRequest(item.ma_ca_lam_viec)} disabled={Boolean(handlingShiftRequestId && String(item.ma_ca_lam_viec)===String(handlingShiftRequestId))}><X size={14}/>Hủy yêu cầu</Button> : <small>Đã xử lý</small>}</td></tr>)}</tbody></Table></div>}
        {historyPages>1 && <footer className="shift-request-pagination"><span>Trang {safeHistoryPage} / {historyPages}</span><PageNumbers page={safeHistoryPage} totalPages={historyPages} onChange={setHistoryPage}/></footer>}
      </section>}

      {/* Tab 3: Workforce Calendar View & Self Attendance Details */}
      {activeTab === TABS.SCHEDULE && (
        <>
          <WorkforceCalendar
            items={myWorkShiftState.items}
            weekStart={weekStart}
            onChangeWeek={(delta) => setWeekStart((prev) => addWeeks(prev, delta))}
            onResetWeek={() => setWeekStart(getInitialWeekStart())}
            onSelectItem={setSelectedShift}
            selectedItemId={selectedShiftDetails?.ma_ca_lam_viec || ''}
            mode="staff"
          />

          {/* Selected Shift Attendance Action Card */}
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e4df',
            padding: '1.5rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
            marginTop: '1.25rem'
          }}>
            {!selectedShiftDetails ? (
              <p style={{ margin: 0, color: '#69736a', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center' }}>
                Vui lòng nhấp chọn một ca làm việc trên bảng lịch ở trên để thực hiện điểm danh Check-in / Check-out.
              </p>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f4f5f2', paddingBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '600', color: '#252927' }}>
                      {selectedShiftDetails.ten_ca}
                    </h3>
                    <span style={{ fontSize: '0.85rem', color: '#69736a', fontWeight: '600' }}>
                      {selectedShiftDetails.ngay_lam_viec} • {selectedShiftDetails.gio_bat_dau} - {selectedShiftDetails.gio_ket_thuc}
                    </span>
                  </div>
                  <Badge variant="outline" data-quiet-label="true" className="workspace-inline-label" style={{
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    padding: '0.3rem 0.75rem',
                    borderRadius: '9999px',
                    background: 'var(--primary-light)',
                    color: 'var(--primary-hover)'
                  }}>
                    {selectedInsight?.shortLabel || 'Đã xếp lịch'}
                  </Badge>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                  <div style={{ background: '#f8f9f6', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e4df' }}>
                    <span style={{ fontSize: '0.75rem', color: '#69736a' }}>Check-in</span>
                    <strong style={{ fontSize: '0.9rem', display: 'block', color: 'var(--primary)', marginTop: '0.1rem' }}>
                      {selectedShiftDetails.check_in_at ? new Date(selectedShiftDetails.check_in_at).toLocaleString('vi-VN') : 'Chưa điểm danh'}
                    </strong>
                  </div>

                  <div style={{ background: '#f8f9f6', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e4df' }}>
                    <span style={{ fontSize: '0.75rem', color: '#69736a' }}>Check-out</span>
                    <strong style={{ fontSize: '0.9rem', display: 'block', color: 'var(--primary)', marginTop: '0.1rem' }}>
                      {selectedShiftDetails.check_out_at ? new Date(selectedShiftDetails.check_out_at).toLocaleString('vi-VN') : 'Chưa điểm danh'}
                    </strong>
                  </div>
                </div>

                {/* Self Attendance Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <Button
                    type="button"
                    onClick={() => handleSelfAttendance('CHECK_IN')}
                    disabled={
                      !selectedShiftDetails ||
                      isFutureShift ||
                      hasCheckedIn ||
                      checkingAttendanceShiftId === String(selectedShiftDetails.ma_ca_lam_viec)
                    }
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: hasCheckedIn ? "#f4f5f2" : 'var(--primary)',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      fontWeight: '700',
                      cursor: hasCheckedIn || isFutureShift ? 'not-allowed' : 'pointer',
                      boxShadow: hasCheckedIn ? 'none' : '0 4px 10px rgba(0, 0, 0, 0.15)'
                    }}
                  >
                    <CheckCircle2 size={18} />
                    {checkingAttendanceShiftId === String(selectedShiftDetails.ma_ca_lam_viec) ? 'Đang xử lý...' : 'Check-in (Vào ca)'}
                  </Button>

                  <Button
                    type="button"
                    onClick={() => handleSelfAttendance('CHECK_OUT')}
                    disabled={
                      !selectedShiftDetails ||
                      isFutureShift ||
                      !hasCheckedIn ||
                      hasCheckedOut ||
                      checkingAttendanceShiftId === String(selectedShiftDetails.ma_ca_lam_viec)
                    }
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      padding: '0.75rem 1rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: !hasCheckedIn || hasCheckedOut ? "#f4f5f2" : '#ef4444',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      fontWeight: '700',
                      cursor: !hasCheckedIn || hasCheckedOut || isFutureShift ? 'not-allowed' : 'pointer',
                      boxShadow: !hasCheckedIn || hasCheckedOut ? 'none' : '0 4px 10px rgba(239, 68, 68, 0.25)'
                    }}
                  >
                    <XCircle size={18} />
                    {checkingAttendanceShiftId === String(selectedShiftDetails.ma_ca_lam_viec) ? 'Đang xử lý...' : 'Check-out (Kết thúc ca)'}
                  </Button>
                </div>

                {attendanceMessage && (
                  <div style={{ marginTop: '0.85rem', padding: '0.65rem 0.85rem', borderRadius: '8px', background: 'var(--primary-light)', color: 'var(--primary-hover)', fontSize: '0.85rem', fontWeight: '600' }}>
                    <WorkspaceSymbolCheck size="1.1em" aria-hidden="true" /> {attendanceMessage}
                  </div>
                )}
                {attendanceError && (
                  <div style={{ marginTop: '0.85rem', padding: '0.65rem 0.85rem', borderRadius: '8px', background: "#f4f5f2", color: '#b91c1c', fontSize: '0.85rem', fontWeight: '600' }}>
                    <WorkspaceSymbolAlertTriangle size="1.1em" aria-hidden="true" /> {attendanceError}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
