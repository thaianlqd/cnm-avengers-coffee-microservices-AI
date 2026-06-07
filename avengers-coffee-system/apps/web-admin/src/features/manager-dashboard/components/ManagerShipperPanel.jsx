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
  return new Date(str).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDateTime(str) {
  if (!str) return '—'
  return new Date(str).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit',
  })
}

const STATUS_COLOR = {
  ACTIVE: '#10B981', INACTIVE: '#6B7280', SUSPENDED: '#EF4444',
}
const DELIVERY_STATUS_LABEL = {
  PENDING: 'Chờ lấy', PICKING_UP: 'Đang lấy', IN_TRANSIT: 'Đang giao',
  DELIVERED: 'Hoàn thành', FAILED: 'Thất bại', CANCELLED: 'Đã hủy',
}
const EXCEPTION_TYPE_LABEL = {
  CUSTOMER_UNREACHABLE: 'Không liên hệ được', WRONG_ADDRESS: 'Sai địa chỉ',
  ITEM_DAMAGED: 'Hàng hỏng', VEHICLE_ISSUE: 'Sự cố xe', OTHER: 'Khác',
}

const TABS = ['shippers', 'map', 'assign', 'exceptions', 'kpi']
const TAB_LABELS = {
  shippers: '🚴 Danh sách Shipper',
  map: '🗺️ Bản đồ đội',
  assign: '📋 Phân công đơn',
  exceptions: '⚠️ Duyệt ngoại lệ',
  kpi: '📊 KPI Shipper',
}

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
      alert('✅ Phân công đơn thành công!')
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
      alert(`✅ Đã ${action === 'approve' ? 'duyệt' : 'từ chối'} báo cáo ngoại lệ`)
      setExceptionNote('')
      loadExceptions()
    } catch (e) {
      alert('Lỗi: ' + e.message)
    } finally {
      setHandlingExceptionId(null)
    }
  }

  const onlineShippers = shippers.filter(s => s.status === 'ACTIVE')
  const offlineShippers = shippers.filter(s => s.status !== 'ACTIVE')

  return (
    <section className="panel workforce-panel workforce-panel--manager">
      <div className="panel-head">
        <h2>🚴 Quản lý đội Shipper</h2>
        <span>Theo dõi, phân công và kiểm soát đội giao hàng theo thời gian thực</span>
      </div>

      {/* Tab Bar */}
      <div className="workforce-tabs" style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            className={`workforce-tab${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* TAB: DANH SÁCH SHIPPER */}
      {activeTab === 'shippers' && (
        <div>
          {/* Summary */}
          <div className="workforce-summary-grid" style={{ marginBottom: '1.5rem' }}>
            <article>
              <strong>{shippers.length}</strong>
              <span>Tổng Shipper</span>
            </article>
            <article style={{ '--accent': '#10B981' }}>
              <strong style={{ color: '#10B981' }}>{onlineShippers.length}</strong>
              <span>Đang trực tuyến</span>
            </article>
            <article>
              <strong style={{ color: '#6B7280' }}>{offlineShippers.length}</strong>
              <span>Ngoại tuyến</span>
            </article>
            <article>
              <strong style={{ color: '#6366F1' }}>
                {shippers.reduce((sum, s) => sum + (s.active_delivery_count || 0), 0)}
              </strong>
              <span>Đơn đang giao</span>
            </article>
          </div>

          {/* Shipper Table */}
          {shippersLoading ? (
            <p>Đang tải danh sách Shipper...</p>
          ) : shippersError ? (
            <p className="error-text">{shippersError}</p>
          ) : shippers.length === 0 ? (
            <p className="employee-empty">Chưa có Shipper nào được phân công cho chi nhánh này.</p>
          ) : (
            <div className="employee-list">
              {shippers.map(shipper => (
                <article key={shipper.id} className="employee-card">
                  <div className="employee-card-head">
                    <div>
                      <h3>{shipper.full_name || shipper.username}</h3>
                      <p>@{shipper.username} · {shipper.phone_number || 'Chưa có SĐT'}</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        padding: '4px 10px', borderRadius: '999px',
                        backgroundColor: STATUS_COLOR[shipper.status] + '20',
                        color: STATUS_COLOR[shipper.status],
                        fontSize: '12px', fontWeight: '700',
                      }}>
                        <span style={{
                          width: '7px', height: '7px', borderRadius: '50%',
                          backgroundColor: STATUS_COLOR[shipper.status],
                          animation: shipper.status === 'ACTIVE' ? 'pulse 2s infinite' : 'none',
                        }} />
                        {shipper.status === 'ACTIVE' ? 'Online' : 'Offline'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', padding: '0.75rem 0', borderTop: '1px solid #f0f0f0', marginTop: '0.5rem' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: '800', color: '#6366F1' }}>
                        {shipper.active_delivery_count || 0}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Đang giao</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: '800', color: '#10B981' }}>
                        {shipper.total_delivered_today || 0}
                      </div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Hoàn thành hôm nay</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '18px', fontWeight: '800', color: '#F59E0B' }}>
                        {shipper.rating ? Number(shipper.rating).toFixed(1) : '—'}⭐
                      </div>
                      <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Đánh giá</div>
                    </div>
                  </div>
                  {shipper.current_location_updated_at && (
                    <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '0.5rem' }}>
                      📍 Cập nhật vị trí: {fmtDateTime(shipper.current_location_updated_at)}
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
          <button type="button" className="secondary" onClick={loadShippers} style={{ marginTop: '1rem' }}>
            🔄 Làm mới danh sách
          </button>
        </div>
      )}

      {/* TAB: BẢN ĐỒ */}
      {activeTab === 'map' && (
        <div className="workforce-assignment-card">
          <div className="workforce-detail-head">
            <div>
              <h3>Bản đồ đội giao hàng</h3>
              <p>Xem vị trí thời gian thực của từng Shipper trong chi nhánh. Vị trí được cập nhật mỗi 10 giây từ app Shipper.</p>
            </div>
          </div>
          <div style={{
            width: '100%', height: '420px', borderRadius: '12px', overflow: 'hidden',
            border: '1px solid #E5E7EB', position: 'relative',
          }}>
            <iframe
              title="Bản đồ đội giao hàng"
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15677.48!2d106.660172!3d10.762622!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTDCsDQ1JzQ1LjQiTiAxMDbCsDM5JzM2LjYiRQ!5e0!3m2!1svi!2svn!4v1620000000000!5m2!1svi!2svn"
              style={{ width: '100%', height: '100%', border: 0 }}
              allowFullScreen=""
              loading="lazy"
            />
            <div style={{
              position: 'absolute', bottom: '16px', left: '16px',
              backgroundColor: 'rgba(255,255,255,0.95)', padding: '12px 16px',
              borderRadius: '8px', boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            }}>
              <p style={{ margin: 0, fontSize: '12px', fontWeight: '700', color: '#374151' }}>
                📍 Vị trí Shipper đang online ({onlineShippers.length})
              </p>
              {onlineShippers.slice(0, 5).map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', flexShrink: 0 }} />
                  <span style={{ fontSize: '12px', color: '#374151' }}>{s.full_name || s.username}</span>
                  <span style={{ fontSize: '11px', color: '#9CA3AF', marginLeft: 'auto' }}>
                    {s.active_delivery_count || 0} đơn
                  </span>
                </div>
              ))}
              {onlineShippers.length > 5 && (
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#9CA3AF' }}>
                  +{onlineShippers.length - 5} Shipper khác...
                </p>
              )}
            </div>
          </div>
          <p style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '0.75rem' }}>
            💡 Để xem vị trí thời gian thực chính xác, cần tích hợp Google Maps API với WebSocket. Hiện tại đang hiển thị bản đồ khu vực chi nhánh.
          </p>
        </div>
      )}

      {/* TAB: PHÂN CÔNG ĐƠN */}
      {activeTab === 'assign' && (
        <div>
          <div className="workforce-assignment-card">
            <div className="workforce-detail-head">
              <div>
                <h3>Phân công đơn hàng thủ công</h3>
                <p>Chọn đơn đang chờ xử lý và phân công cho Shipper phù hợp theo khu vực và khả năng.</p>
              </div>
            </div>

            <div className="workforce-form-topbar" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label>
                Chọn đơn hàng cần giao
                <select
                  value={assigningOrderId}
                  onChange={e => setAssigningOrderId(e.target.value)}
                  disabled={ordersLoading}
                >
                  <option value="">{ordersLoading ? 'Đang tải...' : `— Chọn đơn (${pendingOrders.length} đơn) —`}</option>
                  {pendingOrders.map(o => (
                    <option key={o.ma_don_hang} value={o.ma_don_hang}>
                      #{String(o.ma_don_hang || '').slice(0, 8).toUpperCase()} · {o.dia_chi_giao_hang || 'Chưa có địa chỉ'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Chọn Shipper
                <select
                  value={assigningShipperId}
                  onChange={e => setAssigningShipperId(e.target.value)}
                  disabled={shippersLoading}
                >
                  <option value="">— Chọn Shipper —</option>
                  {shippers.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.username} · {s.status === 'ACTIVE' ? '🟢 Online' : '⚫ Offline'} · {s.active_delivery_count || 0} đơn đang giao
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div style={{ marginTop: '1rem' }}>
              <button
                type="button"
                onClick={handleAssign}
                disabled={!assigningOrderId || !assigningShipperId || isAssigning}
              >
                {isAssigning ? 'Đang phân công...' : '✅ Phân công ngay'}
              </button>
              <button type="button" className="secondary" onClick={loadPendingOrders} style={{ marginLeft: '0.75rem' }}>
                🔄 Làm mới đơn
              </button>
            </div>

            {/* Pending Orders Table */}
            {pendingOrders.length > 0 && (
              <div style={{ marginTop: '1.5rem' }}>
                <h4 style={{ marginBottom: '0.75rem', color: '#374151' }}>
                  📦 Đơn đang chờ Shipper ({pendingOrders.length})
                </h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F9FAFB' }}>
                        {['Mã đơn', 'Địa chỉ giao', 'Trạng thái', 'Thời gian tạo'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#6B7280', fontWeight: '600', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pendingOrders.slice(0, 10).map(o => (
                        <tr key={o.ma_don_hang} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: '#6366F1' }}>#{String(o.ma_don_hang || '').slice(0, 8).toUpperCase()}</td>
                          <td style={{ padding: '10px 12px', color: '#374151', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {o.dia_chi_giao_hang || 'Chưa có địa chỉ'}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ backgroundColor: '#EEF2FF', color: '#6366F1', padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700' }}>
                              {DELIVERY_STATUS_LABEL[o.trang_thai] || o.trang_thai || 'DANG_GIAO'}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#9CA3AF', fontSize: '12px' }}>{fmtDateTime(o.tao_luc)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: DUYỆT NGOẠI LỆ */}
      {activeTab === 'exceptions' && (
        <div>
          {exceptionsLoading ? (
            <p>Đang tải báo cáo ngoại lệ...</p>
          ) : exceptions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#9CA3AF' }}>
              <div style={{ fontSize: '48px', marginBottom: '1rem' }}>✅</div>
              <h3 style={{ color: '#6B7280' }}>Không có báo cáo nào chờ xử lý</h3>
              <p>Tất cả báo cáo ngoại lệ đã được xử lý.</p>
            </div>
          ) : (
            <div className="employee-list">
              {exceptions.map(exc => {
                const isHandling = handlingExceptionId === exc.id
                return (
                  <article key={exc.id} className="employee-card" style={{ borderLeft: '4px solid #F59E0B' }}>
                    <div className="employee-card-head">
                      <div>
                        <h3 style={{ color: '#92400E' }}>
                          ⚠️ {EXCEPTION_TYPE_LABEL[exc.exception_type] || exc.exception_type}
                        </h3>
                        <p>
                          Shipper: <strong>{exc.shipper?.full_name || exc.shipper_id?.slice(0, 8)}</strong>
                          {exc.delivery_id && ` · Đơn: #${exc.delivery_id.slice(0, 8).toUpperCase()}`}
                        </p>
                      </div>
                      <span style={{
                        backgroundColor: '#FEF3C7', color: '#92400E',
                        padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                      }}>PENDING</span>
                    </div>

                    <div style={{
                      backgroundColor: '#FFFBEB', borderRadius: '8px', padding: '12px',
                      margin: '0.75rem 0', fontSize: '13px', color: '#92400E',
                    }}>
                      <strong>Mô tả:</strong> {exc.description || 'Không có mô tả'}
                    </div>

                    <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '0.75rem' }}>
                      🕐 Báo cáo lúc: {fmtDateTime(exc.created_at)}
                    </p>

                    <label style={{ display: 'block', marginBottom: '0.75rem' }}>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' }}>
                        Ghi chú xử lý:
                      </span>
                      <textarea
                        rows={2}
                        placeholder="Nhập ghi chú xử lý cho Shipper..."
                        value={exceptionNote}
                        onChange={e => setExceptionNote(e.target.value)}
                        style={{ width: '100%', borderRadius: '8px', border: '1px solid #E5E7EB', padding: '8px', fontSize: '13px', resize: 'vertical' }}
                        disabled={isHandling}
                      />
                    </label>

                    <div className="workforce-detail-actions">
                      <button
                        type="button"
                        onClick={() => handleException(exc.id, 'approve', exceptionNote)}
                        disabled={isHandling}
                        style={{ backgroundColor: '#10B981' }}
                      >
                        {isHandling ? 'Đang xử lý...' : '✅ Duyệt & Hoàn hàng'}
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => handleException(exc.id, 'reject', exceptionNote)}
                        disabled={isHandling}
                      >
                        ❌ Từ chối
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
          <button type="button" className="secondary" onClick={loadExceptions} style={{ marginTop: '1rem' }}>
            🔄 Làm mới
          </button>
        </div>
      )}

      {/* TAB: KPI SHIPPER */}
      {activeTab === 'kpi' && (
        <div>
          <div className="workforce-assignment-card" style={{ marginBottom: '1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>📊 Hiệu suất từng Shipper trong ca</h3>
            <p style={{ color: '#6B7280', fontSize: '13px', marginBottom: '1.5rem' }}>
              Thống kê số đơn, tỉ lệ hoàn thành, đánh giá trung bình và thu nhập ước tính hôm nay.
            </p>
            {shippersLoading ? (
              <p>Đang tải dữ liệu KPI...</p>
            ) : shippers.length === 0 ? (
              <p className="employee-empty">Chưa có dữ liệu Shipper</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#F9FAFB' }}>
                      {['Shipper', 'Trạng thái', 'Đơn đang giao', 'Hoàn thành hôm nay', 'Tỉ lệ thành công', 'Đánh giá', 'Thu nhập ước tính'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#6B7280', fontWeight: '600', borderBottom: '2px solid #E5E7EB', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shippers.map((shipper, idx) => {
                      const total = (shipper.total_delivered_today || 0) + (shipper.total_failed_today || 0)
                      const successRate = total > 0 ? Math.round((shipper.total_delivered_today || 0) / total * 100) : 100
                      const estimatedIncome = (shipper.total_delivered_today || 0) * 15000

                      return (
                        <tr key={shipper.id} style={{ backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB', borderBottom: '1px solid #F3F4F6' }}>
                          <td style={{ padding: '12px', fontWeight: '700', color: '#374151' }}>
                            {shipper.full_name || shipper.username}
                            <br /><span style={{ fontSize: '11px', color: '#9CA3AF', fontWeight: '400' }}>@{shipper.username}</span>
                          </td>
                          <td style={{ padding: '12px' }}>
                            <span style={{
                              backgroundColor: STATUS_COLOR[shipper.status] + '20',
                              color: STATUS_COLOR[shipper.status],
                              padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: '700',
                            }}>
                              {shipper.status === 'ACTIVE' ? 'Online' : 'Offline'}
                            </span>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: '800', color: '#6366F1', fontSize: '16px' }}>
                            {shipper.active_delivery_count || 0}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: '800', color: '#10B981', fontSize: '16px' }}>
                            {shipper.total_delivered_today || 0}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            <div style={{
                              display: 'inline-block', padding: '2px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '700',
                              backgroundColor: successRate >= 90 ? '#ECFDF5' : successRate >= 70 ? '#FEF3C7' : '#FEF2F2',
                              color: successRate >= 90 ? '#065F46' : successRate >= 70 ? '#92400E' : '#991B1B',
                            }}>
                              {successRate}%
                            </div>
                          </td>
                          <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#F59E0B' }}>
                            {shipper.rating ? `${Number(shipper.rating).toFixed(1)}⭐` : '—'}
                          </td>
                          <td style={{ padding: '12px', fontWeight: '700', color: '#10B981' }}>
                            ~{fmtCurrency(estimatedIncome)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#F9FAFB', fontWeight: '700' }}>
                      <td style={{ padding: '12px', color: '#374151' }} colSpan={2}>Tổng cộng ({shippers.length} Shipper)</td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#6366F1' }}>
                        {shippers.reduce((s, sh) => s + (sh.active_delivery_count || 0), 0)}
                      </td>
                      <td style={{ padding: '12px', textAlign: 'center', color: '#10B981' }}>
                        {shippers.reduce((s, sh) => s + (sh.total_delivered_today || 0), 0)}
                      </td>
                      <td colSpan={2} />
                      <td style={{ padding: '12px', color: '#10B981' }}>
                        ~{fmtCurrency(shippers.reduce((s, sh) => s + (sh.total_delivered_today || 0) * 15000, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
          <button type="button" className="secondary" onClick={loadShippers}>
            🔄 Làm mới dữ liệu KPI
          </button>
        </div>
      )}
    </section>
  )
}
