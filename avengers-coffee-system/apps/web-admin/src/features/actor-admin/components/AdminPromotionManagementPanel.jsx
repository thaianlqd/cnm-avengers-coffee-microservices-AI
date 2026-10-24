import StatusBadge from '../../../components/console/StatusBadge'
import DateTimePicker from '../../../components/console/DateTimePicker'
import { Card } from '../../../components/ui/card'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Table } from '../../../components/ui/table'
import { Badge } from '../../../components/ui/badge'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import SearchableSelect from '../../../components/console/SearchableSelect'
import CurrencyInput from '../../../components/console/CurrencyInput'
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
  MoreVertical,
  Upload
} from '../../../components/console/WorkspaceIcons'

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
        <Card className="admin-surface" style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: '#ffffff', borderRadius: "10px", border: '1px solid #fee2e2', boxShadow: "none" }}>
          <AlertCircle size={32} color="#dc2626" style={{ marginBottom: '0.75rem' }} />
          <h3 style={{ color: '#dc2626', margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: "600" }}>
            Không thể hiển thị Giao diện Khuyến mãi và Voucher
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Chi tiết lỗi: {this.state.error?.message || 'Có sự cố xảy ra khi xử lý dữ liệu khuyến mãi.'}
          </p>
          <Button className="admin-button-primary"
            type="button"
            onClick={() => this.setState({ hasError: false })}
            style={{
              padding: '0.6rem 1.25rem',
              borderRadius: '10px',
              background: "var(--primary)",
              color: '#ffffff',
              border: 'none',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Thử tải lại giao diện
          </Button>
        </Card>
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
        <Button
          type="button"
          className="admin-pg-btn"
          onClick={() => onPageChange(1)}
          disabled={pageData.page <= 1}
          title="Trang đầu"
        >
          <ChevronsLeft size={18} />
        </Button>
        <Button
          type="button"
          className="admin-pg-btn"
          onClick={() => onPageChange(pageData.page - 1)}
          disabled={pageData.page <= 1}
          title="Trang trước"
        >
          <ChevronLeft size={18} />
        </Button>
        <span className="promo-pg-current">
          Trang {pageData.page} trên {pageData.totalPages}
        </span>
        <Button
          type="button"
          className="admin-pg-btn"
          onClick={() => onPageChange(pageData.page + 1)}
          disabled={pageData.page >= pageData.totalPages}
          title="Trang sau"
        >
          <ChevronRight size={18} />
        </Button>
        <Button
          type="button"
          className="admin-pg-btn"
          onClick={() => onPageChange(pageData.totalPages)}
          disabled={pageData.page >= pageData.totalPages}
          title="Trang cuối"
        >
          <ChevronsRight size={18} />
        </Button>
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
  const [formError, setFormError] = useState('')
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
      setFormError('')
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

  const handleOpenAddModal = (distributionType) => {
    const targetType = distributionType || activeDistributionTab || 'PUBLIC'
    if (cancelEditPromotion) cancelEditPromotion()
    const rndTemplateCode = `TPL_${Math.random().toString(36).substring(2, 7).toUpperCase()}`
    if (setPromotionForm) {
      setPromotionForm({
        ma_khuyen_mai: targetType === 'TEMPLATE' ? rndTemplateCode : '',
        ten_khuyen_mai: '',
        mo_ta: '',
        loai_khuyen_mai: 'PERCENT',
        loai_phan_phoi: targetType,
        ngu_canh_su_dung: targetType === 'TEMPLATE' ? ['TIER_UP'] : [],
        so_ngay_hieu_luc: 30,
        gia_tri: 0,
        gia_tri_don_toi_thieu: 0,
        giam_toi_da: '',
        so_luong_toi_da: 0,
        gioi_han_moi_nguoi: 1,
        ngay_bat_dau: '',
        ngay_ket_thuc: '',
        trang_thai: 'ACTIVE',
        hien_thi_cho_khach: targetType === 'PUBLIC',
        ten_san_pham_tang: '',
        topping_tang_ten: '',
        hinh_anh: '',
      })
    }
    setModalActiveTab('basic')
    setFormError('')
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (savingPromotion) return
    setFormError('')
    if (cancelEditPromotion) cancelEditPromotion()
    setIsModalOpen(false)
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    if (savingPromotion) return
    setFormError('')
    try {
      const result = await savePromotion?.()
      if (result === false || result?.ok === false) {
        setFormError(result?.error || 'Không lưu được dữ liệu. Vui lòng kiểm tra các trường và thử lại.')
        return
      }
      setIsModalOpen(false)
    } catch (error) {
      setFormError(error.message || 'Không thể lưu. Dữ liệu bạn nhập vẫn được giữ lại.')
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
      {/* Full Width Card */}
      <Card className="promo-list-card">
        {/* Toolbar & Filters */}
        <span className="workspace-record-count">{stats.total} chương trình</span>
        <div className="promo-toolbar">
          {/* Main Distribution Tabs (Public vs Template) */}
          <div className="promo-type-tabs" role="group" aria-label="Loại chương trình">
            <Button
              type="button"
              aria-pressed={activeDistributionTab === 'PUBLIC'}
              className={`promo-type-tab promo-type-tab--public ${activeDistributionTab === 'PUBLIC' ? 'active' : ''}`}
              onClick={() => setActiveDistributionTab('PUBLIC')}
            >
              <Tag size={18}  style={{ flexShrink: 0 }} className="promo-type-tab-icon" />
              <span>Voucher công khai</span>
              <span className="workspace-tab-count">{stats.publicCount}</span>
            </Button>

            <Button
              type="button"
              aria-pressed={activeDistributionTab === 'TEMPLATE'}
              className={`promo-type-tab promo-type-tab--template ${activeDistributionTab === 'TEMPLATE' ? 'active' : ''}`}
              onClick={() => setActiveDistributionTab('TEMPLATE')}
            >
              <Sparkles size={18}  style={{ flexShrink: 0 }} className="promo-type-tab-icon" />
              <span>Voucher thành viên hệ thống</span>
              <span className="workspace-tab-count">{stats.templateCount}</span>
            </Button>
          </div>

          <div className="promo-filter-group" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
            {/* Search Input with right-side button */}
            <div className="promo-search-box" style={{ flex: '0 1 320px', minWidth: '220px' }}>
              <div className="promo-search-input-wrap">
                <Input className="ui-input"
                  type="text"
                  value={promotionFilter.q || ''}
                  onChange={(e) => setPromotionFilter && setPromotionFilter((p) => ({ ...p, q: e.target.value }))}
                  aria-label="Tìm mã hoặc tên chương trình"
                  placeholder="Tìm mã hoặc tên chương trình…"
                />
                {promotionFilter.q && (
                  <Button data-intent="danger"
                    type="button"
                    className="promo-search-clear"
                    onClick={() => setPromotionFilter && setPromotionFilter((p) => ({ ...p, q: '' }))}
                    title="Xóa tìm kiếm"
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            </div>

            {/* Status Filter */}
            <div style={{ minWidth: 220, width: 220, flexShrink: 0, margin: 0 }}>
              <SearchableSelect
                id="promo-status-filter-select"
                aria-label="Lọc trạng thái khuyến mãi"
                className="promo-filter-select"
                value={promotionFilter.status || ''}
                onChange={(e) => {
                  const val = e?.target?.value ?? e
                  setPromotionFilter && setPromotionFilter((p) => ({ ...p, status: val }))
                }}
                placeholder="Tất cả trạng thái"
              >
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang hoạt động</option>
                <option value="INACTIVE">Tạm dừng</option>
              </SearchableSelect>
            </div>

            <Button
              type="button"
              className="promo-btn promo-btn--success promo-create-btn"
              onClick={() => handleOpenAddModal(activeDistributionTab)}
              style={{
                marginLeft: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                height: '40px',
                minHeight: '40px',
                padding: '0 18px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '13.5px',
                cursor: 'pointer'
              }}
            >
              <Plus size={18}  style={{ flexShrink: 0 }} />
              <span>{activeDistributionTab === 'PUBLIC' ? 'Tạo voucher mới' : 'Tạo voucher thành viên'}</span>
            </Button>
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
                <Table className="promo-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Mã và Tên chương trình</th>
                      <th style={{ width: '18%' }}>Quy tắc giảm giá</th>
                      <th style={{ width: '15%' }}>Đơn tối thiểu</th>
                      <th style={{ width: '17%' }}>Thời gian áp dụng</th>
                      <th style={{ width: '13%' }}>Lượt sử dụng</th>
                      <th style={{ width: '12%' }}>Trạng thái</th>
                      <th style={{ width: '10%', textAlign: 'center' }}>Thao tác</th>
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
                              <Badge variant="outline" className="promo-code-badge">{code}</Badge>
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
                              <StatusBadge tone="success" className="promo-status-badge promo-status-badge--active">

                                <span>Hoạt động</span>
                              </StatusBadge>
                            ) : (
                              <StatusBadge tone="secondary" className="promo-status-badge promo-status-badge--inactive">

                                <span>Tạm dừng</span>
                              </StatusBadge>
                            )}
                          </td>

                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'center' }}>
                              <Button
                                type="button"
                                className="admin-table-action-btn btn-edit"
                                onClick={() => {
                                  if (startEditPromotion) startEditPromotion(item)
                                  setFormError('')
    setIsModalOpen(true)
                                }}
                                title="Chỉnh sửa mã voucher"
                              >
                                <Edit3 size={15} />
                              </Button>

                              <Button data-intent="danger"
                                type="button"
                                className="admin-table-action-btn btn-delete"
                                onClick={() => {
                                  if (deletePromotion) deletePromotion(code)
                                }}
                                title="Xóa mã voucher"
                              >
                                <Trash2 size={15} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </div>
            ) : (
              /* TABLE FOR INTERNAL TEMPLATES */
              <div className="promo-table-wrapper">
                <Table className="promo-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Mẫu Template</th>
                      <th style={{ width: '25%' }}>Ngữ cảnh phát tự động</th>
                      <th style={{ width: '20%' }}>Quy tắc giảm giá</th>
                      <th style={{ width: '15%' }}>Hạn sử dụng khi cấp</th>
                      <th style={{ width: '15%', textAlign: 'center' }}>Thao tác</th>
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
                              <Badge variant="outline" className="promo-code-badge promo-code-badge--template">{code}</Badge>
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
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'center' }}>
                              <Button
                                type="button"
                                className="admin-table-action-btn btn-edit"
                                onClick={() => {
                                  if (startEditPromotion) startEditPromotion(item)
                                  setFormError('')
    setIsModalOpen(true)
                                }}
                                title="Chỉnh sửa template"
                              >
                                <Edit3 size={15} />
                              </Button>

                              <Button data-intent="danger"
                                type="button"
                                className="admin-table-action-btn btn-delete"
                                onClick={() => {
                                  if (deletePromotion) deletePromotion(code)
                                }}
                                title="Xóa template"
                              >
                                <Trash2 size={15} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </Table>
              </div>
            )}

            {/* Pagination Component */}
            <PromoPagination pageData={pageData} onPageChange={setPage} />
          </>
        )}
      </Card>

      {/* POPUP MODAL DIALOG FOR ADD / EDIT PROMOTION */}
      {isModalOpen && (
        <WorkspaceDialog busy={savingPromotion} label="Thêm hoặc chỉnh sửa khuyến mãi" onClose={handleCloseModal} className="workspace-dialog--editor">
          <div className="promo-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="promo-modal-head">
              <div className="promo-modal-title">
                {editingPromotionCode ? (
                  <>
                    <Edit3 size={20} className="promo-head-icon edit-mode" />
                    <div>
                      <h3>{safeForm.loai_phan_phoi === 'TEMPLATE' ? 'Chỉnh sửa Voucher thành viên hệ thống' : 'Chỉnh sửa Voucher công khai'}</h3>
                      <span>Mã: {editingPromotionCode}</span>
                    </div>
                  </>
                ) : safeForm.loai_phan_phoi === 'TEMPLATE' ? (
                  <>
                    <Plus size={20} className="promo-head-icon add-mode" />
                    <div>
                      <h3>Tạo Voucher thành viên hệ thống</h3>
                      <span>Thiết lập voucher tự động trao cho sự kiện Thăng hạng, Sinh nhật, Vòng quay...</span>
                    </div>
                  </>
                ) : (
                  <>
                    <Plus size={20} className="promo-head-icon add-mode" />
                    <div>
                      <h3>Tạo mã Voucher công khai</h3>
                      <span>Mã ưu đãi cho phép khách hàng tự nhập trên ứng dụng khi đặt hàng</span>
                    </div>
                  </>
                )}
              </div>
              <Button data-intent="danger" type="button" disabled={savingPromotion} aria-label="Đóng cửa sổ" className="promo-modal-close" onClick={handleCloseModal} title="Đóng">
                <X size={18} />
              </Button>
            </div>

            {/* Modal Internal Tabs */}
            <div className="promo-modal-tabs">
              <Button aria-pressed={modalActiveTab === 'basic'}
                type="button"
                className={`promo-modal-tab-btn ${modalActiveTab === 'basic' ? 'active' : ''}`}
                onClick={() => setModalActiveTab('basic')}
              >
                <Ticket size={15} />
                <span>Thông tin và Quy tắc giảm giá</span>
              </Button>

              <Button aria-pressed={modalActiveTab === 'rules'}
                type="button"
                className={`promo-modal-tab-btn ${modalActiveTab === 'rules' ? 'active' : ''}`}
                onClick={() => setModalActiveTab('rules')}
              >
                <Sliders size={15} />
                <span>{safeForm.loai_phan_phoi === 'TEMPLATE' ? 'Ngữ cảnh tự động' : 'Điều kiện và Phân phối'}</span>
              </Button>
            </div>

            <form data-modal-body="true" onSubmit={handleFormSubmit} className="promo-modal-body">
              {formError && <p className="workspace-form-error" role="alert">{formError}</p>}
              {/* TAB 1: BASIC & DISCOUNT RULES */}
              {modalActiveTab === 'basic' && (
                <div className="promo-modal-section">

                  <div className="promo-form-grid">
                    {/* Program Name */}
                    <div className="promo-form-group">
                      <Label htmlFor="promo-name-input">
                        {safeForm.loai_phan_phoi === 'PUBLIC' ? 'Tên chương trình' : 'Tên mẫu Template'} <span className="promo-required">*</span>
                      </Label>
                      <Input className="ui-input"
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
                        <Label htmlFor="promo-code-input">
                          {safeForm.loai_phan_phoi === 'PUBLIC' ? 'Mã Voucher' : 'Mã Template'} <span className="promo-required">*</span>
                        </Label>
                        {safeForm.loai_phan_phoi === 'PUBLIC' && !editingPromotionCode && (
                          <Button
                            type="button"
                            className="promo-link-btn"
                            title="Tạo ngẫu nhiên mã voucher"
                            onClick={() => {
                              const rnd = `PUB_${Math.random().toString(36).substring(2, 7).toUpperCase()}`
                              if (setPromotionForm) setPromotionForm((p) => ({ ...p, ma_khuyen_mai: rnd }))
                            }}
                          >
                            <Sparkles size={12} />
                            <span>Tạo mã tự động</span>
                          </Button>
                        )}
                      </div>
                      <Input className="ui-input"
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
                      <Label htmlFor="promo-type-select">Hình thức giảm giá</Label>
                      <SearchableSelect
                        id="promo-type-select"
                        value={safeForm.loai_khuyen_mai || 'PERCENT'}
                        onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, loai_khuyen_mai: e.target.value }))}
                      >
                        {(PROMOTION_TYPES || []).map((t) => (
                          <option key={t.code} value={t.code}>
                            {t.label}
                          </option>
                        ))}
                      </SearchableSelect>
                    </div>

                    {/* Discount Value */}
                    <div className="promo-form-group">
                      <Label htmlFor="promo-value-input">
                        {safeForm.loai_khuyen_mai === 'PERCENT'
                          ? 'Mức giảm (%)'
                          : safeForm.loai_khuyen_mai === 'FIXED'
                            ? 'Số tiền giảm (VNĐ)'
                            : 'Giá trị giảm'}
                      </Label>
                      {safeForm.loai_khuyen_mai === 'FIXED' ? (
                        <CurrencyInput
                          id="promo-value-input"
                          value={safeForm.gia_tri ?? ''}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, gia_tri: e.target.value }))}
                          placeholder="Ví dụ: 30.000"
                        />
                      ) : (
                        <Input className="ui-input"
                          id="promo-value-input"
                          type="number"
                          min="0"
                          max={safeForm.loai_khuyen_mai === 'PERCENT' ? 100 : undefined}
                          value={safeForm.gia_tri ?? ''}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, gia_tri: e.target.value }))}
                          disabled={safeForm.loai_khuyen_mai === 'FREE_ITEM'}
                          placeholder={safeForm.loai_khuyen_mai === 'PERCENT' ? 'Ví dụ: 15' : 'Ví dụ: 30.000'}
                        />
                      )}
                    </div>

                    {/* Max Discount (for PERCENT) or Free Item select */}
                    <div className="promo-form-group">
                      {safeForm.loai_khuyen_mai === 'PERCENT' ? (
                        <>
                          <Label htmlFor="promo-max-discount">Số tiền giảm tối đa (VNĐ)</Label>
                          <CurrencyInput
                            id="promo-max-discount"
                            value={safeForm.giam_toi_da || ''}
                            onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, giam_toi_da: e.target.value }))}
                            placeholder="Để trống = Không giới hạn"
                          />
                        </>
                      ) : safeForm.loai_khuyen_mai === 'FREE_ITEM' ? (
                        <>
                          <Label htmlFor="promo-free-item-select">Sản phẩm tặng kèm</Label>
                          <SearchableSelect
                            id="promo-free-item-select"
                            className="shadcn-select"
                            value={safeForm.ten_san_pham_tang || ''}
                            onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, ten_san_pham_tang: e.target.value }))}
                          >
                            <option value="">-- Chọn sản phẩm tặng --</option>
                            {(menuItemsList || []).map((item) => (
                              <option key={item.id} value={item.name}>
                                {item.name} ({fmtNumber(item.price)} đ)
                              </option>
                            ))}
                          </SearchableSelect>
                        </>
                      ) : (
                        <>
                          <Label htmlFor="promo-max-disc-disabled">Giảm tối đa (VNĐ)</Label>
                          <Input className="ui-input"
                            id="promo-max-disc-disabled"
                            disabled
                            placeholder="Không áp dụng cho giảm cố định"
                          />
                        </>
                      )}
                    </div>

                    {/* Minimum Order Amount */}
                    <div className="promo-form-group">
                      <Label htmlFor="promo-min-order-input">Đơn hàng tối thiểu (VNĐ)</Label>
                      <CurrencyInput
                        id="promo-min-order-input"
                        value={safeForm.gia_tri_don_toi_thieu ?? ''}
                        onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, gia_tri_don_toi_thieu: e.target.value }))}
                        placeholder="0 = Không giới hạn đơn"
                      />
                    </div>

                    {/* Banner Image URL & File Upload */}
                    <div className="promo-form-group promo-form-group--full">
                      <Label htmlFor="promo-image-url">Ảnh Banner chương trình ưu đãi</Label>
                      <div className="admin-image-picker">
                        <div className="admin-image-picker-controls" style={{ display: 'flex', alignItems: 'stretch', width: '100%', height: '40px' }}>
                          <Input className="ui-input"
                            id="promo-image-url"
                            type="text"
                            value={safeForm.hinh_anh || ''}
                            onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, hinh_anh: e.target.value }))}
                            placeholder="Dán đường dẫn ảnh Banner (https://...)"
                            style={{
                              flex: '1 1 auto',
                              width: 'auto',
                              height: '40px',
                              minHeight: '40px',
                              borderTopRightRadius: 0,
                              borderBottomRightRadius: 0,
                              borderRight: 'none',
                              borderTopLeftRadius: '8px',
                              borderBottomLeftRadius: '8px',
                              boxSizing: 'border-box',
                              margin: 0
                            }}
                          />
                          <Label
                            className="admin-image-upload-btn"
                            title="Chọn tệp banner từ máy tính"
                            style={{
                              flex: '0 0 auto',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              height: '40px',
                              minHeight: '40px',
                              padding: '0 16px',
                              borderTopLeftRadius: 0,
                              borderBottomLeftRadius: 0,
                              borderTopRightRadius: '8px',
                              borderBottomRightRadius: '8px',
                              border: "1px solid var(--border-light)",
                              borderLeft: "1px solid var(--border-light)",
                              backgroundColor: "var(--surface-low)",
                              color: "var(--text-body)",
                              fontSize: '13px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              whiteSpace: 'nowrap',
                              boxSizing: 'border-box',
                              margin: 0,
                              lineHeight: 1
                            }}
                          >
                            <Upload size={15} />
                            <span>Chọn từ máy</span>
                            <input
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (event) => {
                                  if (event.target?.result) {
                                    setPromotionForm && setPromotionForm((p) => ({ ...p, hinh_anh: event.target.result }));
                                  }
                                };
                                reader.readAsDataURL(file);
                              }}
                            />
                          </Label>
                        </div>

                        {safeForm.hinh_anh && (
                          <div className="admin-image-preview-badge">
                            <img
                              src={safeForm.hinh_anh}
                              alt="Xem trước banner"
                              className="admin-image-preview-thumb"
                              style={{ width: '80px', height: '45px', objectFit: 'cover' }}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                            <div className="admin-image-preview-info">
                              <span className="admin-image-preview-url" title={safeForm.hinh_anh}>
                                {safeForm.hinh_anh.startsWith('data:') ? 'Ảnh tải lên từ máy tính' : safeForm.hinh_anh}
                              </span>
                              <Button
                                type="button"
                                className="admin-image-clear-btn"
                                onClick={() => setPromotionForm && setPromotionForm((p) => ({ ...p, hinh_anh: '' }))}
                              >
                                <Trash2 size={12} />
                                <span>Gỡ banner này</span>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Description */}
                    <div className="promo-form-group promo-form-group--full">
                      <Label htmlFor="promo-desc-textarea">Mô tả chương trình ưu đãi</Label>
                      <Textarea
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
                        <Label htmlFor="promo-total-qty">Tổng lượt phát hành tối đa</Label>
                        <Input className="ui-input"
                          id="promo-total-qty"
                          type="number"
                          min="0"
                          value={safeForm.so_luong_toi_da ?? ''}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, so_luong_toi_da: e.target.value }))}
                          placeholder="0 = Không giới hạn"
                        />
                      </div>

                      <div className="promo-form-group">
                        <Label htmlFor="promo-per-user-qty">Lượt dùng tối đa mỗi khách</Label>
                        <Input className="ui-input"
                          id="promo-per-user-qty"
                          type="number"
                          min="1"
                          value={safeForm.gioi_han_moi_nguoi ?? '1'}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, gioi_han_moi_nguoi: e.target.value }))}
                        />
                      </div>

                      <div className="promo-form-group">
                        <Label htmlFor="promo-status-select">Trạng thái hoạt động</Label>
                        <SearchableSelect
                          id="promo-status-select"
                          value={safeForm.trang_thai || 'ACTIVE'}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, trang_thai: e.target.value }))}
                        >
                          <option value="ACTIVE">Hoạt động</option>
                          <option value="INACTIVE">Tạm dừng</option>
                        </SearchableSelect>
                      </div>

                      <div className="promo-form-group">
                        <Label htmlFor="promo-start-date">Thời gian bắt đầu</Label>
                        <DateTimePicker className="ui-input"
                          id="promo-start-date"

                          value={safeForm.ngay_bat_dau || ''}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, ngay_bat_dau: e.target.value }))}
                        />
                      </div>

                      <div className="promo-form-group">
                        <Label htmlFor="promo-end-date">Thời gian kết thúc</Label>
                        <DateTimePicker className="ui-input"
                          id="promo-end-date"

                          value={safeForm.ngay_ket_thuc || ''}
                          onChange={(e) => setPromotionForm && setPromotionForm((p) => ({ ...p, ngay_ket_thuc: e.target.value }))}
                        />
                      </div>

                      <div className="promo-form-group">
                        <Label htmlFor="hien_thi_cho_khach_chk">Hiển thị trên ứng dụng</Label>
                        <div className="promo-checkbox-card">
                          <input className="ui-input"
                            type="checkbox"
                            id="hien_thi_cho_khach_chk"
                            checked={Boolean(safeForm.hien_thi_cho_khach)}
                            onChange={(e) =>
                              setPromotionForm && setPromotionForm((p) => ({ ...p, hien_thi_cho_khach: e.target.checked }))
                            }
                          />
                          <Label htmlFor="hien_thi_cho_khach_chk">Hiển thị trong trang Khuyến mãi cho khách</Label>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* TEMPLATE RULES */
                    <div className="promo-form-grid">
                      <div className="promo-form-group promo-form-group--full">
                        <Label htmlFor="promotionmanagementpanel-45837">Ngữ cảnh tự động cấp voucher cho người dùng</Label>
                        <div className="promo-context-grid">
                          {TRIGGER_CONTEXTS.map((ctx) => {
                            const currentContexts = Array.isArray(safeForm.ngu_canh_su_dung)
                              ? safeForm.ngu_canh_su_dung
                              : (typeof safeForm.ngu_canh_su_dung === 'string'
                                ? safeForm.ngu_canh_su_dung.split(',').map((s) => s.trim())
                                : [])

                            const isChecked = currentContexts.includes(ctx.code)
                            return (
                              <Label key={ctx.code} className={`promo-context-item ${isChecked ? 'is-selected' : ''}`}>
                                <input className="ui-input" id="promotionmanagementpanel-45837"
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
                              </Label>
                            )
                          })}
                        </div>
                      </div>

                      <div className="promo-form-group">
                        <Label htmlFor="promo-valid-days">Hạn sử dụng sau khi cấp (ngày)</Label>
                        <Input className="ui-input"
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
              <div data-modal-footer="inset" className="promo-modal-footer">
                <Button data-intent="danger"
                  type="button"
                  className="promo-btn promo-btn--neutral"
                  onClick={handleCloseModal}
                  disabled={savingPromotion}
                  style={{
                    backgroundColor: "#ffffff",
                    background: "#ffffff",
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-light)',
                    height: '38px',
                    padding: '0 1.25rem',
                    borderRadius: '6px',
                    fontSize: '0.8125rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <X size={15} /><span>Hủy bỏ</span>
                </Button>

                <Button
                  type="submit"
                  className="promo-btn promo-btn--success"
                  disabled={savingPromotion || !String(safeForm.ten_khuyen_mai || '').trim() || !safeForm.ma_khuyen_mai}
                  style={{
                    background: "var(--primary)",
                    color: '#ffffff',
                    border: '1px solid var(--primary)',
                    height: '38px',
                    padding: '0 1.35rem',
                    borderRadius: '6px',
                    fontSize: '0.8125rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: "none"
                  }}
                >
                  {savingPromotion ? (
                    <>
                      <RefreshCw size={16} className="promo-spin-icon" color="#ffffff" />
                      <span>Đang lưu...</span>
                    </>
                  ) : editingPromotionCode ? (
                    <>
                      <Check size={16} color="#ffffff" />
                      <span>Lưu cập nhật</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} color="#ffffff" />
                      <span>Tạo chương trình</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </WorkspaceDialog>
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
