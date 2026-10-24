import { Table } from '../../../components/ui/table'
import { WorkspacePanelIntro } from '../../../components/console/OperationalPageFrame'
import StatusBadge from '../../../components/console/StatusBadge'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import { Label } from '../../../components/ui/label'
import SearchableSelect from '../../../components/console/SearchableSelect'
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
  UserPlus,
  Eye,
  EyeOff
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

function roleBadgeClass(role) {
  const normalized = String(role || '').toLowerCase()
  return `employee-role-badge employee-role-badge--${normalized}`
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
  taoNhanVienCuaHang,
  session
}) {
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [page, setPage] = useState(1)

  const [showAddModal, setShowAddModal] = useState(false)
  const [addError, setAddError] = useState('')
  const [showAddPassword, setShowAddPassword] = useState(false)
  const [addForm, setAddForm] = useState({ ho_ten: '', ten_dang_nhap: '', mat_khau: '' })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleAddSubmit = async (e) => {
    e.preventDefault()
    if (!taoNhanVienCuaHang) { setAddError('Chưa thể thêm nhân viên. Vui lòng tải lại trang.'); return }
    if (isSubmitting) return
    setAddError('')
    setIsSubmitting(true)
    let res
    try { res = await taoNhanVienCuaHang(addForm) } catch (error) { setAddError(error.message || 'Không thể tạo tài khoản.'); setIsSubmitting(false); return }
    setIsSubmitting(false)
    if (res.ok) {
      setShowAddModal(false)
      setAddForm({ ho_ten: '', ten_dang_nhap: '', mat_khau: '' })
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
    <div className="panel-container manager-employees" style={{
      padding: '1.75rem',
      background: '#f8f9f6',
      borderRadius: '20px',
      border: '1px solid #e2e4df',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)'
    }}>
      {/* Top Header */}
      <div className="employee-page-actions" style={{
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
        </div></WorkspacePanelIntro>
        <Button
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
          <UserPlus size={18} /> Thêm nhân viên
        </Button>
      </div>

      {/* Summary KPI Grid */}


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
          <Input data-input-prefix="true"
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
            <Button
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
            </Button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '0 1 280px', minWidth: '220px' }}>
          <Filter size={16} color="#69736a" />
          <SearchableSelect
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
          </SearchableSelect>
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
        <div className="operation-table-frame manager-employee-table"><Table><thead><tr><th style={{width:'24%'}}>Nhân viên</th><th style={{width:'22%'}}>Liên hệ</th><th style={{width:'16%'}}>Vai trò</th><th style={{width:'23%'}}>Ca làm hôm nay</th><th style={{width:'15%'}}>Tình trạng</th></tr></thead><tbody>{pageRows.map(row => <tr key={row.user.ma_nguoi_dung || row.username}><td><strong>{row.fullName}</strong><small>@{row.username}</small></td><td>{row.email}<small>{row.phone}</small></td><td><Badge variant="outline" className={roleBadgeClass(row.role)}>{roleBadgeLabel(row.role)}</Badge></td><td>{toShiftLabel(row.primaryShift)}{row.primaryShift && <small>Vào: {row.primaryShift.check_in_at ? new Date(row.primaryShift.check_in_at).toLocaleTimeString('vi-VN') : 'Chưa chấm công'} · Ra: {row.primaryShift.check_out_at ? new Date(row.primaryShift.check_out_at).toLocaleTimeString('vi-VN') : 'Chưa chấm công'}</small>}{row.primaryInsight && <small>{row.primaryInsight.workedHours || 0} giờ{row.primaryInsight.isLate ? ` · Muộn ${formatMinutesLabel(row.primaryInsight.lateMinutes)}` : ''}{row.primaryInsight.leftEarly ? ` · Về sớm ${formatMinutesLabel(row.primaryInsight.earlyLeaveMinutes)}` : ''}</small>}</td><td><StatusBadge status={row.statusKey} tone={row.statusKey === 'OFF' ? 'secondary' : row.statusKey === 'SCHEDULED' ? 'warning' : row.statusKey === 'LATE' ? 'warning' : row.statusKey === 'ABSENT' ? 'destructive' : 'success'}>{row.statusMeta.label}</StatusBadge><small>{row.shiftsToday.length} ca đã xếp</small></td></tr>)}</tbody></Table></div>
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
            <Button
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
            </Button>

            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <PageNumbers page={safePage} totalPages={totalPages} onChange={setPage} />
            </div>

            <Button
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
            </Button>
          </div>
        </div>
      )}

      {showAddModal && <WorkspaceDialog className="employee-create-dialog" title="Thêm nhân viên cửa hàng" subtitle="Tạo tài khoản và gắn nhân viên vào cửa hàng bạn đang quản lý." busy={isSubmitting} onClose={() => setShowAddModal(false)}>
        <form data-modal-body="true" className="employee-create-form" onSubmit={handleAddSubmit}>
          {addError && <p className="workspace-form-error" role="alert">{addError}</p>}
          <div className="employee-create-context"><Store size={20}/><div><strong>{session?.user?.coSoTen || session?.user?.co_so_ten || 'Cơ sở đang quản lý'}</strong><span><Badge variant="secondary" className="employee-role-badge employee-role-badge--staff">Nhân viên cửa hàng</Badge>Vai trò và cửa hàng được gắn tự động</span></div></div>
          <div className="employee-create-fields">
            <div className="employee-name-field"><Label htmlFor="manager-staff-ho_ten">Họ và tên</Label><Input id="manager-staff-ho_ten" required autoComplete="name" disabled={isSubmitting} value={addForm.ho_ten} onChange={e=>setAddForm({...addForm,ho_ten:e.target.value})} placeholder="Nhập họ tên nhân viên"/></div>
            <div><Label htmlFor="manager-staff-ten_dang_nhap">Tên đăng nhập</Label><Input id="manager-staff-ten_dang_nhap" required autoComplete="off" disabled={isSubmitting} value={addForm.ten_dang_nhap} onChange={e=>setAddForm({...addForm,ten_dang_nhap:e.target.value})} placeholder="Ví dụ: vana_cuahang"/></div>
            <div><Label htmlFor="manager-staff-mat_khau">Mật khẩu</Label><div className="admin-password-field"><Input id="manager-staff-mat_khau" required minLength={6} autoComplete="new-password" disabled={isSubmitting} type={showAddPassword?'text':'password'} value={addForm.mat_khau} onChange={e=>setAddForm({...addForm,mat_khau:e.target.value})} placeholder="Ít nhất 6 ký tự"/><Button variant="ghost" size="icon" type="button" className="admin-password-toggle" onClick={()=>setShowAddPassword(!showAddPassword)} aria-label={showAddPassword?'Ẩn mật khẩu':'Hiện mật khẩu'}>{showAddPassword?<EyeOff size={16}/>:<Eye size={16}/>}</Button></div></div>
          </div>
          <div data-modal-footer="inset" className="employee-create-actions"><Button type="button" variant="outline" disabled={isSubmitting} onClick={()=>setShowAddModal(false)}>Hủy</Button><Button variant="default" className="admin-button-primary" type="submit" disabled={isSubmitting}><UserPlus size={16}/>{isSubmitting?'Đang tạo…':'Tạo tài khoản'}</Button></div>
        </form>
      </WorkspaceDialog>}

    </div>
  )
}
