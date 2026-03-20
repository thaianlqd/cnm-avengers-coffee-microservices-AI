import { useEffect, useMemo, useState } from 'react'
import { WorkforceCalendar, getInitialWeekStart } from '../../staff-dashboard/components/WorkforceCalendar'
import {
  calcWorkedHours,
  formatMinutesLabel,
  getAttendanceInsight,
  getAttendanceMetrics,
  getAttendanceToneClass,
  normalizeAttendanceStatus,
} from '../../workforce/attendance'

const SHIFT_CODES = [
  { id: 'SANG', label: 'Ca sáng' },
  { id: 'CHIEU', label: 'Ca chiều' },
  { id: 'TOI', label: 'Ca tối' },
]

const TASK_TEMPLATES = [
  'Pha chế đồ uống theo giờ cao điểm',
  'Thu ngân + hỗ trợ đóng gói đơn mang đi',
  'Chuẩn bị topping, nguyên liệu trước ca',
  'Kiểm kê quầy bar cuối ca',
  'Dọn vệ sinh khu vực khách ngồi',
]

const TABS = {
  MANAGE: 'manage',
  APPROVE: 'approve',
  SCHEDULE: 'schedule',
}

function addWeeks(date, amount) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount * 7)
  return next
}

function resolveUsername(user) {
  return String(user?.ten_dang_nhap || user?.tenDangNhap || user?.username || user?.email || '').trim()
}

function normalizeUsernameKey(value) {
  return String(value || '').trim().toLowerCase()
}

