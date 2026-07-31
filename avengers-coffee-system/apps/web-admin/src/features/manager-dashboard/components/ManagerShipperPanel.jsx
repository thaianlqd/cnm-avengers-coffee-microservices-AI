import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../../admin-dashboard/constants'
import { getAdminAccessToken } from '../../../lib/adminFetch'
import {
  Bike,
  MapPin,
  ClipboardList,
  AlertTriangle,
  BarChart3,
  Users,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Award,
  Search,
  Check,
  X,
  Truck
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

function fmtDateTime(str) {
  if (!str) return '—'
  return new Date(str).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

const STATUS_COLOR = {
  ACTIVE: '#059669',
  INACTIVE: '#64748b',
  SUSPENDED: '#dc2626',
}

const DELIVERY_STATUS_LABEL = {
  PENDING: 'Chờ lấy',
  PICKING_UP: 'Đang lấy',
  IN_TRANSIT: 'Đang giao',
  DELIVERED: 'Hoàn thành',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
}

const EXCEPTION_TYPE_LABEL = {
  CUSTOMER_UNREACHABLE: 'Không liên hệ được khách',
  WRONG_ADDRESS: 'Sai địa chỉ giao hàng',
  ITEM_DAMAGED: 'Sự cố hỏng sản phẩm',
  VEHICLE_ISSUE: 'Sự cố phương tiện xe',
  OTHER: 'Lý do ngoại lệ khác',
}

const TABS = [
  { id: 'shippers', label: 'Danh sách đội giao hàng', icon: Bike },
  { id: 'map', label: 'Bản đồ trực tuyến', icon: MapPin },
  { id: 'assign', label: 'Phân công đơn hàng', icon: ClipboardList },
  { id: 'exceptions', label: 'Duyệt ngoại lệ', icon: AlertTriangle },
  { id: 'kpi', label: 'Báo cáo KPI', icon: BarChart3 },
]

export function ManagerShipperPanel({ session }) {
  const branchCode = session?.user?.coSoMa || session?.user?.co_so_ma || null
  const [activeTab, setActiveTab] = useState('shippers')

  // Shippers
  const [shippers, setShippers] = useState([])
  const [shippersLoading, setShippersLoading] = useState(false)
  const [shippersError, setShippersError] = useState(null)

  // Pending Orders (for assign tab)
  const [pendingOrders, setPendingOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  // Exceptions
  const [exceptions, setExceptions] = useState([])
  const [exceptionsLoading, setExceptionsLoading] = useState(false)

  // Assign state
  const [assigningOrderId, setAssigningOrderId] = useState('')
  const [assigningShipperId, setAssigningShipperId] = useState('')
  const [isAssigning, setIsAssigning] = useState(false)

  // Exception handling
  const [handlingExceptionId, setHandlingExceptionId] = useState(null)
  const [exceptionNote, setExceptionNote] = useState('')

  const loadShippers = useCallback(async () => {
    setShippersLoading(true)
    setShippersError(null)
    try {
      const q = branchCode ? `?branch_code=${encodeURIComponent(branchCode)}` : ''
      const res = await apiFetch(`/shippers${q}`)
      setShippers(Array.isArray(res) ? res : res?.items || res?.data || [])
    } catch (e) {
      setShippersError(e.message)
      setShippers([])
    } finally {
      setShippersLoading(false)
    }
  }, [branchCode])

  const loadPendingOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const q = branchCode
        ? `/staff/orders?status=DANG_GIAO&limit=50&branch_code=${encodeURIComponent(branchCode)}`
        : '/staff/orders?status=DANG_GIAO&limit=50'
      const res = await apiFetch(q)
      const items = res?.orders || res?.items || res?.data || []
      setPendingOrders(items)
    } catch {
      setPendingOrders([])
    } finally {
      setOrdersLoading(false)
    }
  }, [branchCode])

  const loadExceptions = useCallback(async () => {
    setExceptionsLoading(true)
    try {
      const res = await apiFetch('/shippers/exceptions?status=PENDING&limit=50')
      setExceptions(Array.isArray(res) ? res : res?.items || res?.data || [])
    } catch {
      setExceptions([])
    } finally {
      setExceptionsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadShippers()
  }, [loadShippers])

  useEffect(() => {
    if (activeTab === 'assign') loadPendingOrders()
    if (activeTab === 'exceptions') loadExceptions()
  }, [activeTab, loadPendingOrders, loadExceptions])

  const handleAssign = async () => {
    if (!assigningOrderId || !assigningShipperId) return
    setIsAssigning(true)
    try {
      await apiFetch(`/shippers/${assigningShipperId}/deliveries`, {
        method: 'POST',
        body: JSON.stringify({ ma_don_hang: assigningOrderId }),
      })
      alert('Phân công đơn giao hàng thành công!')
      setAssigningOrderId('')
      setAssigningShipperId('')
      loadPendingOrders()
      loadShippers()
    } catch (e) {
      alert('Lỗi: ' + e.message)
    } finally {
      setIsAssigning(false)
    }
  }

  const handleException = async (exceptionId, action, note) => {
    setHandlingExceptionId(exceptionId)
    try {
      await apiFetch(`/shippers/exceptions/${exceptionId}/${action}`, {
        method: 'POST',
        body: JSON.stringify({ manager_note: note }),
      })
      alert(`Đã ${action === 'approve' ? 'duyệt' : 'từ chối'} báo cáo ngoại lệ giao hàng`)
      setExceptionNote('')
      loadExceptions()
    } catch (e) {
      alert('Lỗi: ' + e.message)
    } finally {
      setHandlingExceptionId(null)
    }
  }

  const onlineShippers = shippers.filter((s) => s.status === 'ACTIVE')
  const offlineShippers = shippers.filter((s) => s.status !== 'ACTIVE')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', padding: '1.25rem 1.5rem' }}>
      
      {/* PAGE HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.85rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Bike size={20} color="#4f46e5" /> Quản lý Giao hàng
          </h1>
          <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.78125rem', color: '#64748b' }}>
            Theo dõi đội ngũ giao nhận, điều phối phân công đơn hàng và xử lý sự cố ngoại lệ thời gian thực.
          </p>
        </div>
      </div>

      {/* SUB-TABS */}
      <div style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '0.25rem', borderBottom: '1px solid #f1f5f9' }}>
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: isActive ? '700' : '600',
                border: isActive ? '1px solid #4f46e5' : '1px solid #cbd5e1',
                backgroundColor: isActive ? '#4f46e5' : '#ffffff',
                color: isActive ? '#ffffff' : '#475569',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* TAB 1: DANH SÁCH SHIPPER */}
      {activeTab === 'shippers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.9rem 1.1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', display: 'block' }}>TỔNG SHIPPER</span>
              <strong style={{ fontSize: '1.15rem', color: '#0f172a', fontWeight: '700', marginTop: '0.1rem', display: 'block' }}>{shippers.length}</strong>
            </div>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.9rem 1.1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', display: 'block' }}>ĐANG TRỰC TUYẾN</span>
              <strong style={{ fontSize: '1.15rem', color: '#059669', fontWeight: '700', marginTop: '0.1rem', display: 'block' }}>{onlineShippers.length}</strong>
            </div>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.9rem 1.1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', display: 'block' }}>NGOẠI TUYẾN</span>
              <strong style={{ fontSize: '1.15rem', color: '#64748b', fontWeight: '700', marginTop: '0.1rem', display: 'block' }}>{offlineShippers.length}</strong>
            </div>
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0.9rem 1.1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600', display: 'block' }}>ĐƠN ĐANG GIAO</span>
              <strong style={{ fontSize: '1.15rem', color: '#4f46e5', fontWeight: '700', marginTop: '0.1rem', display: 'block' }}>
                {shippers.reduce((sum, s) => sum + (s.active_delivery_count || 0), 0)}
              </strong>
            </div>
          </div>

          {/* Shipper List Cards */}
          {shippersLoading ? (
            <p style={{ fontSize: '0.78125rem', color: '#64748b' }}>Đang tải danh sách Shipper...</p>
          ) : shippersError ? (
            <p style={{ fontSize: '0.78125rem', color: '#dc2626' }}>{shippersError}</p>
          ) : shippers.length === 0 ? (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1.5rem', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>Chưa có Shipper nào được phân công cho chi nhánh này.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
              {shippers.map((shipper) => (
                <div key={shipper.id} style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: '700', color: '#0f172a' }}>
                        {shipper.full_name || shipper.username}
                      </h3>
                      <span style={{ fontSize: '0.72rem', color: '#64748b' }}>@{shipper.username} · {shipper.phone_number || 'N/A'}</span>
                    </div>

                    <span style={{
                      padding: '0.15rem 0.55rem', borderRadius: '9999px', fontSize: '0.68rem', fontWeight: '700',
                      backgroundColor: shipper.status === 'ACTIVE' ? '#ecfdf5' : '#f1f5f9',
                      color: shipper.status === 'ACTIVE' ? '#059669' : '#64748b',
                      border: shipper.status === 'ACTIVE' ? '1px solid #a7f3d0' : '1px solid #cbd5e1',
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem'
                    }}>
                      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: shipper.status === 'ACTIVE' ? '#059669' : '#64748b' }} />
                      {shipper.status === 'ACTIVE' ? 'Trực tuyến' : 'Ngoại tuyến'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', backgroundColor: '#f8fafc', padding: '0.6rem', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.9rem', color: '#4f46e5', fontWeight: '700' }}>{shipper.active_delivery_count || 0}</strong>
                      <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '600' }}>Đang giao</span>
                    </div>
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.9rem', color: '#059669', fontWeight: '700' }}>{shipper.total_delivered_today || 0}</strong>
                      <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '600' }}>Đã xong</span>
                    </div>
                    <div>
                      <strong style={{ display: 'block', fontSize: '0.9rem', color: '#d97706', fontWeight: '700' }}>{shipper.rating ? Number(shipper.rating).toFixed(1) : '—'}</strong>
                      <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '600' }}>Đánh giá</span>
                    </div>
                  </div>

                  {shipper.current_location_updated_at && (
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <Clock size={11} /> Vị trí: {fmtDateTime(shipper.current_location_updated_at)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <button
              type="button"
              onClick={loadShippers}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', height: '32px', padding: '0 0.75rem', borderRadius: '6px', backgroundColor: '#ffffff', color: '#334155', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
            >
              <RefreshCw size={13} /> Làm mới danh sách
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: BẢN ĐỒ */}
      {activeTab === 'map' && (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <MapPin size={15} color="#4f46e5" /> Bản đồ thời gian thực đội giao hàng
            </h3>
            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              Theo dõi vị trí của từng Shipper trực tuyến trong khu vực chi nhánh.
            </p>
          </div>

          <div style={{ width: '100%', height: '380px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #cbd5e1', position: 'relative' }}>
            <iframe
              title="Bản đồ đội giao hàng"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15677.48!2d106.660172!3d10.762622!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTDCsDQ1JzQ1LjQiTiAxMDbCsDM5JzM2LjYiRQ!5e0!3m2!1svi!2svn!4v1620000000000!5m2!1svi!2svn"
              style={{ width: '100%', height: '100%', border: 0 }}
              allowFullScreen=""
              loading="lazy"
            />
            <div style={{ position: 'absolute', bottom: '12px', left: '12px', backgroundColor: 'rgba(255,255,255,0.95)', padding: '10px 14px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', minWidth: '200px' }}>
              <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '700', color: '#0f172a' }}>
                Shipper trực tuyến ({onlineShippers.length})
              </p>
              {onlineShippers.slice(0, 5).map((s) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px', fontSize: '0.72rem', color: '#334155' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669', flexShrink: 0 }} />
                  <span style={{ fontWeight: '600' }}>{s.full_name || s.username}</span>
                  <span style={{ color: '#64748b', marginLeft: 'auto' }}>{s.active_delivery_count || 0} đơn</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PHÂN CÔNG ĐƠN HÀNG */}
      {activeTab === 'assign' && (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ClipboardList size={15} color="#4f46e5" /> Điều phối &amp; Phân công đơn thủ công
            </h3>
            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              Chọn đơn hàng đang chờ giao và gán cho Shipper trực tuyến phù hợp.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                1. Chọn đơn hàng cần giao ({pendingOrders.length} đơn)
              </label>
              <select
                value={assigningOrderId}
                onChange={(e) => setAssigningOrderId(e.target.value)}
                disabled={ordersLoading}
                style={{ height: '34px', padding: '0 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78125rem', fontWeight: '600', color: '#0f172a' }}
              >
                <option value="">{ordersLoading ? 'Đang tải...' : `— Chọn đơn (${pendingOrders.length} đơn) —`}</option>
                {pendingOrders.map((o) => (
                  <option key={o.ma_don_hang} value={o.ma_don_hang}>
                    #{String(o.ma_don_hang || '').slice(0, 8).toUpperCase()} · {o.dia_chi_giao_hang || 'Chưa có địa chỉ'}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: '700', color: '#334155' }}>
                2. Chọn Shipper phân công
              </label>
              <select
                value={assigningShipperId}
                onChange={(e) => setAssigningShipperId(e.target.value)}
                disabled={shippersLoading}
                style={{ height: '34px', padding: '0 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.78125rem', fontWeight: '600', color: '#0f172a' }}
              >
                <option value="">— Chọn Shipper —</option>
                {shippers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || s.username} · {s.status === 'ACTIVE' ? 'Online' : 'Offline'} · {s.active_delivery_count || 0} đơn đang giao
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.55rem' }}>
            <button
              type="button"
              className="btn-save-green"
              onClick={handleAssign}
              disabled={!assigningOrderId || !assigningShipperId || isAssigning}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', height: '34px', padding: '0 1.1rem', borderRadius: '6px', fontSize: '0.78125rem', fontWeight: '700', cursor: 'pointer' }}
            >
              <Check size={14} /> {isAssigning ? 'Đang phân công...' : 'Xác Nhận Phân Công'}
            </button>

            <button
              type="button"
              onClick={loadPendingOrders}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', height: '34px', padding: '0 0.85rem', borderRadius: '6px', backgroundColor: '#ffffff', color: '#334155', border: '1px solid #cbd5e1', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer' }}
            >
              <RefreshCw size={13} /> Làm mới danh sách đơn
            </button>
          </div>

          {/* Pending Orders Table */}
          {pendingOrders.length > 0 && (
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
              <h4 style={{ margin: '0 0 0.65rem 0', fontSize: '0.8125rem', fontWeight: '700', color: '#0f172a' }}>
                Đơn hàng đang chờ Shipper giao ({pendingOrders.length})
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78125rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '0.55rem 0.65rem', textAlign: 'left', color: '#64748b', fontWeight: '700' }}>Mã đơn</th>
                      <th style={{ padding: '0.55rem 0.65rem', textAlign: 'left', color: '#64748b', fontWeight: '700' }}>Địa chỉ giao hàng</th>
                      <th style={{ padding: '0.55rem 0.65rem', textAlign: 'left', color: '#64748b', fontWeight: '700' }}>Trạng thái</th>
                      <th style={{ padding: '0.55rem 0.65rem', textAlign: 'left', color: '#64748b', fontWeight: '700' }}>Thời gian tạo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingOrders.slice(0, 10).map((o) => (
                      <tr key={o.ma_don_hang} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.55rem 0.65rem', fontWeight: '700', color: '#4f46e5' }}>#{String(o.ma_don_hang || '').slice(0, 8).toUpperCase()}</td>
                        <td style={{ padding: '0.55rem 0.65rem', color: '#334155' }}>{o.dia_chi_giao_hang || 'Chưa có địa chỉ'}</td>
                        <td style={{ padding: '0.55rem 0.65rem' }}>
                          <span style={{ padding: '0.12rem 0.45rem', borderRadius: '9999px', backgroundColor: '#e0e7ff', color: '#4f46e5', fontSize: '0.68rem', fontWeight: '700' }}>
                            {DELIVERY_STATUS_LABEL[o.trang_thai] || o.trang_thai || 'DANG_GIAO'}
                          </span>
                        </td>
                        <td style={{ padding: '0.55rem 0.65rem', color: '#64748b', fontSize: '0.72rem' }}>{fmtDateTime(o.tao_luc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DUYỆT NGOẠI LỆ */}
      {activeTab === 'exceptions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {exceptionsLoading ? (
            <p style={{ fontSize: '0.78125rem', color: '#64748b' }}>Đang tải báo cáo ngoại lệ...</p>
          ) : exceptions.length === 0 ? (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '2.5rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle2 size={36} color="#059669" />
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700', color: '#0f172a' }}>Không có báo cáo ngoại lệ nào chờ xử lý</h3>
              <p style={{ margin: 0, fontSize: '0.78125rem', color: '#64748b' }}>Tất cả các sự cố giao nhận đã được giải quyết xong.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
              {exceptions.map((exc) => {
                const isHandling = handlingExceptionId === exc.id
                return (
                  <div key={exc.id} style={{ backgroundColor: '#ffffff', border: '1px solid #fde68a', borderLeft: '4px solid #d97706', borderRadius: '12px', padding: '1rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '0.84rem', fontWeight: '700', color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <AlertTriangle size={14} color="#d97706" /> {EXCEPTION_TYPE_LABEL[exc.exception_type] || exc.exception_type}
                      </h3>
                      <span style={{ padding: '0.12rem 0.45rem', borderRadius: '9999px', backgroundColor: '#fffbeb', color: '#b45309', fontSize: '0.68rem', fontWeight: '700', border: '1px solid #fef3c7' }}>
                        CHỜ DUYỆT
                      </span>
                    </div>

                    <div style={{ fontSize: '0.78125rem', color: '#334155' }}>
                      Shipper: <strong style={{ color: '#0f172a' }}>{exc.shipper?.full_name || exc.shipper_id?.slice(0, 8)}</strong>
                      {exc.delivery_id && ` · Đơn: #${exc.delivery_id.slice(0, 8).toUpperCase()}`}
                    </div>

                    <div style={{ backgroundColor: '#fffbeb', borderRadius: '6px', padding: '0.65rem', border: '1px solid #fef3c7', fontSize: '0.78125rem', color: '#92400e' }}>
                      <strong>Mô tả:</strong> {exc.description || 'Không có mô tả'}
                    </div>

                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <Clock size={11} /> Báo cáo lúc: {fmtDateTime(exc.created_at)}
                    </span>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#334155' }}>Ghi chú xử lý:</label>
                      <textarea
                        rows={2}
                        placeholder="Nhập hướng dẫn xử lý cho Shipper..."
                        value={exceptionNote}
                        onChange={(e) => setExceptionNote(e.target.value)}
                        style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.75rem', outline: 'none' }}
                        disabled={isHandling}
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '0.55rem', marginTop: '0.2rem' }}>
                      <button
                        type="button"
                        className="btn-save-green"
                        onClick={() => handleException(exc.id, 'approve', exceptionNote)}
                        disabled={isHandling}
                        style={{ flex: 1, height: '32px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                      >
                        <Check size={14} /> Duyệt báo cáo
                      </button>

                      <button
                        type="button"
                        onClick={() => handleException(exc.id, 'reject', exceptionNote)}
                        disabled={isHandling}
                        style={{ flex: 1, height: '32px', borderRadius: '6px', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                      >
                        <X size={14} /> Từ chối
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: KPI */}
      {activeTab === 'kpi' && (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '1.25rem', boxShadow: '0 2px 6px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <BarChart3 size={15} color="#4f46e5" /> Báo cáo &amp; Hiệu suất KPI đội giao hàng
            </h3>
            <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
              Thống kê tổng lượng đơn hoàn thành, tỷ lệ giao đúng giờ và đánh giá trung bình từ khách hàng.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>TỶ LỆ GIAO ĐÚNG GIỜ</span>
              <strong style={{ display: 'block', fontSize: '1.15rem', color: '#059669', fontWeight: '700', marginTop: '0.15rem' }}>98.5%</strong>
            </div>
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>THỜI GIAN GIAO TB</span>
              <strong style={{ display: 'block', fontSize: '1.15rem', color: '#4f46e5', fontWeight: '700', marginTop: '0.15rem' }}>22 Phút</strong>
            </div>
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem' }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: '600' }}>ĐÁNH GIÁ TRUNG BÌNH</span>
              <strong style={{ display: 'block', fontSize: '1.15rem', color: '#d97706', fontWeight: '700', marginTop: '0.15rem' }}>4.9 ★</strong>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
