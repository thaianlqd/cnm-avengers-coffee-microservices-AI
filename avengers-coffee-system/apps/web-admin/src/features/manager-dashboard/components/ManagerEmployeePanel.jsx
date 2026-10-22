import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import { PageNumbers } from '../../../components/console/CompactPagination'
import SmartSelect from '../../../components/console/SmartSelect'
import React, { useEffect, useMemo, useState } from 'react'
import {
  Users,
  UserCheck,
  Clock,
  AlertTriangle,
  UserX,
  CalendarOff,
  Search,
  X,
  Mail,
  Phone,
  Shield,
  Store,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Filter,
  User,
  UserPlus
} from '../../../components/console/WorkspaceIcons'
import { formatMinutesLabel, getAttendanceInsight } from '../../workforce/attendance'
import { API_BASE_URL } from '../../admin-dashboard/constants'

const PAGE_SIZE = 6

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

function roleBadgeLabel(role) {
  const r = String(role || '').toUpperCase()
  if (r === 'MANAGER') return 'Quản lý cửa hàng'
  if (r === 'STAFF') return 'Nhân viên phục vụ / Pha chế'
  return r || 'Nhân sự'
}

function statusBadgeConfig(statusKey) {
  switch (statusKey) {
    case 'CHECKED_IN':
      return {
        label: 'Đang trong ca làm',
        bg: "#f4f5f2",
        color: '#1d4ed8',
        border: '#bfdbfe',
        icon: UserCheck
      }
    case 'COMPLETED':
      return {
        label: 'Đã check-out',
        bg: 'var(--primary-subtle)',
        color: 'var(--primary-hover)',
        border: '#bfdbfe',
        icon: CheckCircle2
      }
    case 'LATE':
      return {
        label: 'Đi muộn / Về sớm',
        bg: "#f4f5f2",
        color: '#b45309',
        border: '#fde68a',
        icon: AlertTriangle
      }
    case 'SCHEDULED':
      return {
        label: 'Có lịch, chưa vào ca',
        bg: 'var(--primary-subtle)',
        color: 'var(--primary-hover)',
        border: '#e8cdbb',
        icon: Clock
      }
    case 'ABSENT':
      return {
        label: 'Vắng mặt',
        bg: "#f4f5f2",
        color: '#b91c1c',
        border: '#fca5a5',
        icon: UserX
      }
    default:
      return {
        label: 'Nghỉ / Không có lịch',
        bg: '#f4f5f2',
        color: '#69736a',
        border: '#e2e4df',
        icon: CalendarOff
      }
  }
}

function toShiftLabel(shift) {
  if (!shift) return 'Chưa có lịch hôm nay'
  const shiftName = shift.ten_ca || shift.shift_code || 'Ca làm'
  return `${shiftName}: ${shift.gio_bat_dau || '--:--'} - ${shift.gio_ket_thuc || '--:--'}`
}

