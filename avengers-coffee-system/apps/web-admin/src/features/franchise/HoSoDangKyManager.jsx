import { 
  CheckCircle as WorkspaceSymbolCheckCircle, 
  AlertCircle as WorkspaceSymbolAlertCircle, 
  XCircle as WorkspaceSymbolXCircle, 
  MapPin as WorkspaceSymbolMapPin, 
  FileText as WorkspaceSymbolFileText, 
  Sparkles as WorkspaceSymbolSparkles, 
  Calendar as WorkspaceSymbolCalendar, 
  Unlock as WorkspaceSymbolUnlock, 
  AlertTriangle as WorkspaceSymbolAlertTriangle, 
  Package as WorkspaceSymbolPackage,
  Search,
  Filter,
  Copy,
  ExternalLink,
  Eye,
  CreditCard,
  DollarSign,
  Check,
  Store,
  Phone,
  Mail,
  RefreshCw,
  User,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Printer
} from '../../components/console/WorkspaceIcons'
import WorkspaceDialog from '../../components/console/WorkspaceDialog'
import CurrencyInput from '../../components/console/CurrencyInput'
import { getAdminSession } from '../../lib/adminFetch'
import { useState, useEffect, useCallback, useMemo } from 'react'
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

const GOI_INFO = {
  XE_LUU_DONG: { name: 'Mô hình Xe Lưu Động', price: 16500000, deposit: 5000000 },
  KIOSK_CO_DINH: { name: 'Mô hình Kiosk Cố Định', price: 44500000, deposit: 5000000 },
  CONTAINER_CAFE: { name: 'Mô hình Container Cafe', price: 67500000, deposit: 5000000 },
}

const apiFetch = async (path, opts = {}) => {
  const session = (getAdminSession() || {})
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
  const s = map[status] || { label: status, color: '#64748b' }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', fontSize: 12, fontWeight: 500,
      color: s.color, background: '#f8fafc', border: `1px solid ${s.color}33`, borderRadius: 6
    }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: s.color }} />
      {s.label}
    </span>
  )
}

const Btn = ({ children, onClick, variant = 'primary', small, disabled, style: extStyle }) => {
  const styles = {
    primary: { background: 'var(--primary, #0f172a)', color: '#fff' },
    success: { background: '#16a34a', color: '#fff' },
    danger: { background: '#dc2626', color: '#fff' },
    outline: { background: '#fff', color: '#334155', border: '1px solid #cbd5e1' },
    ghost: { background: 'transparent', color: '#64748b' },
  }
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: small ? '5px 12px' : '8px 16px', borderRadius: 8, fontSize: small ? 12 : 13, fontWeight: 500, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'all .15s', display: 'inline-flex', alignItems: 'center', gap: 6, ...styles[variant], ...extStyle
    }}>{children}</button>
  )
}

const Pagination = ({ page, totalPages, setPage }) => {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 16 }}>
      <Btn small variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Trước</Btn>
      <div style={{ fontSize: 13, fontWeight: 500, color: '#475569' }}>Trang {page} / {totalPages}</div>
      <Btn small variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Sau →</Btn>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT: HoSoDangKyManager
