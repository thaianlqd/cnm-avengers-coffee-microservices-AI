import SmartSelect from '../../../components/console/SmartSelect'
import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import SearchableSelect from '../../../components/console/SearchableSelect'
import { systemBranches, newestShippers } from '../../../lib/shipperManagement.mjs'
import { PaginatedList } from '../../../components/console/CompactPagination'
import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE_URL } from '../../admin-dashboard/constants'
import { getAdminAccessToken, getAdminSession } from '../../../lib/adminFetch'
import {
  Motorbike,
  Eye,
  EyeOff,
  Truck,
  Car,
  Users,
  UserPlus,
  Sliders,
  BarChart3,
  Coins,
  Search,
  Filter,
  Edit2,
  Trash2,
  Power,
  CheckCircle2,
  XCircle,
  Save,
  RefreshCw,
  Star,
  TrendingUp,
  X,
  Check,
  Clock,
  MapPin,
  FileText,
} from '../../../components/console/WorkspaceIcons'

async function apiFetch(path, options = {}) {
  const token = getAdminAccessToken()
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message || `HTTP ${res.status}`)
  }
  return res.json()
}

function fmtCurrency(val) {
  return Number(val || 0).toLocaleString('vi-VN') + 'đ'
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('vi-VN')
}

const SHIPPER_STATUS_CONFIG = {
  ACTIVE: { label: 'Đang hoạt động', color: '#2563eb', bg: "#f7f9fd", border: '#bfdbfe' },
  INACTIVE: { label: 'Tắt hoạt động', color: '#60718a', bg: '#f7f9fd', border: 'var(--border-light)' },
  SUSPENDED: { label: 'Tạm ngưng', color: '#dc2626', bg: "#f7f9fd", border: '#fecaca' },
}

const ALGORITHM_OPTIONS = [
  {
    id: 'NEAREST',
    title: 'Ưu tiên khoảng cách (Gần nhất)',
    label: 'Gần nhất (Khoảng cách GPS)',
    desc: 'Tự động tính khoảng cách GPS để gán đơn cho nhân viên gần vị trí chi nhánh nhất, giúp rút ngắn thời gian lấy món.',
    badge: 'Khuyên dùng giờ cao điểm',
  },
  {
    id: 'ROUND_ROBIN',
    title: 'Phân bổ xoay vòng (Đều lượt)',
    label: 'Xoay vòng (Chia đều lượng đơn)',
    desc: 'Lần lượt chia đều số lượng đơn theo hàng đợi cho tất cả nhân viên đang sẵn sàng nhận đơn, đảm bảo thu nhập công bằng.',
    badge: 'Cân bằng thu nhập',
  },
  {
    id: 'LEAST_BUSY',
    title: 'Cân bằng tải (Ít đơn nhất)',
    label: 'Ít đơn nhất (Tối ưu tải)',
    desc: 'Tự động gán cho nhân viên đang nhận ít đơn nhất tại thời điểm hiện tại, tránh tình trạng dồn ứ đơn giao cho một người.',
    badge: 'Tối ưu tốc độ giao',
  },
]

const ADMIN_DELIVERY_TABS = [
  { id: 'crud', label: 'Danh sách giao hàng', icon: Users },
  { id: 'config', label: 'Quy tắc điều phối', icon: Sliders },
  { id: 'kpi', label: 'Báo cáo hiệu suất', icon: BarChart3 },
]

const BLANK_FORM = {
  username: '', password: '', full_name: '', email: '', phone_number: '',
  vehicle_type: 'MOTORBIKE', vehicle_plate: '', branch_code: '',
}

const SearchableBranchSelect = ({ branches = [], value, onChange }) => <SmartSelect
  label="Tìm chi nhánh phụ trách" value={value} onChange={onChange}
  options={[{ value: '', label: 'Chưa gán chi nhánh' }, ...branches.map(branch => ({
    value: branch.code || branch.ma_chi_nhanh,
    label: branch.name || branch.ten_chi_nhanh || branch.code || branch.ma_chi_nhanh,
    keywords: [branch.code, branch.ma_chi_nhanh, branch.thanh_pho].filter(Boolean).join(' '),
  }))]} />


