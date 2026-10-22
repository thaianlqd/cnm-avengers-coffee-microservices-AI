import React, { useState, useEffect } from 'react'
import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import SearchableSelect from '../../../components/console/SearchableSelect'
import { PaginatedList } from '../../../components/console/CompactPagination'
import {
  Store,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  FileText,
  AlertTriangle,
  Building2,
  Calendar,
  Printer,
  X,
  Star,
  MessageSquare,
  PauseCircle,
  PowerOff,
  Trash2,
  Eye,
  MapPin,
  ChevronRight,
  ArrowLeft,
  ExternalLink,
  Sparkles as WorkspaceSymbolSparkles
} from '../../../components/console/WorkspaceIcons'
import { GlobalLoading, GlobalSpinner } from '../../../components/console/GlobalLoading'
import { API_BASE_URL } from '../../admin-dashboard/constants'
import { getAdminAccessToken } from '../../../lib/adminFetch'

// Module-level cache for instant tab navigation without reload lag
let kioskMemoryCache = null
let kioskCacheTimestamp = 0
const KIOSK_CACHE_KEY = 'avengers_admin_kiosks_cache'
const CACHE_TTL_MS = 120 * 1000 // 2 minutes fresh cache

function getStoredKiosks() {
  if (kioskMemoryCache && (Date.now() - kioskCacheTimestamp < CACHE_TTL_MS)) {
    return kioskMemoryCache
  }
  try {
    const raw = sessionStorage.getItem(KIOSK_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.data) && parsed.data.length > 0) {
        kioskMemoryCache = parsed.data
        kioskCacheTimestamp = parsed.timestamp || Date.now()
        return parsed.data
      }
    }
  } catch {
    // ignore
  }
  return kioskMemoryCache
}

function saveStoredKiosks(data) {
  kioskMemoryCache = data
  kioskCacheTimestamp = Date.now()
  try {
    sessionStorage.setItem(KIOSK_CACHE_KEY, JSON.stringify({
      data,
      timestamp: kioskCacheTimestamp
    }))
  } catch {
    // ignore
  }
}

function removeVietnameseTones(str) {
  if (!str) return ''
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim()
}

function normalizeCode(str) {
  if (!str) return ''
  return String(str).toLowerCase().replace(/[^a-z0-9]/g, '')
}

function fmtDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('vi-VN')
  } catch {
    return String(d)
  }
}

