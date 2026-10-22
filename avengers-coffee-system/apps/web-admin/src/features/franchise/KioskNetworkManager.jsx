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
import { getAdminSession } from '../../lib/adminFetch'
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
  CHO_KY_HOP_DONG: { label: 'Chờ ký HĐ', color: '#0284c7' },
  DANG_THIET_LAP: { label: 'Đang thiết lập', color: '#d97706' },
  DANG_HOAT_DONG: { label: 'Đang hoạt động', color: '#16a34a' },
  TAM_DUNG: { label: 'Tạm dừng', color: '#ea580c' },
  NGUNG_HOAT_DONG: { label: 'Ngừng hoạt động', color: '#dc2626' },
};

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

// Client-side cache to guarantee instant 0ms switching
let kioskClientCache = { data: null, timestamp: 0 };

export function KioskNetworkManager() {
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
    if (!confirm(`Xác nhận Kiosk "${ten}" đã hoàn tất thiết lập và chính thức khai trương hoạt động?`)) return
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
    if (!confirm(`Mở khóa cho phép Kiosk "${kiosk.ten_kiosk}" hoạt động trở lại?`)) return
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
      <div style={{ animation: 'fadeIn 0.2s ease-in-out', paddingBottom: 32 }}>
        {/* Navigation bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setSelectedKiosk(null)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
                border: '1px solid #cbd5e1', background: '#fff', color: '#334155', cursor: 'pointer', fontSize: 13, fontWeight: 500
              }}
            >
              <ArrowLeft size={16} /> Danh sách Kiosk
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#0f172a' }}>{k.ten_kiosk}</h3>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0' }}>
                  {k.ma_kiosk}
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', fontSize: 12, fontWeight: 500,
                  color: st.color, background: '#f8fafc', border: `1px solid ${st.color}33`, borderRadius: 99
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color }} />
                  {st.label}
                </span>
                {k.xep_hang && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600,
                    color: rankColor, background: '#f8fafc', border: `1px solid ${rankColor}33`, borderRadius: 6
                  }}>
                    <Award size={13} /> Hạng {k.xep_hang} ({k.diem_danh_gia || 100}/100)
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                {k.dia_chi}, {k.phuong_xa ? `${k.phuong_xa}, ` : ''}{k.thanh_pho} · Ngày tạo: {fmtDate(k.ngay_tao)}
              </div>
            </div>
          </div>

          <button
            onClick={() => load(true)}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <RefreshCw size={14} /> Làm mới
          </button>
        </div>

        {msg && (
          <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 16, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}`, color: msg.type === 'success' ? '#166534' : '#991b1b', fontSize: 13, fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'inherit' }}>×</button>
          </div>
        )}

        {/* Bố cục 2 Cột */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
          {/* CỘT TRÁI: THÔNG TIN KIOSK & HỢP ĐỒNG */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Điểm bán & Địa điểm */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Store size={18} color="var(--primary, #0f172a)" /> Thông Tin Điểm Bán Kiosk
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Tên điểm bán:</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{k.ten_kiosk}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Mã định danh Kiosk:</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontFamily: 'monospace', marginTop: 2 }}>{k.ma_kiosk}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Mô hình Kiosk:</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{LOAI_KIOSK_LABEL[k.loai_kiosk] || k.loai_kiosk}</div>
                </div>
                <div>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Tỉnh / Thành phố:</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{k.thanh_pho}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Địa chỉ cụ thể:</div>
                  <div style={{ fontWeight: 500, color: '#0f172a', marginTop: 2 }}>{k.dia_chi}{k.phuong_xa ? `, ${k.phuong_xa}` : ''}</div>
                </div>
              </div>
            </div>

            {/* 2. Hợp đồng nhượng quyền */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={18} color="var(--primary, #0f172a)" /> Hợp Đồng Nhượng Quyền
              </h4>
              {k.hop_dong ? (
                <div style={{ display: 'grid', gap: 12, fontSize: 13 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>Ngày ký hợp đồng:</div>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{fmtDate(k.hop_dong.ngay_ky)}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>Ngày hết hạn:</div>
                      <div style={{ fontWeight: 600, marginTop: 2, color: isExpired ? '#dc2626' : isExpiringSoon ? '#ea580c' : '#0f172a' }}>
                        {fmtDate(k.hop_dong.ngay_het_han)}
                        {isExpired && ' (Quá hạn)'}
                        {isExpiringSoon && ` (Còn ${daysLeft} ngày)`}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>Tỷ lệ phí Royalty:</div>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{k.hop_dong.ty_le_royalty_phan_tram || 7}% / tháng</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', fontSize: 12 }}>Combo khởi điểm bàn giao:</div>
                      <div style={{ fontWeight: 600, color: '#0f172a', marginTop: 2 }}>{k.hop_dong.so_combo_khoi_diem || 5} combo</div>
                    </div>
                  </div>

                  {k.hop_dong.file_hop_dong_url && (
                    <div style={{ marginTop: 6, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                      <a 
                        href={k.hop_dong.file_hop_dong_url} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#0284c7', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}
                      >
                        <ExternalLink size={13} /> Xem bản scan hợp đồng đã ký
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: '14px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 13, color: '#64748b' }}>
                  Kiosk này chưa có thông tin hợp đồng được ký kết. Hãy nhấn <b>"Ký hợp đồng"</b> ở cột bên phải để hoàn thiện thủ tục.
                </div>
              )}
            </div>

            {/* 3. Tồn kho combo & Xếp hạng */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={18} color="var(--primary, #0f172a)" /> Tồn Kho Combo & Đánh Giá Vận Hành
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Số Combo còn trong kho:</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: (k.so_combo_hien_tai || 0) < 3 ? '#dc2626' : '#0f172a', marginTop: 4 }}>
                    {k.so_combo_hien_tai || 0} combo
                  </div>
                  {(k.so_combo_hien_tai || 0) < 3 && (
                    <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={12} /> Cảnh báo: Sắp cạn combo nguyên liệu
                    </div>
                  )}
                </div>

                <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div style={{ color: '#64748b', fontSize: 12 }}>Điểm uy tín vận hành:</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: rankColor, marginTop: 4 }}>
                    {k.diem_danh_gia || 100} / 100
                  </div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                    Xếp hạng: <b>Hạng {k.xep_hang || 'A'}</b>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: TRUNG TÂM THAO TÁC NGHIỆP VỤ & TÀI CHÍNH */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Thao tác nghiệp vụ theo trạng thái */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1.5px solid #e2e8f0', padding: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
                Thao Tác Nghiệp Vụ Kiosk
              </h4>

              {/* TRƯỜNG HỢP 1: CHỜ KÝ HỢP ĐỒNG */}
              {k.trang_thai === 'CHO_KY_HOP_DONG' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 8, border: '1px solid #bae6fd', color: '#0369a1', fontSize: 13 }}>
                    Đối tác đã hoàn tất nộp cọc. Cần thiết lập hợp đồng chính thức, bàn giao combo khởi điểm để chuyển Kiosk sang trạng thái thiết lập.
                  </div>
                  <button
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
                    style={{
                      padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--primary, #0f172a)',
                      color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center'
                    }}
                  >
                    <FileText size={16} /> Ký Hợp Đồng Nhượng Quyền
                  </button>
                </div>
              )}

              {/* TRƯỜNG HỢP 2: ĐANG THIẾT LẬP */}
              {k.trang_thai === 'DANG_THIET_LAP' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: '#fefce8', padding: 12, borderRadius: 8, border: '1px solid #fef08a', color: '#854d0e', fontSize: 13 }}>
                    Kiosk đang trong giai đoạn chuẩn bị mặt bằng và nhận bàn giao xe/trang thiết bị. Khi điểm bán hoàn tất sẵn sàng bán hàng, nhấn xác nhận để chính thức hoạt động.
                  </div>
                  <button
                    onClick={() => handleKhaiTruong(k.id, k.ten_kiosk)}
                    disabled={submitting}
                    style={{
                      padding: '10px 18px', borderRadius: 8, border: 'none', background: '#16a34a',
                      color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center'
                    }}
                  >
                    <Sparkles size={16} /> Xác Nhận Khai Trương Điểm Bán
                  </button>
                </div>
              )}

              {/* TRƯỜNG HỢP 3: ĐANG HOẠT ĐỘNG HOẶC TẠM DỪNG */}
              {(k.trang_thai === 'DANG_HOAT_DONG' || k.trang_thai === 'TAM_DUNG') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: k.trang_thai === 'DANG_HOAT_DONG' ? '#f0fdf4' : '#fff7ed', padding: 12, borderRadius: 8, border: `1px solid ${k.trang_thai === 'DANG_HOAT_DONG' ? '#bbf7d0' : '#ffedd5'}`, color: k.trang_thai === 'DANG_HOAT_DONG' ? '#166534' : '#c2410c', fontSize: 13 }}>
                    {k.trang_thai === 'DANG_HOAT_DONG' ? 'Kiosk đang hoạt động bình thường trên toàn hệ thống.' : 'Kiosk đang tạm dừng phục vụ.'}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        setGiaHanModal(k)
                        setForm(f => ({ ...f, ngay_het_han_moi: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0] }))
                      }}
                      style={{
                        padding: '9px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff',
                        color: '#334155', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <Calendar size={15} /> Gia Hạn Hợp Đồng
                    </button>
                    <button
                      onClick={() => setChamDutModal(k)}
                      style={{
                        padding: '9px 16px', borderRadius: 8, border: '1px solid #fecaca', background: '#fff',
                        color: '#dc2626', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                      }}
                    >
                      <XCircle size={15} /> Chấm Dứt Hợp Đồng
                    </button>
                  </div>
                </div>
              )}

              {/* TRƯỜNG HỢP 4: NGỪNG HOẠT ĐỘNG */}
              {k.trang_thai === 'NGUNG_HOAT_DONG' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
                    Kiosk này đã bị khóa hoặc chấm dứt hợp đồng.
                  </div>
                  <button
                    onClick={() => handleMoKhoa(k)}
                    disabled={submitting}
                    style={{
                      padding: '10px 18px', borderRadius: 8, border: 'none', background: '#16a34a',
                      color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center'
                    }}
                  >
                    <Unlock size={16} /> Mở Khóa Cho Hoạt Động Lại
                  </button>
                </div>
              )}
            </div>

            {/* 2. Tình hình công nợ & Tài chính */}
            <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <DollarSign size={18} color="var(--primary, #0f172a)" /> Tình Trạng Công Nợ Kiosk
              </h4>
              <div style={{ fontSize: 13 }}>
                {k.so_cong_no_chua_thanh_toan > 0 ? (
                  <div style={{ background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca', color: '#991b1b' }}>
                    <div style={{ fontWeight: 600 }}>Phát hiện {k.so_cong_no_chua_thanh_toan} khoản nợ chưa tất toán</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Vui lòng vào tab "Công nợ Kiosk" để kiểm tra chi tiết hóa đơn và gửi thông báo nhắc nợ.</div>
                  </div>
                ) : (
                  <div style={{ background: '#f0fdf4', padding: 12, borderRadius: 8, border: '1px solid #bbf7d0', color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} /> Kiosk không có khoản công nợ nào quá hạn hoặc tồn đọng.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* MODAL KÝ HỢP ĐỒNG */}
        {hopDongModal && (
          <WorkspaceDialog title={`Ký Hợp Đồng: ${hopDongModal.ten_kiosk}`} onClose={() => setHopDongModal(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 8, border: '1px solid #bae6fd', color: '#0369a1', fontSize: 13 }}>
                Mô hình: <b>{LOAI_KIOSK_LABEL[hopDongModal.loai_kiosk] || hopDongModal.loai_kiosk}</b> · {hopDongModal.dia_chi}, {hopDongModal.thanh_pho}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Ngày ký *</label>
                  <input
                    type="date"
                    value={form.ngay_ky}
                    onChange={e => setForm(f => ({ ...f, ngay_ky: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Ngày hết hạn *</label>
                  <input
                    type="date"
                    value={form.ngay_het_han}
                    onChange={e => setForm(f => ({ ...f, ngay_het_han: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Tỷ lệ phí Royalty (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    step="0.5"
                    value={form.ty_le_royalty_phan_tram}
                    onChange={e => setForm(f => ({ ...f, ty_le_royalty_phan_tram: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Số combo khởi điểm</label>
                  <input
                    type="number"
                    min="0"
                    value={form.so_combo_khoi_diem}
                    onChange={e => setForm(f => ({ ...f, so_combo_khoi_diem: Number(e.target.value) }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Bản scan hợp đồng đã ký (URL)</label>
                  <input
                    type="text"
                    placeholder="https://avengers-coffee.vn/contracts/HD-KSK001.pdf"
                    value={form.file_hop_dong_url}
                    onChange={e => setForm(f => ({ ...f, file_hop_dong_url: e.target.value }))}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ background: '#fefce8', padding: 10, borderRadius: 8, fontSize: 12, color: '#854d0e' }}>
                Hệ thống sẽ tự động cấp {form.so_combo_khoi_diem} combo khởi điểm và chuyển Kiosk sang trạng thái "Đang thiết lập".
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setHopDongModal(null)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 13 }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleTaoHopDong}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--primary, #0f172a)', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Xác Nhận Ký Hợp Đồng
                </button>
              </div>
            </div>
          </WorkspaceDialog>
        )}

        {/* MODAL GIA HẠN HỢP ĐỒNG */}
        {giaHanModal && (
          <WorkspaceDialog title={`Gia Hạn Hợp Đồng: ${giaHanModal.ten_kiosk}`} onClose={() => setGiaHanModal(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}>
                <div>Kiosk: <b>{giaHanModal.ten_kiosk}</b> ({giaHanModal.ma_kiosk})</div>
                <div style={{ marginTop: 2, color: '#64748b' }}>Hạn hiện tại: {fmtDate(giaHanModal.hop_dong?.ngay_het_han)}</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4 }}>Ngày hết hạn mới *</label>
                <input
                  type="date"
                  value={form.ngay_het_han_moi}
                  onChange={e => setForm(f => ({ ...f, ngay_het_han_moi: e.target.value }))}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setGiaHanModal(null)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 13 }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleGiaHan}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Xác Nhận Gia Hạn
                </button>
              </div>
            </div>
          </WorkspaceDialog>
        )}

        {/* MODAL CHẤM DỨT HỢP ĐỒNG */}
        {chamDutModal && (
          <WorkspaceDialog title={`Chấm Dứt Hợp Đồng: ${chamDutModal.ten_kiosk}`} onClose={() => setChamDutModal(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#fef2f2', padding: 14, borderRadius: 8, border: '1px solid #fecaca', color: '#991b1b', fontSize: 13 }}>
                Cảnh báo: Hành động này sẽ chuyển trạng thái Kiosk <b>{chamDutModal.ten_kiosk}</b> sang <b>"Ngừng hoạt động"</b> và đóng hợp đồng hiện tại.
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10, paddingTop: 14, borderTop: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setChamDutModal(null)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#475569', cursor: 'pointer', fontSize: 13 }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleChamDut}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  Xác Nhận Chấm Dứt
                </button>
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
    <div style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
      {/* 1. Header & KPI Pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { key: '', label: 'TẤT CẢ KIOSK', val: stats.tong, color: '#0f172a', sub: 'Toàn mạng lưới' },
          { key: 'DANG_HOAT_DONG', label: 'ĐANG HOẠT ĐỘNG', val: stats.hoat_dong, color: '#16a34a', sub: 'Bán hàng thường xuyên' },
          { key: 'CHO_KY_HOP_DONG', label: 'CHỜ KÝ HỢP ĐỒNG', val: stats.cho_ky, color: '#0284c7', sub: 'Đã cọc, chờ ký HĐ' },
          { key: 'DANG_THIET_LAP', label: 'ĐANG THIẾT LẬP', val: stats.thiet_lap, color: '#d97706', sub: 'Chuẩn bị khai trương' },
          { key: 'NGUNG_HOAT_DONG', label: 'TẠM DỪNG / NGỪNG', val: stats.ngung, color: '#dc2626', sub: 'Khóa / Dừng hợp đồng' },
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

      {/* 2. Thanh tìm kiếm & Bộ lọc - GOM GỌN 1 HÀNG NGANG */}
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
            placeholder="Tìm theo tên Kiosk, mã KSK, địa chỉ, thành phố..."
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
          <option value="DANG_HOAT_DONG">Đang hoạt động</option>
          <option value="CHO_KY_HOP_DONG">Chờ ký hợp đồng</option>
          <option value="DANG_THIET_LAP">Đang thiết lập</option>
          <option value="TAM_DUNG">Tạm dừng</option>
          <option value="NGUNG_HOAT_DONG">Ngừng hoạt động</option>
        </select>

        {/* Lọc Mô hình */}
        <select 
          className="franchise-filter-select"
          value={filterLoai} 
          onChange={e => { setFilterLoai(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 160, maxWidth: 220, flex: '0 0 auto', padding: '7px 32px 7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi mô hình --</option>
          <option value="XE_LUU_DONG">Xe Lưu Động</option>
          <option value="KIOSK_CO_DINH">Kiosk Cố Định</option>
          <option value="CONTAINER_CAFE">Container Cafe</option>
          <option value="PREMIUM">Kiosk Tiêu Chuẩn</option>
        </select>

        {/* Lọc Xếp hạng */}
        <select 
          className="franchise-filter-select"
          value={filterRank} 
          onChange={e => { setFilterRank(e.target.value); setPage(1); }}
          style={{ width: 'auto', minWidth: 160, maxWidth: 220, flex: '0 0 auto', padding: '7px 32px 7px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}
        >
          <option value="">-- Mọi xếp hạng --</option>
          <option value="S">Hạng S (Từ 90 điểm)</option>
          <option value="A">Hạng A (Từ 70 điểm)</option>
          <option value="B">Hạng B (Từ 50 điểm)</option>
          <option value="C">Hạng C (Dưới 50 điểm)</option>
        </select>

        <button
          onClick={() => load(true)}
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

      {/* 3. BẢNG DỮ LIỆU KIOSK */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>Đang tải danh sách mạng lưới Kiosk...</div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <div className="console-table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 12, fontWeight: 600 }}>
                  <th style={{ padding: '12px 14px' }}>Mã Kiosk</th>
                  <th style={{ padding: '12px 14px' }}>Tên Kiosk & Địa điểm</th>
                  <th style={{ padding: '12px 14px' }}>Mô hình</th>
                  <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>Hạng / Điểm</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>Combo kho</th>
                  <th style={{ padding: '12px 14px' }}>Hạn HĐ & Royalty</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>Công nợ</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {currentKiosks.map(k => {
                  const st = STATUS_KIOSK[k.trang_thai] || { label: k.trang_thai, color: '#64748b' }
                  const rankColor = k.xep_hang === 'S' ? '#d97706' : k.xep_hang === 'A' ? '#0284c7' : k.xep_hang === 'B' ? '#16a34a' : '#dc2626'
                  const daysLeft = k.hop_dong?.ngay_het_han ? Math.ceil((new Date(k.hop_dong.ngay_het_han).getTime() - Date.now()) / (1000 * 3600 * 24)) : null
                  const isExpiringSoon = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0
                  const isExpired = daysLeft !== null && daysLeft < 0

                  return (
                    <tr
                      key={k.id}
                      onClick={() => setSelectedKiosk(k)}
                      style={{
                        borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background .15s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
                      title="Bấm vào để xem trang chi tiết và quản lý Kiosk này"
                    >
                      {/* Mã Kiosk */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 12, fontFamily: 'monospace' }}>
                          {k.ma_kiosk}
                        </span>
                      </td>

                      {/* Tên Kiosk & Địa điểm */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{k.ten_kiosk}</div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                          {k.dia_chi}, {k.thanh_pho}
                        </div>
                      </td>

                      {/* Mô hình */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 12, color: '#334155', fontWeight: 500 }}>
                          {LOAI_KIOSK_LABEL[k.loai_kiosk] || k.loai_kiosk}
                        </span>
                      </td>

                      {/* Trạng thái */}
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', fontSize: 12, fontWeight: 500,
                          color: st.color, background: '#f8fafc', border: `1px solid ${st.color}33`, borderRadius: 6
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color }} />
                          {st.label}
                        </span>
                      </td>

                      {/* Hạng / Điểm */}
                      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {k.xep_hang ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', fontSize: 12, fontWeight: 600,
                            color: rankColor, background: '#f8fafc', border: `1px solid ${rankColor}33`, borderRadius: 6
                          }}>
                            Hạng {k.xep_hang} ({k.diem_danh_gia || 100})
                          </span>
                        ) : '—'}
                      </td>

                      {/* Combo kho */}
                      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, color: (k.so_combo_hien_tai || 0) < 3 ? '#dc2626' : '#0f172a' }}>
                          {k.so_combo_hien_tai || 0}
                        </span>
                      </td>

                      {/* Hạn HĐ & Royalty */}
                      <td style={{ padding: '12px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {k.hop_dong ? (
                          <div>
                            <div style={{ color: '#0f172a', fontWeight: 500 }}>Royalty: {k.hop_dong.ty_le_royalty_phan_tram || 7}%</div>
                            <div style={{
                              color: isExpired ? '#dc2626' : isExpiringSoon ? '#ea580c' : '#64748b',
                              fontWeight: (isExpired || isExpiringSoon) ? 600 : 400,
                              fontSize: 11, marginTop: 1
                            }}>
                              Hết hạn: {fmtDate(k.hop_dong.ngay_het_han)}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>Chưa có HĐ</span>
                        )}
                      </td>

                      {/* Công nợ */}
                      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {k.so_cong_no_chua_thanh_toan > 0 ? (
                          <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontWeight: 600, border: '1px solid #fecaca' }}>
                            {k.so_cong_no_chua_thanh_toan} khoản
                          </span>
                        ) : (
                          <span style={{ color: '#16a34a', fontSize: 12 }}>0</span>
                        )}
                      </td>

                      {/* Chi tiết */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff',
                          color: '#334155', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4
                        }}>
                          Chi tiết <ArrowRight size={13} />
                        </span>
                      </td>
                    </tr>
                  )
                })}

                {filteredKiosks.length === 0 && (
                  <tr>
                    <td colSpan="9" style={{ textAlign: 'center', padding: 48, color: '#94a3b8' }}>
                      Không tìm thấy Kiosk nào phù hợp với bộ lọc hiện tại.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Phân trang */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Hiển thị trang <b>{page}</b> / <b>{totalPages}</b> (Tổng số <b>{filteredKiosks.length}</b> Kiosk)
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 12, opacity: page <= 1 ? 0.5 : 1 }}
                >
                  ← Trước
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize: 12, opacity: page >= totalPages ? 0.5 : 1 }}
                >
                  Sau →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
