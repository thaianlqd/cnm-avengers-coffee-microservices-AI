import React, { useState, useEffect } from 'react'
import {
  Store,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  FileText,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Building2,
  Calendar,
  DollarSign,
  Printer,
  X,
  Star,
  MessageSquare,
  PlayCircle,
  PauseCircle,
  PowerOff,
  Trash2
} from 'lucide-react'
import { API_BASE_URL } from '../../admin-dashboard/constants'
import { getAdminAccessToken } from '../../../lib/adminFetch'

const ITEMS_PER_PAGE = 6;


function fmtMoney(num) {
  if (!num) return '0 đ'
  return Number(num).toLocaleString('vi-VN') + ' đ'
}

function fmtDate(d) {
  if (!d) return '---'
  try {
    return new Date(d).toLocaleDateString('vi-VN')
  } catch {
    return String(d)
  }
}

export function AdminKioskManagementPanel({ session }) {
  const [kiosks, setKiosks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [contractModal, setContractModal] = useState(null)
  const [reviewModal, setReviewModal] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [reviewStats, setReviewStats] = useState({ avg: 0, total: 0 });

  const openReviewModal = async (kiosk) => {
    setReviewModal(kiosk);
    setLoadingReviews(true);
    try {
      const res = await fetch(`${API_BASE_URL}/branch-reviews/branch/${kiosk.ma_kiosk}`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.items || []);
        setReviewStats({ avg: data.diem_trung_binh || 0, total: data.tong_luot_danh_gia || 0 });
      } else {
        setReviews([]);
        setReviewStats({ avg: 0, total: 0 });
      }
    } catch (err) {
      setReviews([]);
      setReviewStats({ avg: 0, total: 0 });
    } finally {
      setLoadingReviews(false);
    }
  };

  const deleteReview = async (reviewId) => {
    if (!window.confirm("Bạn có chắc chắn muốn xóa đánh giá này không?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/branch-reviews/${reviewId}`, { method: 'DELETE' });
      if (res.ok) {
        // Refresh
        openReviewModal(reviewModal);
      } else {
        alert("Có lỗi khi xóa đánh giá!");
      }
    } catch (err) {
      alert("Lỗi kết nối khi xóa đánh giá.");
    }
  }

  const loadKiosks = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getAdminAccessToken() || session?.token || session?.accessToken;

      let res = await fetch(`${API_BASE_URL}/franchise/kiosk`, {

        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })

      if (!res.ok) {
        // Fallback to public kiosks endpoint if admin endpoint returns error
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
    } catch (err) {
      setError(err.message || 'Lỗi khi tải danh sách Kiosk')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadKiosks()
  }, [session])

  const filteredKiosks = kiosks.filter((k) => {
    const matchSearch =
      k.ten_kiosk?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      k.ma_kiosk?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      k.dia_chi_day_du?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchStatus = statusFilter === '' || k.trang_thai === statusFilter
    return matchSearch && matchStatus
  })

  const totalPages = Math.max(1, Math.ceil(filteredKiosks.length / ITEMS_PER_PAGE))
  const paginatedKiosks = filteredKiosks.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)

  // Metrics
  const totalCount = kiosks.length
  const activeCount = kiosks.filter((k) => k.trang_thai === 'DANG_HOAT_DONG').length
  const pendingContractCount = kiosks.filter((k) => k.trang_thai === 'CHO_KY_HOP_DONG' || k.trang_thai === 'DANG_THIET_LAP').length
  const pausedCount = kiosks.filter((k) => k.trang_thai === 'TAM_DUNG' || k.trang_thai === 'NGUNG_HOAT_DONG').length

  const getStatusBadge = (status) => {
    switch (status) {
      case 'DANG_HOAT_DONG':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
            Đang hoạt động
          </span>
        )
      case 'CHO_KY_HOP_DONG':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#6366f1' }}></span>
            Chờ ký hợp đồng
          </span>
        )
      case 'DANG_THIET_LAP':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></span>
            Đang thiết lập
          </span>
        )
      case 'TAM_DUNG':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ea580c' }}></span>
            Tạm dừng
          </span>
        )
      case 'NGUNG_HOAT_DONG':
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
            Ngừng hoạt động
          </span>
        )
      default:
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}>
            {status || 'Không xác định'}
          </span>
        )
    }
  }

  return (
    <section className="panel system-admin-panel" style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Filter & Search Bar */}
      <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', backgroundColor: '#ffffff', padding: '0.85rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', flex: 1, minWidth: '300px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Tìm theo mã Kiosk, tên điểm kinh doanh hoặc địa chỉ..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              style={{ width: '100%', paddingLeft: '2.25rem', height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8125rem', backgroundColor: '#f8fafc', outline: 'none' }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            style={{ height: '38px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8125rem', padding: '0 0.85rem', backgroundColor: '#ffffff', cursor: 'pointer', minWidth: '180px', outline: 'none' }}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="DANG_HOAT_DONG">Đang hoạt động</option>
            <option value="CHO_KY_HOP_DONG">Chờ ký hợp đồng</option>
            <option value="DANG_THIET_LAP">Đang thiết lập</option>
            <option value="TAM_DUNG">Tạm dừng</option>
            <option value="NGUNG_HOAT_DONG">Ngừng hoạt động</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          <button
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
              padding: '0 1rem',
              height: '38px',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '0.8125rem',
              transition: 'all 0.15s ease'
            }}
          >
            <AlertTriangle size={15} /> Xử lý nợ quá hạn
          </button>

          <button
            type="button"
            onClick={loadKiosks}
            style={{
              padding: '0 1rem',
              height: '38px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#0f172a',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              cursor: 'pointer',
              fontWeight: '700',
              fontSize: '0.8125rem',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              transition: 'all 0.15s ease'
            }}
          >
            <RefreshCw size={15} /> Làm mới
          </button>
        </div>
      </div>

      {/* ERROR / LOADING */}
      {error && <div style={{ padding: '0.85rem 1.15rem', background: '#fef2f2', color: '#b91c1c', borderRadius: '8px', border: '1px solid #fecaca', fontSize: '0.8125rem', fontWeight: '600' }}>{error}</div>}
      {loading && kiosks.length === 0 && <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b', fontSize: '0.875rem' }}>Đang tải dữ liệu Kiosk toàn hệ thống...</div>}

      {/* KIOSK GRID CARDS */}
      {(!loading || kiosks.length > 0) && !error && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.15rem' }}>
            {paginatedKiosks.map((k) => (
              <div
                key={k.id}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  backgroundColor: '#ffffff',
                  overflow: 'hidden',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Card Header */}
                <div style={{ padding: '1rem 1.15rem', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      {k.ten_kiosk}
                      {k.xep_hang && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            fontSize: '0.7rem',
                            fontWeight: '800',
                            backgroundColor: k.xep_hang === 'S' ? '#fef08a' : k.xep_hang === 'A' ? '#dcfce7' : k.xep_hang === 'B' ? '#ffedd5' : '#fee2e2',
                            color: k.xep_hang === 'S' ? '#854d0e' : k.xep_hang === 'A' ? '#166534' : k.xep_hang === 'B' ? '#9a3412' : '#991b1b',
                            border: `1px solid ${k.xep_hang === 'S' ? '#eab308' : k.xep_hang === 'A' ? '#22c55e' : k.xep_hang === 'B' ? '#f97316' : '#ef4444'}`
                          }}
                          title={`Điểm đánh giá: ${k.diem_danh_gia || 0}`}
                        >
                          {k.xep_hang}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                      Mã: <strong>{k.ma_kiosk}</strong> {k.diem_danh_gia ? `• Điểm: ${k.diem_danh_gia}` : ''}
                    </div>
                  </div>
                  <div>{getStatusBadge(k.trang_thai)}</div>
                </div>
              {/* Card Body */}
              <div style={{ padding: '1rem 1.15rem', fontSize: '0.8125rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '0.55rem', flex: 1 }}>
                <div>
                  <span style={{ color: '#64748b' }}>Loại Kiosk:</span> <strong>{k.loai_kiosk || 'Kiosk Tiêu Chuẩn'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>Địa chỉ:</span> <strong>{k.dia_chi_day_du || k.dia_chi || k.thanh_pho || '(Chưa cập nhật)'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>ID Đối tác:</span> <strong style={{ fontFamily: 'monospace' }}>{k.franchisee_id || 'Chưa gán'}</strong>
                </div>

                {/* Contract Info Box */}
                {k.hop_dong ? (
                  <div style={{ marginTop: '0.45rem', padding: '0.75rem', backgroundColor: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd', fontSize: '0.775rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                      <strong style={{ color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <FileText size={14} /> Hợp đồng hiệu lực
                      </strong>
                      <span style={{ color: '#0369a1', fontWeight: '700' }}>Royalty: {k.hop_dong.ty_le_royalty_phan_tram || 7}%</span>
                    </div>
                    <div style={{ color: '#475569' }}>
                      Thời hạn: {fmtDate(k.hop_dong.ngay_ky)} đến {fmtDate(k.hop_dong.ngay_het_han)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setContractModal(k)}
                      style={{ marginTop: '0.45rem', background: 'none', border: 'none', padding: 0, color: '#2563eb', textDecoration: 'underline', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                    >
                      Xem bản in hợp đồng →
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: '0.45rem', padding: '0.65rem 0.75rem', backgroundColor: '#fef2f2', borderRadius: '8px', border: '1px dashed #fca5a5', color: '#b91c1c', fontSize: '0.75rem', fontWeight: '600' }}>
                    Chưa có hợp đồng chính thức
                  </div>
                )}

                {k.so_cong_no_chua_thanh_toan > 0 && (
                  <div style={{ marginTop: '0.35rem', padding: '0.45rem 0.65rem', backgroundColor: '#fff7ed', borderRadius: '6px', border: '1px solid #fed7aa', color: '#c2410c', fontWeight: '700', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <AlertTriangle size={14} /> Có {k.so_cong_no_chua_thanh_toan} khoản nợ cần thanh toán
                  </div>
                )}
              </div>

                {/* Card Actions Footer */}
                <div style={{ padding: '0.75rem 1.15rem', backgroundColor: '#f8fafc', borderTop: '1px solid #f1f5f9', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
                  {k.trang_thai === 'CHO_KY_HOP_DONG' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm('Tạo hợp đồng với mức Royalty mặc định 7%?')) return;
                        try {
                          const fileUrl = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
                          const token = getAdminAccessToken() || session?.token;
                          
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
                          });

                          if (!res.ok) { 
                            const err = await res.json(); 
                            alert('Lỗi: ' + (err.message || 'Ký hợp đồng thất bại')); 
                            return; 
                          }
                          
                          alert('✅ Ký hợp đồng thành công! Kiosk đang chuyển sang DANG_THIET_LAP. Bấm "Khai trương" khi thiết lập xong.');
                          loadKiosks();
                        } catch (e) {
                          alert('Lỗi: ' + e.message);
                        }
                      }}
                      style={{ height: '32px', padding: '0 0.75rem', borderRadius: '6px', border: '1px solid #c7d2fe', backgroundColor: '#e0e7ff', color: '#4338ca', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                    >
                      Ký HĐ & Thiết Lập
                    </button>

                  )}

                  {k.trang_thai === 'DANG_THIET_LAP' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm('Xác nhận Kiosk đã thiết lập xong và sẵn sàng khai trương?')) return;
                        try {
                          const token = getAdminAccessToken() || session?.token;
                          
                          const res = await fetch(`${API_BASE_URL}/franchise/kiosk/${k.id}/khai-truong`, {
                            method: 'PATCH',
                            headers: {
                              ...(token ? { Authorization: `Bearer ${token}` } : {}),
                              'Content-Type': 'application/json'
                            }
                          });
                          
                          if (!res.ok) { 
                            const err = await res.json(); 
                            alert('Lỗi: ' + (err.message || 'Khai trương thất bại')); 
                            return; 
                          }
                          
                          alert('🎉 Khai trương thành công! Kiosk đã chuyển sang ĐANG HOẠT ĐỘNG.');
                          loadKiosks();
                        } catch (e) {
                          alert('Lỗi: ' + e.message);
                        }
                      }}
                      style={{ height: '32px', padding: '0 0.75rem', borderRadius: '6px', border: '1px solid #a7f3d0', backgroundColor: '#ecfdf5', color: '#059669', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                    >
                      🎉 Khai trương Kiosk
                    </button>

                  )}

                  {k.trang_thai === 'DANG_HOAT_DONG' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const token = getAdminAccessToken() || session?.token
                        await fetch(`${API_BASE_URL}/franchise/kiosk/${k.id}/trang-thai`, {
                          method: 'PATCH',
                          headers: {
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({ trang_thai: 'TAM_DUNG' })
                        })
                        loadKiosks()
                      }}
                      style={{ height: '32px', padding: '0 0.75rem', borderRadius: '6px', border: '1px solid #fed7aa', backgroundColor: '#fff7ed', color: '#ea580c', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                    >
                      Tạm dừng
                    </button>
                  )}

                  {k.xep_hang && (
                    <button
                      type="button"
                      onClick={() => openReviewModal(k)}
                      style={{ height: '32px', padding: '0 0.75rem', borderRadius: '6px', border: '1px solid #fde047', backgroundColor: '#fef9c3', color: '#854d0e', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    >
                      <Star size={14} /> Xem Đánh Giá
                    </button>
                  )}

                  {k.trang_thai === 'TAM_DUNG' && (
                    <button
                      type="button"
                      onClick={async () => {
                        const token = getAdminAccessToken() || session?.token
                        await fetch(`${API_BASE_URL}/franchise/kiosk/${k.id}/trang-thai`, {
                          method: 'PATCH',
                          headers: {
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({ trang_thai: 'DANG_HOAT_DONG' })
                        })
                        loadKiosks()
                      }}
                      style={{ height: '32px', padding: '0 0.75rem', borderRadius: '6px', border: '1px solid #a7f3d0', backgroundColor: '#ecfdf5', color: '#059669', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                    >
                      Mở lại hoạt động
                    </button>
                  )}

                  {k.trang_thai !== 'NGUNG_HOAT_DONG' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm('Chắc chắn muốn đóng điểm Kiosk này vĩnh viễn?')) return
                        const token = getAdminAccessToken() || session?.token
                        await fetch(`${API_BASE_URL}/franchise/kiosk/${k.id}/trang-thai`, {
                          method: 'PATCH',
                          headers: {
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({ trang_thai: 'NGUNG_HOAT_DONG' })
                        })
                        loadKiosks()
                      }}
                      style={{ height: '32px', padding: '0 0.75rem', borderRadius: '6px', border: '1px solid #fecaca', backgroundColor: '#fef2f2', color: '#dc2626', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                    >
                      Đóng Kiosk
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      if (!window.confirm('CẢNH BÁO: Kiosk này sẽ bị XÓA VĨNH VIỄN khỏi hệ thống. Hành động này không thể hoàn tác. Bạn có chắc chắn?')) return
                      try {
                        const token = getAdminAccessToken() || session?.token
                        const res = await fetch(`${API_BASE_URL}/franchise/kiosk/${k.id}`, {
                          method: 'DELETE',
                          headers: {
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                          }
                        })
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}))
                          throw new Error(err.message || 'Xóa Kiosk thất bại')
                        }
                        alert('✅ Đã xóa Kiosk thành công!')
                        loadKiosks()
                      } catch (err) {
                        alert('Lỗi: ' + err.message)
                      }
                    }}
                    style={{ height: '32px', padding: '0 0.75rem', borderRadius: '6px', border: '1px solid #dc2626', backgroundColor: '#dc2626', color: '#ffffff', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                  >
                    <Trash2 size={14} /> Xóa Kiosk
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {filteredKiosks.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.85rem', marginTop: '0.5rem', paddingTop: '0.85rem', borderTop: '1px solid #f1f5f9' }}>
              <button
                type="button"
                className="admin-pg-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#334155' }}>
                Trang {currentPage} trên {totalPages}
              </span>
              <button
                type="button"
                className="admin-pg-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {/* CONTRACT MODAL */}
      {contractModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '720px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <FileText size={18} color="#4f46e5" /> Hợp Đồng Nhượng Quyền Thương Mại
              </h3>
              <button
                type="button"
                onClick={() => setContractModal(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', padding: 0 }}
              >
                <X size={20} />
              </button>
            </div>

            <div id="contract-print-area" style={{ padding: '2rem', overflowY: 'auto', flex: 1, fontFamily: 'serif', color: '#0f172a', lineHeight: '1.7' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM
                </h2>
                <div style={{ fontWeight: 'bold', textDecoration: 'underline' }}>Độc lập - Tự do - Hạnh phúc</div>
                <h3 style={{ marginTop: '1.5rem', fontSize: '1.25rem', color: '#1e293b' }}>HỢP ĐỒNG NHƯỢNG QUYỀN THƯƠNG MẠI</h3>
                <div style={{ fontStyle: 'italic', fontSize: '0.875rem', color: '#64748b' }}>Số: {contractModal.ma_kiosk}/HĐNQ-AVG</div>
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
                      <div style={{ marginTop: '2.5rem', fontWeight: 'bold', color: '#2563eb' }}>[ĐÃ KÝ ĐIỆN TỬ]</div>
                    </td>
                    <td style={{ width: '50%' }}>
                      <div style={{ fontWeight: 'bold' }}>ĐẠI DIỆN BÊN B</div>
                      <div style={{ fontStyle: 'italic', fontSize: '0.75rem' }}>(Ký, ghi rõ họ tên)</div>
                      <div style={{ marginTop: '2.5rem', fontWeight: 'bold', color: '#059669' }}>[ĐÃ KÝ ĐIỆN TỬ]</div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ padding: '0.85rem 1.5rem', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => setContractModal(null)}
                style={{ height: '38px', padding: '0 1.15rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: '#334155', cursor: 'pointer', fontWeight: '600', fontSize: '0.8125rem' }}
              >
                Đóng
              </button>
              <button
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
                style={{ height: '38px', padding: '0 1.25rem', borderRadius: '8px', border: 'none', backgroundColor: '#2563eb', color: '#ffffff', cursor: 'pointer', fontWeight: '700', fontSize: '0.8125rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.25)' }}
              >
                <Printer size={15} /> In / Lưu Hợp Đồng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REVIEWS MODAL */}
      {reviewModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '1rem' }}>
          <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <MessageSquare size={18} color="#eab308" /> Đánh Giá Khách Hàng - {reviewModal.ten_kiosk} ({reviewModal.ma_kiosk})
              </h3>
              <button type="button" onClick={() => setReviewModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>
            
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {loadingReviews ? (
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>Đang tải danh sách đánh giá...</div>
              ) : reviews.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.875rem' }}>Kiosk này chưa có đánh giá nào.</div>
              ) : (
                <>
                  <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: '600', color: '#92400e' }}>Đánh giá trung bình:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong style={{ fontSize: '1.1rem', color: '#b45309' }}>{reviewStats.avg} / 5.0</strong>
                      <span style={{ fontSize: '0.85rem', color: '#d97706' }}>({reviewStats.total} đánh giá)</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {reviews.map((rv, idx) => (
                      <div key={idx} style={{ padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc', position: 'relative' }}>
                        <button onClick={() => deleteReview(rv.id)} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' }}>Xóa</button>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', paddingRight: '3rem' }}>
                          <strong style={{ fontSize: '0.9rem', color: '#0f172a' }}>{rv.ten_nguoi_dung || 'Khách hàng ẩn danh'}</strong>
                          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{new Date(rv.ngay_tao).toLocaleDateString('vi-VN')}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '0.5rem' }}>
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={14} style={{ fill: i < (rv.diem_tong_quan || 5) ? '#facc15' : 'transparent', color: i < (rv.diem_tong_quan || 5) ? '#facc15' : '#cbd5e1' }} />
                          ))}
                        </div>
                        {rv.nhan_xet && <div style={{ fontSize: '0.85rem', color: '#334155', fontStyle: 'italic' }}>"{rv.nhan_xet}"</div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
