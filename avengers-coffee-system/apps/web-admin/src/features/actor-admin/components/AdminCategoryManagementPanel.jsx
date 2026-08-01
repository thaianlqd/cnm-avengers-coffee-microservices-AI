import React, { useState, useMemo, useEffect } from 'react'
import {
  FolderTree,
  Tag,
  Layers,
  Coffee,
  Plus,
  Edit3,
  Trash2,
  Search,
  Check,
  X,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Info,
  AlertCircle,
  CupSoda,
  Utensils,
  Flame,
  Cake,
  Package,
  Heart,
  MoreVertical
} from 'lucide-react'

// Preset icon options for quick selection
const ICON_PRESETS = [
  { name: 'Coffee', icon: Coffee, label: 'Cà phê' },
  { name: 'CupSoda', icon: CupSoda, label: 'Thức uống' },
  { name: 'Utensils', icon: Utensils, label: 'Đồ ăn' },
  { name: 'Cake', icon: Cake, label: 'Bánh ngọt' },
  { name: 'Flame', icon: Flame, label: 'Món hot' },
  { name: 'Package', icon: Package, label: 'Gói/Combo' },
  { name: 'Sparkles', icon: Sparkles, label: 'Đặc biệt' },
  { name: 'Heart', icon: Heart, label: 'Yêu thích' }
]

