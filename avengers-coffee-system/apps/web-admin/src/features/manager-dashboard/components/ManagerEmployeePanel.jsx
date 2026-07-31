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
  User
} from 'lucide-react'
import { formatMinutesLabel, getAttendanceInsight } from '../../workforce/attendance'

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
        bg: '#d1fae5',
        color: '#047857',
        border: '#a7f3d0',
        icon: UserCheck
      }
    case 'COMPLETED':
      return {
        label: 'Đã check-out',
        bg: '#dbeafe',
        color: '#1d4ed8',
        border: '#bfdbfe',
        icon: CheckCircle2
      }
    case 'LATE':
      return {
        label: 'Đi muộn / Về sớm',
        bg: '#fef3c7',
        color: '#b45309',
        border: '#fde68a',
        icon: AlertTriangle
      }
    case 'SCHEDULED':
      return {
        label: 'Có lịch, chưa vào ca',
        bg: '#e0e7ff',
        color: '#4338ca',
        border: '#c7d2fe',
        icon: Clock
      }
    case 'ABSENT':
      return {
        label: 'Vắng mặt',
        bg: '#fee2e2',
        color: '#b91c1c',
        border: '#fca5a5',
        icon: UserX
      }
    default:
      return {
        label: 'Nghỉ / Không có lịch',
        bg: '#f1f5f9',
        color: '#64748b',
        border: '#e2e8f0',
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
}) {
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)

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
            <Users size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>
              Quản lý Hồ sơ & Trạng thái Nhân viên
            </h2>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              Theo dõi danh sách nhân sự, thông tin liên hệ và tình hình điểm danh ca làm hôm nay
            </span>
          </div>
        </div>
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
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Users size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Tổng nhân viên</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '800', color: '#1e293b', display: 'block' }}>{summary.total} người</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCheck size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Đang vào ca</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '800', color: '#059669', display: 'block' }}>{summary.CHECKED_IN} ca</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#dbeafe', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Đã check-out</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '800', color: '#1d4ed8', display: 'block' }}>{summary.COMPLETED} ca</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fef3c7', color: '#b45309', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Đi muộn / Về sớm</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '800', color: '#b45309', display: 'block' }}>{summary.LATE} ca</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Có lịch chưa vào</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '800', color: '#4338ca', display: 'block' }}>{summary.SCHEDULED} ca</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1rem 1.15rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fee2e2', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserX size={18} />
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Vắng mặt</span>
            <strong style={{ fontSize: '1.2rem', fontWeight: '800', color: '#b91c1c', display: 'block' }}>{summary.ABSENT} ca</strong>
          </div>
        </div>
      </div>

      {/* Toolbar Filter */}
      <div style={{
        background: '#ffffff',
        padding: '1rem 1.25rem',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.85rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '420px' }}>
          <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Tìm theo họ tên, username, email, SĐT..."
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem 0.55rem 2.4rem',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
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
                color: '#94a3b8',
                cursor: 'pointer'
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Filter size={16} color="#64748b" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '0.55rem 0.85rem',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              fontSize: '0.85rem',
              fontWeight: '600',
              color: '#334155',
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
        <div style={{ padding: '0.85rem', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          <AlertCircle size={16} style={{ display: 'inline', marginRight: '0.4rem' }} />
          {workforceUsersState.error || workShiftState.error}
        </div>
      )}

      {(workforceUsersState.loading || workShiftState.loading) ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', color: '#64748b' }}>
          <RefreshCw size={32} color="#10b981" style={{ animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
          <h4 style={{ margin: '0 0 0.25rem 0', color: '#334155' }}>Đang tải danh sách nhân sự...</h4>
        </div>
      ) : pageRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: '#ffffff', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
          <UserX size={40} color="#94a3b8" style={{ marginBottom: '0.75rem' }} />
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#334155' }}>Không tìm thấy nhân viên nào phù hợp</h4>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>Vui lòng kiểm tra lại từ khóa tìm kiếm hoặc chọn trạng thái khác.</p>
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
                  border: '1px solid #e2e8f0',
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
                      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '800',
                      fontSize: '1.1rem',
                      border: '1px solid #bfdbfe',
                      flexShrink: 0
                    }}>
                      <User size={22} color="#2563eb" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a', wordBreak: 'break-word' }}>
                        {row.fullName}
                      </h3>
                      <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500', display: 'block', wordBreak: 'break-all' }}>
                        @{row.username}
                      </span>
                    </div>
                  </div>

                  <span style={{
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
                  color: '#475569',
                  background: '#f8fafc',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  border: '1px solid #f1f5f9'
                }}>
                  {/* Role Tag & Branch */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '0.725rem',
                      fontWeight: '700',
                      color: row.role === 'MANAGER' ? '#4338ca' : '#0369a1',
                      background: row.role === 'MANAGER' ? '#e0e7ff' : '#e0f2fe',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      <Shield size={12} /> {roleBadgeLabel(row.role)}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#475569', fontSize: '0.8rem', fontWeight: '600' }}>
                      <Store size={14} color="#64748b" style={{ flexShrink: 0 }} />
                      <span style={{ wordBreak: 'break-word' }}>{row.branchName}</span>
                    </div>
                  </div>

                  <div style={{ height: '1px', background: '#e2e8f0', margin: '0.1rem 0' }} />

                  {/* Email */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                    <Mail size={14} color="#64748b" style={{ flexShrink: 0 }} />
                    <span style={{ color: '#334155', fontWeight: '500', wordBreak: 'break-all' }}>{row.email}</span>
                  </div>

                  {/* Phone */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Phone size={14} color="#64748b" style={{ flexShrink: 0 }} />
                    <span style={{ color: '#334155', fontWeight: '500' }}>SĐT: {row.phone}</span>
                  </div>
                </div>

                {/* Today Shift Box */}
                <div style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '12px',
                  padding: '0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem'
                }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={16} color="#2563eb" style={{ flexShrink: 0 }} /> {toShiftLabel(row.primaryShift)}
                  </div>
                  <span style={{ fontSize: '0.775rem', color: '#3b82f6', fontWeight: '500' }}>
                    Tổng số ca hôm nay: <strong>{row.shiftsToday.length} ca</strong>
                  </span>
                </div>

                {/* Attendance details if shift exists */}
                {row.primaryShift && (
                  <div style={{
                    fontSize: '0.775rem',
                    color: '#64748b',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                    paddingTop: '0.5rem',
                    borderTop: '1px solid #f1f5f9'
                  }}>
                    <div>
                      Check-in: <strong>{row.primaryShift.check_in_at ? new Date(row.primaryShift.check_in_at).toLocaleString('vi-VN') : 'Chưa điểm danh'}</strong>
                    </div>
                    <div>
                      Check-out: <strong>{row.primaryShift.check_out_at ? new Date(row.primaryShift.check_out_at).toLocaleString('vi-VN') : 'Chưa điểm danh'}</strong>
                    </div>
                    {row.primaryInsight && (
                      <div style={{ color: '#059669', fontWeight: '600', marginTop: '0.15rem' }}>
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
          borderTop: '1px solid #e2e8f0',
          flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
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
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: safePage === 1 ? '#cbd5e1' : '#334155',
                fontSize: '0.825rem',
                fontWeight: '600',
                cursor: safePage === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronLeft size={16} /> Trước
            </button>

            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    border: 'none',
                    background: safePage === p ? '#10b981' : 'transparent',
                    color: safePage === p ? '#ffffff' : '#64748b',
                    fontWeight: safePage === p ? '700' : '500',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  {p}
                </button>
              ))}
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
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: safePage === totalPages ? '#cbd5e1' : '#334155',
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
    </div>
  )
}
