import { useState, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../admin-dashboard/constants'

// ─── Helpers ───────────────────────────────────────────────────────────────
const fmtMoney = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ'
const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    const hh = String(dt.getHours()).padStart(2, '0');
    const min = String(dt.getMinutes()).padStart(2, '0');
    return `${hh}:${min} ${dd}/${mm}/${yyyy}`;
  } catch (e) {
    return '—';
  }
};

const STATUS_KIOSK = {
  CHO_KY_HOP_DONG: { label: 'Chờ ký HĐ', color: '#f97316', bg: '#fff7ed' },
  DANG_THIET_LAP: { label: 'Đang thiết lập', color: '#0ea5e9', bg: '#f0f9ff' },
  DANG_HOAT_DONG: { label: 'Đang hoạt động', color: '#16a34a', bg: '#f0fdf4' },
  NGUNG_HOAT_DONG: { label: 'Ngừng hoạt động', color: '#dc2626', bg: '#fef2f2' },
}
const STATUS_DON = {
  DA_DAT: { label: 'Đã đặt', color: '#f59e0b' },
  DA_GIAO: { label: 'Đã giao', color: '#16a34a' },
  TAM_HOAN: { label: 'Tạm hoãn', color: '#dc2626' },
}
const STATUS_CONG_NO = {
  CON_NO: { label: 'Còn nợ', color: '#f59e0b' },
  DA_THANH_TOAN: { label: 'Đã thanh toán', color: '#16a34a' },
  QUA_HAN: { label: 'Quá hạn', color: '#dc2626' },
}
const STATUS_ROYALTY = {
  CHO_XAC_NHAN: { label: 'Chờ xác nhận', color: '#f59e0b' },
  DA_XAC_NHAN: { label: 'Đã xác nhận', color: '#0ea5e9' },
  DA_THANH_TOAN: { label: 'Đã thanh toán', color: '#16a34a' },
}
const CANH_BAO = {
  XANH: { label: 'An toàn', emoji: '🟢', color: '#16a34a', bg: '#f0fdf4' },
  VANG: { label: 'Cần chú ý', emoji: '🟡', color: '#d97706', bg: '#fffbeb' },
  DO: { label: 'Rủi ro cao', emoji: '🔴', color: '#dc2626', bg: '#fef2f2' },
}

const apiFetch = async (path, opts = {}) => {
  const session = JSON.parse(localStorage.getItem('adminSession') || '{}')
  const token = session?.token || session?.accessToken
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message || `Lỗi ${res.status}`)
  }
  return res.json()
}

// ─── Badge Component ───────────────────────────────────────────────────────
const Badge = ({ status, map }) => {
  const s = map[status] || { label: status, color: '#6b7280', bg: '#f9fafb' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 99, fontSize: 12, fontWeight: 700,
      color: s.color, background: s.bg || '#f9fafb', border: `1px solid ${s.color}22`
    }}>{s.label}</span>
  )
}

// ─── Modal Component ───────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
    <div style={{ background: '#fff', borderRadius: 16, padding: 28, minWidth: 480, maxWidth: 580, width: '100%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6b7280' }}>×</button>
      </div>
      {children}
    </div>
  </div>
)

// ─── InputField ───────────────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
    {children}
  </div>
)
const Input = (props) => (
  <input {...props} style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', ...props.style }} />
)
const Btn = ({ children, onClick, variant = 'primary', small, disabled, style: extStyle }) => {
  const styles = {
    primary: { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff' },
    success: { background: 'linear-gradient(135deg,#16a34a,#22c55e)', color: '#fff' },
    danger: { background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: '#fff' },
    outline: { background: '#fff', color: '#374151', border: '1.5px solid #e5e7eb' },
    ghost: { background: 'transparent', color: '#6b7280' },
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? '5px 14px' : '9px 18px', borderRadius: 8, fontSize: small ? 12 : 14, fontWeight: 600, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'all .2s', ...styles[variant], ...extStyle
    }}>{children}</button>
  )
}

const Pagination = ({ page, totalPages, setPage }) => {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 16 }}>
      <Btn small variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Trước</Btn>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#4b5563' }}>Trang {page} / {totalPages}</div>
      <Btn small variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Sau →</Btn>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1: Hồ Sơ Đăng Ký (UC-B01)
