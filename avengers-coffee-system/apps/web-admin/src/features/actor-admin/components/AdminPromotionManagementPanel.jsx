import React, { useState, useMemo, useEffect, Component } from 'react'
import {
  Ticket,
  Plus,
  Edit3,
  Trash2,
  Search,
  Check,
  X,
  RefreshCw,
  Sparkles,
  Tag,
  Gift,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Percent,
  Calendar,
  Layers,
  Zap,
  Globe,
  Sliders,
  MoreVertical
} from 'lucide-react'

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

function fmtDateShort(value) {
  if (!value) return '---'
  try {
    return new Date(value).toLocaleDateString('vi-VN')
  } catch {
    return String(value)
  }
}

// Error Boundary to prevent crashes
class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Promotion Management Error Boundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #fee2e2', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <AlertCircle size={32} color="#dc2626" style={{ marginBottom: '0.75rem' }} />
          <h3 style={{ color: '#dc2626', margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: '700' }}>
            Không thể hiển thị Giao diện Khuyến mãi &amp; Voucher
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Chi tiết lỗi: {this.state.error?.message || 'Có sự cố xảy ra khi xử lý dữ liệu khuyến mãi.'}
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false })}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '10px',
              background: '#10b981',
              color: '#ffffff',
              border: 'none',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Thử tải lại giao diện
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function PromoPagination({ pageData, onPageChange }) {
  if (!pageData || pageData.total <= 10) return null
  return (
    <div className="promo-pagination-bar">
      <span className="promo-pagination-info">
        Hiển thị {pageData.from} - {pageData.to} trên tổng số {pageData.total} mã
      </span>
      <div className="promo-pagination-actions">
        <button
          type="button"
          className="admin-pg-btn"
          onClick={() => onPageChange(1)}
          disabled={pageData.page <= 1}
          title="Trang đầu"
        >
          <ChevronsLeft size={18} />
        </button>
        <button
          type="button"
          className="admin-pg-btn"
          onClick={() => onPageChange(pageData.page - 1)}
          disabled={pageData.page <= 1}
          title="Trang trước"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="promo-pg-current">
          Trang {pageData.page} trên {pageData.totalPages}
        </span>
        <button
          type="button"
          className="admin-pg-btn"
          onClick={() => onPageChange(pageData.page + 1)}
          disabled={pageData.page >= pageData.totalPages}
          title="Trang sau"
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          className="admin-pg-btn"
          onClick={() => onPageChange(pageData.totalPages)}
          disabled={pageData.page >= pageData.totalPages}
          title="Trang cuối"
        >
          <ChevronsRight size={18} />
        </button>
      </div>
    </div>
  )
}

