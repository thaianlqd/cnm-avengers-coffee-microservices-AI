import { franchiseApi as apiFetch } from './franchiseApi'
import { useFranchiseAction } from './franchiseActionContext'
import { FranchiseFeedback } from './FranchiseWorkspaceUI'
import { KioskTableLoading } from './KioskShiftPanel'
import StatusBadge from '../../components/console/StatusBadge'
import { Badge as UiBadge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Label } from '../../components/ui/label'
import { Input } from '../../components/ui/input'
import { Table } from '../../components/ui/table'
import SearchableSelect from '../../components/console/SearchableSelect'
import { 
  Store, 
  MapPin, 
  FileText, 
  Sparkles, 
  Calendar, 
  Unlock, 
  AlertTriangle, 
  Package,
  Search,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  DollarSign,
  AlertCircle,
  XCircle,
  ExternalLink,
  ShieldCheck,
  Check,
  Award
} from '../../components/console/WorkspaceIcons'
import WorkspaceDialog from '../../components/console/WorkspaceDialog'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { API_BASE_URL } from '../admin-dashboard/constants'

// ─── Helpers ───────────────────────────────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '—';
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch (e) {
    return '—';
  }
};

const LOAI_KIOSK_LABEL = {
  XE_LUU_DONG: 'Xe Lưu Động',
  KIOSK_CO_DINH: 'Kiosk Cố Định',
  CONTAINER_CAFE: 'Container Cafe',
  PREMIUM: 'Kiosk Tiêu Chuẩn',
};

