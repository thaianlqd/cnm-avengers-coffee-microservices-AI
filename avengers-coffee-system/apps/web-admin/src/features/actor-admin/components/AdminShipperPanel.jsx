import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../admin-dashboard/constants'
import { getAdminAccessToken } from '../../../lib/adminFetch'

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

const SHIPPER_STATUS_COLORS = {
  ACTIVE: '#10B981', INACTIVE: '#6B7280', SUSPENDED: '#EF4444',
}

const ALGORITHM_OPTIONS = [
  { id: 'NEAREST', label: 'Gần nhất (Nearest Shipper)' },
  { id: 'ROUND_ROBIN', label: 'Xoay vòng (Round Robin)' },
  { id: 'LEAST_BUSY', label: 'Ít đơn nhất (Least Busy)' },
]

const ADMIN_SHIPPER_TABS = ['crud', 'config', 'kpi', 'finance']
const ADMIN_SHIPPER_TAB_LABELS = {
  crud: '👤 CRUD Shipper',
  config: '⚙️ Cấu hình thuật toán',
  kpi: '📊 KPI toàn chuỗi',
  finance: '💰 Hoa hồng & Thanh toán',
}

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

  const loadShippers = useCallback(async () => {
    setShippersLoading(true)
    setShippersError(null)
    try {
      const q = new URLSearchParams()
      if (searchQ) q.set('q', searchQ)
      if (filterStatus) q.set('status', filterStatus)
      const res = await apiFetch(`/shippers?${q.toString()}`)
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

  useEffect(() => { loadShippers() }, [loadShippers])
  useEffect(() => {
    if (activeTab === 'config') loadConfig()
    if (activeTab === 'kpi') loadKpi()
    if (activeTab === 'finance') loadFinance()
  }, [activeTab, loadConfig, loadKpi, loadFinance])
  useEffect(() => { if (activeTab === 'kpi') loadKpi() }, [kpiRange, loadKpi])

  const handleSave = async () => {
    if (!form.username || !form.full_name) {
      alert('Vui lòng điền đủ Username và Họ tên')
      return
    }
    setSaving(true)
    try {
      if (editingId) {
        await apiFetch(`/shippers/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...form, password: form.password || undefined }),
        })
        alert('✅ Cập nhật Shipper thành công!')
      } else {
        if (!form.password) { alert('Cần nhập mật khẩu khi tạo mới'); setSaving(false); return }
        await apiFetch('/shippers', { method: 'POST', body: JSON.stringify(form) })
        alert('✅ Tạo tài khoản Shipper thành công!')
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
    if (!confirm(`Xóa Shipper "${name}"? Thao tác này không thể hoàn tác.`)) return
    try {
      await apiFetch(`/shippers/${shipperId}`, { method: 'DELETE' })
      alert('✅ Đã xóa Shipper.')
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
      alert('✅ Đã lưu cấu hình thuật toán phân công.')
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
      alert(`✅ Đã cập nhật tỉ lệ hoa hồng: ${commissionRate}%`)
    } catch (e) {
      alert('Lỗi: ' + e.message)
    } finally {
      setSavingCommission(false)
    }
  }

  return (
    <section className="panel system-admin-panel">
      <div className="panel-head system-admin-panel-head">
        <h2>🚴 Quản lý Shipper toàn hệ thống</h2>
        <span>CRUD hồ sơ, cấu hình phân công, KPI và hoa hồng tất cả Shipper</span>
      </div>

      {/* Sub-tabs */}
      <div className="workforce-tabs" style={{ marginBottom: '1.5rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {ADMIN_SHIPPER_TABS.map(tab => (
          <button
            key={tab}
            type="button"
            className={`workforce-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {ADMIN_SHIPPER_TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* TAB: CRUD */}
      {activeTab === 'crud' && (
        <div>
          {/* Filter */}
          <div className="orders-filter-bar" style={{ marginBottom: '1rem' }}>
            <div className="system-admin-filter-grid">
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Tìm username, họ tên, SĐT..."
                onKeyDown={e => e.key === 'Enter' && loadShippers()}
              />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Không hoạt động</option>
                <option value="SUSPENDED">Tạm ngưng</option>
              </select>
              <button type="button" onClick={loadShippers}>Lọc</button>
            </div>
          </div>

          {/* Form */}
          <div className="system-admin-card" style={{ marginBottom: '1rem' }}>
            <div className="panel-head">
              <h2>{editingId ? 'Cập nhật Shipper' : 'Tạo tài khoản Shipper mới'}</h2>
            </div>
            <div className="system-admin-form-grid system-admin-form-grid--user">
              {[
                { field: 'username', label: 'Username', placeholder: 'shipper01' },
                { field: 'full_name', label: 'Họ tên đầy đủ', placeholder: 'Nguyễn Văn A' },
                { field: 'email', label: 'Email', placeholder: 'shipper@avengers.coffee' },
                { field: 'phone_number', label: 'Số điện thoại', placeholder: '0901234567' },
                { field: 'vehicle_plate', label: 'Biển số xe', placeholder: '59-B1 234.56' },
              ].map(({ field, label, placeholder }) => (
                <label key={field}>
                  <span>{label}</span>
                  <input
                    value={form[field] || ''}
                    onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
                    placeholder={placeholder}
                  />
                </label>
              ))}
              <label>
                <span>Mật khẩu {editingId ? '(để trống giữ nguyên)' : '*'}</span>
                <input
                  type="password"
                  value={form.password || ''}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                />
              </label>
              <label>
                <span>Loại phương tiện</span>
                <select value={form.vehicle_type} onChange={e => setForm(p => ({ ...p, vehicle_type: e.target.value }))}>
                  <option value="MOTORBIKE">Xe máy</option>
                  <option value="CAR">Ô tô</option>
                  <option value="BICYCLE">Xe đạp</option>
                </select>
              </label>
              <label>
                <span>Chi nhánh</span>
                <select value={form.branch_code} onChange={e => setForm(p => ({ ...p, branch_code: e.target.value }))}>
                  <option value="">— Chọn chi nhánh —</option>
                  {branchOptions.map(b => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="system-admin-form-actions">
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Tạo Shipper'}
              </button>
              {editingId && (
                <button type="button" className="secondary" onClick={() => { setForm({ ...BLANK_FORM }); setEditingId(null) }}>
                  Hủy sửa
                </button>
              )}
            </div>
          </div>

          {/* Table */}
          {shippersLoading ? (
            <p>Đang tải danh sách Shipper...</p>
          ) : shippersError ? (
            <p className="error-text">{shippersError}</p>
          ) : (
            <div className="system-admin-table-wrap">
              <table className="system-admin-table">
                <thead>
                  <tr>
                    {['Họ tên / Username', 'Email / SĐT', 'Phương tiện', 'Chi nhánh', 'Trạng thái', 'Đánh giá', 'Ngày tham gia', 'Thao tác'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shippers.map(s => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.full_name}</strong>
                        <p>@{s.username}</p>
                      </td>
                      <td>
                        <p>{s.email || '—'}</p>
                        <p>{s.phone_number || '—'}</p>
                      </td>
                      <td>
                        {s.vehicle_type === 'MOTORBIKE' ? '🏍️' : s.vehicle_type === 'CAR' ? '🚗' : '🚲'} {s.vehicle_plate || '—'}
                      </td>
                      <td>{s.branch_name || s.branch_code || '—'}</td>
                      <td>
                        <span style={{
                          backgroundColor: (SHIPPER_STATUS_COLORS[s.status] || '#6B7280') + '20',
                          color: SHIPPER_STATUS_COLORS[s.status] || '#6B7280',
                          padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                        }}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ color: '#F59E0B', fontWeight: '700' }}>
                        {s.rating ? `${Number(s.rating).toFixed(1)}⭐` : '—'}
                      </td>
                      <td>{fmtDate(s.created_at)}</td>
                      <td>
                        <div className="system-admin-table-actions">
                          <button type="button" className="secondary" onClick={() => { setForm({ username: s.username, full_name: s.full_name, email: s.email || '', phone_number: s.phone_number || '', vehicle_type: s.vehicle_type || 'MOTORBIKE', vehicle_plate: s.vehicle_plate || '', branch_code: s.branch_code || '', password: '' }); setEditingId(s.id) }}>
                            Sửa
                          </button>
                          <button type="button" className="secondary" onClick={() => handleToggleStatus(s)}>
                            {s.status === 'ACTIVE' ? 'Tắt' : 'Bật'}
                          </button>
                          <button type="button" className="secondary" onClick={() => handleDelete(s.id, s.full_name)}>Xóa</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shippers.length === 0 && !shippersLoading && (
                <p style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>Chưa có Shipper nào.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB: CONFIG */}
      {activeTab === 'config' && (
        <div className="system-admin-card">
          <h3 style={{ marginBottom: '1rem' }}>⚙️ Cấu hình thuật toán phân công đơn</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <label>
              <span style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>Tự động phân công</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={config.auto_assign}
                    onChange={e => setConfig(p => ({ ...p, auto_assign: e.target.checked }))}
                    style={{ width: 'auto', accentColor: 'var(--burnt)' }}
                  />
                  <span style={{ fontSize: '14px' }}>
                    {config.auto_assign ? '✅ Đang bật - Hệ thống tự động tìm Shipper' : '⏸️ Đang tắt - Manager phân công thủ công'}
                  </span>
                </label>
              </div>
            </label>
            <label>
              <span style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>Thuật toán phân công</span>
              <select
                value={config.algorithm}
                onChange={e => setConfig(p => ({ ...p, algorithm: e.target.value }))}
                disabled={!config.auto_assign}
              >
                {ALGORITHM_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>Bán kính tìm Shipper (km)</span>
              <input
                type="number"
                min="1"
                max="30"
                value={config.search_radius_km}
                onChange={e => setConfig(p => ({ ...p, search_radius_km: Number(e.target.value) }))}
                disabled={!config.auto_assign}
              />
              <small style={{ color: '#9CA3AF' }}>Tìm Shipper online trong bán kính {config.search_radius_km}km</small>
            </label>
            <label>
              <span style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem' }}>Số đơn tối đa / Shipper</span>
              <input
                type="number"
                min="1"
                max="10"
                value={config.max_orders_per_shipper}
                onChange={e => setConfig(p => ({ ...p, max_orders_per_shipper: Number(e.target.value) }))}
              />
              <small style={{ color: '#9CA3AF' }}>Giới hạn số đơn đang giao cùng lúc</small>
            </label>
          </div>

          <div style={{ backgroundColor: '#F0FDF4', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', borderLeft: '4px solid #10B981' }}>
            <strong style={{ color: '#065F46' }}>Cấu hình hiện tại:</strong>
            <ul style={{ margin: '0.5rem 0 0 1.2rem', color: '#065F46', fontSize: '13px' }}>
              <li>Tự động phân công: {config.auto_assign ? 'Bật' : 'Tắt'}</li>
              <li>Thuật toán: {ALGORITHM_OPTIONS.find(o => o.id === config.algorithm)?.label}</li>
              <li>Bán kính: {config.search_radius_km}km</li>
              <li>Tối đa: {config.max_orders_per_shipper} đơn/Shipper</li>
            </ul>
          </div>

          <button type="button" onClick={handleSaveConfig} disabled={savingConfig}>
            {savingConfig ? 'Đang lưu...' : '💾 Lưu cấu hình'}
          </button>
        </div>
      )}

      {/* TAB: KPI */}
      {activeTab === 'kpi' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: 0 }}>📊 KPI Shipper toàn chuỗi</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {[
                { id: '7d', label: '7 ngày' },
                { id: '30d', label: '30 ngày' },
                { id: '90d', label: '3 tháng' },
              ].map(r => (
                <button
                  key={r.id}
                  type="button"
                  className={kpiRange === r.id ? '' : 'secondary'}
                  onClick={() => setKpiRange(r.id)}
                  style={{ padding: '4px 12px', fontSize: '12px' }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {kpiLoading ? (
            <p>Đang tải dữ liệu KPI...</p>
          ) : kpiData ? (
            <>
              <div className="system-admin-kpi-grid" style={{ marginBottom: '1.5rem' }}>
                {[
                  { label: 'Tổng đơn đã giao', value: kpiData.total_delivered || 0, color: '#10B981' },
                  { label: 'Tổng đơn thất bại', value: kpiData.total_failed || 0, color: '#EF4444' },
                  { label: 'Tỉ lệ thành công', value: `${kpiData.success_rate || 0}%`, color: '#6366F1' },
                  { label: 'Tổng hoa hồng chi', value: fmtCurrency(kpiData.total_commission || 0), color: '#F59E0B' },
                ].map(stat => (
                  <article key={stat.label} className="system-admin-kpi-card">
                    <p>{stat.label}</p>
                    <h3 style={{ color: stat.color }}>{typeof stat.value === 'number' ? stat.value.toLocaleString('vi-VN') : stat.value}</h3>
                  </article>
                ))}
              </div>

              {kpiData.shippers && kpiData.shippers.length > 0 && (
                <div className="system-admin-table-wrap">
                  <table className="system-admin-table">
                    <thead>
                      <tr>
                        {['Shipper', 'Đã giao', 'Thất bại', 'Tỉ lệ', 'Rating', 'Hoa hồng'].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {kpiData.shippers.map((s, i) => {
                        const total = (s.delivered || 0) + (s.failed || 0)
                        const rate = total > 0 ? Math.round(s.delivered / total * 100) : 0
                        return (
                          <tr key={s.id || i}>
                            <td><strong>{s.full_name || s.username}</strong></td>
                            <td style={{ color: '#10B981', fontWeight: '700' }}>{s.delivered || 0}</td>
                            <td style={{ color: '#EF4444' }}>{s.failed || 0}</td>
                            <td>
                              <span style={{
                                backgroundColor: rate >= 90 ? '#ECFDF5' : rate >= 70 ? '#FEF3C7' : '#FEF2F2',
                                color: rate >= 90 ? '#065F46' : rate >= 70 ? '#92400E' : '#991B1B',
                                padding: '2px 8px', borderRadius: '999px', fontSize: '12px', fontWeight: '700',
                              }}>{rate}%</span>
                            </td>
                            <td style={{ color: '#F59E0B', fontWeight: '700' }}>{s.rating ? `${Number(s.rating).toFixed(1)}⭐` : '—'}</td>
                            <td style={{ color: '#10B981', fontWeight: '700' }}>{fmtCurrency(s.commission || 0)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF' }}>
              <p>Chưa có dữ liệu KPI. Hãy đảm bảo backend endpoint <code>/shippers/kpi</code> đã được triển khai.</p>
              <button type="button" className="secondary" onClick={loadKpi} style={{ marginTop: '1rem' }}>🔄 Thử lại</button>
            </div>
          )}
        </div>
      )}

      {/* TAB: FINANCE */}
      {activeTab === 'finance' && (
        <div>
          <div className="system-admin-card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>💰 Cấu hình hoa hồng Shipper</h3>
            <p style={{ color: '#6B7280', fontSize: '13px', marginBottom: '1rem' }}>
              Tỉ lệ hoa hồng được tính trên mỗi đơn giao thành công. Thay đổi áp dụng cho đơn mới từ thời điểm lưu.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontWeight: '600' }}>Tỉ lệ hoa hồng (%)</span>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={commissionRate}
                  onChange={e => setCommissionRate(Number(e.target.value))}
                  style={{ width: '80px' }}
                />
                <span style={{ color: '#6B7280', fontSize: '13px' }}>= {commissionRate}% / đơn</span>
              </label>
              <button type="button" onClick={handleSaveCommission} disabled={savingCommission}>
                {savingCommission ? 'Đang lưu...' : '💾 Lưu tỉ lệ'}
              </button>
            </div>
            <div style={{ backgroundColor: '#FFFBEB', padding: '0.75rem 1rem', borderRadius: '8px', borderLeft: '3px solid #F59E0B' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#92400E' }}>
                💡 Với mức hoa hồng {commissionRate}%, phí ship 15.000đ → Shipper nhận ~{Math.round(15000 * commissionRate / 100).toLocaleString('vi-VN')}đ/đơn
              </p>
            </div>
          </div>

          {/* Payment History */}
          <h3 style={{ marginBottom: '1rem' }}>📋 Lịch sử thanh toán hoa hồng</h3>
          {financeLoading ? (
            <p>Đang tải lịch sử...</p>
          ) : financeData?.payments?.length > 0 ? (
            <div className="system-admin-table-wrap">
              <table className="system-admin-table">
                <thead>
                  <tr>
                    {['Shipper', 'Kỳ thanh toán', 'Số đơn', 'Tổng hoa hồng', 'Trạng thái', 'Ngày thanh toán'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {financeData.payments.map((p, i) => (
                    <tr key={p.id || i}>
                      <td><strong>{p.shipper_name || p.shipper_id?.slice(0, 8)}</strong></td>
                      <td>{fmtDate(p.period_start)} — {fmtDate(p.period_end)}</td>
                      <td>{p.order_count || 0}</td>
                      <td style={{ color: '#10B981', fontWeight: '700' }}>{fmtCurrency(p.total_commission)}</td>
                      <td>
                        <span style={{
                          backgroundColor: p.status === 'PAID' ? '#ECFDF5' : '#FEF3C7',
                          color: p.status === 'PAID' ? '#065F46' : '#92400E',
                          padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                        }}>{p.status === 'PAID' ? 'Đã thanh toán' : 'Chưa thanh toán'}</span>
                      </td>
                      <td>{fmtDate(p.paid_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#9CA3AF' }}>
              <p>Chưa có lịch sử thanh toán hoa hồng.</p>
              <button type="button" className="secondary" onClick={loadFinance} style={{ marginTop: '0.5rem' }}>🔄 Làm mới</button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
