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
} from 'lucide-react'
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
  const [weekStart, setWeekStart] = useState(getInitialWeekStart)
  const [selectedShift, setSelectedShift] = useState(null)
  const [activeTab, setActiveTab] = useState(enableRequestTabs ? TABS.REQUEST : TABS.SCHEDULE)
  const [requestForm, setRequestForm] = useState(() => ({
    shift_date: new Date().toISOString().slice(0, 10),
    shift_code: 'SANG',
    note: '',
  }))
  const [attendanceMessage, setAttendanceMessage] = useState('')
  const [attendanceError, setAttendanceError] = useState('')
  const [pendingPage, setPendingPage] = useState(1)
  const [approvedPage, setApprovedPage] = useState(1)
  const [rejectedPage, setRejectedPage] = useState(1)

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

  const pendingTotalPages = useMemo(() => Math.max(1, Math.ceil(pendingRequests.length / PAGE_SIZE)), [pendingRequests.length])
  const pendingSafePage = useMemo(() => Math.min(Math.max(pendingPage, 1), pendingTotalPages), [pendingPage, pendingTotalPages])
  const pendingPageRows = useMemo(
    () => pendingRequests.slice((pendingSafePage - 1) * PAGE_SIZE, pendingSafePage * PAGE_SIZE),
    [pendingRequests, pendingSafePage],
  )

  const approvedTotalPages = useMemo(() => Math.max(1, Math.ceil(approvedRequests.length / PAGE_SIZE)), [approvedRequests.length])
  const approvedSafePage = useMemo(() => Math.min(Math.max(approvedPage, 1), approvedTotalPages), [approvedPage, approvedTotalPages])
  const approvedPageRows = useMemo(
    () => approvedRequests.slice((approvedSafePage - 1) * PAGE_SIZE, approvedSafePage * PAGE_SIZE),
    [approvedRequests, approvedSafePage],
  )

  const rejectedTotalPages = useMemo(() => Math.max(1, Math.ceil(rejectedRequests.length / PAGE_SIZE)), [rejectedRequests.length])
  const rejectedSafePage = useMemo(() => Math.min(Math.max(rejectedPage, 1), rejectedTotalPages), [rejectedPage, rejectedTotalPages])
  const rejectedPageRows = useMemo(
    () => rejectedRequests.slice((rejectedSafePage - 1) * PAGE_SIZE, rejectedSafePage * PAGE_SIZE),
    [rejectedRequests, rejectedSafePage],
  )

  useEffect(() => {
    if (pendingPage > pendingTotalPages) setPendingPage(pendingTotalPages)
  }, [pendingPage, pendingTotalPages])

  useEffect(() => {
    if (approvedPage > approvedTotalPages) setApprovedPage(approvedTotalPages)
  }, [approvedPage, approvedTotalPages])

  useEffect(() => {
    if (rejectedPage > rejectedTotalPages) setRejectedPage(rejectedTotalPages)
  }, [rejectedPage, rejectedTotalPages])

  const handleDeleteRequest = (requestId) => {
    if (confirm('Xác nhận hủy yêu cầu đăng ký ca này?')) {
      onDeleteShiftRequest(requestId)
    }
  }

  return (
    <div className="panel-container" style={{
      padding: '1.75rem',
      background: '#f8fafc',
      borderRadius: '20px',
      border: '1px solid #e2e8f0',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
          }}>
            <Calendar size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>
              Lịch Làm Việc Cá Nhân
            </h2>
            <span style={{ fontSize: '0.825rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <User size={14} color="#059669" /> Nhân sự: <strong>{staffUsername || 'Nhân viên'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Summary Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '0.85rem',
        marginBottom: '1.25rem'
      }}>
        <div style={{ background: '#ffffff', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Tổng ca đã xếp</span>
          <strong style={{ fontSize: '1.25rem', display: 'block', color: '#1e293b', marginTop: '0.1rem' }}>
            {summary.totalShifts} ca
          </strong>
        </div>

        <div style={{ background: '#ffffff', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Đi làm tuần này</span>
          <strong style={{ fontSize: '1.25rem', display: 'block', color: '#2563eb', marginTop: '0.1rem' }}>
            {summary.attendedDaysWeek} ngày
          </strong>
        </div>

        <div style={{ background: '#ffffff', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Đang Check-in</span>
          <strong style={{ fontSize: '1.25rem', display: 'block', color: '#059669', marginTop: '0.1rem' }}>
            {summary.checkedInCount} ca
          </strong>
        </div>

        <div style={{ background: '#ffffff', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Giờ làm thực tế</span>
          <strong style={{ fontSize: '1.25rem', display: 'block', color: '#059669', marginTop: '0.1rem' }}>
            {summary.workedHours}h / {summary.scheduledHours}h
          </strong>
        </div>

        <div style={{ background: '#ffffff', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Đi muộn / Vắng</span>
          <strong style={{ fontSize: '1.25rem', display: 'block', color: summary.lateCount > 0 || summary.absentCount > 0 ? '#ef4444' : '#059669', marginTop: '0.1rem' }}>
            {summary.lateCount} muộn • {summary.absentCount} vắng
          </strong>
        </div>
      </div>

      {/* Attendance Insight Banner */}
      <div style={{
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        color: '#ffffff',
        padding: '0.85rem 1.25rem',
        borderRadius: '14px',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <Award size={22} color="#ffffff" />
          <div>
            <strong style={{ fontSize: '1rem', display: 'block' }}>Tỷ lệ chấm công đạt: {summary.attendanceRate}%</strong>
            <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>Tỷ lệ được tính từ các ca làm có check-in / check-out hoặc được xác nhận có mặt.</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      {enableRequestTabs && (
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          background: '#ffffff',
          padding: '0.35rem',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          marginBottom: '1.5rem'
        }}>
          <button
            type="button"
            onClick={() => setActiveTab(TABS.REQUEST)}
            style={{
              flex: 1,
              padding: '0.65rem 1rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === TABS.REQUEST ? '#10b981' : 'transparent',
              color: activeTab === TABS.REQUEST ? '#ffffff' : '#64748b',
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
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(TABS.HISTORY)}
            style={{
              flex: 1,
              padding: '0.65rem 1rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === TABS.HISTORY ? '#10b981' : 'transparent',
              color: activeTab === TABS.HISTORY ? '#ffffff' : '#64748b',
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
          </button>

          <button
            type="button"
            onClick={() => setActiveTab(TABS.SCHEDULE)}
            style={{
              flex: 1,
              padding: '0.65rem 1rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === TABS.SCHEDULE ? '#10b981' : 'transparent',
              color: activeTab === TABS.SCHEDULE ? '#ffffff' : '#64748b',
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
          </button>
        </div>
      )}

      {/* Tab 1: Form đăng ký ca mới */}
      {enableRequestTabs && activeTab === TABS.REQUEST && (
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (typeof onRequestShift !== 'function') return
            if (requestForm.shift_date < todayDate) {
              window.alert('Không thể đăng ký ca làm việc cho ngày đã qua.')
              return
            }
            const result = await onRequestShift(requestForm)
            if (result?.ok) {
              setRequestForm({ shift_date: new Date().toISOString().slice(0, 10), shift_code: 'SANG', note: '' })
            }
          }}
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '1.5rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <PlusCircle size={18} color="#10b981" /> Đăng ký nguyện vọng ca làm việc
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.35rem' }}>
                Ngày muốn đăng ký
              </label>
              <input
                type="date"
                value={requestForm.shift_date}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, shift_date: e.target.value }))}
                min={todayDate}
                required
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.35rem' }}>
                Khung ca làm
              </label>
              <select
                value={requestForm.shift_code}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, shift_code: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              >
                <option value="SANG">Ca sáng (07:00 - 12:00)</option>
                <option value="CHIEU">Ca chiều (12:00 - 17:00)</option>
                <option value="TOI">Ca tối (17:00 - 22:00)</option>
              </select>
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.35rem' }}>
                Lý do / Ghi chú cho Quản lý
              </label>
              <input
                type="text"
                value={requestForm.note}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Ví dụ: Đăng ký làm thêm ca, xin đổi ca..."
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={creatingShiftRequest}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.65rem 1.25rem',
                borderRadius: '10px',
                border: 'none',
                background: '#10b981',
                color: '#ffffff',
                fontSize: '0.875rem',
                fontWeight: '700',
                cursor: creatingShiftRequest ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 10px rgba(16, 185, 129, 0.25)'
              }}
            >
              <Send size={16} />
              {creatingShiftRequest ? 'Đang gửi...' : 'Gửi yêu cầu đăng ký ca'}
            </button>
          </div>

          {shiftRequestState?.error && (
            <div style={{ padding: '0.65rem', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontSize: '0.85rem' }}>
              {shiftRequestState.error}
            </div>
          )}
        </form>
      )}

      {/* Tab 2: Lịch sử yêu cầu */}
      {enableRequestTabs && activeTab === TABS.HISTORY && (
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '1.5rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <History size={18} color="#059669" /> Lịch sử các yêu cầu đăng ký ca
          </h3>

          {/* Pending Section */}
          {pendingRequests.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#b45309', fontSize: '0.95rem', fontWeight: '700' }}>
                Đang chờ phê duyệt ({pendingRequests.length})
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.85rem' }}>
                {pendingPageRows.map((item) => (
                  <div key={item.ma_ca_lam_viec} style={{ background: '#fffbe6', padding: '1rem', borderRadius: '12px', border: '1px solid #fde68a' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>{item.ten_ca}</strong>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', background: '#fef3c7', color: '#b45309', padding: '0.2rem 0.5rem', borderRadius: '9999px' }}>
                        Chờ duyệt
                      </span>
                    </div>
                    <div style={{ fontSize: '0.825rem', color: '#475569', marginBottom: '0.5rem' }}>
                      📅 {item.ngay_lam_viec} • {item.gio_bat_dau} - {item.gio_ket_thuc}
                    </div>
                    {item.note && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Ghi chú: {item.note}</div>}
                    <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteRequest(item.ma_ca_lam_viec)}
                        disabled={Boolean(handlingShiftRequestId && String(item.ma_ca_lam_viec) === handlingShiftRequestId)}
                        style={{
                          background: '#ef4444',
                          color: '#ffffff',
                          border: 'none',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '6px',
                          fontSize: '0.775rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        <Trash2 size={12} /> Hủy yêu cầu
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Approved Section */}
          {approvedRequests.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#047857', fontSize: '0.95rem', fontWeight: '700' }}>
                Đã phê duyệt ({approvedRequests.length})
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.85rem' }}>
                {approvedPageRows.map((item) => (
                  <div key={item.ma_ca_lam_viec} style={{ background: '#ecfdf5', padding: '1rem', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>{item.ten_ca}</strong>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', background: '#d1fae5', color: '#047857', padding: '0.2rem 0.5rem', borderRadius: '9999px' }}>
                        Đã duyệt
                      </span>
                    </div>
                    <div style={{ fontSize: '0.825rem', color: '#475569' }}>
                      📅 {item.ngay_lam_viec} • {item.gio_bat_dau} - {item.gio_ket_thuc}
                    </div>
                    {item.ghi_chu_duyet && <div style={{ fontSize: '0.8rem', color: '#047857', marginTop: '0.35rem' }}>Phản hồi: {item.ghi_chu_duyet}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rejected Section */}
          {rejectedRequests.length > 0 && (
            <div>
              <h4 style={{ margin: '0 0 0.75rem 0', color: '#b91c1c', fontSize: '0.95rem', fontWeight: '700' }}>
                Từ chối ({rejectedRequests.length})
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.85rem' }}>
                {rejectedPageRows.map((item) => (
                  <div key={item.ma_ca_lam_viec} style={{ background: '#fef2f2', padding: '1rem', borderRadius: '12px', border: '1px solid #fca5a5' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <strong style={{ fontSize: '0.95rem', color: '#1e293b' }}>{item.ten_ca}</strong>
                      <span style={{ fontSize: '0.75rem', fontWeight: '700', background: '#fee2e2', color: '#b91c1c', padding: '0.2rem 0.5rem', borderRadius: '9999px' }}>
                        Từ chối
                      </span>
                    </div>
                    <div style={{ fontSize: '0.825rem', color: '#475569' }}>
                      📅 {item.ngay_lam_viec} • {item.gio_bat_dau} - {item.gio_ket_thuc}
                    </div>
                    {item.ghi_chu_duyet && <div style={{ fontSize: '0.8rem', color: '#b91c1c', marginTop: '0.35rem' }}>Lý do từ chối: {item.ghi_chu_duyet}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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
            border: '1px solid #e2e8f0',
            padding: '1.5rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
            marginTop: '1.25rem'
          }}>
            {!selectedShiftDetails ? (
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center' }}>
                Vui lòng nhấp chọn một ca làm việc trên bảng lịch ở trên để thực hiện điểm danh Check-in / Check-out.
              </p>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
                      {selectedShiftDetails.ten_ca}
                    </h3>
                    <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '600' }}>
                      {selectedShiftDetails.ngay_lam_viec} • {selectedShiftDetails.gio_bat_dau} - {selectedShiftDetails.gio_ket_thuc}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    padding: '0.3rem 0.75rem',
                    borderRadius: '9999px',
                    background: '#d1fae5',
                    color: '#047857'
                  }}>
                    {selectedInsight?.shortLabel || 'Đã xếp lịch'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                  <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Check-in</span>
                    <strong style={{ fontSize: '0.9rem', display: 'block', color: '#059669', marginTop: '0.1rem' }}>
                      {selectedShiftDetails.check_in_at ? new Date(selectedShiftDetails.check_in_at).toLocaleString('vi-VN') : 'Chưa điểm danh'}
                    </strong>
                  </div>

                  <div style={{ background: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Check-out</span>
                    <strong style={{ fontSize: '0.9rem', display: 'block', color: '#2563eb', marginTop: '0.1rem' }}>
                      {selectedShiftDetails.check_out_at ? new Date(selectedShiftDetails.check_out_at).toLocaleString('vi-VN') : 'Chưa điểm danh'}
                    </strong>
                  </div>
                </div>

                {/* Self Attendance Buttons */}
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
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
                      background: hasCheckedIn ? '#cbd5e1' : '#10b981',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      fontWeight: '700',
                      cursor: hasCheckedIn || isFutureShift ? 'not-allowed' : 'pointer',
                      boxShadow: hasCheckedIn ? 'none' : '0 4px 10px rgba(16, 185, 129, 0.25)'
                    }}
                  >
                    <CheckCircle2 size={18} />
                    {checkingAttendanceShiftId === String(selectedShiftDetails.ma_ca_lam_viec) ? 'Đang xử lý...' : 'Check-in (Vào ca)'}
                  </button>

                  <button
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
                      background: !hasCheckedIn || hasCheckedOut ? '#cbd5e1' : '#ef4444',
                      color: '#ffffff',
                      fontSize: '0.9rem',
                      fontWeight: '700',
                      cursor: !hasCheckedIn || hasCheckedOut || isFutureShift ? 'not-allowed' : 'pointer',
                      boxShadow: !hasCheckedIn || hasCheckedOut ? 'none' : '0 4px 10px rgba(239, 68, 68, 0.25)'
                    }}
                  >
                    <XCircle size={18} />
                    {checkingAttendanceShiftId === String(selectedShiftDetails.ma_ca_lam_viec) ? 'Đang xử lý...' : 'Check-out (Kết thúc ca)'}
                  </button>
                </div>

                {attendanceMessage && (
                  <div style={{ marginTop: '0.85rem', padding: '0.65rem 0.85rem', borderRadius: '8px', background: '#ecfdf5', color: '#047857', fontSize: '0.85rem', fontWeight: '600' }}>
                    ✓ {attendanceMessage}
                  </div>
                )}
                {attendanceError && (
                  <div style={{ marginTop: '0.85rem', padding: '0.65rem 0.85rem', borderRadius: '8px', background: '#fef2f2', color: '#b91c1c', fontSize: '0.85rem', fontWeight: '600' }}>
                    ⚠️ {attendanceError}
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