export function AdminShipperPanel({ branchOptions = [] }) {
  const [activeTab, setActiveTab] = useState('crud')

  // CRUD state
  const [shippers, setShippers] = useState([])
  const [shippersLoading, setShippersLoading] = useState(false)
  const [shippersError, setShippersError] = useState(null)
  const [form, setForm] = useState({ ...BLANK_FORM })
  const [editingId, setEditingId] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const closeEditor = () => { if (saving) return; setEditorOpen(false); setEditingId(null); setFormError(''); setForm({ ...BLANK_FORM }) }
  const [saving, setSaving] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [createdId, setCreatedId] = useState(null)
  const createdIdRef = useRef(null)
  const loadVersion = useRef(0)
  const [searchQ, setSearchQ] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [internalBranches, setInternalBranches] = useState([])
  const effectiveBranches = systemBranches(branchOptions.length > 0 ? branchOptions : internalBranches)

  useEffect(() => {
    if (branchOptions.length === 0) {
      apiFetch('/users/branches/public')
        .then(res => {
          const list = res?.data || res?.items || res || []
          if (Array.isArray(list)) {
            setInternalBranches(list.map(b => ({
              code: b.ma_chi_nhanh || b.ma_co_so || b.code || b.id,
              name: b.ten_chi_nhanh || b.ten_co_so || b.name || b.code, loai_diem_ban:b.loai_diem_ban
            })))
          }
        })
        .catch(() => {})
    }
  }, [branchOptions])

  // Config state
  const [config, setConfig] = useState({
    auto_assign: true,
    search_radius_km: 5,
    algorithm: 'NEAREST',
    max_orders_per_shipper: 3,
  })
  const [savingConfig, setSavingConfig] = useState(false)

  // KPI state
  const [kpiData, setKpiData] = useState(null)
  const [kpiLoading, setKpiLoading] = useState(false)
  const [kpiRange, setKpiRange] = useState('30d')

  const loadShippers = useCallback(async () => {
    const version = ++loadVersion.current
    setShippersLoading(true)
    setShippersError(null)
    try {
      const q = new URLSearchParams()
      if (searchQ) q.set('q', searchQ)
      if (filterStatus) q.set('status', filterStatus)
      if (filterBranch) q.set('branch_code', filterBranch)
      const res = await apiFetch(`/shippers/all?${q.toString()}`)
      if (version !== loadVersion.current) return
      setShippers(newestShippers(Array.isArray(res) ? res : res?.items || res?.data || [],createdIdRef.current))
    } catch (e) {
      if (version === loadVersion.current) setShippersError(e.message)
    } finally {
      if (version === loadVersion.current) setShippersLoading(false)
    }
  }, [searchQ, filterStatus, filterBranch])

  const loadConfig = useCallback(async () => {
    try {
      const res = await apiFetch('/shippers/config')
      if (res) setConfig(prev => ({ ...prev, ...res }))
    } catch {}
  }, [])

  const loadKpi = useCallback(async () => {
    setKpiLoading(true)
    try {
      const res = await apiFetch(`/shippers/kpi?range=${kpiRange}`)
      setKpiData(res)
    } catch {
      setKpiData(null)
    } finally {
      setKpiLoading(false)
    }
  }, [kpiRange])

  useEffect(() => { loadShippers() }, [loadShippers,createdId])
  useEffect(() => {
    if (activeTab === 'config') loadConfig()
    if (activeTab === 'kpi') loadKpi()
  }, [activeTab, loadConfig, loadKpi])
  useEffect(() => { if (activeTab === 'kpi') loadKpi() }, [kpiRange, loadKpi])

  const handleSave = async () => {
    if (saving) return
    setFormError('')
    if (!form.username || !form.full_name) {
      setFormError('Vui lòng nhập đầy đủ Username và Họ tên')
      return
    }
    if (!effectiveBranches.some(b => (b.code || b.id) === form.branch_code)) { setFormError('Bạn chọn một chi nhánh hệ thống để phụ trách nhé.'); return }
    setSaving(true)
    try {
      if (editingId) {
        await apiFetch(`/shippers/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...form,
            phone: form.phone_number,
            password: form.password || undefined,
          }),
        })
        setNotice('Đã cập nhật nhân viên giao hàng.')
      } else {
        if (!form.password) { setFormError('Cần nhập mật khẩu khi tạo tài khoản mới'); setSaving(false); return }
        const created = await apiFetch('/shippers', {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            phone: form.phone_number,
          }),
        })
        ++loadVersion.current
        createdIdRef.current = created.id
        setCreatedId(created.id)
        setShippers(previous => newestShippers([created,...previous.filter(row => row.id !== created.id)],created.id))
        setSearchQ(''); setFilterStatus(''); setFilterBranch('')
        setNotice('Đã tạo tài khoản giao hàng.')
      }
      setForm({ ...BLANK_FORM })
      setEditingId(null)
      setEditorOpen(false)
      setShowPassword(false)
      if (editingId) loadShippers()
    } catch (e) {
      setFormError('Lỗi: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (shipperId, name) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa nhân viên "${name}"? Thao tác này không thể hoàn tác.`)) return
    try {
      await apiFetch(`/shippers/${shipperId}`, { method: 'DELETE' })
      alert('Đã xóa nhân viên thành công.')
      loadShippers()
    } catch (e) {
      alert('Lỗi: ' + e.message)
    }
  }

  const handleToggleStatus = async (shipper) => {
    const newStatus = shipper.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    try {
      await apiFetch(`/shippers/${shipper.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      })
      loadShippers()
    } catch (e) {
      alert('Lỗi: ' + e.message)
    }
  }

  const handleSaveConfig = async () => {
    setSavingConfig(true)
    try {
      await apiFetch('/shippers/config', { method: 'PUT', body: JSON.stringify(config) })
      alert('Đã lưu cấu hình thuật toán phân công thành công.')
    } catch (e) {
      alert('Lỗi: ' + e.message)
    } finally {
      setSavingConfig(false)
    }
  }


  const getVehicleIcon = (type) => {
    if (type === 'CAR') return <Car size={16} style={{ color: 'var(--primary)' }} />
    if (type === 'BICYCLE') return <Motorbike size={16} style={{ color: '#2563eb' }} />
    return <Motorbike size={16} style={{ color: '#d97706' }} />
  }

  return (
    <section className="panel system-admin-panel" style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Sub-tabs Toolbar */}
      <div className="admin-shipping-tabs">
        <div className="admin-tab-strip">
          {ADMIN_DELIVERY_TABS.map(tab => {
            const IconComp = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button aria-pressed={isActive}
                key={tab.id}
                type="button"
                className={`admin-subtab-btn ${isActive ? 'is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <IconComp size={17} color={isActive ? 'var(--text-main)' : 'var(--text-muted)'} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* TAB 1: CRUD & LIST */}
      {activeTab === 'crud' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="admin-section-intro">
            <div>
              <h2>Danh sách nhân viên giao hàng</h2>
              <p>Quản lý và tra cứu thông tin nhân viên giao vận theo chi nhánh, trạng thái hoạt động.</p>
            </div>
          </div>
          {/* Filter & Search */}
          <div className="admin-surface admin-delivery-filters" style={{ background: '#ffffff', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', alignItems: 'center' }}>
              {/* Search Input Box */}
              <div className="delivery-input-wrapper" style={{ flex: '1 1 240px', minWidth: '220px' }}>
                <input className="ui-input"
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Tìm theo username, họ tên, số điện thoại..."
                  onKeyDown={e => e.key === 'Enter' && loadShippers()}
                  style={{ width: '100%', height: '42px' }}
                />
              </div>

              {/* Filter Branch Select Box - Generous width for long branch names */}
              <div className="delivery-input-wrapper" style={{ flex: '1.8 1 360px', minWidth: '320px' }}>
                <SearchableSelect
                  value={filterBranch}
                  onChange={e => setFilterBranch(e?.target?.value ?? e)}
                  placeholder="Tất cả chi nhánh"
                  style={{ width: '100%', height: '42px' }}
                >
                  <option value="">Tất cả chi nhánh</option>
                  {effectiveBranches.map(b => (
                    <option key={b.code || b.id} value={b.code || b.id}>{b.name || b.code}</option>
                  ))}
                </SearchableSelect>
              </div>

              {/* Filter Status Select Box */}
              <div className="delivery-input-wrapper" style={{ flex: '0 1 180px', minWidth: '160px' }}>
                <SearchableSelect
                  value={filterStatus}
                  onChange={e => setFilterStatus(e?.target?.value ?? e)}
                  placeholder="Tất cả trạng thái"
                  style={{ width: '100%', height: '42px' }}
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="INACTIVE">Tắt hoạt động</option>
                  <option value="SUSPENDED">Tạm ngưng</option>
                </SearchableSelect>
              </div>

              <button className="admin-button-primary"
                type="button"
                onClick={loadShippers}
                style={{
                  height: '42px',
                  background: 'var(--primary)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0 1.35rem',
                  cursor: 'pointer',
                  flexShrink: 0,
                  boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                }}
              >
                <Search size={16} /> Lọc dữ liệu
              </button>
            </div>
          </div>

          {/* Form Edit */}
          {notice && <p role="status">{notice}</p>}
          {editingId && <WorkspaceDialog title="Cập nhật nhân viên giao hàng" onClose={closeEditor} busy={saving}><div className="admin-surface admin-shipper-editor" style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            {formError && <p className="workspace-form-error" role="alert">{formError}</p>}
            <div className="admin-responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#60718a' }}>Tên đăng nhập (Username) *</span>
                <input className="ui-input"
                  value={form.username || ''}
                  onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                  placeholder="Ví dụ: shipper01"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.875rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#60718a' }}>Họ và tên đầy đủ *</span>
                <input className="ui-input"
                  value={form.full_name || ''}
                  onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.875rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#60718a' }}>Email liên hệ</span>
                <input className="ui-input"
                  value={form.email || ''}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="shipper@avengers.coffee"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.875rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#60718a' }}>Số điện thoại</span>
                <input className="ui-input"
                  value={form.phone_number || ''}
                  onChange={e => setForm(p => ({ ...p, phone_number: e.target.value }))}
                  placeholder="0901234567"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.875rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#60718a' }}>Biển số xe</span>
                <input className="ui-input"
                  value={form.vehicle_plate || ''}
                  onChange={e => setForm(p => ({ ...p, vehicle_plate: e.target.value }))}
                  placeholder="59B1 234.56"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.875rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#60718a' }}>Mật khẩu {editingId ? '(Bỏ trống nếu không đổi)' : '*'}</span>
                <div style={{position:'relative'}}><input className="ui-input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={form.password || ''}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="••••••••"
                  style={{ width:'100%', padding: '0.5rem 2.75rem 0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.875rem' }}
                /><button className="admin-button-secondary" type="button" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} style={{ position:'absolute',right:6,top:4,width:32,height:32,padding:0,display:'grid',placeItems:'center',border:0,boxShadow:'none',background:'transparent',color:'var(--text-muted)',cursor:'pointer' }}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#60718a' }}>Phương tiện giao hàng</span>
                <select
                  value={form.vehicle_type}
                  onChange={e => setForm(p => ({ ...p, vehicle_type: e.target.value }))}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.875rem', background: '#fff' }}
                >
                  <option value="MOTORBIKE">Xe máy</option>
                  <option value="CAR">Ô tô</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#60718a' }}>Chi nhánh phụ trách</span>
                <SearchableBranchSelect
                  branches={effectiveBranches}
                  value={form.branch_code}
                  onChange={val => setForm(p => ({ ...p, branch_code: val }))}
                />
              </label>
            </div>

            {/* Form Actions */}
            <div className="admin-editor-actions">
              {(
                <button
                  type="button"
                  disabled={saving} className="btn-cancel" onClick={closeEditor}
                  style={{
                    padding: '0.5rem 1.25rem',
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    fontSize: '0.875rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(220,38,38,0.2)',
                  }}
                >
                  <X size={16} /> Hủy bỏ
                </button>
              )}
              <button
                type="button"
                className="btn-save" onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '0.5rem 1.5rem',
                  background: "var(--primary)",
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer',
                  opacity: saving ? 0.7 : 1,
                  boxShadow: '0 2px 6px rgba(5,150,105,0.25)',
                }}
              >
                <Save size={16} /> {saving ? 'Đang xử lý...' : editingId ? 'Cập nhật thông tin' : 'Tạo tài khoản'}
              </button>
            </div>
          </div></WorkspaceDialog>}

          {/* Table List */}
          {shippersLoading && shippers.length === 0 ? (
            <div style={{ background: '#fff', padding: '2rem', textAlign: 'center', borderRadius: '12px', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: 'var(--primary)' }} />
              <p style={{ margin: 0 }}>Đang tải danh sách nhân viên giao hàng...</p>
            </div>
          ) : shippersError && shippers.length === 0 ? (
            <div style={{ background: "#f7f9fd", border: '1px solid #fecaca', padding: '1rem', borderRadius: '12px', color: '#dc2626' }}>
              <p style={{ margin: 0, fontWeight: '600' }}>Lỗi tải dữ liệu: {shippersError}</p>
            </div>
          ) : (
            <div className="admin-surface" style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#fafafa', borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontWeight: '700' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Nhân viên</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Thông tin liên hệ</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Phương tiện</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Chi nhánh</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Trạng thái</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Đánh giá</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Ngày gia nhập</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  <PaginatedList items={shippers} resetKey={JSON.stringify([filterStatus,filterBranch,searchQ,activeTab,createdId])} layout="table" columns={8}>{s => {
                    const st = SHIPPER_STATUS_CONFIG[s.status] || SHIPPER_STATUS_CONFIG.INACTIVE
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f7f9fd' }}>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: '700', color: 'var(--text-main)' }}>{s.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>@{s.username}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ color: '#414743' }}>{s.email || '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.phone || s.phone_number || '—'}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {getVehicleIcon(s.vehicle_type)}
                            <span style={{ fontWeight: '600', color: '#414743' }}>{s.vehicle_plate || 'Chưa cập nhật'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#414743' }}>
                          {effectiveBranches.find(b => (b.code || b.id) === s.branch_code)?.name || s.branch_name || s.branch_code || 'Toàn hệ thống'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span className="workspace-inline-label" style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            backgroundColor: st.bg,
                            color: st.color,
                            border: `1px solid ${st.border}`,
                          }}>
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#d97706', fontWeight: '700' }}>
                            {s.rating ? (
                              <>
                                <Star size={14} fill="#d97706" /> {Number(s.rating).toFixed(1)}
                              </>
                            ) : (
                              <span style={{ color: '#8c9bb2', fontWeight: 'normal' }}>—</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          {fmtDate(s.created_at)}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            {/* Edit Button */}
                            <button className="admin-button-secondary"
                              type="button"
                              title="Chỉnh sửa thông tin"
                              onClick={() => {
                                setForm({
                                  username: s.username,
                                  full_name: s.full_name,
                                  email: s.email || '',
                                  phone_number: s.phone || s.phone_number || '',
                                  vehicle_type: s.vehicle_type || 'MOTORBIKE',
                                  vehicle_plate: s.vehicle_plate || '',
                                  branch_code: s.branch_code || '',
                                  password: '',
                                })
                                setEditingId(s.id)
                              }}
                              style={{
                                padding: '0.35rem 0.65rem',
                                background: 'var(--primary-light)',
                                color: 'var(--primary-hover)',
                                border: '1px solid #bfdbfe',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                              }}
                            >
                              <Edit2 size={13} /> Sửa
                            </button>

                            {/* Toggle Status Button */}
                            <button className="admin-button-secondary" aria-label={s.status === 'ACTIVE' ? 'Tắt hoạt động' : 'Kích hoạt'}
                              type="button"
                              title={s.status === 'ACTIVE' ? 'Tắt hoạt động' : 'Kích hoạt'}
                              onClick={() => handleToggleStatus(s)}
                              style={{
                                padding: '0.35rem 0.65rem',
                                background: s.status === 'ACTIVE' ? "#f7f9fd" : "#f7f9fd",
                                color: s.status === 'ACTIVE' ? '#c2410c' : "var(--primary)",
                                border: s.status === 'ACTIVE' ? '1px solid #ffedd5' : '1px solid #bfdbfe',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                              }}
                            >
                              <Power size={13} /> {s.status === 'ACTIVE' ? 'Tắt' : 'Bật'}
                            </button>

                            {/* Delete Button */}
                            <button className="admin-button-danger"
                              type="button"
                              title="Xóa hồ sơ"
                              onClick={() => handleDelete(s.id, s.full_name)}
                              style={{
                                padding: '0.35rem 0.65rem',
                                background: "#f7f9fd",
                                color: '#dc2626',
                                border: '1px solid #fecaca',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.2rem',
                              }}
                            >
                              <Trash2 size={13} /> Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }}</PaginatedList>
                </tbody>
              </table>
              {shippers.length === 0 && !shippersLoading && (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#8c9bb2' }}>
                  <Users size={32} style={{ margin: '0 auto 0.5rem auto', color: 'var(--border-light)' }} />
                  <p style={{ margin: 0, fontWeight: '500' }}>Chưa tìm thấy nhân viên giao hàng nào.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONFIG - QUY TẮC ĐIỀU PHỐI ĐƠN */}
      {activeTab === 'config' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header intro */}
          <div className="admin-section-intro">
            <div>
              <h2>Quy tắc điều phối giao hàng</h2>
              <p>Thiết lập cơ chế tự động phân bổ đơn hàng và quản lý định mức nhận đơn cho đội ngũ giao hàng.</p>
            </div>
            <button
              type="button"
              className="btn-save"
              onClick={handleSaveConfig}
              disabled={savingConfig}
              style={{
                height: '38px',
                padding: '0 1.35rem',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                fontWeight: '500',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <CheckCircle2 size={16} color="#ffffff" />
              <span>{savingConfig ? 'Đang lưu quy tắc...' : 'Lưu quy tắc điều phối'}</span>
            </button>
          </div>

          {/* Section 1: Chế độ điều phối (Auto vs Manual) */}
          <div className="admin-surface" style={{ background: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>
                1. Chế độ điều phối đơn
              </h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                Lựa chọn cơ chế gán đơn tự động bởi hệ thống hoặc điều phối chủ động từ chi nhánh.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {/* Option A: Tự động */}
              <div
                onClick={() => setConfig(p => ({ ...p, auto_assign: true }))}
                style={{
                  border: config.auto_assign ? '2px solid #2563eb' : '1px solid var(--border-light)',
                  backgroundColor: config.auto_assign ? '#eff6ff' : '#ffffff',
                  borderRadius: '10px',
                  padding: '1.1rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: config.auto_assign ? '#2563eb' : '#f1f5f9',
                      color: config.auto_assign ? '#ffffff' : '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <TrendingUp size={16} />
                    </div>
                    <div>
                      <span style={{ fontWeight: '600', fontSize: '0.9rem', color: config.auto_assign ? '#1e3a8a' : '#1e293b' }}>
                        Tự động điều phối (Khuyên dùng)
                      </span>
                    </div>
                  </div>
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: config.auto_assign ? '5px solid #2563eb' : '2px solid #cbd5e1',
                    backgroundColor: '#ffffff'
                  }} />
                </div>
                <p style={{ fontSize: '0.8125rem', color: config.auto_assign ? '#1e40af' : '#64748b', margin: 0, lineHeight: 1.45 }}>
                  Hệ thống tự động tìm và gán đơn ngay khi chi nhánh chuẩn bị xong đồ uống, tối ưu hóa thời gian giao.
                </p>
              </div>

              {/* Option B: Thủ công */}
              <div
                onClick={() => setConfig(p => ({ ...p, auto_assign: false }))}
                style={{
                  border: !config.auto_assign ? '2px solid #2563eb' : '1px solid var(--border-light)',
                  backgroundColor: !config.auto_assign ? '#eff6ff' : '#ffffff',
                  borderRadius: '10px',
                  padding: '1.1rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: !config.auto_assign ? '#2563eb' : '#f1f5f9',
                      color: !config.auto_assign ? '#ffffff' : '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Clock size={16} />
                    </div>
                    <div>
                      <span style={{ fontWeight: '600', fontSize: '0.9rem', color: !config.auto_assign ? '#1e3a8a' : '#1e293b' }}>
                        Điều phối thủ công
                      </span>
                    </div>
                  </div>
                  <div style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: !config.auto_assign ? '5px solid #2563eb' : '2px solid #cbd5e1',
                    backgroundColor: '#ffffff'
                  }} />
                </div>
                <p style={{ fontSize: '0.8125rem', color: !config.auto_assign ? '#1e40af' : '#64748b', margin: 0, lineHeight: 1.45 }}>
                  Quản lý hoặc điều phối viên tại cửa hàng chủ động chọn và chỉ định nhân viên giao hàng cho từng đơn.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Phương thức phân chia đơn (Dispatch Method) */}
          <div className="admin-surface" style={{ background: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)', opacity: config.auto_assign ? 1 : 0.65 }}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>
                  2. Phương thức phân bổ đơn
                </h3>
                {!config.auto_assign && (
                  <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: '500' }}>
                    (Đang tắt ở chế độ điều phối thủ công)
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                Tiêu chí cốt lõi để chọn nhân viên phù hợp nhất khi có đơn hàng mới cần giao.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {ALGORITHM_OPTIONS.map(opt => {
                const isSelected = config.algorithm === opt.id
                return (
                  <div
                    key={opt.id}
                    onClick={() => config.auto_assign && setConfig(p => ({ ...p, algorithm: opt.id }))}
                    style={{
                      border: isSelected && config.auto_assign ? '2px solid #2563eb' : '1px solid var(--border-light)',
                      backgroundColor: isSelected && config.auto_assign ? '#f8fafc' : '#ffffff',
                      borderRadius: '10px',
                      padding: '1.1rem',
                      cursor: config.auto_assign ? 'pointer' : 'not-allowed',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.75rem'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                        <span style={{ fontWeight: '600', fontSize: '0.875rem', color: isSelected ? '#1e3a8a' : '#1e293b' }}>
                          {opt.title}
                        </span>
                        <div style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          border: isSelected && config.auto_assign ? '4.5px solid #2563eb' : '2px solid #cbd5e1',
                          backgroundColor: '#ffffff'
                        }} />
                      </div>
                      <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: 0, lineHeight: 1.45 }}>
                        {opt.desc}
                      </p>
                    </div>
                    {opt.badge && (
                      <span style={{
                        alignSelf: 'flex-start',
                        fontSize: '0.71875rem',
                        fontWeight: '500',
                        color: isSelected ? '#1d4ed8' : '#64748b',
                        backgroundColor: isSelected ? '#eff6ff' : '#f1f5f9',
                        padding: '2px 8px',
                        borderRadius: '4px'
                      }}>
                        {opt.badge}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Section 3: Giới hạn vận hành (Parameters) */}
          <div className="admin-surface" style={{ background: '#ffffff', padding: '1.25rem 1.5rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
            <div style={{ marginBottom: '1.1rem' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>
                3. Định mức và giới hạn tải
              </h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
                Kiểm soát bán kính quét nhân viên quanh cửa hàng và số đơn giao đồng thời nhằm bảo toàn chất lượng đồ uống.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
              {/* Bán kính */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem' }}>
                  Bán kính quét nhân viên
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid var(--border-light)',
                    borderRadius: '8px',
                    backgroundColor: config.auto_assign ? '#ffffff' : '#f8fafc',
                    overflow: 'hidden',
                    height: '38px',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={config.search_radius_km}
                    onChange={e => setConfig(p => ({ ...p, search_radius_km: Number(e.target.value) }))}
                    disabled={!config.auto_assign}
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      padding: '0 0.85rem',
                      height: '100%',
                      backgroundColor: 'transparent',
                      fontSize: '0.875rem',
                      color: '#0f172a'
                    }}
                  />
                  <span
                    style={{
                      padding: '0 0.85rem',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8125rem',
                      color: '#475569',
                      backgroundColor: '#f1f5f9',
                      fontWeight: '500',
                      borderLeft: '1px solid var(--border-light)',
                      userSelect: 'none'
                    }}
                  >
                    km
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Quét nhân viên trực tuyến trong bán kính tối đa {config.search_radius_km} km tính từ chi nhánh.
                </span>
              </div>

              {/* Tải tối đa */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label style={{ color: '#414743', fontWeight: '500', fontSize: '0.8125rem' }}>
                  Số đơn tối đa nhận cùng lúc
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    border: '1px solid var(--border-light)',
                    borderRadius: '8px',
                    backgroundColor: '#ffffff',
                    overflow: 'hidden',
                    height: '38px',
                    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)'
                  }}
                >
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={config.max_orders_per_shipper}
                    onChange={e => setConfig(p => ({ ...p, max_orders_per_shipper: Number(e.target.value) }))}
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      padding: '0 0.85rem',
                      height: '100%',
                      backgroundColor: 'transparent',
                      fontSize: '0.875rem',
                      color: '#0f172a'
                    }}
                  />
                  <span
                    style={{
                      padding: '0 0.85rem',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8125rem',
                      color: '#475569',
                      backgroundColor: '#f1f5f9',
                      fontWeight: '500',
                      borderLeft: '1px solid var(--border-light)',
                      userSelect: 'none'
                    }}
                  >
                    đơn
                  </span>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Giới hạn số đơn đang giao song song (khuyến nghị 2 - 4 đơn để đảm bảo thời gian giao món).
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: Live summary card */}
          <div style={{
            background: '#ffffff',
            border: '1px solid var(--border-light)',
            borderLeft: '4px solid #2563eb',
            borderRadius: '10px',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '0.875rem', marginBottom: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <CheckCircle2 size={16} color="#2563eb" /> Tóm tắt quy tắc điều phối hiện hành:
              </div>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#475569' }}>
                Chế độ <strong>{config.auto_assign ? 'Tự động điều phối' : 'Thủ công'}</strong>
                {config.auto_assign && <> • Phương thức: <strong>{ALGORITHM_OPTIONS.find(o => o.id === config.algorithm)?.title || config.algorithm}</strong></>}
                {config.auto_assign && <> • Bán kính: <strong>{config.search_radius_km} km</strong></>}
                <> • Tối đa: <strong>{config.max_orders_per_shipper} đơn/nhân viên</strong></>
              </p>
            </div>
            <button
              type="button"
              className="btn-save"
              onClick={handleSaveConfig}
              disabled={savingConfig}
              style={{
                height: '36px',
                padding: '0 1.25rem',
                borderRadius: '6px',
                fontSize: '0.8125rem',
                fontWeight: '500',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                backgroundColor: 'var(--primary)',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              <CheckCircle2 size={15} color="#ffffff" />
              <span>{savingConfig ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: KPI & PERFORMANCE - BÁO CÁO HIỆU SUẤT */}
      {activeTab === 'kpi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header intro & Time filter */}
          <div className="admin-section-intro">
            <div>
              <h2>Báo cáo hiệu suất giao hàng</h2>
              <p>Thống kê số lượng đơn hoàn thành, tỷ lệ giao đúng giờ và đánh giá chất lượng dịch vụ của nhân viên.</p>
            </div>
            {/* Segmented Time Filter */}
            <div style={{
              display: 'inline-flex',
              padding: '3px',
              backgroundColor: '#f1f5f9',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              gap: '2px'
            }}>
              {[
                { id: '7d', label: '7 ngày qua' },
                { id: '30d', label: '30 ngày qua' },
                { id: '90d', label: '3 tháng qua' },
              ].map(r => {
                const isSel = kpiRange === r.id
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setKpiRange(r.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      fontSize: '0.8125rem',
                      fontWeight: isSel ? '600' : '500',
                      border: 'none',
                      backgroundColor: isSel ? '#ffffff' : 'transparent',
                      color: isSel ? '#0f172a' : '#64748b',
                      boxShadow: isSel ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>

          {kpiLoading ? (
            <div style={{ background: '#fff', padding: '3rem', textAlign: 'center', borderRadius: '12px', border: '1px solid var(--border-light)', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: '#2563eb' }} />
              <p style={{ margin: 0, fontSize: '0.875rem' }}>Đang tổng hợp dữ liệu hiệu suất...</p>
            </div>
          ) : (() => {
            const rawShippers = kpiData?.shippers?.length ? kpiData.shippers : (kpiData?.top_shippers?.length ? kpiData.top_shippers : [])
            const displayKpiShippers = rawShippers.length > 0
              ? rawShippers.map(s => ({
                  id: s.id,
                  full_name: s.full_name || s.name || s.username,
                  username: s.username || s.name || 'shipper',
                  delivered: Number(s.delivered ?? s.completed_orders ?? 0),
                  failed: Number(s.failed ?? 0),
                  rating: Number(s.rating || 5),
                }))
              : (shippers || []).filter(s => (s.total_deliveries || 0) > 0).map(s => ({
                  id: s.id,
                  full_name: s.full_name || s.username,
                  username: s.username,
                  delivered: Number(s.total_deliveries || 0),
                  failed: 0,
                  rating: Number(s.rating || 5),
                }))

            const totalDelivered = kpiData?.total_delivered ?? kpiData?.total_deliveries ?? displayKpiShippers.reduce((acc, s) => acc + (s.delivered || 0), 0)
            const totalFailed = kpiData?.total_failed ?? displayKpiShippers.reduce((acc, s) => acc + (s.failed || 0), 0)
            const calculatedTotal = totalDelivered + totalFailed
            const successRate = kpiData?.success_rate ?? kpiData?.on_time_rate ?? (calculatedTotal > 0 ? Math.round((totalDelivered / calculatedTotal) * 100) : 100)
            const activeShippersCount = displayKpiShippers.length

            return (
              <>
                {/* Metric Cards - 4 Balanced Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  {/* 1: Đơn hoàn thành */}
                  <div className="admin-surface" style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: '500', color: '#64748b' }}>Đơn giao thành công</span>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CheckCircle2 size={18} />
                      </div>
                    </div>
                    <div style={{ fontSize: '1.625rem', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>
                      {Number(totalDelivered || 0).toLocaleString('vi-VN')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: '500', marginTop: '0.35rem' }}>
                      Đã chuyển đến tay khách hàng
                    </div>
                  </div>

                  {/* 2: Đơn thất bại */}
                  <div className="admin-surface" style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: '500', color: '#64748b' }}>Đơn giao thất bại</span>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <XCircle size={18} />
                      </div>
                    </div>
                    <div style={{ fontSize: '1.625rem', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>
                      {Number(totalFailed || 0).toLocaleString('vi-VN')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500', marginTop: '0.35rem' }}>
                      Khách hủy hoặc không liên lạc được
                    </div>
                  </div>

                  {/* 3: Tỷ lệ hoàn thành */}
                  <div className="admin-surface" style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: '500', color: '#64748b' }}>Tỷ lệ giao thành công</span>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <TrendingUp size={18} />
                      </div>
                    </div>
                    <div style={{ fontSize: '1.625rem', fontWeight: '700', color: '#16a34a', letterSpacing: '-0.02em' }}>
                      {successRate}%
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500', marginTop: '0.35rem' }}>
                      Trên tổng đơn điều phối
                    </div>
                  </div>

                  {/* 4: Nhân sự hoạt động */}
                  <div className="admin-surface" style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: '500', color: '#64748b' }}>Nhân sự có phát sinh đơn</span>
                      <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Users size={18} />
                      </div>
                    </div>
                    <div style={{ fontSize: '1.625rem', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.02em' }}>
                      {activeShippersCount}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500', marginTop: '0.35rem' }}>
                      Nhân viên giao vận tham gia giao
                    </div>
                  </div>
                </div>

                {/* KPI Staff Breakdown Table */}
                <div className="admin-surface" style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                      Chi tiết hiệu suất từng nhân viên
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      Cập nhật tự động theo kỳ báo cáo ({activeShippersCount} nhân sự)
                    </span>
                  </div>
                  <div className="admin-table-scroll" style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid var(--border-light)', color: '#475569', fontWeight: '600' }}>
                          <th style={{ padding: '0.85rem 1rem' }}>Nhân viên giao hàng</th>
                          <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Đã giao</th>
                          <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Thất bại</th>
                          <th style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>Tỷ lệ thành công</th>
                          <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Đánh giá dịch vụ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayKpiShippers.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                              Không có dữ liệu giao hàng trong khoảng thời gian đã chọn.
                            </td>
                          </tr>
                        ) : (
                          <PaginatedList items={displayKpiShippers} resetKey={JSON.stringify([kpiRange, activeTab])} layout="table" columns={5}>{(s, i) => {
                            const total = (s.delivered || 0) + (s.failed || 0)
                            const rate = total > 0 ? Math.round(s.delivered / total * 100) : 100
                            const rateColor = rate >= 90 ? '#16a34a' : rate >= 70 ? '#d97706' : '#dc2626'
                            return (
                              <tr key={s.id || i} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background-color 0.15s ease' }}>
                                <td style={{ padding: '0.85rem 1rem' }}>
                                  <div style={{ fontWeight: '600', color: '#0f172a' }}>
                                    {s.full_name || s.username}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    @{s.username}
                                  </div>
                                </td>
                                <td style={{ padding: '0.85rem 1rem', textAlign: 'center', color: '#16a34a', fontWeight: '600' }}>
                                  {s.delivered || 0}
                                </td>
                                <td style={{ padding: '0.85rem 1rem', textAlign: 'center', color: s.failed ? '#dc2626' : '#94a3b8' }}>
                                  {s.failed || 0}
                                </td>
                                <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '2px 8px',
                                    borderRadius: '9999px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    color: rateColor,
                                    backgroundColor: rate >= 90 ? '#f0fdf4' : rate >= 70 ? '#fffbeb' : '#fef2f2',
                                    border: `1px solid ${rate >= 90 ? '#bbf7d0' : rate >= 70 ? '#fde68a' : '#fecaca'}`
                                  }}>
                                    {rate}%
                                  </span>
                                </td>
                                <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                                  {s.rating ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#d97706', fontWeight: '600' }}>
                                      <Star size={13} fill="#d97706" color="#d97706" /> {Number(s.rating).toFixed(1)}
                                    </span>
                                  ) : (
                                    <span style={{ color: '#94a3b8' }}>Chưa có</span>
                                  )}
                                </td>
                              </tr>
                            )
                          }}</PaginatedList>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </section>
  )
}