function toDateTimeLocalInput(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  const hour = String(parsed.getHours()).padStart(2, '0')
  const minute = String(parsed.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hour}:${minute}`
}

function toIsoDateTimeOrNull(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString()
}

export function ManagerWorkforcePanel({
  workShiftState,
  workforceUsersState,
  workShiftForm,
  setWorkShiftForm,
  creatingWorkShift,
  onCreateWorkShift,
  onUpdateAttendance,
  onDeleteWorkShift,
  updatingWorkShiftId,
  shiftRequestState,
  handlingShiftRequestId,
  onHandleShiftRequest,
  onDeleteShiftRequest,
}) {
  const [weekStart, setWeekStart] = useState(getInitialWeekStart)
  const [selectedStaffFilter, setSelectedStaffFilter] = useState('ALL')
  const [selectedShift, setSelectedShift] = useState(null)
  const [activeTab, setActiveTab] = useState(TABS.MANAGE)
  const [taskDraft, setTaskDraft] = useState('')
  const [attendanceDraft, setAttendanceDraft] = useState({
    status: 'ASSIGNED',
    checkInAt: '',
    checkOutAt: '',
    note: '',
  })
  const [requestDrafts, setRequestDrafts] = useState({})

  const staffOptions = useMemo(
    () => workforceUsersState.items.filter((item) => item.vai_tro === 'STAFF'),
    [workforceUsersState.items],
  )

  useEffect(() => {
    if (workShiftForm.staff_username || !staffOptions.length) return
    const first = staffOptions[0]
    const firstUsername = resolveUsername(first)
    setWorkShiftForm((prev) => ({
      ...prev,
      staff_username: firstUsername,
      staff_name: first.ho_ten || firstUsername,
    }))
  }, [staffOptions, workShiftForm.staff_username, setWorkShiftForm])

  const calendarItems = useMemo(() => {
    return workShiftState.items.filter((item) => {
      if (selectedStaffFilter === 'ALL') return true
      return normalizeUsernameKey(item.staff_username) === normalizeUsernameKey(selectedStaffFilter)
    })
  }, [workShiftState.items, selectedStaffFilter])

  const selectedShiftDetails = selectedShift
    ? workShiftState.items.find((item) => item.ma_ca_lam_viec === selectedShift.ma_ca_lam_viec) || selectedShift
    : null
  const selectedInsight = selectedShiftDetails ? getAttendanceInsight(selectedShiftDetails) : null
  const workforceSummary = useMemo(() => getAttendanceMetrics(calendarItems), [calendarItems])
  const selectedShiftCodes = useMemo(() => {
    const current = Array.isArray(workShiftForm.shift_codes) && workShiftForm.shift_codes.length
      ? workShiftForm.shift_codes
      : [workShiftForm.shift_code || 'SANG']
    return Array.from(new Set(current))
  }, [workShiftForm.shift_code, workShiftForm.shift_codes])

  useEffect(() => {
    if (!selectedShift) return
    const visibleShiftIds = new Set(calendarItems.map((item) => item.ma_ca_lam_viec))
    if (!visibleShiftIds.has(selectedShift.ma_ca_lam_viec)) {
      setSelectedShift(null)
    }
  }, [calendarItems, selectedShift])

  useEffect(() => {
    if (!selectedShiftDetails) {
      setAttendanceDraft({
        status: 'ASSIGNED',
        checkInAt: '',
        checkOutAt: '',
        note: '',
      })
      return
    }

    setAttendanceDraft({
      status: selectedShiftDetails.trang_thai_cham_cong || 'ASSIGNED',
      checkInAt: toDateTimeLocalInput(selectedShiftDetails.check_in_at),
      checkOutAt: toDateTimeLocalInput(selectedShiftDetails.check_out_at),
      note: selectedShiftDetails.note || '',
    })
  }, [selectedShiftDetails])

  const workedHours = useMemo(
    () => calcWorkedHours(selectedShiftDetails?.check_in_at, selectedShiftDetails?.check_out_at),
    [selectedShiftDetails?.check_in_at, selectedShiftDetails?.check_out_at],
  )

  const toggleShiftCode = (code) => {
    setWorkShiftForm((prev) => {
      const current = Array.isArray(prev.shift_codes) && prev.shift_codes.length
        ? [...new Set(prev.shift_codes)]
        : [prev.shift_code || 'SANG']
      const hasCode = current.includes(code)

      let nextCodes = current
      if (hasCode) {
        if (current.length === 1) return prev
        nextCodes = current.filter((item) => item !== code)
      } else {
        const maxSelectable = 3
        if (current.length >= maxSelectable) {
          window.alert('Mỗi ngày tối đa 3 ca.')
          return prev
        }
        nextCodes = [...current, code]
      }

      return {
        ...prev,
        shift_codes: nextCodes,
        shift_code: nextCodes[0] || 'SANG',
      }
    })
  }

  const luuChamCongChiTiet = () => {
    if (!selectedShiftDetails) return

    const checkInIso = toIsoDateTimeOrNull(attendanceDraft.checkInAt)
    const checkOutIso = toIsoDateTimeOrNull(attendanceDraft.checkOutAt)
    if (checkInIso && checkOutIso && new Date(checkOutIso).getTime() < new Date(checkInIso).getTime()) {
      window.alert('Check-out không được nhỏ hơn check-in.')
      return
    }

    onUpdateAttendance(selectedShiftDetails.ma_ca_lam_viec, {
      attendance_status: attendanceDraft.status,
      check_in_at: checkInIso,
      check_out_at: checkOutIso,
      note: attendanceDraft.note,
    })
  }

  const taoCheckInNhanh = () => {
    if (!selectedShiftDetails) return
    onUpdateAttendance(selectedShiftDetails.ma_ca_lam_viec, {
      attendance_status: 'PRESENT',
      check_in_at: new Date().toISOString(),
    })
  }

  const taoCheckOutNhanh = () => {
    if (!selectedShiftDetails) return
    onUpdateAttendance(selectedShiftDetails.ma_ca_lam_viec, {
      attendance_status: 'PRESENT',
      check_out_at: new Date().toISOString(),
    })
  }

  const pendingRequests = useMemo(() => {
    return (shiftRequestState?.items || []).filter(item => item.trang_thai_yeu_cau === 'PENDING')
  }, [shiftRequestState?.items])

  const rejectedRequests = useMemo(() => {
    return (shiftRequestState?.items || []).filter(item => item.trang_thai_yeu_cau === 'REJECTED')
  }, [shiftRequestState?.items])

  const handleDeleteRequest = (requestId) => {
    if (confirm('Xác nhận xóa yêu cầu đăng ký ca này?')) {
      onDeleteShiftRequest(requestId)
    }
  }

  return (
    <section className="panel workforce-panel workforce-panel--manager">
      <div className="panel-head">
        <h2>Quản lý lịch làm nhân viên</h2>
        <span>Chia ca theo tuần, chọn nhân viên bằng danh sách có sẵn</span>
      </div>

      {/* Tab Navigation */}
      <div className="workforce-tabs">
        <button
          type="button"
          className={`workforce-tab ${activeTab === TABS.MANAGE ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.MANAGE)}
        >
          Quản lý ca
        </button>
        <button
          type="button"
          className={`workforce-tab ${activeTab === TABS.APPROVE ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.APPROVE)}
        >
          Duyệt yêu cầu ({pendingRequests.length})
        </button>
        <button
          type="button"
          className={`workforce-tab ${activeTab === TABS.SCHEDULE ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.SCHEDULE)}
        >
          Lịch làm
        </button>
      </div>

      {/* Tab: Quản lý ca */}
      {activeTab === TABS.MANAGE && (
        <>
          <form className="workforce-form" onSubmit={onCreateWorkShift}>
            <div className="workforce-form-topbar">
              <label>
                Nhân viên
                <select
                  value={workShiftForm.staff_username}
                  onChange={(e) => {
                    const nextUser = staffOptions.find((item) => resolveUsername(item) === e.target.value)
                    setWorkShiftForm((prev) => ({
                      ...prev,
                      staff_username: e.target.value,
                      staff_name: nextUser?.ho_ten || e.target.value,
                    }))
                  }}
                  disabled={!staffOptions.length}
                >
                  {!staffOptions.length ? <option value="">Chưa có nhân viên</option> : null}
                  {staffOptions.map((item) => (
                    <option key={item.ma_nguoi_dung} value={resolveUsername(item)}>
                      {item.ho_ten || resolveUsername(item)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Ngày làm
                <input
                  type="date"
                  value={workShiftForm.shift_date}
                  onChange={(e) => setWorkShiftForm((prev) => ({ ...prev, shift_date: e.target.value }))}
                  required
                />
              </label>

              <label className="workforce-shift-selector-wrap">
                Khung ca (chon nhieu)
                <div className="workforce-shift-selector">
                  {SHIFT_CODES.map((item) => (
                    <label key={item.id} className={selectedShiftCodes.includes(item.id) ? 'workforce-shift-check active' : 'workforce-shift-check'}>
                      <input
                        type="checkbox"
                        checked={selectedShiftCodes.includes(item.id)}
                        onChange={() => toggleShiftCode(item.id)}
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
                <small>
                  Tick bao nhieu checkbox la so ca trong ngay. Toi da 3 ca/ngay.
                </small>
              </label>
            </div>

            <div className="workforce-form-bottombar">
              <label className="workforce-note-field">
                Ghi chú
                <input
                  value={workShiftForm.note}
                  onChange={(e) => setWorkShiftForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Ví dụ: hỗ trợ quầy mang đi"
                />
              </label>
              <button type="submit" disabled={creatingWorkShift || !workShiftForm.staff_username || !selectedShiftCodes.length}>
                {creatingWorkShift ? 'Đang tạo lịch...' : 'Thêm lịch làm'}
              </button>
            </div>
          </form>

          <div className="workforce-assignment-card">
            <div className="workforce-detail-head">
              <div>
                <h3>Phân công việc làm</h3>
                <p>Soạn nhanh checklist công việc và gán vào ghi chú khi tạo lịch mới.</p>
              </div>
            </div>

            <div className="workforce-assignment-templates">
              {TASK_TEMPLATES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className="secondary"
                  onClick={() => setTaskDraft((prev) => (prev ? `${prev}\n- ${item}` : `- ${item}`))}
                >
                  + {item}
                </button>
              ))}
            </div>

            <label className="workforce-note-field">
              Checklist ca làm
              <textarea
                rows={4}
                value={taskDraft}
                onChange={(e) => setTaskDraft(e.target.value)}
                placeholder="Ví dụ:\n- Setup quầy trước 7h\n- Hỗ trợ đơn mang đi khung 11h-13h"
              />
            </label>

            <div className="workforce-detail-actions">
              <button
                type="button"
                onClick={() => {
                  if (!taskDraft.trim()) return
                  setWorkShiftForm((prev) => ({
                    ...prev,
                    note: [prev.note?.trim(), taskDraft.trim()].filter(Boolean).join(' | '),
                  }))
                }}
              >
                Gắn vào ghi chú lịch đang tạo
              </button>
              <button type="button" className="secondary" onClick={() => setTaskDraft('')}>
                Xóa checklist
              </button>
            </div>
          </div>
        </>
      )}

      {/* Tab: Duyệt yêu cầu */}
      {activeTab === TABS.APPROVE && (
        <div className="workforce-assignment-card">
          <div className="workforce-detail-head">
            <div>
              <h3>Duyệt yêu cầu đăng ký ca từ staff</h3>
              <p>Manager duyệt/từ chối, có thể chỉnh ghi chú trước khi duyệt.</p>
            </div>
          </div>

          {shiftRequestState?.loading ? <p>Đang tải yêu cầu đăng ký ca...</p> : null}
          {shiftRequestState?.error ? <p className="error-text">{shiftRequestState.error}</p> : null}

          {/* Pending Requests */}
          {pendingRequests.length > 0 && (
            <div className="workforce-request-section">
              <h4>Yêu cầu đang chờ duyệt ({pendingRequests.length})</h4>
              <div className="employee-list">
                {pendingRequests.map((item) => {
                  const draft = requestDrafts[item.ma_ca_lam_viec] || {
                    review_note: item.ghi_chu_duyet || '',
                    adjusted_note: item.note || '',
                  }

                  return (
                    <article key={item.ma_ca_lam_viec} className="employee-card">
                      <div className="employee-card-head">
                        <div>
                          <h3>{item.staff_name || item.staff_username}</h3>
                          <p>{item.ngay_lam_viec} • {item.ten_ca} ({item.gio_bat_dau}-{item.gio_ket_thuc})</p>
                        </div>
                        <span className="employee-status-pill employee-status-pill--pending">PENDING</span>
                      </div>

                      {item.note ? <p className="workforce-detail-note">Ghi chú staff: {item.note}</p> : null}

                      <label className="workforce-note-field">
                        Ghi chú manager
                        <textarea
                          rows={2}
                          value={draft.review_note}
                          onChange={(e) => setRequestDrafts((prev) => ({
                            ...prev,
                            [item.ma_ca_lam_viec]: { ...draft, review_note: e.target.value },
                          }))}
                          placeholder="Nhập phản hồi cho yêu cầu này"
                        />
                      </label>

                      <div className="workforce-detail-actions">
                        <button
                          type="button"
                          onClick={() => onHandleShiftRequest(item.ma_ca_lam_viec, {
                            status: 'APPROVED',
                            review_note: draft.review_note,
                            adjusted_note: draft.adjusted_note,
                          })}
                          disabled={handlingShiftRequestId === String(item.ma_ca_lam_viec)}
                        >
                          Duyệt yêu cầu
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => onHandleShiftRequest(item.ma_ca_lam_viec, {
                            status: 'REJECTED',
                            review_note: draft.review_note,
                          })}
                          disabled={handlingShiftRequestId === String(item.ma_ca_lam_viec)}
                        >
                          Từ chối
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          )}

          {/* Rejected Requests */}
          {rejectedRequests.length > 0 && (
            <div className="workforce-request-section">
              <h4>Yêu cầu bị từ chối ({rejectedRequests.length})</h4>
              <div className="employee-list">
                {rejectedRequests.map((item) => (
                  <article key={item.ma_ca_lam_viec} className="employee-card">
                    <div className="employee-card-head">
                      <div>
                        <h3>{item.staff_name || item.staff_username}</h3>
                        <p>{item.ngay_lam_viec} • {item.ten_ca} ({item.gio_bat_dau}-{item.gio_ket_thuc})</p>
                      </div>
                      <span className="employee-status-pill employee-status-pill--rejected">REJECTED</span>
                    </div>

                    {item.note ? <p className="workforce-detail-note">Ghi chú staff: {item.note}</p> : null}
                    {item.ghi_chu_duyet ? <p className="workforce-detail-note">Lý do từ chối: {item.ghi_chu_duyet}</p> : null}

                    <div className="workforce-detail-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => handleDeleteRequest(item.ma_ca_lam_viec)}
                        disabled={handlingShiftRequestId === String(item.ma_ca_lam_viec)}
                      >
                        {handlingShiftRequestId === String(item.ma_ca_lam_viec) ? 'Đang xóa...' : 'Xóa'}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {!pendingRequests.length && !rejectedRequests.length && !shiftRequestState?.loading && (
            <p className="employee-empty">Không có yêu cầu nào cần xử lý.</p>
          )}
        </div>
      )}

      {/* Tab: Lịch làm */}
      {activeTab === TABS.SCHEDULE && (
        <>
          <div className="workforce-filter-row workforce-filter-row--calendar">
            <label>
              Xem lịch theo nhân viên
              <select value={selectedStaffFilter} onChange={(e) => setSelectedStaffFilter(e.target.value)}>
                <option value="ALL">Tất cả nhân viên</option>
                {staffOptions.map((item) => (
                  <option key={item.ma_nguoi_dung} value={resolveUsername(item)}>
                    {item.ho_ten || resolveUsername(item)}
                  </option>
                ))}
              </select>
            </label>
            <small>{calendarItems.length} ca đã xếp</small>
          </div>

          <div className="workforce-summary-grid">
            <article>
              <strong>{workforceSummary.totalShifts}</strong>
              <span>Tổng ca theo bộ lọc</span>
            </article>
            <article>
              <strong>{workforceSummary.checkedInCount}</strong>
              <span>Đang trong ca</span>
            </article>
            <article>
              <strong>{workforceSummary.completedCount}</strong>
              <span>Đã check-out</span>
            </article>
            <article>
              <strong>{workforceSummary.lateCount}</strong>
              <span>Ca đi muộn</span>
            </article>
            <article>
              <strong>{workforceSummary.earlyLeaveCount}</strong>
              <span>Ca về sớm</span>
            </article>
            <article>
              <strong>{workforceSummary.absentCount}</strong>
              <span>Ca vắng mặt</span>
            </article>
          </div>

          {workforceUsersState.error ? <p className="error-text">{workforceUsersState.error}</p> : null}
          {workShiftState.error ? <p className="error-text">{workShiftState.error}</p> : null}
          {workShiftState.loading ? <p>Đang tải lịch làm việc...</p> : null}

          <WorkforceCalendar
            items={calendarItems}
            weekStart={weekStart}
            onChangeWeek={(delta) => setWeekStart((prev) => addWeeks(prev, delta))}
            onResetWeek={() => setWeekStart(getInitialWeekStart())}
            onSelectItem={setSelectedShift}
            selectedItemId={selectedShiftDetails?.ma_ca_lam_viec || ''}
            mode="manager"
          />

          <div className="workforce-detail-card">
            {!selectedShiftDetails ? (
              <p>Chọn một ô lịch để xem chi tiết ca, cập nhật chấm công hoặc xóa lịch.</p>
            ) : (
              <>
                <div className="workforce-detail-head">
                  <div>
                    <h3>{selectedShiftDetails.staff_name || selectedShiftDetails.staff_username}</h3>
                    <p>
                      {selectedShiftDetails.ngay_lam_viec} | {selectedShiftDetails.ten_ca} ({selectedShiftDetails.gio_bat_dau} - {selectedShiftDetails.gio_ket_thuc})
                    </p>
                  </div>
                  <span className={`workforce-status-pill ${getAttendanceToneClass(selectedInsight)}`}>{selectedInsight.shortLabel}</span>
                </div>

                <div className="workforce-flag-row">
                  {selectedInsight.flags.length ? selectedInsight.flags.map((flag) => (
                    <span key={flag} className="workforce-flag-pill workforce-flag-pill--warning">{flag}</span>
                  )) : <span className="workforce-flag-pill workforce-flag-pill--good">Ca này đang đúng tiến độ chấm công</span>}
                </div>

                <div className="workforce-detail-actions">
                  <label>
                    Chấm công
                    <select
                      value={normalizeAttendanceStatus(attendanceDraft.status)}
                      onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, status: e.target.value }))}
                      disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                    >
                      <option value="ASSIGNED">Đã xếp lịch</option>
                      <option value="PRESENT">Có mặt</option>
                      <option value="ABSENT">Vắng mặt</option>
                    </select>
                  </label>

                  <label>
                    Check-in
                    <input
                      type="datetime-local"
                      value={attendanceDraft.checkInAt}
                      onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, checkInAt: e.target.value }))}
                      disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                    />
                  </label>

                  <label>
                    Check-out
                    <input
                      type="datetime-local"
                      value={attendanceDraft.checkOutAt}
                      onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, checkOutAt: e.target.value }))}
                      disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                    />
                  </label>

                  <label className="workforce-note-field">
                    Ghi chú ca
                    <input
                      value={attendanceDraft.note}
                      onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, note: e.target.value }))}
                      disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                    />
                  </label>
                </div>

                <div className="workforce-detail-actions">
                  <button
                    type="button"
                    onClick={luuChamCongChiTiet}
                    disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                  >
                    Luu cham cong
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={taoCheckInNhanh}
                    disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                  >
                    Check-in nhanh
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={taoCheckOutNhanh}
                    disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                  >
                    Check-out nhanh
                  </button>

                  <button
                    type="button"
                    className="secondary"
                    onClick={() => onDeleteWorkShift(selectedShiftDetails.ma_ca_lam_viec)}
                    disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                  >
                    Xóa lịch
                  </button>
                </div>

                <div className="workforce-detail-meta">
                  <span>Số giờ ca: {selectedShiftDetails.so_gio_ca}</span>
                  <span>Giờ làm thực tế: {workedHours}</span>
                  <span>Quản lý tạo: {selectedShiftDetails.manager_username || 'N/A'}</span>
                  <span>Check-in: {selectedShiftDetails.check_in_at ? new Date(selectedShiftDetails.check_in_at).toLocaleString('vi-VN') : 'Chưa có'}</span>
                  <span>Check-out: {selectedShiftDetails.check_out_at ? new Date(selectedShiftDetails.check_out_at).toLocaleString('vi-VN') : 'Chưa có'}</span>
                </div>

                {selectedInsight.isLate ? <p className="workforce-detail-note">Nhân viên check-in muộn {formatMinutesLabel(selectedInsight.lateMinutes)}.</p> : null}
                {selectedInsight.leftEarly ? <p className="workforce-detail-note">Nhân viên check-out sớm {formatMinutesLabel(selectedInsight.earlyLeaveMinutes)}.</p> : null}

                {selectedShiftDetails.note ? <p className="workforce-detail-note">Ghi chú: {selectedShiftDetails.note}</p> : null}
              </>
            )}
          </div>
        </>
      )}
    </section>
  )
}
