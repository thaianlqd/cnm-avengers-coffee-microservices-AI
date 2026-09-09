import { useState, useEffect, useCallback } from 'react'
import { Package, PackageCheck, RefreshCw, Clock } from 'lucide-react'
import { API_BASE_URL } from '../../admin-dashboard/constants'

function apiFetch(token, path, options = {}) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  }).then(r => { if (!r.ok) return r.json().then(e => Promise.reject(e)); return r.json() })
}

export function KioskComboReceiver({ session }) {
  const token = session?.token || session?.accessToken || ''
  const branchCode = session?.user?.coSoMa || session?.user?.co_so_ma || ''
  const username = session?.user?.tenDangNhap || session?.user?.username || 'Kiosk Staff'

  const [combos, setCombos] = useState([])
  const [loading, setLoading] = useState(true)
  const [receivingId, setReceivingId] = useState(null)
  const [tab, setTab] = useState('pending')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch(token, `/inventory/kiosk-combos?ma_kiosk=${branchCode}`)
      setCombos(Array.isArray(data) ? data : [])
    } catch { setCombos([]) }
    finally { setLoading(false) }
  }, [token, branchCode])

  useEffect(() => { load() }, [load])

  const handleReceive = async (id) => {
    setReceivingId(id)
    try {
      await apiFetch(token, `/inventory/kiosk-combos/${id}/receive`, {
        method: 'PATCH',
        body: JSON.stringify({ nguoi_nhan: username }),
      })
      await load()
    } catch (e) { alert(e?.message || 'Xác nhận thất bại') }
    finally { setReceivingId(null) }
  }

  const pending = combos.filter(c => c.trang_thai === 'PENDING')
  const received = combos.filter(c => c.trang_thai === 'RECEIVED')
  const displayed = tab === 'pending' ? pending : received

  return (
    <div style={{ padding: '1.5rem', background: '#f8fafc', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #ea580c, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)' }}>
            <Package size={22} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Nhận Combo Nguyên Liệu</h2>
            <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Kiosk: <strong>{branchCode}</strong> — Xác nhận nhận hàng từ chi nhánh mẹ</p>
          </div>
        </div>
        <button onClick={load} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <RefreshCw size={14} /> Làm mới
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: '1.5rem' }}>
        <div style={{ background: 'white', borderRadius: 12, padding: '1rem 1.25rem', border: '1px solid #fed7aa', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, color: '#ea580c', fontWeight: 700, marginBottom: 4 }}>⏳ Chờ xác nhận</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#ea580c' }}>{pending.length}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>phiếu cần xác nhận</div>
        </div>
        <div style={{ background: 'white', borderRadius: 12, padding: '1rem 1.25rem', border: '1px solid #bbf7d0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, marginBottom: 4 }}>✅ Đã nhận</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#16a34a' }}>{received.length}</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>phiếu đã xác nhận</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', marginBottom: '1rem', borderBottom: '2px solid #f1f5f9' }}>
        {[{ id: 'pending', label: `Chờ nhận (${pending.length})` }, { id: 'received', label: `Đã nhận (${received.length})` }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '9px 18px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: tab === t.id ? '#ea580c' : '#64748b', borderBottom: tab === t.id ? '2px solid #ea580c' : '2px solid transparent', marginBottom: -2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>Đang tải...</div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
          {tab === 'pending' ? <Package size={48} style={{ opacity: 0.3, marginBottom: 12 }} /> : <PackageCheck size={48} style={{ opacity: 0.3, marginBottom: 12 }} />}
          <p style={{ margin: 0, fontSize: 14 }}>{tab === 'pending' ? 'Không có phiếu nào đang chờ' : 'Chưa có phiếu nào đã xác nhận'}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {displayed.map(c => (
            <div key={c.id} style={{ background: 'white', borderRadius: 12, padding: '1rem 1.25rem', border: `1.5px solid ${c.trang_thai === 'RECEIVED' ? '#bbf7d0' : '#fed7aa'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: c.trang_thai === 'RECEIVED' ? '#dcfce7' : '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {c.trang_thai === 'RECEIVED' ? <PackageCheck size={22} color="#16a34a" /> : <Package size={22} color="#ea580c" />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{c.ten_combo}</div>
                {c.mo_ta && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{c.mo_ta}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#94a3b8' }}>
                  <Clock size={11} />
                  <span>{new Date(c.thoi_gian_giao).toLocaleString('vi-VN')}</span>
                  {c.trang_thai === 'RECEIVED' && c.nguoi_nhan && (
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>• Đã nhận bởi: {c.nguoi_nhan}</span>
                  )}
                  {c.trang_thai === 'RECEIVED' && c.thoi_gian_nhan && (
                    <span>• {new Date(c.thoi_gian_nhan).toLocaleString('vi-VN')}</span>
                  )}
                </div>
              </div>
              {c.trang_thai === 'PENDING' && (
                <button
                  onClick={() => handleReceive(c.id)}
                  disabled={receivingId === c.id}
                  style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #059669, #10b981)', color: 'white', cursor: receivingId === c.id ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: receivingId === c.id ? 0.7 : 1, whiteSpace: 'nowrap', boxShadow: '0 4px 10px rgba(16,185,129,0.25)' }}
                >
                  {receivingId === c.id ? 'Đang xử lý...' : '✅ Xác nhận nhận'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
