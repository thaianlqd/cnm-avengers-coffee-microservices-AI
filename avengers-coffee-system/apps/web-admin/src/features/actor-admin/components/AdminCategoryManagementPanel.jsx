import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import SearchableSelect from '../../../components/console/SearchableSelect'
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
  MoreVertical,
  Upload
} from '../../../components/console/WorkspaceIcons'

// Preset icon options for quick selection
const ICON_PRESETS = [
  { name: 'Coffee', icon: Coffee, label: 'Cà phê' },
  { name: 'CupSoda', icon: CupSoda, label: 'Thức uống' },
  { name: 'Utensils', icon: Utensils, label: 'Đồ ăn' },
  { name: 'Cake', icon: Cake, label: 'Bánh ngọt' },
  { name: 'Flame', icon: Flame, label: 'Món hot' },
  { name: 'Package', icon: Package, label: 'Gói và Combo' },
  { name: 'Sparkles', icon: Sparkles, label: 'Đặc biệt' },
  { name: 'Heart', icon: Heart, label: 'Yêu thích' }
]

// Icons exactly matched with Web Customer (/hc-assets/menu_icon_*.png)
const CUSTOMER_CATEGORY_ICONS = {
  coffee: '/hc-assets/menu_icon_1.png',
  tea: '/hc-assets/menu_icon_2.png',
  milktea: '/hc-assets/menu_icon_3.png',
  freeze: '/hc-assets/menu_icon_4.png',
  food: '/hc-assets/menu_icon_5.png',
  snack: '/hc-assets/menu_icon_6.png',
  gift: '/hc-assets/menu_icon_7.png',
  other: '/hc-assets/menu_icon_8.png',
}

const CUSTOMER_ICON_PRESETS = [
  { url: '/hc-assets/menu_icon_1.png', label: 'Cà Phê' },
  { url: '/hc-assets/menu_icon_2.png', label: 'Trà' },
  { url: '/hc-assets/menu_icon_3.png', label: 'Trà Sữa' },
  { url: '/hc-assets/menu_icon_4.png', label: 'Đá Xay' },
  { url: '/hc-assets/menu_icon_5.png', label: 'Bánh Ngọt' },
  { url: '/hc-assets/menu_icon_6.png', label: 'Bánh Mặn' },
  { url: '/hc-assets/menu_icon_7.png', label: 'Thẻ Quà' },
  { url: '/hc-assets/menu_icon_8.png', label: 'Khác' },
]

function resolveCategoryImage(cat, menuItems = [], allCategories = []) {
  if (!cat) return CUSTOMER_CATEGORY_ICONS.coffee

  // 1. Direct explicit image or absolute/relative URL
  const explicit = cat.icon || cat.image || cat.hinh_anh_url || cat.hinh_anh_icon
  if (explicit && typeof explicit === 'string') {
    if (explicit.startsWith('/hc-assets/') || explicit.startsWith('http://') || explicit.startsWith('https://')) {
      return explicit
    }
  }

  // 2. Exact match with customer web icons by category name
  const name = (cat.label || cat.ten_danh_muc || '').toLowerCase().trim()
  if (name.includes('cà phê') || name.includes('cafe') || name.includes('coffee') || cat.icon === 'Coffee') return CUSTOMER_CATEGORY_ICONS.coffee
  if (name.includes('trà sữa') || name.includes('macchiato')) return CUSTOMER_CATEGORY_ICONS.milktea
  if (name.includes('trà') || name.includes('tea') || cat.icon === 'CupSoda') return CUSTOMER_CATEGORY_ICONS.tea
  if (name.includes('đá xay') || name.includes('freeze') || name.includes('sinh tố') || name.includes('frappe')) return CUSTOMER_CATEGORY_ICONS.freeze
  if (name.includes('bánh mặn') || name.includes('ăn nhẹ') || cat.icon === 'Cake') return CUSTOMER_CATEGORY_ICONS.snack
  if (name.includes('bánh') || name.includes('đồ ăn') || name.includes('trung thu') || name.includes('food') || cat.icon === 'Utensils') return CUSTOMER_CATEGORY_ICONS.food
  if (name.includes('quà tặng') || name.includes('thẻ quà') || name.includes('gift') || cat.icon === 'Package') return CUSTOMER_CATEGORY_ICONS.gift
  if (name.includes('ưu đãi') || name.includes('riêng') || cat.icon === 'Heart') return CUSTOMER_CATEGORY_ICONS.gift
  if (name.includes('khác') || cat.icon === 'Sparkles') return CUSTOMER_CATEGORY_ICONS.other

  // 3. Child category inherits parent icon
  if (cat.ma_danh_muc_cha && Array.isArray(allCategories) && allCategories.length > 0) {
    const parent = allCategories.find((c) => String(c.id || c.code || c.ma_danh_muc) === String(cat.ma_danh_muc_cha))
    if (parent && parent !== cat) {
      return resolveCategoryImage(parent, menuItems, [])
    }
  }

  // 4. Lookup product under this category with image
  if (Array.isArray(menuItems) && menuItems.length > 0) {
    const matched = menuItems.find((p) => {
      const matchCatId = String(p.danh_muc_id || p.category_code || '') === String(cat.code || cat.id || cat.ma_danh_muc)
      const matchCatName = (p.danh_muc || p.category || '').toLowerCase() === name
      return (matchCatId || matchCatName) && (p.image || p.hinh_anh_url)
    })
    if (matched && (matched.image || matched.hinh_anh_url)) {
      return matched.image || matched.hinh_anh_url
    }
  }

  return CUSTOMER_CATEGORY_ICONS.coffee
}