// Hỗ trợ 2 chế độ:
// 1. Danh sách đối tác dạng bảng (Table view)
// 2. Trang chi tiết đối tác & Trung tâm thao tác (Detail view)
// ═══════════════════════════════════════════════════════════════════════════
export function HoSoDangKyManager() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPartner, setSelectedPartner] = useState(null) // Nếu khác null: hiển thị trang chi tiết
  
  // Bộ lọc
  const [filterStatus, setFilterStatus] = useState('')
  const [filterGoi, setFilterGoi] = useState('')
  const [filterType, setFilterType] = useState('')
  const [keyword, setKeyword] = useState('')

  // Modals thao tác
  const [yeuCauCocModal, setYeuCauCocModal] = useState(null)
  const [thuCocModal, setThuCocModal] = useState(null)
  const [tuChoiModal, setTuChoiModal] = useState(null)
  const [lyDoTuChoi, setLyDoTuChoi] = useState('')
  const [ghiChuThuCoc, setGhiChuThuCoc] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [msg, setMsg] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 10

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/franchise/ho-so')
      const arr = Array.isArray(data) ? data : []
      setItems(arr)
      // Nếu đang xem chi tiết, cập nhật lại dữ liệu của đối tác đó
      if (selectedPartner) {
        const updated = arr.find(x => x.id === selectedPartner.id)
        if (updated) setSelectedPartner(updated)
      }
    }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }, [selectedPartner?.id])

  useEffect(() => { load() }, [])

  // Lọc dữ liệu thông minh
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (filterStatus && item.trang_thai !== filterStatus) return false
      if (filterGoi && item.goi_kiosk !== filterGoi) return false
      if (filterType === 'KHACH_QUEN' && !item.franchisee_user_id) return false
      if (filterType === 'KHACH_MOI' && item.franchisee_user_id) return false
      
      if (keyword.trim()) {
        const kw = keyword.toLowerCase().trim()
        const text = `${item.ho_ten || ''} ${item.so_dien_thoai || ''} ${item.email || ''} ${item.dia_chi_mat_bang || ''} ${item.thanh_pho || ''}`.toLowerCase()
        if (!text.includes(kw)) return false
      }
      return true
    })
  }, [items, filterStatus, filterGoi, filterType, keyword])

  const totalPages = Math.ceil(filteredItems.length / pageSize)
  const currentItems = filteredItems.slice((page - 1) * pageSize, page * pageSize)

  // Pipeline stats
  const stats = useMemo(() => {
    const tong = items.length
    const cho_xem_xet = items.filter(i => i.trang_thai === 'CHO_XEM_XET').length
    const cho_dat_coc = items.filter(i => i.trang_thai === 'CHO_DAT_COC').length
    const da_duyet = items.filter(i => i.trang_thai === 'DA_DUYET').length
    const tu_choi = items.filter(i => ['TU_CHOI', 'DA_HUY'].includes(i.trang_thai)).length
    return { tong, cho_xem_xet, cho_dat_coc, da_duyet, tu_choi }
  }, [items])

  // Thao tác: Gửi email yêu cầu đặt cọc
  const handleGuiYeuCauCoc = async (hoSoId) => {
    setSubmitting(true)
    try {
      const res = await apiFetch(`/franchise/ho-so/${hoSoId}/yeu-cau-coc`, { method: 'PATCH' })
      setMsg({ type: 'success', text: res.message || 'Đã gửi email yêu cầu đặt cọc kèm link thanh toán cho khách hàng!' })
      setYeuCauCocModal(null)
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  // Thao tác: Xác nhận thu cọc thủ công
  const handleXacNhanThuCoc = async (hoSoId) => {
    setSubmitting(true)
    try {
      const res = await apiFetch(`/franchise/ho-so/${hoSoId}/duyet`, { 
        method: 'PATCH',
        body: JSON.stringify({ ghi_chu: ghiChuThuCoc })
      })
      setMsg({ type: 'success', text: res.message || 'Đã duyệt hồ sơ, ghi nhận cọc 5.000.000đ, tạo Kiosk và cấp tài khoản thành công!' })
      setThuCocModal(null)
      setGhiChuThuCoc('')
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  // Thao tác: Duyệt hồ sơ khách quen
  const handleDuyetNoiBo = async (hoSoId) => {
    if (!confirm('Hồ sơ của đối tác hiện tại (Khách quen). Xác nhận duyệt tạo Kiosk mới ngay?')) return
    try {
      const res = await apiFetch(`/franchise/ho-so/${hoSoId}/duyet-noi-bo`, { method: 'PATCH' })
      setMsg({ type: 'success', text: res.message || 'Đã duyệt hồ sơ mở rộng Kiosk thành công!' })
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    }
  }

  // Thao tác: Từ chối hồ sơ
  const handleTuChoi = async () => {
    if (!lyDoTuChoi.trim()) { alert('Vui lòng nhập lý do từ chối'); return }
    setSubmitting(true)
    try {
      await apiFetch(`/franchise/ho-so/${tuChoiModal.id}/tu-choi`, { 
        method: 'PATCH', 
        body: JSON.stringify({ ly_do: lyDoTuChoi }) 
      })
      setMsg({ type: 'success', text: 'Đã từ chối hồ sơ và gửi email giải trình cho ứng viên.' })
      setTuChoiModal(null)
      setLyDoTuChoi('')
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  const copyPaymentLink = (link) => {
    navigator.clipboard.writeText(link).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    })
  }

  // ═════════════════════════════════════════════════════════════════════════
  // VIEW 2: TRANG CHI TIẾT ĐỐI TÁC NHƯỢNG QUYỀN (Partner Detail View)
  // ═════════════════════════════════════════════════════════════════════════
  if (selectedPartner) {
    const item = selectedPartner
    const goi = GOI_INFO[item.goi_kiosk] || { name: item.goi_kiosk, price: 0, deposit: 5000000 }
    const isKhachQuen = Boolean(item.franchisee_user_id)
    const payLink = `http://localhost:5175/?tab=franchise-deposit&ho_so_id=${item.id}`
    const stt = {
      CHO_XEM_XET: { label: 'Chờ thẩm định', color: '#0284c7' },
      CHO_DAT_COC: { label: 'Chờ đặt cọc (5tr)', color: '#d97706' },
      DA_DUYET: { label: 'Đã cọc & Cấp Kiosk', color: '#16a34a' },
      TU_CHOI: { label: 'Từ chối', color: '#dc2626' },
      DA_HUY: { label: 'Đã hủy', color: '#64748b' }
    }[item.trang_thai] || { label: item.trang_thai, color: '#64748b' }

    return (
      <div style={{ animation: 'fadeIn 0.2s ease-in-out', paddingBottom: 32 }}>
        {/* Navigation bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setSelectedPartner(null)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', fontSize: 13, fontWeight: 500
              }}
            >
              <ArrowLeft size={16} /> Danh sách đối tác
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#0f172a' }}>{item.ho_ten}</h3>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', fontSize: 12, fontWeight: 500,
                  color: stt.color, background: '#f8fafc', border: `1px solid ${stt.color}33`, borderRadius: 99
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: stt.color }} />
                  {stt.label}
                </span>
                {isKhachQuen && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#e0f2fe', color: '#0369a1', fontWeight: 600 }}>
                    Đối tác mở rộng
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                Mã hồ sơ: <b style={{ fontFamily: 'monospace' }}>#{item.id}</b> · Ngày nộp: {fmtDate(item.ngay_tao)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={load}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} /> Làm mới
            </button>
          </div>
        </div>

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}`, color: msg.type === 'success' ? '#166534' : '#991b1b', fontSize: 13, fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'inherit' }}>×</button>
          </div>
        )}

        {/* Bố cục 2 Cột */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          {/* CỘT TRÁI: THÔNG TIN HỒ SƠ & MẶT BẰNG */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Thông tin ứng viên */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={18} color="var(--primary, #0f172a)" /> Thông Tin Ứng Viên / Đối Tác
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Họ và tên:</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{item.ho_ten}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Số điện thoại:</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{item.so_dien_thoai}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Email liên hệ:</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{item.email}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Phân loại đối tác:</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                    {isKhachQuen ? 'Khách quen (Đã có tài khoản)' : 'Ứng viên mới'}
                  </div>
                </div>
              </div>
              {item.ghi_chu && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #f1f5f9', fontSize: 13 }}>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Ghi chú của ứng viên:</div>
                  <div style={{ color: '#334155', marginTop: 4, fontStyle: 'italic' }}>"{item.ghi_chu}"</div>
                </div>
              )}
            </div>

            {/* 2. Thông tin mặt bằng & Kiosk */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <WorkspaceSymbolMapPin size={18} color="var(--primary, #0f172a)" /> Vị Trí Mặt Bằng Đề Xuất
              </h4>
              <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Địa chỉ cụ thể:</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{item.dia_chi_mat_bang}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>Tỉnh / Thành phố:</div>
                    <div style={{ fontWeight: 500, color: '#0f172a', marginTop: 2 }}>{item.thanh_pho}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: 12 }}>Diện tích mặt bằng:</div>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{item.dien_tich_m2} m²</div>
                  </div>
                </div>
                {item.latitude && item.longitude && (
                  <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                    <div style={{ color: '#64748b' }}>Tọa độ GPS thẩm định:</div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#334155', marginTop: 2 }}>
                      Lat: {item.latitude} · Lng: {item.longitude}
                    </div>
                    <div style={{ color: '#16a34a', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={13} /> Đảm bảo khoảng cách an toàn 500m với các Kiosk lân cận
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Gói nhượng quyền */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Store size={18} color="var(--primary, #0f172a)" /> Gói Nhượng Quyền Đăng Ký
              </h4>
              <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>Mô hình:</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{goi.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>Tổng giá trị gói:</span>
                  <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{fmtMoney(goi.price)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b' }}>Tiền cọc giữ chỗ chuẩn:</span>
                  <span style={{ fontWeight: 600, color: '#16a34a' }}>5.000.000đ (Bắt buộc)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px dashed #e2e8f0' }}>
                  <span style={{ color: '#64748b' }}>Số tiền còn lại sau cọc:</span>
                  <span style={{ fontWeight: 600, color: '#dc2626' }}>{fmtMoney(goi.price - 5000000)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: TRUNG TÂM XỬ LÝ NGHIỆP VỤ & THAO TÁC */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Quy trình tiến độ */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                Tiến Trình Kích Hoạt Nhượng Quyền
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { step: 1, title: 'Tiếp nhận hồ sơ đăng ký', desc: 'Hệ thống đã nhận đơn & gửi mail xác nhận', done: true },
                  { step: 2, title: 'Thẩm định mặt bằng & Yêu cầu cọc', desc: 'Kiểm tra GPS, độc quyền 500m & gửi link cọc 5tr', done: item.trang_thai !== 'CHO_XEM_XET' },
                  { step: 3, title: 'Thanh toán đặt cọc (5.000.000đ)', desc: 'VietQR / VNPay / Thu trực tiếp tiền mặt', done: item.trang_thai === 'DA_DUYET' },
                  { step: 4, title: 'Cấp mã Kiosk & Tài khoản đối tác', desc: 'Bàn giao quyền đăng nhập Cổng Quản Trị Kiosk', done: item.trang_thai === 'DA_DUYET' },
                ].map(s => (
                  <div key={s.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: s.done ? '#16a34a' : '#f1f5f9',
                      color: s.done ? '#fff' : '#94a3b8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 600, flexShrink: 0, marginTop: 1
                    }}>
                      {s.done ? <Check size={14} /> : s.step}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: s.done ? '#0f172a' : '#64748b' }}>{s.title}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Khung thao tác hành động nghiệp vụ */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid var(--primary-light, #e2e8f0)', padding: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                Trung Tâm Xử Lý Thao Tác Nghiệp Vụ
              </h4>

              {/* TRƯỜNG HỢP 1: CHỜ XEM XÉT */}
              {item.trang_thai === 'CHO_XEM_XET' && !isKhachQuen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 8, border: '1px solid #bae6fd', color: '#0369a1', fontSize: 13 }}>
                    Hồ sơ đang chờ phê duyệt thẩm định. Nếu mặt bằng đạt tiêu chuẩn, hãy nhấn <b>"Yêu cầu đặt cọc"</b> để hệ thống gửi email kèm link thanh toán trực tuyến 5.000.000đ cho đối tác.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setYeuCauCocModal(item)}
                      style={{
                        padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--primary, #0f172a)',
                        color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <DollarSign size={16} /> Phê Duyệt & Yêu Cầu Đặt Cọc (5tr)
                    </button>
                    <button
                      onClick={() => { setTuChoiModal(item); setLyDoTuChoi(''); }}
                      style={{
                        padding: '10px 16px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff',
                        color: '#dc2626', fontSize: 13, fontWeight: 500, cursor: 'pointer'
                      }}
                    >
                      Từ Chối Hồ Sơ
                    </button>
                  </div>
                </div>
              )}

              {/* TRƯỜNG HỢP 2: KHÁCH QUEN CHỜ DUYỆT */}
              {item.trang_thai === 'CHO_XEM_XET' && isKhachQuen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: '#f0fdf4', padding: 12, borderRadius: 8, border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
                    Đây là đối tác hiện hữu mở rộng điểm bán. Có thể duyệt ngay để kích hoạt Kiosk mới vào tài khoản của đối tác.
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      onClick={() => handleDuyetNoiBo(item.id)}
                      style={{
                        padding: '10px 18px', borderRadius: 8, border: 'none', background: '#16a34a',
                        color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <Check size={16} /> Duyệt Tạo Kiosk Ngay (Bỏ qua cọc)
                    </button>
                    <button
                      onClick={() => { setTuChoiModal(item); setLyDoTuChoi(''); }}
                      style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 13, cursor: 'pointer' }}
                    >
                      Từ Chối
                    </button>
                  </div>
                </div>
              )}

              {/* TRƯỜNG HỢP 3: CHỜ ĐẶT CỌC */}
              {item.trang_thai === 'CHO_DAT_COC' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#fefce8', padding: 12, borderRadius: 8, border: '1px solid #fef08a', color: '#854d0e', fontSize: 13 }}>
                    Đã thẩm định đạt và gửi email yêu cầu cọc. Đang chờ đối tác thanh toán phí đặt cọc <b>5.000.000đ</b>.
                  </div>

                  {/* Link thanh toán cọc */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>
                      Đường dẫn thanh toán cọc trực tuyến của hồ sơ này:
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        readOnly
                        value={payLink}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 12, background: '#f8fafc', outline: 'none' }}
                      />
                      <button
                        onClick={() => copyPaymentLink(payLink)}
                        style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                      >
                        {copySuccess ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                        {copySuccess ? 'Đã chép' : 'Sao chép'}
                      </button>
                      <a
                        href={payLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', color: '#0284c7', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, textDecoration: 'none' }}
                      >
                        <ExternalLink size={14} /> Mở trang
                      </a>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => { setThuCocModal(item); setGhiChuThuCoc(''); }}
                      style={{
                        padding: '10px 18px', borderRadius: 8, border: 'none', background: '#16a34a',
                        color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <Check size={16} /> Xác Nhận Đã Thu Cọc (Thủ công / Tiền mặt)
                    </button>
                    <button
                      onClick={() => setYeuCauCocModal(item)}
                      style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontSize: 13, cursor: 'pointer' }}
                    >
                      Gửi Lại Email
                    </button>
                    <button
                      onClick={() => { setTuChoiModal(item); setLyDoTuChoi('Khách hàng đổi ý / Không hoàn tất cọc'); }}
                      style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', fontSize: 13, cursor: 'pointer' }}
                    >
                      Hủy Hồ Sơ
                    </button>
                  </div>
                </div>
              )}

              {/* TRƯỜNG HỢP 4: ĐÃ DUYỆT (ĐÃ CỌC & CẤP KIOSK) */}
              {item.trang_thai === 'DA_DUYET' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 8, border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <CheckCircle2 size={16} /> Hồ sơ đã duyệt và bàn giao thành công
                    </div>
                    <div>Đã thu tiền cọc 5.000.000đ. Điểm bán Kiosk đã được tạo và kích hoạt tài khoản đối tác thành công.</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <span style={{ color: '#64748b', fontSize: 12 }}>Tài khoản đối tác:</span>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.email}</div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: 12 }}>Trạng thái Kiosk:</span>
                      <div style={{ fontWeight: 600, color: '#16a34a' }}>Đang thiết lập / Hoạt động</div>
                    </div>
                  </div>
                </div>
              )}

              {/* TRƯỜNG HỢP 5: TỪ CHỐI / HỦY */}
              {['TU_CHOI', 'DA_HUY'].includes(item.trang_thai) && (
                <div style={{ background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>Hồ sơ đã {item.trang_thai === 'TU_CHOI' ? 'bị từ chối' : 'bị hủy'}</div>
                  {item.ly_do_tu_choi && <div style={{ marginTop: 4 }}>Lý do: {item.ly_do_tu_choi}</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CÁC MODAL THAO TÁC */}
        {yeuCauCocModal && (
          <WorkspaceDialog title={`Yêu Cầu Đặt Cọc: ${yeuCauCocModal.ho_ten}`} onClose={() => setYeuCauCocModal(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 8, border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
                Hồ sơ đã được thẩm định đạt tiêu chuẩn. Yêu cầu đặt cọc chuẩn là <b>5.000.000đ</b> để giữ chỗ khu vực và kích hoạt hợp đồng nhượng quyền.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Đường dẫn thanh toán cọc trực tuyến:</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    readOnly
                    value={`http://localhost:5175/?tab=franchise-deposit&ho_so_id=${yeuCauCocModal.id}`}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#f8fafc', color: '#0f172a', outline: 'none' }}
                  />
                  <button
                    onClick={() => copyPaymentLink(`http://localhost:5175/?tab=franchise-deposit&ho_so_id=${yeuCauCocModal.id}`)}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500 }}
                  >
                    {copySuccess ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                    {copySuccess ? 'Đã sao chép!' : 'Sao chép'}
                  </button>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <div><b>Gửi tới email:</b> {yeuCauCocModal.email}</div>
                <div style={{ marginTop: 2 }}><b>Số điện thoại:</b> {yeuCauCocModal.so_dien_thoai}</div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <Btn variant="outline" onClick={() => setYeuCauCocModal(null)}>Hủy bỏ</Btn>
                <Btn 
                  variant="primary" 
                  disabled={submitting}
                  onClick={() => handleGuiYeuCauCoc(yeuCauCocModal.id)}
                >
                  <Mail size={14} /> Gửi Email Yêu Cầu Cọc
                </Btn>
              </div>
            </div>
          </WorkspaceDialog>
        )}

        {thuCocModal && (
          <WorkspaceDialog title={`Xác Nhận Nhận Cọc: ${thuCocModal.ho_ten}`} onClose={() => setThuCocModal(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <div>Khách hàng: <b>{thuCocModal.ho_ten}</b> ({thuCocModal.so_dien_thoai})</div>
                <div>Gói Kiosk: <b>{GOI_INFO[thuCocModal.goi_kiosk]?.name || thuCocModal.goi_kiosk}</b></div>
                <div style={{ marginTop: 4, color: '#16a34a', fontWeight: 600 }}>
                  Số tiền cọc xác nhận thu: 5.000.000đ
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Ghi chú chứng từ / Mã giao dịch ngân hàng *</label>
                <textarea
                  value={ghiChuThuCoc}
                  onChange={e => setGhiChuThuCoc(e.target.value)}
                  placeholder="VD: Nhận tiền mặt tại quầy / Chuyển khoản Vietcombank mã GD 83921..."
                  rows={3}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <Btn variant="outline" onClick={() => setThuCocModal(null)}>Hủy bỏ</Btn>
                <Btn 
                  variant="success" 
                  disabled={submitting}
                  onClick={() => handleXacNhanThuCoc(thuCocModal.id)}
                >
                  <Check size={14} /> Xác Nhận Thu Cọc & Kích Hoạt Kiosk
                </Btn>
              </div>
            </div>
          </WorkspaceDialog>
        )}

        {tuChoiModal && (
          <WorkspaceDialog title={`Từ Chối Hồ Sơ: ${tuChoiModal.ho_ten}`} onClose={() => setTuChoiModal(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Lý do từ chối hồ sơ *</label>
                <textarea
                  value={lyDoTuChoi}
                  onChange={e => setLyDoTuChoi(e.target.value)}
                  placeholder="Nhập lý do thẩm định không đạt..."
                  rows={4}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Không đạt khoảng cách an toàn 500m', 'Mặt bằng không phù hợp quy hoạch chuỗi', 'Không liên lạc được sau 3 lần gọi'].map(txt => (
                  <button
                    key={txt}
                    type="button"
                    onClick={() => setLyDoTuChoi(txt)}
                    style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, cursor: 'pointer', color: '#475569' }}
                  >
                    + {txt}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <Btn variant="outline" onClick={() => setTuChoiModal(null)}>Hủy bỏ</Btn>
                <Btn 
                  variant="danger" 
                  disabled={submitting}
                  onClick={handleTuChoi}
                >
                  Xác Nhận Từ Chối
                </Btn>
              </div>
            </div>
          </WorkspaceDialog>
        )}
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════════
  // VIEW 1: DANH SÁCH ĐỐI TÁC DẠNG BẢNG (Table List View)
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* 1. Header & KPI Pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { key: '', label: 'TẤT CẢ HỒ SƠ', val: stats.tong, color: '#0f172a', sub: 'Toàn bộ đơn đăng ký' },
          { key: 'CHO_XEM_XET', label: 'CHỜ THẨM ĐỊNH', val: stats.cho_xem_xet, color: '#0284c7', sub: 'Cần xem xét mặt bằng' },
          { key: 'CHO_DAT_COC', label: 'CHỜ ĐẶT CỌC (5TR)', val: stats.cho_dat_coc, color: '#d97706', sub: 'Đang chờ nộp cọc' },
          { key: 'DA_DUYET', label: 'ĐÃ CỌC & CẤP KIOSK', val: stats.da_duyet, color: '#16a34a', sub: 'Đã kích hoạt điểm bán' },
          { key: 'TU_CHOI', label: 'TỪ CHỐI / HỦY', val: stats.tu_choi, color: '#dc2626', sub: 'Không đạt tiêu chuẩn' },
        ].map(card => {
          const isAct = filterStatus === card.key
          return (
            <div
              key={card.key}
              onClick={() => { setFilterStatus(card.key); setPage(1); }}
              style={{
                background: '#fff', padding: '14px 16px', borderRadius: 10,
                border: isAct ? `1.5px solid ${card.color}` : '1px solid #e2e8f0',
                cursor: 'pointer', transition: 'all .15s', boxShadow: isAct ? '0 2px 6px rgba(0,0,0,0.04)' : 'none'
              }}
            >
              <div style={{ fontSize: 11, color: isAct ? card.color : '#64748b', fontWeight: 600, letterSpacing: 0.3 }}>{card.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: card.color, marginTop: 4 }}>{card.val}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{card.sub}</div>
            </div>
          )
        })}
      </div>

      {/* 2. Thanh tìm kiếm & Bộ lọc - GOM GỌN 1 DÒNG DUY NHẤT */}
      <div 
        className="franchise-toolbar"
        style={{
          background: '#fff', padding: '12px 16px', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 16,
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'
        }}
      >
        {/* Input search */}
        <div className="franchise-search-box" style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Tìm theo họ tên, SĐT, email, mặt bằng..."
            value={keyword}
            onChange={e => { setKeyword(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }}
          />
        </div>

        {/* Lọc Trạng thái */}
        <select 
          className="franchise-filter-select"
          value={filterStatus} 
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 160, maxWidth: 220, flex: '0 0 auto', padding: '7px 32px 7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi trạng thái --</option>
          <option value="CHO_XEM_XET">Chờ thẩm định</option>
          <option value="CHO_DAT_COC">Chờ đặt cọc (5tr)</option>
          <option value="DA_DUYET">Đã cọc & Cấp Kiosk</option>
          <option value="TU_CHOI">Đã từ chối</option>
          <option value="DA_HUY">Đã hủy</option>
        </select>

        {/* Lọc Gói */}
        <select 
          className="franchise-filter-select"
          value={filterGoi} 
          onChange={e => { setFilterGoi(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 160, maxWidth: 220, flex: '0 0 auto', padding: '7px 32px 7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi gói nhượng quyền --</option>
          <option value="XE_LUU_DONG">Xe Lưu Động (16.5tr)</option>
          <option value="KIOSK_CO_DINH">Kiosk Cố Định (44.5tr)</option>
          <option value="CONTAINER_CAFE">Container Cafe (67.5tr)</option>
        </select>

        {/* Lọc Phân loại */}
        <select 
          className="franchise-filter-select"
          value={filterType} 
          onChange={e => { setFilterType(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 160, maxWidth: 220, flex: '0 0 auto', padding: '7px 32px 7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi ứng viên --</option>
          <option value="KHACH_MOI">Ứng viên đăng ký mới</option>
          <option value="KHACH_QUEN">Đối tác mở rộng (Khách quen)</option>
        </select>

        <button
          onClick={load}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', fontWeight: 500, flex: '0 0 auto' }}
        >
          <RefreshCw size={14} /> Làm mới
        </button>
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}`, color: msg.type === 'success' ? '#166534' : '#991b1b', fontSize: 13, fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'inherit' }}>×</button>
        </div>
      )}

      {/* 3. Bảng Dữ Liệu Đối Tác - BẤM VÀO DÒNG ĐỂ XEM CHI TIẾT */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>Đang tải danh sách hồ sơ đối tác...</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div className="console-table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, fontWeight: 600 }}>
                  <th style={{ padding: '12px 14px' }}>Mã HS</th>
                  <th style={{ padding: '12px 14px' }}>Đối tác đăng ký</th>
                  <th style={{ padding: '12px 14px' }}>Mặt bằng & Khu vực</th>
                  <th style={{ padding: '12px 14px' }}>Gói Kiosk & Giá gói</th>
                  <th style={{ padding: '12px 14px' }}>Trạng thái & Tiến độ</th>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Ngày nộp</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map(item => {
                  const goi = GOI_INFO[item.goi_kiosk] || { name: item.goi_kiosk, price: 0, deposit: 5000000 }
                  const isKhachQuen = Boolean(item.franchisee_user_id)
                  
                  return (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedPartner(item)}
                      style={{
                        borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background .15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
                      title="Bấm vào để xem trang chi tiết và xử lý nghiệp vụ đối tác này"
                    >
                      {/* Mã HS */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 12, fontFamily: 'monospace' }}>
                          #{item.id.slice(0, 8).toUpperCase()}
                        </span>
                      </td>

                      {/* Đối tác đăng ký */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{item.ho_ten}</span>
                          {isKhachQuen ? (
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#f1f5f9', color: '#0284c7', fontWeight: 600, border: '1px solid #e0f2fe' }}>
                              Khách quen
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#f8fafc', color: '#64748b', fontWeight: 500, border: '1px solid #e2e8f0' }}>
                              Mới
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {item.so_dien_thoai} · {item.email}
                        </div>
                      </td>

                      {/* Mặt bằng */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 500, color: '#0f172a' }}>{item.dia_chi_mat_bang}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {item.thanh_pho} · DT: <b>{item.dien_tich_m2}m²</b>
                        </div>
                      </td>

                      {/* Gói Kiosk */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{goi.name}</div>
                        <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                          Tổng: <b>{fmtMoney(goi.price)}</b> (Cọc 5tr)
                        </div>
                      </td>

                      {/* Trạng thái */}
                      <td style={{ padding: '12px 14px' }}>
                        <Badge 
                          status={item.trang_thai} 
                          map={{
                            CHO_XEM_XET: { label: 'Chờ thẩm định', color: '#0284c7' },
                            CHO_DAT_COC: { label: 'Chờ đặt cọc (5tr)', color: '#d97706' },
                            DA_DUYET: { label: 'Đã cọc & Cấp Kiosk', color: '#16a34a' },
                            TU_CHOI: { label: 'Từ chối', color: '#dc2626' },
                            DA_HUY: { label: 'Đã hủy', color: '#64748b' }
                          }} 
                        />
                      </td>

                      {/* Ngày nộp */}
                      <td style={{ padding: '12px 14px', fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                        {fmtDate(item.ngay_tao)}
                      </td>

                      {/* Nút hành động */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff',
                          color: '#334155', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4
                        }}>
                          Xem hồ sơ <ArrowRight size={13} />
                        </span>
                      </td>
                    </tr>
                  )
                })}

                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                      Không tìm thấy hồ sơ đối tác nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      )}
    </div>
  )
}