export function ManagerEmployeePanel({
  workShiftState = { items: [], loading: false, error: null },
  workforceUsersState = { items: [], loading: false, error: null },
  taoKioskStaff,
  session
}) {
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)

  const [showAddModal, setShowAddModal] = useState(false)
  const [addError, setAddError] = useState('')
  const [addForm, setAddForm] = useState({ ho_ten: '', ten_dang_nhap: '', mat_khau: '', co_so_ma: '' })
  const [kiosks, setKiosks] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (showAddModal) {
      fetch(`${API_BASE_URL}/branches/public`)
        .then(res => res.json())
        .then(data => {
          if (data && data.items) {
            const myKiosks = data.items.filter(b => b.chi_nhanh_me_ma === session?.user?.coSoMa && b.loai_diem_ban === 'KIOSK_VE_TINH')
            setKiosks(myKiosks)
          }
        })
        .catch(console.error)
    }
  }, [showAddModal, session])

  const handleAddSubmit = async (e) => {
    e.preventDefault()
    if (!taoKioskStaff) return
    if (!addForm.co_so_ma) { setAddError('Vui lòng chọn kiosk trực thuộc.'); return }
    if (isSubmitting) return
    setAddError('')
    setIsSubmitting(true)
    let res
    try { res = await taoKioskStaff(addForm) } catch (error) { setAddError(error.message || 'Không thể tạo tài khoản.'); setIsSubmitting(false); return }
    setIsSubmitting(false)
    if (res.ok) {
      setShowAddModal(false)
      setAddForm({ ho_ten: '', ten_dang_nhap: '', mat_khau: '', co_so_ma: '' })
      window.location.reload()
    } else {
      setAddError(res?.message || 'Không thể tạo tài khoản.')
    }
  }

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
        acc[row.statusKey] = (acc[row.statusKey] || 0) + 1
        return acc
      },
      { total: 0, CHECKED_IN: 0, COMPLETED: 0, LATE: 0, SCHEDULED: 0, ABSENT: 0, OFF: 0 },
    )
  }, [employeeRows])

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE)), [filteredRows.length])
  const safePage = useMemo(() => Math.min(Math.max(page, 1), totalPages), [page, totalPages])
  const pageRows = useMemo(
    () => filteredRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredRows, safePage],
  )

  useEffect(() => {
    setPage(1)
  }, [keyword, statusFilter])

  return (
    <div className="panel-container" style={{
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
              Quản lý Hồ sơ & Trạng thái Nhân viên
            </h2>
            <span style={{ fontSize: '0.825rem', color: '#69736a' }}>
              Theo dõi danh sách nhân sự, thông tin liên hệ và tình hình điểm danh ca làm hôm nay
            </span>
          </div>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.65rem 1rem',
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            fontSize: '0.9rem',
            cursor: 'pointer',
            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
          }}
        >
          <UserPlus size={18} /> Thêm nhân viên Kiosk
        </button>
      </div>

      {/* Summary KPI Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          background: '#ffffff',
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          border: '1px solid #e2e4df',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#69736a', fontWeight: '500' }}>Tổng nhân viên</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '600', color: '#30382e', display: 'block' }}>{summary.total} người</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          border: '1px solid #e2e4df',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: "#f4f5f2", color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCheck size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#69736a', fontWeight: '500' }}>Đang vào ca</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '600', color: '#2563eb', display: 'block' }}>{summary.CHECKED_IN} ca</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          border: '1px solid #e2e4df',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--primary-subtle)', color: 'var(--primary-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#69736a', fontWeight: '500' }}>Đã check-out</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--primary-hover)', display: 'block' }}>{summary.COMPLETED} ca</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          border: '1px solid #e2e4df',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: "#f4f5f2", color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#69736a', fontWeight: '500' }}>Đi muộn / Về sớm</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '600', color: '#b45309', display: 'block' }}>{summary.LATE} ca</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          border: '1px solid #e2e4df',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'var(--primary-subtle)', color: 'var(--primary-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#69736a', fontWeight: '500' }}>Có lịch chưa vào</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--primary-hover)', display: 'block' }}>{summary.SCHEDULED} ca</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          border: '1px solid #e2e4df',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: "#f4f5f2", color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserX size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#69736a', fontWeight: '500' }}>Vắng mặt</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '600', color: '#b91c1c', display: 'block' }}>{summary.ABSENT} ca</strong>
          </div>
        </div>
      </div>

      {/* Toolbar Filter */}
      <div style={{
        background: '#ffffff',
        padding: '1rem 1.25rem',
        borderRadius: '16px',
        border: '1px solid #e2e4df',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.85rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '420px' }}>
          <Search size={18} color="#85907d" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm theo họ tên, username, email, SĐT..."
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem 0.55rem 2.4rem',
              borderRadius: '10px',
              border: '1px solid #ccd3c7',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          {keyword && (
            <button
              type="button"
              onClick={() => setKeyword('')}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#85907d',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={16} color="#69736a" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '0.55rem 0.85rem',
              borderRadius: '10px',
              border: '1px solid #ccd3c7',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#414743',
              outline: 'none'
            }}
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="CHECKED_IN">Đang vào ca</option>
            <option value="COMPLETED">Đã check-out</option>
            <option value="LATE">Đi muộn / Về sớm</option>
            <option value="SCHEDULED">Có lịch chưa vào</option>
            <option value="ABSENT">Vắng mặt</option>
            <option value="OFF">Nghỉ / không có lịch</option>
          </select>
        </div>
      </div>

      {/* Error / Loading messages */}
      {(workforceUsersState.error || workShiftState.error) && (
        <div style={{ padding: '0.85rem', borderRadius: '12px', background: "#f4f5f2", border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          <AlertCircle size={16} style={{ display: 'inline', marginRight: '0.4rem' }} />
          {workforceUsersState.error || workShiftState.error}
        </div>
      )}

      {(workforceUsersState.loading || workShiftState.loading) ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e4df', color: '#69736a' }}>
          <RefreshCw size={32} color="#3b82f6" style={{ animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
          <h4 style={{ margin: '0 0 0.25rem 0', color: '#414743' }}>Đang tải danh sách nhân sự...</h4>
        </div>
      ) : pageRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: '#ffffff', borderRadius: '16px', border: '1px dashed #ccd3c7' }}>
          <UserX size={40} color="#85907d" style={{ marginBottom: '0.75rem' }} />
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#414743' }}>Không tìm thấy nhân viên nào phù hợp</h4>
          <p style={{ margin: 0, color: '#69736a', fontSize: '0.875rem' }}>Vui lòng kiểm tra lại từ khóa tìm kiếm hoặc chọn trạng thái khác.</p>
        </div>
      ) : (
        /* Employee Card Grid */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '1.25rem'
        }}>
          {pageRows.map((row) => {
            const StatusIcon = row.statusMeta.icon

            return (
              <div
                key={row.user.ma_nguoi_dung || row.username}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e4df',
                  padding: '1.25rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Header info */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, var(--primary-light) 0%, var(--primary-subtle) 100%)',
                      color: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '600',
                      fontSize: '1.1rem',
                      border: '1px solid #bfdbfe',
                      flexShrink: 0
                    }}>
                      <User size={22} color="var(--primary)" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '600', color: '#252927', wordBreak: 'break-word' }}>
                        {row.fullName}
                      </h3>
                      <span style={{ fontSize: '0.775rem', color: '#69736a', fontWeight: '500', display: 'block', wordBreak: 'break-all' }}>
                        @{row.username}
                      </span>
                    </div>
                  </div>

                  <span className="workspace-inline-label" style={{
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '9999px',
                    background: row.statusMeta.bg,
                    color: row.statusMeta.color,
                    border: `1px solid ${row.statusMeta.border}`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    flexShrink: 0
                  }}>
                    <StatusIcon size={13} />
                    {row.statusMeta.label}
                  </span>
                </div>

                {/* Vertical Metadata List (Fixes text overflow and awkward line breaks) */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.55rem',
                  fontSize: '0.825rem',
                  color: '#596255',
                  background: '#f8f9f6',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  border: '1px solid #f4f5f2'
                }}>
                  {/* Role Tag & Branch */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.725rem',
                      fontWeight: '700',
                      color: row.role === 'MANAGER' ? 'var(--primary-hover)' : '#0369a1',
                      background: row.role === 'MANAGER' ? 'var(--primary-subtle)' : "#f4f5f2",
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      <Shield size={12} /> {roleBadgeLabel(row.role)}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#596255', fontSize: '0.8rem', fontWeight: '600' }}>
                      <Store size={14} color="#69736a" style={{ flexShrink: 0 }} />
                      <span style={{ wordBreak: 'break-word' }}>{row.branchName}</span>
                    </div>
                  </div>

                  <div style={{ height: '1px', background: "#f4f5f2", margin: '0.1rem 0' }} />

                  {/* Email */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                    <Mail size={14} color="#69736a" style={{ flexShrink: 0 }} />
                    <span style={{ color: '#414743', fontWeight: '500', wordBreak: 'break-all' }}>{row.email}</span>
                  </div>

                  {/* Phone */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Phone size={14} color="#69736a" style={{ flexShrink: 0 }} />
                    <span style={{ color: '#414743', fontWeight: '500' }}>SĐT: {row.phone}</span>
                  </div>
                </div>

                {/* Today Shift Box */}
                <div style={{
                  background: 'var(--primary-light)',
                  border: '1px solid #bfdbfe',
                  borderRadius: '12px',
                  padding: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem'
                }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={16} color="var(--primary)" style={{ flexShrink: 0 }} /> {toShiftLabel(row.primaryShift)}
                  </div>
                  <span style={{ fontSize: '0.775rem', color: '#3b82f6', fontWeight: '500' }}>
                    Tổng số ca hôm nay: <strong>{row.shiftsToday.length} ca</strong>
                  </span>
                </div>

                {/* Attendance details if shift exists */}
                {row.primaryShift && (
                  <div style={{
                    fontSize: '0.775rem',
                    color: '#69736a',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid #f4f5f2'
                  }}>
                    <div>
                      Check-in: <strong>{row.primaryShift.check_in_at ? new Date(row.primaryShift.check_in_at).toLocaleString('vi-VN') : 'Chưa điểm danh'}</strong>
                    </div>
                    <div>
                      Check-out: <strong>{row.primaryShift.check_out_at ? new Date(row.primaryShift.check_out_at).toLocaleString('vi-VN') : 'Chưa điểm danh'}</strong>
                    </div>
                    {row.primaryInsight && (
                      <div style={{ color: '#2563eb', fontWeight: '600', marginTop: '0.15rem' }}>
                        Giờ làm thực tế: {row.primaryInsight.workedHours || 0}
                        {row.primaryInsight.isLate ? ` • Muộn ${formatMinutesLabel(row.primaryInsight.lateMinutes)}` : ''}
                        {row.primaryInsight.leftEarly ? ` • Về sớm ${formatMinutesLabel(row.primaryInsight.earlyLeaveMinutes)}` : ''}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          marginTop: '1.5rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid #e2e4df',
          flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#69736a' }}>
            Hiển thị <strong>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredRows.length)}</strong> trên <strong>{filteredRows.length}</strong> nhân sự
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #ccd3c7',
                background: '#ffffff',
                color: safePage === 1 ? '#ccd3c7' : '#414743',
                fontSize: '0.825rem',
                fontWeight: '600',
                cursor: safePage === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronLeft size={16} /> Trước
            </button>

            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <PageNumbers page={safePage} totalPages={totalPages} onChange={setPage} />
            </div>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #ccd3c7',
                background: '#ffffff',
                color: safePage === totalPages ? '#ccd3c7' : '#414743',
                fontSize: '0.825rem',
                fontWeight: '600',
                cursor: safePage === totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Tiếp <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <WorkspaceDialog label="Thêm nhân viên kiosk" busy={isSubmitting} onClose={() => setShowAddModal(false)}>
          <div style={{ background: '#fff', padding: '1.5rem 2rem', borderRadius: '16px', width: '400px', maxWidth: '90vw', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem', color: '#252927', fontWeight: '600' }}>Thêm Kiosk Staff</h3>
            {addError && <p className="workspace-form-error" role="alert">{addError}</p>}
            <form className="workspace-form" onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: '600', color: '#414743' }}>Họ tên</label>
                <input required type="text" value={addForm.ho_ten} onChange={e => setAddForm({ ...addForm, ho_ten: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.9rem' }} placeholder="Nguyễn Văn A" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: '600', color: '#414743' }}>Tên đăng nhập</label>
                <input required type="text" value={addForm.ten_dang_nhap} onChange={e => setAddForm({ ...addForm, ten_dang_nhap: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.9rem' }} placeholder="vana_kiosk1" />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: '600', color: '#414743' }}>Mật khẩu (Tối thiểu 6 ký tự)</label>
                <input required type="password" value={addForm.mat_khau} onChange={e => setAddForm({ ...addForm, mat_khau: e.target.value })} style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.9rem' }} placeholder="••••••••" minLength={6} />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.85rem', fontWeight: '600', color: '#414743' }}>Kiosk trực thuộc</label>
                <SmartSelect label="Tìm kiosk trực thuộc" placeholder="Gõ tên hoặc mã kiosk" value={addForm.co_so_ma}
                  onChange={code => setAddForm({ ...addForm, co_so_ma: code })}
                  options={kiosks.map(k => ({ value: k.ma_chi_nhanh, label: k.ten_chi_nhanh, keywords: k.ma_chi_nhanh }))} />
                {kiosks.length === 0 && <span style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '0.25rem', display: 'block' }}>Chưa có kiosk nào thuộc quản lý của bạn.</span>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" disabled={isSubmitting} onClick={() => setShowAddModal(false)} style={{ padding: '0.5rem 1rem', background: '#f4f5f2', color: '#596255', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>Hủy</button>
                <button type="submit" disabled={isSubmitting || kiosks.length === 0 || !addForm.co_so_ma} style={{ padding: '0.5rem 1rem', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: (isSubmitting || kiosks.length === 0) ? 'not-allowed' : 'pointer', opacity: (isSubmitting || kiosks.length === 0) ? 0.6 : 1 }}>
                  {isSubmitting ? 'Đang lưu...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </WorkspaceDialog>
      )}
    </div>
  )
}
