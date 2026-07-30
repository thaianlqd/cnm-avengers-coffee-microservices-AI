import React, { useState, useMemo, useEffect, Component } from 'react'
import {
  Coffee,
  Plus,
  Edit3,
  Trash2,
  Search,
  Check,
  X,
  RefreshCw,
  Flame,
  Sparkles,
  Tag,
  Layers,
  Upload,
  Image as ImageIcon,
  SlidersHorizontal,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Info,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Percent,
  MoreVertical
} from 'lucide-react'

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

// Error Boundary to prevent white screen crashes
class PanelErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Menu Management Error Boundary caught an error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #fee2e2', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <AlertCircle size={32} color="#dc2626" style={{ marginBottom: '0.75rem' }} />
          <h3 style={{ color: '#dc2626', margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: '700' }}>
            Không thể hiển thị Giao diện Menu
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Chi tiết lỗi: {this.state.error?.message || 'Có sự cố xảy ra khi xử lý dữ liệu menu.'}
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

function MenuPagination({ pageData, onPageChange }) {
  if (!pageData || pageData.total <= 10) return null
  return (
    <div className="menu-pagination-bar">
      <span className="menu-pagination-info">
        Hiển thị {pageData.from} - {pageData.to} trên tổng số {pageData.total} món
      </span>
      <div className="menu-pagination-actions">
        <button
          type="button"
          className="menu-pg-btn"
          onClick={() => onPageChange(1)}
          disabled={pageData.page <= 1}
          title="Trang đầu"
        >
          <ChevronsLeft size={18} />
        </button>
        <button
          type="button"
          className="menu-pg-btn"
          onClick={() => onPageChange(pageData.page - 1)}
          disabled={pageData.page <= 1}
          title="Trang trước"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="menu-pg-current">
          Trang {pageData.page} trên {pageData.totalPages}
        </span>
        <button
          type="button"
          className="menu-pg-btn"
          onClick={() => onPageChange(pageData.page + 1)}
          disabled={pageData.page >= pageData.totalPages}
          title="Trang sau"
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          className="menu-pg-btn"
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

function AdminMenuManagementPanelContent({
  menuState = { loading: false, error: '', items: [] },
  loadMenu,
  menuForm = {},
  setMenuForm,
  editingMenuId,
  savingMenu,
  startEditMenu,
  cancelEditMenu,
  saveMenu,
  deleteMenu,
  menuKeyword = '',
  setMenuKeyword,
  filteredMenuItems = [],
  menuPageData,
  menuPage = 1,
  setMenuPage,
  uploadState = { loading: false, error: '', success: '' },
  uploadMenuImage,
  clearMenuImage,
  categoriesState = { loading: false, error: '', items: [] },
  attributesState = { loading: false, error: '', items: [] },
}) {
  // Filters
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('ALL')
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('ALL') // 'ALL', 'ACTIVE', 'INACTIVE'
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalActiveTab, setModalActiveTab] = useState('basic') // 'basic', 'variants', 'image'
  const [openMenuActionId, setOpenMenuActionId] = useState(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleGlobalClick = () => setOpenMenuActionId(null)
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  // Local state for variant management inside modal
  const [selectedAttributeSelect, setSelectedAttributeSelect] = useState('')
  const [customAttributeName, setCustomAttributeName] = useState('')
  const [newOptionState, setNewOptionState] = useState({})

  // Variant Helpers
  const addAttributeGroup = () => {
    const name = (customAttributeName.trim() || selectedAttributeSelect.trim())
    if (!name) {
      window.alert('Vui lòng chọn hoặc nhập tên biến thể mới!')
      return
    }

    const currentBienThe = menuForm?.bien_the || {}
    if (currentBienThe[name]) {
      window.alert('Nhóm biến thể này đã tồn tại!')
      return
    }

    const updated = { ...currentBienThe, [name]: {} }
    if (setMenuForm) {
      setMenuForm((prev) => ({
        ...prev,
        bien_the: updated,
      }))
    }

    setSelectedAttributeSelect('')
    setCustomAttributeName('')
  }

  const removeAttributeGroup = (attrName) => {
    if (!window.confirm(`Xóa toàn bộ nhóm biến thể "${attrName}"?`)) return
    const currentBienThe = menuForm?.bien_the || {}
    const updated = { ...currentBienThe }
    delete updated[attrName]
    if (setMenuForm) {
      setMenuForm((prev) => ({
        ...prev,
        bien_the: updated,
      }))
    }
  }

  const handleOptionStateChange = (attrName, field, value) => {
    setNewOptionState((prev) => ({
      ...prev,
      [attrName]: {
        ...(prev[attrName] || { name: '', price: '' }),
        [field]: value,
      },
    }))
  }

  const addOptionToGroup = (attrName) => {
    const opt = newOptionState[attrName] || { name: '', price: '' }
    const optionName = String(opt.name || '').trim()
    if (!optionName) {
      window.alert('Vui lòng nhập tên tùy chọn!')
      return
    }

    const currentBienThe = menuForm?.bien_the || {}
    const currentOptions = currentBienThe[attrName] || {}
    const updatedOptions = { ...currentOptions, [optionName]: Number(opt.price) || 0 }

    const updatedBienThe = { ...currentBienThe, [attrName]: updatedOptions }
    if (setMenuForm) {
      setMenuForm((prev) => ({
        ...prev,
        bien_the: updatedBienThe,
      }))
    }

    setNewOptionState((prev) => ({
      ...prev,
      [attrName]: { name: '', price: '' },
    }))
  }

  const removeOptionFromGroup = (attrName, valName) => {
    const currentBienThe = menuForm?.bien_the || {}
    const currentOptions = currentBienThe[attrName] || {}
    const updatedOptions = { ...currentOptions }
    delete updatedOptions[valName]

    const updatedBienThe = { ...currentBienThe, [attrName]: updatedOptions }
    if (setMenuForm) {
      setMenuForm((prev) => ({
        ...prev,
        bien_the: updatedBienThe,
      }))
    }
  }

  // Sync editing item to modal state
  useEffect(() => {
    if (editingMenuId) {
      setIsModalOpen(true)
    }
  }, [editingMenuId])

  // Statistics (Defensive against null items)
  const stats = useMemo(() => {
    const items = (menuState?.items || []).filter(Boolean)
    const total = items.length
    const activeCount = items.filter((i) => i && i.dang_ban).length
    const hotCount = items.filter((i) => i && i.la_hot).length
    const discountCount = items.filter((i) => i && i.is_discounted).length

    return { total, activeCount, hotCount, discountCount }
  }, [menuState?.items])

  // Apply custom category and status filters (Defensive filtering)
  const displayedItems = useMemo(() => {
    let result = (filteredMenuItems && Array.isArray(filteredMenuItems) && filteredMenuItems.length > 0
      ? filteredMenuItems
      : menuState?.items || []).filter(Boolean)

    if (selectedCategoryFilter !== 'ALL') {
      result = result.filter(
        (item) => item && String(item.category || '').toLowerCase() === selectedCategoryFilter.toLowerCase()
      )
    }
    if (selectedStatusFilter === 'ACTIVE') {
      result = result.filter((item) => item && item.dang_ban)
    } else if (selectedStatusFilter === 'INACTIVE') {
      result = result.filter((item) => item && !item.dang_ban)
    }
    return result
  }, [filteredMenuItems, menuState?.items, selectedCategoryFilter, selectedStatusFilter])

  // Custom paginated data for display
  const pageSize = 10
  const pageData = useMemo(() => {
    const total = displayedItems.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(Math.max(Number(menuPage || 1), 1), totalPages)
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
  }, [displayedItems, menuPage])

  const handleOpenAddModal = () => {
    if (cancelEditMenu) cancelEditMenu()
    setModalActiveTab('basic')
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (cancelEditMenu) cancelEditMenu()
    setIsModalOpen(false)
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    try {
      if (saveMenu) await saveMenu()
      setIsModalOpen(false)
    } catch {
      // Keep modal open on error
    }
  }

  const safeMenuForm = menuForm || {}

  return (
    <div className="menu-manage-container">
      {/* Header section */}
      <div className="menu-manage-header">
        <div className="menu-manage-header-title">
          <div className="menu-manage-icon-wrapper">
            <Coffee size={24} className="menu-header-icon" />
          </div>
          <div>
            <h2>Quản lý menu thực đơn tổng</h2>
            <p>Quản lý toàn bộ danh sách món ăn, đồ uống, giá bán, nhóm biến thể và hình ảnh sản phẩm</p>
          </div>
        </div>
        <div className="menu-manage-header-actions">
          {loadMenu && (
            <button type="button" className="menu-refresh-btn" onClick={loadMenu} title="Tải lại danh sách">
              <RefreshCw size={16} />
              <span>Tải lại</span>
            </button>
          )}
          <button type="button" className="menu-btn menu-btn--success" onClick={handleOpenAddModal}>
            <Plus size={18} />
            <span>Thêm món mới</span>
          </button>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="menu-kpi-grid">
        <div className="menu-kpi-card menu-kpi-card--total">
          <div className="menu-kpi-icon menu-kpi-icon--total">
            <Coffee size={20} />
          </div>
          <div className="menu-kpi-content">
            <span className="menu-kpi-label">Tổng số món</span>
            <span className="menu-kpi-value">{stats.total}</span>
          </div>
        </div>

        <div className="menu-kpi-card menu-kpi-card--active">
          <div className="menu-kpi-icon menu-kpi-icon--active">
            <CheckCircle2 size={20} />
          </div>
          <div className="menu-kpi-content">
            <span className="menu-kpi-label">Đang kinh doanh</span>
            <span className="menu-kpi-value">{stats.activeCount}</span>
          </div>
        </div>

        <div className="menu-kpi-card menu-kpi-card--hot">
          <div className="menu-kpi-icon menu-kpi-icon--hot">
            <Flame size={20} />
          </div>
          <div className="menu-kpi-content">
            <span className="menu-kpi-label">Món Hot / Bán chạy</span>
            <span className="menu-kpi-value">{stats.hotCount}</span>
          </div>
        </div>

        <div className="menu-kpi-card menu-kpi-card--discount">
          <div className="menu-kpi-icon menu-kpi-icon--discount">
            <Tag size={20} />
          </div>
          <div className="menu-kpi-content">
            <span className="menu-kpi-label">Đang giảm giá</span>
            <span className="menu-kpi-value">{stats.discountCount}</span>
          </div>
        </div>
      </div>

      {/* Full Width Product Data Table Card */}
      <div className="menu-list-card">
        {/* Toolbar & Filters */}
        <div className="menu-toolbar">
          <div className="menu-search-box">
            <div className="menu-search-input-wrap">
              <input
                type="text"
                value={menuKeyword}
                onChange={(e) => {
                  if (setMenuKeyword) setMenuKeyword(e.target.value)
                  if (setMenuPage) setMenuPage(1)
                }}
                placeholder="Tìm kiếm món theo tên, danh mục hoặc mô tả..."
              />
              {menuKeyword && (
                <button
                  type="button"
                  className="menu-search-clear"
                  onClick={() => setMenuKeyword && setMenuKeyword('')}
                  title="Xóa tìm kiếm"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button type="button" className="menu-search-btn" title="Tìm kiếm">
              <Search size={16} />
            </button>
          </div>

          <div className="menu-filter-group">
            {/* Filter Category Dropdown */}
            <select
              className="menu-filter-select"
              value={selectedCategoryFilter}
              onChange={(e) => {
                setSelectedCategoryFilter(e.target.value)
                if (setMenuPage) setMenuPage(1)
              }}
            >
              <option value="ALL">Tất cả danh mục</option>
              {(categoriesState?.items || []).filter(Boolean).map((cat) => (
                <option key={cat.code || cat.id || Math.random()} value={cat.label || ''}>
                  {cat.label || 'Danh mục'}
                </option>
              ))}
            </select>

            {/* Filter Status Pills */}
            <div className="menu-filter-pills">
              <button
                type="button"
                className={`menu-pill ${selectedStatusFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedStatusFilter('ALL')
                  if (setMenuPage) setMenuPage(1)
                }}
              >
                Tất cả
              </button>
              <button
                type="button"
                className={`menu-pill ${selectedStatusFilter === 'ACTIVE' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedStatusFilter('ACTIVE')
                  if (setMenuPage) setMenuPage(1)
                }}
              >
                Đang bán
              </button>
              <button
                type="button"
                className={`menu-pill ${selectedStatusFilter === 'INACTIVE' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedStatusFilter('INACTIVE')
                  if (setMenuPage) setMenuPage(1)
                }}
              >
                Tạm ngưng
              </button>
            </div>

            <button type="button" className="menu-btn menu-btn--success menu-btn--sm" onClick={handleOpenAddModal}>
              <Plus size={16} />
              <span>Tạo món</span>
            </button>
          </div>
        </div>

        {/* Loading & Error States */}
        {menuState?.loading && (
          <div className="menu-state-box">
            <RefreshCw size={24} className="menu-spin-icon" />
            <span>Đang tải danh sách menu...</span>
          </div>
        )}

        {menuState?.error && (
          <div className="menu-state-box menu-state-box--error">
            <AlertCircle size={20} />
            <span>{menuState.error}</span>
          </div>
        )}

        {/* Full Width Table */}
        {!menuState?.loading && !menuState?.error && (
          <>
            {pageData.rows.length === 0 ? (
              <div className="menu-state-box menu-state-box--empty">
                <Info size={24} />
                <span>Không tìm thấy món ăn phù hợp.</span>
              </div>
            ) : (
              <div className="menu-table-wrapper">
                <table className="menu-table">
                  <thead>
                    <tr>
                      <th style={{ width: '26%' }}>Sản phẩm</th>
                      <th style={{ width: '15%' }}>Danh mục</th>
                      <th style={{ width: '15%' }}>Giá bán</th>
                      <th style={{ width: '14%' }}>Trạng thái</th>
                      <th style={{ width: '15%' }}>Nhãn đặc trưng</th>
                      <th style={{ width: '15%' }} className="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.rows.filter(Boolean).map((item) => {
                      const isEditingThis = editingMenuId === item.id
                      const hasOriginalPrice = Number(item.original_price || 0) > Number(item.price || 0)

                      return (
                        <tr key={item.id || Math.random()} className={isEditingThis ? 'is-editing-row' : ''}>
                          {/* Product Image & Info */}
                          <td>
                            <div className="menu-product-cell">
                              <div className="menu-product-thumb">
                                {item.image ? (
                                  <img src={item.image} alt={item.name || 'Món'} />
                                ) : (
                                  <div className="menu-product-thumb-placeholder">
                                    <Coffee size={18} />
                                  </div>
                                )}
                              </div>
                              <div className="menu-product-info">
                                <span className="menu-product-name">{item.name || 'Chưa đặt tên'}</span>
                                {item.description && (
                                  <span className="menu-product-desc" title={item.description}>
                                    {item.description}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Category Tag */}
                          <td>
                            <span className="menu-cat-badge">
                              <Tag size={12} />
                              <span>{item.category || 'Chưa phân loại'}</span>
                            </span>
                          </td>

                          {/* Price & Original Price */}
                          <td>
                            <div className="menu-price-cell">
                              <span className="menu-price-current">{fmtNumber(item.price)} đ</span>
                              {hasOriginalPrice && (
                                <span className="menu-price-original">{fmtNumber(item.original_price)} đ</span>
                              )}
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td>
                            {item.dang_ban ? (
                              <span className="menu-status-badge menu-status-badge--active">
                                <CheckCircle2 size={12} />
                                <span>Đang kinh doanh</span>
                              </span>
                            ) : (
                              <span className="menu-status-badge menu-status-badge--inactive">
                                <XCircle size={12} />
                                <span>Tạm ngưng</span>
                              </span>
                            )}
                          </td>

                          {/* Feature Badges */}
                          <td>
                            <div className="menu-tags-group">
                              {item.la_hot && (
                                <span className="menu-tag-pill menu-tag-pill--hot" title="Món bán chạy">
                                  <Flame size={11} />
                                  <span>Hot</span>
                                </span>
                              )}
                              {item.la_moi && (
                                <span className="menu-tag-pill menu-tag-pill--new" title="Món mới ra mắt">
                                  <Sparkles size={11} />
                                  <span>Mới</span>
                                </span>
                              )}
                              {item.is_discounted && (
                                <span className="menu-tag-pill menu-tag-pill--discount" title="Đang giảm giá">
                                  <Percent size={11} />
                                  <span>Giảm giá</span>
                                </span>
                              )}
                              {!item.la_hot && !item.la_moi && !item.is_discounted && (
                                <span className="menu-tag-pill menu-tag-pill--normal">Bình thường</span>
                              )}
                            </div>
                          </td>

                          <td style={{ textAlign: 'center', position: 'relative', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn-icon-more"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenMenuActionId(openMenuActionId === item.id ? null : item.id)
                              }}
                              title="Thao tác"
                            >
                              <MoreVertical size={16} color="#475569" />
                            </button>

                            {openMenuActionId === item.id && (
                              <div
                                style={{
                                  position: 'absolute',
                                  right: '0.25rem',
                                  top: 'calc(100% + 4px)',
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
                                    setOpenMenuActionId(null)
                                    if (startEditMenu) startEditMenu(item)
                                    setIsModalOpen(true)
                                  }}
                                >
                                  <Edit3 size={14} color="#2563eb" /> Chỉnh sửa sản phẩm
                                </button>

                                <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.2rem 0' }}></div>

                                <button
                                  type="button"
                                  className="btn-dropdown-item danger"
                                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '500', color: '#dc2626', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                  onClick={() => {
                                    setOpenMenuActionId(null)
                                    if (deleteMenu) deleteMenu(item.id)
                                  }}
                                >
                                  <Trash2 size={14} color="#dc2626" /> Xóa sản phẩm
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

            {/* Pagination */}
            <MenuPagination pageData={pageData} onPageChange={setMenuPage} />
          </>
        )}
      </div>

      {/* POPUP MODAL DIALOG FOR ADD / EDIT MENU ITEM */}
      {isModalOpen && (
        <div className="menu-modal-overlay" onClick={handleCloseModal}>
          <div className="menu-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="menu-modal-head">
              <div className="menu-modal-title">
                {editingMenuId ? (
                  <>
                    <Edit3 size={20} className="menu-head-icon edit-mode" />
                    <div>
                      <h3>Chỉnh sửa món</h3>
                      <span>Mã món: #{editingMenuId}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <Plus size={20} className="menu-head-icon add-mode" />
                    <div>
                      <h3>Thêm món mới vào menu</h3>
                      <span>Nhập thông tin sản phẩm, tùy chọn biến thể và hình ảnh</span>
                    </div>
                  </>
                )}
              </div>
              <button type="button" className="menu-modal-close" onClick={handleCloseModal} title="Đóng">
                <X size={18} />
              </button>
            </div>

            {/* Modal Internal Tab Nav */}
            <div className="menu-modal-tabs">
              <button
                type="button"
                className={`menu-modal-tab-btn ${modalActiveTab === 'basic' ? 'active' : ''}`}
                onClick={() => setModalActiveTab('basic')}
              >
                <Coffee size={15} />
                <span>Thông tin cơ bản</span>
              </button>
              <button
                type="button"
                className={`menu-modal-tab-btn ${modalActiveTab === 'variants' ? 'active' : ''}`}
                onClick={() => setModalActiveTab('variants')}
              >
                <SlidersHorizontal size={15} />
                <span>Nhóm biến thể</span>
                {Object.keys(safeMenuForm.bien_the || {}).length > 0 && (
                  <span className="menu-tab-count">{Object.keys(safeMenuForm.bien_the || {}).length}</span>
                )}
              </button>
              <button
                type="button"
                className={`menu-modal-tab-btn ${modalActiveTab === 'image' ? 'active' : ''}`}
                onClick={() => setModalActiveTab('image')}
              >
                <ImageIcon size={15} />
                <span>Hình ảnh sản phẩm</span>
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="menu-modal-body">
              {/* TAB 1: BASIC INFORMATION */}
              {modalActiveTab === 'basic' && (
                <div className="menu-modal-section">
                  <div className="menu-form-grid">
                    {/* Item Name */}
                    <div className="menu-form-group menu-form-group--full">
                      <label htmlFor="menu-name-input">
                        Tên sản phẩm <span className="menu-required">*</span>
                      </label>
                      <input
                        id="menu-name-input"
                        type="text"
                        value={safeMenuForm.name || ''}
                        onChange={(e) => setMenuForm && setMenuForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Ví dụ: Cà phê Phin Sữa Đá, Trà Đào Cam Sả..."
                        required
                        autoFocus
                      />
                    </div>

                    {/* Category Select */}
                    <div className="menu-form-group">
                      <label htmlFor="menu-category-select">
                        Danh mục phân loại <span className="menu-required">*</span>
                      </label>
                      <select
                        id="menu-category-select"
                        value={safeMenuForm.category_code || ''}
                        onChange={(e) => setMenuForm && setMenuForm((p) => ({ ...p, category_code: e.target.value }))}
                        required
                      >
                        <option value="">-- Chọn danh mục --</option>
                        {(categoriesState?.items || []).filter(Boolean).map((cat) => (
                          <option key={cat.code} value={cat.code}>
                            {cat.label} {cat.cap_bac === 1 ? '(Danh mục chính)' : '(Danh mục phụ)'}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Price (Selling) */}
                    <div className="menu-form-group">
                      <label htmlFor="menu-price-input">
                        Giá bán (VNĐ) <span className="menu-required">*</span>
                      </label>
                      <input
                        id="menu-price-input"
                        type="number"
                        min="0"
                        step="1000"
                        value={safeMenuForm.price ?? ''}
                        onChange={(e) => setMenuForm && setMenuForm((p) => ({ ...p, price: Number(e.target.value) }))}
                        placeholder="Ví dụ: 35000"
                        required
                      />
                    </div>

                    {/* Original Price */}
                    <div className="menu-form-group">
                      <label htmlFor="menu-orig-price-input">Giá niêm yết / gốc (VNĐ)</label>
                      <input
                        id="menu-orig-price-input"
                        type="number"
                        min="0"
                        step="1000"
                        value={safeMenuForm.original_price || ''}
                        onChange={(e) => setMenuForm && setMenuForm((p) => ({ ...p, original_price: Number(e.target.value) }))}
                        placeholder="Để trống nếu không có giảm giá"
                      />
                    </div>

                    {/* Description */}
                    <div className="menu-form-group menu-form-group--full">
                      <label htmlFor="menu-desc-input">Mô tả sản phẩm</label>
                      <textarea
                        id="menu-desc-input"
                        rows={3}
                        value={safeMenuForm.description || ''}
                        onChange={(e) => setMenuForm && setMenuForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Mô tả ngắn gọn về hương vị, thành phần nguyên liệu..."
                      />
                    </div>
                  </div>

                  {/* Status & Toggles Box */}
                  <div className="menu-status-box">
                    <h4>Trạng thái & Nhãn hiển thị</h4>
                    <div className="menu-toggles-grid">
                      {/* Active Selling Toggle */}
                      <label className="menu-toggle-item">
                        <input
                          type="checkbox"
                          checked={!!safeMenuForm.dang_ban}
                          onChange={(e) => setMenuForm && setMenuForm((p) => ({ ...p, dang_ban: e.target.checked }))}
                        />
                        <span className="menu-toggle-label">
                          <strong>Đang kinh doanh</strong>
                          <small>Hiển thị sản phẩm trên menu khách đặt hàng</small>
                        </span>
                      </label>

                      {/* Hot Item Toggle */}
                      <label className="menu-toggle-item">
                        <input
                          type="checkbox"
                          checked={!!safeMenuForm.la_hot}
                          onChange={(e) => setMenuForm && setMenuForm((p) => ({ ...p, la_hot: e.target.checked }))}
                        />
                        <span className="menu-toggle-label">
                          <strong>Gắn nhãn Hot 🔥</strong>
                          <small>Đánh dấu món bán chạy nổi bật</small>
                        </span>
                      </label>

                      {/* New Item Toggle */}
                      <label className="menu-toggle-item">
                        <input
                          type="checkbox"
                          checked={!!safeMenuForm.la_moi}
                          onChange={(e) => setMenuForm && setMenuForm((p) => ({ ...p, la_moi: e.target.checked }))}
                        />
                        <span className="menu-toggle-label">
                          <strong>Gắn nhãn Mới 🆕</strong>
                          <small>Đánh dấu món mới ra mắt</small>
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: VARIANTS & OPTIONS */}
              {modalActiveTab === 'variants' && (
                <div className="menu-modal-section">
                  <div className="menu-variants-container">
                    {/* List of Variant Groups */}
                    {Object.entries(safeMenuForm.bien_the || {}).length === 0 ? (
                      <div className="menu-state-box menu-state-box--empty" style={{ padding: '1.5rem 1rem' }}>
                        <SlidersHorizontal size={20} />
                        <span>Chưa có nhóm biến thể nào. Thêm nhóm bên dưới (VD: Kích thước, Topping, Lượng đá...)</span>
                      </div>
                    ) : (
                      Object.entries(safeMenuForm.bien_the || {}).map(([attrName, optionsObj]) => (
                        <div key={attrName} className="menu-variant-group-card">
                          <div className="menu-variant-group-header">
                            <h5>{attrName}</h5>
                            <button
                              type="button"
                              className="menu-variant-del-group-btn"
                              onClick={() => removeAttributeGroup(attrName)}
                              title={`Xóa nhóm "${attrName}"`}
                            >
                              <Trash2 size={13} />
                              <span>Xóa nhóm</span>
                            </button>
                          </div>

                          {/* Options List */}
                          <div className="menu-variant-options-list">
                            {Object.entries(optionsObj || {}).length === 0 ? (
                              <p className="menu-variant-empty-hint">Chưa có lựa chọn nào trong nhóm này.</p>
                            ) : (
                              Object.entries(optionsObj || {}).map(([valName, price]) => (
                                <div key={valName} className="menu-variant-option-chip">
                                  <span>{valName}</span>
                                  <span className="menu-variant-option-price">
                                    {price > 0 ? `+${fmtNumber(price)} đ` : '0 đ'}
                                  </span>
                                  <button
                                    type="button"
                                    className="menu-variant-option-del"
                                    onClick={() => removeOptionFromGroup(attrName, valName)}
                                    title="Xóa tùy chọn này"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Inline Add Option Form */}
                          <div className="menu-variant-add-option-inline">
                            <input
                              type="text"
                              placeholder="Tên tùy chọn (VD: Size L, Trân châu đen)..."
                              value={newOptionState[attrName]?.name || ''}
                              onChange={(e) => handleOptionStateChange(attrName, 'name', e.target.value)}
                            />
                            <input
                              type="number"
                              min="0"
                              step="500"
                              placeholder="Phụ thu (đ)..."
                              value={newOptionState[attrName]?.price || ''}
                              onChange={(e) => handleOptionStateChange(attrName, 'price', e.target.value)}
                            />
                            <button
                              type="button"
                              className="menu-btn menu-btn--success menu-btn--sm"
                              onClick={() => addOptionToGroup(attrName)}
                            >
                              <Plus size={14} />
                              <span>Thêm tùy chọn</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}

                    {/* Section to add a new Attribute Group */}
                    <div className="menu-variant-add-group-card">
                      <h5>Thêm nhóm biến thể mới</h5>
                      <div className="menu-variant-add-group-inputs">
                        <select
                          value={selectedAttributeSelect}
                          onChange={(e) => setSelectedAttributeSelect(e.target.value)}
                        >
                          <option value="">-- Chọn biến thể phổ biến --</option>
                          {['Kích thước', 'Topping', 'Lượng đá', 'Độ ngọt', 'Loại sữa'].map((attr) => (
                            <option key={attr} value={attr}>
                              {attr}
                            </option>
                          ))}
                          {(attributesState?.items || []).filter(Boolean).map((attr) => {
                            const defaults = ['Kích thước', 'Topping', 'Lượng đá', 'Độ ngọt', 'Loại sữa']
                            if (defaults.includes(attr.name)) return null
                            return (
                              <option key={attr.id} value={attr.name}>
                                {attr.name}
                              </option>
                            )
                          })}
                        </select>

                        <span className="menu-or-divider">hoặc</span>

                        <input
                          type="text"
                          placeholder="Nhập tên nhóm tự tạo..."
                          value={customAttributeName}
                          onChange={(e) => setCustomAttributeName(e.target.value)}
                        />

                        <button
                          type="button"
                          className="menu-btn menu-btn--success menu-btn--sm"
                          onClick={addAttributeGroup}
                        >
                          <Plus size={14} />
                          <span>Tạo nhóm</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: IMAGE UPLOAD & PREVIEW */}
              {modalActiveTab === 'image' && (
                <div className="menu-modal-section">
                  <div className="menu-image-section">
                    {/* Upload Box */}
                    <div className="menu-upload-box">
                      <div className="menu-upload-info">
                        <strong>Tải ảnh từ máy tính</strong>
                        <p>Chọn tệp ảnh sản phẩm (JPG, PNG, WEBP). Hệ thống tự động đặt tên chuẩn.</p>
                      </div>
                      <label className="menu-upload-dropzone">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => uploadMenuImage && uploadMenuImage(e.target.files?.[0]).catch(() => {})}
                        />
                        <Upload size={22} className="menu-upload-icon" />
                        <span>{uploadState?.loading ? 'Đang tải ảnh...' : 'Nhấp vào đây để tải ảnh lên'}</span>
                        <small>
                          {safeMenuForm.name
                            ? `File sẽ tự đổi tên theo món: ${safeMenuForm.name}`
                            : 'Nhập tên món ở Tab cơ bản để tên file đẹp hơn'}
                        </small>
                      </label>
                      {uploadState?.error && <p className="menu-error-msg">{uploadState.error}</p>}
                      {uploadState?.success && <p className="menu-success-msg">{uploadState.success}</p>}
                    </div>

                    {/* Direct Image URL Input */}
                    <div className="menu-form-group">
                      <label htmlFor="menu-img-url-input">Hoặc nhập đường dẫn ảnh (URL)</label>
                      <input
                        id="menu-img-url-input"
                        type="text"
                        value={safeMenuForm.image || ''}
                        onChange={(e) => setMenuForm && setMenuForm((p) => ({ ...p, image: e.target.value }))}
                        placeholder="https://..."
                      />
                    </div>

                    {/* Image Preview Box */}
                    <div className="menu-image-preview-card">
                      <span className="menu-preview-label">Xem trước ảnh hiển thị:</span>
                      <div className="menu-preview-content">
                        {safeMenuForm.image ? (
                          <img src={safeMenuForm.image} alt={safeMenuForm.name || 'Preview'} />
                        ) : (
                          <div className="menu-preview-empty">
                            <ImageIcon size={32} />
                            <span>Chưa có đường dẫn ảnh sản phẩm</span>
                          </div>
                        )}
                      </div>
                      {safeMenuForm.image && (
                        <div className="menu-preview-footer">
                          <span className="menu-preview-url">{safeMenuForm.image}</span>
                          <button
                            type="button"
                            className="menu-act-btn menu-act-btn--danger"
                            onClick={() => clearMenuImage && clearMenuImage()}
                          >
                            <Trash2 size={13} />
                            <span>Xóa ảnh</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Footer Actions */}
              <div className="menu-modal-footer">
                <button
                  type="button"
                  className="menu-btn menu-btn--neutral"
                  onClick={handleCloseModal}
                  disabled={savingMenu}
                >
                  <X size={16} />
                  <span>Hủy bỏ</span>
                </button>

                <button
                  type="submit"
                  className="menu-btn menu-btn--success"
                  disabled={savingMenu || !String(safeMenuForm.name || '').trim() || !safeMenuForm.category_code}
                >
                  {savingMenu ? (
                    <>
                      <RefreshCw size={16} className="menu-spin-icon" />
                      <span>Đang lưu...</span>
                    </>
                  ) : editingMenuId ? (
                    <>
                      <Check size={16} />
                      <span>Lưu cập nhật</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      <span>Tạo món mới</span>
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

export function AdminMenuManagementPanel(props) {
  return (
    <PanelErrorBoundary>
      <AdminMenuManagementPanelContent {...props} />
    </PanelErrorBoundary>
  )
}
