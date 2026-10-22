import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import { Calendar as WorkspaceSymbolCalendar } from '../../../components/console/WorkspaceIcons'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PlusCircle,
  UserCheck,
  Briefcase,
  Users,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Award,
  RefreshCw,
  Trash2,
  FileText,
  ListChecks,
  Plus
} from '../../../components/console/WorkspaceIcons'
import { WorkforceCalendar, getInitialWeekStart } from '../../staff-dashboard/components/WorkforceCalendar'
import SmartSelect from '../../../components/console/SmartSelect'
import {
  calcWorkedHours,
  formatMinutesLabel,
  getAttendanceInsight,
  getAttendanceMetrics,
  getAttendanceToneClass,
  normalizeAttendanceStatus,
} from '../../workforce/attendance'

const SHIFT_CODES = [
  { id: 'SANG', label: 'Ca sáng (07:00 - 12:00)' },
  { id: 'CHIEU', label: 'Ca chiều (12:00 - 17:00)' },
  { id: 'TOI', label: 'Ca tối (17:00 - 22:00)' },
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
const PAGE_SIZE = 8

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
  workShiftState = { items: [], loading: false, error: null },
  workforceUsersState = { items: [], loading: false, error: null },
  workShiftForm,
  setWorkShiftForm,
  creatingWorkShift,
  onCreateWorkShift,
  onUpdateAttendance,
  onDeleteWorkShift,
  updatingWorkShiftId,
  shiftRequestState = { items: [], loading: false, error: null },
  handlingShiftRequestId,
  onHandleShiftRequest,
  onDeleteShiftRequest,
}) {
  const [weekStart, setWeekStart] = useState(getInitialWeekStart)
  const [selectedStaffFilter, setSelectedStaffFilter] = useState('ALL')
  const [selectedShift, setSelectedShift] = useState(null)
  const [activeTab, setActiveTab] = useState(TABS.MANAGE)
  const [taskDraft, setTaskDraft] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createError, setCreateError] = useState('')
  const [attendanceDraft, setAttendanceDraft] = useState({
    status: 'ASSIGNED',
    checkInAt: '',
    checkOutAt: '',
    note: '',
  })
  const [requestDrafts, setRequestDrafts] = useState({})
  const [pendingPage, setPendingPage] = useState(1)
  const [rejectedPage, setRejectedPage] = useState(1)

  const assignableStaffOptions = useMemo(
    () => (workforceUsersState.items || []).filter((item) => {
      const role = String(item.vai_tro || '').toUpperCase()
      return role === 'STAFF' || role === 'MANAGER'
    }),
    [workforceUsersState.items],
  )

  const scheduleFilterOptions = useMemo(
    () => (workforceUsersState.items || []).filter((item) => {
      const role = String(item.vai_tro || '').toUpperCase()
      return role === 'STAFF' || role === 'MANAGER'
    }),
    [workforceUsersState.items],
  )

  useEffect(() => {
    if (workShiftForm.staff_username || !assignableStaffOptions.length) return
    const first = assignableStaffOptions[0]
    const firstUsername = resolveUsername(first)
    setWorkShiftForm((prev) => ({
      ...prev,
      staff_username: firstUsername,
      staff_name: first.ho_ten || firstUsername,
    }))
  }, [assignableStaffOptions, workShiftForm.staff_username, setWorkShiftForm])

  const calendarItems = useMemo(() => {
    return (workShiftState.items || []).filter((item) => {
      if (selectedStaffFilter === 'ALL') return true
      return normalizeUsernameKey(item.staff_username) === normalizeUsernameKey(selectedStaffFilter)
    })
  }, [workShiftState.items, selectedStaffFilter])

  const selectedShiftDetails = selectedShift
    ? (workShiftState.items || []).find((item) => item.ma_ca_lam_viec === selectedShift.ma_ca_lam_viec) || selectedShift
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
          window.alert('Mỗi ngày tối đa chọn 3 ca.')
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
      window.alert('Giờ Check-out không được nhỏ hơn giờ Check-in.')
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

  const pendingTotalPages = useMemo(() => Math.max(1, Math.ceil(pendingRequests.length / PAGE_SIZE)), [pendingRequests.length])
  const pendingSafePage = useMemo(() => Math.min(Math.max(pendingPage, 1), pendingTotalPages), [pendingPage, pendingTotalPages])
  const pendingPageRows = useMemo(
    () => pendingRequests.slice((pendingSafePage - 1) * PAGE_SIZE, pendingSafePage * PAGE_SIZE),
    [pendingRequests, pendingSafePage],
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
    if (rejectedPage > rejectedTotalPages) setRejectedPage(rejectedTotalPages)
  }, [rejectedPage, rejectedTotalPages])

  const handleDeleteRequest = (requestId) => {
    if (confirm('Xác nhận xóa yêu cầu đăng ký ca này?')) {
      onDeleteShiftRequest(requestId)
    }
  }

  return (
    <div className="panel-container workspace-workforce" style={{
      padding: '1.75rem',
      background: '#f8f9f6',
      borderRadius: '20px',
      border: '1px solid #e2e4df',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)'
    }}>
      {/* Header */}
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
            background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)'
          }}>
            <Users size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#252927' }}>
              Quản lý Lịch Làm Nhân Sự
            </h2>
            <span style={{ fontSize: '0.825rem', color: '#69736a' }}>
              Phân công ca làm việc, duyệt đăng ký ca từ nhân viên và kiểm soát chấm công toàn quán
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="workspace-workforce-tabs" style={{
        display: 'flex',
        gap: '0.5rem',
        background: '#ffffff',
        padding: '0.35rem',
        borderRadius: '12px',
        border: '1px solid #e2e4df',
        marginBottom: '1.5rem'
      }}>
        <button
          type="button"
          onClick={() => setActiveTab(TABS.MANAGE)}
          style={{
            flex: 1,
            padding: '0.65rem 1rem',
            borderRadius: '9px',
            border: 'none',
            background: activeTab === TABS.MANAGE ? "var(--primary)" : 'transparent',
            color: activeTab === TABS.MANAGE ? '#ffffff' : '#69736a',
            fontWeight: activeTab === TABS.MANAGE ? '700' : '500',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s ease'
          }}
        >
          <Briefcase size={16} /> Quản lý phân ca
        </button>

        <button
          type="button"
          onClick={() => setActiveTab(TABS.APPROVE)}
          style={{
            flex: 1,
            padding: '0.65rem 1rem',
            borderRadius: '9px',
            border: 'none',
            background: activeTab === TABS.APPROVE ? "var(--primary)" : 'transparent',
            color: activeTab === TABS.APPROVE ? '#ffffff' : '#69736a',
            fontWeight: activeTab === TABS.APPROVE ? '700' : '500',
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            transition: 'all 0.2s ease'
          }}
        >
          <UserCheck size={16} /> Duyệt đăng ký ({pendingRequests.length})
        </button>

        <button
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
          <Calendar size={16} /> Lịch làm tổng quan
        </button>
      </div>

      {/* TAB 1: QUẢN LÝ PHÂN CA */}
      {activeTab === TABS.MANAGE && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Form phân ca */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" className="workspace-primary-button" onClick={() => { setCreateError(''); setCreateOpen(true) }}><Calendar size={18} />Phân ca mới</button></div>
          {createOpen && <WorkspaceDialog title="Phân ca làm việc" busy={creatingWorkShift} onClose={() => setCreateOpen(false)}><form className="workspace-form"
            onSubmit={async event => { setCreateError(''); try { const result = await onCreateWorkShift(event); if (result?.ok) setCreateOpen(false); else if (result?.error) setCreateError(result.error) } catch (error) { setCreateError(error.message || 'Không thể tạo lịch làm việc.') } }}
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
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#252927', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <PlusCircle size={18} color="#3b82f6" /> Thêm lịch làm mới cho nhân viên
            </h3>

{createError && <p className="workspace-form-error" role="alert">{createError}</p>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#414743', display: 'block', marginBottom: '0.35rem' }}>
                  Nhân viên được chọn
                </label>
                <SmartSelect
                  label="Tìm nhân viên để xếp ca"
                  placeholder="Gõ tên hoặc tài khoản nhân viên"
                  value={workShiftForm.staff_username}
                  onChange={(username) => {
                    const nextUser = assignableStaffOptions.find((item) => resolveUsername(item) === username)
                    setWorkShiftForm((prev) => ({
                      ...prev,
                      staff_username: username,
                      staff_name: nextUser?.ho_ten || username,
                    }))
                  }}
                  disabled={!assignableStaffOptions.length}
                  options={assignableStaffOptions.map(item => ({ value: resolveUsername(item), label: `${item.ho_ten || resolveUsername(item)} (${String(item.vai_tro || '').toUpperCase()})`, keywords: item.email }))}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#414743', display: 'block', marginBottom: '0.35rem' }}>
                  Ngày làm việc
                </label>
                <input
                  type="date"
                  value={workShiftForm.shift_date}
                  onChange={(e) => setWorkShiftForm((prev) => ({ ...prev, shift_date: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '10px',
                    border: '1px solid #ccd3c7',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#414743', display: 'block', marginBottom: '0.35rem' }}>
                  Khung ca làm (Chọn 1 hoặc nhiều ca trong ngày)
                </label>
                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                  {SHIFT_CODES.map((item) => {
                    const isSelected = selectedShiftCodes.includes(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggleShiftCode(item.id)}
                        style={{
                          padding: '0.5rem 0.85rem',
                          borderRadius: '8px',
                          border: isSelected ? "1px solid var(--primary)" : '1px solid #ccd3c7',
                          background: isSelected ? "#f4f5f2" : '#ffffff',
                          color: isSelected ? "var(--primary)" : '#596255',
                          fontWeight: isSelected ? '700' : '500',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        {isSelected ? <Check size={14} color="#1d4ed8" /> : <Plus size={14} />}
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#414743', display: 'block', marginBottom: '0.35rem' }}>
                  Ghi chú phân công
                </label>
                <input
                  type="text"
                  value={workShiftForm.note}
                  onChange={(e) => setWorkShiftForm((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="Ví dụ: Phụ trách quầy mang đi, kiểm kê kho..."
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '10px',
                    border: '1px solid #ccd3c7',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div className="workspace-editor-actions"><button type="button" className="workspace-secondary-button" disabled={creatingWorkShift} onClick={() => setCreateOpen(false)}>Hủy</button>
              <button
                type="submit"
                disabled={creatingWorkShift || !workShiftForm.staff_username || !selectedShiftCodes.length}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.65rem 1.25rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: "var(--primary)",
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: '700',
                  cursor: creatingWorkShift ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 10px rgba(59, 130, 246, 0.25)'
                }}
              >
                <PlusCircle size={16} />
                {creatingWorkShift ? 'Đang tạo lịch...' : 'Tạo lịch làm việc'}
              </button>
            </div>
          </form></WorkspaceDialog>}

          {/* Checklist Mẫu */}
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e4df',
            padding: '1.5rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', fontWeight: '600', color: '#252927', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ListChecks size={18} color="var(--primary)" /> Phân công công việc (Checklist ca)
            </h3>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#69736a' }}>
              Chọn các công việc mẫu bên dưới để gắn nhanh vào ghi chú lịch làm đang tạo:
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {TASK_TEMPLATES.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTaskDraft((prev) => (prev ? `${prev}\n- ${item}` : `- ${item}`))}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #ccd3c7',
                    background: '#f8f9f6',
                    color: '#414743',
                    fontSize: '0.8rem',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  + {item}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              placeholder="Danh sách việc cần làm trong ca..."
              style={{
                width: '100%',
                padding: '0.65rem',
                borderRadius: '10px',
                border: '1px solid #ccd3c7',
                fontSize: '0.85rem',
                marginBottom: '1rem',
                boxSizing: 'border-box'
              }}
            />

            <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  if (!taskDraft.trim()) return
                  setWorkShiftForm((prev) => ({
                    ...prev,
                    note: [prev.note?.trim(), taskDraft.trim()].filter(Boolean).join(' | '),
                  }))
                }}
                style={{
                  background: 'var(--primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.55rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Gắn vào ghi chú lịch đang tạo
              </button>
              <button
                type="button"
                onClick={() => setTaskDraft('')}
                style={{
                  background: '#ffffff',
                  color: '#596255',
                  border: '1px solid #ccd3c7',
                  borderRadius: '8px',
                  padding: '0.55rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Xóa checklist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DUYỆT ĐĂNG KÝ CA TỪ NHÂN VIÊN */}
      {activeTab === TABS.APPROVE && (
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e4df',
          padding: '1.5rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: '600', color: '#252927', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <UserCheck size={18} color="#3b82f6" /> Phê duyệt nguyện vọng ca từ Nhân viên
          </h3>

          {pendingRequests.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
              {pendingPageRows.map((item) => {
                const draft = requestDrafts[item.ma_ca_lam_viec] || {
                  review_note: item.ghi_chu_duyet || '',
                  adjusted_note: item.note || '',
                }

                return (
                  <div key={item.ma_ca_lam_viec} style={{ background: "#f4f5f2", padding: '1.15rem', borderRadius: '14px', border: '1px solid #fde68a', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '1rem', color: '#30382e' }}>
                        {item.staff_name || item.staff_username}
                      </strong>
                      <span className="workspace-inline-label" style={{ fontSize: '0.75rem', fontWeight: '700', background: "#f4f5f2", color: '#b45309', padding: '0.2rem 0.55rem', borderRadius: '9999px' }}>
                        Chờ duyệt
                      </span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: '#596255', fontWeight: '600' }}>
                      <WorkspaceSymbolCalendar size="1.1em" aria-hidden="true" /> {item.ngay_lam_viec} • {item.ten_ca} ({item.gio_bat_dau} - {item.gio_ket_thuc})
                    </div>

                    {item.note && (
                      <div style={{ fontSize: '0.8rem', color: '#69736a', background: '#ffffff', padding: '0.4rem 0.65rem', borderRadius: '6px', border: '1px solid #fef3c7' }}>
                        Ghi chú staff: {item.note}
                      </div>
                    )}

                    <textarea
                      rows={2}
                      value={draft.review_note}
                      onChange={(e) => setRequestDrafts((prev) => ({
                        ...prev,
                        [item.ma_ca_lam_viec]: { ...draft, review_note: e.target.value },
                      }))}
                      placeholder="Ghi chú phản hồi cho nhân viên..."
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.825rem', boxSizing: 'border-box' }}
                    />

                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                      <button
                        type="button"
                        onClick={() => onHandleShiftRequest(item.ma_ca_lam_viec, {
                          status: 'APPROVED',
                          review_note: draft.review_note,
                          adjusted_note: draft.adjusted_note,
                        })}
                        disabled={handlingShiftRequestId === String(item.ma_ca_lam_viec)}
                        style={{
                          background: "var(--primary)",
                          color: '#ffffff',
                          border: 'none',
                          padding: '0.45rem 0.85rem',
                          borderRadius: '8px',
                          fontSize: '0.825rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <CheckCircle2 size={14} /> Duyệt ca
                      </button>

                      <button
                        type="button"
                        onClick={() => onHandleShiftRequest(item.ma_ca_lam_viec, {
                          status: 'REJECTED',
                          review_note: draft.review_note,
                        })}
                        disabled={handlingShiftRequestId === String(item.ma_ca_lam_viec)}
                        style={{
                          background: '#ef4444',
                          color: '#ffffff',
                          border: 'none',
                          padding: '0.45rem 0.85rem',
                          borderRadius: '8px',
                          fontSize: '0.825rem',
                          fontWeight: '700',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem'
                        }}
                      >
                        <XCircle size={14} /> Từ chối
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: '#f8f9f6', borderRadius: '12px', border: '1px dashed #ccd3c7', color: '#69736a' }}>
              <UserCheck size={36} color="#85907d" style={{ marginBottom: '0.5rem' }} />
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Hiện chưa có yêu cầu đăng ký ca nào cần phê duyệt.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: LỊCH LÀM TỔNG QUAN & CHẤM CÔNG */}
      {activeTab === TABS.SCHEDULE && (
        <>
          {/* Staff Filter Selector */}
          <div style={{
            background: '#ffffff',
            padding: '0.85rem 1.25rem',
            borderRadius: '14px',
            border: '1px solid #e2e4df',
            marginBottom: '1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.85rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} color="#3b82f6" />
              <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#414743' }}>Xem lịch làm theo Nhân viên:</span>
              <SmartSelect label="Lọc lịch theo nhân viên" value={selectedStaffFilter} onChange={setSelectedStaffFilter}
                options={[{ value: 'ALL', label: `Tất cả nhân sự (${scheduleFilterOptions.length})` }, ...scheduleFilterOptions.map(item => ({ value: resolveUsername(item), label: `${item.ho_ten || resolveUsername(item)} (${String(item.vai_tro || '').toUpperCase()})`, keywords: item.email }))]} />
            </div>

            <span className="workspace-inline-label" style={{ fontSize: '0.825rem', color: '#2563eb', fontWeight: '700', background: "#f4f5f2", padding: '0.35rem 0.75rem', borderRadius: '9999px' }}>
              {calendarItems.length} ca làm đã xếp
            </span>
          </div>

          <WorkforceCalendar
            items={calendarItems}
            weekStart={weekStart}
            onChangeWeek={(delta) => setWeekStart((prev) => addWeeks(prev, delta))}
            onResetWeek={() => setWeekStart(getInitialWeekStart())}
            onSelectItem={setSelectedShift}
            selectedItemId={selectedShiftDetails?.ma_ca_lam_viec || ''}
            mode="manager"
          />

          {/* Manager Attendance Details Panel */}
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
                Nhấp chọn một ô ca làm trên bảng lịch để xem thông tin chi tiết, điều chỉnh giờ chấm công hoặc xóa lịch ca.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f4f5f2', paddingBottom: '0.75rem' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '600', color: '#252927' }}>
                      {selectedShiftDetails.staff_name || selectedShiftDetails.staff_username}
                    </h3>
                    <span style={{ fontSize: '0.85rem', color: '#69736a', fontWeight: '600' }}>
                      {selectedShiftDetails.ngay_lam_viec} • {selectedShiftDetails.ten_ca} ({selectedShiftDetails.gio_bat_dau} - {selectedShiftDetails.gio_ket_thuc})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => onDeleteWorkShift(selectedShiftDetails.ma_ca_lam_viec)}
                    disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                    style={{
                      background: "#f4f5f2",
                      color: '#ef4444',
                      border: '1px solid #fecaca',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '8px',
                      fontSize: '0.825rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <Trash2 size={14} /> Xóa lịch ca
                  </button>
                </div>

                {/* Edit Form */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '0.85rem' }}>
                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#414743', display: 'block', marginBottom: '0.25rem' }}>
                      Trạng thái chấm công
                    </label>
                    <select
                      value={normalizeAttendanceStatus(attendanceDraft.status)}
                      onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, status: e.target.value }))}
                      disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem' }}
                    >
                      <option value="ASSIGNED">Đã xếp lịch (Chưa điểm danh)</option>
                      <option value="PRESENT">Có mặt</option>
                      <option value="LATE">Đi muộn</option>
                      <option value="ABSENT">Vắng mặt</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#414743', display: 'block', marginBottom: '0.25rem' }}>
                      Giờ Check-in
                    </label>
                    <input
                      type="datetime-local"
                      value={attendanceDraft.checkInAt}
                      onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, checkInAt: e.target.value }))}
                      disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#414743', display: 'block', marginBottom: '0.25rem' }}>
                      Giờ Check-out
                    </label>
                    <input
                      type="datetime-local"
                      value={attendanceDraft.checkOutAt}
                      onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, checkOutAt: e.target.value }))}
                      disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={luuChamCongChiTiet}
                    disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                    style={{
                      background: "var(--primary)",
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.55rem 1.1rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem'
                    }}
                  >
                    <CheckCircle2 size={16} /> Lưu chấm công
                  </button>

                  <button
                    type="button"
                    onClick={taoCheckInNhanh}
                    disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                    style={{
                      background: 'var(--primary-light)',
                      color: 'var(--primary)',
                      border: '1px solid #bfdbfe',
                      padding: '0.55rem 1.1rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    Ghi nhận vào ca
                  </button>

                  <button
                    type="button"
                    onClick={taoCheckOutNhanh}
                    disabled={updatingWorkShiftId === selectedShiftDetails.ma_ca_lam_viec}
                    style={{
                      background: 'var(--primary-light)',
                      color: 'var(--primary)',
                      border: '1px solid #bfdbfe',
                      padding: '0.55rem 1.1rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                  >
                    Ghi nhận ra ca
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
