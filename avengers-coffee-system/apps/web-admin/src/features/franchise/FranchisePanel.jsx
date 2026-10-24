import ComboOrderDetail from './ComboOrderDetail'
import { comboIsPaid, comboStatusLabel } from './comboInvoice'
import { franchiseApi as apiFetch } from './franchiseApi'
import { useFranchiseAction } from './franchiseActionContext'
import { FranchiseActionProvider, FranchiseFeedback } from './FranchiseWorkspaceUI'
import { KioskTableLoading } from './KioskShiftPanel'
import StatusBadge from '../../components/console/StatusBadge'
import { Badge as UiBadge } from '../../components/ui/badge'
import { Label } from '../../components/ui/label'
import { Input as UiInput } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { Table } from '../../components/ui/table'
import { Textarea } from '../../components/ui/textarea'
import SearchableSelect from '../../components/console/SearchableSelect'
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
import { useState, useEffect, useCallback, useMemo, useId, cloneElement, isValidElement } from 'react'
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
  DA_DAT: { label: 'Chờ chấp nhận', color: '#f59e0b' },
  DA_XAC_NHAN: { label: 'Đã chấp nhận', color: '#0284c7' },
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


// ─── Badge Component ───────────────────────────────────────────────────────
const Badge = ({ status, map }) => {
  const s = map[status] || { label: status, color: '#64748b', bg: '#f1f5f9' }
  return (
    <StatusBadge status={status}>

      {s.label}
    </StatusBadge>
  )
}

// ─── Modal Component ───────────────────────────────────────────────────────
const Modal = ({ title, onClose, children }) => (
  <WorkspaceDialog title={title} onClose={onClose} className="workspace-franchise-dialog">
    <div data-modal-body="true" className="workspace-dialog-content">{children}</div>
  </WorkspaceDialog>
)