export function AdminKioskManagementPanel({ session }) {
  const initialCache = getStoredKiosks()
  const [kiosks, setKiosks] = useState(() => initialCache || [])
  const [loading, setLoading] = useState(() => !initialCache || initialCache.length === 0)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedKiosk, setSelectedKiosk] = useState(null)
  const [contractModal, setContractModal] = useState(null)
  const [reviewModal, setReviewModal] = useState(null)
  const [reviews, setReviews] = useState([])
  const [loadingReviews, setLoadingReviews] = useState(false)
  const [reviewStats, setReviewStats] = useState({ avg: 0, total: 0 })
  const [activeActionMenuId, setActiveActionMenuId] = useState(null)

  // Sync selectedKiosk with updated kiosks list
  useEffect(() => {
    if (selectedKiosk) {
      const fresh = kiosks.find((k) => k.id === selectedKiosk.id)
      if (fresh) {
        setSelectedKiosk(fresh)
      }
    }
  }, [kiosks])

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.kiosk-action-dropdown-wrap')) {
        setActiveActionMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const loadKiosks = async (forceRefresh = false) => {
    const cached = getStoredKiosks()

    if (!forceRefresh && cached && cached.length > 0) {
      setKiosks(cached)
      setLoading(false)
      // Background silent revalidation
    } else {
      if (forceRefresh) {
        setRefreshing(true)
      } else if (!kiosks || kiosks.length === 0) {
        setLoading(true)
      }
    }

    try {
      setError(null)
      const token = getAdminAccessToken() || session?.token || session?.accessToken

      let res = await fetch(`${API_BASE_URL}/franchise/kiosk`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })

      if (!res.ok) {
        res = await fetch(`${API_BASE_URL}/franchise/kiosk/public`)
      }

      if (!res.ok) throw new Error('Không thể tải danh sách Kiosk từ máy chủ')

      const data = await res.json()
      const arr = Array.isArray(data) ? data : data?.data || data?.items || []
      const normalized = arr.map((item) => ({
        ...item,
        trang_thai: item.trang_thai || 'DANG_HOAT_DONG',
      }))
      setKiosks(normalized)
      saveStoredKiosks(normalized)
    } catch (err) {
      if (!cached || cached.length === 0) {
        setError(err.message || 'Lỗi khi tải danh sách Kiosk')
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadKiosks()
  }, [session])

  // Actions
  const handleSignContract = async (k) => {
    if (!window.confirm(`Xác nhận tạo và ký hợp đồng cho Kiosk ${k.ten_kiosk} (${k.ma_kiosk}) với mức Royalty mặc định 7%?`)) return
    try {
      const fileUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
      const token = getAdminAccessToken() || session?.token
      const res = await fetch(`${API_BASE_URL}/franchise/kiosk/${k.id}/hop-dong`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ngay_ky: new Date().toISOString(),
          ngay_het_han: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
          ty_le_royalty_phan_tram: 7,
          so_combo_khoi_diem: 5,
          file_hop_dong_url: fileUrl
        })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert('Lỗi: ' + (err.message || 'Ký hợp đồng thất bại'))
        return
      }

      alert('Ký hợp đồng thành công! Kiosk đã chuyển sang trạng thái Đang thiết lập.')
      loadKiosks()
      setSelectedKiosk((prev) => prev && prev.id === k.id ? { ...prev, trang_thai: 'DANG_THIET_LAP' } : prev)
    } catch (e) {
      alert('Lỗi: ' + e.message)
    }
  }

  const handleLaunchKiosk = async (k) => {
    if (!window.confirm(`Xác nhận Kiosk ${k.ten_kiosk} đã hoàn tất thiết lập và sẵn sàng khai trương hoạt động?`)) return
    try {
      const token = getAdminAccessToken() || session?.token
      const res = await fetch(`${API_BASE_URL}/franchise/kiosk/${k.id}/khai-truong`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        }
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert('Lỗi: ' + (err.message || 'Khai trương thất bại'))
        return
      }

      alert('Khai trương thành công! Kiosk đã chính thức Đang hoạt động.')
      loadKiosks()
      setSelectedKiosk((prev) => prev && prev.id === k.id ? { ...prev, trang_thai: 'DANG_HOAT_DONG' } : prev)
    } catch (e) {
      alert('Lỗi: ' + e.message)
    }
  }

  const handleToggleStatus = async (k, newStatus) => {
    try {
      const token = getAdminAccessToken() || session?.token
      await fetch(`${API_BASE_URL}/franchise/kiosk/${k.id}/trang-thai`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trang_thai: newStatus })
      })
      loadKiosks()
      setSelectedKiosk((prev) => prev && prev.id === k.id ? { ...prev, trang_thai: newStatus } : prev)
    } catch (e) {
      alert('Lỗi: ' + e.message)
    }
  }

  const handleCloseKiosk = async (k) => {
    if (!window.confirm(`Bạn có chắc chắn muốn đóng điểm Kiosk ${k.ten_kiosk} (${k.ma_kiosk}) vĩnh viễn?`)) return
    handleToggleStatus(k, 'NGUNG_HOAT_DONG')
  }

  const handleDeleteKiosk = async (k) => {
    if (!window.confirm(`CẢNH BÁO: Kiosk ${k.ten_kiosk} (${k.ma_kiosk}) sẽ bị XÓA VĨNH VIỄN khỏi hệ thống. Hành động này không thể hoàn tác. Bạn có chắc chắn?`)) return
    try {
      const token = getAdminAccessToken() || session?.token
      const res = await fetch(`${API_BASE_URL}/franchise/kiosk/${k.id}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Xóa Kiosk thất bại')
      }
      alert('Đã xóa Kiosk thành công!')
      setSelectedKiosk(null)
      loadKiosks()
    } catch (err) {
      alert('Lỗi: ' + err.message)
    }
  }

  const openReviewModal = async (kiosk) => {
    setReviewModal(kiosk)
    setLoadingReviews(true)
    try {
      const res = await fetch(`${API_BASE_URL}/branch-reviews/branch/${kiosk.ma_kiosk}`)
      if (res.ok) {
        const data = await res.json()
        setReviews(data.items || [])
        setReviewStats({ avg: data.diem_trung_binh || 0, total: data.tong_luot_danh_gia || 0 })
      } else {
        setReviews([])
        setReviewStats({ avg: 0, total: 0 })
      }
    } catch {
      setReviews([])
      setReviewStats({ avg: 0, total: 0 })
    } finally {
      setLoadingReviews(false)
    }
  }

  const deleteReview = async (reviewId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa đánh giá này không?')) return
    try {
      const res = await fetch(`${API_BASE_URL}/branch-reviews/${reviewId}`, { method: 'DELETE' })
      if (res.ok) {
        openReviewModal(reviewModal)
      } else {
        alert('Có lỗi khi xóa đánh giá!')
      }
    } catch {
      alert('Lỗi kết nối khi xóa đánh giá.')
    }
  }

  const filteredKiosks = kiosks.filter((k) => {
    const rawQ = searchTerm.trim()
    const matchStatus = statusFilter === '' || k.trang_thai === statusFilter
    if (!rawQ) return matchStatus

    const qNorm = removeVietnameseTones(rawQ)
    const qCode = normalizeCode(rawQ)

    // Code comparison: matches KSK-149, ksk149, 149, etc.
    const kCodeNorm = removeVietnameseTones(k.ma_kiosk)
    const kCodeClean = normalizeCode(k.ma_kiosk)
    const matchCode =
      (qCode && kCodeClean.includes(qCode)) ||
      kCodeNorm.includes(qNorm)

    // Name comparison: supports Vietnamese accents & unaccented
    const kNameNorm = removeVietnameseTones(k.ten_kiosk)
    const matchName =
      kNameNorm.includes(qNorm) ||
      (qCode && normalizeCode(k.ten_kiosk).includes(qCode))

    // Address & City
    const kAddrNorm = removeVietnameseTones(`${k.dia_chi || ''} ${k.dia_chi_day_du || ''} ${k.thanh_pho || ''}`)
    const matchAddress = kAddrNorm.includes(qNorm)

    // Franchisee & Model
    const kFranchiseeNorm = removeVietnameseTones(k.franchisee_id)
    const matchFranchisee = kFranchiseeNorm.includes(qNorm) || (qCode && normalizeCode(k.franchisee_id).includes(qCode))
    const kLoaiNorm = removeVietnameseTones(k.loai_kiosk)
    const matchLoai = kLoaiNorm.includes(qNorm)

    const matchSearch = matchCode || matchName || matchAddress || matchFranchisee || matchLoai
    return matchSearch && matchStatus
  })

  // Metrics
  const totalCount = kiosks.length
  const activeCount = kiosks.filter((k) => k.trang_thai === 'DANG_HOAT_DONG').length
  const pendingContractCount = kiosks.filter((k) => k.trang_thai === 'CHO_KY_HOP_DONG' || k.trang_thai === 'DANG_THIET_LAP').length
  const pausedCount = kiosks.filter((k) => k.trang_thai === 'TAM_DUNG' || k.trang_thai === 'NGUNG_HOAT_DONG').length

  const getStatusBadge = (status) => {
    switch (status) {
      case 'DANG_HOAT_DONG':
        return (
          <span className="workspace-inline-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a' }}></span>
            Đang hoạt động
          </span>
        )
      case 'CHO_KY_HOP_DONG':
        return (
          <span className="workspace-inline-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563eb' }}></span>
            Chờ ký hợp đồng
          </span>
        )
      case 'DANG_THIET_LAP':
        return (
          <span className="workspace-inline-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></span>
            Đang thiết lập
          </span>
        )
      case 'TAM_DUNG':
        return (
          <span className="workspace-inline-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ea580c' }}></span>
            Tạm dừng
          </span>
        )
      case 'NGUNG_HOAT_DONG':
        return (
          <span className="workspace-inline-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
            Ngừng hoạt động
          </span>
        )
      default:
        return (
          <span className="workspace-inline-label" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '600', backgroundColor: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' }}>
            {status || 'Không xác định'}
          </span>
        )
    }
  }

  return (
    <section className="panel system-admin-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* DETAIL PAGE VIEW OR LIST TABLE VIEW */}
      {selectedKiosk ? (
        <div className="kiosk-detail-page" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top Bar with Back Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button
              type="button"
              className="admin-button-secondary"
              onClick={() => setSelectedKiosk(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1.15rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#1e293b',
                fontWeight: '600',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                transition: 'all 0.15s ease'
              }}
            >
              <ArrowLeft size={16} /> Quay lại danh sách
            </button>

            <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
              <span>Danh sách kiosk</span> <span style={{ margin: '0 0.35rem' }}>/</span> <strong style={{ color: '#0f172a' }}>{selectedKiosk.ten_kiosk}</strong>
            </div>
          </div>

          {/* SINGLE BIG UNIFIED SECTION */}
          <div
            className="admin-surface kiosk-detail-unified-section"
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px -2px rgba(15, 23, 42, 0.05), 0 1px 4px -1px rgba(15, 23, 42, 0.03)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header & Quick Action Toolbar */}
            <div
              style={{
                padding: '1.35rem 1.75rem',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: '1rem',
                background: '#fafbfd'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: '700', color: '#0f172a', letterSpacing: '-0.01em' }}>
                    {selectedKiosk.ten_kiosk}
                  </h2>
                  {selectedKiosk.xep_hang && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.2rem 0.65rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        backgroundColor: selectedKiosk.xep_hang === 'S' ? '#fef08a' : selectedKiosk.xep_hang === 'A' ? '#dbeafe' : selectedKiosk.xep_hang === 'B' ? '#fed7aa' : '#fee2e2',
                        color: selectedKiosk.xep_hang === 'S' ? '#854d0e' : selectedKiosk.xep_hang === 'A' ? '#1e40af' : selectedKiosk.xep_hang === 'B' ? '#9a3412' : '#991b1b',
                        border: `1px solid ${selectedKiosk.xep_hang === 'S' ? '#eab308' : selectedKiosk.xep_hang === 'A' ? '#3b82f6' : selectedKiosk.xep_hang === 'B' ? '#f97316' : '#ef4444'}`
                      }}
                    >
                      Hạng {selectedKiosk.xep_hang} • {selectedKiosk.diem_danh_gia || 0} điểm
                    </span>
                  )}
                  {getStatusBadge(selectedKiosk.trang_thai)}
                </div>

                <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span>Mã Kiosk: <strong style={{ color: '#0f172a', fontFamily: 'monospace' }}>{selectedKiosk.ma_kiosk}</strong></span>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span>Mô hình: <strong style={{ color: '#334155' }}>{selectedKiosk.loai_kiosk || 'Kiosk Tiêu Chuẩn'}</strong></span>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span>Khởi tạo: <span style={{ color: '#475569' }}>{fmtDate(selectedKiosk.ngay_tao)}</span></span>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span>Cập nhật: <span style={{ color: '#475569' }}>{fmtDate(selectedKiosk.ngay_cap_nhat)}</span></span>
                </div>
              </div>

              {/* Action Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                {selectedKiosk.trang_thai === 'CHO_KY_HOP_DONG' && (
                  <button
                    type="button"
                    className="admin-button-primary"
                    onClick={() => handleSignContract(selectedKiosk)}
                    style={{
                      height: '36px',
                      padding: '0 0.95rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#2563eb',
                      color: '#ffffff',
                      fontWeight: '600',
                      fontSize: '0.8125rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      cursor: 'pointer'
                    }}
                  >
                    <FileText size={15} /> Ký hợp đồng nhượng quyền
                  </button>
                )}

                {selectedKiosk.trang_thai === 'DANG_THIET_LAP' && (
                  <button
                    type="button"
                    className="admin-button-primary"
                    onClick={() => handleLaunchKiosk(selectedKiosk)}
                    style={{
                      height: '36px',
                      padding: '0 0.95rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#16a34a',
                      color: '#ffffff',
                      fontWeight: '600',
                      fontSize: '0.8125rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      cursor: 'pointer'
                    }}
                  >
                    <WorkspaceSymbolSparkles size={15} /> Khai trương Kiosk
                  </button>
                )}

                {selectedKiosk.trang_thai === 'DANG_HOAT_DONG' && (
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(selectedKiosk, 'TAM_DUNG')}
                    style={{
                      height: '36px',
                      padding: '0 0.95rem',
                      borderRadius: '8px',
                      border: '1px solid #fed7aa',
                      background: '#fff7ed',
                      color: '#c2410c',
                      fontWeight: '600',
                      fontSize: '0.8125rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      cursor: 'pointer'
                    }}
                  >
                    <PauseCircle size={15} /> Tạm dừng
                  </button>
                )}

                {selectedKiosk.trang_thai === 'TAM_DUNG' && (
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(selectedKiosk, 'DANG_HOAT_DONG')}
                    style={{
                      height: '36px',
                      padding: '0 0.95rem',
                      borderRadius: '8px',
                      border: '1px solid #bfdbfe',
                      background: '#eff6ff',
                      color: '#2563eb',
                      fontWeight: '600',
                      fontSize: '0.8125rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      cursor: 'pointer'
                    }}
                  >
                    <CheckCircle2 size={15} /> Mở lại hoạt động
                  </button>
                )}

                {selectedKiosk.trang_thai !== 'NGUNG_HOAT_DONG' && (
                  <button
                    type="button"
                    onClick={() => handleCloseKiosk(selectedKiosk)}
                    style={{
                      height: '36px',
                      padding: '0 0.95rem',
                      borderRadius: '8px',
                      border: '1px solid #fecaca',
                      background: '#ffffff',
                      color: '#dc2626',
                      fontWeight: '600',
                      fontSize: '0.8125rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      cursor: 'pointer'
                    }}
                  >
                    <PowerOff size={15} /> Đóng điểm
                  </button>
                )}

                {selectedKiosk.hop_dong && (
                  <button
                    type="button"
                    className="admin-button-secondary"
                    onClick={() => setContractModal(selectedKiosk)}
                    style={{
                      height: '36px',
                      padding: '0 0.95rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      fontWeight: '600',
                      fontSize: '0.8125rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      cursor: 'pointer'
                    }}
                  >
                    <Printer size={15} /> In hợp đồng
                  </button>
                )}

                <button
                  type="button"
                  className="admin-button-danger"
                  onClick={() => handleDeleteKiosk(selectedKiosk)}
                  style={{
                    height: '36px',
                    padding: '0 0.85rem',
                    borderRadius: '8px',
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontWeight: '600',
                    fontSize: '0.8125rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    cursor: 'pointer'
                  }}
                  title="Xóa vĩnh viễn Kiosk khỏi hệ thống"
                >
                  <Trash2 size={15} /> Xóa
                </button>
              </div>
            </div>

            {/* BLOCK 1: 3-COLUMN INFORMATION MATRIX */}
            <div
              className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/70 p-6 gap-6 lg:gap-0"
              style={{
                background: '#ffffff'
              }}
            >
              {/* Column 1: Vận hành & Mô hình */}
              <div className="flex flex-col gap-3 lg:pr-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                  <Store size={17} color="#2563eb" /> Mô hình kinh doanh & Vận hành
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.85rem', fontSize: '0.8125rem' }}>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Loại mô hình Kiosk</div>
                    <div style={{ fontWeight: '600', color: '#0f172a' }}>{selectedKiosk.loai_kiosk || 'Kiosk Tiêu Chuẩn'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Số Combo nguyên liệu</div>
                    <div style={{ fontWeight: '600', color: '#0f172a' }}>{selectedKiosk.so_combo_hien_tai ?? 0} combo</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Điểm tích lũy</div>
                    <div style={{ fontWeight: '600', color: '#0f172a' }}>{selectedKiosk.diem_danh_gia || 0} điểm</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Hạng hiệu quả (Rank)</div>
                    <div style={{ fontWeight: '600', color: '#0f172a' }}>Hạng {selectedKiosk.xep_hang || 'Chưa xếp hạng'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Ngày khởi tạo</div>
                    <div style={{ fontWeight: '500', color: '#334155' }}>{fmtDate(selectedKiosk.ngay_tao)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Cập nhật gần nhất</div>
                    <div style={{ fontWeight: '500', color: '#334155' }}>{fmtDate(selectedKiosk.ngay_cap_nhat)}</div>
                  </div>
                </div>
              </div>

              {/* Column 2: Địa điểm & Vị trí kinh doanh */}
              <div className="flex flex-col gap-3 pt-6 lg:pt-0 lg:px-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                  <MapPin size={17} color="#059669" /> Địa điểm & Vị trí kinh doanh
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8125rem' }}>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Địa chỉ chi tiết</div>
                    <div style={{ fontWeight: '600', color: '#0f172a', lineHeight: '1.35' }}>
                      {selectedKiosk.dia_chi_day_du || selectedKiosk.dia_chi || 'Chưa cập nhật địa chỉ'}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.85rem' }}>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Tỉnh / Thành phố</div>
                      <div style={{ fontWeight: '600', color: '#0f172a' }}>{selectedKiosk.thanh_pho || 'Toàn quốc'}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Tọa độ GPS</div>
                      <div style={{ fontWeight: '500', color: '#334155', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {selectedKiosk.vi_do && selectedKiosk.kinh_do ? `${selectedKiosk.vi_do}, ${selectedKiosk.kinh_do}` : 'Chưa định vị GPS'}
                      </div>
                    </div>
                  </div>
                  {selectedKiosk.vi_do && selectedKiosk.kinh_do && (
                    <a
                      href={`https://www.google.com/maps?q=${selectedKiosk.vi_do},${selectedKiosk.kinh_do}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontSize: '0.75rem',
                        color: '#2563eb',
                        fontWeight: '600',
                        textDecoration: 'none',
                        marginTop: '0.15rem'
                      }}
                    >
                      <ExternalLink size={13} /> Mở bản đồ Google Maps chỉ đường
                    </a>
                  )}
                </div>
              </div>

              {/* Column 3: Đối tác nhận quyền (Franchisee) */}
              <div className="flex flex-col gap-3 pt-6 lg:pt-0 lg:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f1f5f9' }}>
                  <Building2 size={17} color="#7c3aed" /> Đối tác nhận quyền (Franchisee)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.8125rem' }}>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Mã định danh đối tác (Franchisee ID)</div>
                    <div style={{ fontWeight: '600', color: '#0f172a', fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.8125rem' }}>
                      {selectedKiosk.franchisee_id || 'Chưa liên kết đối tác'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Hồ sơ đăng ký nhượng quyền</div>
                    <div style={{ fontWeight: '500', color: '#475569', fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.8125rem' }}>
                      {selectedKiosk.ho_so_id || 'Chưa gán mã hồ sơ'}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Tình trạng liên kết</div>
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      color: selectedKiosk.franchisee_id ? '#16a34a' : '#64748b'
                    }}>
                      {selectedKiosk.franchisee_id ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                      {selectedKiosk.franchisee_id ? 'Đã liên kết tài khoản đối tác' : 'Chưa liên kết đối tác'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* BLOCK 2: HỢP ĐỒNG & CÔNG NỢ */}
            <div
              className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-200/70 p-5 gap-6 lg:gap-0"
              style={{
                borderTop: '1px solid #f1f5f9',
                background: '#fafbfd'
              }}
            >
              {/* Contract sub-panel */}
              <div className="flex flex-col gap-3 lg:pr-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <FileText size={16} color="#d97706" /> Hợp đồng nhượng quyền
                  </span>
                  {selectedKiosk.hop_dong && (
                    <button
                      type="button"
                      onClick={() => setContractModal(selectedKiosk)}
                      style={{ background: 'none', border: 'none', color: '#2563eb', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                    >
                      Mở bản in hợp đồng →
                    </button>
                  )}
                </div>

                {selectedKiosk.hop_dong ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', fontSize: '0.8125rem' }}>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Tỷ lệ Royalty</div>
                      <div style={{ fontWeight: '700', color: '#0284c7' }}>{selectedKiosk.hop_dong.ty_le_royalty_phan_tram || 7}% doanh thu</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Ngày ký kết</div>
                      <div style={{ fontWeight: '500', color: '#334155' }}>{fmtDate(selectedKiosk.hop_dong.ngay_ky)}</div>
                    </div>
                    <div>
                      <div style={{ color: '#64748b', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Hạn hợp đồng</div>
                      <div style={{ fontWeight: '500', color: '#334155' }}>{fmtDate(selectedKiosk.hop_dong.ngay_het_han)}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '0.65rem 0.85rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', color: '#92400e', fontSize: '0.75rem' }}>
                    Kiosk này chưa có hợp đồng chính thức trên hệ thống.
                  </div>
                )}
              </div>

              {/* Debt & Financial sub-panel */}
              <div className="flex flex-col gap-3 pt-6 lg:pt-0 lg:pl-6" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <AlertTriangle size={16} color="#0284c7" /> Tình trạng tài chính & Công nợ
                </div>

                {selectedKiosk.so_cong_no_chua_thanh_toan > 0 ? (
                  <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem' }}>
                    <AlertTriangle size={15} /> Kiosk đang có {selectedKiosk.so_cong_no_chua_thanh_toan} khoản công nợ chưa thanh toán.
                  </div>
                ) : (
                  <div style={{ padding: '0.65rem 0.85rem', borderRadius: '8px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem' }}>
                    <CheckCircle2 size={15} /> Tình trạng tài chính tốt, không có công nợ tồn đọng.
                  </div>
                )}
              </div>
            </div>

            {/* BLOCK 3: ĐÁNH GIÁ & TRẢI NGHIỆM KHÁCH HÀNG */}
            <div
              style={{
                borderTop: '1px solid #f1f5f9',
                padding: '1.25rem 1.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                background: '#ffffff'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Star size={20} fill="#f59e0b" color="#f59e0b" />
                </div>
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#0f172a' }}>
                    Đánh giá & Trải nghiệm khách hàng
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#64748b', marginTop: '0.15rem' }}>
                    Điểm tích lũy hiện tại: <strong style={{ color: '#b45309' }}>{selectedKiosk.diem_danh_gia || 0} điểm</strong> (Hạng <strong>{selectedKiosk.xep_hang || '—'}</strong>). Nhấn nút bên cạnh để xem phản hồi chi tiết từ khách hàng.
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="admin-button-secondary"
                onClick={() => openReviewModal(selectedKiosk)}
                style={{
                  height: '36px',
                  padding: '0 1rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#1e293b',
                  fontWeight: '600',
                  fontSize: '0.8125rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                  transition: 'all 0.15s ease'
                }}
              >
                <MessageSquare size={15} color="#f59e0b" /> Quản lý danh sách đánh giá
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* List Mode (Table Only) */
        <>
          {/* Header Intro */}
          <div className="admin-section-intro">
            <div>
              <h2>Danh sách kiosk nhượng quyền</h2>
            </div>
          </div>

          {/* Filter & Toolbar */}
          <div className="admin-surface admin-kiosk-filters" style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', backgroundColor: '#ffffff', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid var(--border-light)', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', flex: 1, minWidth: '320px', flexWrap: 'wrap' }}>
              {/* Search Box */}
              <div style={{ position: 'relative', flex: '1 1 320px', minWidth: '260px' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 2
                  }}
                >
                  <Search size={16} />
                </span>
                <input
                  type="text"
                  className="kiosk-search-input"
                  placeholder="Tìm theo tên hoặc mã Kiosk (VD: KSK-149, ksk149, Đà Nẵng...)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%',
                    height: '40px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.8125rem',
                    backgroundColor: '#ffffff',
                    outline: 'none',
                    paddingLeft: '44px',
                    paddingRight: '36px',
                    boxSizing: 'border-box'
                  }}
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="admin-search-clear-btn"
                    onClick={() => setSearchTerm('')}
                    title="Xóa tìm kiếm"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#94a3b8',
                      padding: 0,
                      width: '22px',
                      height: '22px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '50%',
                      zIndex: 2
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Status SearchableSelect */}
              <div style={{ flex: '0 1 200px', minWidth: '180px' }}>
                <SearchableSelect
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e?.target?.value ?? e)}
                  placeholder="Tất cả trạng thái"
                  style={{ height: '40px' }}
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="DANG_HOAT_DONG">Đang hoạt động</option>
                  <option value="CHO_KY_HOP_DONG">Chờ ký hợp đồng</option>
                  <option value="DANG_THIET_LAP">Đang thiết lập</option>
                  <option value="TAM_DUNG">Tạm dừng</option>
                  <option value="NGUNG_HOAT_DONG">Ngừng hoạt động</option>
                </SearchableSelect>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="admin-button-danger"
                type="button"
                onClick={async () => {
                  if (!window.confirm('Bạn có chắc muốn chạy Demo Xử lý nợ quá hạn? (Sẽ quét toàn bộ công nợ và áp dụng hình phạt)')) return
                  try {
                    setLoading(true)
                    const token = getAdminAccessToken() || session?.token
                    const res = await fetch(`${API_BASE_URL}/franchise/cron/xu-ly-no-qua-han`, {
                      method: 'POST',
                      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
                    })
                    const data = await res.json().catch(() => ({}))
                    alert(data?.message || 'Xử lý công nợ hoàn tất')
                    loadKiosks()
                  } catch (err) {
                    alert(err.message)
                    setLoading(false)
                  }
                }}
                style={{
                  padding: '0 0.85rem',
                  height: '40px',
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                  backgroundColor: '#ffffff',
                  color: '#dc2626',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.8125rem',
                  transition: 'all 0.15s ease'
                }}
              >
                <AlertTriangle size={15} /> Xử lý nợ quá hạn
              </button>

              <button
                className="admin-button-secondary"
                type="button"
                onClick={() => loadKiosks(true)}
                disabled={loading || refreshing}
                style={{
                  padding: '0 0.85rem',
                  height: '40px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-light)',
                  backgroundColor: '#ffffff',
                  color: 'var(--text-main)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  cursor: loading || refreshing ? 'not-allowed' : 'pointer',
                  fontWeight: '600',
                  fontSize: '0.8125rem',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  transition: 'all 0.15s ease'
                }}
              >
                {refreshing ? <GlobalSpinner size={14} color="#2563eb" /> : <RefreshCw size={15} />}
                {refreshing ? 'Đang làm mới...' : 'Làm mới'}
              </button>
            </div>
          </div>

          {/* ERROR / LOADING */}
          {error && <div style={{ padding: '0.85rem 1.15rem', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', border: '1px solid #fecaca', fontSize: '0.8125rem', fontWeight: '600' }}>{error}</div>}
          {loading && kiosks.length === 0 && (
            <GlobalLoading
              text="Đang tải dữ liệu Kiosk toàn hệ thống..."
              subtext="Đang kết nối cơ sở dữ liệu và đồng bộ trạng thái điểm kinh doanh"
              minHeight="240px"
            />
          )}

          {/* TABLE DISPLAY */}
          {(!loading || kiosks.length > 0) && !error && (
            <>
              {filteredKiosks.length === 0 ? (
                <div className="admin-surface" style={{ background: '#ffffff', padding: '3rem', textAlign: 'center', borderRadius: '12px', border: '1px solid var(--border-light)', color: '#64748b' }}>
                  Không tìm thấy kiosk nào phù hợp với bộ lọc tìm kiếm.
                </div>
              ) : (
                <div className="admin-surface kiosk-table-wrapper" style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-light)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)', width: '100%' }}>
                  <div className="admin-table-scroll" style={{ overflowX: 'auto', width: '100%' }}>
                    <table className="kiosk-table admin-table" style={{ width: '100%', minWidth: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '25%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '21%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '10%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ background: '#f1f5f9', borderBottom: '1.5px solid #cbd5e1' }}>
                          <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#334155', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Điểm Kiosk</th>
                          <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#334155', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Mô hình &amp; Đối tác</th>
                          <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#334155', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Địa điểm</th>
                          <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#334155', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hợp đồng &amp; Công nợ</th>
                          <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#334155', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>Trạng thái</th>
                          <th style={{ padding: '0.85rem 1rem', background: '#f1f5f9', color: '#334155', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right', whiteSpace: 'nowrap' }}>Chi tiết</th>
                        </tr>
                      </thead>
                      <tbody>
                        <PaginatedList
                          items={filteredKiosks}
                          resetKey={JSON.stringify([searchTerm, statusFilter])}
                          pageSize={10}
                          layout="table"
                          columns={6}
                        >
                          {(k) => {
                            return (
                              <tr
                                key={k.id}
                                className="kiosk-table-row"
                                onClick={() => setSelectedKiosk(k)}
                                style={{
                                  cursor: 'pointer',
                                  borderBottom: '1px solid #f1f5f9',
                                  transition: 'background-color 0.15s ease'
                                }}
                              >
                                {/* Điểm Kiosk */}
                                <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0, flexWrap: 'wrap' }}>
                                    <span
                                      style={{
                                        fontWeight: '600',
                                        color: '#0f172a',
                                        fontSize: '0.84rem',
                                        lineHeight: 1.35
                                      }}
                                    >
                                      {k.ten_kiosk}
                                    </span>
                                    {k.xep_hang && (
                                      <span
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          width: '18px',
                                          height: '18px',
                                          borderRadius: '50%',
                                          fontSize: '0.65rem',
                                          fontWeight: '700',
                                          backgroundColor: k.xep_hang === 'S' ? '#fef08a' : k.xep_hang === 'A' ? '#dbeafe' : k.xep_hang === 'B' ? '#fed7aa' : '#fee2e2',
                                          color: k.xep_hang === 'S' ? '#854d0e' : k.xep_hang === 'A' ? '#1e40af' : k.xep_hang === 'B' ? '#9a3412' : '#991b1b',
                                          border: `1px solid ${k.xep_hang === 'S' ? '#eab308' : k.xep_hang === 'A' ? '#3b82f6' : k.xep_hang === 'B' ? '#f97316' : '#ef4444'}`,
                                          flexShrink: 0
                                        }}
                                        title={`Hạng ${k.xep_hang} • Điểm: ${k.diem_danh_gia || 0}`}
                                      >
                                        {k.xep_hang}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                    <span>Mã: <strong style={{ color: '#334155' }}>{k.ma_kiosk}</strong></span>
                                    {k.diem_danh_gia !== undefined && k.diem_danh_gia !== null ? <span>• {k.diem_danh_gia} điểm</span> : null}
                                    {k.so_combo_hien_tai !== undefined && k.so_combo_hien_tai !== null ? (
                                      <span>• {k.so_combo_hien_tai} combo</span>
                                    ) : null}
                                  </div>
                                </td>

                                {/* Mô hình & Đối tác */}
                                <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                                  <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.8125rem' }}>
                                    {k.loai_kiosk || 'TIÊU CHUẨN'}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`ID đối tác: ${k.franchisee_id || 'Chưa gán'}`}>
                                    {k.franchisee_id ? `${k.franchisee_id.slice(0, 10)}...` : 'Chưa gán đối tác'}
                                  </div>
                                </td>

                                {/* Địa điểm */}
                                <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                                  <div style={{ color: '#334155', fontSize: '0.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={k.dia_chi_day_du || k.dia_chi || k.thanh_pho || 'Chưa cập nhật'}>
                                    {k.dia_chi || k.dia_chi_day_du || 'Chưa cập nhật'}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                                    {k.thanh_pho || 'Toàn quốc'}
                                  </div>
                                </td>

                                {/* Hợp đồng & Công nợ */}
                                <td style={{ padding: '0.85rem 1rem', verticalAlign: 'middle' }}>
                                  {k.hop_dong ? (
                                    <div>
                                      <div style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: '600' }}>
                                        Royalty: {k.hop_dong.ty_le_royalty_phan_tram || 7}%
                                      </div>
                                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>
                                        Hạn: {fmtDate(k.hop_dong.ngay_het_han)}
                                      </div>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                      Chưa có HĐ
                                    </span>
                                  )}
                                  {k.so_cong_no_chua_thanh_toan > 0 && (
                                    <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.2rem' }}>
                                      <AlertTriangle size={12} /> {k.so_cong_no_chua_thanh_toan} nợ
                                    </div>
                                  )}
                                </td>

                                {/* Trạng thái */}
                                <td style={{ padding: '0.85rem 1rem', textAlign: 'center', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                  {getStatusBadge(k.trang_thai)}
                                </td>

                                {/* Chi tiết */}
                                <td style={{ padding: '0.85rem 1rem', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                                  <span
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      fontSize: '0.8rem',
                                      fontWeight: '600',
                                      color: '#2563eb'
                                    }}
                                  >
                                    Chi tiết <ChevronRight size={14} />
                                  </span>
                                </td>
                              </tr>
                            )
                          }}
                        </PaginatedList>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* MODAL 1: CONTRACT MODAL */}
      {contractModal && (
        <WorkspaceDialog label="Hợp đồng nhượng quyền" onClose={() => setContractModal(null)}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '720px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div className="admin-card-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <FileText size={18} color="var(--primary)" /> Hợp Đồng Nhượng Quyền Thương Mại
              </h3>
              <button className="admin-icon-button"
                type="button"
                onClick={() => setContractModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}
              >
                <X size={20} />
              </button>
            </div>

            <div id="contract-print-area" style={{ padding: '2rem', overflowY: 'auto', flex: 1, fontFamily: 'serif', color: 'var(--text-main)', lineHeight: '1.7' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                </h2>
                <div style={{ fontWeight: 'bold', textDecoration: 'underline' }}>Độc lập - Tự do - Hạnh phúc</div>
                <h3 style={{ marginTop: '1.5rem', fontSize: '1.25rem', color: '#30382e' }}>HỢP ĐỒNG NHƯỢNG QUYỀN THƯƠNG MẠI</h3>
                <div style={{ fontStyle: 'italic', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Số: {contractModal.ma_kiosk}/HĐNQ-AVG</div>
              </div>

              <div style={{ marginBottom: '1rem', fontSize: '0.925rem' }}>
                <p>Hôm nay, ngày {new Date(contractModal.hop_dong?.ngay_ky || Date.now()).getDate()} tháng {new Date(contractModal.hop_dong?.ngay_ky || Date.now()).getMonth() + 1} năm {new Date(contractModal.hop_dong?.ngay_ky || Date.now()).getFullYear()}, tại Văn phòng Công ty Cổ phần Avengers Coffee. Chúng tôi gồm có:</p>
                <div style={{ fontWeight: 'bold', marginTop: '0.75rem' }}>BÊN NHƯỢNG QUYỀN (BÊN A): CÔNG TY CỔ PHẦN AVENGERS COFFEE</div>
                <div>Địa chỉ: 123 Đường Nhượng Quyền, Quận 1, TP. Hồ Chí Minh</div>
                <div>Mã số thuế: 0123456789</div>

                <div style={{ fontWeight: 'bold', marginTop: '0.75rem' }}>BÊN NHẬN QUYỀN (BÊN B): ĐỐI TÁC FRANCHISE</div>
                <div>Tên Kiosk: {contractModal.ten_kiosk}</div>
                <div>Mã Kiosk: {contractModal.ma_kiosk}</div>
                <div>Địa chỉ kinh doanh: {contractModal.dia_chi_day_du || contractModal.dia_chi || '---'}</div>
                <div>Mã đối tác: {contractModal.franchisee_id}</div>
              </div>

              <div style={{ marginBottom: '1rem', fontSize: '0.925rem' }}>
                <div style={{ fontWeight: 'bold', textDecoration: 'underline' }}>ĐIỀU 1: NỘI DUNG NHƯỢNG QUYỀN</div>
                <p>Bên A đồng ý cấp cho Bên B quyền sử dụng thương hiệu "Avengers Coffee" để kinh doanh theo mô hình {contractModal.loai_kiosk || 'Kiosk'}.</p>

                <div style={{ fontWeight: 'bold', textDecoration: 'underline' }}>ĐIỀU 2: PHÍ NHƯỢNG QUYỀN (ROYALTY)</div>
                <p>Bên B có nghĩa vụ thanh toán phí Royalty định kỳ cho Bên A với tỷ lệ là: <b>{contractModal.hop_dong?.ty_le_royalty_phan_tram || 7}%</b> trên tổng doanh thu hàng tháng.</p>

                <div style={{ fontWeight: 'bold', textDecoration: 'underline' }}>ĐIỀU 3: THỜI HẠN HỢP ĐỒNG</div>
                <p>Hợp đồng có hiệu lực kể từ ngày {fmtDate(contractModal.hop_dong?.ngay_ky)} và kết thúc vào ngày {fmtDate(contractModal.hop_dong?.ngay_het_han)}.</p>
              </div>

              <table style={{ width: '100%', marginTop: '2.5rem', textAlign: 'center' }}>
                <tbody>
                  <tr>
                    <td style={{ width: '50%' }}>
                      <div style={{ fontWeight: 'bold' }}>ĐẠI DIỆN BÊN A</div>
                      <div style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>(Ký, đóng dấu điện tử)</div>
                      <div style={{ marginTop: '2.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>[ĐÃ KÝ ĐIỆN TỬ]</div>
                    </td>
                    <td style={{ width: '50%' }}>
                      <div style={{ fontWeight: 'bold' }}>ĐẠI DIỆN BÊN B</div>
                      <div style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>(Ký, ghi rõ họ tên)</div>
                      <div style={{ marginTop: '2.5rem', fontWeight: 'bold', color: '#2563eb' }}>[ĐÃ KÝ ĐIỆN TỬ]</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ padding: '0.85rem 1.5rem', borderTop: '1px solid var(--border-light)', backgroundColor: '#ffffff', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button className="admin-button-secondary"
                type="button"
                onClick={() => setContractModal(null)}
                style={{ height: '38px', padding: '0 1.15rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: '#ffffff', color: '#414743', cursor: 'pointer', fontWeight: '600', fontSize: '0.8125rem' }}
              >
                Đóng
              </button>
              <button className="admin-button-primary"
                type="button"
                onClick={() => {
                  const content = document.getElementById('contract-print-area').innerHTML
                  const printWindow = window.open('', '_blank')
                  printWindow.document.write(`
                    <html>
                      <head>
                        <title>Hop Dong Nhuong Quyen - ${contractModal.ma_kiosk}</title>
                        <style>
                          body { font-family: 'Times New Roman', serif; padding: 40px; color: #000; line-height: 1.6; font-size: 14pt; }
                          h2, h3 { text-align: center; }
                          @media print {
                            @page { margin: 20mm; size: A4 portrait; }
                            body { padding: 0; }
                          }
                        </style>
                      </head>
                      <body>${content}</body>
                    </html>
                  `)
                  printWindow.document.close()
                  printWindow.focus()
                  setTimeout(() => {
                    printWindow.print()
                    printWindow.close()
                  }, 500)
                }}
                style={{ height: '38px', padding: '0 1.25rem', borderRadius: '8px', border: 'none', backgroundColor: 'var(--primary)', color: '#ffffff', cursor: 'pointer', fontWeight: '700', fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)' }}
              >
                <Printer size={15} /> In / Lưu Hợp Đồng
              </button>
            </div>
          </div>
        </WorkspaceDialog>
      )}

      {/* MODAL 3: REVIEWS MODAL */}
      {reviewModal && (
        <WorkspaceDialog label="Đánh giá kiosk" onClose={() => setReviewModal(null)}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div className="admin-card-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <MessageSquare size={18} color="#eab308" /> Đánh Giá Khách Hàng - {reviewModal.ten_kiosk} ({reviewModal.ma_kiosk})
              </h3>
              <button className="admin-icon-button" type="button" onClick={() => setReviewModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {loadingReviews ? (
                <GlobalLoading size="sm" text="Đang tải danh sách đánh giá..." minHeight="140px" />
              ) : reviews.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>Kiosk này chưa có đánh giá nào.</div>
              ) : (
                <>
                  <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', color: '#1e293b' }}>Đánh giá trung bình:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '1.1rem', color: '#b45309' }}>{reviewStats.avg} / 5.0</strong>
                      <span style={{ fontSize: '0.85rem', color: '#d97706' }}>({reviewStats.total} đánh giá)</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {reviews.map((rv, idx) => (
                      <div className="admin-surface" key={idx} style={{ padding: '1rem', border: '1px solid var(--border-light)', borderRadius: '8px', backgroundColor: '#ffffff', position: 'relative' }}>
                        <button className="admin-button-danger" onClick={() => deleteReview(rv.id)} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: '#fef2f2', color: '#ef4444', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}>Xóa</button>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', paddingRight: '3rem' }}>
                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{rv.ten_nguoi_dung || 'Khách hàng ẩn danh'}</strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(rv.ngay_tao).toLocaleDateString('vi-VN')}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '0.5rem' }}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={14} style={{ fill: i < (rv.diem_tong_quan || 5) ? '#facc15' : 'transparent', color: i < (rv.diem_tong_quan || 5) ? '#facc15' : '#ccd3c7' }} />
                          ))}
                        </div>
                        {rv.nhan_xet && <div style={{ fontSize: '0.85rem', color: '#414743', fontStyle: 'italic' }}>"{rv.nhan_xet}"</div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </WorkspaceDialog>
      )}
    </section>
  )
}
