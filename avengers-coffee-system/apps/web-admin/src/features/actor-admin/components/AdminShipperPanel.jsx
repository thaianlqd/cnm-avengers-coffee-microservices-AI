import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../admin-dashboard/constants'
import { getAdminAccessToken } from '../../../lib/adminFetch'
import {
  Bike,
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
} from 'lucide-react'

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
  ACTIVE: { label: 'Đang hoạt động', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
  INACTIVE: { label: 'Tắt hoạt động', color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
  SUSPENDED: { label: 'Tạm ngưng', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
}

const ALGORITHM_OPTIONS = [
  { id: 'NEAREST', label: 'Gần nhất (Phụ thuộc khoảng cách GPS)' },
  { id: 'ROUND_ROBIN', label: 'Xoay vòng (Chia đều lượng đơn)' },
  { id: 'LEAST_BUSY', label: 'Ít đơn nhất (Tối ưu tải công việc)' },
]

const ADMIN_DELIVERY_TABS = [
  { id: 'crud', label: 'Danh sách giao hàng', icon: Users },
  { id: 'config', label: 'Thuật toán phân công', icon: Sliders },
  { id: 'kpi', label: 'Báo cáo & Hiệu suất', icon: BarChart3 },
  { id: 'finance', label: 'Hoa hồng & Chi trả', icon: Coins },
  { id: 'cod', label: 'Đối Soát COD', icon: CheckCircle2 },
]

const BLANK_FORM = {
  username: '', password: '', full_name: '', email: '', phone_number: '',
  vehicle_type: 'MOTORBIKE', vehicle_plate: '', branch_code: '',
}

export function AdminShipperPanel({ branchOptions = [] }) {
  const [activeTab, setActiveTab] = useState('crud')

  // CRUD state
  const [shippers, setShippers] = useState([])
  const [shippersLoading, setShippersLoading] = useState(false)
  const [shippersError, setShippersError] = useState(null)
  const [form, setForm] = useState({ ...BLANK_FORM })
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

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

  // Finance state
  const [financeData, setFinanceData] = useState(null)
  const [financeLoading, setFinanceLoading] = useState(false)
  const [commissionRate, setCommissionRate] = useState(15)
  const [savingCommission, setSavingCommission] = useState(false)

  // COD Remit state
  const [codRemits, setCodRemits] = useState([])
  const [codLoading, setCodLoading] = useState(false)
  const [codStatusFilter, setCodStatusFilter] = useState('PENDING')
  const [codConfirming, setCodConfirming] = useState(null)

  const loadShippers = useCallback(async () => {
    setShippersLoading(true)
    setShippersError(null)
    try {
      const q = new URLSearchParams()
      if (searchQ) q.set('q', searchQ)
      if (filterStatus) q.set('status', filterStatus)
      const res = await apiFetch(`/shippers/all?${q.toString()}`)
      setShippers(Array.isArray(res) ? res : res?.items || res?.data || [])
    } catch (e) {
      setShippersError(e.message)
    } finally {
      setShippersLoading(false)
    }
  }, [searchQ, filterStatus])

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

  const loadFinance = useCallback(async () => {
    setFinanceLoading(true)
    try {
      const res = await apiFetch('/shippers/finance?limit=20')
      setFinanceData(res)
    } catch {
      setFinanceData(null)
    } finally {
      setFinanceLoading(false)
    }
  }, [])

  const loadCodRemits = useCallback(async () => {
    setCodLoading(true)
    try {
      const res = await apiFetch(`/shippers/cod-remits${codStatusFilter ? `?status=${codStatusFilter}` : ''}`)
      setCodRemits(Array.isArray(res) ? res : [])
    } catch {
      setCodRemits([])
    } finally {
      setCodLoading(false)
    }
  }, [codStatusFilter])

  const handleConfirmCod = async (remitId, action) => {
    setCodConfirming(remitId + action)
    try {
      await apiFetch(`/shippers/cod-remits/${remitId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ confirmed_by: 'admin', action }),
      })
      await loadCodRemits()
    } catch (e) {
      alert('Lỗi: ' + e.message)
    } finally {
      setCodConfirming(null)
    }
  }

  useEffect(() => { loadShippers() }, [loadShippers])
  useEffect(() => {
    if (activeTab === 'config') loadConfig()
    if (activeTab === 'kpi') loadKpi()
    if (activeTab === 'finance') loadFinance()
    if (activeTab === 'cod') loadCodRemits()
  }, [activeTab, loadConfig, loadKpi, loadFinance, loadCodRemits])
  useEffect(() => { if (activeTab === 'kpi') loadKpi() }, [kpiRange, loadKpi])
  useEffect(() => { if (activeTab === 'cod') loadCodRemits() }, [codStatusFilter, loadCodRemits])

  const handleSave = async () => {
    if (!form.username || !form.full_name) {
      alert('Vui lòng nhập đầy đủ Username và Họ tên')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await apiFetch(`/shippers/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...form, password: form.password || undefined }),
        })
        alert('Đã cập nhật thông tin nhân viên giao hàng!')
      } else {
        if (!form.password) { alert('Cần nhập mật khẩu khi tạo tài khoản mới'); setSaving(false); return }
        await apiFetch('/shippers', { method: 'POST', body: JSON.stringify(form) })
        alert('Tạo tài khoản giao hàng thành công!')
      }
      setForm({ ...BLANK_FORM })
      setEditingId(null)
      loadShippers()
    } catch (e) {
      alert('Lỗi: ' + e.message)
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

  const handleSaveCommission = async () => {
    setSavingCommission(true)
    try {
      await apiFetch('/shippers/commission-rate', {
        method: 'PUT',
        body: JSON.stringify({ rate_percent: commissionRate }),
      })
      alert(`Đã cập nhật tỷ lệ hoa hồng: ${commissionRate}%`)
    } catch (e) {
      alert('Lỗi: ' + e.message)
    } finally {
      setSavingCommission(false)
    }
  }

  const getVehicleIcon = (type) => {
    if (type === 'CAR') return <Car size={16} style={{ color: '#2563eb' }} />
    if (type === 'BICYCLE') return <Bike size={16} style={{ color: '#059669' }} />
    return <Bike size={16} style={{ color: '#d97706' }} />
  }

  return (
    <section className="panel system-admin-panel" style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '16px' }}>
      {/* Component Specific CSS Fixes */}
      <style>{`
        .delivery-tab-btn {
          display: inline-flex !important;
          align-items: center !important;
          gap: 0.55rem !important;
          padding: 0.7rem 1.35rem !important;
          border-radius: 12px !important;
          font-weight: 700 !important;
          font-size: 0.875rem !important;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          border: 1.5px solid #cbd5e1 !important;
          background-color: #ffffff !important;
          background-image: none !important;
          color: #475569 !important;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04) !important;
          outline: none !important;
        }

        .delivery-tab-btn:hover {
          background-color: #f1f5f9 !important;
          color: #0f172a !important;
          border-color: #94a3b8 !important;
        }

        .delivery-tab-btn.active,
        .delivery-tab-btn.active:hover {
          background-color: #2563eb !important;
          background-image: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
          color: #ffffff !important;
          border-color: #1d4ed8 !important;
          box-shadow: 0 4px 14px rgba(37, 99, 235, 0.45) !important;
        }

        .delivery-tab-btn.active svg,
        .delivery-tab-btn.active span {
          color: #ffffff !important;
        }

        .delivery-input-wrapper {
          display: flex !important;
          align-items: center !important;
          gap: 0.5rem !important;
          background-color: #ffffff !important;
          border: 1px solid #cbd5e1 !important;
          border-radius: 8px !important;
          padding: 0 0.75rem !important;
          height: 42px !important;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03) !important;
          transition: border-color 0.2s ease !important;
        }

        .delivery-input-wrapper:focus-within {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 3px rgba(37,99,235,0.15) !important;
        }

        .delivery-input-wrapper input,
        .delivery-input-wrapper select {
          border: none !important;
          outline: none !important;
          background: transparent !important;
          padding: 0 !important;
          margin: 0 !important;
          height: 100% !important;
          width: 100% !important;
          font-size: 0.875rem !important;
          color: #0f172a !important;
          box-shadow: none !important;
        }
      `}</style>

      {/* Header */}
      <div className="panel-head system-admin-panel-head" style={{ marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ padding: '0.6rem', borderRadius: '12px', background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(37,99,235,0.25)' }}>
            <Truck size={24} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Quản lý giao hàng toàn hệ thống</h2>
            <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Hồ sơ nhân viên, cấu hình phân công tự động, KPI hiệu suất và hoa hồng chi trả</span>
          </div>
        </div>
      </div>

      {/* Sub-tabs Nav */}
      <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
        {ADMIN_DELIVERY_TABS.map(tab => {
          const IconComp = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              className={`delivery-tab-btn ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              style={isActive ? {
                backgroundColor: '#2563eb',
                backgroundImage: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: '#ffffff',
                borderColor: '#1d4ed8',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.45)',
              } : {}}
            >
              <IconComp size={18} style={{ color: isActive ? '#ffffff' : '#64748b' }} />
              <span style={{ color: isActive ? '#ffffff' : '#475569' }}>{tab.label}</span>
              {isActive && <Check size={16} style={{ color: '#ffffff', marginLeft: '0.2rem' }} />}
            </button>
          )
        })}
      </div>

      {/* TAB 1: CRUD & LIST */}
      {activeTab === 'crud' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Filter & Search */}
          <div style={{ background: '#ffffff', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px 140px', gap: '1rem', alignItems: 'center' }}>
              {/* Search Input Box */}
              <div className="delivery-input-wrapper">
                <Search size={18} style={{ color: '#64748b', flexShrink: 0 }} />
                <input
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  placeholder="Tìm theo username, họ tên, số điện thoại..."
                  onKeyDown={e => e.key === 'Enter' && loadShippers()}
                />
              </div>

              {/* Filter Status Select Box */}
              <div className="delivery-input-wrapper">
                <Filter size={16} style={{ color: '#64748b', flexShrink: 0 }} />
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="">Tất cả trạng thái</option>
                  <option value="ACTIVE">Đang hoạt động</option>
                  <option value="INACTIVE">Tắt hoạt động</option>
                  <option value="SUSPENDED">Tạm ngưng</option>
                </select>
              </div>

              <button
                type="button"
                onClick={loadShippers}
                style={{
                  height: '42px',
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(37,99,235,0.25)',
                }}
              >
                <Search size={16} /> Lọc dữ liệu
              </button>
            </div>
          </div>

          {/* Form Create / Edit */}
          <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {editingId ? <Edit2 size={18} style={{ color: '#2563eb' }} /> : <UserPlus size={18} style={{ color: '#059669' }} />}
                {editingId ? 'Cập nhật thông tin giao hàng' : 'Tạo tài khoản giao hàng mới'}
              </h3>
              {editingId && (
                <span style={{ fontSize: '0.8rem', background: '#eff6ff', color: '#1d4ed8', padding: '0.25rem 0.6rem', borderRadius: '6px', fontWeight: '600' }}>
                  Đang chỉnh sửa ID: {editingId}
                </span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>Tên đăng nhập (Username) *</span>
                <input
                  value={form.username || ''}
                  onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                  placeholder="Ví dụ: shipper01"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>Họ và tên đầy đủ *</span>
                <input
                  value={form.full_name || ''}
                  onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>Email liên hệ</span>
                <input
                  value={form.email || ''}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  placeholder="shipper@avengers.coffee"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>Số điện thoại</span>
                <input
                  value={form.phone_number || ''}
                  onChange={e => setForm(p => ({ ...p, phone_number: e.target.value }))}
                  placeholder="0901234567"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>Biển số xe</span>
                <input
                  value={form.vehicle_plate || ''}
                  onChange={e => setForm(p => ({ ...p, vehicle_plate: e.target.value }))}
                  placeholder="59B1 234.56"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>Mật khẩu {editingId ? '(Bỏ trống nếu không đổi)' : '*'}</span>
                <input
                  type="password"
                  value={form.password || ''}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="••••••••"
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>Phương tiện giao hàng</span>
                <select
                  value={form.vehicle_type}
                  onChange={e => setForm(p => ({ ...p, vehicle_type: e.target.value }))}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', background: '#fff' }}
                >
                  <option value="MOTORBIKE">Xe máy</option>
                  <option value="CAR">Ô tô</option>
                  <option value="BICYCLE">Xe đạp</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569' }}>Chi nhánh phụ trách</span>
                <select
                  value={form.branch_code}
                  onChange={e => setForm(p => ({ ...p, branch_code: e.target.value }))}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.875rem', background: '#fff' }}
                >
                  <option value="">Chọn chi nhánh phụ trách</option>
                  {branchOptions.map(b => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {/* Form Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              {editingId && (
                <button
                  type="button"
                  onClick={() => { setForm({ ...BLANK_FORM }); setEditingId(null) }}
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
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '0.5rem 1.5rem',
                  background: '#059669',
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
          </div>

          {/* Table List */}
          {shippersLoading ? (
            <div style={{ background: '#fff', padding: '2rem', textAlign: 'center', borderRadius: '12px', color: '#64748b' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: '#2563eb' }} />
              <p style={{ margin: 0 }}>Đang tải danh sách nhân viên giao hàng...</p>
            </div>
          ) : shippersError ? (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '1rem', borderRadius: '12px', color: '#dc2626' }}>
              <p style={{ margin: 0, fontWeight: '600' }}>Lỗi tải dữ liệu: {shippersError}</p>
            </div>
          ) : (
            <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '700' }}>
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
                  {shippers.map(s => {
                    const st = SHIPPER_STATUS_CONFIG[s.status] || SHIPPER_STATUS_CONFIG.INACTIVE
                    return (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ fontWeight: '700', color: '#0f172a' }}>{s.full_name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>@{s.username}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ color: '#334155' }}>{s.email || '—'}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{s.phone_number || '—'}</div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {getVehicleIcon(s.vehicle_type)}
                            <span style={{ fontWeight: '600', color: '#334155' }}>{s.vehicle_plate || 'Chưa cập nhật'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#334155' }}>
                          {s.branch_name || s.branch_code || 'Toàn hệ thống'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
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
                              <span style={{ color: '#94a3b8', fontWeight: 'normal' }}>—</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.8rem' }}>
                          {fmtDate(s.created_at)}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                            {/* Edit Button */}
                            <button
                              type="button"
                              title="Chỉnh sửa thông tin"
                              onClick={() => {
                                setForm({
                                  username: s.username,
                                  full_name: s.full_name,
                                  email: s.email || '',
                                  phone_number: s.phone_number || '',
                                  vehicle_type: s.vehicle_type || 'MOTORBIKE',
                                  vehicle_plate: s.vehicle_plate || '',
                                  branch_code: s.branch_code || '',
                                  password: '',
                                })
                                setEditingId(s.id)
                              }}
                              style={{
                                padding: '0.35rem 0.65rem',
                                background: '#eff6ff',
                                color: '#1d4ed8',
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
                            <button
                              type="button"
                              title={s.status === 'ACTIVE' ? 'Tắt hoạt động' : 'Kích hoạt'}
                              onClick={() => handleToggleStatus(s)}
                              style={{
                                padding: '0.35rem 0.65rem',
                                background: s.status === 'ACTIVE' ? '#fff7ed' : '#f0fdf4',
                                color: s.status === 'ACTIVE' ? '#c2410c' : '#15803d',
                                border: s.status === 'ACTIVE' ? '1px solid #ffedd5' : '1px solid #bbf7d0',
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
                            <button
                              type="button"
                              title="Xóa hồ sơ"
                              onClick={() => handleDelete(s.id, s.full_name)}
                              style={{
                                padding: '0.35rem 0.65rem',
                                background: '#fef2f2',
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
                  })}
                </tbody>
              </table>
              {shippers.length === 0 && !shippersLoading && (
                <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                  <Users size={32} style={{ margin: '0 auto 0.5rem auto', color: '#cbd5e1' }} />
                  <p style={{ margin: 0, fontWeight: '500' }}>Chưa tìm thấy nhân viên giao hàng nào.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CONFIG */}
      {activeTab === 'config' && (
        <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
            <Sliders size={22} style={{ color: '#2563eb' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
              Cấu hình thuật toán phân công đơn hàng
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Auto Assign Toggle */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <span style={{ display: 'block', fontWeight: '700', fontSize: '0.875rem', color: '#334155', marginBottom: '0.75rem' }}>
                Chế độ phân công
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={config.auto_assign}
                  onChange={e => setConfig(p => ({ ...p, auto_assign: e.target.checked }))}
                  style={{ width: '18px', height: '18px', accentColor: '#2563eb' }}
                />
                <div>
                  <div style={{ fontWeight: '600', fontSize: '0.875rem', color: config.auto_assign ? '#059669' : '#dc2626' }}>
                    {config.auto_assign ? 'Đang bật tự động phân công' : 'Đang tắt - Phân công thủ công'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {config.auto_assign ? 'Hệ thống tự động tìm và giao đơn cho nhân viên khả dụng' : 'Quản lý cửa hàng chủ động chọn nhân viên cho từng đơn'}
                  </div>
                </div>
              </label>
            </div>

            {/* Algorithm Select */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <span style={{ display: 'block', fontWeight: '700', fontSize: '0.875rem', color: '#334155', marginBottom: '0.5rem' }}>
                Thuật toán điều phối
              </span>
              <select
                value={config.algorithm}
                onChange={e => setConfig(p => ({ ...p, algorithm: e.target.value }))}
                disabled={!config.auto_assign}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  background: config.auto_assign ? '#fff' : '#f1f5f9',
                }}
              >
                {ALGORITHM_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Search Radius */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <span style={{ display: 'block', fontWeight: '700', fontSize: '0.875rem', color: '#334155', marginBottom: '0.5rem' }}>
                Bán kính tìm kiếm nhân viên (km)
              </span>
              <input
                type="number"
                min="1"
                max="30"
                value={config.search_radius_km}
                onChange={e => setConfig(p => ({ ...p, search_radius_km: Number(e.target.value) }))}
                disabled={!config.auto_assign}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  background: config.auto_assign ? '#fff' : '#f1f5f9',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '0.35rem' }}>
                Quét nhân viên trực tuyến trong phạm vi {config.search_radius_km} km tính từ cửa hàng
              </span>
            </div>

            {/* Max Orders */}
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <span style={{ display: 'block', fontWeight: '700', fontSize: '0.875rem', color: '#334155', marginBottom: '0.5rem' }}>
                Số đơn tối đa cho mỗi nhân viên
              </span>
              <input
                type="number"
                min="1"
                max="10"
                value={config.max_orders_per_shipper}
                onChange={e => setConfig(p => ({ ...p, max_orders_per_shipper: Number(e.target.value) }))}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  background: '#fff',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '0.35rem' }}>
                Giới hạn tối đa số lượng đơn đang giao đồng thời
              </span>
            </div>
          </div>

          {/* Current Rules Summary Callout */}
          <div style={{ background: '#ecfdf5', padding: '1rem 1.25rem', borderRadius: '10px', borderLeft: '4px solid #059669', marginBottom: '1.5rem' }}>
            <div style={{ fontWeight: '700', color: '#065f46', fontSize: '0.875rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CheckCircle2 size={16} /> Quy tắc phân công đang áp dụng:
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#047857', fontSize: '0.825rem', lineHeight: '1.5' }}>
              <li>Chế độ: <strong>{config.auto_assign ? 'Tự động phân công' : 'Thủ công'}</strong></li>
              <li>Thuật toán: <strong>{ALGORITHM_OPTIONS.find(o => o.id === config.algorithm)?.label}</strong></li>
              <li>Bán kính tìm kiếm: <strong>{config.search_radius_km} km</strong></li>
              <li>Tải tối đa: <strong>{config.max_orders_per_shipper} đơn trên mỗi nhân viên</strong></li>
            </ul>
          </div>

          {/* Save Config Action */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleSaveConfig}
              disabled={savingConfig}
              style={{
                padding: '0.65rem 1.75rem',
                background: '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '0.875rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                cursor: 'pointer',
                opacity: savingConfig ? 0.7 : 1,
                boxShadow: '0 2px 6px rgba(5,150,105,0.25)',
              }}
            >
              <Save size={16} /> {savingConfig ? 'Đang lưu cấu hình...' : 'Lưu cấu hình thuật toán'}
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: KPI & PERFORMANCE */}
      {activeTab === 'kpi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Controls Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', padding: '1rem 1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={20} style={{ color: '#2563eb' }} /> Báo cáo hiệu suất giao hàng toàn chuỗi
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[
                { id: '7d', label: '7 ngày gần đây' },
                { id: '30d', label: '30 ngày gần đây' },
                { id: '90d', label: '3 tháng gần đây' },
              ].map(r => {
                const isSel = kpiRange === r.id
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setKpiRange(r.id)}
                    style={{
                      padding: '0.4rem 0.85rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      border: isSel ? '1px solid #2563eb' : '1px solid #cbd5e1',
                      background: isSel ? '#2563eb' : '#fff',
                      color: isSel ? '#fff' : '#475569',
                      cursor: 'pointer',
                    }}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>

          {kpiLoading ? (
            <div style={{ background: '#fff', padding: '2rem', textAlign: 'center', borderRadius: '12px', color: '#64748b' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: '#2563eb' }} />
              <p style={{ margin: 0 }}>Đang tải báo cáo KPI...</p>
            </div>
          ) : kpiData ? (
            <>
              {/* Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                {[
                  { label: 'Tổng đơn hoàn thành', value: kpiData.total_delivered || 0, color: '#059669', bg: '#ecfdf5', icon: CheckCircle2 },
                  { label: 'Tổng đơn thất bại', value: kpiData.total_failed || 0, color: '#dc2626', bg: '#fef2f2', icon: XCircle },
                  { label: 'Tỷ lệ thành công', value: `${kpiData.success_rate || 0}%`, color: '#2563eb', bg: '#eff6ff', icon: TrendingUp },
                  { label: 'Tổng hoa hồng đã chi', value: fmtCurrency(kpiData.total_commission || 0), color: '#d97706', bg: '#fffbeb', icon: Coins },
                ].map(stat => {
                  const IconComp = stat.icon
                  return (
                    <div key={stat.label} style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#64748b' }}>{stat.label}</span>
                        <div style={{ padding: '0.4rem', borderRadius: '8px', background: stat.bg, color: stat.color }}>
                          <IconComp size={18} />
                        </div>
                      </div>
                      <div style={{ fontSize: '1.5rem', fontWeight: '800', color: stat.color }}>
                        {typeof stat.value === 'number' ? stat.value.toLocaleString('vi-VN') : stat.value}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* KPI Staff Breakdown Table */}
              {kpiData.shippers && kpiData.shippers.length > 0 && (
                <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
                  <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', fontWeight: '700', color: '#0f172a' }}>
                    Chi tiết hiệu suất từng nhân viên
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '700' }}>
                        <th style={{ padding: '0.85rem 1rem' }}>Nhân viên</th>
                        <th style={{ padding: '0.85rem 1rem' }}>Đã giao</th>
                        <th style={{ padding: '0.85rem 1rem' }}>Thất bại</th>
                        <th style={{ padding: '0.85rem 1rem' }}>Tỷ lệ thành công</th>
                        <th style={{ padding: '0.85rem 1rem' }}>Đánh giá trung bình</th>
                        <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Hoa hồng tích lũy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kpiData.shippers.map((s, i) => {
                        const total = (s.delivered || 0) + (s.failed || 0)
                        const rate = total > 0 ? Math.round(s.delivered / total * 100) : 0
                        return (
                          <tr key={s.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                              {s.full_name || s.username}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', color: '#059669', fontWeight: '700' }}>
                              {s.delivered || 0}
                            </td>
                            <td style={{ padding: '0.85rem 1rem', color: '#dc2626' }}>
                              {s.failed || 0}
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '9999px',
                                fontSize: '0.75rem',
                                fontWeight: '700',
                                backgroundColor: rate >= 90 ? '#ecfdf5' : rate >= 70 ? '#fffbeb' : '#fef2f2',
                                color: rate >= 90 ? '#047857' : rate >= 70 ? '#b45309' : '#b91c1c',
                                border: `1px solid ${rate >= 90 ? '#a7f3d0' : rate >= 70 ? '#fde68a' : '#fecaca'}`,
                              }}>
                                {rate}%
                              </span>
                            </td>
                            <td style={{ padding: '0.85rem 1rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: '#d97706', fontWeight: '700' }}>
                                {s.rating ? <><Star size={14} fill="#d97706" /> {Number(s.rating).toFixed(1)}</> : '—'}
                              </div>
                            </td>
                            <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#059669', fontWeight: '700' }}>
                              {fmtCurrency(s.commission || 0)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div style={{ background: '#fff', padding: '3rem', textAlign: 'center', borderRadius: '12px', color: '#64748b' }}>
              <p style={{ margin: '0 0 1rem 0' }}>Chưa có dữ liệu KPI khả dụng.</p>
              <button
                type="button"
                onClick={loadKpi}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  color: '#334155',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <RefreshCw size={14} /> Thử lại
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: FINANCE & COMMISSION */}
      {activeTab === 'finance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Rate Setup Card */}
          <div style={{ background: '#ffffff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f1f5f9' }}>
              <Coins size={22} style={{ color: '#d97706' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>
                Cấu hình tỷ lệ hoa hồng chi trả
              </h3>
            </div>

            <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0 0 1.25rem 0' }}>
              Tỷ lệ hoa hồng được áp dụng cho nhân viên giao hàng trên mỗi đơn hoàn thành thành công. Thay đổi có hiệu lực ngay cho các đơn hàng mới.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#334155' }}>Tỷ lệ hoa hồng (%)</span>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={commissionRate}
                  onChange={e => setCommissionRate(Number(e.target.value))}
                  style={{
                    width: '90px',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.9rem',
                    fontWeight: '700',
                    textAlign: 'center',
                  }}
                />
              </label>

              <button
                type="button"
                onClick={handleSaveCommission}
                disabled={savingCommission}
                style={{
                  padding: '0.55rem 1.25rem',
                  background: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer',
                  opacity: savingCommission ? 0.7 : 1,
                  boxShadow: '0 2px 6px rgba(5,150,105,0.25)',
                }}
              >
                <Save size={16} /> {savingCommission ? 'Đang lưu...' : 'Cập nhật tỷ lệ'}
              </button>
            </div>

            {/* Example preview */}
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '0.85rem 1rem', borderRadius: '8px', color: '#b45309', fontSize: '0.85rem' }}>
              <strong>Ví dụ thực tế:</strong> Với mức hoa hồng {commissionRate}%, một đơn có phí giao 15.000đ → Nhân viên nhận <strong>~{Math.round(15000 * commissionRate / 100).toLocaleString('vi-VN')}đ</strong> / đơn hoàn thành.
            </div>
          </div>

          {/* Payment History */}
          <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 4px rgba(0,0,0,0.03)' }}>
            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Lịch sử thanh toán hoa hồng</span>
              <button
                type="button"
                onClick={loadFinance}
                style={{
                  padding: '0.35rem 0.65rem',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: '#475569',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                <RefreshCw size={13} /> Làm mới
              </button>
            </div>

            {financeLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: '#2563eb' }} />
                <p style={{ margin: 0 }}>Đang tải lịch sử chi trả...</p>
              </div>
            ) : financeData?.payments?.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontWeight: '700' }}>
                    <th style={{ padding: '0.85rem 1rem' }}>Nhân viên</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Kỳ thanh toán</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Số đơn</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Tổng hoa hồng</th>
                    <th style={{ padding: '0.85rem 1rem' }}>Trạng thái</th>
                    <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Ngày quyết toán</th>
                  </tr>
                </thead>
                <tbody>
                  {financeData.payments.map((p, i) => (
                    <tr key={p.id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                        {p.shipper_name || p.shipper_id?.slice(0, 8)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.8rem' }}>
                        {fmtDate(p.period_start)} — {fmtDate(p.period_end)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: '600', color: '#334155' }}>
                        {p.order_count || 0}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#059669', fontWeight: '700' }}>
                        {fmtCurrency(p.total_commission)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '9999px',
                          fontSize: '0.75rem',
                          fontWeight: '700',
                          backgroundColor: p.status === 'PAID' ? '#ecfdf5' : '#fffbeb',
                          color: p.status === 'PAID' ? '#047857' : '#b45309',
                          border: `1px solid ${p.status === 'PAID' ? '#a7f3d0' : '#fde68a'}`,
                        }}>
                          {p.status === 'PAID' ? 'Đã quyết toán' : 'Chờ quyết toán'}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#64748b', fontSize: '0.8rem' }}>
                        {fmtDate(p.paid_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
                <Coins size={32} style={{ margin: '0 auto 0.5rem auto', color: '#cbd5e1' }} />
                <p style={{ margin: 0 }}>Chưa có lịch sử thanh toán hoa hồng nào.</p>
              </div>
            )}
          </div>
        </div>
      )}
      {activeTab === 'cod' && (
        <div style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ margin: 0, fontWeight: '800', color: '#0f172a', fontSize: '1.05rem' }}>💵 Đối Soát Tiền Mặt COD</h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                Danh sách Shipper đã gửi xác nhận nộp tiền COD — Admin kiểm tra và xác nhận
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {['PENDING', 'CONFIRMED', 'REJECTED', ''].map(s => (
                <button
                  key={s || 'all'}
                  onClick={() => { setCodStatusFilter(s); }}
                  style={{
                    padding: '0.35rem 0.85rem', borderRadius: '9999px', fontSize: '0.78rem', fontWeight: '700',
                    cursor: 'pointer', border: '1.5px solid',
                    backgroundColor: codStatusFilter === s ? '#1e40af' : '#fff',
                    color: codStatusFilter === s ? '#fff' : '#475569',
                    borderColor: codStatusFilter === s ? '#1e40af' : '#e2e8f0',
                  }}
                >
                  {s === 'PENDING' ? '⏳ Chờ duyệt' : s === 'CONFIRMED' ? '✅ Đã xác nhận' : s === 'REJECTED' ? '❌ Từ chối' : 'Tất cả'}
                </button>
              ))}
              <button
                onClick={loadCodRemits}
                style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1.5px solid #e2e8f0', background: '#fff', cursor: 'pointer', color: '#475569' }}
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>

          {codLoading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>Đang tải...</div>
          ) : codRemits.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8' }}>
              <CheckCircle2 size={36} style={{ margin: '0 auto 0.75rem', color: '#cbd5e1' }} />
              <p style={{ margin: 0 }}>Không có phiếu nộp COD nào {codStatusFilter ? `(${codStatusFilter})` : ''}.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                    {['⏰ Thời gian', '👨‍🚚 Shipper', '🏪 Chi nhánh', '💵 Số tiền', '💬 Ghi chú', 'Trạng thái', 'Hành động'].map(h => (
                      <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '0.8rem' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {codRemits.map((r, i) => {
                    const isPending = r.status === 'PENDING'
                    const isConfirmed = r.status === 'CONFIRMED'
                    return (
                      <tr key={r.id || i} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isPending ? '#fffbeb' : isConfirmed ? '#f0fdf4' : '#fff1f2' }}>
                        <td style={{ padding: '0.85rem 1rem', color: '#64748b', fontSize: '0.78rem' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleString('vi-VN') : '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: '700', color: '#0f172a' }}>
                          {r.shipper_name || r.shipper_id?.slice(0, 8)}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#475569', fontSize: '0.8rem' }}>
                          {r.branch_code || '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: '800', color: '#dc2626', fontSize: '1rem' }}>
                          {fmtCurrency(r.amount)}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', color: '#94a3b8', fontSize: '0.8rem', maxWidth: '160px' }}>
                          {r.note || '—'}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{
                            display: 'inline-block', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '700',
                            backgroundColor: isPending ? '#fffbeb' : isConfirmed ? '#ecfdf5' : '#fef2f2',
                            color: isPending ? '#b45309' : isConfirmed ? '#047857' : '#dc2626',
                            border: `1px solid ${isPending ? '#fde68a' : isConfirmed ? '#a7f3d0' : '#fecaca'}`,
                          }}>
                            {isPending ? '⏳ Chờ duyệt' : isConfirmed ? '✅ Đã xác nhận' : '❌ Từ chối'}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {isPending ? (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                onClick={() => handleConfirmCod(r.id, 'CONFIRMED')}
                                disabled={codConfirming === r.id + 'CONFIRMED'}
                                style={{
                                  padding: '0.35rem 0.8rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700',
                                  background: '#059669', color: '#fff', border: 'none', cursor: 'pointer',
                                  opacity: codConfirming === r.id + 'CONFIRMED' ? 0.6 : 1,
                                }}
                              >
                                <Check size={13} style={{ marginRight: 4 }} />Đã nhận tiền
                              </button>
                              <button
                                onClick={() => handleConfirmCod(r.id, 'REJECTED')}
                                disabled={codConfirming === r.id + 'REJECTED'}
                                style={{
                                  padding: '0.35rem 0.8rem', borderRadius: '8px', fontSize: '0.78rem', fontWeight: '700',
                                  background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca', cursor: 'pointer',
                                  opacity: codConfirming === r.id + 'REJECTED' ? 0.6 : 1,
                                }}
                              >
                                <X size={13} style={{ marginRight: 4 }} />Từ chối
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                              {isConfirmed ? `✓ ${fmtDate(r.confirmed_at)}` : '✕ Đã từ chối'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