// ─── InputField ───────────────────────────────────────────────────────────
const Field = ({ label, children }) => {
  const generatedId=useId()
  const id=children?.props?.id || generatedId
  return <div className="franchise-form-field"><Label htmlFor={id}>{label}</Label>{isValidElement(children) ? cloneElement(children,{id}) : children}</div>
}
const Input = (props) => (
  <UiInput {...props} style={{ width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box', ...props.style }} />
)
const Btn = ({ children, onClick, variant = 'primary', small, disabled, style: extStyle, ...props }) => {
  const styles = {
    primary: { background: 'var(--primary, #0f172a)', color: '#fff' },
    success: { background: '#16a34a', color: '#fff' },
    danger: { background: '#dc2626', color: '#fff' },
    outline: { background: '#fff', color: '#334155', border: '1px solid #cbd5e1' },
    ghost: { background: 'transparent', color: '#64748b' },
  }
  return (
    <Button {...props} variant={variant === 'primary' || variant === 'success' ? 'default' : variant === 'danger' ? 'destructive' : variant} onClick={onClick} disabled={disabled} style={{
      padding: small ? '5px 12px' : '8px 16px', borderRadius: 8, fontSize: small ? 12 : 13, fontWeight: 500, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'all .15s', display: 'inline-flex', alignItems: 'center', gap: 6, ...styles[variant], ...extStyle
    }}>{children}</Button>
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
  const action = useFranchiseAction()
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
    if (!await action.confirm('Hồ sơ của đối tác hiện tại (Khách quen). Xác nhận duyệt tạo Kiosk mới ngay?')) return
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
    if (!lyDoTuChoi.trim()) { setMsg({type:'error',text:'Vui lòng nhập lý do từ chối.'}); return }
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
          <Input
            type="text"
            placeholder="Tìm theo họ tên, SĐT, email, mặt bằng..."
            value={keyword}
            onChange={e => { setKeyword(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', background: '#f8fafc', boxSizing: 'border-box' }}
          />
        </div>

        {/* Lọc Trạng thái */}
        <SearchableSelect
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
        </SearchableSelect>

        {/* Lọc Gói Kiosk */}
        <SearchableSelect
          value={filterGoi}
          onChange={e => { setFilterGoi(e.target.value); setPage(1); }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi gói nhượng quyền --</option>
          <option value="XE_LUU_DONG">Xe Lưu Động (16.5tr)</option>
          <option value="KIOSK_CO_DINH">Kiosk Cố Định (44.5tr)</option>
          <option value="CONTAINER_CAFE">Container Cafe (67.5tr)</option>
        </SearchableSelect>

        {/* Lọc Phân loại */}
        <SearchableSelect
          value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(1); }}
          style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi ứng viên --</option>
          <option value="KHACH_MOI">Ứng viên đăng ký mới</option>
          <option value="KHACH_QUEN">Đối tác mở rộng (Khách quen)</option>
        </SearchableSelect>

        <Btn small variant="outline" onClick={load}><RefreshCw size={14} /> Làm mới</Btn>
      </div>

      <FranchiseFeedback message={msg} onClose={() => setMsg(null)} />

      {/* 3. Bảng Dữ Liệu Đối Tác (Data Table) */}
      {loading ? (
        <KioskTableLoading label="Đang tải dữ liệu" />
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div className="console-table-scroll">
            <Table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
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
                            <UiBadge variant="outline" data-quiet-label="true" style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#f1f5f9', color: '#0284c7', fontWeight: 600, border: '1px solid #e0f2fe' }}>
                              Khách quen
                            </UiBadge>
                          ) : (
                            <UiBadge variant="outline" data-quiet-label="true" style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#f8fafc', color: '#64748b', fontWeight: 500, border: '1px solid #e2e8f0' }}>
                              Ứng viên mới
                            </UiBadge>
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
                          <Button
                            onClick={() => setDetailModal(item)}
                            title="Xem chi tiết hồ sơ"
                            style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12, color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                          >
                            <Eye size={13} /> Chi tiết
                          </Button>

                          {/* Khi đang chờ xem xét */}
                          {item.trang_thai === 'CHO_XEM_XET' && !isKhachQuen && (
                            <>
                              <Button
                                onClick={() => setYeuCauCocModal(item)}
                                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'var(--primary, #0f172a)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <DollarSign size={13} /> Yêu cầu cọc
                              </Button>
                              <Button data-intent="danger"
                                onClick={() => { setTuChoiModal(item); setLyDoTuChoi(''); }}
                                style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                              >
                                Từ chối
                              </Button>
                            </>
                          )}

                          {/* Khi là khách quen (mở rộng) */}
                          {item.trang_thai === 'CHO_XEM_XET' && isKhachQuen && (
                            <>
                              <Button data-intent="success"
                                onClick={() => handleDuyetNoiBo(item.id)}
                                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
                              >
                                Duyệt ngay
                              </Button>
                              <Button data-intent="danger"
                                onClick={() => { setTuChoiModal(item); setLyDoTuChoi(''); }}
                                style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                              >
                                Từ chối
                              </Button>
                            </>
                          )}

                          {/* Khi đang chờ đặt cọc */}
                          {item.trang_thai === 'CHO_DAT_COC' && (
                            <>
                              <Button
                                onClick={() => setYeuCauCocModal(item)}
                                title="Xem và sao chép link thanh toán cọc"
                                style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0284c7', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <CreditCard size={13} /> Link cọc
                              </Button>
                              <Button
                                onClick={() => { setThuCocModal(item); setGhiChuThuCoc(''); }}
                                title="Khách nộp tiền mặt hoặc chuyển khoản trực tiếp"
                                style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              >
                                <Check size={13} /> Thu cọc
                              </Button>
                              <Button data-intent="danger"
                                onClick={() => { setTuChoiModal(item); setLyDoTuChoi('Khách hàng đổi ý / Không hoàn tất cọc'); }}
                                style={{ padding: '5px 9px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}
                              >
                                Hủy
                              </Button>
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
            </Table>
          </div>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      )}

      {/* ─── MODAL 1: CHI TIẾT HỒ SƠ THẨM ĐỊNH ─── */}
      {detailModal && (
        <WorkspaceDialog title={`Hồ Sơ Đăng Ký: ${detailModal.ho_ten}`} onClose={() => setDetailModal(null)}>
          <div style={{ display: 'grid', gap: 14, fontSize: 13, color: '#0f172a' }}>
            <div data-modal-body="true" style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
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

            <div data-modal-body="true" style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', display: 'grid', gap: 8 }}>
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
              <div data-modal-body="true" style={{ padding: 12, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
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
          <div data-modal-body="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 8, border: '1px solid #bbf7d0', color: '#166534', fontSize: 13 }}>
              Hồ sơ đã được thẩm định đạt tiêu chuẩn. Yêu cầu đặt cọc chuẩn là <b>5.000.000đ</b> để giữ chỗ khu vực và kích hoạt hợp đồng nhượng quyền.
            </div>

            <div>
              <Label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Đường dẫn thanh toán cọc trực tuyến:</Label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Input
                  type="text"
                  readOnly
                  value={`http://localhost:5175/?tab=franchise-deposit&ho_so_id=${yeuCauCocModal.id}`}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#f8fafc', color: '#0f172a', outline: 'none' }}
                />
                <Button
                  onClick={() => copyPaymentLink(`http://localhost:5175/?tab=franchise-deposit&ho_so_id=${yeuCauCocModal.id}`)}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500 }}
                >
                  {copySuccess ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                  {copySuccess ? 'Đã sao chép!' : 'Sao chép'}
                </Button>
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
          <div data-modal-body="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
              <div>Khách hàng: <b>{thuCocModal.ho_ten}</b> ({thuCocModal.so_dien_thoai})</div>
              <div>Gói Kiosk: <b>{GOI_INFO[thuCocModal.goi_kiosk]?.name || thuCocModal.goi_kiosk}</b></div>
              <div style={{ marginTop: 4, color: '#16a34a', fontWeight: 600 }}>
                Số tiền cọc xác nhận thu: 5.000.000đ
              </div>
            </div>

            <div>
              <Label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Ghi chú chứng từ / Mã giao dịch ngân hàng *</Label>
              <Textarea
                value={ghiChuThuCoc}
                onChange={e => setGhiChuThuCoc(e.target.value)}
                placeholder="VD: Nhận tiền mặt tại quầy / Chuyển khoản Vietcombank mã GD 83921..."
                rows={3}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ fontSize: 12, color: '#64748b' }}>
              Hành động này sẽ:
              <ul  style={{ margin: '4px 0 0', paddingLeft: 20 }}>
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
          <div data-modal-body="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="Lý do từ chối hồ sơ *">
              <Textarea
                value={lyDoTuChoi}
                onChange={e => setLyDoTuChoi(e.target.value)}
                placeholder="Nhập lý do thẩm định không đạt (Ví dụ: Trùng vị trí 500m với Kiosk khác, Mặt bằng không đủ diện tích...)"
                rows={4}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </Field>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['Không đạt khoảng cách an toàn 500m', 'Mặt bằng không phù hợp quy hoạch chuỗi', 'Không liên lạc được sau 3 lần gọi'].map(txt => (
                <Button
                  key={txt}
                  type="button"
                  onClick={() => setLyDoTuChoi(txt)}
                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 11, cursor: 'pointer', color: '#475569' }}
                >
                  + {txt}
                </Button>
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
  const action = useFranchiseAction()
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
    if (!await action.confirm('Xác nhận kiosk đã khai trương và chính thức hoạt động?')) return
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

      <FranchiseFeedback message={msg} onClose={() => setMsg(null)} />

      {loading ? <KioskTableLoading label="Đang tải dữ liệu" /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {currentKiosks.map(k => {
            const st = STATUS_KIOSK[k.trang_thai] || {}
            return (
              <div key={k.id} style={{ background: '#fff', borderRadius: 14, padding: 18, border: `2px solid ${st.color}33`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 16 }}>{k.ten_kiosk}</span>
                      <UiBadge variant="outline" data-quiet-label="true" style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-light)', padding: '2px 8px', borderRadius: 99 }}>{k.ma_kiosk}</UiBadge>
                      <Badge status={k.trang_thai} map={STATUS_KIOSK} />
                      {k.xep_hang && (
                        <UiBadge variant="outline" data-quiet-label="true" title={`Điểm đánh giá: ${k.diem_danh_gia}/100\nS: >=90, A: >=70, B: >=50, C: <50`} style={{ fontSize: 13, fontWeight: 600, color: k.xep_hang === 'S' ? '#eab308' : k.xep_hang === 'A' ? '#3b82f6' : k.xep_hang === 'B' ? '#3b82f6' : '#ef4444', background: '#f8f9f6', padding: '2px 8px', borderRadius: 99, border: '1px solid #e2e4df', cursor: 'help', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          Hạng {k.xep_hang}
                        </UiBadge>
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
                          HĐ: Chia sẻ doanh thu <b>{k.hop_dong.ty_le_royalty_phan_tram}%</b> · Hết hạn:
                          <UiBadge variant="outline" data-quiet-label="true" style={{
                            marginLeft: 4, padding: '2px 6px', borderRadius: 4,
                            background: isExpired ? "#f4f5f2" : isExpiringSoon ? "#f4f5f2" : 'transparent',
                            color: isExpired ? '#dc2626' : isExpiringSoon ? '#ea580c' : 'inherit',
                            fontWeight: (isExpired || isExpiringSoon) ? 800 : 'normal'
                          }}>
                            {fmtDate(k.hop_dong.ngay_het_han)}
                            {isExpired && ' (Quá hạn)'}
                            {isExpiringSoon && ` (Còn ${daysLeft} ngày)`}
                          </UiBadge>
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
                        if(!await action.confirm('Mở khóa Kiosk cho phép hoạt động lại?')) return;
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
            <Field label="Tỷ lệ chia sẻ doanh thu (%)">
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
  const action = useFranchiseAction()
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[filter,setFilter]=useState(''),[msg,setMsg]=useState(null),[page,setPage]=useState(1),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false)
  const load=useCallback(async()=>{setLoading(true);try{const result=await apiFetch('/franchise/don-mua-combo');setItems(Array.isArray(result)?result:[])}catch(error){setMsg({type:'error',text:error.message})}finally{setLoading(false)}},[])
  useEffect(()=>{load()},[load])
  const filtered=items.filter(order=>!filter || order.trang_thai===filter)
  const shown=filtered.slice((page-1)*8,page*8)
  const selectedOrder=items.find(order=>order.id===selected)
  const changeOrder=async(kind)=>{
    if(busy || !selectedOrder)return
    let ghi_chu=''
    if(kind==='chap-nhan') { if(!await action.confirm('Chấp nhận đơn combo và phát hành hóa đơn cho đối tác?'))return }
    else { ghi_chu=await action.prompt(kind==='giao'?'Ghi chú giao hàng (có thể để trống):':'Lý do tạm hoãn:');if(ghi_chu===null || (kind==='tam-hoan'&&!ghi_chu.trim()))return }
    setBusy(true)
    try{await apiFetch(`/franchise/don-mua-combo/${selectedOrder.id}/${kind}`,{method:'PATCH',body:JSON.stringify({ghi_chu})});setMsg({type:'success',text:kind==='chap-nhan'?'Đã chấp nhận đơn. Hóa đơn đã sẵn sàng.':kind==='giao'?'Đã xác nhận giao combo.':'Đã tạm hoãn đơn.'});await load()}catch(error){setMsg({type:'error',text:error.message})}finally{setBusy(false)}
  }
  return <div><div className="franchise-management-toolbar franchise-management-filters">{['','DA_DAT','DA_XAC_NHAN','DA_GIAO','TAM_HOAN'].map(status=><Btn key={status} small variant={filter===status?'primary':'outline'} aria-pressed={filter===status} onClick={()=>{setFilter(status);setPage(1)}}>{status?comboStatusLabel(status):'Tất cả'}</Btn>)}<Btn variant="outline" small disabled={loading} onClick={load}>Tải lại</Btn></div>
    <FranchiseFeedback message={msg} onClose={()=>setMsg(null)}/>
    {loading?<KioskTableLoading label="Đang tải đơn combo"/>:<div className="franchise-record-table"><Table className="franchise-fit-table combo-list-table"><colgroup><col style={{width:'16%'}}/><col style={{width:'29%'}}/><col style={{width:'19%'}}/><col style={{width:'18%'}}/><col style={{width:'18%'}}/></colgroup><thead><tr><th>Đơn hàng</th><th>Kiosk / Combo</th><th>Tổng tiền</th><th>Thanh toán</th><th>Trạng thái</th></tr></thead><tbody>{shown.map(order=><tr key={order.id} className="franchise-click-row" onClick={()=>setSelected(order.id)}><td><button type="button" className="franchise-detail-link" onClick={event=>{event.stopPropagation();setSelected(order.id)}} aria-label={`Xem đơn ${String(order.id).slice(0,8)}`}><span className="franchise-code">#{String(order.id).slice(0,8).toUpperCase()}</span></button><small>{fmtDate(order.ngay_dat)}</small></td><td><strong>{order.kiosk?.ten_kiosk || order.kiosk?.ma_kiosk || 'Kiosk'}</strong><small>{order.so_luong} × {order.combo?.ten_combo || 'Combo nguyên liệu'}</small></td><td><strong>{fmtMoney(order.tong_tien)}</strong></td><td><StatusBadge tone={comboIsPaid(order)?'success':'warning'}>{comboIsPaid(order)?'Đã thanh toán':'Chưa thanh toán'}</StatusBadge></td><td><Badge status={order.trang_thai} map={STATUS_DON}/></td></tr>)}</tbody></Table>{!shown.length&&<p className="franchise-empty">Chưa có đơn phù hợp.</p>}<Pagination page={page} totalPages={Math.ceil(filtered.length/8)} setPage={setPage}/></div>}
    {selectedOrder&&<ComboOrderDetail order={selectedOrder} onClose={()=>setSelected(null)} busy={busy} onAccept={()=>changeOrder('chap-nhan')} onDeliver={()=>changeOrder('giao')} onPostpone={()=>changeOrder('tam-hoan')}/>}
  </div>
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4: Công Nợ (UC-B04)
// ═══════════════════════════════════════════════════════════════════════════
function CongNoTab() {
  const action = useFranchiseAction()
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
    try { const data=await apiFetch('/franchise/cong-no');setItems((Array.isArray(data)?data:[]).filter(item=>['KHOI_TAO','NGUYEN_LIEU'].includes(item.loai_phat_sinh))) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])


  const xacNhan = async (id) => {
    const ghi_chu = await action.prompt('Ghi chú (số tài khoản, ngày chuyển...):')
    if (ghi_chu === null) return
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

  const tongChuaThanhToan = items.filter(i => i.trang_thai !== 'DA_THANH_TOAN').reduce((s, i) => s + Number(i.so_tien), 0)
  const soQuaHan = items.filter(i => i.trang_thai === 'QUA_HAN').length

  const filteredDebts = items.filter(i => (!filter || i.trang_thai===filter) && (!filterLoai || i.loai_phat_sinh === filterLoai))
  const displayItems = filteredDebts.slice((page - 1) * pageSize, page * pageSize)
  const displayTotalPages = Math.ceil(filteredDebts.length / pageSize)

  return (
    <div>
      <div className="franchise-module-summary"><div><span>Chưa thanh toán</span><strong>{fmtMoney(tongChuaThanhToan)}</strong></div><div><span>Công nợ quá hạn</span><strong>{soQuaHan} khoản</strong></div></div>
      <div className="franchise-management-toolbar franchise-management-filters" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>Theo Dõi Công Nợ</h3>
        <SearchableSelect value={filterLoai} onChange={e => { setFilterLoai(e.target.value); setPage(1); }} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ccd3c7', fontSize: 13, outline: 'none', background: '#fff', cursor: 'pointer' }}>
          <option value="">Tất cả loại công nợ</option>
          <option value="KHOI_TAO">Phí nhượng quyền ban đầu</option>
          <option value="NGUYEN_LIEU">Đặt mua combo nguyên liệu</option>
        </SearchableSelect>
        {['', 'CON_NO', 'QUA_HAN', 'DA_THANH_TOAN'].map(s => (
          <Btn key={s} small aria-pressed={filter === s} data-filter-tone={s==='QUA_HAN'?'destructive':s==='DA_THANH_TOAN'?'success':s==='CON_NO'?'warning':undefined} variant={filter === s ? 'primary' : 'outline'} onClick={() => {setFilter(s);setPage(1)}}>
            {s === '' ? 'Tất cả trạng thái' : STATUS_CONG_NO[s]?.label}
          </Btn>
        ))}
        <Btn small variant="outline" onClick={load}>Tải lại</Btn>
        <Btn small variant="outline" onClick={async () => {
          if(!await action.confirm('Chạy quét nợ hệ thống ngay bây giờ?')) return;
          try {
            const res = await apiFetch('/franchise/cron/xu-ly-no-qua-han', { method: 'POST' });
            setMsg({ type: 'success', text: res.message });
            load();
          } catch(e) {
            setMsg({ type: 'error', text: e.message });
          }
        }}>Chạy Quét Nợ</Btn>
      </div>

      <FranchiseFeedback message={msg} onClose={() => setMsg(null)} />

      {loading ? <KioskTableLoading label="Đang tải dữ liệu" /> : (
        <div className="franchise-record-list">
          {displayItems.map(c => (
            <article key={c.id} className="franchise-record">
              <header><div><h3>{c.loai_phat_sinh === 'KHOI_TAO' ? 'Phí nhượng quyền ban đầu' : c.loai_phat_sinh === 'NGUYEN_LIEU' ? 'Combo nguyên liệu' : 'Chia sẻ doanh thu'}</h3><p>{c.kiosk?.ten_kiosk || 'Kiosk'} · {c.kiosk?.ma_kiosk || '—'} · #{c.id.slice(0,8).toUpperCase()}</p></div><span className="franchise-record-money">{fmtMoney(Number(c.so_tien)+Number(c.phi_phat_tre_han || 0))}</span></header>
              <dl><div><dt>Hạn thanh toán</dt><dd>{fmtDate(c.han_thanh_toan)}</dd></div><div><dt>Tiền gốc</dt><dd>{fmtMoney(c.so_tien)}</dd></div><div><dt>Phí trễ hạn</dt><dd>{fmtMoney(c.phi_phat_tre_han)}</dd></div></dl>
              <footer><Badge status={c.trang_thai} map={STATUS_CONG_NO}/><p>{c.ghi_chu || (c.so_lan_nhac_nho ? `Đã nhắc nợ ${c.so_lan_nhac_nho} lần` : '')}</p><div className="franchise-record-actions">{c.trang_thai !== 'DA_THANH_TOAN' ? <Btn small onClick={()=>xacNhan(c.id)}>Xác nhận đã thu</Btn> : <Btn small variant="outline" onClick={()=>setInvoiceModal(c)}>Xem hóa đơn VAT</Btn>}</div></footer>
            </article>
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
              <div><b>Nội dung xuất:</b> {invoiceModal.loai_phat_sinh === 'KHOI_TAO' ? 'Phí nhượng quyền và setup ban đầu' : "Thanh toán công nợ / Chia sẻ doanh thu"}</div>
              <div><b>Ngày thanh toán:</b> {new Date().toLocaleDateString('vi-VN')}</div>
            </div>

            <Table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', marginBottom: 15 }}>
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
            </Table>

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
  const action = useFranchiseAction()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [tinhingLoading, setTinhingLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [page, setPage] = useState(1)
  const pageSize = 5

  const load = useCallback(async ({quiet=false}={}) => {
    if(!quiet)setLoading(true)
    try { const data=await apiFetch('/franchise/royalty');setItems(Array.isArray(data)?data:[]) }
    catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const refresh=()=>{if(!document.hidden)load({quiet:true})}
    const timer=setInterval(refresh,30000)
    window.addEventListener('focus',refresh)
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)}
  }, [load])

  const filtered=items.filter(item=>!filter || item.trang_thai===filter)
  const totalPages = Math.ceil(filtered.length / pageSize)
  const currentItems = filtered.slice((page - 1) * pageSize, page * pageSize)

  const tinhRoyalty = async () => {
    setTinhingLoading(true)
    try {
      const res = await apiFetch('/franchise/royalty/tinh-thang', { method: 'POST', body: JSON.stringify({}) })
      setMsg({ type: 'success', text: res.message || 'Đã cập nhật số liệu.' }); await load({quiet:true})
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
    finally { setTinhingLoading(false) }
  }

  const xacNhan = async (id) => {
    const ghi_chu = await action.prompt('Ghi chú điều chỉnh (nếu có):')
    if (ghi_chu === null) return
    try {
      await apiFetch(`/franchise/royalty/${id}/xac-nhan`, { method: 'PATCH', body: JSON.stringify({ ghi_chu }) })
      setMsg({ type: 'success', text: "Đã xác nhận bảng kê chia sẻ doanh thu." }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const ghiNhanThanhToan = async (id) => {
    if (!await action.confirm("Xác nhận đã nhận được tiền chia sẻ doanh thu?")) return
    try {
      await apiFetch(`/franchise/royalty/${id}/thanh-toan`, { method: 'PATCH' })
      setMsg({ type: 'success', text: "Đã ghi nhận thanh toán chia sẻ doanh thu." }); load()
    } catch (e) { setMsg({ type: 'error', text: e.message }) }
  }

  const tongRoyaltyThu = items.filter(i => i.trang_thai === 'DA_THANH_TOAN').reduce((s, i) => s + Number(i.so_tien_royalty), 0)
  const tongRoyaltyChoThu = items.filter(i => i.trang_thai !== 'DA_THANH_TOAN').reduce((s, i) => s + Number(i.so_tien_royalty), 0)

  return (
    <div>
      <div className="franchise-module-summary"><div><span>Đã thu</span><strong>{fmtMoney(tongRoyaltyThu)}</strong></div><div><span>Chờ thu</span><strong>{fmtMoney(tongRoyaltyChoThu)}</strong></div></div>
      <div className="franchise-management-toolbar franchise-management-filters" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>Chia sẻ doanh thu hàng tháng</h3>
        {['', 'CHO_XAC_NHAN', 'DA_XAC_NHAN', 'DA_THANH_TOAN'].map(s => (
          <Btn key={s} small aria-pressed={filter === s} data-filter-tone={s==='QUA_HAN'?'destructive':s==='DA_THANH_TOAN'?'success':['CHO_XAC_NHAN','DA_XAC_NHAN'].includes(s)?'warning':undefined} variant={filter === s ? 'primary' : 'outline'} onClick={() => {setFilter(s);setPage(1)}}>
            {s === '' ? 'Tất cả' : STATUS_ROYALTY[s]?.label}
          </Btn>
        ))}
        <Btn small variant="success" onClick={tinhRoyalty} disabled={tinhingLoading}>{tinhingLoading ? 'Đang tính...' : "Tính chia sẻ doanh thu tháng trước"}</Btn>
        <Btn small variant="outline" onClick={load}>Tải lại</Btn>
      </div>

      <FranchiseFeedback message={msg} onClose={() => setMsg(null)} />

      {loading ? <KioskTableLoading label="Đang tải dữ liệu" /> : (
        <div className="franchise-record-list">
          {currentItems.map(r => <article key={r.id} className="franchise-record"><header><div><h3>{r.kiosk?.ten_kiosk || 'Kiosk'}</h3><p>{r.kiosk?.ma_kiosk} · Kỳ tháng {r.thang}</p></div><span className="franchise-record-money">{fmtMoney(r.so_tien_royalty)}</span></header><dl><div><dt>Doanh thu ghi nhận</dt><dd>{fmtMoney(r.doanh_thu_thuc_te)}</dd></div><div><dt>Tỷ lệ theo hợp đồng</dt><dd>{r.ty_le_royalty}%</dd></div><div><dt>Chia sẻ với thương hiệu</dt><dd>{fmtMoney(r.so_tien_royalty)}</dd></div></dl><footer><Badge status={r.trang_thai} map={STATUS_ROYALTY}/><p>{r.ghi_chu_ke_toan}</p><div className="franchise-record-actions">{r.trang_thai === 'CHO_XAC_NHAN' && <Btn small onClick={()=>xacNhan(r.id)}>Xác nhận bảng kê</Btn>}{r.trang_thai === 'DA_XAC_NHAN' && <Btn small onClick={()=>ghiNhanThanhToan(r.id)}>Ghi nhận đã thu</Btn>}</div></footer></article>)}
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Chưa có dữ liệu chia sẻ doanh thu.</div>}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 6: Đối Soát Gian Lận (UC-B06)
// ═══════════════════════════════════════════════════════════════════════════
function DoiSoatTab() {
  const canCreateViolation = String(getAdminSession()?.user?.vaiTro || getAdminSession()?.user?.vai_tro || '').toUpperCase() === 'ADMIN'
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
      setMsg({ type: 'success', text: res.message || 'Đã cập nhật số liệu.' }); load()
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
      <div className="franchise-module-summary franchise-risk-summary">{[{key:'DO',n:soDo},{key:'VANG',n:soVang},{key:'XANH',n:soXanh}].map(({key,n})=><div key={key}><StatusBadge tone={key==='DO'?'destructive':key==='VANG'?'warning':'success'}>{CANH_BAO[key].label}</StatusBadge><strong>{n} kiosk</strong></div>)}</div>
      <div className="franchise-management-toolbar" style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <h3 style={{ margin: 0, flex: 1, fontSize: 17, fontWeight: 700 }}>Đối Soát Rủi Ro Gian Lận</h3>
        <Btn variant="primary" onClick={chayDoiSoat} disabled={running}>{running ? 'Đang phân tích...' : 'Chạy Đối Soát Tháng Trước'}</Btn>
        <Btn small variant="outline" onClick={load}>Tải lại</Btn>
      </div>

      <FranchiseFeedback message={msg} onClose={() => setMsg(null)} />

      {loading ? <KioskTableLoading label="Đang tải dữ liệu" /> : (
        <div className="franchise-record-list">
          {currentItems.map(d => {
            const cb=CANH_BAO[d.muc_canh_bao] || CANH_BAO.XANH
            return <article key={d.id} className="franchise-record"><header><div><h3>{d.kiosk?.ten_kiosk || 'Kiosk'}</h3><p>{d.kiosk?.ma_kiosk} · Kỳ {d.ky_doi_soat}</p></div><StatusBadge tone={d.muc_canh_bao === 'DO' ? 'destructive' : d.muc_canh_bao === 'VANG' ? 'warning' : 'success'}>{cb.label}</StatusBadge></header><dl><div><dt>Combo đã mua</dt><dd>{d.tong_combo_da_mua}</dd></div><div><dt>Doanh thu kỳ vọng</dt><dd>{fmtMoney(d.doanh_thu_ky_vong)}</dd></div><div><dt>Doanh thu thực tế</dt><dd>{fmtMoney(d.doanh_thu_thuc_te)}</dd></div></dl><footer><p>Chênh lệch <strong>{Number(d.chenh_lech_phan_tram).toFixed(1)}%</strong>{d.so_ky_lien_tiep_canh_bao>0 ? ` · Cảnh báo ${d.so_ky_lien_tiep_canh_bao} kỳ liên tiếp` : ''}</p>{d.muc_canh_bao === 'DO' && canCreateViolation && <Btn small variant="danger" onClick={()=>setBienBanModal(d)}>Lập biên bản</Btn>}</footer></article>
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
              <SearchableSelect value={form.loai_vi_pham} onChange={e => setForm(f => ({ ...f, loai_vi_pham: e.target.value }))} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1.5px solid #e5e7eb' }}>
                <option value="GIAN_LAN_NGUYEN_LIEU">Gian lận nguyên liệu / doanh thu</option>
                <option value="VI_PHAM_TIEU_CHUAN">Vi phạm tiêu chuẩn chất lượng</option>
              </SearchableSelect>
            </Field>
            <Field label="Hình phạt">
              <SearchableSelect value={bienBanModal.so_ky_lien_tiep_canh_bao >= 3 ? 'CHAM_DUT_HOP_DONG' : form.hinh_phat} onChange={e => setForm(f => ({ ...f, hinh_phat: e.target.value }))} disabled={bienBanModal.so_ky_lien_tiep_canh_bao >= 3} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e5e7eb', background: bienBanModal.so_ky_lien_tiep_canh_bao >= 3 ? '#f3f4f6' : '#fff' }}>
                <option value="TIEN_PHAT">Phạt tiền (Tạo công nợ mới)</option>
                <option value="CANH_CAO">Chỉ cảnh cáo</option>
                <option value="CHAM_DUT_HOP_DONG">Chấm dứt hợp đồng (Khóa Kiosk)</option>
              </SearchableSelect>
            </Field>
            {(form.hinh_phat === 'TIEN_PHAT' || bienBanModal.so_ky_lien_tiep_canh_bao >= 3) && (
              <Field label="Số tiền phạt / Bồi thường (VNĐ) - Tùy chọn nếu chấm dứt">
                <CurrencyInput value={form.so_tien_phat} onChange={e => setForm(f => ({ ...f, so_tien_phat: e.target.value }))} placeholder="VD: 5.000.000" style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
              </Field>
            )}
            <Field label="Lý do chi tiết">
              <Textarea value={form.ly_do} onChange={e => setForm(f => ({ ...f, ly_do: e.target.value }))} rows={3} style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #e5e7eb', resize: 'vertical' }} />
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
  const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[keyword,setKeyword]=useState(''),[page,setPage]=useState(1)
  const labels={CHAP_NHAN_DON_COMBO:'Chấp nhận đơn combo',YEU_CAU_DAT_COC:'Yêu cầu đặt cọc',DUYET_HO_SO:'Duyệt hồ sơ',DUYET_HO_SO_NOI_BO:'Duyệt mở rộng kiosk',TAT_TOAN_GOI_NHUONG_QUYEN:'Tất toán gói',TU_CHOI_HO_SO:'Từ chối hồ sơ',HUY_HO_SO:'Hủy hồ sơ',TAO_HOP_DONG:'Tạo hợp đồng',KHAI_TRUONG_KIOSK:'Khai trương kiosk',GIAO_DON_COMBO:'Giao combo',TAM_HOAN_DON_COMBO:'Tạm hoãn combo',XAC_NHAN_THANH_TOAN_CONG_NO:'Xác nhận thu công nợ',TINH_ROYALTY_THANG:'Tính chia sẻ doanh thu',HET_HAN_HOP_DONG:'Hết hạn hợp đồng',LAP_BIEN_BAN:'Lập biên bản',GIA_HAN_HOP_DONG:'Gia hạn hợp đồng',CHAM_DUT_HOP_DONG:'Chấm dứt hợp đồng',TAO_NHAN_VIEN_CON:'Tạo nhân viên kiosk',CAP_NHAT_NHAN_VIEN_CON:'Cập nhật nhân viên kiosk',DOI_MAT_KHAU_NHAN_VIEN_CON:'Đổi mật khẩu nhân viên',KHOA_NHAN_VIEN_CON:'Khóa nhân viên kiosk'}
  const load=useCallback(async()=>{setLoading(true);setError('');try{const data=await apiFetch('/franchise/audit-logs');setItems(Array.isArray(data)?data:data.data || [])}catch(error){setError(error.message)}finally{setLoading(false)}},[])
  useEffect(()=>{load()},[load])
  const filtered=items.filter(item=>[labels[item.hanh_dong],item.hanh_dong,item.chi_tiet,item.admin_id].join(' ').toLocaleLowerCase('vi').includes(keyword.toLocaleLowerCase('vi')))
  const shown=filtered.slice((page-1)*10,page*10)
  return <div><div className="franchise-toolbar"><div className="franchise-search-box"><Search size={16}/><Input aria-label="Tìm nhật ký" placeholder="Tìm hành động hoặc nội dung…" value={keyword} onChange={event=>{setKeyword(event.target.value);setPage(1)}}/></div><Btn variant="outline" onClick={load} disabled={loading}><RefreshCw size={15}/>Tải lại</Btn></div>{error && <p className="workspace-form-error" role="alert">{error}</p>}{loading?<KioskTableLoading label="Đang tải nhật ký"/>:<div className="franchise-record-table"><Table className="franchise-fit-table franchise-audit-table"><thead><tr><th>Thời gian</th><th>Hành động</th><th>Nội dung</th><th>Người thực hiện</th></tr></thead><tbody>{shown.map(item=><tr key={item.id}><td>{fmtDate(item.thoi_gian)}</td><td>{labels[item.hanh_dong] || String(item.hanh_dong || '').replaceAll('_',' ')}</td><td>{item.chi_tiet || '—'}</td><td>{item.admin_id ? `#${item.admin_id.slice(0,8).toUpperCase()}` : 'Hệ thống'}</td></tr>)}</tbody></Table>{!shown.length && <p className="franchise-empty">Không có nhật ký phù hợp.</p>}<Pagination page={page} totalPages={Math.ceil(filtered.length/10)} setPage={setPage}/></div>}</div>
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
  { id: 'royalty', label: "Bảng kê chia sẻ doanh thu", component: RoyaltyTab },
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
    <FranchiseActionProvider><div className="franchise-management-page" style={{ padding: '0 0 32px 0' }}>
      {/* Sub-navigation bar tinh tế, nhẹ nhàng */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#f8fafc', padding: '6px', borderRadius: 10, border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const isAct = activeTab === t.id
          return (
            <Button
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
            </Button>
          )
        })}
      </div>

      {/* Content */}
      <ActiveComponent />
    </div></FranchiseActionProvider>
  )
}