function AdminPromotionManagementPanelContent({
  promotionsState = { loading: false, error: '', items: [] },
  loadPromotions,
  promotionFilter = { q: '', type: '', status: '' },
  setPromotionFilter,
  promotionFilteredItems = [],
  promotionForm = {},
  setPromotionForm,
  editingPromotionCode,
  startEditPromotion,
  cancelEditPromotion,
  savePromotion,
  deletePromotion,
  savingPromotion,
  PROMOTION_TYPES = [],
  menuItemsList = [],
}) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalActiveTab, setModalActiveTab] = useState('basic') // 'basic', 'rules'
  const [activeDistributionTab, setActiveDistributionTab] = useState('PUBLIC') // 'PUBLIC', 'TEMPLATE'
  const [page, setPage] = useState(1)
  const [openPromoActionId, setOpenPromoActionId] = useState(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleGlobalClick = () => setOpenPromoActionId(null)
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  // Sync edit mode to modal open
  useEffect(() => {
    if (editingPromotionCode) {
      setIsModalOpen(true)
    }
  }, [editingPromotionCode])

  // Reset page when filter changes
  useEffect(() => {
    setPage(1)
  }, [promotionFilter.q, promotionFilter.type, promotionFilter.status, activeDistributionTab])

  // Statistics
  const stats = useMemo(() => {
    const items = (promotionsState.items || []).filter(Boolean)
    const total = items.length
    const publicCount = items.filter((i) => (i.loai_phan_phoi || 'PUBLIC') === 'PUBLIC').length
    const templateCount = items.filter((i) => i.loai_phan_phoi === 'TEMPLATE').length
    const activeCount = items.filter((i) => i.trang_thai === 'ACTIVE').length
    return { total, publicCount, templateCount, activeCount }
  }, [promotionsState.items])

  // Filtered items list according to current tab and search query
  const displayedItems = useMemo(() => {
    let result = (promotionFilteredItems || []).filter(Boolean)

    // Filter by distribution tab
    if (activeDistributionTab === 'PUBLIC') {
      result = result.filter((i) => (i.loai_phan_phoi || 'PUBLIC') === 'PUBLIC')
    } else if (activeDistributionTab === 'TEMPLATE') {
      result = result.filter((i) => i.loai_phan_phoi === 'TEMPLATE')
    }

    return result
  }, [promotionFilteredItems, activeDistributionTab])

  // Pagination data calculation
  const pageSize = 10
  const pageData = useMemo(() => {
    const total = displayedItems.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(Math.max(Number(page || 1), 1), totalPages)
    const start = (safePage - 1) * pageSize
    const end = start + pageSize
    const rows = displayedItems.slice(start, end)
    return {
      total,
      totalPages,
      page: safePage,
      from: total === 0 ? 0 : start + 1,
      to: Math.min(end, total),
      rows
    }
  }, [displayedItems, page])

  const handleOpenAddModal = (distributionType = 'PUBLIC') => {
    if (cancelEditPromotion) cancelEditPromotion()
    if (setPromotionForm) {
      setPromotionForm((p) => ({ ...p, loai_phan_phoi: distributionType }))
    }
    setModalActiveTab('basic')
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (cancelEditPromotion) cancelEditPromotion()
    setIsModalOpen(false)
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    try {
      if (savePromotion) await savePromotion()
      setIsModalOpen(false)
    } catch {
      // Keep modal open if save error occurs
    }
  }

  const safeForm = promotionForm || {}

  const TRIGGER_CONTEXTS = [
    { code: 'TIER_UP', label: 'Thăng hạng thành viên' },
    { code: 'LUCKY_WHEEL', label: 'Vòng quay may mắn' },
    { code: 'BIRTHDAY', label: 'Quà sinh nhật' },
    { code: 'FREESHIP', label: 'Mã miễn phí vận chuyển' },
  ]

  return (
    <div className="promo-manage-container">
      {/* Header section */}
      <div className="promo-manage-header">
        <div className="promo-manage-header-title">
          <div className="promo-manage-icon-wrapper">
            <Ticket size={24} className="promo-header-icon" />
          </div>
          <div>
            <h2>Quản lý Khuyến mãi &amp; Voucher</h2>
            <p>Thiết lập danh sách mã ưu đãi công khai và các mẫu Voucher nội bộ phát tự động</p>
          </div>
        </div>
        <div className="promo-manage-header-actions">
          {loadPromotions && (
            <button type="button" className="promo-refresh-btn" onClick={loadPromotions} title="Tải lại dữ liệu">
              <RefreshCw size={16} />
              <span>Tải lại</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="promo-kpi-grid">
        <div className="promo-kpi-card promo-kpi-card--total">
          <div className="promo-kpi-icon promo-kpi-icon--total">
            <Ticket size={20} />
          </div>
          <div className="promo-kpi-content">
            <span className="promo-kpi-label">Tổng số Voucher</span>
            <span className="promo-kpi-value">{stats.total}</span>
          </div>
        </div>

        <div className="promo-kpi-card promo-kpi-card--public">
          <div className="promo-kpi-icon promo-kpi-icon--public">
            <Tag size={20} />
          </div>
          <div className="promo-kpi-content">
            <span className="promo-kpi-label">Mã công khai</span>
            <span className="promo-kpi-value">{stats.publicCount}</span>
          </div>
        </div>

        <div className="promo-kpi-card promo-kpi-card--template">
          <div className="promo-kpi-icon promo-kpi-icon--template">
            <Sparkles size={20} />
          </div>
          <div className="promo-kpi-content">
            <span className="promo-kpi-label">Template nội bộ</span>
            <span className="promo-kpi-value">{stats.templateCount}</span>
          </div>
        </div>

        <div className="promo-kpi-card promo-kpi-card--active">
          <div className="promo-kpi-icon promo-kpi-icon--active">
            <CheckCircle2 size={20} />
          </div>
          <div className="promo-kpi-content">
            <span className="promo-kpi-label">Đang hiệu lực</span>
            <span className="promo-kpi-value">{stats.activeCount}</span>
          </div>
        </div>
      </div>

      {/* Full Width Card */}
      <div className="promo-list-card">
        {/* Toolbar & Filters */}
        <div className="promo-toolbar">
          {/* Main Distribution Tabs (Public vs Template) */}
          <div className="promo-type-tabs">
            <button
              type="button"
              className={`promo-type-tab promo-type-tab--public ${activeDistributionTab === 'PUBLIC' ? 'active' : ''}`}
              onClick={() => setActiveDistributionTab('PUBLIC')}
            >
              <Tag size={18} strokeWidth={2.2} style={{ stroke: activeDistributionTab === 'PUBLIC' ? '#ffffff' : '#2563eb', flexShrink: 0 }} className="promo-type-tab-icon" />
              <span>Mã áp dụng công khai</span>
              <span className="promo-tab-badge">{stats.publicCount}</span>
            </button>

            <button
              type="button"
              className={`promo-type-tab promo-type-tab--template ${activeDistributionTab === 'TEMPLATE' ? 'active' : ''}`}
              onClick={() => setActiveDistributionTab('TEMPLATE')}
            >
              <Sparkles size={18} strokeWidth={2.2} style={{ stroke: activeDistributionTab === 'TEMPLATE' ? '#ffffff' : '#9333ea', flexShrink: 0 }} className="promo-type-tab-icon" />
              <span>Template Voucher nội bộ</span>
              <span className="promo-tab-badge">{stats.templateCount}</span>
            </button>
          </div>

          <div className="promo-filter-group">
            {/* Search Input with right-side button */}
            <div className="promo-search-box">
              <div className="promo-search-input-wrap">
                <input
                  type="text"
                  value={promotionFilter.q || ''}
                  onChange={(e) => setPromotionFilter && setPromotionFilter((p) => ({ ...p, q: e.target.value }))}
                  placeholder="Tìm mã hoặc tên chương trình..."
                />
                {promotionFilter.q && (
                  <button
                    type="button"
                    className="promo-search-clear"
                    onClick={() => setPromotionFilter && setPromotionFilter((p) => ({ ...p, q: '' }))}
                    title="Xóa tìm kiếm"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button type="button" className="promo-search-btn" title="Tìm kiếm">
                <Search size={18} strokeWidth={2.5} style={{ stroke: '#ffffff', flexShrink: 0 }} />
              </button>
            </div>

            {/* Status Filter */}
            <select
              className="promo-filter-select"
              value={promotionFilter.status || ''}
              onChange={(e) => setPromotionFilter && setPromotionFilter((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Tạm dừng</option>
            </select>

            <button
              type="button"
              className="promo-btn promo-btn--success promo-create-btn"
              onClick={() => handleOpenAddModal(activeDistributionTab)}
            >
              <Plus size={18} strokeWidth={2.5} style={{ stroke: '#ffffff', flexShrink: 0 }} />
              <span>{activeDistributionTab === 'PUBLIC' ? 'Tạo mã mới' : 'Tạo template'}</span>
            </button>
          </div>
        </div>

        {/* Loading & Error States */}
        {promotionsState.loading && (
          <div className="promo-state-box">
            <RefreshCw size={24} className="promo-spin-icon" />
            <span>Đang tải danh sách chương trình khuyến mãi...</span>
          </div>
        )}

        {promotionsState.error && (
          <div className="promo-state-box promo-state-box--error">
            <AlertCircle size={20} />
            <span>{promotionsState.error}</span>
          </div>
        )}

        {/* Table Content */}
        {!promotionsState.loading && !promotionsState.error && (
          <>
            {pageData.rows.length === 0 ? (
              <div className="promo-state-box promo-state-box--empty">
                <Info size={24} />
                <span>Không tìm thấy chương trình ưu đãi nào phù hợp.</span>
              </div>
            ) : activeDistributionTab === 'PUBLIC' ? (
              /* TABLE FOR PUBLIC CODES */
              <div className="promo-table-wrapper">
                <table className="promo-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Mã &amp; Tên chương trình</th>
                      <th style={{ width: '18%' }}>Quy tắc giảm giá</th>
                      <th style={{ width: '15%' }}>Đơn tối thiểu</th>
                      <th style={{ width: '17%' }}>Thời gian áp dụng</th>
                      <th style={{ width: '13%' }}>Lượt sử dụng</th>
                      <th style={{ width: '12%' }}>Trạng thái</th>
                      <th style={{ width: '10%' }} className="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.rows.map((item, index, array) => {
                      const code = item.ma_khuyen_mai || item.ma_voucher || '---'
                      const isEditingThis = editingPromotionCode === code
                      const discountLabel =
                        (item.loai_khuyen_mai || item.loai) === 'PERCENT'
                          ? `Giảm ${item.gia_tri}%${item.giam_toi_da ? ` (Tối đa ${fmtNumber(item.giam_toi_da)} đ)` : ''}`
                          : (item.loai_khuyen_mai || item.loai) === 'FIXED'
                            ? `Giảm ${fmtNumber(item.gia_tri)} đ`
                            : `Tặng: ${item.ten_san_pham_tang || 'Món quà'}`

                      const minOrder =
                        Number(item.gia_tri_don_toi_thieu || item.don_hang_toi_thieu || 0) > 0
                          ? `${fmtNumber(item.gia_tri_don_toi_thieu || item.don_hang_toi_thieu)} đ`
                          : 'Không giới hạn'

                      const usageText = `${item.so_luong_da_dung || item.luot_da_dung || 0}${item.so_luong_toi_da || item.tong_luot_dung
                          ? ` trên ${fmtNumber(item.so_luong_toi_da || item.tong_luot_dung)}`
                          : ' lượt'
                        }`

                      return (
                        <tr key={code} className={isEditingThis ? 'is-editing-row' : ''}>
                          {/* Code & Name */}
                          <td>
                            <div className="promo-code-cell">
                              <span className="promo-code-badge">{code}</span>
                              <span className="promo-name-title">{item.ten_khuyen_mai || item.ten_voucher}</span>
                              {item.mo_ta && <span className="promo-desc-text">{item.mo_ta}</span>}
                            </div>
                          </td>

                          {/* Discount Rule */}
                          <td>
                            <span className="promo-rule-highlight">{discountLabel}</span>
                          </td>

                          {/* Min Order */}
                          <td>
                            <span className="promo-min-order">{minOrder}</span>
                          </td>

                          {/* Validity Period */}
                          <td>
                            <div className="promo-period-cell">
                              <span>Từ: {fmtDateShort(item.ngay_bat_dau)}</span>
                              <span>Đến: {fmtDateShort(item.ngay_ket_thuc || item.han_su_dung)}</span>
                            </div>
                          </td>

                          {/* Usage Count */}
                          <td>
                            <span className="promo-usage-text">{usageText}</span>
                          </td>

                          {/* Status */}
                          <td>
                            {item.trang_thai === 'ACTIVE' ? (
                              <span className="promo-status-badge promo-status-badge--active">
                                <CheckCircle2 size={12} />
                                <span>Hoạt động</span>
                              </span>
                            ) : (
                              <span className="promo-status-badge promo-status-badge--inactive">
                                <XCircle size={12} />
                                <span>Tạm dừng</span>
                              </span>
                            )}
                          </td>

                          <td style={{ textAlign: 'center', position: 'relative', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn-icon-more"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenPromoActionId(openPromoActionId === code ? null : code)
                              }}
                              title="Thao tác"
                            >
                              <MoreVertical size={16} color="#475569" />
                            </button>

                            {openPromoActionId === code && (
                              <div
                                style={{
                                  position: 'absolute',
                                  right: 'calc(100% + 6px)',
                                  top: index >= (array.length - 2) ? 'auto' : '-4px',
                                  bottom: index >= (array.length - 2) ? '-4px' : 'auto',
                                  backgroundColor: '#ffffff',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                  zIndex: 9999,
                                  minWidth: '170px',
                                  padding: '0.35rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.15rem'
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="btn-dropdown-item"
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', color: '#2563eb', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  onClick={() => {
                                    setOpenPromoActionId(null)
                                    if (startEditPromotion) startEditPromotion(item)
                                    setIsModalOpen(true)
                                  }}
                                >
                                  <Edit3 size={14} color="#2563eb" /> Chỉnh sửa mã
                                </button>

                                <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.2rem 0' }}></div>

                                <button
                                  type="button"
                                  className="btn-dropdown-item danger"
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  onClick={() => {
                                    setOpenPromoActionId(null)
                                    if (deletePromotion) deletePromotion(code)
                                  }}
                                >
                                  <Trash2 size={14} color="#dc2626" /> Xóa voucher
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* TABLE FOR INTERNAL TEMPLATES */
              <div className="promo-table-wrapper">
                <table className="promo-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Mẫu Template</th>
                      <th style={{ width: '25%' }}>Ngữ cảnh phát tự động</th>
                      <th style={{ width: '20%' }}>Quy tắc giảm giá</th>
                      <th style={{ width: '15%' }}>Hạn sử dụng khi cấp</th>
                      <th style={{ width: '15%' }} className="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.rows.map((item, index, array) => {
                      const code = item.ma_khuyen_mai || item.ma_voucher || '---'
                      const isEditingThis = editingPromotionCode === code
                      const rawCtx = item.ngu_canh_su_dung || ''
                      const ctxList = typeof rawCtx === 'string'
                        ? rawCtx.split(',').map((s) => s.trim()).filter(Boolean)
                        : (Array.isArray(rawCtx) ? rawCtx : [])

                      const CTX_MAP = {
                        TIER_UP: 'Thăng hạng',
                        LUCKY_WHEEL: 'Vòng quay',
                        BIRTHDAY: 'Sinh nhật',
                        FREESHIP: 'Freeship'
                      }

                      const discountLabel =
                        (item.loai_khuyen_mai || item.loai) === 'PERCENT'
                          ? `Giảm ${item.gia_tri}%${item.giam_toi_da ? ` (Tối đa ${fmtNumber(item.giam_toi_da)} đ)` : ''}`
                          : (item.loai_khuyen_mai || item.loai) === 'FIXED'
                            ? `Giảm ${fmtNumber(item.gia_tri)} đ`
                            : `Tặng: ${item.ten_san_pham_tang || 'Món quà'}`

                      const validityDays = item.so_ngay_hieu_luc ? `${item.so_ngay_hieu_luc} ngày kể từ ngày cấp` : '30 ngày mặc định'

                      return (
                        <tr key={code} className={isEditingThis ? 'is-editing-row' : ''}>
                          {/* Template Name & Code */}
                          <td>
                            <div className="promo-code-cell">
                              <span className="promo-code-badge promo-code-badge--template">{code}</span>
                              <span className="promo-name-title">{item.ten_khuyen_mai || item.ten_voucher}</span>
                            </div>
                          </td>

                          {/* Trigger Context Badges */}
                          <td>
                            <div className="promo-tags-group">
                              {ctxList.length > 0 ? (
                                ctxList.map((ctx) => (
                                  <span key={ctx} className="promo-ctx-tag">
                                    <Zap size={11} />
                                    <span>{CTX_MAP[ctx] || ctx}</span>
                                  </span>
                                ))
                              ) : (
                                <span className="promo-ctx-tag promo-ctx-tag--empty">Chưa gán ngữ cảnh</span>
                              )}
                            </div>
                          </td>

                          {/* Discount Rule */}
                          <td>
                            <span className="promo-rule-highlight">{discountLabel}</span>
                          </td>

                          {/* Validity After Issue */}
                          <td>
                            <span className="promo-period-text">{validityDays}</span>
                          </td>

                          {/* Actions */}
                          <td style={{ textAlign: 'center', position: 'relative', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn-icon-more"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenPromoActionId(openPromoActionId === code ? null : code)
                              }}
                              title="Thao tác"
                            >
                              <MoreVertical size={16} color="#475569" />
                            </button>

                            {openPromoActionId === code && (
                              <div
                                style={{
                                  position: 'absolute',
                                  right: 'calc(100% + 6px)',
                                  top: index >= (array.length - 2) ? 'auto' : '-4px',
                                  bottom: index >= (array.length - 2) ? '-4px' : 'auto',
                                  backgroundColor: '#ffffff',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                  zIndex: 9999,
                                  minWidth: '170px',
                                  padding: '0.35rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.15rem'
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  className="btn-dropdown-item"
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', color: '#2563eb', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  onClick={() => {
                                    setOpenPromoActionId(null)
                                    if (startEditPromotion) startEditPromotion(item)
                                    setIsModalOpen(true)
                                  }}
                                >
                                  <Edit3 size={14} color="#2563eb" /> Chỉnh sửa template
                                </button>

                                <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.2rem 0' }}></div>

                                <button
                                  type="button"
                                  className="btn-dropdown-item danger"
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  onClick={() => {
                                    setOpenPromoActionId(null)
                                    if (deletePromotion) deletePromotion(code)
                                  }}
                                >
                                  <Trash2 size={14} color="#dc2626" /> Xóa template
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Component */}
            <PromoPagination pageData={pageData} onPageChange={setPage} />
          </>
        )}
      </div>

      {/* POPUP MODAL DIALOG FOR ADD / EDIT PROMOTION */}
      {isModalOpen && (
        <div className="promo-modal-overlay" onClick={handleCloseModal}>
          <div className="promo-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="promo-modal-head">
              <div className="promo-modal-title">
                {editingPromotionCode ? (
                  <>
                    <Edit3 size={20} className="promo-head-icon edit-mode" />
                    <div>
                      <h3>Chỉnh sửa chương trình Voucher</h3>
                      <span>Mã: {editingPromotionCode}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <Plus size={20} className="promo-head-icon add-mode" />
                    <div>
                      <h3>Tạo chương trình Voucher mới</h3>
                      <span>Thiết lập thông tin mã ưu đãi hoặc khuôn mẫu phát tự động</span>
                    </div>
                  </>
                )}
              </div>
              <button type="button" className="promo-modal-close" onClick={handleCloseModal} title="Đóng">
                <X size={18} />
              </button>
            </div>

            {/* Modal Internal Tabs */}
            <div className="promo-modal-tabs">
              <button
                type="button"
                className={`promo-modal-tab-btn ${modalActiveTab === 'basic' ? 'active' : ''}`}
                onClick={() => setModalActiveTab('basic')}
              >
                <Ticket size={15} />
                <span>Thông tin &amp; Quy tắc giảm</span>
              </button>

              <button
                type="button"
                className={`promo-modal-tab-btn ${modalActiveTab === 'rules' ? 'active' : ''}`}
                onClick={() => setModalActiveTab('rules')}
              >
                <Sliders size={15} />
                <span>{safeForm.loai_phan_phoi === 'TEMPLATE' ? 'Ngữ cảnh tự động' : 'Điều kiện & Phân phối'}</span>
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="promo-modal-body">
              {/* TAB 1: BASIC & DISCOUNT RULES */}
              {modalActiveTab === 'basic' && (
                <div className="promo-modal-section">
                  {/* Distribution Type Selection (Public vs Template) */}
                  <div className="promo-form-group promo-form-group--full">
                    <label>
                      Loại hình chương trình ưu đãi <span className="promo-required">*</span>
                    </label>
                    <div className="promo-type-grid">
                      <div
                        className={`promo-type-card ${safeForm.loai_phan_phoi === 'PUBLIC' ? 'is-selected' : ''} ${editingPromotionCode ? 'is-disabled' : ''
                          }`}
                        onClick={() => {
                          if (!editingPromotionCode && setPromotionForm) {
                            setPromotionForm((p) => ({ ...p, loai_phan_phoi: 'PUBLIC' }))
                          }
                        }}
                      >
                        <div className="promo-type-card-head">
                          <label>
                            <input
                              type="radio"
                              name="loai_phan_phoi"
                              checked={safeForm.loai_phan_phoi === 'PUBLIC'}
                              onChange={() => {
                                if (!editingPromotionCode && setPromotionForm) {
                                  setPromotionForm((p) => ({ ...p, loai_phan_phoi: 'PUBLIC' }))
                                }
                              }}
                              disabled={Boolean(editingPromotionCode)}
                            />
                            <strong>Mã Voucher công khai</strong>
                          </label>
                          <span className="promo-chip promo-chip--blue">Phát hành rộng rãi</span>
                        </div>
                        <p>Khách hàng tự nhập mã voucher này trên ứng dụng khi thanh toán đặt hàng.</p>
                      </div>

                      <div
                        className={`promo-type-card ${safeForm.loai_phan_phoi === 'TEMPLATE' ? 'is-selected' : ''} ${editingPromotionCode ? 'is-disabled' : ''
                          }`}
                        onClick={() => {
                          if (!editingPromotionCode && setPromotionForm) {
                            setPromotionForm((p) => ({ ...p, loai_phan_phoi: 'TEMPLATE' }))
                          }
                        }}
                      >
                        <div className="promo-type-card-head">
                          <label>
                            <input
                              type="radio"
                              name="loai_phan_phoi"
                              checked={safeForm.loai_phan_phoi === 'TEMPLATE'}
                              onChange={() => {
                                if (!editingPromotionCode && setPromotionForm) {
                                  setPromotionForm((p) => ({ ...p, loai_phan_phoi: 'TEMPLATE' }))
                                }
                              }}
                              disabled={Boolean(editingPromotionCode)}
                            />
                            <strong>Template nội bộ</strong>
                          </label>
                          <span className="promo-chip promo-chip--purple">Dùng cho hệ thống</span>
                        </div>
                        <p>Khuôn mẫu phát tự động cho sự kiện Thăng hạng, Sinh nhật, Vòng quay...</p>
                      </div>
                    </div>
                  </div>

                  <div className="promo-form-grid">
                    {/* Program Name */}
                    <div className="promo-form-group">
                      <label htmlFor="promo-name-input">
                        {safeForm.loai_phan_phoi === 'PUBLIC' ? 'Tên chương trình' : 'Tên mẫu Template'} <span className="promo-required">*</span>
                      </label>
                      <input
                        id="promo-name-input"
                        type="text"
                        value={safeForm.ten_khuyen_mai || ''}
                        onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, ten_khuyen_mai: e.target.value }))}
                        placeholder={safeForm.loai_phan_phoi === 'PUBLIC' ? 'Ví dụ: Khuyến Mãi Mùa Hè 2026' : 'Ví dụ: Quà Sinh Nhật Khách VIP'}
                        required
                        autoFocus
                      />
                    </div>

                    {/* Program Code */}
                    <div className="promo-form-group">
                      <div className="promo-label-row">
                        <label htmlFor="promo-code-input">
                          {safeForm.loai_phan_phoi === 'PUBLIC' ? 'Mã Voucher' : 'Mã Template'} <span className="promo-required">*</span>
                        </label>
                        {safeForm.loai_phan_phoi === 'PUBLIC' && !editingPromotionCode && (
                          <button
                            type="button"
                            className="promo-link-btn"
                            onClick={() => {
                              const rnd = `PUB_${Math.random().toString(36).substring(2, 7).toUpperCase()}`
                              if (setPromotionForm) setPromotionForm((p) => ({ ...p, ma_khuyen_mai: rnd }))
                            }}
                          >
                            Tạo mã tự động
                          </button>
                        )}
                      </div>
                      <input
                        id="promo-code-input"
                        type="text"
                        value={safeForm.ma_khuyen_mai || ''}
                        onChange={(e) =>
                          setPromotionForm &&
                          setPromotionForm((p) => ({
                            ...p,
                            ma_khuyen_mai: e.target.value.toUpperCase().replace(/\s+/g, '_')
                          }))
                        }
                        placeholder={safeForm.loai_phan_phoi === 'PUBLIC' ? 'Ví dụ: SUMMER2026' : 'Tự động phát mã'}
                        disabled={Boolean(editingPromotionCode)}
                        required
                      />
                    </div>

                    {/* Discount Type */}
                    <div className="promo-form-group">
                      <label htmlFor="promo-type-select">Hình thức giảm giá</label>
                      <select
                        id="promo-type-select"
                        value={safeForm.loai_khuyen_mai || 'PERCENT'}
                        onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, loai_khuyen_mai: e.target.value }))}
                      >
                        {(PROMOTION_TYPES || []).map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Discount Value */}
                    <div className="promo-form-group">
                      <label htmlFor="promo-value-input">
                        {safeForm.loai_khuyen_mai === 'PERCENT'
                          ? 'Mức giảm (%)'
                          : safeForm.loai_khuyen_mai === 'FIXED'
                            ? 'Số tiền giảm (VNĐ)'
                            : 'Giá trị giảm'}
                      </label>
                      <input
                        id="promo-value-input"
                        type="number"
                        min="0"
                        max={safeForm.loai_khuyen_mai === 'PERCENT' ? 100 : undefined}
                        value={safeForm.gia_tri ?? ''}
                        onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, gia_tri: e.target.value }))}
                        disabled={safeForm.loai_khuyen_mai === 'FREE_ITEM'}
                        placeholder={safeForm.loai_khuyen_mai === 'PERCENT' ? 'Ví dụ: 15' : 'Ví dụ: 30000'}
                      />
                    </div>

                    {/* Max Discount (for PERCENT) or Free Item select */}
                    <div className="promo-form-group">
                      {safeForm.loai_khuyen_mai === 'PERCENT' ? (
                        <>
                          <label htmlFor="promo-max-discount">Số tiền giảm tối đa (VNĐ)</label>
                          <input
                            id="promo-max-discount"
                            type="number"
                            min="0"
                            value={safeForm.giam_toi_da || ''}
                            onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, giam_toi_da: e.target.value }))}
                            placeholder="Để trống = Không giới hạn"
                          />
                        </>
                      ) : safeForm.loai_khuyen_mai === 'FREE_ITEM' ? (
                        <>
                          <label htmlFor="promo-free-item-select">Sản phẩm tặng kèm</label>
                          <select
                            id="promo-free-item-select"
                            value={safeForm.ten_san_pham_tang || ''}
                            onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, ten_san_pham_tang: e.target.value }))}
                          >
                            <option value="">-- Chọn sản phẩm tặng --</option>
                            {(menuItemsList || []).map((item) => (
                              <option key={item.id} value={item.name}>
                                {item.name} ({fmtNumber(item.price)} đ)
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <>
                          <label htmlFor="promo-max-disc-disabled">Giảm tối đa (VNĐ)</label>
                          <input
                            id="promo-max-disc-disabled"
                            disabled
                            placeholder="Không áp dụng cho giảm cố định"
                          />
                        </>
                      )}
                    </div>

                    {/* Minimum Order Amount */}
                    <div className="promo-form-group">
                      <label htmlFor="promo-min-order-input">Đơn hàng tối thiểu (VNĐ)</label>
                      <input
                        id="promo-min-order-input"
                        type="number"
                        min="0"
                        value={safeForm.gia_tri_don_toi_thieu ?? ''}
                        onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, gia_tri_don_toi_thieu: e.target.value }))}
                        placeholder="0 = Không giới hạn đơn"
                      />
                    </div>

                    {/* Banner Image URL */}
                    <div className="promo-form-group promo-form-group--full">
                      <label htmlFor="promo-image-url">Đường dẫn ảnh Banner chương trình</label>
                      <input
                        id="promo-image-url"
                        type="text"
                        value={safeForm.hinh_anh || ''}
                        onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, hinh_anh: e.target.value }))}
                        placeholder="https://..."
                      />
                    </div>

                    {/* Description */}
                    <div className="promo-form-group promo-form-group--full">
                      <label htmlFor="promo-desc-textarea">Mô tả chương trình ưu đãi</label>
                      <textarea
                        id="promo-desc-textarea"
                        rows={2}
                        value={safeForm.mo_ta || ''}
                        onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, mo_ta: e.target.value }))}
                        placeholder="Mô tả chi tiết thể lệ chương trình khuyến mãi..."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: RULES & DISTRIBUTION CONDITIONS */}
              {modalActiveTab === 'rules' && (
                <div className="promo-modal-section">
                  {safeForm.loai_phan_phoi === 'PUBLIC' ? (
                    /* PUBLIC VOUCHER RULES */
                    <div className="promo-form-grid">
                      <div className="promo-form-group">
                        <label htmlFor="promo-total-qty">Tổng lượt phát hành tối đa</label>
                        <input
                          id="promo-total-qty"
                          type="number"
                          min="0"
                          value={safeForm.so_luong_toi_da ?? ''}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, so_luong_toi_da: e.target.value }))}
                          placeholder="0 = Không giới hạn"
                        />
                      </div>

                      <div className="promo-form-group">
                        <label htmlFor="promo-per-user-qty">Lượt sử dụng tối đa / Khách</label>
                        <input
                          id="promo-per-user-qty"
                          type="number"
                          min="1"
                          value={safeForm.gioi_han_moi_nguoi ?? '1'}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, gioi_han_moi_nguoi: e.target.value }))}
                        />
                      </div>

                      <div className="promo-form-group">
                        <label htmlFor="promo-status-select">Trạng thái hoạt động</label>
                        <select
                          id="promo-status-select"
                          value={safeForm.trang_thai || 'ACTIVE'}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, trang_thai: e.target.value }))}
                        >
                          <option value="ACTIVE">Hoạt động</option>
                          <option value="INACTIVE">Tạm dừng</option>
                        </select>
                      </div>

                      <div className="promo-form-group">
                        <label htmlFor="promo-start-date">Thời gian bắt đầu</label>
                        <input
                          id="promo-start-date"
                          type="datetime-local"
                          value={safeForm.ngay_bat_dau || ''}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, ngay_bat_dau: e.target.value }))}
                        />
                      </div>

                      <div className="promo-form-group">
                        <label htmlFor="promo-end-date">Thời gian kết thúc</label>
                        <input
                          id="promo-end-date"
                          type="datetime-local"
                          value={safeForm.ngay_ket_thuc || ''}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, ngay_ket_thuc: e.target.value }))}
                        />
                      </div>

                      <div className="promo-form-group">
                        <label>Hiển thị trên ứng dụng</label>
                        <div className="promo-checkbox-card">
                          <input
                            type="checkbox"
                            id="hien_thi_cho_khach_chk"
                            checked={Boolean(safeForm.hien_thi_cho_khach)}
                            onChange={(e) =>
                              setPromotionForm && setPromotionForm((p) => ({ ...p, hien_thi_cho_khach: e.target.checked }))
                            }
                          />
                          <label htmlFor="hien_thi_cho_khach_chk">Hiển thị trong trang Khuyến mãi cho khách</label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* TEMPLATE RULES */
                    <div className="promo-form-grid">
                      <div className="promo-form-group promo-form-group--full">
                        <label>Ngữ cảnh tự động cấp voucher cho người dùng</label>
                        <div className="promo-context-grid">
                          {TRIGGER_CONTEXTS.map((ctx) => {
                            const currentContexts = Array.isArray(safeForm.ngu_canh_su_dung)
                              ? safeForm.ngu_canh_su_dung
                              : (typeof safeForm.ngu_canh_su_dung === 'string'
                                ? safeForm.ngu_canh_su_dung.split(',').map((s) => s.trim())
                                : [])

                            const isChecked = currentContexts.includes(ctx.code)
                            return (
                              <label key={ctx.code} className={`promo-context-item ${isChecked ? 'is-selected' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    let next = [...currentContexts]
                                    if (e.target.checked) {
                                      if (!next.includes(ctx.code)) next.push(ctx.code)
                                    } else {
                                      next = next.filter((c) => c !== ctx.code)
                                    }
                                    if (setPromotionForm) {
                                      setPromotionForm((p) => ({ ...p, ngu_canh_su_dung: next }))
                                    }
                                  }}
                                />
                                <span>{ctx.label}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>

                      <div className="promo-form-group">
                        <label htmlFor="promo-valid-days">Hạn sử dụng sau khi cấp (ngày)</label>
                        <input
                          id="promo-valid-days"
                          type="number"
                          min="1"
                          value={safeForm.so_ngay_hieu_luc || ''}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, so_ngay_hieu_luc: e.target.value }))}
                          placeholder="Mặc định: 30 ngày"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="promo-modal-footer">
                <button
                  type="button"
                  className="promo-btn promo-btn--neutral"
                  onClick={handleCloseModal}
                  disabled={savingPromotion}
                >
                  <X size={16} />
                  <span>Hủy bỏ</span>
                </button>

                <button
                  type="submit"
                  className="promo-btn promo-btn--success"
                  disabled={savingPromotion || !String(safeForm.ten_khuyen_mai || '').trim() || !safeForm.ma_khuyen_mai}
                >
                  {savingPromotion ? (
                    <>
                      <RefreshCw size={16} className="promo-spin-icon" />
                      <span>Đang lưu...</span>
                    </>
                  ) : editingPromotionCode ? (
                    <>
                      <Check size={16} />
                      <span>Lưu cập nhật</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Tạo chương trình</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export function AdminPromotionManagementPanel(props) {
  return (
    <PanelErrorBoundary>
      <AdminPromotionManagementPanelContent {...props} />
    </PanelErrorBoundary>
  )
}