function CategoryPagination({ pageData, onPageChange }) {
  if (!pageData || pageData.total <= 10) return null
  return (
    <div className="cat-pagination-bar">
      <span className="cat-pagination-info">
        Hiển thị {pageData.from} - {pageData.to} trên tổng số {pageData.total} danh mục
      </span>
      <div className="cat-pagination-actions">
        <button
          type="button"
          className="cat-pg-btn"
          onClick={() => onPageChange(1)}
          disabled={pageData.page <= 1}
          title="Trang đầu"
        >
          <ChevronsLeft size={18} />
        </button>
        <button
          type="button"
          className="cat-pg-btn"
          onClick={() => onPageChange(pageData.page - 1)}
          disabled={pageData.page <= 1}
          title="Trang trước"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="cat-pg-current">
          Trang {pageData.page} trên {pageData.totalPages}
        </span>
        <button
          type="button"
          className="cat-pg-btn"
          onClick={() => onPageChange(pageData.page + 1)}
          disabled={pageData.page >= pageData.totalPages}
          title="Trang sau"
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          className="cat-pg-btn"
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

export function AdminCategoryManagementPanel({
  categoriesState,
  categoryForm,
  setCategoryForm,
  editingCategoryId,
  savingCategory,
  startEditCategory,
  cancelEditCategory,
  saveCategory,
  deleteCategory,
  categoryKeyword,
  setCategoryKeyword,
  filteredCategories,
  categoriesPageData,
  categoriesPage,
  setCategoriesPage,
  onRefresh,
}) {
  // Level filter state: 'ALL', '1', '2'
  const [levelFilter, setLevelFilter] = useState('ALL')
  // Modal visibility state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [openCatActionId, setOpenCatActionId] = useState(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleGlobalClick = () => setOpenCatActionId(null)
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  // Open modal automatically if editingId changes
  useEffect(() => {
    if (editingCategoryId) {
      setIsModalOpen(true)
    }
  }, [editingCategoryId])

  // Calculate statistics
  const stats = useMemo(() => {
    const items = categoriesState.items || []
    const total = items.length
    const level1Count = items.filter((c) => Number(c.cap_bac) === 1).length
    const level2Count = items.filter((c) => Number(c.cap_bac) === 2).length
    const activeWithProducts = items.filter((c) => Number(c.product_count || 0) > 0).length

    return { total, level1Count, level2Count, activeWithProducts }
  }, [categoriesState.items])

  // Filter categories by keyword and level
  const displayedCategories = useMemo(() => {
    let result = filteredCategories || []
    if (levelFilter === '1') {
      result = result.filter((c) => Number(c.cap_bac) === 1)
    } else if (levelFilter === '2') {
      result = result.filter((c) => Number(c.cap_bac) === 2)
    }
    return result
  }, [filteredCategories, levelFilter])

  // Paginated data for custom filter
  const pageSize = 10
  const pageData = useMemo(() => {
    const total = displayedCategories.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(Math.max(Number(categoriesPage || 1), 1), totalPages)
    const start = (safePage - 1) * pageSize
    const end = start + pageSize
    const rows = displayedCategories.slice(start, end)
    return {
      total,
      totalPages,
      page: safePage,
      from: total === 0 ? 0 : start + 1,
      to: Math.min(end, total),
      rows
    }
  }, [displayedCategories, categoriesPage])

  const handleLevelFilterChange = (level) => {
    setLevelFilter(level)
    setCategoriesPage(1)
  }

  // Open modal for creating a new category
  const handleOpenAddModal = () => {
    cancelEditCategory()
    setIsModalOpen(true)
  }

  // Close modal
  const handleCloseModal = () => {
    cancelEditCategory()
    setIsModalOpen(false)
  }

  // Submit form handler
  const handleFormSubmit = async (e) => {
    e.preventDefault()
    try {
      await saveCategory()
      setIsModalOpen(false)
    } catch {
      // Keep modal open if error occurs
    }
  }

  // Find parent category label helper
  const getParentCategoryLabel = (parentCode) => {
    if (!parentCode) return '---'
    const parent = categoriesState.items.find(
      (c) => String(c.code) === String(parentCode) || String(c.id) === String(parentCode)
    )
    return parent ? parent.label : `Mã danh mục #${parentCode}`
  }

  return (
    <div className="cat-manage-container">
      {/* Header section with Action Button */}
      <div className="cat-manage-header">
        <div className="cat-manage-header-title">
          <div className="cat-manage-icon-wrapper">
            <FolderTree size={24} className="cat-header-icon" />
          </div>
          <div>
            <h2>Quản lý danh mục thực đơn</h2>
            <p>Thiết lập danh mục chính và danh mục phụ để phân loại món ăn, đồ uống trong hệ thống menu</p>
          </div>
        </div>
        <div className="cat-manage-header-actions">
          {onRefresh && (
            <button type="button" className="cat-refresh-btn" onClick={onRefresh} title="Tải lại dữ liệu">
              <RefreshCw size={16} />
              <span>Tải lại</span>
            </button>
          )}
          <button type="button" className="cat-btn cat-btn--success" onClick={handleOpenAddModal}>
            <Plus size={18} />
            <span>Thêm danh mục mới</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="cat-kpi-grid">
        <div className="cat-kpi-card cat-kpi-card--total">
          <div className="cat-kpi-icon cat-kpi-icon--total">
            <FolderTree size={20} />
          </div>
          <div className="cat-kpi-content">
            <span className="cat-kpi-label">Tổng số danh mục</span>
            <span className="cat-kpi-value">{stats.total}</span>
          </div>
        </div>

        <div className="cat-kpi-card cat-kpi-card--level1">
          <div className="cat-kpi-icon cat-kpi-icon--level1">
            <Layers size={20} />
          </div>
          <div className="cat-kpi-content">
            <span className="cat-kpi-label">Danh mục chính (Cấp 1)</span>
            <span className="cat-kpi-value">{stats.level1Count}</span>
          </div>
        </div>

        <div className="cat-kpi-card cat-kpi-card--level2">
          <div className="cat-kpi-icon cat-kpi-icon--level2">
            <Tag size={20} />
          </div>
          <div className="cat-kpi-content">
            <span className="cat-kpi-label">Danh mục phụ (Cấp 2)</span>
            <span className="cat-kpi-value">{stats.level2Count}</span>
          </div>
        </div>

        <div className="cat-kpi-card cat-kpi-card--active">
          <div className="cat-kpi-icon cat-kpi-icon--active">
            <Coffee size={20} />
          </div>
          <div className="cat-kpi-content">
            <span className="cat-kpi-label">Đang có sản phẩm</span>
            <span className="cat-kpi-value">{stats.activeWithProducts}</span>
          </div>
        </div>
      </div>

      {/* Category List & Data Table (FULL WIDTH 100%) */}
      <div className="cat-list-card cat-list-card--full">
        {/* List Toolbar & Filters */}
        <div className="cat-toolbar">
          <div className="cat-search-box">
            <Search size={16} className="cat-search-icon" />
            <input
              type="text"
              value={categoryKeyword}
              onChange={(e) => {
                setCategoryKeyword(e.target.value)
                setCategoriesPage(1)
              }}
              placeholder="Tìm kiếm danh mục theo tên hoặc mã..."
            />
            {categoryKeyword && (
              <button
                type="button"
                className="cat-search-clear"
                onClick={() => setCategoryKeyword('')}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Level Filter Tabs */}
          <div className="cat-toolbar-right">
            <div className="cat-filter-pills">
              <button
                type="button"
                className={`cat-pill ${levelFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => handleLevelFilterChange('ALL')}
              >
                Tất cả ({stats.total})
              </button>
              <button
                type="button"
                className={`cat-pill ${levelFilter === '1' ? 'active' : ''}`}
                onClick={() => handleLevelFilterChange('1')}
              >
                Danh mục chính ({stats.level1Count})
              </button>
              <button
                type="button"
                className={`cat-pill ${levelFilter === '2' ? 'active' : ''}`}
                onClick={() => handleLevelFilterChange('2')}
              >
                Danh mục phụ ({stats.level2Count})
              </button>
            </div>
            <button type="button" className="cat-btn cat-btn--success cat-btn--sm" onClick={handleOpenAddModal}>
              <Plus size={16} />
              <span>Tạo danh mục</span>
            </button>
          </div>
        </div>

        {/* Loading & Error States */}
        {categoriesState.loading && (
          <div className="cat-state-box">
            <RefreshCw size={24} className="cat-spin-icon" />
            <span>Đang tải danh sách danh mục...</span>
          </div>
        )}

        {categoriesState.error && (
          <div className="cat-state-box cat-state-box--error">
            <AlertCircle size={20} />
            <span>{categoriesState.error}</span>
          </div>
        )}

        {/* Table view (Full Width) */}
        {!categoriesState.loading && !categoriesState.error && (
          <>
            {pageData.rows.length === 0 ? (
              <div className="cat-state-box cat-state-box--empty">
                <Info size={24} />
                <span>Không tìm thấy danh mục phù hợp.</span>
              </div>
            ) : (
              <div className="cat-table-wrapper">
                <table className="cat-table">
                  <thead>
                    <tr>
                      <th style={{ width: '25%' }}>Tên danh mục</th>
                      <th style={{ width: '12%' }}>Mã hệ thống</th>
                      <th style={{ width: '18%' }}>Cấp bậc</th>
                      <th style={{ width: '20%' }}>Danh mục cha</th>
                      <th style={{ width: '13%' }}>Số món liên kết</th>
                      <th style={{ width: '12%' }} className="text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.rows.map((cat, index, array) => {
                      const productCount = Number(cat.product_count || 0)
                      const isLevel1 = Number(cat.cap_bac) === 1
                      const isEditingThis = editingCategoryId === String(cat.id || cat.code)

                      // Render icon if available
                      const presetObj = ICON_PRESETS.find((p) => p.name === cat.icon)
                      const PresetIconComponent = presetObj ? presetObj.icon : null

                      return (
                        <tr key={cat.code || cat.id} className={isEditingThis ? 'is-editing-row' : ''}>
                          {/* Category Name & Icon */}
                          <td>
                            <div className="cat-name-cell">
                              <div className={`cat-item-icon ${isLevel1 ? 'is-level1' : 'is-level2'}`}>
                                {PresetIconComponent ? (
                                  <PresetIconComponent size={16} />
                                ) : cat.icon && cat.icon.startsWith('http') ? (
                                  <img src={cat.icon} alt="" className="cat-img-icon" />
                                ) : isLevel1 ? (
                                  <Layers size={16} />
                                ) : (
                                  <Tag size={16} />
                                )}
                              </div>
                              <span className="cat-item-name">{cat.label}</span>
                            </div>
                          </td>

                          {/* Category Code */}
                          <td>
                            <span className="cat-code-badge">{cat.code}</span>
                          </td>

                          {/* Level Badge */}
                          <td>
                            {isLevel1 ? (
                              <span className="cat-level-badge cat-level-badge--1">
                                <Layers size={12} />
                                <span>Danh mục chính</span>
                              </span>
                            ) : (
                              <span className="cat-level-badge cat-level-badge--2">
                                <Tag size={12} />
                                <span>Danh mục phụ</span>
                              </span>
                            )}
                          </td>

                          {/* Parent Category */}
                          <td>
                            {!isLevel1 ? (
                              <span className="cat-parent-label">
                                {getParentCategoryLabel(cat.ma_danh_muc_cha)}
                              </span>
                            ) : (
                              <span className="cat-text-muted">---</span>
                            )}
                          </td>

                          {/* Product Count Chip */}
                          <td>
                            <span className={`cat-count-chip ${productCount > 0 ? 'has-products' : 'empty'}`}>
                              <Coffee size={13} />
                              <span>{productCount} món</span>
                            </span>
                          </td>

                          <td style={{ textAlign: 'center', position: 'relative', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn-icon-more"
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpenCatActionId(openCatActionId === (cat.id || cat.code) ? null : (cat.id || cat.code))
                              }}
                              title="Thao tác"
                            >
                              <MoreVertical size={16} color="#475569" />
                            </button>

                            {openCatActionId === (cat.id || cat.code) && (
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
                                    setOpenCatActionId(null)
                                    startEditCategory(cat)
                                    setIsModalOpen(true)
                                  }}
                                >
                                  <Edit3 size={14} color="#2563eb" /> Chỉnh sửa danh mục
                                </button>

                                <div style={{ borderTop: '1px solid #f1f5f9', margin: '0.2rem 0' }}></div>

                                <button
                                  type="button"
                                  className="btn-dropdown-item danger"
                                  disabled={productCount > 0}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    width: '100%',
                                    padding: '0.45rem 0.65rem',
                                    borderRadius: '6px',
                                    fontSize: '0.8125rem',
                                    fontWeight: '500',
                                    color: productCount > 0 ? '#94a3b8' : '#dc2626',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: productCount > 0 ? 'not-allowed' : 'pointer',
                                    textAlign: 'left',
                                    opacity: productCount > 0 ? 0.6 : 1
                                  }}
                                  onClick={() => {
                                    if (productCount > 0) return
                                    setOpenCatActionId(null)
                                    deleteCategory(cat.id || cat.code, cat.label)
                                  }}
                                  title={productCount > 0 ? `Không thể xóa vì danh mục đang chứa ${productCount} sản phẩm` : 'Xóa danh mục này'}
                                >
                                  <Trash2 size={14} color={productCount > 0 ? '#94a3b8' : '#dc2626'} /> Xóa danh mục
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
            <CategoryPagination pageData={pageData} onPageChange={setCategoriesPage} />
          </>
        )}
      </div>

      {/* MODAL DIALOG FOR CREATE / EDIT CATEGORY */}
      {isModalOpen && (
        <div className="cat-modal-overlay" onClick={handleCloseModal}>
          <div className="cat-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="cat-modal-head">
              <div className="cat-modal-title">
                {editingCategoryId ? (
                  <>
                    <Edit3 size={20} className="cat-head-icon edit-mode" />
                    <div>
                      <h3>Chỉnh sửa danh mục</h3>
                      <span>Mã danh mục: #{editingCategoryId}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <Plus size={20} className="cat-head-icon add-mode" />
                    <div>
                      <h3>Thêm danh mục mới</h3>
                      <span>Tạo danh mục chính hoặc phụ cho hệ thống</span>
                    </div>
                  </>
                )}
              </div>
              <button type="button" className="cat-modal-close" onClick={handleCloseModal} title="Đóng">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="cat-modal-body">
              {/* Input: Category Label */}
              <div className="cat-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="cat-modal-label" style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#334155' }}>
                  Tên danh mục <span className="cat-required" style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                  <FolderTree size={16} color="#64748b" style={{ flexShrink: 0 }} />
                  <input
                    id="cat-modal-label"
                    type="text"
                    style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                    value={categoryForm.label || ''}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, label: e.target.value }))}
                    placeholder="Ví dụ: Cà phê phin, Trà trái cây, Bánh ngọt..."
                    autoFocus
                    required
                  />
                </div>
              </div>

              {/* Input: Category Level */}
              <div className="cat-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="cat-modal-level" style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#334155' }}>Cấp bậc danh mục</label>
                <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                  <Layers size={16} color="#64748b" style={{ flexShrink: 0 }} />
                  <select
                    id="cat-modal-level"
                    style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none', cursor: 'pointer' }}
                    value={categoryForm.cap_bac}
                    onChange={(e) =>
                      setCategoryForm((p) => ({ ...p, cap_bac: Number(e.target.value) }))
                    }
                  >
                    <option value={1}>Cấp 1 - Danh mục chính</option>
                    <option value={2}>Cấp 2 - Danh mục phụ</option>
                  </select>
                </div>
              </div>

              {/* Input: Parent Category (Only if Level 2) */}
              {Number(categoryForm.cap_bac) === 2 && (
                <div className="cat-form-group cat-form-group--highlight" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label htmlFor="cat-modal-parent" style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#334155' }}>
                    Danh mục cha <span className="cat-required" style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                    <Tag size={16} color="#64748b" style={{ flexShrink: 0 }} />
                    <select
                      id="cat-modal-parent"
                      style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none', cursor: 'pointer' }}
                      value={categoryForm.ma_danh_muc_cha || ''}
                      onChange={(e) =>
                        setCategoryForm((p) => ({ ...p, ma_danh_muc_cha: e.target.value }))
                      }
                      required
                    >
                      <option value="">-- Chọn danh mục cha --</option>
                      {categoriesState.items
                        .filter((c) => Number(c.cap_bac) === 1)
                        .map((c) => (
                          <option key={c.code || c.id} value={c.code || c.id}>
                            {c.label} (Mã: {c.code})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Input: Icon Selection / URL */}
              <div className="cat-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="cat-modal-icon" style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#334155' }}>Biểu tượng (Icon)</label>
                <div style={{ display: 'flex', alignItems: 'center', height: '42px', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', padding: '0 0.85rem', gap: '0.65rem' }}>
                  <Sparkles size={16} color="#64748b" style={{ flexShrink: 0 }} />
                  <input
                    id="cat-modal-icon"
                    type="text"
                    style={{ flex: 1, width: '100%', height: '100%', border: 'none', outline: 'none', backgroundColor: 'transparent', background: 'transparent', padding: 0, fontSize: '0.875rem', color: '#0f172a', boxShadow: 'none' }}
                    value={categoryForm.icon || ''}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, icon: e.target.value }))}
                    placeholder="Chọn icon mẫu bên dưới hoặc nhập đường dẫn ảnh..."
                  />
                </div>
                {/* Icon Presets */}
                <div className="cat-icon-presets" style={{ marginTop: '0.5rem' }}>
                  <span className="cat-presets-label">Gợi ý icon mẫu:</span>
                  <div className="cat-presets-list">
                    {ICON_PRESETS.map((preset) => {
                      const PresetIcon = preset.icon
                      const isSelected = categoryForm.icon === preset.name
                      return (
                        <button
                          key={preset.name}
                          type="button"
                          className={`cat-preset-chip ${isSelected ? 'is-selected' : ''}`}
                          onClick={() => setCategoryForm((p) => ({ ...p, icon: preset.name }))}
                          title={preset.label}
                        >
                          <PresetIcon size={14} />
                          <span>{preset.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Form Actions */}
              <div className="cat-modal-footer">
                <button
                  type="button"
                  className="cat-btn cat-btn--neutral btn-cancel"
                  onClick={handleCloseModal}
                  disabled={savingCategory}
                  style={{
                    backgroundColor: '#fef2f2',
                    background: '#fef2f2',
                    color: '#dc2626',
                    border: '1px solid #fecaca',
                    height: '40px',
                    padding: '0 1.25rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem'
                  }}
                >
                  <X size={16} color="#dc2626" />
                  <span style={{ color: '#dc2626' }}>Hủy bỏ</span>
                </button>

                <button
                  type="submit"
                  className="cat-btn cat-btn--success btn-save"
                  disabled={savingCategory || !categoryForm.label.trim()}
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    border: 'none',
                    height: '40px',
                    padding: '0 1.5rem',
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)'
                  }}
                >
                  {savingCategory ? (
                    <>
                      <RefreshCw size={16} className="cat-spin-icon" color="#ffffff" />
                      <span>Đang lưu...</span>
                    </>
                  ) : editingCategoryId ? (
                    <>
                      <Check size={16} color="#ffffff" />
                      <span>Lưu cập nhật</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} color="#ffffff" />
                      <span>Tạo danh mục</span>
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
