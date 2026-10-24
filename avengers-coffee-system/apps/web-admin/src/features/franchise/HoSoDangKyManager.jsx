import { franchiseApi as apiFetch } from './franchiseApi'
import { useFranchiseAction } from './franchiseActionContext'
import { FranchiseFeedback } from './FranchiseWorkspaceUI'
import { KioskTableLoading } from './KioskShiftPanel'
import StatusBadge from '../../components/console/StatusBadge'
import { Badge as UiBadge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import { Input } from '../../components/ui/input'
import { Textarea } from '../../components/ui/textarea'
import { Table } from '../../components/ui/table'
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
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Printer
} from '../../components/console/WorkspaceIcons'
import WorkspaceDialog from '../../components/console/WorkspaceDialog'
import CurrencyInput from '../../components/console/CurrencyInput'
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


// ─── Badge Component (Shadcn style with dot indicator) ─────────────────────────
const Badge = ({ status, map }) => {
  const s = map[status] || { label: status, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }
  return (
    <StatusBadge status={status}>

      {s.label}
    </StatusBadge>
  )
}

const Btn = ({ children, onClick, variant = 'primary', small, disabled, style: extStyle, ...rest }) => {
  const styles = {
    primary: { background: '#16354d', color: '#ffffff', border: '1px solid #932129' },
    success: { background: '#15803d', color: '#ffffff', border: '1px solid #166534' },
    danger: { background: '#dc2626', color: '#ffffff', border: '1px solid #b91c1c' },
    outline: { background: '#ffffff', color: '#334155', border: '1px solid #e2e8f0' },
    ghost: { background: 'transparent', color: '#64748b', border: 'none' },
  }
  return (
    <Button variant={variant === 'primary' || variant === 'success' ? 'default' : variant === 'danger' ? 'destructive' : variant} onClick={onClick} disabled={disabled} style={{
      padding: small ? '6px 12px' : '8px 16px', borderRadius: 8, fontSize: small ? 12 : 13, fontWeight: 500,
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, transition: 'all .15s ease',
      display: 'inline-flex', alignItems: 'center', gap: 6,
      boxShadow: variant === 'outline' || variant === 'ghost' ? '0 1px 2px 0 rgba(0, 0, 0, 0.03)' : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      ...styles[variant], ...extStyle
    }} {...rest}>{children}</Button>
  )
}