function getCategoryProductCount(cat, allCategories = []) {
  if (!cat) return 0
  let count = Number(cat.product_count || 0)
  if (Number(cat.cap_bac) === 1) {
    const parentId = String(cat.id || cat.code || cat.ma_danh_muc || '')
    const children = (allCategories || []).filter(
      (c) => String(c.ma_danh_muc_cha) === parentId && String(c.id || c.code || c.ma_danh_muc) !== parentId
    )
    const childSum = children.reduce((sum, c) => sum + Number(c.product_count || 0), 0)
    count += childSum
  }
  return count
}

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
  menuItems = [],
}) {
  // Level filter state: 'ALL', '1', '2'
  const [levelFilter, setLevelFilter] = useState('ALL')
  // Modal visibility state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formError, setFormError] = useState('')
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
      setFormError('')
    setIsModalOpen(true)
    }
  }, [editingCategoryId])

  // Calculate statistics
  const stats = useMemo(() => {
    const items = categoriesState.items || []
    const total = items.length
    const level1Count = items.filter((c) => Number(c.cap_bac) === 1).length
    const level2Count = items.filter((c) => Number(c.cap_bac) === 2).length
    const activeWithProducts = items.filter((c) => getCategoryProductCount(c, items) > 0).length

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
    setFormError('')
    setIsModalOpen(true)
  }

  // Close modal
  const handleCloseModal = () => {
    if (savingCategory) return
    setFormError('')
    cancelEditCategory()
    setIsModalOpen(false)
  }

  // Submit form handler
  const handleFormSubmit = async (e) => {
    e.preventDefault()
    if (savingCategory) return
    setFormError('')
    try {
      const result = await saveCategory?.()
      if (result === false || result?.ok === false) {
        setFormError(result?.error || 'Không lưu được dữ liệu. Vui lòng kiểm tra các trường và thử lại.')
        return
      }
      setIsModalOpen(false)
    } catch (error) {
      setFormError(error.message || 'Không thể lưu. Dữ liệu bạn nhập vẫn được giữ lại.')
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
      {/* Category List & Data Table (FULL WIDTH 100%) */}
      <div className="cat-list-card cat-list-card--full">
        {/* List Toolbar & Filters */}
        <div className="workspace-section-title"><div><h2>Danh mục thực đơn</h2><p>Phân nhóm và sắp xếp danh mục cho thực đơn món.</p></div></div>
        <div className="cat-toolbar">
          <div className="cat-filter-pills">
              <button aria-pressed={levelFilter === 'ALL'}
                type="button"
                className={`cat-pill ${levelFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => handleLevelFilterChange('ALL')}
              >
                Tất cả ({stats.total})
              </button>
              <button aria-pressed={levelFilter === '1'}
                type="button"
                className={`cat-pill ${levelFilter === '1' ? 'active' : ''}`}
                onClick={() => handleLevelFilterChange('1')}
              >
                Danh mục chính ({stats.level1Count})
              </button>
              <button aria-pressed={levelFilter === '2'}
                type="button"
                className={`cat-pill ${levelFilter === '2' ? 'active' : ''}`}
                onClick={() => handleLevelFilterChange('2')}
              >
                Danh mục phụ ({stats.level2Count})
              </button>
            </div>
          <div className="cat-filter-group" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', width: '100%' }}>
            <div className="cat-search-box" style={{ flex: '0 1 320px', minWidth: '220px' }}>
              <input className="ui-input"
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
                  aria-label="Xóa tìm kiếm" className="cat-search-clear"
                  onClick={() => setCategoryKeyword('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {onRefresh && (
              <button
                type="button"
                className="cat-refresh-btn"
                onClick={onRefresh}
                title="Tải lại dữ liệu"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  height: '40px',
                  minHeight: '40px',
                  padding: '0 15px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <RefreshCw size={15} />
                <span>Tải lại</span>
              </button>
            )}
            <button
              type="button"
              className="cat-btn cat-btn--success cat-btn--sm cat-create-btn"
              onClick={handleOpenAddModal}
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
                      <th style={{ width: '12%', textAlign: 'center' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.rows.map((cat, index, array) => {
                      const productCount = getCategoryProductCount(cat, categoriesState.items)
                      const isLevel1 = Number(cat.cap_bac) === 1
                      const isEditingThis = editingCategoryId === String(cat.id || cat.code)

                      // Render icon & category image
                      const presetObj = ICON_PRESETS.find((p) => p.name === cat.icon)
                      const PresetIconComponent = presetObj ? presetObj.icon : null
                      const categoryImg = resolveCategoryImage(cat, menuItems, categoriesState.items)

                      return (
                        <tr key={cat.code || cat.id} className={isEditingThis ? 'is-editing-row' : ''}>
                          {/* Category Name & Thumbnail Image */}
                          <td>
                            <div className="cat-name-cell">
                              <div className="cat-thumb-box">
                                {categoryImg ? (
                                  <img
                                    src={categoryImg}
                                    alt={cat.label}
                                    className="cat-thumb-img"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none'
                                      if (e.currentTarget.nextElementSibling) {
                                        e.currentTarget.nextElementSibling.style.display = 'flex'
                                      }
                                    }}
                                  />
                                ) : null}
                                <div
                                  className={`cat-thumb-fallback ${isLevel1 ? 'is-level1' : 'is-level2'}`}
                                  style={{ display: categoryImg ? 'none' : 'flex' }}
                                >
                                  {PresetIconComponent ? (
                                    <PresetIconComponent size={16} />
                                  ) : isLevel1 ? (
                                    <Layers size={16} />
                                  ) : (
                                    <Tag size={16} />
                                  )}
                                </div>
                              </div>
                              <div className="cat-name-info">
                                <span className="cat-item-name">{cat.label}</span>
                                <span className="cat-item-sub">{isLevel1 ? 'Danh mục chính' : 'Danh mục phụ'}</span>
                              </div>
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

                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="admin-table-action-btn btn-edit"
                                onClick={() => {
                                  startEditCategory(cat)
                                  setFormError('')
    setIsModalOpen(true)
                                }}
                                title="Chỉnh sửa danh mục"
                              >
                                <Edit3 size={15} />
                              </button>

                              <button aria-label={productCount > 0 ? `Không thể xóa vì danh mục đang chứa ${productCount} sản phẩm` : 'Xóa danh mục này'}
                                type="button"
                                className="admin-table-action-btn btn-delete"
                                disabled={productCount > 0}
                                onClick={() => {
                                  if (productCount > 0) return
                                  deleteCategory(cat.id || cat.code, cat.label)
                                }}
                                title={productCount > 0 ? `Không thể xóa vì danh mục đang chứa ${productCount} sản phẩm` : 'Xóa danh mục này'}
                                style={{ opacity: productCount > 0 ? 0.4 : 1, cursor: productCount > 0 ? 'not-allowed' : 'pointer' }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
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
        <WorkspaceDialog busy={savingCategory} label="Thêm hoặc chỉnh sửa danh mục" onClose={handleCloseModal} className="workspace-dialog--editor">
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
              <button type="button" disabled={savingCategory} aria-label="Đóng cửa sổ" className="cat-modal-close" onClick={handleCloseModal} title="Đóng">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="cat-modal-body">
              {formError && <p className="workspace-form-error" role="alert">{formError}</p>}
              {/* Input: Category Label */}
              <div className="cat-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="cat-modal-label" style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#414743' }}>
                  Tên danh mục <span className="cat-required" style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="cat-modal-label"
                  type="text"
                  className="shadcn-input ui-input"
                  value={categoryForm.label || ''}
                  onChange={(e) => setCategoryForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Ví dụ: Cà phê phin, Trà trái cây, Bánh ngọt..."
                  autoFocus
                  required
                />
              </div>

              {/* Input: Category Level */}
              <div className="cat-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="cat-modal-level" style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#414743' }}>Cấp bậc danh mục</label>
                <SearchableSelect
                  id="cat-modal-level"
                  value={categoryForm.cap_bac}
                  onChange={(e) =>
                    setCategoryForm((p) => ({ ...p, cap_bac: Number(e?.target?.value ?? e) }))
                  }
                >
                  <option value={1}>Cấp 1 - Danh mục chính</option>
                  <option value={2}>Cấp 2 - Danh mục phụ</option>
                </SearchableSelect>
              </div>

              {/* Input: Parent Category (Only if Level 2) */}
              {Number(categoryForm.cap_bac) === 2 && (
                <div className="cat-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <label htmlFor="cat-modal-parent" style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#414743' }}>
                    Danh mục cha <span className="cat-required" style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <SearchableSelect
                    id="cat-modal-parent"
                    value={categoryForm.ma_danh_muc_cha || ''}
                    placeholder="-- Chọn hoặc nhập tên danh mục cha --"
                    onChange={(e) =>
                      setCategoryForm((p) => ({ ...p, ma_danh_muc_cha: e?.target?.value ?? e }))
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
                  </SearchableSelect>
                </div>
              )}

              {/* Input: Category Image URL or Local File Upload */}
              <div className="cat-form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label htmlFor="cat-modal-icon" style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#414743' }}>
                  Hình ảnh danh mục
                </label>
                <div className="admin-image-picker">
                  <div className="admin-image-picker-controls" style={{ display: 'flex', alignItems: 'stretch', width: '100%', height: '40px' }}>
                    <input
                      id="cat-modal-icon"
                      type="text"
                      className="shadcn-input ui-input"
                      value={categoryForm.icon || ''}
                      onChange={(e) => setCategoryForm((p) => ({ ...p, icon: e.target.value }))}
                      placeholder="Dán đường dẫn ảnh (https://...)"
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
                    <label
                      className="admin-image-upload-btn"
                      title="Chọn tệp ảnh từ máy tính"
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
                        border: '1px solid #cbd5e1',
                        borderLeft: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        color: '#334155',
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
                              setCategoryForm((p) => ({ ...p, icon: event.target.result }));
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                  </div>

                  {categoryForm.icon && (
                    <div className="admin-image-preview-badge">
                      <img
                        src={categoryForm.icon}
                        alt="Xem trước ảnh"
                        className="admin-image-preview-thumb"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <div className="admin-image-preview-info">
                        <span className="admin-image-preview-url" title={categoryForm.icon}>
                          {categoryForm.icon.startsWith('data:') ? 'Ảnh tải lên từ máy tính' : categoryForm.icon}
                        </span>
                        <button
                          type="button"
                          className="admin-image-clear-btn"
                          onClick={() => setCategoryForm((p) => ({ ...p, icon: '' }))}
                        >
                          <Trash2 size={12} />
                          <span>Gỡ ảnh này</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Customer Icon Presets */}
                <div className="cat-icon-presets" style={{ marginTop: '0.4rem' }}>
                  <span className="cat-presets-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Biểu tượng gợi ý nhanh:</span>
                  <div className="cat-presets-list" style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {CUSTOMER_ICON_PRESETS.map((preset) => {
                      const isSelected = categoryForm.icon === preset.url
                      return (
                        <button aria-label={preset.label}
                          key={preset.url}
                          type="button"
                          className={`cat-preset-chip ${isSelected ? 'is-selected' : ''}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            border: isSelected ? '1.5px solid #0f172a' : '1px solid var(--border-light)',
                            background: isSelected ? '#f1f5f9' : '#ffffff',
                            color: '#0f172a',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: isSelected ? '700' : '400'
                          }}
                          onClick={() => setCategoryForm((p) => ({ ...p, icon: preset.url }))}
                          title={preset.label}
                        >
                          <img src={preset.url} alt={preset.label} style={{ width: 18, height: 18, objectFit: 'contain' }} />
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
                    backgroundColor: "#ffffff",
                    background: "#ffffff",
                    color: '#dc2626',
                    border: '1px solid #fca5a5',
                    height: '38px',
                    padding: '0 1.25rem',
                    borderRadius: '6px',
                    fontSize: '0.8125rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <X size={15} style={{ color: '#dc2626' }} /><span>Hủy bỏ</span>
                </button>

                <button
                  type="submit"
                  className="cat-btn cat-btn--success btn-save"
                  disabled={savingCategory || !categoryForm.label.trim()}
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
                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
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
        </WorkspaceDialog>
      )}
    </div>
  )
}
