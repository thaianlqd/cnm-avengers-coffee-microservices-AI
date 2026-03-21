import { useEffect, useMemo, useState } from 'react'
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
  myWorkShiftState,
  staffUsername,
  shiftRequestState,
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
    return getAttendanceMetrics(myWorkShiftState.items)
  }, [myWorkShiftState.items])

  const selectedShiftDetails = selectedShift
    ? myWorkShiftState.items.find((item) => item.ma_ca_lam_viec === selectedShift.ma_ca_lam_viec) || selectedShift
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
      setAttendanceMessage(action === 'CHECK_IN' ? 'Đã check-in thành công.' : 'Đã check-out thành công.')
      return
    }

    setAttendanceError(result?.message || 'Khong cham cong duoc')
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
    <section className="panel workforce-panel">
      <div className="panel-head">
        <h2>Lịch làm của bạn</h2>
        <span>{staffUsername || 'staff'}</span>
      </div>

      <div className="workforce-summary-grid">
        <article>
          <strong>{summary.totalShifts}</strong>
          <span>Tổng ca đã xếp</span>
        </article>
        <article>
          <strong>{summary.attendedDaysWeek}</strong>
          <span>Ngày đi làm tuần này</span>
        </article>
        <article>
          <strong>{summary.attendedDaysMonth}</strong>
          <span>Ngày đi làm tháng này</span>
        </article>
        <article>
          <strong>{summary.checkedInCount}</strong>
          <span>Đang check-in</span>
        </article>
        <article>
          <strong>{summary.completedCount}</strong>
          <span>Đã check-out</span>
        </article>
        <article>
          <strong>{summary.scheduledHours}</strong>
          <span>Tổng giờ đã lên lịch</span>
        </article>
        <article>
          <strong>{summary.workedHours}</strong>
          <span>Giờ làm thực tế</span>
        </article>
        <article>
          <strong>{summary.lateCount}</strong>
          <span>Ca đi muộn</span>
        </article>
        <article>
          <strong>{summary.earlyLeaveCount}</strong>
          <span>Ca về sớm</span>
        </article>
        <article>
          <strong>{summary.absentCount}</strong>
          <span>Ca vắng mặt</span>
        </article>
      </div>

      <div className="workforce-insight-banner">
        <strong>Tỷ lệ chấm công: {summary.attendanceRate}%</strong>
        <span>Được tính từ những ca có check-in/check-out hoặc được xác nhận có mặt.</span>
      </div>

      {/* Tab Navigation */}
      {enableRequestTabs ? (
        <div className="workforce-tabs">
          <button
            type="button"
            className={`workforce-tab ${activeTab === TABS.REQUEST ? 'active' : ''}`}
            onClick={() => setActiveTab(TABS.REQUEST)}
          >
            Yêu cầu mới
          </button>
          <button
            type="button"
            className={`workforce-tab ${activeTab === TABS.HISTORY ? 'active' : ''}`}
            onClick={() => setActiveTab(TABS.HISTORY)}
          >
            Lịch sử yêu cầu
          </button>
          <button
            type="button"
            className={`workforce-tab ${activeTab === TABS.SCHEDULE ? 'active' : ''}`}
            onClick={() => setActiveTab(TABS.SCHEDULE)}
          >
            Lịch làm việc
          </button>
        </div>
      ) : null}

      {/* Tab: Yêu cầu mới */}
      {enableRequestTabs && activeTab === TABS.REQUEST && (
        <form
          className="workforce-form"
          onSubmit={async (event) => {
            event.preventDefault()
            if (typeof onRequestShift !== 'function') return
            if (requestForm.shift_date < todayDate) {
              window.alert('Không thể đăng ký ca cho ngày đã qua.')
              return
            }
            const result = await onRequestShift(requestForm)
            if (result?.ok) {
              setRequestForm({ shift_date: new Date().toISOString().slice(0, 10), shift_code: 'SANG', note: '' })
            }
          }}
        >
          <div className="workforce-form-topbar">
            <label>
              Ngày muốn đăng ký
              <input
                type="date"
                value={requestForm.shift_date}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, shift_date: e.target.value }))}
                min={todayDate}
                required
              />
            </label>
            <label>
              Khung ca
              <select
                value={requestForm.shift_code}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, shift_code: e.target.value }))}
              >
                <option value="SANG">Ca sáng</option>
                <option value="CHIEU">Ca chiều</option>
                <option value="TOI">Ca tối</option>
              </select>
            </label>
            <label className="workforce-note-field">
              Lý do / ghi chú
              <input
                value={requestForm.note}
                onChange={(e) => setRequestForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Ví dụ: đổi ca do lịch học"
              />
            </label>
          </div>

          <div className="workforce-detail-actions">
            <button type="submit" disabled={creatingShiftRequest}>
              {creatingShiftRequest ? 'Đang gửi...' : 'Gửi yêu cầu đăng ký ca'}
            </button>
          </div>

          {shiftRequestState?.error ? <p className="error-text">{shiftRequestState.error}</p> : null}
        </form>
      )}

      {/* Tab: Lịch sử yêu cầu */}
      {enableRequestTabs && activeTab === TABS.HISTORY && (
        <div className="workforce-assignment-card">
          <div className="workforce-detail-head">
            <div>
              <h3>Lịch sử yêu cầu đăng ký ca</h3>
              <p>Theo dõi tất cả yêu cầu gửi cho manager.</p>
            </div>
          </div>
          {shiftRequestState?.loading ? <p>Đang tải yêu cầu...</p> : null}
          {!shiftRequestState?.loading && !(shiftRequestState?.items || []).length ? (
            <p className="employee-empty">Chưa có yêu cầu đăng ký ca nào.</p>
          ) : null}

          {/* Pending Requests Section */}
          {pendingRequests.length > 0 && (
            <div className="workforce-request-section">
              <h4>Yêu cầu đang chờ duyệt ({pendingRequests.length})</h4>
              <div className="employee-list">
                {pendingPageRows.map((item) => (
                  <article key={item.ma_ca_lam_viec} className="employee-card">
                    <div className="employee-card-head">
                      <div>
                        <h3>{item.ten_ca}</h3>
                        <p>{item.ngay_lam_viec} • {item.gio_bat_dau} - {item.gio_ket_thuc}</p>
                      </div>
                      <span className="employee-status-pill employee-status-pill--pending">PENDING</span>
                    </div>
                    {item.note ? <p className="workforce-detail-note">Ghi chú: {item.note}</p> : null}
                    <div className="workforce-detail-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          console.log('Delete clicked for:', item.ma_ca_lam_viec)
                          handleDeleteRequest(item.ma_ca_lam_viec)
                        }}
                        disabled={!!(handlingShiftRequestId && String(item.ma_ca_lam_viec) === handlingShiftRequestId)}
                      >
                        {handlingShiftRequestId && String(item.ma_ca_lam_viec) === handlingShiftRequestId ? 'Đang hủy...' : 'Hủy yêu cầu'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {pendingRequests.length > PAGE_SIZE ? (
                <div className="ops-pagination" style={{ marginTop: '0.6rem' }}>
                  <span>{(pendingSafePage - 1) * PAGE_SIZE + 1}-{Math.min(pendingSafePage * PAGE_SIZE, pendingRequests.length)} / {pendingRequests.length}</span>
                  <div>
                    <button type="button" className="secondary" onClick={() => setPendingPage(1)} disabled={pendingSafePage <= 1}>Đầu</button>
                    <button type="button" className="secondary" onClick={() => setPendingPage((p) => Math.max(1, p - 1))} disabled={pendingSafePage <= 1}>Trước</button>
                    <strong>Trang {pendingSafePage}/{pendingTotalPages}</strong>
                    <button type="button" className="secondary" onClick={() => setPendingPage((p) => Math.min(pendingTotalPages, p + 1))} disabled={pendingSafePage >= pendingTotalPages}>Sau</button>
                    <button type="button" className="secondary" onClick={() => setPendingPage(pendingTotalPages)} disabled={pendingSafePage >= pendingTotalPages}>Cuối</button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Approved Requests Section */}
          {approvedRequests.length > 0 && (
            <div className="workforce-request-section">
              <h4>Yêu cầu đã duyệt ({approvedRequests.length})</h4>
              <div className="employee-list">
                {approvedPageRows.map((item) => (
                  <article key={item.ma_ca_lam_viec} className="employee-card">
                    <div className="employee-card-head">
                      <div>
                        <h3>{item.ten_ca}</h3>
                        <p>{item.ngay_lam_viec} • {item.gio_bat_dau} - {item.gio_ket_thuc}</p>
                      </div>
                      <span className="employee-status-pill employee-status-pill--approved">APPROVED</span>
                    </div>
                    {item.note ? <p className="workforce-detail-note">Ghi chú: {item.note}</p> : null}
                    {item.ghi_chu_duyet ? <p className="workforce-detail-note">Phản hồi manager: {item.ghi_chu_duyet}</p> : null}
                  </article>
                ))}
              </div>
              {approvedRequests.length > PAGE_SIZE ? (
                <div className="ops-pagination" style={{ marginTop: '0.6rem' }}>
                  <span>{(approvedSafePage - 1) * PAGE_SIZE + 1}-{Math.min(approvedSafePage * PAGE_SIZE, approvedRequests.length)} / {approvedRequests.length}</span>
                  <div>
                    <button type="button" className="secondary" onClick={() => setApprovedPage(1)} disabled={approvedSafePage <= 1}>Đầu</button>
                    <button type="button" className="secondary" onClick={() => setApprovedPage((p) => Math.max(1, p - 1))} disabled={approvedSafePage <= 1}>Trước</button>
                    <strong>Trang {approvedSafePage}/{approvedTotalPages}</strong>
                    <button type="button" className="secondary" onClick={() => setApprovedPage((p) => Math.min(approvedTotalPages, p + 1))} disabled={approvedSafePage >= approvedTotalPages}>Sau</button>
                    <button type="button" className="secondary" onClick={() => setApprovedPage(approvedTotalPages)} disabled={approvedSafePage >= approvedTotalPages}>Cuối</button>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* Rejected Requests Section */}
          {rejectedRequests.length > 0 && (
            <div className="workforce-request-section">
              <h4>Yêu cầu bị từ chối ({rejectedRequests.length})</h4>
              <div className="employee-list">
                {rejectedPageRows.map((item) => (
                  <article key={item.ma_ca_lam_viec} className="employee-card">
                    <div className="employee-card-head">
                      <div>
                        <h3>{item.ten_ca}</h3>
                        <p>{item.ngay_lam_viec} • {item.gio_bat_dau} - {item.gio_ket_thuc}</p>
                      </div>
                      <span className="employee-status-pill employee-status-pill--rejected">REJECTED</span>
                    </div>
                    {item.note ? <p className="workforce-detail-note">Ghi chú: {item.note}</p> : null}
                    {item.ghi_chu_duyet ? <p className="workforce-detail-note">Lý do từ chối: {item.ghi_chu_duyet}</p> : null}
                  </article>
                ))}
              </div>
              {rejectedRequests.length > PAGE_SIZE ? (
                <div className="ops-pagination" style={{ marginTop: '0.6rem' }}>
                  <span>{(rejectedSafePage - 1) * PAGE_SIZE + 1}-{Math.min(rejectedSafePage * PAGE_SIZE, rejectedRequests.length)} / {rejectedRequests.length}</span>
                  <div>
                    <button type="button" className="secondary" onClick={() => setRejectedPage(1)} disabled={rejectedSafePage <= 1}>Đầu</button>
                    <button type="button" className="secondary" onClick={() => setRejectedPage((p) => Math.max(1, p - 1))} disabled={rejectedSafePage <= 1}>Trước</button>
                    <strong>Trang {rejectedSafePage}/{rejectedTotalPages}</strong>
                    <button type="button" className="secondary" onClick={() => setRejectedPage((p) => Math.min(rejectedTotalPages, p + 1))} disabled={rejectedSafePage >= rejectedTotalPages}>Sau</button>
                    <button type="button" className="secondary" onClick={() => setRejectedPage(rejectedTotalPages)} disabled={rejectedSafePage >= rejectedTotalPages}>Cuối</button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Tab: Lịch làm việc */}
      {activeTab === TABS.SCHEDULE && (
        <>
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
                  <span className={`workforce-status-pill ${getAttendanceToneClass(selectedInsight)}`}>{selectedInsight.shortLabel}</span>
                </div>
                <div className="workforce-detail-meta">
                  <span>Số giờ ca: {selectedShiftDetails.so_gio_ca}</span>
                  <span>Check-in: {selectedShiftDetails.check_in_at ? new Date(selectedShiftDetails.check_in_at).toLocaleString('vi-VN') : 'Chưa có'}</span>
                  <span>Check-out: {selectedShiftDetails.check_out_at ? new Date(selectedShiftDetails.check_out_at).toLocaleString('vi-VN') : 'Chưa có'}</span>
                  <span>Giờ thực tế: {selectedInsight.workedHours}</span>
                </div>
                <div className="workforce-flag-row">
                  {selectedInsight.flags.length ? selectedInsight.flags.map((flag) => (
                    <span key={flag} className="workforce-flag-pill workforce-flag-pill--warning">{flag}</span>
                  )) : <span className="workforce-flag-pill workforce-flag-pill--good">Chấm công đầy đủ và đúng giờ</span>}
                </div>
                <div className="workforce-detail-actions">
                  <button
                    type="button"
                    onClick={() => handleSelfAttendance('CHECK_IN')}
                    disabled={
                      !selectedShiftDetails ||
                      isFutureShift ||
                      hasCheckedIn ||
                      checkingAttendanceShiftId === String(selectedShiftDetails.ma_ca_lam_viec)
                    }
                    title={
                      isFutureShift
                        ? 'Ca tương lai chưa thể chấm công'
                        : hasCheckedIn
                          ? 'Bạn đã check-in ca này'
                          : 'Check-in ca đang chọn'
                    }
                  >
                    {checkingAttendanceShiftId === String(selectedShiftDetails.ma_ca_lam_viec) ? 'Đang xử lý...' : 'Check-in ca này'}
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => handleSelfAttendance('CHECK_OUT')}
                    disabled={
                      !selectedShiftDetails ||
                      isFutureShift ||
                      !hasCheckedIn ||
                      hasCheckedOut ||
                      checkingAttendanceShiftId === String(selectedShiftDetails.ma_ca_lam_viec)
                    }
                    title={
                      isFutureShift
                        ? 'Ca tương lai chưa thể chấm công'
                        : !hasCheckedIn
                          ? 'Bạn cần check-in trước khi check-out'
                          : hasCheckedOut
                            ? 'Bạn đã check-out ca này'
                            : 'Check-out ca đang chọn'
                    }
                  >
                    {checkingAttendanceShiftId === String(selectedShiftDetails.ma_ca_lam_viec) ? 'Đang xử lý...' : 'Check-out ca này'}
                  </button>
                </div>
                {isFutureShift ? <p className="workforce-detail-note">Ca ở tương lai: chưa đến ngày nên không thể check-in/check-out.</p> : null}
                {attendanceMessage ? <p>{attendanceMessage}</p> : null}
                {attendanceError ? <p className="error-text">{attendanceError}</p> : null}
                {selectedInsight.isLate ? <p className="workforce-detail-note">Bạn check-in muộn {formatMinutesLabel(selectedInsight.lateMinutes)} so với giờ bắt đầu ca.</p> : null}
                {selectedInsight.leftEarly ? <p className="workforce-detail-note">Bạn check-out sớm {formatMinutesLabel(selectedInsight.earlyLeaveMinutes)} so với giờ kết thúc ca.</p> : null}
                {selectedShiftDetails.note ? <p className="workforce-detail-note">Ghi chú: {selectedShiftDetails.note}</p> : null}
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