const Pagination = ({ page, totalPages, setPage }) => {
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderTop: '1px solid #f1f5f9', background: '#ffffff' }}>
      <div style={{ fontSize: 13, color: '#64748b' }}>
        Trang <span style={{ fontWeight: 600, color: '#0f172a' }}>{page}</span> / <span style={{ fontWeight: 600, color: '#0f172a' }}>{totalPages}</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn small variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Trước</Btn>
        <Btn small variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Sau →</Btn>
      </div>
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
  const action = useFranchiseAction()
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
    if (!ghiChuThuCoc.trim()) { setMsg({type:'error',text:'Vui lòng nhập ghi chú chứng từ hoặc mã giao dịch.'}); return }
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
    if (!await action.confirm('Hồ sơ của đối tác hiện tại (Khách quen). Xác nhận duyệt tạo Kiosk mới ngay?')) return
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

  // ═════════════════════════════════════════════════════════════════════════
  // VIEW 2: TRANG CHI TIẾT ĐỐI TÁC NHƯỢNG QUYỀN (Partner Detail View)
  // ═════════════════════════════════════════════════════════════════════════
  if (selectedPartner) {
    const item = selectedPartner
    const goi = GOI_INFO[item.goi_kiosk] || { name: item.goi_kiosk, price: 0, deposit: 5000000 }
    const isKhachQuen = Boolean(item.franchisee_user_id)
    const payLink = `http://localhost:5175/?tab=franchise-deposit&ho_so_id=${item.id}`
    const stt = {
      CHO_XEM_XET: { label: 'Chờ thẩm định', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
      CHO_DAT_COC: { label: 'Chờ đặt cọc (5tr)', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
      DA_DUYET: { label: 'Đã cọc & Cấp Kiosk', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
      TU_CHOI: { label: 'Từ chối', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
      DA_HUY: { label: 'Đã hủy', color: '#475569', bg: '#f8fafc', border: '#e2e8f0' }
    }[item.trang_thai] || { label: item.trang_thai, color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' }

    return (
      <div className="franchise-partners" style={{ animation: 'fadeIn 0.2s ease-in-out', paddingBottom: 32 }}>
        {/* Navigation topbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Btn variant="outline" onClick={() => setSelectedPartner(null)}>
              <ArrowLeft size={15} /> Danh sách hồ sơ
            </Btn>
            <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
                  {item.ho_ten}
                </h3>
                <UiBadge variant="outline" data-quiet-label="true" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', fontSize: '11.5px', fontWeight: 600,
                  color: stt.color, background: stt.bg, border: `1px solid ${stt.border}`, borderRadius: 9999
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: stt.color }} />
                  {stt.label}
                </UiBadge>
                {isKhachQuen ? (
                  <UiBadge variant="outline" data-quiet-label="true" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 6, background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', fontWeight: 600 }}>
                    Đối tác mở rộng
                  </UiBadge>
                ) : (
                  <UiBadge variant="outline" data-quiet-label="true" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: 6, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', fontWeight: 500 }}>
                    Ứng viên mới
                  </UiBadge>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: 3 }}>
                Mã hồ sơ: <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#0f172a' }}>#{item.id}</span> · Ngày nộp: {fmtDate(item.ngay_tao)}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="outline" onClick={load}>
              <RefreshCw size={14} /> Làm mới
            </Btn>
          </div>
        </div>

        <FranchiseFeedback message={msg} onClose={() => setMsg(null)} />

        {/* 2-Column Responsive Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          {/* CỘT TRÁI: THÔNG TIN HỒ SƠ & MẶT BẰNG */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 1. Thông tin ứng viên */}
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={16} color="#16354d" />
                </div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  Thông Tin Ứng Viên / Đối Tác
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Họ và tên</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{item.ho_ten}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Số điện thoại</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{item.so_dien_thoai}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Email liên hệ</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{item.email}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Phân loại</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>
                    {isKhachQuen ? 'Khách quen (Đã có Kiosk)' : 'Ứng viên mới'}
                  </div>
                </div>
              </div>
              {item.ghi_chu && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9', fontSize: 13 }}>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Ghi chú của ứng viên</div>
                  <div style={{ color: '#334155', marginTop: 4, background: '#f8fafc', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontStyle: 'italic' }}>
                    "{item.ghi_chu}"
                  </div>
                </div>
              )}
            </div>

            {/* 2. Thông tin mặt bằng & Kiosk */}
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <WorkspaceSymbolMapPin size={16} color="#16354d" />
                </div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  Vị Trí Mặt Bằng Đề Xuất
                </h4>
              </div>
              <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Địa chỉ chi tiết</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{item.dia_chi_mat_bang}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Tỉnh / Thành phố</div>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{item.thanh_pho}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Diện tích mặt bằng</div>
                    <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{item.dien_tich_m2} m²</div>
                  </div>
                </div>
                {item.latitude && item.longitude && (
                  <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Tọa độ GPS thẩm định:</span>
                      <a
                        href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#16354d', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600 }}
                      >
                        <ExternalLink size={12} /> Google Maps
                      </a>
                    </div>
                    <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#0f172a', marginTop: 4 }}>
                      Lat: {item.latitude} · Lng: {item.longitude}
                    </div>
                    <div style={{ color: '#15803d', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
                      <CheckCircle2 size={13} /> Đảm bảo khoảng cách an toàn 500m với các Kiosk lân cận
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Gói nhượng quyền */}
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Store size={16} color="#16354d" />
                </div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  Gói Nhượng Quyền Đăng Ký
                </h4>
              </div>
              <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                  <span style={{ color: '#64748b' }}>Mô hình nhượng quyền:</span>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{goi.name}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Tổng giá trị gói trọn gói:</span>
                  <span style={{ fontWeight: 700, color: '#0f172a', fontSize: '15px' }}>{fmtMoney(goi.price)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
                  <span style={{ color: '#64748b' }}>Tiền cọc giữ chỗ chuẩn:</span>
                  <span style={{ fontWeight: 600, color: '#15803d' }}>5.000.000đ (Bắt buộc)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 0', borderTop: '1px dashed #e2e8f0' }}>
                  <span style={{ color: '#64748b' }}>Số tiền còn lại sau cọc:</span>
                  <span style={{ fontWeight: 700, color: '#16354d' }}>{fmtMoney(goi.price - 5000000)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: TRUNG TÂM XỬ LÝ NGHIỆP VỤ & THAO TÁC */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Quy trình tiến độ */}
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
              <h4 style={{ margin: '0 0 16px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                Tiến Trình Kích Hoạt Nhượng Quyền
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[
                  { step: 1, title: 'Tiếp nhận hồ sơ đăng ký', desc: 'Hệ thống đã nhận đơn & gửi mail xác nhận', done: true },
                  { step: 2, title: 'Thẩm định mặt bằng & Yêu cầu cọc', desc: 'Kiểm tra GPS, độc quyền 500m & gửi link cọc 5tr', done: item.trang_thai !== 'CHO_XEM_XET' },
                  { step: 3, title: 'Thanh toán đặt cọc (5.000.000đ)', desc: 'VietQR / VNPay / Thu trực tiếp tiền mặt', done: item.trang_thai === 'DA_DUYET' },
                  { step: 4, title: 'Cấp mã Kiosk & Tài khoản đối tác', desc: 'Bàn giao quyền đăng nhập Cổng Quản Trị Kiosk', done: item.trang_thai === 'DA_DUYET' },
                ].map(s => (
                  <div key={s.step} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: s.done ? '#15803d' : '#f1f5f9',
                      color: s.done ? '#ffffff' : '#94a3b8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, flexShrink: 0, marginTop: 1
                    }}>
                      {s.done ? <Check size={14} /> : s.step}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: s.done ? '#0f172a' : '#64748b' }}>{s.title}</div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>{s.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Khung thao tác hành động nghiệp vụ */}
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                Trung Tâm Xử Lý Thao Tác Nghiệp Vụ
              </h4>

              {/* TRƯỜNG HỢP 1: CHỜ XEM XÉT */}
              {item.trang_thai === 'CHO_XEM_XET' && !isKhachQuen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#f0f9ff', padding: 14, borderRadius: 8, border: '1px solid #bae6fd', color: '#0369a1', fontSize: 13, lineHeight: 1.5 }}>
                    Hồ sơ đang chờ phê duyệt thẩm định. Nếu mặt bằng đạt tiêu chuẩn, hãy nhấn <b>"Yêu cầu đặt cọc"</b> để hệ thống gửi email kèm link thanh toán trực tuyến 5.000.000đ cho đối tác.
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Btn
                      variant="primary"
                      onClick={() => setYeuCauCocModal(item)}
                    >
                      <DollarSign size={15} /> Phê Duyệt & Yêu Cầu Đặt Cọc (5tr)
                    </Btn>
                    <Btn
                      variant="danger"
                      onClick={() => { setTuChoiModal(item); setLyDoTuChoi(''); }}
                      style={{ background: '#ffffff', color: '#dc2626', border: '1px solid #fecaca' }}
                    >
                      Từ Chối Hồ Sơ
                    </Btn>
                  </div>
                </div>
              )}

              {/* TRƯỜNG HỢP 2: KHÁCH QUEN CHỜ DUYỆT */}
              {item.trang_thai === 'CHO_XEM_XET' && isKhachQuen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 8, border: '1px solid #bbf7d0', color: '#166534', fontSize: 13, lineHeight: 1.5 }}>
                    Đây là đối tác hiện hữu mở rộng điểm bán. Có thể duyệt ngay để kích hoạt Kiosk mới vào tài khoản của đối tác.
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <Btn
                      variant="success"
                      onClick={() => handleDuyetNoiBo(item.id)}
                    >
                      <Check size={15} /> Duyệt Tạo Kiosk Ngay (Bỏ qua cọc)
                    </Btn>
                    <Btn
                      variant="danger"
                      onClick={() => { setTuChoiModal(item); setLyDoTuChoi(''); }}
                      style={{ background: '#ffffff', color: '#dc2626', border: '1px solid #fecaca' }}
                    >
                      Từ Chối
                    </Btn>
                  </div>
                </div>
              )}

              {/* TRƯỜNG HỢP 3: CHỜ ĐẶT CỌC */}
              {item.trang_thai === 'CHO_DAT_COC' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#fffbeb', padding: 14, borderRadius: 8, border: '1px solid #fde68a', color: '#92400e', fontSize: 13, lineHeight: 1.5 }}>
                    Đã thẩm định đạt và gửi email yêu cầu cọc. Đang chờ đối tác thanh toán phí đặt cọc <b>5.000.000đ</b>.
                  </div>

                  {/* Link thanh toán cọc */}
                  <div>
                    <Label htmlFor="hosodangkymanager-field-1" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                      Đường dẫn thanh toán cọc trực tuyến của hồ sơ này:
                    </Label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Input
                        type="text"
                        readOnly
                        value={payLink}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, background: '#f8fafc', color: '#0f172a', outline: 'none' }}
                      />
                      <Btn
                        variant="outline"
                        small
                        onClick={() => copyPaymentLink(payLink)}
                      >
                        {copySuccess ? <Check size={14} color="#15803d" /> : <Copy size={14} />}
                        {copySuccess ? 'Đã chép' : 'Sao chép'}
                      </Btn>
                      <a
                        href={payLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#ffffff', color: '#0284c7', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, textDecoration: 'none', fontWeight: 500 }}
                      >
                        <ExternalLink size={14} /> Mở trang
                      </a>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Btn
                      variant="success"
                      onClick={() => { setThuCocModal(item); setGhiChuThuCoc(''); }}
                    >
                      <Check size={15} /> Xác Nhận Đã Thu Cọc (Thủ công / Tiền mặt)
                    </Btn>
                    <Btn
                      variant="outline"
                      onClick={() => setYeuCauCocModal(item)}
                    >
                      Gửi Lại Email
                    </Btn>
                    <Btn
                      variant="danger"
                      onClick={() => { setTuChoiModal(item); setLyDoTuChoi('Khách hàng đổi ý / Không hoàn tất cọc'); }}
                      style={{ background: '#ffffff', color: '#dc2626', border: '1px solid #fecaca' }}
                    >
                      Hủy Hồ Sơ
                    </Btn>
                  </div>
                </div>
              )}

              {/* TRƯỜNG HỢP 4: ĐÃ DUYỆT (ĐÃ CỌC & CẤP KIOSK) */}
              {item.trang_thai === 'DA_DUYET' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 8, border: '1px solid #bbf7d0', color: '#15803d', fontSize: 13 }}>
                    <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <CheckCircle2 size={16} /> Hồ sơ đã duyệt và bàn giao thành công
                    </div>
                    <div>Đã thu tiền cọc 5.000.000đ. Điểm bán Kiosk đã được tạo và kích hoạt tài khoản đối tác thành công.</div>
                  </div>
                  <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Tài khoản đối tác</span>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{item.email}</div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Trạng thái Kiosk</span>
                      <div style={{ fontWeight: 600, color: '#15803d', marginTop: 2 }}>Đang thiết lập / Hoạt động</div>
                    </div>
                  </div>
                </div>
              )}

              {/* TRƯỜNG HỢP 5: TỪ CHỐI / HỦY */}
              {['TU_CHOI', 'DA_HUY'].includes(item.trang_thai) && (
                <div style={{ background: '#fef2f2', padding: 14, borderRadius: 8, border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13 }}>
                  <div style={{ fontWeight: 700 }}>Hồ sơ đã {item.trang_thai === 'TU_CHOI' ? 'bị từ chối' : 'bị hủy'}</div>
                  {item.ly_do_tu_choi && <div style={{ marginTop: 4 }}>Lý do: {item.ly_do_tu_choi}</div>}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* CÁC MODAL THAO TÁC */}
        {yeuCauCocModal && (
          <WorkspaceDialog busy={submitting} title={`Yêu Cầu Đặt Cọc: ${yeuCauCocModal.ho_ten}`} onClose={() => setYeuCauCocModal(null)}>
            <div data-modal-body="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 8, border: '1px solid #bbf7d0', color: '#15803d', fontSize: 13, lineHeight: 1.5 }}>
                Hồ sơ đã được thẩm định đạt tiêu chuẩn. Yêu cầu đặt cọc chuẩn là <b>5.000.000đ</b> để giữ chỗ khu vực và kích hoạt hợp đồng nhượng quyền.
              </div>

              <div>
                <Label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Đường dẫn thanh toán cọc trực tuyến:</Label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Input
                    type="text"
                    readOnly
                    value={`http://localhost:5175/?tab=franchise-deposit&ho_so_id=${yeuCauCocModal.id}`}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#f8fafc', color: '#0f172a', outline: 'none' }}
                  />
                  <Btn
                    variant="outline"
                    small
                    onClick={() => copyPaymentLink(`http://localhost:5175/?tab=franchise-deposit&ho_so_id=${yeuCauCocModal.id}`)}
                  >
                    {copySuccess ? <Check size={14} color="#15803d" /> : <Copy size={14} />}
                    {copySuccess ? 'Đã sao chép!' : 'Sao chép'}
                  </Btn>
                </div>
              </div>

              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <div><b>Gửi tới email:</b> {yeuCauCocModal.email}</div>
                <div style={{ marginTop: 4 }}><b>Số điện thoại:</b> {yeuCauCocModal.so_dien_thoai}</div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <Btn variant="outline" disabled={submitting} onClick={() => setYeuCauCocModal(null)}>Hủy bỏ</Btn>
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
          <WorkspaceDialog busy={submitting} title={`Xác Nhận Nhận Cọc: ${thuCocModal.ho_ten}`} onClose={() => setThuCocModal(null)}>
            <div data-modal-body="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <div>Khách hàng: <b>{thuCocModal.ho_ten}</b> ({thuCocModal.so_dien_thoai})</div>
                <div style={{ marginTop: 3 }}>Gói Kiosk: <b>{GOI_INFO[thuCocModal.goi_kiosk]?.name || thuCocModal.goi_kiosk}</b></div>
                <div style={{ marginTop: 6, color: '#15803d', fontWeight: 700 }}>
                  Số tiền cọc xác nhận thu: 5.000.000đ
                </div>
              </div>

              <div>
                <Label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Ghi chú chứng từ / Mã giao dịch ngân hàng *</Label>
                <Textarea id="hosodangkymanager-field-1"
                  value={ghiChuThuCoc}
                  onChange={e => setGhiChuThuCoc(e.target.value)}
                  placeholder="VD: Nhận tiền mặt tại quầy / Chuyển khoản Vietcombank mã GD 83921..."
                  rows={3}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <Btn variant="outline" disabled={submitting} onClick={() => setThuCocModal(null)}>Hủy bỏ</Btn>
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
          <WorkspaceDialog busy={submitting} title={`Từ Chối Hồ Sơ: ${tuChoiModal.ho_ten}`} onClose={() => setTuChoiModal(null)}>
            <div data-modal-body="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <Label htmlFor="hosodangkymanager-field-2" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Lý do từ chối hồ sơ *</Label>
                <Textarea id="hosodangkymanager-field-2"
                  value={lyDoTuChoi}
                  onChange={e => setLyDoTuChoi(e.target.value)}
                  placeholder="Nhập lý do thẩm định không đạt..."
                  rows={4}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['Không đạt khoảng cách an toàn 500m', 'Mặt bằng không phù hợp quy hoạch chuỗi', 'Không liên lạc được sau 3 lần gọi'].map(txt => (
                  <Button
                    key={txt}
                    type="button"
                    onClick={() => setLyDoTuChoi(txt)}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 12, cursor: 'pointer', color: '#475569', transition: 'all .15s' }}
                  >
                    + {txt}
                  </Button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <Btn variant="outline" disabled={submitting} onClick={() => setTuChoiModal(null)}>Hủy bỏ</Btn>
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
  // VIEW 1: DANH SÁCH ĐỐI TÁC DẠNG BẢNG (Zenith / Shadcn Table List View)
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div className="franchise-partners" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* 1. KPI Pipeline Cards */}
      <div className="franchise-pipeline" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        {[
          { key: '', label: 'TẤT CẢ HỒ SƠ', val: stats.tong, color: '#0f172a', dot: '#475569', sub: 'Toàn bộ đơn đăng ký' },
          { key: 'CHO_XEM_XET', label: 'CHỜ THẨM ĐỊNH', val: stats.cho_xem_xet, color: '#0284c7', dot: '#0284c7', sub: 'Cần xem xét GPS/MB' },
          { key: 'CHO_DAT_COC', label: 'CHỜ ĐẶT CỌC (5TR)', val: stats.cho_dat_coc, color: '#b45309', dot: '#d97706', sub: 'Đang chờ nộp cọc' },
          { key: 'DA_DUYET', label: 'ĐÃ CỌC & CẤP KIOSK', val: stats.da_duyet, color: '#15803d', dot: '#16a34a', sub: 'Đã kích hoạt điểm bán' },
          { key: 'TU_CHOI', label: 'TỪ CHỐI / HỦY', val: stats.tu_choi, color: '#b91c1c', dot: '#dc2626', sub: 'Không đạt tiêu chuẩn' },
        ].map(card => {
          const isAct = filterStatus === card.key
          return (
            <Button type="button" variant="outline" className="franchise-pipeline-filter" aria-pressed={isAct}
              key={card.key}
              onClick={() => { setFilterStatus(card.key); setPage(1); }}
              style={{
                background: '#ffffff',
                padding: '16px 18px',
                borderRadius: 12,
                border: isAct ? '1.5px solid #16354d' : '1px solid #e2e8f0',
                cursor: 'pointer',
                transition: 'all .15s ease',
                boxShadow: isAct ? '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 0 0 1px #16354d' : '0 1px 2px 0 rgba(0, 0, 0, 0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '11px', color: isAct ? '#16354d' : '#64748b', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {card.label}
                </span>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: card.dot }} />
              </div>
              <div style={{ fontSize: '26px', fontWeight: 700, color: '#0f172a', marginTop: 8, fontFeatureSettings: '"tnum"' }}>
                {card.val}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: 3 }}>
                {card.sub}
              </div>
            </Button>
          )
        })}
      </div>

      {/* 2. Thanh tìm kiếm & Bộ lọc - GOM GỌN 1 DÒNG DUY NHẤT */}
      <div 
        className="franchise-toolbar"
        style={{
          background: '#ffffff', padding: '12px 18px', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 18,
          display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.02)'
        }}
      >
        {/* Input search */}
        <div className="franchise-search-box" style={{ position: 'relative', flex: '1 1 260px', minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <Input
            type="text"
            placeholder="Tìm theo họ tên, SĐT, email, mặt bằng..."
            value={keyword}
            onChange={e => { setKeyword(e.target.value); setPage(1); }}
            style={{
              width: '100%', padding: '8px 12px 8px 36px', borderRadius: 8, border: '1px solid #e2e8f0',
              fontSize: '13px', outline: 'none', background: '#f8fafc', color: '#0f172a', boxSizing: 'border-box',
              transition: 'all 0.15s ease'
            }}
          />
        </div>

        {/* Lọc Trạng thái */}
        <SearchableSelect
          className="franchise-filter-select"
          value={filterStatus} 
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 170, maxWidth: 220, flex: '0 0 auto', padding: '8px 32px 8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '13px', background: '#ffffff', color: '#334155', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi trạng thái --</option>
          <option value="CHO_XEM_XET">Chờ thẩm định</option>
          <option value="CHO_DAT_COC">Chờ đặt cọc (5tr)</option>
          <option value="DA_DUYET">Đã cọc & Cấp Kiosk</option>
          <option value="TU_CHOI">Đã từ chối</option>
          <option value="DA_HUY">Đã hủy</option>
        </SearchableSelect>

        {/* Lọc Gói */}
        <SearchableSelect
          className="franchise-filter-select"
          value={filterGoi} 
          onChange={e => { setFilterGoi(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 170, maxWidth: 220, flex: '0 0 auto', padding: '8px 32px 8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '13px', background: '#ffffff', color: '#334155', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi gói nhượng quyền --</option>
          <option value="XE_LUU_DONG">Xe Lưu Động (16.5tr)</option>
          <option value="KIOSK_CO_DINH">Kiosk Cố Định (44.5tr)</option>
          <option value="CONTAINER_CAFE">Container Cafe (67.5tr)</option>
        </SearchableSelect>

        {/* Lọc Phân loại */}
        <SearchableSelect
          className="franchise-filter-select"
          value={filterType} 
          onChange={e => { setFilterType(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 170, maxWidth: 220, flex: '0 0 auto', padding: '8px 32px 8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '13px', background: '#ffffff', color: '#334155', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi ứng viên --</option>
          <option value="KHACH_MOI">Ứng viên đăng ký mới</option>
          <option value="KHACH_QUEN">Đối tác mở rộng (Khách quen)</option>
        </SearchableSelect>

        <Btn
          variant="outline"
          onClick={load}
          style={{ flex: '0 0 auto' }}
        >
          <RefreshCw size={14} /> Làm mới
        </Btn>
      </div>

      <FranchiseFeedback message={msg} onClose={() => setMsg(null)} />

      {/* 3. Bảng Dữ Liệu Đối Tác - BẤM VÀO DÒNG ĐỂ XEM CHI TIẾT */}
      {loading ? (
        <KioskTableLoading label="Đang tải hồ sơ đối tác" />
      ) : (
        <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
          <div className="console-table-scroll">
            <Table className="franchise-fit-table partner-list-table">
              <colgroup><col style={{width:'14%'}}/><col style={{width:'25%'}}/><col style={{width:'25%'}}/><col style={{width:'20%'}}/><col style={{width:'16%'}}/></colgroup>
              <thead><tr><th>Hồ sơ</th><th>Đối tác</th><th>Mặt bằng</th><th>Gói kiosk</th><th>Trạng thái</th></tr></thead>
              <tbody>{currentItems.map(item => <tr key={item.id} className="franchise-click-row" onClick={()=>setSelectedPartner(item)}>
                <td><button type="button" className="franchise-detail-link" onClick={event=>{event.stopPropagation();setSelectedPartner(item)}} aria-label={`Xem hồ sơ ${item.ho_ten}`}><span className="franchise-code">#{item.id.slice(0,8).toUpperCase()}</span></button><small>{fmtDate(item.ngay_tao)}</small></td>
                <td><strong>{item.ho_ten}</strong><small>{item.so_dien_thoai || 'Chưa có số điện thoại'}</small><small>{item.franchisee_user_id ? 'Đối tác hiện tại' : 'Đăng ký mới'}</small></td>
                <td><strong>{item.dia_chi_mat_bang || 'Chưa có địa chỉ'}</strong><small>{item.thanh_pho} · {item.dien_tich_m2} m²</small></td>
                <td><strong>{GOI_INFO[item.goi_kiosk]?.name || item.goi_kiosk}</strong><small>{fmtMoney(GOI_INFO[item.goi_kiosk]?.price || 0)}</small></td>
                <td><Badge status={item.trang_thai} map={{CHO_XEM_XET:{label:'Chờ thẩm định',color:'#0369a1',bg:'#f0f9ff'},CHO_DAT_COC:{label:'Chờ đặt cọc',color:'#92400e',bg:'#fffbeb'},DA_DUYET:{label:'Đã cấp kiosk',color:'#166534',bg:'#f0fdf4'},TU_CHOI:{label:'Từ chối',color:'#b91c1c',bg:'#fef2f2'},DA_HUY:{label:'Đã hủy',color:'#475569',bg:'#f8fafc'}}}/></td>
              </tr>)}{!currentItems.length && <tr><td colSpan={5} className="franchise-empty">Không tìm thấy hồ sơ đối tác phù hợp.</td></tr>}</tbody>
            </Table>
          </div>
          <Pagination page={page} totalPages={totalPages} setPage={setPage} />
        </div>
      )}
    </div>
  )
}