const STATUS_KIOSK = {
  CHO_KY_HOP_DONG: { label: 'Chờ ký HĐ', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
  DANG_THIET_LAP: { label: 'Đang thiết lập', color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  DANG_HOAT_DONG: { label: 'Đang hoạt động', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
  TAM_DUNG: { label: 'Tạm dừng', color: '#c2410c', bg: '#fff7ed', border: '#ffedd5' },
  NGUNG_HOAT_DONG: { label: 'Ngừng hoạt động', color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
};

// ─── Badge Component (Shadcn style with dot indicator) ─────────────────────────
const Badge = ({ status, map = STATUS_KIOSK }) => {
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


// Client-side cache to guarantee instant 0ms switching
let kioskClientCache = { data: null, timestamp: 0 };

export function KioskNetworkManager() {
  const action = useFranchiseAction()
  const [kiosks, setKiosks] = useState(() => kioskClientCache.data || [])
  const [loading, setLoading] = useState(() => !kioskClientCache.data)
  const [selectedKiosk, setSelectedKiosk] = useState(null)
  const [msg, setMsg] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  // Filters
  const [keyword, setKeyword] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterLoai, setFilterLoai] = useState('')
  const [filterRank, setFilterRank] = useState('')
  const [page, setPage] = useState(1)
  const pageSize = 12

  // Modals
  const [hopDongModal, setHopDongModal] = useState(null)
  const [giaHanModal, setGiaHanModal] = useState(null)
  const [chamDutModal, setChamDutModal] = useState(null)
  const [form, setForm] = useState({
    ngay_ky: '',
    ngay_het_han: '',
    ty_le_royalty_phan_tram: 7,
    so_combo_khoi_diem: 5,
    file_hop_dong_url: '',
    ngay_het_han_moi: ''
  })

  const load = useCallback(async (forceRefresh = false) => {
    // If not forced and we have fresh cache (< 60s), use it
    if (!forceRefresh && kioskClientCache.data && Date.now() - kioskClientCache.timestamp < 60000) {
      setKiosks(kioskClientCache.data)
      setLoading(false)
      return
    }

    if (!kioskClientCache.data) setLoading(true)
    try {
      const data = await apiFetch('/franchise/kiosk')
      const safeData = Array.isArray(data) ? data : []
      kioskClientCache = { data: safeData, timestamp: Date.now() }
      setKiosks(safeData)
      
      // Update selectedKiosk if currently viewing one
      setSelectedKiosk(prev => prev ? (safeData.find(k => k.id === prev.id) || prev) : null)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Pipeline stats
  const stats = useMemo(() => {
    const s = { tong: kiosks.length, hoat_dong: 0, cho_ky: 0, thiet_lap: 0, ngung: 0 }
    kiosks.forEach(k => {
      if (k.trang_thai === 'DANG_HOAT_DONG') s.hoat_dong++
      else if (k.trang_thai === 'CHO_KY_HOP_DONG') s.cho_ky++
      else if (k.trang_thai === 'DANG_THIET_LAP') s.thiet_lap++
      else if (k.trang_thai === 'TAM_DUNG' || k.trang_thai === 'NGUNG_HOAT_DONG') s.ngung++
    })
    return s
  }, [kiosks])

  // Filtered kiosks
  const filteredKiosks = useMemo(() => {
    return kiosks.filter(k => {
      if (keyword) {
        const kw = keyword.toLowerCase()
        const matchName = k.ten_kiosk?.toLowerCase().includes(kw)
        const matchCode = k.ma_kiosk?.toLowerCase().includes(kw)
        const matchAddr = k.dia_chi?.toLowerCase().includes(kw) || k.thanh_pho?.toLowerCase().includes(kw)
        if (!matchName && !matchCode && !matchAddr) return false
      }
      if (filterStatus && k.trang_thai !== filterStatus) return false
      if (filterLoai && k.loai_kiosk !== filterLoai) return false
      if (filterRank && k.xep_hang !== filterRank) return false
      return true
    })
  }, [kiosks, keyword, filterStatus, filterLoai, filterRank])

  const totalPages = Math.ceil(filteredKiosks.length / pageSize) || 1
  const currentKiosks = filteredKiosks.slice((page - 1) * pageSize, page * pageSize)

  // Actions
  const handleTaoHopDong = async () => {
    if (!form.ngay_ky || !form.ngay_het_han) {
      setMsg({ type: 'error', text: 'Vui lòng chọn ngày ký và ngày hết hạn hợp đồng.' })
      return
    }
    setSubmitting(true)
    try {
      await apiFetch(`/franchise/kiosk/${hopDongModal.id}/hop-dong`, {
        method: 'POST',
        body: JSON.stringify(form)
      })
      setMsg({ type: 'success', text: `Đã tạo hợp đồng thành công cho Kiosk ${hopDongModal.ten_kiosk}!` })
      setHopDongModal(null)
      load(true)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleKhaiTruong = async (id, ten) => {
    if (!await action.confirm(`Xác nhận Kiosk "${ten}" đã hoàn tất thiết lập và chính thức khai trương hoạt động?`)) return
    setSubmitting(true)
    try {
      await apiFetch(`/franchise/kiosk/${id}/khai-truong`, { method: 'PATCH' })
      setMsg({ type: 'success', text: `Kiosk "${ten}" đã chính thức khai trương hoạt động!` })
      load(true)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleGiaHan = async () => {
    if (!form.ngay_het_han_moi) {
      setMsg({ type: 'error', text: 'Vui lòng chọn ngày hết hạn mới.' })
      return
    }
    setSubmitting(true)
    try {
      await apiFetch(`/franchise/kiosk/${giaHanModal.id}/gia-han`, {
        method: 'POST',
        body: JSON.stringify({ ngay_het_han_moi: form.ngay_het_han_moi })
      })
      setMsg({ type: 'success', text: `Đã gia hạn hợp đồng cho Kiosk ${giaHanModal.ten_kiosk}!` })
      setGiaHanModal(null)
      load(true)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleChamDut = async () => {
    setSubmitting(true)
    try {
      await apiFetch(`/franchise/kiosk/${chamDutModal.id}/cham-dut`, { method: 'POST' })
      setMsg({ type: 'success', text: `Đã chấm dứt hợp đồng Kiosk ${chamDutModal.ten_kiosk}. Kiosk đã ngừng hoạt động.` })
      setChamDutModal(null)
      load(true)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleMoKhoa = async (kiosk) => {
    if (!await action.confirm(`Mở khóa cho phép Kiosk "${kiosk.ten_kiosk}" hoạt động trở lại?`)) return
    setSubmitting(true)
    try {
      await apiFetch(`/franchise/kiosk/${kiosk.id}/trang-thai`, {
        method: 'PATCH',
        body: JSON.stringify({ trang_thai: 'DANG_HOAT_DONG' })
      })
      setMsg({ type: 'success', text: `Đã mở khóa Kiosk "${kiosk.ten_kiosk}" thành công!` })
      load(true)
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
    } finally {
      setSubmitting(false)
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // VIEW 2: TRANG CHI TIẾT KIOSK (Detail View)
  // ═════════════════════════════════════════════════════════════════════════
  if (selectedKiosk) {
    const k = selectedKiosk
    const st = STATUS_KIOSK[k.trang_thai] || { label: k.trang_thai, color: '#64748b' }
    const rankColor = k.xep_hang === 'S' ? '#d97706' : k.xep_hang === 'A' ? '#0284c7' : k.xep_hang === 'B' ? '#16a34a' : '#dc2626'
    const daysLeft = k.hop_dong?.ngay_het_han ? Math.ceil((new Date(k.hop_dong.ngay_het_han).getTime() - Date.now()) / (1000 * 3600 * 24)) : null
    const isExpiringSoon = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0
    const isExpired = daysLeft !== null && daysLeft < 0

    return (
      <div className="franchise-network" style={{ animation: 'fadeIn 0.2s ease-in-out', paddingBottom: 32 }}>
        {/* Navigation topbar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <Btn variant="outline" onClick={() => setSelectedKiosk(null)}>
              <ArrowLeft size={15} /> Danh sách Kiosk
            </Btn>
            <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
                  {k.ten_kiosk}
                </h3>
                <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, fontSize: '11.5px', padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0' }}>
                  {k.ma_kiosk}
                </span>
                <UiBadge variant="outline" data-quiet-label="true" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', fontSize: '11.5px', fontWeight: 600,
                  color: st.color, background: st.bg, border: `1px solid ${st.border}`, borderRadius: 9999
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color }} />
                  {st.label}
                </UiBadge>
                {k.xep_hang && (
                  <UiBadge variant="outline" data-quiet-label="true" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: '11.5px', fontWeight: 600,
                    color: rankColor, background: '#f8fafc', border: `1px solid ${rankColor}33`, borderRadius: 6
                  }}>
                    <Award size={13} /> Hạng {k.xep_hang} ({k.diem_danh_gia || 100}/100)
                  </UiBadge>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: 3 }}>
                {k.dia_chi}, {k.phuong_xa ? `${k.phuong_xa}, ` : ''}{k.thanh_pho} · Ngày tạo: {fmtDate(k.ngay_tao)}
              </div>
            </div>
          </div>

          <Btn variant="outline" onClick={() => load(true)}>
            <RefreshCw size={14} /> Làm mới
          </Btn>
        </div>

        <FranchiseFeedback message={msg} onClose={() => setMsg(null)} />

        {/* 2-Column Responsive Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          {/* CỘT TRÁI: THÔNG TIN KIOSK & HỢP ĐỒNG */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 1. Điểm bán & Địa điểm */}
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Store size={16} color="#16354d" />
                </div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  Thông Tin Điểm Bán Kiosk
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Tên điểm bán</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{k.ten_kiosk}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Mã định danh Kiosk</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontFamily: 'ui-monospace, monospace', marginTop: 3 }}>{k.ma_kiosk}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Mô hình Kiosk</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{LOAI_KIOSK_LABEL[k.loai_kiosk] || k.loai_kiosk}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Tỉnh / Thành phố</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{k.thanh_pho}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Địa chỉ cụ thể</div>
                  <div style={{ fontWeight: 500, color: '#0f172a', marginTop: 3 }}>{k.dia_chi}{k.phuong_xa ? `, ${k.phuong_xa}` : ''}</div>
                </div>
              </div>
            </div>

            {/* 2. Hợp đồng nhượng quyền */}
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={16} color="#16354d" />
                </div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  Hợp Đồng Nhượng Quyền
                </h4>
              </div>
              {k.hop_dong ? (
                <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Ngày ký hợp đồng</div>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{fmtDate(k.hop_dong.ngay_ky)}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Ngày hết hạn</div>
                      <div style={{ fontWeight: 600, marginTop: 3, color: isExpired ? '#dc2626' : isExpiringSoon ? '#ea580c' : '#0f172a' }}>
                        {fmtDate(k.hop_dong.ngay_het_han)}
                        {isExpired && ' (Quá hạn)'}
                        {isExpiringSoon && ` (Còn ${daysLeft} ngày)`}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Tỷ lệ chia sẻ doanh thu</div>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{k.hop_dong.ty_le_royalty_phan_tram || 7}% / tháng</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Combo khởi điểm</div>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 3 }}>{k.hop_dong.so_combo_khoi_diem || 5} combo</div>
                    </div>
                  </div>

                  {k.hop_dong.file_hop_dong_url && (
                    <div style={{ marginTop: 6, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                      <a 
                        href={k.hop_dong.file_hop_dong_url} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#16354d', fontSize: 12, textDecoration: 'none', fontWeight: 600 }}
                      >
                        <ExternalLink size={13} /> Xem bản scan hợp đồng đã ký
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
                  Kiosk này chưa có thông tin hợp đồng được ký kết. Hãy nhấn <b>"Ký hợp đồng"</b> ở cột bên phải để hoàn thiện thủ tục.
                </div>
              )}
            </div>

            {/* 3. Tồn kho combo & Xếp hạng */}
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={16} color="#16354d" />
                </div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  Tồn Kho Combo & Đánh Giá Vận Hành
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Số Combo tồn kho</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: (k.so_combo_hien_tai || 0) < 3 ? '#dc2626' : '#0f172a', marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                    {k.so_combo_hien_tai || 0} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>combo</span>
                  </div>
                  {(k.so_combo_hien_tai || 0) < 3 && (
                    <div style={{ color: '#dc2626', fontSize: 11.5, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                      <AlertTriangle size={13} /> Sắp cạn combo nguyên liệu
                    </div>
                  )}
                </div>

                <div style={{ background: '#f8fafc', padding: 14, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ color: '#64748b', fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Điểm uy tín vận hành</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: rankColor, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
                    {k.diem_danh_gia || 100} <span style={{ fontSize: 13, fontWeight: 500, color: '#64748b' }}>/ 100</span>
                  </div>
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                    Xếp hạng: <b style={{ color: rankColor }}>Hạng {k.xep_hang || 'A'}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: TRUNG TÂM THAO TÁC NGHIỆP VỤ & TÀI CHÍNH */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 1. Thao tác nghiệp vụ theo trạng thái */}
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                Thao Tác Nghiệp Vụ Kiosk
              </h4>

              {/* TRƯỜNG HỢP 1: CHỜ KÝ HỢP ĐỒNG */}
              {k.trang_thai === 'CHO_KY_HOP_DONG' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#f0f9ff', padding: 14, borderRadius: 8, border: '1px solid #bae6fd', color: '#0369a1', fontSize: 13, lineHeight: 1.5 }}>
                    Đối tác đã hoàn tất nộp cọc. Cần thiết lập hợp đồng chính thức, bàn giao combo khởi điểm để chuyển Kiosk sang trạng thái thiết lập.
                  </div>
                  <Btn
                    variant="primary"
                    onClick={() => {
                      setHopDongModal(k)
                      setForm({
                        ngay_ky: new Date().toISOString().split('T')[0],
                        ngay_het_han: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
                        ty_le_royalty_phan_tram: 7,
                        so_combo_khoi_diem: 5,
                        file_hop_dong_url: ''
                      })
                    }}
                    style={{ justifyContent: 'center' }}
                  >
                    <FileText size={15} /> Ký Hợp Đồng Nhượng Quyền
                  </Btn>
                </div>
              )}

              {/* TRƯỜNG HỢP 2: ĐANG THIẾT LẬP */}
              {k.trang_thai === 'DANG_THIET_LAP' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#fffbeb', padding: 14, borderRadius: 8, border: '1px solid #fde68a', color: '#92400e', fontSize: 13, lineHeight: 1.5 }}>
                    Kiosk đang trong giai đoạn chuẩn bị mặt bằng và nhận bàn giao xe/trang thiết bị. Khi điểm bán hoàn tất sẵn sàng bán hàng, nhấn xác nhận để chính thức hoạt động.
                  </div>
                  <Btn
                    variant="success"
                    onClick={() => handleKhaiTruong(k.id, k.ten_kiosk)}
                    disabled={submitting}
                    style={{ justifyContent: 'center' }}
                  >
                    <Sparkles size={15} /> Xác Nhận Khai Trương Điểm Bán
                  </Btn>
                </div>
              )}

              {/* TRƯỜNG HỢP 3: ĐANG HOẠT ĐỘNG HOẶC TẠM DỪNG */}
              {(k.trang_thai === 'DANG_HOAT_DONG' || k.trang_thai === 'TAM_DUNG') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: k.trang_thai === 'DANG_HOAT_DONG' ? '#f0fdf4' : '#fff7ed', padding: 14, borderRadius: 8, border: `1px solid ${k.trang_thai === 'DANG_HOAT_DONG' ? '#bbf7d0' : '#ffedd5'}`, color: k.trang_thai === 'DANG_HOAT_DONG' ? '#15803d' : '#c2410c', fontSize: 13, lineHeight: 1.5 }}>
                    {k.trang_thai === 'DANG_HOAT_DONG' ? 'Kiosk đang hoạt động bình thường trên toàn hệ thống.' : 'Kiosk đang tạm dừng phục vụ.'}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Btn
                      variant="outline"
                      onClick={() => {
                        setGiaHanModal(k)
                        setForm(f => ({ ...f, ngay_het_han_moi: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0] }))
                      }}
                    >
                      <Calendar size={15} /> Gia Hạn Hợp Đồng
                    </Btn>
                    <Btn
                      variant="danger"
                      onClick={() => setChamDutModal(k)}
                      style={{ background: '#ffffff', color: '#dc2626', border: '1px solid #fecaca' }}
                    >
                      <XCircle size={15} /> Chấm Dứt Hợp Đồng
                    </Btn>
                  </div>
                </div>
              )}

              {/* TRƯỜNG HỢP 4: NGỪNG HOẠT ĐỘNG */}
              {k.trang_thai === 'NGUNG_HOAT_DONG' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: '#fef2f2', padding: 14, borderRadius: 8, border: '1px solid #fecaca', color: '#b91c1c', fontSize: 13, lineHeight: 1.5 }}>
                    Kiosk này đã bị khóa hoặc chấm dứt hợp đồng.
                  </div>
                  <Btn
                    variant="success"
                    onClick={() => handleMoKhoa(k)}
                    disabled={submitting}
                    style={{ justifyContent: 'center' }}
                  >
                    <Unlock size={15} /> Mở Khóa Cho Hoạt Động Lại
                  </Btn>
                </div>
              )}
            </div>

            {/* 2. Tình hình công nợ & Tài chính */}
            <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 22, boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <DollarSign size={16} color="#16354d" />
                </div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  Tình Trạng Công Nợ Kiosk
                </h4>
              </div>
              <div style={{ fontSize: 13 }}>
                {k.so_cong_no_chua_thanh_toan > 0 ? (
                  <div style={{ background: '#fef2f2', padding: 14, borderRadius: 8, border: '1px solid #fecaca', color: '#b91c1c' }}>
                    <div style={{ fontWeight: 700 }}>Phát hiện {k.so_cong_no_chua_thanh_toan} khoản nợ chưa tất toán</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Vui lòng vào tab "Công nợ Kiosk" để kiểm tra chi tiết hóa đơn và gửi thông báo nhắc nợ.</div>
                  </div>
                ) : (
                  <div style={{ background: '#f0fdf4', padding: 14, borderRadius: 8, border: '1px solid #bbf7d0', color: '#15803d', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
                    <CheckCircle2 size={16} /> Kiosk không có khoản công nợ nào quá hạn hoặc tồn đọng.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* MODAL KÝ HỢP ĐỒNG */}
        {hopDongModal && (
          <WorkspaceDialog busy={submitting} title={`Ký Hợp Đồng: ${hopDongModal.ten_kiosk}`} onClose={() => setHopDongModal(null)}>
            <div data-modal-body="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f0f9ff', padding: '12px 14px', borderRadius: 8, border: '1px solid #bae6fd', color: '#0369a1', fontSize: 13, lineHeight: 1.5 }}>
                Mô hình: <b>{LOAI_KIOSK_LABEL[hopDongModal.loai_kiosk] || hopDongModal.loai_kiosk}</b> · {hopDongModal.dia_chi}, {hopDongModal.thanh_pho}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <Label htmlFor="kiosknetworkmanager-field-1" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>Ngày ký *</Label>
                  <Input id="kiosknetworkmanager-field-1"
                    type="date"
                    value={form.ngay_ky}
                    onChange={e => setForm(f => ({ ...f, ngay_ky: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <Label htmlFor="kiosknetworkmanager-field-2" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>Ngày hết hạn *</Label>
                  <Input id="kiosknetworkmanager-field-2"
                    type="date"
                    value={form.ngay_het_han}
                    onChange={e => setForm(f => ({ ...f, ngay_het_han: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <Label htmlFor="kiosknetworkmanager-field-3" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>Tỷ lệ chia sẻ doanh thu (%)</Label>
                  <Input id="kiosknetworkmanager-field-3"
                    type="number"
                    min="1"
                    max="20"
                    step="0.5"
                    value={form.ty_le_royalty_phan_tram}
                    onChange={e => setForm(f => ({ ...f, ty_le_royalty_phan_tram: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <Label htmlFor="kiosknetworkmanager-field-4" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>Số combo khởi điểm</Label>
                  <Input id="kiosknetworkmanager-field-4"
                    type="number"
                    min="0"
                    value={form.so_combo_khoi_diem}
                    onChange={e => setForm(f => ({ ...f, so_combo_khoi_diem: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Label htmlFor="kiosknetworkmanager-field-5" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>Bản scan hợp đồng đã ký (URL)</Label>
                  <Input id="kiosknetworkmanager-field-5"
                    type="text"
                    placeholder="https://avengers-coffee.vn/contracts/HD-KSK001.pdf"
                    value={form.file_hop_dong_url}
                    onChange={e => setForm(f => ({ ...f, file_hop_dong_url: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ background: '#fefce8', padding: '10px 12px', borderRadius: 8, border: '1px solid #fef08a', fontSize: 12, color: '#854d0e', lineHeight: 1.4 }}>
                Hệ thống sẽ tự động cấp {form.so_combo_khoi_diem} combo khởi điểm và chuyển Kiosk sang trạng thái "Đang thiết lập".
              </div>

              <div data-modal-footer="inset" data-modal-actions="true" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <Btn variant="outline" disabled={submitting} onClick={() => setHopDongModal(null)}>Hủy bỏ</Btn>
                <Btn variant="primary" disabled={submitting} onClick={handleTaoHopDong}>
                  {submitting ? 'Đang xử lý...' : 'Xác Nhận Ký Hợp Đồng'}
                </Btn>
              </div>
            </div>
          </WorkspaceDialog>
        )}

        {/* MODAL GIA HẠN HỢP ĐỒNG */}
        {giaHanModal && (
          <WorkspaceDialog busy={submitting} title={`Gia Hạn Hợp Đồng: ${giaHanModal.ten_kiosk}`} onClose={() => setGiaHanModal(null)}>
            <div data-modal-body="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <div>Kiosk: <b>{giaHanModal.ten_kiosk}</b> ({giaHanModal.ma_kiosk})</div>
                <div style={{ marginTop: 2, color: '#64748b', fontSize: 12 }}>Hạn hiện tại: {fmtDate(giaHanModal.hop_dong?.ngay_het_han)}</div>
              </div>

              <div>
                <Label htmlFor="kiosknetworkmanager-field-6" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 5 }}>Ngày hết hạn mới *</Label>
                <Input id="kiosknetworkmanager-field-6"
                  type="date"
                  value={form.ngay_het_han_moi}
                  onChange={e => setForm(f => ({ ...f, ngay_het_han_moi: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', background: '#ffffff', color: '#0f172a', boxSizing: 'border-box' }}
                />
              </div>

              <div data-modal-footer="inset" data-modal-actions="true" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <Btn variant="outline" disabled={submitting} onClick={() => setGiaHanModal(null)}>Hủy bỏ</Btn>
                <Btn variant="success" disabled={submitting} onClick={handleGiaHan}>
                  {submitting ? 'Đang gia hạn...' : 'Xác Nhận Gia Hạn'}
                </Btn>
              </div>
            </div>
          </WorkspaceDialog>
        )}

        {/* MODAL CHẤM DỨT HỢP ĐỒNG */}
        {chamDutModal && (
          <WorkspaceDialog busy={submitting} title={`Chấm Dứt Hợp Đồng: ${chamDutModal.ten_kiosk}`} onClose={() => setChamDutModal(null)}>
            <div data-modal-body="true" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#fef2f2', padding: 14, borderRadius: 8, border: '1px solid #fecaca', color: '#991b1b', fontSize: 13, lineHeight: 1.5 }}>
                Cảnh báo: Hành động này sẽ chuyển trạng thái Kiosk <b>{chamDutModal.ten_kiosk}</b> sang <b>"Ngừng hoạt động"</b> và đóng hợp đồng hiện tại.
              </div>

              <div data-modal-footer="inset" data-modal-actions="true" style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <Btn variant="outline" disabled={submitting} onClick={() => setChamDutModal(null)}>Hủy bỏ</Btn>
                <Btn variant="danger" disabled={submitting} onClick={handleChamDut}>
                  {submitting ? 'Đang chấm dứt...' : 'Xác Nhận Chấm Dứt'}
                </Btn>
              </div>
            </div>
          </WorkspaceDialog>
        )}
      </div>
    )
  }

  // ═════════════════════════════════════════════════════════════════════════
  // VIEW 1: BẢNG DANH SÁCH MẠNG LƯỚI KIOSK (Data Table View)
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <div className="franchise-network" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* 1. Header & KPI Pipeline */}
      <div className="franchise-pipeline" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { key: '', label: 'TẤT CẢ KIOSK', val: stats.tong, color: '#0f172a', sub: 'Toàn mạng lưới' },
          { key: 'DANG_HOAT_DONG', label: 'ĐANG HOẠT ĐỘNG', val: stats.hoat_dong, color: '#15803d', sub: 'Bán hàng thường xuyên' },
          { key: 'CHO_KY_HOP_DONG', label: 'CHỜ KÝ HỢP ĐỒNG', val: stats.cho_ky, color: '#0284c7', sub: 'Đã cọc, chờ ký HĐ' },
          { key: 'DANG_THIET_LAP', label: 'ĐANG THIẾT LẬP', val: stats.thiet_lap, color: '#d97706', sub: 'Chuẩn bị khai trương' },
          { key: 'NGUNG_HOAT_DONG', label: 'TẠM DỪNG / NGỪNG', val: stats.ngung, color: '#dc2626', sub: 'Khóa / Dừng hợp đồng' },
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
                boxShadow: isAct ? '0 4px 12px rgba(178, 40, 48, 0.08)' : '0 1px 3px 0 rgba(0, 0, 0, 0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: isAct ? '#16354d' : '#64748b', fontWeight: 600, letterSpacing: '0.04em' }}>
                  {card.label}
                </span>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: card.color }} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {card.val}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                {card.sub}
              </div>
            </Button>
          )
        })}
      </div>

      {/* 2. Thanh tìm kiếm & Bộ lọc - GOM GỌN 1 HÀNG NGANG */}
      <div 
        className="franchise-toolbar"
        style={{
          background: '#ffffff',
          padding: '12px 16px',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)'
        }}
      >
        {/* Input search */}
        <div className="franchise-search-box" style={{ position: 'relative', flex: '1 1 240px', minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <Input
            type="text"
            placeholder="Tìm theo tên Kiosk, mã KSK, địa chỉ, thành phố..."
            value={keyword}
            onChange={e => { setKeyword(e.target.value); setPage(1); }}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              fontSize: 13,
              outline: 'none',
              background: '#f8fafc',
              boxSizing: 'border-box',
              color: '#0f172a'
            }}
          />
        </div>

        {/* Lọc Trạng thái */}
        <SearchableSelect
          className="franchise-filter-select"
          value={filterStatus} 
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 160, maxWidth: 220, flex: '0 0 auto', padding: '8px 32px 8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#ffffff', color: '#0f172a', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi trạng thái --</option>
          <option value="DANG_HOAT_DONG">Đang hoạt động</option>
          <option value="CHO_KY_HOP_DONG">Chờ ký hợp đồng</option>
          <option value="DANG_THIET_LAP">Đang thiết lập</option>
          <option value="TAM_DUNG">Tạm dừng</option>
          <option value="NGUNG_HOAT_DONG">Ngừng hoạt động</option>
        </SearchableSelect>

        {/* Lọc Mô hình */}
        <SearchableSelect
          className="franchise-filter-select"
          value={filterLoai} 
          onChange={e => { setFilterLoai(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 160, maxWidth: 220, flex: '0 0 auto', padding: '8px 32px 8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#ffffff', color: '#0f172a', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi mô hình --</option>
          <option value="XE_LUU_DONG">Xe Lưu Động</option>
          <option value="KIOSK_CO_DINH">Kiosk Cố Định</option>
          <option value="CONTAINER_CAFE">Container Cafe</option>
          <option value="PREMIUM">Kiosk Tiêu Chuẩn</option>
        </SearchableSelect>

        {/* Lọc Xếp hạng */}
        <SearchableSelect
          className="franchise-filter-select"
          value={filterRank} 
          onChange={e => { setFilterRank(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 160, maxWidth: 220, flex: '0 0 auto', padding: '8px 32px 8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#ffffff', color: '#0f172a', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi xếp hạng --</option>
          <option value="S">Hạng S (Từ 90 điểm)</option>
          <option value="A">Hạng A (Từ 70 điểm)</option>
          <option value="B">Hạng B (Từ 50 điểm)</option>
          <option value="C">Hạng C (Dưới 50 điểm)</option>
        </SearchableSelect>

        <Btn variant="outline" onClick={() => load(true)} style={{ flex: '0 0 auto' }}>
          <RefreshCw size={14} /> Làm mới
        </Btn>
      </div>

      <FranchiseFeedback message={msg} onClose={() => setMsg(null)} />

      {/* 3. BẢNG DỮ LIỆU KIOSK */}
      {loading ? (
        <KioskTableLoading label="Đang tải dữ liệu" />
      ) : (
        <div style={{ background: '#ffffff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.02)' }}>
          <div className="console-table-scroll">
            <Table className="franchise-fit-table network-list-table">
              <colgroup><col style={{width:'13%'}}/><col style={{width:'33%'}}/><col style={{width:'18%'}}/><col style={{width:'18%'}}/><col style={{width:'18%'}}/></colgroup>
              <thead><tr><th>Mã kiosk</th><th>Điểm bán</th><th>Mô hình</th><th>Trạng thái</th><th>Hạn hợp đồng</th></tr></thead>
              <tbody>{currentKiosks.map(k=><tr key={k.id} className="franchise-click-row" onClick={()=>setSelectedKiosk(k)}>
                <td><button type="button" className="franchise-detail-link" aria-label={`Chi tiết ${k.ma_kiosk}`} onClick={event=>{event.stopPropagation();setSelectedKiosk(k)}}><span className="franchise-code">{k.ma_kiosk}</span></button></td>
                <td><strong>{k.ten_kiosk}</strong><small>{[k.dia_chi,k.thanh_pho].filter(Boolean).join(', ')}</small></td>
                <td>{LOAI_KIOSK_LABEL[k.loai_kiosk] || k.loai_kiosk}</td><td><Badge status={k.trang_thai}/></td>
                <td>{k.hop_dong ? <><strong>{fmtDate(k.hop_dong.ngay_het_han)}</strong><small>{Number(k.so_combo_hien_tai || 0)} combo trong kho</small></> : <small>Chưa ký hợp đồng</small>}</td>
              </tr>)}{!currentKiosks.length && <tr><td colSpan={5} className="franchise-empty">Không tìm thấy kiosk phù hợp.</td></tr>}</tbody>
            </Table>
          </div>

          {/* Phân trang */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Hiển thị trang <b>{page}</b> / <b>{totalPages}</b> (Tổng số <b>{filteredKiosks.length}</b> Kiosk)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn
                  variant="outline"
                  small
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  ← Trước
                </Btn>
                <Btn
                  variant="outline"
                  small
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  Sau →
                </Btn>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