// ═══════════════════════════════════════════════════════════════════════════
function HoSoDangKyTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [detail, setDetail] = useState(null)
  const [tuChoiId, setTuChoiId] = useState(null)
  const [lyDo, setLyDo] = useState('')
  const [msg, setMsg] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 5

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await apiFetch(`/franchise/ho-so${filter ? `?trang_thai=${filter}` : ''}`)) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [filter])

  const totalPages = Math.ceil(items.length / pageSize)
  const currentItems = items.slice((page - 1) * pageSize, page * pageSize)

  const yeuCauDatCoc = async (id) => {
    if (!confirm('Xác nhận yêu cầu Kiosk này đặt cọc 5.000.000đ giữ chỗ? Hệ thống sẽ tự kiểm tra độc quyền khu vực.')) return
    try {
      const res = await apiFetch(`/franchise/ho-so/${id}/yeu-cau-coc`, { method: 'PATCH' })
      setMsg({ type: 'success', text: res.message })
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  const douyetHoSo = async (id) => {
    if (!confirm('Xác nhận đã nhận đủ tiền cọc 5.000.000đ? Hệ thống sẽ duyệt hồ sơ, tạo tài khoản và Kiosk mới.')) return
    try {
      const res = await apiFetch(`/franchise/ho-so/${id}/duyet`, { method: 'PATCH' })
      setMsg({ type: 'success', text: res.message || '✅ Đã duyệt hồ sơ! Tài khoản và Kiosk đã được tạo tự động.' })
      load()
    } catch (e) {
      console.error("Duyệt hồ sơ error:", e)
      setMsg({ type: 'error', text: e.message })
    }
  }

  const tuChoi = async () => {
    if (!lyDo.trim()) { alert('Vui lòng nhập lý do từ chối'); return }
    try {
      await apiFetch(`/franchise/ho-so/${tuChoiId}/tu-choi`, { method: 'PATCH', body: JSON.stringify({ ly_do: lyDo }) })
      setMsg({ type: 'success', text: '❌ Đã từ chối hồ sơ.' })
      setTuChoiId(null); setLyDo(''); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const khachTuHuyDemo = async (id) => {
    if (!confirm('Demo: Giả lập khách hàng gọi API tự hủy hồ sơ này?')) return;
    try {
      const res = await apiFetch(`/franchise/ho-so/${id}/huy`, { method: 'PATCH' })
      alert(`[KẾT QUẢ TỪ API HỦY]\n\nNội dung: ${res.message}\nTiền hoàn cọc: ${res.data?.refund_amount || 0}đ`);
      setMsg({ type: 'success', text: '✅ Demo Khách tự hủy thành công!' })
      load()
    } catch (e) {
      alert(`[LỖI TỪ API HỦY]\n\n${e.message}`);
      setMsg({ type: 'error', text: e.message })
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>📋 Hồ Sơ Đăng Ký Nhượng Quyền</h3>
        {['', 'CHO_XEM_XET', 'CHO_DAT_COC', 'DA_DUYET', 'TU_CHOI'].map(s => (
          <Btn key={s} small variant={filter === s ? 'primary' : 'outline'} onClick={() => setFilter(s)}>
            {s === '' ? 'Tất cả' : s === 'CHO_XEM_XET' ? '⏳ Chờ xem xét' : s === 'CHO_DAT_COC' ? '💰 Chờ đặt cọc' : s === 'DA_DUYET' ? '✅ Đã duyệt' : '❌ Từ chối'}
          </Btn>
        ))}
        <Btn small variant="outline" onClick={load}>🔄</Btn>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Đang tải...</div> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Chưa có hồ sơ nào.</div>}
          {currentItems.map(item => (
            <div key={item.id} style={{ background: '#fff', borderRadius: 12, padding: 18, border: '1.5px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{item.ho_ten}</div>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>{item.email} · {item.so_dien_thoai}</div>
                  <div style={{ color: '#374151', fontSize: 13, marginTop: 4 }}>📍 {item.dia_chi_mat_bang}, {item.thanh_pho}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Gói: <b>{item.goi_kiosk}</b> · {item.dien_tich_m2}m² · {fmtDate(item.ngay_tao)}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  <Badge status={item.trang_thai} map={{ CHO_XEM_XET: { label: 'Chờ xem xét', color: '#6b7280', bg: '#f3f4f6' }, CHO_DAT_COC: { label: 'Chờ đặt cọc', color: '#d97706', bg: '#fef3c7' }, DA_DUYET: { label: 'Đã duyệt', color: '#16a34a', bg: '#f0fdf4' }, TU_CHOI: { label: 'Từ chối', color: '#dc2626', bg: '#fef2f2' }, DA_HUY: { label: 'Đã hủy', color: '#dc2626', bg: '#fef2f2' } }} />
                  {item.trang_thai === 'CHO_XEM_XET' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="primary" onClick={() => yeuCauDatCoc(item.id)}>💰 Yêu cầu Cọc (Check Khu vực)</Btn>
                      <Btn small variant="danger" onClick={() => { setTuChoiId(item.id); setLyDo('') }}>❌ Từ chối</Btn>
                      <Btn small variant="outline" onClick={() => khachTuHuyDemo(item.id)}>🧑‍💻 Khách Tự Hủy (Demo)</Btn>
                    </div>
                  )}
                  {item.trang_thai === 'CHO_DAT_COC' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="success" onClick={() => douyetHoSo(item.id)}>✅ Xác nhận đã nhận cọc</Btn>
                      <Btn small variant="danger" onClick={() => { setTuChoiId(item.id); setLyDo('Khách hàng hủy / Không nộp cọc') }}>❌ Hủy</Btn>
                      <Btn small variant="outline" onClick={() => khachTuHuyDemo(item.id)}>🧑‍💻 Khách Tự Hủy (Demo)</Btn>
                    </div>
                  )}
                  {item.trang_thai === 'DA_DUYET' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn small variant="outline" onClick={() => khachTuHuyDemo(item.id)}>🧑‍💻 Khách Tự Hủy (Demo)</Btn>
                    </div>
                  )}
                  {item.ly_do_tu_choi && <div style={{ fontSize: 11, color: '#dc2626', maxWidth: 200 }}>Lý do: {item.ly_do_tu_choi}</div>}
                </div>
              </div>
              {item.ghi_chu && <div style={{ marginTop: 8, padding: 8, background: '#f9fafb', borderRadius: 6, fontSize: 12, color: '#6b7280' }}>📝 {item.ghi_chu}</div>}
            </div>
          ))}

          {/* Phân trang */}
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      )}

      {tuChoiId && (
        <Modal title="❌ Từ chối hồ sơ" onClose={() => setTuChoiId(null)}>
          <Field label="Lý do từ chối *">
            <textarea value={lyDo} onChange={e => setLyDo(e.target.value)} rows={4}
              style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }}
              placeholder="Nhập lý do từ chối để thông báo cho ứng viên..." />
          </Field>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="outline" onClick={() => setTuChoiId(null)}>Hủy</Btn>
            <Btn variant="danger" onClick={tuChoi}>Xác nhận từ chối</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2: Quản Lý Kiosk + Hợp Đồng (UC-B01, B02)
// ═══════════════════════════════════════════════════════════════════════════
function KioskManageTab() {
  const [kiosks, setKiosks] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 5
  const [hopDongModal, setHopDongModal] = useState(null)
  const [giaHanModal, setGiaHanModal] = useState(null)
  const [chamDutModal, setChamDutModal] = useState(null)
  const [form, setForm] = useState({ ngay_ky: '', ngay_het_han: '', ty_le_royalty_phan_tram: 7, so_combo_khoi_diem: 5, file_hop_dong_url: '', ngay_het_han_moi: '' })
  const [msg, setMsg] = useState(null)

  const load = async () => {
    setLoading(true)
    try { setKiosks(await apiFetch('/franchise/kiosk')) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const totalPages = Math.ceil(kiosks.length / pageSize)
  const currentKiosks = kiosks.slice((page - 1) * pageSize, page * pageSize)

  const taoHopDong = async () => {
    try {
      await apiFetch(`/franchise/kiosk/${hopDongModal.id}/hop-dong`, { method: 'POST', body: JSON.stringify(form) })
      setMsg({ type: 'success', text: '✅ Đã tạo hợp đồng thành công! Kiosk đang thiết lập.' })
      setHopDongModal(null); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const khaittruong = async (id) => {
    if (!confirm('Xác nhận kiosk đã khai trương và chính thức hoạt động?')) return
    try {
      await apiFetch(`/franchise/kiosk/${id}/khai-truong`, { method: 'PATCH' })
      setMsg({ type: 'success', text: '🎉 Kiosk đã khai trương!' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const giaHan = async () => {
    if (!form.ngay_het_han_moi) return
    try {
      await apiFetch(`/franchise/kiosk/${giaHanModal.id}/gia-han`, { method: 'POST', body: JSON.stringify({ ngay_het_han_moi: form.ngay_het_han_moi }) })
      setMsg({ type: 'success', text: '✅ Đã gia hạn hợp đồng.' }); 
      setGiaHanModal(null); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const chamDut = async () => {
    try {
      await apiFetch(`/franchise/kiosk/${chamDutModal.id}/cham-dut`, { method: 'POST' })
      setMsg({ type: 'success', text: '🛑 Đã chấm dứt hợp đồng Kiosk.' }); 
      setChamDutModal(null); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>🏪 Quản Lý Kiosk</h3>
        <Btn small variant="outline" onClick={load}>🔄 Làm mới</Btn>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {currentKiosks.map(k => {
            const st = STATUS_KIOSK[k.trang_thai] || {}
            return (
              <div key={k.id} style={{ background: '#fff', borderRadius: 14, padding: 18, border: `2px solid ${st.color}33`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, fontSize: 16 }}>{k.ten_kiosk}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '2px 8px', borderRadius: 99 }}>{k.ma_kiosk}</span>
                      <Badge status={k.trang_thai} map={STATUS_KIOSK} />
                      {k.xep_hang && (
                        <span title={`Điểm đánh giá: ${k.diem_danh_gia}/100\nS: >=90, A: >=70, B: >=50, C: <50`} style={{ fontSize: 13, fontWeight: 800, color: k.xep_hang === 'S' ? '#eab308' : k.xep_hang === 'A' ? '#3b82f6' : k.xep_hang === 'B' ? '#10b981' : '#ef4444', background: '#f8fafc', padding: '2px 8px', borderRadius: 99, border: '1px solid #e2e8f0', cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          🏆 Hạng {k.xep_hang}
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 13 }}>📍 {k.dia_chi}, {k.thanh_pho}</div>
                    <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
                      Loại: <b>{k.loai_kiosk}</b> · Combo hiện có: <b style={{ color: k.so_combo_hien_tai < 3 ? '#dc2626' : '#16a34a' }}>{k.so_combo_hien_tai}</b>
                      {k.so_cong_no_chua_thanh_toan > 0 && <span style={{ color: '#dc2626', marginLeft: 8 }}>⚠️ {k.so_cong_no_chua_thanh_toan} khoản nợ</span>}
                    </div>
                    {k.hop_dong && (() => {
                      const ngayHetHan = new Date(k.hop_dong.ngay_het_han);
                      const daysLeft = Math.ceil((ngayHetHan.getTime() - Date.now()) / (1000 * 3600 * 24));
                      const isExpiringSoon = daysLeft <= 30 && daysLeft >= 0;
                      const isExpired = daysLeft < 0;
                      return (
                        <div style={{ fontSize: 12, color: '#374151', marginTop: 4 }}>
                          📜 HĐ: Royalty <b>{k.hop_dong.ty_le_royalty_phan_tram}%</b> · Hết hạn: 
                          <span style={{ 
                            marginLeft: 4, padding: '2px 6px', borderRadius: 4, 
                            background: isExpired ? '#fee2e2' : isExpiringSoon ? '#ffedd5' : 'transparent',
                            color: isExpired ? '#dc2626' : isExpiringSoon ? '#ea580c' : 'inherit',
                            fontWeight: (isExpired || isExpiringSoon) ? 800 : 'normal'
                          }}>
                            {fmtDate(k.hop_dong.ngay_het_han)}
                            {isExpired && ' (Quá hạn)'}
                            {isExpiringSoon && ` (Còn ${daysLeft} ngày)`}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    {k.trang_thai === 'CHO_KY_HOP_DONG' && (
                      <Btn small variant="primary" onClick={() => { setHopDongModal(k); setForm({ ngay_ky: new Date().toISOString().split('T')[0], ngay_het_han: '', ty_le_royalty_phan_tram: 7, so_combo_khoi_diem: 5, file_hop_dong_url: '' }) }}>📝 Ký hợp đồng</Btn>
                    )}
                    {k.trang_thai === 'DANG_THIET_LAP' && (
                      <Btn small variant="success" onClick={() => khaittruong(k.id)}>🎉 Xác nhận khai trương</Btn>
                    )}
                    {(k.trang_thai === 'DANG_HOAT_DONG' || k.trang_thai === 'TAM_DUNG') && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn small variant="outline" onClick={() => {
                          setGiaHanModal(k);
                          setForm(f => ({ ...f, ngay_het_han_moi: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0] }));
                        }}>📅 Gia hạn HĐ</Btn>
                        <Btn small variant="danger" onClick={() => setChamDutModal(k)}>🛑 Chấm dứt</Btn>
                      </div>
                    )}
                    {k.trang_thai === 'NGUNG_HOAT_DONG' && (
                      <Btn small variant="success" onClick={async () => {
                        if(!confirm('Mở khóa Kiosk cho phép hoạt động lại?')) return;
                        try {
                          await apiFetch(`/franchise/kiosk/${k.id}/trang-thai`, { method: 'PATCH', body: JSON.stringify({ trang_thai: 'DANG_HOAT_DONG' }) });
                          load();
                        } catch(e) { alert(e.message); }
                      }}>🔓 Mở khóa Kiosk</Btn>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      )}

      {hopDongModal && (
        <Modal title={`📝 Ký hợp đồng — ${hopDongModal.ten_kiosk}`} onClose={() => setHopDongModal(null)}>
          <div style={{ marginBottom: 16, padding: 12, background: '#f0f9ff', borderRadius: 8, fontSize: 13, color: '#0369a1' }}>
            Gói: <b>{hopDongModal.loai_kiosk}</b> · {hopDongModal.dia_chi}, {hopDongModal.thanh_pho}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Ngày ký *"><Input type="date" value={form.ngay_ky} onChange={e => setForm(f => ({ ...f, ngay_ky: e.target.value }))} /></Field>
            <Field label="Ngày hết hạn *"><Input type="date" value={form.ngay_het_han} onChange={e => setForm(f => ({ ...f, ngay_het_han: e.target.value }))} /></Field>
            <Field label="Tỷ lệ Royalty (%)">
              <Input type="number" min="1" max="20" step="0.5" value={form.ty_le_royalty_phan_tram} onChange={e => setForm(f => ({ ...f, ty_le_royalty_phan_tram: e.target.value }))} />
            </Field>
            <Field label="Combo khởi điểm">
              <Input type="number" min="0" value={form.so_combo_khoi_diem} onChange={e => setForm(f => ({ ...f, so_combo_khoi_diem: e.target.value }))} />
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Bản scan Hợp đồng đã ký (URL / Hình ảnh) *">
                <Input type="text" placeholder="Ví dụ: https://avengers-coffee.vn/contracts/HD-KSK001.pdf" value={form.file_hop_dong_url} onChange={e => setForm(f => ({ ...f, file_hop_dong_url: e.target.value }))} />
              </Field>
            </div>
          </div>
          <div style={{ marginTop: 8, padding: 10, background: '#fefce8', borderRadius: 8, fontSize: 12, color: '#713f12' }}>
            ℹ️ Hệ thống sẽ tự động cấp {form.so_combo_khoi_diem} combo khởi điểm và chuyển kiosk sang trạng thái "Đang thiết lập".
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="outline" onClick={() => setHopDongModal(null)}>Hủy</Btn>
            <Btn variant="success" onClick={taoHopDong}>✅ Xác nhận ký hợp đồng</Btn>
          </div>
        </Modal>
      )}

      {giaHanModal && (
        <Modal title={`📅 Gia hạn hợp đồng — ${giaHanModal.ten_kiosk}`} onClose={() => setGiaHanModal(null)}>
          <div style={{ marginBottom: 16, padding: 12, background: '#fffbeb', border: '1px solid #fef08a', borderRadius: 8, fontSize: 13, color: '#854d0e' }}>
            Ngày hết hạn cũ: <b>{giaHanModal.hop_dong?.ngay_het_han ? fmtDate(giaHanModal.hop_dong.ngay_het_han) : 'Không rõ'}</b>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Field label="Ngày hết hạn mới (Mặc định +1 năm)">
              <Input type="date" value={form.ngay_het_han_moi} onChange={e => setForm(f => ({ ...f, ngay_het_han_moi: e.target.value }))} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="outline" onClick={() => setGiaHanModal(null)}>Hủy</Btn>
            <Btn variant="success" onClick={giaHan}>✅ Xác nhận Gia hạn</Btn>
          </div>
        </Modal>
      )}

      {chamDutModal && (
        <Modal title={`🛑 Xác nhận Chấm dứt Hợp đồng`} onClose={() => setChamDutModal(null)}>
          <div style={{ padding: 16, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 16 }}>⚠️ NGUY HIỂM</h4>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
              Bạn chuẩn bị vô hiệu hóa vĩnh viễn Kiosk <b>{chamDutModal.ten_kiosk}</b>.<br/>
              Hành động này sẽ:
            </p>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 20, fontSize: 14, lineHeight: 1.5 }}>
              <li>Hủy hợp đồng nhượng quyền</li>
              <li>Khóa tài khoản hệ thống của Chủ Kiosk</li>
              <li>Hệ thống sẽ <b>TỪ CHỐI</b> nếu Kiosk vẫn còn nợ chưa thanh toán.</li>
            </ul>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="outline" onClick={() => setChamDutModal(null)}>Hủy bỏ</Btn>
            <Btn variant="danger" onClick={chamDut}>Xác nhận Chấm dứt</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3: Đơn Mua Combo (UC-B03)
// ═══════════════════════════════════════════════════════════════════════════
function DonMuaComboTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [msg, setMsg] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 5

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await apiFetch(`/franchise/don-mua-combo${filter ? `?trang_thai=${filter}` : ''}`)) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [filter])

  const totalPages = Math.ceil(items.length / pageSize)
  const currentItems = items.slice((page - 1) * pageSize, page * pageSize)

  const giaoDon = async (id) => {
    const ghi_chu = prompt('Ghi chú giao hàng (có thể để trống):')
    if (ghi_chu === null) return
    try {
      await apiFetch(`/franchise/don-mua-combo/${id}/giao`, { method: 'PATCH', body: JSON.stringify({ ghi_chu }) })
      setMsg({ type: 'success', text: '✅ Đã xác nhận giao combo.' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const tamHoan = async (id) => {
    const ghi_chu = prompt('Lý do tạm hoãn:')
    if (!ghi_chu) return
    try {
      await apiFetch(`/franchise/don-mua-combo/${id}/tam-hoan`, { method: 'PATCH', body: JSON.stringify({ ghi_chu }) })
      setMsg({ type: 'success', text: '⏸️ Đã tạm hoãn đơn.' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>📦 Đơn Mua Combo Nguyên Liệu</h3>
        {['', 'DA_DAT', 'DA_GIAO', 'TAM_HOAN'].map(s => (
          <Btn key={s} small variant={filter === s ? 'primary' : 'outline'} onClick={() => setFilter(s)}>
            {s === '' ? 'Tất cả' : STATUS_DON[s]?.label}
          </Btn>
        ))}
        <Btn small variant="outline" onClick={load}>🔄</Btn>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
            <thead>
              <tr style={{ fontSize: 12, color: '#6b7280', textAlign: 'left' }}>
                {['Kiosk', 'Combo', 'SL', 'Tổng tiền', 'Thanh toán', 'Trạng thái', 'Ngày đặt', 'Thao tác'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', background: '#f9fafb', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentItems.map(d => (
                <tr key={d.id} style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, fontSize: 13 }}>{d.kiosk?.ten_kiosk || d.kiosk_id.slice(0, 8)} <br/><span style={{fontSize: 11, color: '#9ca3af', fontWeight: 500}}>{d.kiosk?.ma_kiosk}</span></td>
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>{d.combo?.ten_combo || '—'}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>×{d.so_luong}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: '#6366f1' }}>{fmtMoney(d.tong_tien)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>{d.phuong_thuc_thanh_toan === 'CONG_NO' ? '💳 Công nợ' : d.phuong_thuc_thanh_toan}</td>
                  <td style={{ padding: '10px 12px' }}><Badge status={d.trang_thai} map={STATUS_DON} /></td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#6b7280' }}>{fmtDate(d.ngay_dat)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {d.trang_thai === 'DA_DAT' && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Btn small variant="success" onClick={() => giaoDon(d.id)}>✅ Giao</Btn>
                        <Btn small variant="danger" onClick={() => tamHoan(d.id)}>⏸️ Hoãn</Btn>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          {items.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Chưa có đơn nào.</div>}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4: Công Nợ (UC-B04)
// ═══════════════════════════════════════════════════════════════════════════
function CongNoTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [invoiceModal, setInvoiceModal] = useState(null)
  const [msg, setMsg] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 5

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await apiFetch(`/franchise/cong-no${filter ? `?trang_thai=${filter}` : ''}`)) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [filter])

  const totalPages = Math.ceil(items.length / pageSize)
  const currentItems = items.slice((page - 1) * pageSize, page * pageSize)

  const xacNhan = async (id) => {
    const ghi_chu = prompt('Ghi chú (số tài khoản, ngày chuyển...):') || ''
    try {
      await apiFetch(`/franchise/cong-no/${id}/xac-nhan-thanh-toan`, { method: 'PATCH', body: JSON.stringify({ ghi_chu }) })
      setMsg({ type: 'success', text: '✅ Đã xác nhận thanh toán công nợ.' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const inHoaDonPDF = () => {
    const content = document.getElementById('invoice-print-area').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Hoa don VAT - Avengers Coffee</title>
          <style>
            body { font-family: monospace; padding: 20px; color: #111827; max-width: 800px; margin: 0 auto; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; }
            hr { border-top: 1px dashed #ccc; }
            @media print {
              @page { margin: 0; size: A5 landscape; }
              body { padding: 30px; }
            }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  }

  const tuaNhanh = async (id) => {
    if (!confirm('DEV TOOL: Tua nhanh nợ về 8 ngày trước để test tự động khóa Kiosk?')) return
    try {
      await apiFetch(`/franchise/cong-no/${id}/tua-nhanh`, { method: 'POST', body: JSON.stringify({ days: 8 }) })
      setMsg({ type: 'success', text: '⏩ Đã tua nhanh thời gian (8 ngày).' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const tongChuaThanhToan = items.filter(i => i.trang_thai !== 'DA_THANH_TOAN').reduce((s, i) => s + Number(i.so_tien), 0)
  const soQuaHan = items.filter(i => i.trang_thai === 'QUA_HAN').length

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#fef3c7,#fde68a)', border: '1px solid #f59e0b' }}>
          <div style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>Tổng chưa thanh toán</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706' }}>{fmtMoney(tongChuaThanhToan)}</div>
        </div>
        {soQuaHan > 0 && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid #dc2626' }}>
            <div style={{ fontSize: 12, color: '#991b1b', fontWeight: 600 }}>⚠️ Quá hạn</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{soQuaHan} khoản</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>💳 Theo Dõi Công Nợ</h3>
        {['', 'CON_NO', 'QUA_HAN', 'DA_THANH_TOAN'].map(s => (
          <Btn key={s} small variant={filter === s ? 'primary' : 'outline'} onClick={() => setFilter(s)}>
            {s === '' ? 'Tất cả' : STATUS_CONG_NO[s]?.label}
          </Btn>
        ))}
        <Btn small variant="outline" onClick={load}>🔄</Btn>
        <Btn small variant="outline" onClick={async () => {
          if(!confirm('Chạy quét nợ hệ thống ngay bây giờ?')) return;
          try {
            const res = await apiFetch('/franchise/cron/xu-ly-no-qua-han', { method: 'POST' });
            setMsg({ type: 'success', text: res.message });
            load();
          } catch(e) {
            setMsg({ type: 'error', text: e.message });
          }
        }}>⚡ Chạy Quét Nợ</Btn>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {currentItems.map(c => (
            <div key={c.id} style={{ background: '#fff', borderRadius: 10, padding: 16, border: `1.5px solid ${c.trang_thai === 'QUA_HAN' ? '#fca5a5' : '#e5e7eb'}`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.kiosk?.ten_kiosk} <span style={{fontSize: 12, color: '#9ca3af', fontWeight: 500}}>({c.kiosk?.ma_kiosk})</span></div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{c.loai_phat_sinh === 'KHOI_TAO' ? '🏪 Phí nhượng quyền ban đầu' : c.loai_phat_sinh === 'NGUYEN_LIEU' ? '📦 Công nợ nguyên liệu' : '📊 Phí royalty'}</div>
                <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>Hạn: {fmtDate(c.han_thanh_toan)}</div>
                {c.ghi_chu && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📝 {c.ghi_chu}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: c.trang_thai === 'DA_THANH_TOAN' ? '#16a34a' : '#dc2626' }}>
                  {fmtMoney(Number(c.so_tien) + Number(c.phi_phat_tre_han || 0))}
                </div>
                {Number(c.phi_phat_tre_han) > 0 && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 4 }}>(Gốc: {fmtMoney(c.so_tien)} + Phạt: {fmtMoney(c.phi_phat_tre_han)})</div>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                  <Badge status={c.trang_thai} map={STATUS_CONG_NO} />
                  {c.so_lan_nhac_nho > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', background: '#fee2e2', padding: '2px 6px', borderRadius: 6 }}>
                      Nhắc nợ: {c.so_lan_nhac_nho}/3
                    </span>
                  )}
                </div>
                {c.trang_thai !== 'DA_THANH_TOAN' ? (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Btn small variant="outline" onClick={() => tuaNhanh(c.id)}>⏩ +8 ngày</Btn>
                    <Btn small variant="success" onClick={() => xacNhan(c.id)}>✅ Đã thu</Btn>
                  </div>
                ) : (
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <Btn small variant="outline" onClick={() => setInvoiceModal(c)}>🖨️ In Hóa Đơn VAT</Btn>
                  </div>
                )}
              </div>
            </div>
          ))}
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          {items.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Không có công nợ.</div>}
        </div>
      )}

      {invoiceModal && (
        <Modal title="🖨️ HÓA ĐƠN GIÁ TRỊ GIA TĂNG (Bản Thể Hiện)" onClose={() => setInvoiceModal(null)}>
          <div id="invoice-print-area" style={{ padding: '20px 30px', background: '#fff', border: '1px dashed #ccc', color: '#111827', fontFamily: 'monospace' }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: '0 0 5px 0' }}>CÔNG TY CP AVENGERS COFFEE</h2>
              <div style={{ fontSize: 13 }}>MST: 0123456789 - SĐT: 1900 1234</div>
              <div style={{ fontSize: 13 }}>Địa chỉ: 123 Đường Nhượng Quyền, TP. HCM</div>
              <hr style={{ borderTop: '1px dashed #ccc', margin: '15px 0' }}/>
              <h3 style={{ margin: '0 0 5px 0' }}>HÓA ĐƠN GIÁ TRỊ GIA TĂNG</h3>
              <div style={{ fontSize: 12 }}>Bản thể hiện của hóa đơn điện tử</div>
            </div>
            
            <div style={{ marginBottom: 15, fontSize: 13, lineHeight: '1.6' }}>
              <div><b>Khách hàng:</b> {invoiceModal.kiosk?.ten_kiosk}</div>
              <div><b>Mã Kiosk:</b> {invoiceModal.kiosk?.ma_kiosk}</div>
              <div><b>Nội dung xuất:</b> {invoiceModal.loai_phat_sinh === 'KHOI_TAO' ? 'Phí nhượng quyền và setup ban đầu' : 'Thanh toán công nợ / Royalty'}</div>
              <div><b>Ngày thanh toán:</b> {new Date().toLocaleDateString('vi-VN')}</div>
            </div>

            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 15 }}>
              <thead>
                <tr style={{ borderBottom: '1px dashed #ccc', textAlign: 'left' }}>
                  <th style={{ paddingBottom: 5 }}>Nội dung</th>
                  <th style={{ paddingBottom: 5, textAlign: 'right' }}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ paddingTop: 10 }}>Tiền hàng (chưa VAT)</td>
                  <td style={{ paddingTop: 10, textAlign: 'right' }}>{fmtMoney((Number(invoiceModal.so_tien) + Number(invoiceModal.phi_phat_tre_han||0)) / 1.08)}</td>
                </tr>
                <tr>
                  <td style={{ paddingTop: 5 }}>Thuế GTGT (8%)</td>
                  <td style={{ paddingTop: 5, textAlign: 'right' }}>{fmtMoney((Number(invoiceModal.so_tien) + Number(invoiceModal.phi_phat_tre_han||0)) - ((Number(invoiceModal.so_tien) + Number(invoiceModal.phi_phat_tre_han||0)) / 1.08))}</td>
                </tr>
                <tr style={{ fontWeight: 700 }}>
                  <td style={{ paddingTop: 10, borderTop: '1px dashed #ccc' }}>TỔNG CỘNG</td>
                  <td style={{ paddingTop: 10, borderTop: '1px dashed #ccc', textAlign: 'right' }}>{fmtMoney(Number(invoiceModal.so_tien) + Number(invoiceModal.phi_phat_tre_han||0))}</td>
                </tr>
              </tbody>
            </table>
            
            <div style={{ textAlign: 'center', fontSize: 12, marginTop: 30, color: '#6b7280' }}>
              <div>(Đã ký bởi Công ty CP Avengers Coffee)</div>
              <div style={{ marginTop: 4 }}>* Đây là hóa đơn giả lập cho bài Demo.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="outline" onClick={() => setInvoiceModal(null)}>Đóng</Btn>
            <Btn variant="primary" onClick={inHoaDonPDF}>In Hóa Đơn (PDF)</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 5: Royalty (UC-B05)
// ═══════════════════════════════════════════════════════════════════════════
function RoyaltyTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [tinhingLoading, setTinhingLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 5

  const load = useCallback(async () => {
    setLoading(true)
    try { setItems(await apiFetch(`/franchise/royalty${filter ? `?trang_thai=${filter}` : ''}`)) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [filter])

  const totalPages = Math.ceil(items.length / pageSize)
  const currentItems = items.slice((page - 1) * pageSize, page * pageSize)

  const tinhRoyalty = async () => {
    setTinhingLoading(true)
    try {
      const res = await apiFetch('/franchise/royalty/tinh-thang', { method: 'POST', body: JSON.stringify({}) })
      setMsg({ type: 'success', text: `✅ ${res.message}` }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setTinhingLoading(false) }
  }

  const xacNhan = async (id) => {
    const ghi_chu = prompt('Ghi chú điều chỉnh (nếu có):') || ''
    try {
      await apiFetch(`/franchise/royalty/${id}/xac-nhan`, { method: 'PATCH', body: JSON.stringify({ ghi_chu }) })
      setMsg({ type: 'success', text: '✅ Đã xác nhận bảng kê royalty.' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const ghiNhanThanhToan = async (id) => {
    if (!confirm('Xác nhận đã nhận được tiền royalty?')) return
    try {
      await apiFetch(`/franchise/royalty/${id}/thanh-toan`, { method: 'PATCH' })
      setMsg({ type: 'success', text: '💰 Đã ghi nhận thanh toán royalty.' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const tongRoyaltyThu = items.filter(i => i.trang_thai === 'DA_THANH_TOAN').reduce((s, i) => s + Number(i.so_tien_royalty), 0)
  const tongRoyaltyChoThu = items.filter(i => i.trang_thai !== 'DA_THANH_TOAN').reduce((s, i) => s + Number(i.so_tien_royalty), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '1px solid #16a34a' }}>
          <div style={{ fontSize: 12, color: '#14532d', fontWeight: 600 }}>Đã thu được</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{fmtMoney(tongRoyaltyThu)}</div>
        </div>
        <div style={{ padding: '12px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#fffbeb,#fde68a)', border: '1px solid #f59e0b' }}>
          <div style={{ fontSize: 12, color: '#78350f', fontWeight: 600 }}>Chờ thu</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#d97706' }}>{fmtMoney(tongRoyaltyChoThu)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>📊 Royalty Hàng Tháng</h3>
        {['', 'CHO_XAC_NHAN', 'DA_XAC_NHAN', 'DA_THANH_TOAN'].map(s => (
          <Btn key={s} small variant={filter === s ? 'primary' : 'outline'} onClick={() => setFilter(s)}>
            {s === '' ? 'Tất cả' : STATUS_ROYALTY[s]?.label}
          </Btn>
        ))}
        <Btn small variant="success" onClick={tinhRoyalty} disabled={tinhingLoading}>{tinhingLoading ? 'Đang tính...' : '⚡ Tính Royalty Tháng Trước'}</Btn>
        <Btn small variant="outline" onClick={load}>🔄</Btn>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {currentItems.map(r => (
            <div key={r.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1.5px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.kiosk?.ten_kiosk} <span style={{fontSize: 12, color: '#9ca3af', fontWeight: 500}}>({r.kiosk?.ma_kiosk})</span> <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>·</span> <span style={{ fontSize: 13, color: '#6366f1' }}>Tháng {r.thang}</span></div>
                <div style={{ fontSize: 12, color: '#374151', marginTop: 2 }}>
                  Doanh thu: <b>{fmtMoney(r.doanh_thu_thuc_te)}</b> × {r.ty_le_royalty}% = <b style={{ color: '#6366f1' }}>{fmtMoney(r.so_tien_royalty)}</b>
                </div>
                {r.ghi_chu_ke_toan && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>📝 {r.ghi_chu_ke_toan}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <Badge status={r.trang_thai} map={STATUS_ROYALTY} />
                {r.trang_thai === 'CHO_XAC_NHAN' && <Btn small variant="primary" onClick={() => xacNhan(r.id)}>✅ Xác nhận</Btn>}
                {r.trang_thai === 'DA_XAC_NHAN' && <Btn small variant="success" onClick={() => ghiNhanThanhToan(r.id)}>💰 Đã thu tiền</Btn>}
              </div>
            </div>
          ))}
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          {items.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Chưa có dữ liệu royalty.</div>}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 6: Đối Soát Gian Lận (UC-B06)
// ═══════════════════════════════════════════════════════════════════════════
function DoiSoatTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [bienBanModal, setBienBanModal] = useState(null)
  const [form, setForm] = useState({ loai_vi_pham: 'GIAN_LAN_NGUYEN_LIEU', hinh_phat: 'TIEN_PHAT', so_tien_phat: 5000000, ly_do: 'Gian lận doanh thu dựa trên số liệu đối soát' })
  const [msg, setMsg] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 5

  const load = async () => {
    setLoading(true)
    try { setItems(await apiFetch('/franchise/doi-soat')) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const totalPages = Math.ceil(items.length / pageSize)
  const currentItems = items.slice((page - 1) * pageSize, page * pageSize)

  const chayDoiSoat = async () => {
    setRunning(true)
    try {
      const res = await apiFetch('/franchise/doi-soat/chay', { method: 'POST', body: JSON.stringify({}) })
      setMsg({ type: 'success', text: `🔍 ${res.message}` }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setRunning(false) }
  }

  const lapBienBan = async () => {
    try {
      // Ép kiểu hinh_phat nếu vi phạm quá 3 lần
      const hinhPhatFinal = bienBanModal.so_ky_lien_tiep_canh_bao >= 3 ? 'CHAM_DUT_HOP_DONG' : form.hinh_phat;
      
      await apiFetch(`/franchise/doi-soat/${bienBanModal.kiosk_id}/lap-bien-ban`, { method: 'POST', body: JSON.stringify({ ...form, hinh_phat: hinhPhatFinal }) })
      setMsg({ type: 'success', text: '✅ Đã lập biên bản vi phạm.' }); setBienBanModal(null); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const soDo = items.filter(i => i.muc_canh_bao === 'DO').length
  const soVang = items.filter(i => i.muc_canh_bao === 'VANG').length
  const soXanh = items.filter(i => i.muc_canh_bao === 'XANH').length

  return (
    <div>
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          {[{ key: 'DO', n: soDo }, { key: 'VANG', n: soVang }, { key: 'XANH', n: soXanh }].map(({ key, n }) => {
            const cb = CANH_BAO[key]
            return n > 0 ? (
              <div key={key} style={{ padding: '10px 18px', borderRadius: 10, background: cb.bg, border: `1.5px solid ${cb.color}44` }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: cb.color }}>{cb.emoji} {n}</div>
                <div style={{ fontSize: 11, color: cb.color, fontWeight: 600 }}>{cb.label}</div>
              </div>
            ) : null
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>🔍 Đối Soát Rủi Ro Gian Lận</h3>
        <Btn variant="primary" onClick={chayDoiSoat} disabled={running}>{running ? '⏳ Đang phân tích...' : '🔍 Chạy Đối Soát Tháng Trước'}</Btn>
        <Btn small variant="outline" onClick={load}>🔄</Btn>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {currentItems.map(d => {
            const cb = CANH_BAO[d.muc_canh_bao] || CANH_BAO.XANH
            return (
              <div key={d.id} style={{ background: '#fff', borderRadius: 12, padding: 18, border: `2px solid ${cb.color}44`, background: cb.bg }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {cb.emoji} {d.kiosk?.ten_kiosk} <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>· Kỳ {d.ky_doi_soat}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 10 }}>
                      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>Combo đã mua</div>
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#374151' }}>{d.tong_combo_da_mua}</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>DT kỳ vọng</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#374151' }}>{fmtMoney(d.doanh_thu_ky_vong)}</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>DT thực tế</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#374151' }}>{fmtMoney(d.doanh_thu_thuc_te)}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 28, fontWeight: 900, color: cb.color }}>
                      {d.chenh_lech_phan_tram > 0 ? '+' : ''}{Number(d.chenh_lech_phan_tram).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 12, color: cb.color, fontWeight: 600 }}>{cb.label}</div>
                    {d.so_ky_lien_tiep_canh_bao > 0 && (
                      <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>⚠️ {d.so_ky_lien_tiep_canh_bao} kỳ liên tiếp</div>
                    )}
                    {d.muc_canh_bao === 'DO' && (
                      <div style={{ marginTop: 10 }}>
                        <Btn small variant="danger" onClick={() => setBienBanModal(d)}>🚨 Lập biên bản</Btn>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          {items.length === 0 && <div style={{ textAlign: 'center', padding: 50, color: '#9ca3af' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
            <div style={{ fontWeight: 600 }}>Chưa có dữ liệu đối soát</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Nhấn "Chạy Đối Soát" để phân tích</div>
          </div>}
        </div>
      )}

      {bienBanModal && (
        <Modal title="🚨 Lập Biên Bản Vi Phạm" onClose={() => setBienBanModal(null)}>
          <div style={{ marginBottom: 16, padding: 12, background: '#fef2f2', borderRadius: 8, fontSize: 13, color: '#991b1b' }}>
            Kiosk: <b>{bienBanModal.kiosk?.ten_kiosk}</b> · Vi phạm đối soát ({Number(bienBanModal.chenh_lech_phan_tram).toFixed(1)}%)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bienBanModal.so_ky_lien_tiep_canh_bao >= 3 && (
              <div style={{ padding: 12, background: '#fee2e2', borderRadius: 8, border: '1px solid #ef4444', color: '#b91c1c', fontWeight: 700, fontSize: 13 }}>
                ⚠️ CẢNH BÁO: Kiosk đã vi phạm {bienBanModal.so_ky_lien_tiep_canh_bao} kỳ liên tiếp. Bắt buộc áp dụng chế tài "Chấm dứt hợp đồng"!
              </div>
            )}
            <Field label="Loại vi phạm">
              <select value={form.loai_vi_pham} onChange={e => setForm(f => ({ ...f, loai_vi_pham: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1.5px solid #e5e7eb' }}>
                <option value="GIAN_LAN_NGUYEN_LIEU">Gian lận nguyên liệu / doanh thu</option>
                <option value="VI_PHAM_TIEU_CHUAN">Vi phạm tiêu chuẩn chất lượng</option>
              </select>
            </Field>
            <Field label="Hình phạt">
              <select value={bienBanModal.so_ky_lien_tiep_canh_bao >= 3 ? 'CHAM_DUT_HOP_DONG' : form.hinh_phat} onChange={e => setForm(f => ({ ...f, hinh_phat: e.target.value }))} disabled={bienBanModal.so_ky_lien_tiep_canh_bao >= 3} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e5e7eb', background: bienBanModal.so_ky_lien_tiep_canh_bao >= 3 ? '#f3f4f6' : '#fff' }}>
                <option value="TIEN_PHAT">Phạt tiền (Tạo công nợ mới)</option>
                <option value="CANH_CAO">Chỉ cảnh cáo</option>
                <option value="CHAM_DUT_HOP_DONG">Chấm dứt hợp đồng (Khóa Kiosk)</option>
              </select>
            </Field>
            {(form.hinh_phat === 'TIEN_PHAT' || bienBanModal.so_ky_lien_tiep_canh_bao >= 3) && (
              <Field label="Số tiền phạt / Bồi thường (VNĐ) - Tùy chọn nếu chấm dứt">
                <Input type="number" value={form.so_tien_phat} onChange={e => setForm(f => ({ ...f, so_tien_phat: e.target.value }))} />
              </Field>
            )}
            <Field label="Lý do chi tiết">
              <textarea value={form.ly_do} onChange={e => setForm(f => ({ ...f, ly_do: e.target.value }))} rows={3} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e5e7eb', resize: 'vertical' }} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="outline" onClick={() => setBienBanModal(null)}>Hủy</Btn>
            <Btn variant="danger" onClick={lapBienBan}>Xác nhận & Ghi phạt</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 7: Lịch Sử Hệ Thống (Audit Log)
// ═══════════════════════════════════════════════════════════════════════════
function AuditLogTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const pageSize = 10

  const load = async () => {
    setLoading(true)
    try { setItems((await apiFetch('/franchise/audit-logs')).data || []) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const totalPages = Math.ceil(items.length / pageSize)
  const currentItems = items.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>📝 Lịch Sử Hệ Thống (Audit Logs)</h3>
        <Btn small variant="outline" onClick={load}>🔄 Làm mới</Btn>
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
          <thead>
            <tr style={{ fontSize: 12, color: '#6b7280', textAlign: 'left' }}>
              <th style={{ padding: '8px 12px', background: '#f9fafb', fontWeight: 600 }}>Thời gian</th>
              <th style={{ padding: '8px 12px', background: '#f9fafb', fontWeight: 600 }}>Hành động</th>
              <th style={{ padding: '8px 12px', background: '#f9fafb', fontWeight: 600 }}>Chi tiết</th>
              <th style={{ padding: '8px 12px', background: '#f9fafb', fontWeight: 600 }}>Admin ID</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.map(d => (
              <tr key={d.id} style={{ background: '#fff', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#6b7280' }}>{new Date(d.thoi_gian).toLocaleString('vi-VN')}</td>
                <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13, color: '#4f46e5' }}>{d.hanh_dong}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: '#374151' }}>{d.chi_tiet}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9ca3af' }}>{d.admin_id ? d.admin_id.slice(0,8) : 'SYSTEM'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
        </>
      )}
      {items.length === 0 && !loading && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Chưa có log.</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: FranchisePanel (ADMIN view)
// ═══════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'ho-so', label: '📋 Hồ Sơ Đăng Ký', component: HoSoDangKyTab },
  { id: 'kiosk', label: '🏪 Quản Lý Kiosk', component: KioskManageTab },
  { id: 'combo', label: '📦 Đơn Mua Combo', component: DonMuaComboTab },
  { id: 'cong-no', label: '💳 Công Nợ', component: CongNoTab },
  { id: 'royalty', label: '📊 Royalty', component: RoyaltyTab },
  { id: 'doi-soat', label: '🔍 Đối Soát', component: DoiSoatTab },
  { id: 'audit-log', label: '📝 Audit Log', component: AuditLogTab },
]

export function FranchisePanel() {
  const [activeTab, setActiveTab] = useState('ho-so')
  const [stats, setStats] = useState(null)

  useEffect(() => {
    apiFetch('/franchise/dashboard/admin').then(res => setStats(res.data)).catch(console.error)
  }, [])

  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component || HoSoDangKyTab

  return (
    <div style={{ padding: '0 0 32px 0' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 16, padding: '20px 24px', marginBottom: 20, color: '#fff' }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>🏪 Quản Lý Nhượng Quyền Kiosk</h2>
        <p style={{ margin: '4px 0 16px', opacity: 0.85, fontSize: 13 }}>Duyệt hồ sơ · Ký hợp đồng · Theo dõi combo · Công nợ · Royalty · Đối soát gian lận</p>
        
        {stats && (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '12px 16px', borderRadius: 10, flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 12, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Kiosk Hoạt động</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{stats.tong_kiosk_hoat_dong}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '12px 16px', borderRadius: 10, flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 12, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Tổng Đơn Combo</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{stats.tong_don_combo}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '12px 16px', borderRadius: 10, flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 12, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Nợ chưa thu</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{fmtMoney(stats.tong_no_chua_thu)}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.15)', padding: '12px 16px', borderRadius: 10, flex: 1, minWidth: 150 }}>
              <div style={{ fontSize: 12, opacity: 0.9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Royalty đã thu</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{fmtMoney(stats.tong_royalty_da_thu)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Tab Nav */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f9fafb', padding: 4, borderRadius: 12, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            flex: '1 1 auto', padding: '8px 14px', border: 'none', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .2s',
            background: activeTab === t.id ? '#fff' : 'transparent',
            color: activeTab === t.id ? '#6366f1' : '#6b7280',
            boxShadow: activeTab === t.id ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <ActiveComponent />
    </div>
  )
}
