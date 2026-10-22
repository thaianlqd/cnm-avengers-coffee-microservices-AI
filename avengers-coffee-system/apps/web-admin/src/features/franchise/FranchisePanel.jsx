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
  ShieldCheck,
  CheckCircle2,
  Clock
} from '../../components/console/WorkspaceIcons'
import WorkspaceDialog from '../../components/console/WorkspaceDialog'
import CurrencyInput from '../../components/console/CurrencyInput'
import { getAdminSession } from '../../lib/adminFetch'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { API_BASE_URL } from '../admin-dashboard/constants'
import { DongTienTab } from './DongTienTab'
import { HoSoDangKyManager } from './HoSoDangKyManager'

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

const STATUS_KIOSK = {
  CHO_KY_HOP_DONG: { label: 'Chờ ký HĐ', color: '#f97316', bg: "#f4f5f2" },
  DANG_THIET_LAP: { label: 'Đang thiết lập', color: '#0ea5e9', bg: "#f4f5f2" },
  DANG_HOAT_DONG: { label: 'Đang hoạt động', color: '#2563eb', bg: "#f4f5f2" },
  NGUNG_HOAT_DONG: { label: 'Ngừng hoạt động', color: '#dc2626', bg: "#f4f5f2" },
}
const STATUS_DON = {
  DA_DAT: { label: 'Đã đặt', color: '#f59e0b' },
  DA_GIAO: { label: 'Đã giao', color: '#2563eb' },
  TAM_HOAN: { label: 'Tạm hoãn', color: '#dc2626' },
}
const STATUS_CONG_NO = {
  CON_NO: { label: 'Còn nợ', color: '#f59e0b' },
  DA_THANH_TOAN: { label: 'Đã thanh toán', color: '#2563eb' },
  QUA_HAN: { label: 'Quá hạn', color: '#dc2626' },
}
const STATUS_ROYALTY = {
  CHO_XAC_NHAN: { label: 'Chờ xác nhận', color: '#f59e0b' },
  DA_XAC_NHAN: { label: 'Đã xác nhận', color: '#0ea5e9' },
  DA_THANH_TOAN: { label: 'Đã thanh toán', color: '#2563eb' },
}
const CANH_BAO = {
  XANH: { label: 'An toàn', emoji: <WorkspaceSymbolCheckCircle size="1em" aria-hidden="true" />, color: '#2563eb', bg: "#f4f5f2" },
  VANG: { label: 'Cần chú ý', emoji: <WorkspaceSymbolAlertCircle size="1em" aria-hidden="true" />, color: '#d97706', bg: "#f4f5f2" },
  DO: { label: 'Rủi ro cao', emoji: <WorkspaceSymbolXCircle size="1em" aria-hidden="true" />, color: '#dc2626', bg: "#f4f5f2" },
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

const getComboDesc = (price) => {
  const p = Number(price);
  if (p === 3500000) return 'Sữa Tươi 200 hộp, Sữa Đặc 100 hộp, Trân Châu HK 100 gói, Sương Sáo 100 gói. (Khoảng 120 ly)';
  if (p === 5500000) return 'Sữa Tươi 300 hộp, Sữa Đặc 100 hộp, Yến Mạch 100 hộp, Đào Miếng 100 hộp, Trân Châu Trắng 200 gói. (Khoảng 200 ly)';
  if (p === 7500000) return 'Yến Mạch 300 hộp, Macchiato 150 hộp, Trà Lài 150 hộp, Bột Dừa 100 hộp, Atiso Đỏ 200 gói. (Khoảng 280 ly)';
  return '';
}

// ─── Badge Component ───────────────────────────────────────────────────────
const Badge = ({ status, map }) => {
  const s = map[status] || { label: status, color: '#64748b', bg: '#f1f5f9' }
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

// ─── Modal Component ───────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }) => (
  <WorkspaceDialog title={title} onClose={onClose} className="workspace-franchise-dialog">
    <div className="workspace-dialog-content">{children}</div>
  </WorkspaceDialog>
)

// ─── InputField ───────────────────────────────────────────────────────────
const Field = ({ label, children }) => (
  <div style={{ marginBottom: 14 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>{label}</label>
    {children}
  </div>
)
const Input = (props) => (
  <input {...props} style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', ...props.style }} />
)
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
// TAB 1: Hồ Sơ Đối Tác Đăng Ký Nhượng Quyền (Thiết kế lại hoàn chỉnh)
// ═══════════════════════════════════════════════════════════════════════════
function HoSoDangKyTab() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterGoi, setFilterGoi] = useState('')
  const [filterType, setFilterType] = useState('')
  const [keyword, setKeyword] = useState('')
  
  // Modals
  const [detailModal, setDetailModal] = useState(null)
  const [yeuCauCocModal, setYeuCauCocModal] = useState(null)
  const [thuCocModal, setThuCocModal] = useState(null)
  const [tuChoiModal, setTuChoiModal] = useState(null)
  const [lyDoTuChoi, setLyDoTuChoi] = useState('')
  const [ghiChuThuCoc, setGhiChuThuCoc] = useState('')
  const [copySuccess, setCopySuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [msg, setMsg] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 8

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/franchise/ho-so')
      setItems(Array.isArray(data) ? data : [])
    }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

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

  // Action: Gửi email yêu cầu đặt cọc
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

  // Action: Xác nhận thu cọc thủ công (Tiền mặt/Chuyển khoản trực tiếp)
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

  // Action: Duyệt hồ sơ khách quen (Mở rộng nội bộ)
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

  // Action: Từ chối hồ sơ
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

  return (
    <div style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* 1. Pipeline KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div 
          onClick={() => { setFilterStatus(''); setPage(1); }}
          style={{ background: '#fff', padding: '14px 18px', borderRadius: 10, border: !filterStatus ? '1.5px solid var(--primary, #0f172a)' : '1px solid #e2e8f0', cursor: 'pointer', transition: 'all .15s' }}
        >
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Tất Cả Hồ Sơ</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#0f172a', marginTop: 4 }}>{stats.tong}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Toàn bộ đơn đăng ký</div>
        </div>

        <div 
          onClick={() => { setFilterStatus('CHO_XEM_XET'); setPage(1); }}
          style={{ background: '#fff', padding: '14px 18px', borderRadius: 10, border: filterStatus === 'CHO_XEM_XET' ? '1.5px solid #0284c7' : '1px solid #e2e8f0', cursor: 'pointer', transition: 'all .15s' }}
        >
          <div style={{ fontSize: 11, color: '#0284c7', fontWeight: 600, textTransform: 'uppercase' }}>Chờ Thẩm Định</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#0284c7', marginTop: 4 }}>{stats.cho_xem_xet}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Cần xem xét mặt bằng</div>
        </div>

        <div 
          onClick={() => { setFilterStatus('CHO_DAT_COC'); setPage(1); }}
          style={{ background: '#fff', padding: '14px 18px', borderRadius: 10, border: filterStatus === 'CHO_DAT_COC' ? '1.5px solid #d97706' : '1px solid #e2e8f0', cursor: 'pointer', transition: 'all .15s' }}
        >
          <div style={{ fontSize: 11, color: '#d97706', fontWeight: 600, textTransform: 'uppercase' }}>Chờ Đặt Cọc (5tr)</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#d97706', marginTop: 4 }}>{stats.cho_dat_coc}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Đang chờ đối tác thanh toán</div>
        </div>

        <div 
          onClick={() => { setFilterStatus('DA_DUYET'); setPage(1); }}
          style={{ background: '#fff', padding: '14px 18px', borderRadius: 10, border: filterStatus === 'DA_DUYET' ? '1.5px solid #16a34a' : '1px solid #e2e8f0', cursor: 'pointer', transition: 'all .15s' }}
        >
          <div style={{ fontSize: 11, color: '#16a34a', fontWeight: 600, textTransform: 'uppercase' }}>Đã Cọc & Cấp Kiosk</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#16a34a', marginTop: 4 }}>{stats.da_duyet}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Đã kích hoạt & bàn giao</div>
        </div>

        <div 
          onClick={() => { setFilterStatus('TU_CHOI'); setPage(1); }}
          style={{ background: '#fff', padding: '14px 18px', borderRadius: 10, border: filterStatus === 'TU_CHOI' ? '1.5px solid #dc2626' : '1px solid #e2e8f0', cursor: 'pointer', transition: 'all .15s' }}
        >
          <div style={{ fontSize: 11, color: '#dc2626', fontWeight: 600, textTransform: 'uppercase' }}>Từ Chối / Hủy</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#dc2626', marginTop: 4 }}>{stats.tu_choi}</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Không đạt tiêu chuẩn</div>
        </div>
      </div>

      {/* 2. Toolbar & Bộ lọc thông minh */}
      <div style={{ background: '#fff', padding: '14px 18px', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Tìm kiếm */}
        <div style={{ position: 'relative', minWidth: 220, flex: '1 1 220px' }}>
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
          value={filterStatus} 
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi trạng thái --</option>
          <option value="CHO_XEM_XET">Chờ xem xét</option>
          <option value="CHO_DAT_COC">Chờ đặt cọc</option>
          <option value="DA_DUYET">Đã duyệt (Đã cọc)</option>
          <option value="TU_CHOI">Đã từ chối</option>
          <option value="DA_HUY">Đã hủy</option>
        </select>

        {/* Lọc Gói Kiosk */}
        <select 
          value={filterGoi} 
          onChange={e => { setFilterGoi(e.target.value); setPage(1); }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi gói nhượng quyền --</option>
          <option value="XE_LUU_DONG">Xe Lưu Động (16.5tr)</option>
          <option value="KIOSK_CO_DINH">Kiosk Cố Định (44.5tr)</option>
          <option value="CONTAINER_CAFE">Container Cafe (67.5tr)</option>
        </select>

        {/* Lọc Phân loại */}
        <select 
          value={filterType} 
          onChange={e => { setFilterType(e.target.value); setPage(1); }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi ứng viên --</option>
          <option value="KHACH_MOI">Ứng viên đăng ký mới</option>
          <option value="KHACH_QUEN">Đối tác mở rộng (Khách quen)</option>
        </select>

        <Btn small variant="outline" onClick={load}><RefreshCw size={14} /> Làm mới</Btn>
      </div>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}`, color: msg.type === 'success' ? '#166534' : '#991b1b', fontSize: 13, fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'inherit' }}>×</button>
        </div>
      )}

      {/* 3. Bảng Dữ Liệu Đối Tác (Data Table) */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>Đang tải danh sách hồ sơ đối tác...</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div className="console-table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, fontWeight: 600 }}>
                  <th style={{ padding: '12px 14px' }}>Mã & Ngày nộp</th>
                  <th style={{ padding: '12px 14px' }}>Đối tác đăng ký</th>
                  <th style={{ padding: '12px 14px' }}>Mặt bằng & Khu vực</th>
                  <th style={{ padding: '12px 14px' }}>Gói Kiosk & Tiền gói</th>
                  <th style={{ padding: '12px 14px' }}>Trạng thái & Tiến độ</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Thao tác nghiệp vụ</th>
                </tr>
              </thead>
              <tbody>
                {currentItems.map(item => {
                  const goi = GOI_INFO[item.goi_kiosk] || { name: item.goi_kiosk, price: 0, deposit: 5000000 }
                  const isKhachQuen = Boolean(item.franchisee_user_id)
                  const payLink = `http://localhost:5175/?tab=franchise-deposit&ho_so_id=${item.id}`
                  
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background .15s' }}>
                      {/* Mã & Ngày nộp */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 12, fontFamily: 'monospace' }}>
                          #{item.id.slice(0, 8).toUpperCase()}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          {fmtDate(item.ngay_tao)}
                        </div>
                      </td>

                      {/* Đối tác đăng ký */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{item.ho_ten}</span>
                          {isKhachQuen ? (
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#f1f5f9', color: '#0284c7', fontWeight: 600, border: '1px solid #e0f2fe' }}>
                              Khách quen
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#f8fafc', color: '#64748b', fontWeight: 500, border: '1px solid #e2e8f0' }}>
                              Ứng viên mới
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#475569', marginTop: 2, display: 'flex', gap: 12 }}>
                          <span>{item.so_dien_thoai}</span>
                          <span>·</span>
                          <span>{item.email}</span>
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
                          Tổng: <b>{fmtMoney(goi.price)}</b> · Cọc: <b style={{ color: '#16a34a' }}>5.000.000đ</b>
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
                        {item.ly_do_tu_choi && (
                          <div style={{ fontSize: 11, color: '#dc2626', marginTop: 3, maxWidth: 160 }} title={item.ly_do_tu_choi}>
                            Lý do: {item.ly_do_tu_choi.slice(0, 30)}...
                          </div>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                          <button
                            onClick={() => setDetailModal(item)}
                            title="Xem chi tiết hồ sơ"
                            style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Eye size={13} /> Chi tiết
                          </button>

                          {/* Khi đang chờ xem xét */}
                          {item.trang_thai === 'CHO_XEM_XET' && !isKhachQuen && (
                            <>
                              <button
                                onClick={() => setYeuCauCocModal(item)}
                                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'var(--primary, #0f172a)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <DollarSign size={13} /> Yêu cầu cọc
                              </button>
                              <button
                                onClick={() => { setTuChoiModal(item); setLyDoTuChoi(''); }}
                                style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                              >
                                Từ chối
                              </button>
                            </>
                          )}

                          {/* Khi là khách quen (mở rộng) */}
                          {item.trang_thai === 'CHO_XEM_XET' && isKhachQuen && (
                            <>
                              <button
                                onClick={() => handleDuyetNoiBo(item.id)}
                                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                              >
                                Duyệt ngay
                              </button>
                              <button
                                onClick={() => { setTuChoiModal(item); setLyDoTuChoi(''); }}
                                style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                              >
                                Từ chối
                              </button>
                            </>
                          )}

                          {/* Khi đang chờ đặt cọc */}
                          {item.trang_thai === 'CHO_DAT_COC' && (
                            <>
                              <button
                                onClick={() => setYeuCauCocModal(item)}
                                title="Xem và sao chép link thanh toán cọc"
                                style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0284c7', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <CreditCard size={13} /> Link cọc
                              </button>
                              <button
                                onClick={() => { setThuCocModal(item); setGhiChuThuCoc(''); }}
                                title="Khách nộp tiền mặt hoặc chuyển khoản trực tiếp"
                                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <Check size={13} /> Thu cọc
                              </button>
                              <button
                                onClick={() => { setTuChoiModal(item); setLyDoTuChoi('Khách hàng đổi ý / Không hoàn tất cọc'); }}
                                style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                              >
                                Hủy
                              </button>
                            </>
                          )}

                          {item.trang_thai === 'DA_DUYET' && (
                            <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <CheckCircle2 size={14} /> Đã cấp quyền
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                      Không tìm thấy hồ sơ nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      )}

      {/* ─── MODAL 1: CHI TIẾT HỒ SƠ THẨM ĐỊNH ─── */}
      {detailModal && (
        <WorkspaceDialog title={`Hồ Sơ Đăng Ký: ${detailModal.ho_ten}`} onClose={() => setDetailModal(null)}>
          <div style={{ display: 'grid', gap: 14, fontSize: 13, color: '#0f172a' }}>
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <span style={{ color: '#64748b', fontSize: 12 }}>Họ và tên:</span>
                <div style={{ fontWeight: 600 }}>{detailModal.ho_ten}</div>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: 12 }}>Số điện thoại:</span>
                <div style={{ fontWeight: 600 }}>{detailModal.so_dien_thoai}</div>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: 12 }}>Email:</span>
                <div style={{ fontWeight: 600 }}>{detailModal.email}</div>
              </div>
              <div>
                <span style={{ color: '#64748b', fontSize: 12 }}>Phân loại:</span>
                <div style={{ fontWeight: 600 }}>{detailModal.franchisee_user_id ? 'Khách quen mở rộng' : 'Ứng viên mới'}</div>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 600, color: '#334155', borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>Thông tin Mặt bằng & Gói nhượng quyền</div>
              <div>
                <span style={{ color: '#64748b', fontSize: 12 }}>Địa chỉ đề xuất:</span>
                <div style={{ fontWeight: 500 }}>{detailModal.dia_chi_mat_bang}, {detailModal.thanh_pho}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: 12 }}>Diện tích:</span>
                  <div style={{ fontWeight: 600 }}>{detailModal.dien_tich_m2} m²</div>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: 12 }}>Gói đăng ký:</span>
                  <div style={{ fontWeight: 600 }}>{GOI_INFO[detailModal.goi_kiosk]?.name || detailModal.goi_kiosk}</div>
                </div>
              </div>
              {detailModal.latitude && detailModal.longitude && (
                <div>
                  <span style={{ color: '#64748b', fontSize: 12 }}>Tọa độ GPS:</span>
                  <div style={{ fontSize: 12, fontFamily: 'monospace' }}>Lat: {detailModal.latitude}, Lng: {detailModal.longitude}</div>
                </div>
              )}
            </div>

            {detailModal.ghi_chu && (
              <div style={{ padding: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <span style={{ color: '#64748b', fontSize: 12 }}>Ghi chú của ứng viên:</span>
                <div style={{ marginTop: 4 }}>{detailModal.ghi_chu}</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <Btn variant="outline" onClick={() => setDetailModal(null)}>Đóng</Btn>
            </div>
          </div>
        </WorkspaceDialog>
      )}

      {/* ─── MODAL 2: YÊU CẦU ĐẶT CỌC & LINK THANH TOÁN ─── */}
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
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                Khách hàng mở link này có thể quét mã VietQR ngân hàng hoặc thanh toán qua VNPay 5.000.000đ.
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

      {/* ─── MODAL 3: XÁC NHẬN THU CỌC THỦ CÔNG (TIỀN MẶT/CK NGOÀI) ─── */}
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

            <div style={{ fontSize: 12, color: '#64748b' }}>
              Hành động này sẽ:
              <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                <li>Ghi nhận bản ghi Phiếu Thu 5.000.000đ vào dòng tiền hệ thống.</li>
                <li>Tạo mã Kiosk mới và cấp tài khoản Cổng Quản Trị Kiosk cho khách hàng.</li>
                <li>Gửi email xác nhận kèm tài khoản đăng nhập.</li>
              </ul>
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

      {/* ─── MODAL 4: TỪ CHỐI HỒ SƠ ─── */}
      {tuChoiModal && (
        <WorkspaceDialog title={`Từ Chối Hồ Sơ: ${tuChoiModal.ho_ten}`} onClose={() => setTuChoiModal(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Lý do từ chối hồ sơ *">
              <textarea
                value={lyDoTuChoi}
                onChange={e => setLyDoTuChoi(e.target.value)}
                placeholder="Nhập lý do thẩm định không đạt (Ví dụ: Trùng vị trí 500m với Kiosk khác, Mặt bằng không đủ diện tích...)"
                rows={4}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </Field>

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
      setMsg({ type: 'success', text: 'Đã tạo hợp đồng thành công! Kiosk đang thiết lập.' })
      setHopDongModal(null); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const khaittruong = async (id) => {
    if (!confirm('Xác nhận kiosk đã khai trương và chính thức hoạt động?')) return
    try {
      await apiFetch(`/franchise/kiosk/${id}/khai-truong`, { method: 'PATCH' })
      setMsg({ type: 'success', text: 'Kiosk đã khai trương!' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const giaHan = async () => {
    if (!form.ngay_het_han_moi) return
    try {
      await apiFetch(`/franchise/kiosk/${giaHanModal.id}/gia-han`, { method: 'POST', body: JSON.stringify({ ngay_het_han_moi: form.ngay_het_han_moi }) })
      setMsg({ type: 'success', text: 'Đã gia hạn hợp đồng.' }); 
      setGiaHanModal(null); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const chamDut = async () => {
    try {
      await apiFetch(`/franchise/kiosk/${chamDutModal.id}/cham-dut`, { method: 'POST' })
      setMsg({ type: 'success', text: 'Đã chấm dứt hợp đồng Kiosk.' }); 
      setChamDutModal(null); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  return (
    <div>
      <div className="franchise-management-toolbar" style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>Quản Lý Kiosk</h3>
        <Btn small variant="outline" onClick={load}>Tải lại</Btn>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? "#f4f5f2" : "#f4f5f2", color: msg.type === 'success' ? '#2563eb' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {currentKiosks.map(k => {
            const st = STATUS_KIOSK[k.trang_thai] || {}
            return (
              <div key={k.id} style={{ background: '#fff', borderRadius: 14, padding: 18, border: `2px solid ${st.color}33`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>{k.ten_kiosk}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', padding: '2px 8px', borderRadius: 99 }}>{k.ma_kiosk}</span>
                      <Badge status={k.trang_thai} map={STATUS_KIOSK} />
                      {k.xep_hang && (
                        <span title={`Điểm đánh giá: ${k.diem_danh_gia}/100\nS: >=90, A: >=70, B: >=50, C: <50`} style={{ fontSize: 13, fontWeight: 600, color: k.xep_hang === 'S' ? '#eab308' : k.xep_hang === 'A' ? '#3b82f6' : k.xep_hang === 'B' ? '#3b82f6' : '#ef4444', background: '#f8f9f6', padding: '2px 8px', borderRadius: 99, border: '1px solid #e2e4df', cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Hạng {k.xep_hang}
                        </span>
                      )}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 13 }}>{k.dia_chi}, {k.thanh_pho}</div>
                    <div style={{ fontSize: 12, color: '#414743', marginTop: 4 }}>
                      Loại: <b>{k.loai_kiosk}</b> · Combo hiện có: <b style={{ color: k.so_combo_hien_tai < 3 ? '#dc2626' : '#2563eb' }}>{k.so_combo_hien_tai}</b>
                      {k.so_cong_no_chua_thanh_toan > 0 && <span style={{ color: '#dc2626', marginLeft: 8 }}>{k.so_cong_no_chua_thanh_toan} khoản nợ</span>}
                    </div>
                    {k.hop_dong && (() => {
                      const ngayHetHan = new Date(k.hop_dong.ngay_het_han);
                      const daysLeft = Math.ceil((ngayHetHan.getTime() - Date.now()) / (1000 * 3600 * 24));
                      const isExpiringSoon = daysLeft <= 30 && daysLeft >= 0;
                      const isExpired = daysLeft < 0;
                      return (
                        <div style={{ fontSize: 12, color: '#414743', marginTop: 4 }}>
                          HĐ: Royalty <b>{k.hop_dong.ty_le_royalty_phan_tram}%</b> · Hết hạn: 
                          <span style={{ 
                            marginLeft: 4, padding: '2px 6px', borderRadius: 4, 
                            background: isExpired ? "#f4f5f2" : isExpiringSoon ? "#f4f5f2" : 'transparent',
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
                      <Btn small variant="primary" onClick={() => { setHopDongModal(k); setForm({ ngay_ky: new Date().toISOString().split('T')[0], ngay_het_han: '', ty_le_royalty_phan_tram: 7, so_combo_khoi_diem: 5, file_hop_dong_url: '' }) }}><WorkspaceSymbolFileText size="1.1em" aria-hidden="true" /> Ký hợp đồng</Btn>
                    )}
                    {k.trang_thai === 'DANG_THIET_LAP' && (
                      <Btn small variant="success" onClick={() => khaittruong(k.id)}><WorkspaceSymbolSparkles size="1.1em" aria-hidden="true" /> Xác nhận khai trương</Btn>
                    )}
                    {(k.trang_thai === 'DANG_HOAT_DONG' || k.trang_thai === 'TAM_DUNG') && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Btn small variant="outline" onClick={() => {
                          setGiaHanModal(k);
                          setForm(f => ({ ...f, ngay_het_han_moi: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0] }));
                        }}><WorkspaceSymbolCalendar size="1.1em" aria-hidden="true" /> Gia hạn HĐ</Btn>
                        <Btn small variant="danger" onClick={() => setChamDutModal(k)}><WorkspaceSymbolXCircle size="1.1em" aria-hidden="true" /> Chấm dứt</Btn>
                      </div>
                    )}
                    {k.trang_thai === 'NGUNG_HOAT_DONG' && (
                      <Btn small variant="success" onClick={async () => {
                        if(!confirm('Mở khóa Kiosk cho phép hoạt động lại?')) return;
                        try {
                          await apiFetch(`/franchise/kiosk/${k.id}/trang-thai`, { method: 'PATCH', body: JSON.stringify({ trang_thai: 'DANG_HOAT_DONG' }) });
                          load();
                        } catch(e) { alert(e.message); }
                      }}><WorkspaceSymbolUnlock size="1.1em" aria-hidden="true" /> Mở khóa Kiosk</Btn>
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
        <Modal title={` Ký hợp đồng — ${hopDongModal.ten_kiosk}`} onClose={() => setHopDongModal(null)}>
          <div style={{ marginBottom: 16, padding: 12, background: "#f4f5f2", borderRadius: 8, fontSize: 13, color: '#0369a1' }}>
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
          <div style={{ marginTop: 8, padding: 10, background: "#f4f5f2", borderRadius: 8, fontSize: 12, color: '#713f12' }}>
            ℹ️ Hệ thống sẽ tự động cấp {form.so_combo_khoi_diem} combo khởi điểm và chuyển kiosk sang trạng thái "Đang thiết lập".
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn variant="outline" onClick={() => setHopDongModal(null)}>Hủy</Btn>
            <Btn variant="success" onClick={taoHopDong}><WorkspaceSymbolCheckCircle size="1.1em" aria-hidden="true" /> Xác nhận ký hợp đồng</Btn>
          </div>
        </Modal>
      )}

      {giaHanModal && (
        <Modal title={` Gia hạn hợp đồng — ${giaHanModal.ten_kiosk}`} onClose={() => setGiaHanModal(null)}>
          <div style={{ marginBottom: 16, padding: 12, background: "#f4f5f2", border: '1px solid #fef08a', borderRadius: 8, fontSize: 13, color: '#854d0e' }}>
            Ngày hết hạn cũ: <b>{giaHanModal.hop_dong?.ngay_het_han ? fmtDate(giaHanModal.hop_dong.ngay_het_han) : 'Không rõ'}</b>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Field label="Ngày hết hạn mới (Mặc định +1 năm)">
              <Input type="date" value={form.ngay_het_han_moi} onChange={e => setForm(f => ({ ...f, ngay_het_han_moi: e.target.value }))} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Btn variant="outline" onClick={() => setGiaHanModal(null)}>Hủy</Btn>
            <Btn variant="success" onClick={giaHan}><WorkspaceSymbolCheckCircle size="1.1em" aria-hidden="true" /> Xác nhận Gia hạn</Btn>
          </div>
        </Modal>
      )}

      {chamDutModal && (
        <Modal title={` Xác nhận Chấm dứt Hợp đồng`} onClose={() => setChamDutModal(null)}>
          <div style={{ padding: 16, background: "#f4f5f2", border: '1px solid #fca5a5', borderRadius: 8, color: '#991b1b', marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 16 }}><WorkspaceSymbolAlertTriangle size="1.1em" aria-hidden="true" /> NGUY HIỂM</h4>
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
      setMsg({ type: 'success', text: 'Đã xác nhận giao combo.' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const tamHoan = async (id) => {
    const ghi_chu = prompt('Lý do tạm hoãn:')
    if (!ghi_chu) return
    try {
      await apiFetch(`/franchise/don-mua-combo/${id}/tam-hoan`, { method: 'PATCH', body: JSON.stringify({ ghi_chu }) })
      setMsg({ type: 'success', text: 'Đã tạm hoãn đơn.' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  return (
    <div>
      <div className="franchise-management-toolbar franchise-management-filters" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>Đơn Mua Combo Nguyên Liệu</h3>
        {['', 'DA_DAT', 'DA_GIAO', 'TAM_HOAN'].map(s => (
          <Btn key={s} small variant={filter === s ? 'primary' : 'outline'} onClick={() => setFilter(s)}>
            {s === '' ? 'Tất cả' : STATUS_DON[s]?.label}
          </Btn>
        ))}
        <Btn small variant="outline" onClick={load}>Tải lại</Btn>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? "#f4f5f2" : "#f4f5f2", color: msg.type === 'success' ? '#2563eb' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

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
                  <td style={{ padding: '10px 12px', fontSize: 13 }}>
                    <div style={{ fontWeight: 600, color: 'var(--primary)' }}>{d.combo?.ten_combo || '—'}</div>
                    {getComboDesc(d.combo?.gia_ban || d.don_gia) && (
                      <div style={{ fontSize: 11, color: '#1d4ed8', marginTop: 4, fontStyle: 'italic', maxWidth: 280 }}>
                        {getComboDesc(d.combo?.gia_ban || d.don_gia)}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>×{d.so_luong}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--primary)' }}>{fmtMoney(d.tong_tien)}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>{d.phuong_thuc_thanh_toan === 'CONG_NO' ? "Công nợ" : d.phuong_thuc_thanh_toan}</td>
                  <td style={{ padding: '10px 12px' }}><Badge status={d.trang_thai} map={STATUS_DON} /></td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#6b7280' }}>{fmtDate(d.ngay_dat)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    {d.trang_thai === 'DA_DAT' && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Btn small variant="success" onClick={() => giaoDon(d.id)}>Giao</Btn>
                        <Btn small variant="danger" onClick={() => tamHoan(d.id)}>Hoãn</Btn>
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
  const [filterLoai, setFilterLoai] = useState('')
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
      setMsg({ type: 'success', text: 'Đã xác nhận thanh toán công nợ.' }); load()
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
      setMsg({ type: 'success', text: 'Đã tua nhanh thời gian (8 ngày).' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const tongChuaThanhToan = items.filter(i => i.trang_thai !== 'DA_THANH_TOAN').reduce((s, i) => s + Number(i.so_tien), 0)
  const soQuaHan = items.filter(i => i.trang_thai === 'QUA_HAN').length

  const displayItems = currentItems.filter(i => filterLoai === '' ? true : i.loai_phat_sinh === filterLoai)
  const displayTotalPages = Math.ceil(items.filter(i => filterLoai === '' ? true : i.loai_phat_sinh === filterLoai).length / pageSize)

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="workspace-financial-summary" style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: "linear-gradient(135deg,#f4f5f2,#fde68a)", border: '1px solid #f59e0b' }}>
          <div style={{ fontSize: 12, color: '#92400e', fontWeight: 600 }}>Tổng chưa thanh toán</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#d97706' }}>{fmtMoney(tongChuaThanhToan)}</div>
        </div>
        {soQuaHan > 0 && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: "#f4f5f2", border: '1px solid #dc2626' }}>
            <div style={{ fontSize: 12, color: '#991b1b', fontWeight: 600 }}>Quá hạn</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#dc2626' }}>{soQuaHan} khoản</div>
          </div>
        )}
      </div>

      <div className="franchise-management-toolbar franchise-management-filters" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>Theo Dõi Công Nợ</h3>
        <select value={filterLoai} onChange={e => { setFilterLoai(e.target.value); setPage(1); }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccd3c7', fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
          <option value="">Tất cả loại công nợ</option>
          <option value="KHOI_TAO">Phí nhượng quyền ban đầu</option>
          <option value="NGUYEN_LIEU">Đặt mua combo nguyên liệu</option>
          <option value="ROYALTY">Phí Royalty</option>
        </select>
        {['', 'CON_NO', 'QUA_HAN', 'DA_THANH_TOAN'].map(s => (
          <Btn key={s} small variant={filter === s ? 'primary' : 'outline'} onClick={() => setFilter(s)}>
            {s === '' ? 'Tất cả trạng thái' : STATUS_CONG_NO[s]?.label}
          </Btn>
        ))}
        <Btn small variant="outline" onClick={load}>Tải lại</Btn>
        <Btn small variant="outline" onClick={async () => {
          if(!confirm('Chạy quét nợ hệ thống ngay bây giờ?')) return;
          try {
            const res = await apiFetch('/franchise/cron/xu-ly-no-qua-han', { method: 'POST' });
            setMsg({ type: 'success', text: res.message });
            load();
          } catch(e) {
            setMsg({ type: 'error', text: e.message });
          }
        }}>Chạy Quét Nợ</Btn>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? "#f4f5f2" : "#f4f5f2", color: msg.type === 'success' ? '#2563eb' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {displayItems.map(c => (
            <div key={c.id} style={{ background: '#fff', borderRadius: 10, padding: 16, border: `1.5px solid ${c.trang_thai === 'QUA_HAN' ? '#fca5a5' : '#e5e7eb'}`, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.kiosk?.ten_kiosk} <span style={{fontSize: 12, color: '#9ca3af', fontWeight: 500}}>({c.kiosk?.ma_kiosk})</span></div>
                <div style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600, marginTop: 4 }}>{c.loai_phat_sinh === 'KHOI_TAO' ? 'Phí nhượng quyền ban đầu' : c.loai_phat_sinh === 'NGUYEN_LIEU' ? 'Công nợ đặt mua combo nguyên liệu' : 'Phí royalty'}</div>
                {c.loai_phat_sinh === 'NGUYEN_LIEU' && getComboDesc(c.so_tien) && (
                  <div style={{ fontSize: 12, color: '#1d4ed8', marginTop: 2, fontStyle: 'italic', maxWidth: 400 }}><WorkspaceSymbolPackage size="1.1em" aria-hidden="true" /> Chi tiết: {getComboDesc(c.so_tien)}</div>
                )}
                <div style={{ fontSize: 12, color: '#414743', marginTop: 6 }}>Hạn: {fmtDate(c.han_thanh_toan)}</div>
                {c.ghi_chu && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Ghi chú: {c.ghi_chu}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 600, color: c.trang_thai === 'DA_THANH_TOAN' ? '#2563eb' : '#dc2626' }}>
                  {fmtMoney(Number(c.so_tien) + Number(c.phi_phat_tre_han || 0))}
                </div>
                {Number(c.phi_phat_tre_han) > 0 && <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 4 }}>(Gốc: {fmtMoney(c.so_tien)} + Phạt: {fmtMoney(c.phi_phat_tre_han)})</div>}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                  <Badge status={c.trang_thai} map={STATUS_CONG_NO} />
                  {c.so_lan_nhac_nho > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#b91c1c', background: "#f4f5f2", padding: '2px 6px', borderRadius: 6 }}>
                      Nhắc nợ: {c.so_lan_nhac_nho}/3
                    </span>
                  )}
                </div>
                {c.trang_thai !== 'DA_THANH_TOAN' ? (
                  <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Btn small variant="outline" onClick={() => tuaNhanh(c.id)}>+8 ngày</Btn>
                    <Btn small variant="success" onClick={() => xacNhan(c.id)}>Đã thu</Btn>
                  </div>
                ) : (
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <Btn small variant="outline" onClick={() => setInvoiceModal(c)}>In Hóa Đơn VAT</Btn>
                  </div>
                )}
              </div>
            </div>
          ))}
          <Pagination page={page} totalPages={displayTotalPages} setPage={setPage} />
          {displayItems.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Không có khoản công nợ nào thỏa mãn bộ lọc.</div>}
        </div>
      )}

      {invoiceModal && (
        <Modal title="HÓA ĐƠN GIÁ TRỊ GIA TĂNG (Bản Thể Hiện)" onClose={() => setInvoiceModal(null)}>
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
      setMsg({ type: 'success', text: `${res.message}` }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setTinhingLoading(false) }
  }

  const xacNhan = async (id) => {
    const ghi_chu = prompt('Ghi chú điều chỉnh (nếu có):') || ''
    try {
      await apiFetch(`/franchise/royalty/${id}/xac-nhan`, { method: 'PATCH', body: JSON.stringify({ ghi_chu }) })
      setMsg({ type: 'success', text: 'Đã xác nhận bảng kê royalty.' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const ghiNhanThanhToan = async (id) => {
    if (!confirm('Xác nhận đã nhận được tiền royalty?')) return
    try {
      await apiFetch(`/franchise/royalty/${id}/thanh-toan`, { method: 'PATCH' })
      setMsg({ type: 'success', text: 'Đã ghi nhận thanh toán royalty.' }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const tongRoyaltyThu = items.filter(i => i.trang_thai === 'DA_THANH_TOAN').reduce((s, i) => s + Number(i.so_tien_royalty), 0)
  const tongRoyaltyChoThu = items.filter(i => i.trang_thai !== 'DA_THANH_TOAN').reduce((s, i) => s + Number(i.so_tien_royalty), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ padding: '12px 16px', borderRadius: 10, background: "linear-gradient(135deg,#f4f5f2,#f4f5f2)", border: '1px solid #2563eb' }}>
          <div style={{ fontSize: 12, color: '#1e3a8a', fontWeight: 600 }}>Đã thu được</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#2563eb' }}>{fmtMoney(tongRoyaltyThu)}</div>
        </div>
        <div className="workspace-financial-summary" style={{ padding: '12px 16px', borderRadius: 10, background: "linear-gradient(135deg,#f4f5f2,#fde68a)", border: '1px solid #f59e0b' }}>
          <div style={{ fontSize: 12, color: '#78350f', fontWeight: 600 }}>Chờ thu</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: '#d97706' }}>{fmtMoney(tongRoyaltyChoThu)}</div>
        </div>
      </div>

      <div className="franchise-management-toolbar franchise-management-filters" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>Royalty Hàng Tháng</h3>
        {['', 'CHO_XAC_NHAN', 'DA_XAC_NHAN', 'DA_THANH_TOAN'].map(s => (
          <Btn key={s} small variant={filter === s ? 'primary' : 'outline'} onClick={() => setFilter(s)}>
            {s === '' ? 'Tất cả' : STATUS_ROYALTY[s]?.label}
          </Btn>
        ))}
        <Btn small variant="success" onClick={tinhRoyalty} disabled={tinhingLoading}>{tinhingLoading ? 'Đang tính...' : 'Tính Royalty Tháng Trước'}</Btn>
        <Btn small variant="outline" onClick={load}>Tải lại</Btn>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? "#f4f5f2" : "#f4f5f2", color: msg.type === 'success' ? '#2563eb' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {currentItems.map(r => (
            <div key={r.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: '1.5px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.kiosk?.ten_kiosk} <span style={{fontSize: 12, color: '#9ca3af', fontWeight: 500}}>({r.kiosk?.ma_kiosk})</span> <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>·</span> <span style={{ fontSize: 13, color: 'var(--primary)' }}>Tháng {r.thang}</span></div>
                <div style={{ fontSize: 12, color: '#414743', marginTop: 2 }}>
                  Doanh thu: <b>{fmtMoney(r.doanh_thu_thuc_te)}</b> × {r.ty_le_royalty}% = <b style={{ color: 'var(--primary)' }}>{fmtMoney(r.so_tien_royalty)}</b>
                </div>
                {r.ghi_chu_ke_toan && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Ghi chú: {r.ghi_chu_ke_toan}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <Badge status={r.trang_thai} map={STATUS_ROYALTY} />
                {r.trang_thai === 'CHO_XAC_NHAN' && <Btn small variant="primary" onClick={() => xacNhan(r.id)}>Xác nhận</Btn>}
                {r.trang_thai === 'DA_XAC_NHAN' && <Btn small variant="success" onClick={() => ghiNhanThanhToan(r.id)}>Đã thu tiền</Btn>}
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
      setMsg({ type: 'success', text: `${res.message}` }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setRunning(false) }
  }

  const lapBienBan = async () => {
    try {
      // Ép kiểu hinh_phat nếu vi phạm quá 3 lần
      const hinhPhatFinal = bienBanModal.so_ky_lien_tiep_canh_bao >= 3 ? 'CHAM_DUT_HOP_DONG' : form.hinh_phat;
      
      await apiFetch(`/franchise/doi-soat/${bienBanModal.kiosk_id}/lap-bien-ban`, { method: 'POST', body: JSON.stringify({ ...form, hinh_phat: hinhPhatFinal }) })
      setMsg({ type: 'success', text: 'Đã lập biên bản vi phạm.' }); setBienBanModal(null); load()
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
                <div style={{ fontSize: 20, fontWeight: 600, color: cb.color }}>{n}</div>
                <div style={{ fontSize: 11, color: cb.color, fontWeight: 600 }}>{cb.label}</div>
              </div>
            ) : null
          })}
        </div>
      )}

      <div className="franchise-management-toolbar" style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>Đối Soát Rủi Ro Gian Lận</h3>
        <Btn variant="primary" onClick={chayDoiSoat} disabled={running}>{running ? 'Đang phân tích...' : 'Chạy Đối Soát Tháng Trước'}</Btn>
        <Btn small variant="outline" onClick={load}>Tải lại</Btn>
      </div>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: msg.type === 'success' ? "#f4f5f2" : "#f4f5f2", color: msg.type === 'success' ? '#2563eb' : '#dc2626', fontWeight: 600 }}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button></div>}

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {currentItems.map(d => {
            const cb = CANH_BAO[d.muc_canh_bao] || CANH_BAO.XANH
            return (
              <div key={d.id} style={{ borderRadius: 12, padding: 18, border: `2px solid ${cb.color}44`, background: cb.bg }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {d.kiosk?.ten_kiosk} <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}>· Kỳ {d.ky_doi_soat}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginTop: 10 }}>
                      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>Combo đã mua</div>
                        <div style={{ fontSize: 18, fontWeight: 600, color: '#414743' }}>{d.tong_combo_da_mua}</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>DT kỳ vọng</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#414743' }}>{fmtMoney(d.doanh_thu_ky_vong)}</div>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>DT thực tế</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#414743' }}>{fmtMoney(d.doanh_thu_thuc_te)}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 28, fontWeight: 600, color: cb.color }}>
                      {d.chenh_lech_phan_tram > 0 ? '+' : ''}{Number(d.chenh_lech_phan_tram).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: 12, color: cb.color, fontWeight: 600 }}>{cb.label}</div>
                    {d.so_ky_lien_tiep_canh_bao > 0 && (
                      <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{d.so_ky_lien_tiep_canh_bao} kỳ liên tiếp</div>
                    )}
                    {d.muc_canh_bao === 'DO' && (
                      <div style={{ marginTop: 10 }}>
                        <Btn small variant="danger" onClick={() => setBienBanModal(d)}>Lập biên bản</Btn>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          {items.length === 0 && <div style={{ textAlign: 'center', padding: 50, color: '#9ca3af' }}>
            <div style={{ fontWeight: 600 }}>Chưa có dữ liệu đối soát</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Nhấn "Chạy Đối Soát" để phân tích</div>
          </div>}
        </div>
      )}

      {bienBanModal && (
        <Modal title="Lập Biên Bản Vi Phạm" onClose={() => setBienBanModal(null)}>
          <div style={{ marginBottom: 16, padding: 12, background: "#f4f5f2", borderRadius: 8, fontSize: 13, color: '#991b1b' }}>
            Kiosk: <b>{bienBanModal.kiosk?.ten_kiosk}</b> · Vi phạm đối soát ({Number(bienBanModal.chenh_lech_phan_tram).toFixed(1)}%)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bienBanModal.so_ky_lien_tiep_canh_bao >= 3 && (
              <div style={{ padding: 12, background: "#f4f5f2", borderRadius: 8, border: '1px solid #ef4444', color: '#b91c1c', fontWeight: 700, fontSize: 13 }}>
                CẢNH BÁO: Kiosk đã vi phạm {bienBanModal.so_ky_lien_tiep_canh_bao} kỳ liên tiếp. Bắt buộc áp dụng chế tài "Chấm dứt hợp đồng"!
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
                <CurrencyInput value={form.so_tien_phat} onChange={e => setForm(f => ({ ...f, so_tien_phat: e.target.value }))} placeholder="VD: 5.000.000" style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
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
      <div className="franchise-management-toolbar" style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>Lịch Sử Hệ Thống (Audit Logs)</h3>
        <Btn small variant="outline" onClick={load}>Tải lại</Btn>
      </div>
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>Đang tải...</div> : (
        <>
        <div className="console-table-scroll"><table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px' }}>
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
                <td style={{ padding: '10px 12px', fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>{d.hanh_dong}</td>
                <td style={{ padding: '10px 12px', fontSize: 13, color: '#414743' }}>{d.chi_tiet}</td>
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#9ca3af' }}>{d.admin_id ? d.admin_id.slice(0,8) : 'SYSTEM'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <Pagination page={page} totalPages={totalPages} setPage={setPage} />
        </>
      )}
      {items.length === 0 && !loading && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Chưa có log.</div>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS FOR MODULAR ROUTING
// ═══════════════════════════════════════════════════════════════════════════
export {
  HoSoDangKyManager,
  KioskManageTab,
  DonMuaComboTab,
  CongNoTab,
  RoyaltyTab,
  DoiSoatTab,
  AuditLogTab,
  DongTienTab,
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: FranchisePanel (Standalone / Multi-tab view)
// ═══════════════════════════════════════════════════════════════════════════
const TABS = [
  { id: 'ho-so', label: 'Đối Tác & Hồ Sơ', component: HoSoDangKyManager },
  { id: 'kiosk', label: 'Mạng Lưới Kiosk', component: KioskManageTab },
  { id: 'giao-dich', label: 'Giao Dịch Tài Chính', component: DongTienTab },
  { id: 'combo', label: 'Đơn Mua Combo', component: DonMuaComboTab },
  { id: 'cong-no', label: 'Công Nợ', component: CongNoTab },
  { id: 'royalty', label: 'Bảng Kê Royalty', component: RoyaltyTab },
  { id: 'doi-soat', label: 'Đối Soát Rủi Ro', component: DoiSoatTab },
  { id: 'audit-log', label: 'Nhật Ký Hệ Thống', component: AuditLogTab },
]

export function FranchisePanel({ defaultTab = 'ho-so' }) {
  const [activeTab, setActiveTab] = useState(defaultTab)

  useEffect(() => {
    if (defaultTab) setActiveTab(defaultTab)
  }, [defaultTab])

  const ActiveComponent = TABS.find(t => t.id === activeTab)?.component || HoSoDangKyManager

  return (
    <div className="franchise-management-page" style={{ padding: '0 0 32px 0' }}>
      {/* Sub-navigation bar tinh tế, nhẹ nhàng */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#f8fafc', padding: '6px', borderRadius: 10, border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const isAct = activeTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                flex: '1 1 auto',
                padding: '7px 14px',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: isAct ? 600 : 500,
                transition: 'all .15s',
                background: isAct ? 'var(--primary, #0f172a)' : 'transparent',
                color: isAct ? '#fff' : '#64748b',
                boxShadow: isAct ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <ActiveComponent />
    </div>
  )
}

