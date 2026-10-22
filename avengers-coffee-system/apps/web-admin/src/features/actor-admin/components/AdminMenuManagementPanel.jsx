import { Flame as WorkspaceSymbolFlame } from '../../../components/console/WorkspaceIcons'
import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import SearchableSelect from '../../../components/console/SearchableSelect'
import CurrencyInput from '../../../components/console/CurrencyInput'
import React, { useState, useMemo, useEffect, Component } from 'react'
import { createPortal } from 'react-dom'
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
} from '../../../components/console/WorkspaceIcons'

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

function ShadcnCheckboxCard({ checked, onChange, title, subtitle, icon, id }) {
  return (
    <div
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      id={id}
      onClick={() => onChange(!checked)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          onChange(!checked)
        }
      }}
      className={`shadcn-checkbox-card ${checked ? 'is-checked' : ''}`}
    >
      <div className={`shadcn-checkbox-box ${checked ? 'is-checked' : ''}`}>
        {checked && <Check size={13} strokeWidth={2.8} />}
      </div>
      <div className="shadcn-checkbox-content">
        <div className="shadcn-checkbox-title">
          <span>{title}</span>
          {icon && <span className="shadcn-checkbox-icon">{icon}</span>}
        </div>
        {subtitle && <p className="shadcn-checkbox-subtitle">{subtitle}</p>}
      </div>
    </div>
  )
}

function CreatableVariantGroupInput({ onAddGroup, existingGroups = {}, attributes = [] }) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = React.useRef(null)
  const popoverRef = React.useRef(null)
  const [placement, setPlacement] = useState({})

  const defaultPresets = ['Kích thước', 'Topping', 'Lượng đá', 'Độ ngọt', 'Loại sữa']
  const allAvailable = useMemo(() => {
    const dynamicAttrs = (attributes || []).filter(Boolean).map((a) => a.name)
    const combined = Array.from(new Set([...defaultPresets, ...dynamicAttrs]))
    return combined.filter((name) => !existingGroups[name])
  }, [attributes, existingGroups])

  const filtered = useMemo(() => {
    const q = inputValue.trim().toLowerCase()
    if (!q) return allAvailable
    return allAvailable.filter((name) => name.toLowerCase().includes(q))
  }, [allAvailable, inputValue])

  const exactMatch = useMemo(() => {
    const q = inputValue.trim().toLowerCase()
    if (!q) return false
    return allAvailable.some((name) => name.toLowerCase() === q)
  }, [allAvailable, inputValue])

  // Smart floating placement: flips above when near bottom of viewport or modal
  useEffect(() => {
    if (!isOpen) return
    const updatePosition = () => {
      if (!wrapperRef.current) return
      const rect = wrapperRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom - 12
      const spaceAbove = rect.top - 12
      const showAbove = spaceBelow < 250 && spaceAbove > spaceBelow

      setPlacement({
        position: 'fixed',
        left: Math.max(12, Math.min(rect.left, window.innerWidth - Math.min(rect.width, 520) - 12)),
        width: Math.min(rect.width, 520),
        maxHeight: Math.max(140, Math.min(260, showAbove ? spaceAbove : spaceBelow)),
        zIndex: 999999,
        ...(showAbove
          ? { bottom: window.innerHeight - rect.top + 6 }
          : { top: rect.bottom + 6 }),
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    return () => document.removeEventListener('pointerdown', handleClickOutside)
  }, [])

  const handleSelect = (name) => {
    if (!name) return
    onAddGroup(name)
    setInputValue('')
    setIsOpen(false)
  }

  const handleCreateNew = () => {
    const trimmed = inputValue.trim()
    if (!trimmed) return
    onAddGroup(trimmed)
    setInputValue('')
    setIsOpen(false)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length === 1 && !exactMatch) {
        handleSelect(filtered[0])
      } else if (inputValue.trim()) {
        handleCreateNew()
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div ref={wrapperRef} className="creatable-variant-wrapper">
      <div className="creatable-variant-input-row">
        <div className="creatable-input-box">

          <input
            type="text"
            className="shadcn-input creatable-input ui-input"
            placeholder="Nhập hoặc tìm tên nhóm (VD: Kích thước, Topping, Lượng đá...)"
            value={inputValue}
            onFocus={() => setIsOpen(true)}
            onChange={(e) => {
              setInputValue(e.target.value)
              setIsOpen(true)
            }}
            onKeyDown={handleKeyDown}
          />
          {inputValue && (
            <button
              type="button"
              className="creatable-clear-btn"
              onClick={() => {
                setInputValue('')
                setIsOpen(false)
              }}
              title="Xóa"
            >
              <X size={13} />
            </button>
          )}
        </div>

        <button
          type="button"
          className="menu-btn menu-btn--success creatable-add-btn"
          onClick={() => {
            if (inputValue.trim()) {
              handleCreateNew()
            } else {
              setIsOpen(true)
            }
          }}
        >
          <Plus size={15} />
          <span>Tạo nhóm</span>
        </button>
      </div>

      {/* Dropdown Suggestions rendered in portal to prevent clipping by modal boundaries or sticky footer */}
      {isOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="creatable-suggestions-popover"
            style={{
              ...placement,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              backgroundColor: '#ffffff',
              border: '1px solid #e4e4e7',
              borderRadius: '8px',
              boxShadow: '0 12px 30px -4px rgba(0, 0, 0, 0.15), 0 4px 10px -2px rgba(0, 0, 0, 0.08)',
              padding: '6px',
            }}
          >
            {inputValue.trim() && !exactMatch && (
              <div
                className="creatable-suggestion-item is-create-action"
                onClick={handleCreateNew}
              >
                <div className="creatable-create-badge">
                  <Plus size={13} />
                </div>
                <div className="creatable-suggestion-text">
                  <span className="creatable-create-label">Tạo mới nhóm:</span>
                  <strong className="creatable-create-name">"{inputValue.trim()}"</strong>
                </div>
              </div>
            )}

            {filtered.length > 0 ? (
              <>
                <div className="creatable-suggestions-header">
                  {inputValue.trim() ? 'Biến thể phù hợp có sẵn:' : 'GỢI Ý BIẾN THỂ PHỔ BIẾN:'}
                </div>
                {filtered.map((opt) => (
                  <div
                    key={opt}
                    className="creatable-suggestion-item"
                    onClick={() => handleSelect(opt)}
                  >
                    <Sparkles size={13} className="creatable-item-icon" />
                    <span className="creatable-item-name">{opt}</span>
                    <span className="creatable-item-action">Chọn nhóm</span>
                  </div>
                ))}
              </>
            ) : !inputValue.trim() ? (
              <div className="creatable-empty-hint">Không còn nhóm biến thể gợi ý nào.</div>
            ) : null}
          </div>,
          document.body
        )}
    </div>
  )
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
        <div className="admin-surface" style={{ padding: '2.5rem 1.5rem', textAlign: 'center', background: '#ffffff', borderRadius: '16px', border: '1px solid #fee2e2', boxShadow: '0 4px 20px rgba(0,0,0,0.03)' }}>
          <AlertCircle size={32} color="#dc2626" style={{ marginBottom: '0.75rem' }} />
          <h3 style={{ color: '#dc2626', margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: '700' }}>
            Không thể hiển thị Giao diện Menu
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            Chi tiết lỗi: {this.state.error?.message || 'Có sự cố xảy ra khi xử lý dữ liệu menu.'}
          </p>
          <button className="admin-button-primary"
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
  const [formError, setFormError] = useState('')
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
      setFormError('')
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

  // Category hierarchical options for filtering
  const categoryFilterOptions = useMemo(() => {
    const rawItems = (categoriesState?.items || []).filter(Boolean)
    if (!rawItems.length) return []

    const menuItems = menuState?.items || []
    const totalCount = menuItems.length

    const parents = rawItems.filter((c) => Number(c.cap_bac) === 1 || !c.ma_danh_muc_cha)
    const children = rawItems.filter((c) => Number(c.cap_bac) === 2 && c.ma_danh_muc_cha)

    const list = []

    // 1. All Categories option
    list.push({
      value: 'ALL',
      label: 'Tất cả danh mục',
      rawLabel: 'Tất cả danh mục',
      displayLabel: 'Tất cả danh mục',
      badge: `${totalCount} món`,
      isAll: true,
      level: 0,
    })

    parents.forEach((parent) => {
      const myChildren = children.filter((ch) => Number(ch.ma_danh_muc_cha) === Number(parent.id))
      const childIds = new Set(myChildren.map((ch) => Number(ch.id)))

      // Total count in parent
      const parentCount = menuItems.filter((item) => {
        if (!item) return false
        const pId = Number(item.parent_category_id || item.ma_danh_muc_cha || 0)
        const cId = Number(item.ma_danh_muc || item.category_code || 0)
        return (
          pId === Number(parent.id) ||
          cId === Number(parent.id) ||
          childIds.has(cId) ||
          String(item.parent_category || '').toLowerCase() === String(parent.label || '').toLowerCase()
        )
      }).length

      list.push({
        value: parent.label,
        label: parent.label,
        rawLabel: parent.label,
        displayLabel: `${parent.label} (Tất cả)`,
        badge: `${parentCount} món`,
        isParent: true,
        level: 1,
        id: parent.id,
        code: parent.code,
        divider: true,
      })

      myChildren.forEach((child) => {
        const childCount = menuItems.filter((item) => {
          if (!item) return false
          const cId = Number(item.ma_danh_muc || item.category_code || 0)
          return (
            cId === Number(child.id) ||
            String(item.category || '').toLowerCase() === String(child.label || '').toLowerCase()
          )
        }).length

        list.push({
          value: child.label,
          label: child.label,
          rawLabel: `${parent.label} — ${child.label}`,
          displayLabel: `${parent.label} › ${child.label}`,
          badge: `${childCount} món`,
          isChild: true,
          level: 2,
          id: child.id,
          code: child.code,
          parentLabel: parent.label,
        })
      })
    })

    const handledIds = new Set(
      parents.flatMap((p) => children.filter((ch) => Number(ch.ma_danh_muc_cha) === Number(p.id)).map((c) => c.id))
    )
    children.filter((ch) => !handledIds.has(ch.id)).forEach((child) => {
      const childCount = menuItems.filter((item) => {
        if (!item) return false
        const cId = Number(item.ma_danh_muc || item.category_code || 0)
        return (
          cId === Number(child.id) ||
          String(item.category || '').toLowerCase() === String(child.label || '').toLowerCase()
        )
      }).length

      list.push({
        value: child.label,
        label: child.label,
        rawLabel: child.label,
        displayLabel: child.label,
        badge: `${childCount} món`,
        isChild: true,
        level: 2,
        id: child.id,
        code: child.code,
      })
    })

    return list
  }, [categoriesState?.items, menuState?.items])

  // Category options for Modal Add/Edit (excluding ALL)
  const modalCategoryOptions = useMemo(() => {
    return categoryFilterOptions
      .filter((opt) => opt.value !== 'ALL')
      .map((opt) => {
        const cat = (categoriesState?.items || []).find((c) => c.label === opt.value)
        return {
          value: cat ? String(cat.code || cat.id) : opt.value,
          label: opt.label,
          rawLabel: opt.rawLabel,
          displayLabel: opt.isChild ? `${opt.parentLabel} › ${opt.label}` : opt.label,
          isParent: opt.isParent,
          isChild: opt.isChild,
          level: opt.level,
          badge: opt.isParent ? 'Danh mục chính' : undefined,
          divider: opt.divider,
        }
      })
  }, [categoryFilterOptions, categoriesState?.items])

  // Apply custom category and status filters (Defensive filtering)
  const displayedItems = useMemo(() => {
    let result = (menuKeyword && String(menuKeyword).trim()
      ? (filteredMenuItems || [])
      : (filteredMenuItems?.length ? filteredMenuItems : menuState?.items || [])
    ).filter(Boolean)

    if (selectedCategoryFilter !== 'ALL') {
      const selectedLower = String(selectedCategoryFilter || '').trim().toLowerCase()
      const allCategories = categoriesState?.items || []
      const matchedCat = allCategories.find(
        (c) =>
          String(c.label || '').trim().toLowerCase() === selectedLower ||
          String(c.code || '').trim().toLowerCase() === selectedLower ||
          String(c.id || '').trim().toLowerCase() === selectedLower
      )

      if (matchedCat && Number(matchedCat.cap_bac) === 1) {
        // Parent Category selected (e.g. "Cà Phê", ID: 101)
        const childIds = allCategories
          .filter((c) => Number(c.ma_danh_muc_cha) === Number(matchedCat.id))
          .map((c) => Number(c.id))
        const childNames = allCategories
          .filter((c) => Number(c.ma_danh_muc_cha) === Number(matchedCat.id))
          .map((c) => String(c.label || '').trim().toLowerCase())

        result = result.filter((item) => {
          if (!item) return false
          const itemCat = String(item.category || '').trim().toLowerCase()
          const itemParent = String(item.parent_category || '').trim().toLowerCase()
          const itemCatId = Number(item.ma_danh_muc || item.category_code || 0)
          const itemParentId = Number(item.parent_category_id || item.ma_danh_muc_cha || 0)

          return (
            itemParent === selectedLower ||
            itemCat === selectedLower ||
            (matchedCat.id && itemParentId === Number(matchedCat.id)) ||
            (matchedCat.id && itemCatId === Number(matchedCat.id)) ||
            childIds.includes(itemCatId) ||
            childNames.includes(itemCat)
          )
        })
      } else if (matchedCat && Number(matchedCat.cap_bac) === 2) {
        // Child Category selected (e.g. "Americano")
        result = result.filter((item) => {
          if (!item) return false
          const itemCat = String(item.category || '').trim().toLowerCase()
          const itemCatId = Number(item.ma_danh_muc || item.category_code || 0)

          return (
            itemCat === selectedLower ||
            itemCatId === Number(matchedCat.id) ||
            String(item.category_code) === String(matchedCat.code)
          )
        })
      } else {
        // Fallback matching
        result = result.filter((item) => {
          if (!item) return false
          const itemCat = String(item.category || '').trim().toLowerCase()
          const itemParent = String(item.parent_category || '').trim().toLowerCase()
          return itemCat === selectedLower || itemParent === selectedLower
        })
      }
    }

    if (selectedStatusFilter === 'ACTIVE') {
      result = result.filter((item) => item && item.dang_ban)
    } else if (selectedStatusFilter === 'INACTIVE') {
      result = result.filter((item) => item && !item.dang_ban)
    }
    return result
  }, [filteredMenuItems, menuState?.items, menuKeyword, selectedCategoryFilter, selectedStatusFilter, categoriesState?.items])

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
    setFormError('')
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    if (savingMenu) return
    setFormError('')
    if (cancelEditMenu) cancelEditMenu()
    setIsModalOpen(false)
  }

  const handleFormSubmit = async (e) => {
    e.preventDefault()
    if (savingMenu) return
    setFormError('')
    try {
      const result = await saveMenu?.()
      if (result === false || result?.ok === false) {
        setFormError(result?.error || 'Không lưu được dữ liệu. Vui lòng kiểm tra các trường và thử lại.')
        return
      }
      setIsModalOpen(false)
    } catch (error) {
      setFormError(error.message || 'Không thể lưu. Dữ liệu bạn nhập vẫn được giữ lại.')
    }
  }

  const safeMenuForm = menuForm || {}

  return (
    <div className="menu-manage-container">
      {/* Full Width Product Data Table Card */}
      <div className="menu-list-card">
        {/* Toolbar & Filters */}
        <div className="workspace-section-title"><div><h2>Danh sách sản phẩm</h2><p>Tìm sản phẩm và cập nhật thông tin bán hàng.</p></div></div>
        <div className="menu-toolbar">
          <div className="menu-filter-pills">
              <button aria-pressed={selectedStatusFilter === 'ALL'}
                type="button"
                className={`menu-pill ${selectedStatusFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedStatusFilter('ALL')
                  if (setMenuPage) setMenuPage(1)
                }}
              >
                Tất cả
              </button>
              <button aria-pressed={selectedStatusFilter === 'ACTIVE'}
                type="button"
                className={`menu-pill ${selectedStatusFilter === 'ACTIVE' ? 'active' : ''}`}
                onClick={() => {
                  setSelectedStatusFilter('ACTIVE')
                  if (setMenuPage) setMenuPage(1)
                }}
              >
                Đang bán
              </button>
              <button aria-pressed={selectedStatusFilter === 'INACTIVE'}
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
          <div className="menu-filter-group">
          <div className="menu-search-box">
            <div className="menu-search-input-wrap">
              <input className="ui-input"
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
                  aria-label="Xóa tìm kiếm" className="menu-search-clear"
                  onClick={() => setMenuKeyword && setMenuKeyword('')}
                  title="Xóa tìm kiếm"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>


            {/* Filter Category Dropdown */}
            <div className="menu-filter-select-wrapper" style={{ minWidth: 240, width: 280, maxWidth: 320 }}>
              <SearchableSelect
                id="menu-category-filter"
                aria-label="Lọc theo danh mục"
                className="menu-filter-select"
                value={selectedCategoryFilter}
                onChange={(e) => {
                  const val = e?.target?.value ?? e
                  setSelectedCategoryFilter(val || 'ALL')
                  if (setMenuPage) setMenuPage(1)
                }}
                options={categoryFilterOptions}
                placeholder="Tất cả danh mục"
              />
            </div>

            {/* Filter Status Pills */}


            {loadMenu && (
              <button type="button" className="menu-refresh-btn" onClick={loadMenu} title="Tải lại danh sách">
                <RefreshCw size={15} />
                <span>Tải lại</span>
              </button>
            )}

            <button type="button" className="menu-btn menu-btn--success menu-btn--sm menu-create-btn" onClick={handleOpenAddModal}>
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
                      <th style={{ width: '28%' }}>Sản phẩm</th>
                      <th style={{ width: '17%' }}>Danh mục</th>
                      <th style={{ width: '13%' }}>Giá bán</th>
                      <th style={{ width: '15%' }}>Trạng thái</th>
                      <th style={{ width: '15%' }}>Nhãn đặc trưng</th>
                      <th style={{ width: '12%', textAlign: 'center' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.rows.filter(Boolean).map((item, index, array) => {
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
                          <td style={{ whiteSpace: 'nowrap', overflow: 'hidden' }}>
                            <span
                              className="menu-cat-badge"
                              title={
                                item.parent_category && item.category && item.parent_category.toLowerCase() !== item.category.toLowerCase()
                                  ? `${item.parent_category} › ${item.category}`
                                  : item.category || item.parent_category || ''
                              }
                            >
                              <Tag size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
                              <span>
                                {(() => {
                                  const cat = item.category || (categoriesState?.items || []).find((c) => Number(c.id) === Number(item.ma_danh_muc) || String(c.code) === String(item.category_code))?.label
                                  return cat || item.parent_category || 'Chưa phân loại'
                                })()}
                              </span>
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

                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'center' }}>
                              <button
                                type="button"
                                className="admin-table-action-btn btn-edit"
                                onClick={() => {
                                  if (startEditMenu) startEditMenu(item)
                                  setFormError('')
    setIsModalOpen(true)
                                }}
                                title="Chỉnh sửa sản phẩm"
                              >
                                <Edit3 size={15} />
                              </button>

                              <button
                                type="button"
                                className="admin-table-action-btn btn-delete"
                                onClick={() => {
                                  if (deleteMenu) deleteMenu(item.id)
                                }}
                                title="Xóa sản phẩm"
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
            <MenuPagination pageData={pageData} onPageChange={setMenuPage} />
          </>
        )}
      </div>

      {/* POPUP MODAL DIALOG FOR ADD / EDIT MENU ITEM */}
      {isModalOpen && (
        <WorkspaceDialog busy={savingMenu} label="Thêm hoặc chỉnh sửa sản phẩm" onClose={handleCloseModal} className="workspace-dialog--editor">
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
              <button type="button" disabled={savingMenu} aria-label="Đóng cửa sổ" className="menu-modal-close" onClick={handleCloseModal} title="Đóng">
                <X size={18} />
              </button>
            </div>

            {/* Modal Internal Tab Nav */}
            <div className="menu-modal-tabs">
              <button aria-pressed={modalActiveTab === 'basic'}
                type="button"
                className={`menu-modal-tab-btn ${modalActiveTab === 'basic' ? 'active' : ''}`}
                onClick={() => setModalActiveTab('basic')}
              >
                <Coffee size={15} />
                <span>Thông tin cơ bản</span>
              </button>
              <button aria-pressed={modalActiveTab === 'variants'}
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
              <button aria-pressed={modalActiveTab === 'image'}
                type="button"
                className={`menu-modal-tab-btn ${modalActiveTab === 'image' ? 'active' : ''}`}
                onClick={() => setModalActiveTab('image')}
              >
                <ImageIcon size={15} />
                <span>Hình ảnh sản phẩm</span>
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="menu-modal-body">
              {formError && <p className="workspace-form-error" role="alert">{formError}</p>}
              {/* TAB 1: BASIC INFORMATION */}
              {modalActiveTab === 'basic' && (
                <div className="menu-modal-section">
                  <div className="menu-form-grid">
                    {/* Item Name */}
                    <div className="menu-form-group menu-form-group--full">
                      <label htmlFor="menu-name-input">
                        Tên sản phẩm <span className="menu-required">*</span>
                      </label>
                      <input className="ui-input"
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
                      <SearchableSelect
                        id="menu-category-select"
                        value={safeMenuForm.category_code || ''}
                        placeholder="-- Chọn hoặc tìm danh mục --"
                        onChange={(e) => setMenuForm && setMenuForm((p) => ({ ...p, category_code: e?.target?.value ?? e }))}
                        options={modalCategoryOptions}
                        required
                      />
                    </div>

                    {/* Price (Selling) */}
                    <div className="menu-form-group">
                      <label htmlFor="menu-price-input">
                        Giá bán (VNĐ) <span className="menu-required">*</span>
                      </label>
                      <CurrencyInput
                        id="menu-price-input"
                        value={safeMenuForm.price ?? ''}
                        onChange={(e) => setMenuForm && setMenuForm((p) => ({ ...p, price: Number(e.target.value) }))}
                        placeholder="Ví dụ: 35.000"
                        required
                      />
                    </div>

                    {/* Original Price */}
                    <div className="menu-form-group">
                      <label htmlFor="menu-orig-price-input">Giá gốc niêm yết (VNĐ)</label>
                      <CurrencyInput
                        id="menu-orig-price-input"
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
                    <h4>Trạng thái và Nhãn hiển thị</h4>
                    <div className="menu-toggles-grid">
                      {/* Active Selling Toggle */}
                      <ShadcnCheckboxCard
                        id="chk-dang-ban"
                        title="Đang kinh doanh"
                        subtitle="Hiển thị sản phẩm trên menu khách đặt hàng"
                        checked={Boolean(safeMenuForm.dang_ban)}
                        onChange={(checked) => setMenuForm && setMenuForm((p) => ({ ...p, dang_ban: checked }))}
                      />

                      {/* Hot Item Toggle */}
                      <ShadcnCheckboxCard
                        id="chk-la-hot"
                        title="Gắn nhãn Hot"
                        icon={<WorkspaceSymbolFlame size="1.1em" aria-hidden="true" />}
                        subtitle="Đánh dấu món bán chạy nổi bật"
                        checked={Boolean(safeMenuForm.la_hot)}
                        onChange={(checked) => setMenuForm && setMenuForm((p) => ({ ...p, la_hot: checked }))}
                      />

                      {/* New Item Toggle */}
                      <ShadcnCheckboxCard
                        id="chk-la-moi"
                        title="Gắn nhãn Mới"
                        icon={<Sparkles size={14} aria-hidden="true" />}
                        subtitle="Đánh dấu món mới ra mắt"
                        checked={Boolean(safeMenuForm.la_moi)}
                        onChange={(checked) => setMenuForm && setMenuForm((p) => ({ ...p, la_moi: checked }))}
                      />
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
                              style={{
                                backgroundColor: "#ffffff", color: "#dc2626", border: "1px solid var(--border-light)",
                                borderRadius: '6px',
                                padding: '0.3rem 0.6rem',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem'
                              }}
                            >
                              <Trash2 size={13} color="#dc2626" />
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
                            <input className="ui-input"
                              type="text"
                              placeholder="Tên tùy chọn (VD: Size L, Trân châu đen)..."
                              value={newOptionState[attrName]?.name || ''}
                              onChange={(e) => handleOptionStateChange(attrName, 'name', e.target.value)}
                            />
                            <CurrencyInput
                              placeholder="Phụ thu (đ)..."
                              value={newOptionState[attrName]?.price || ''}
                              onChange={(e) => handleOptionStateChange(attrName, 'price', e.target.value)}
                            />
                            <button
                              type="button"
                              className="menu-btn menu-btn--success menu-btn--sm"
                              onClick={() => addOptionToGroup(attrName)}
                              style={{
                                background: "linear-gradient(135deg, var(--primary) 0%, var(--primary) 100%)",
                                color: '#ffffff',
                                border: 'none',
                                boxShadow: '0 2px 6px rgba(59, 130, 246, 0.25)'
                              }}
                            >
                              <Plus size={14} color="#ffffff" />
                              <span>Thêm tùy chọn</span>
                            </button>
                          </div>
                        </div>
                      ))
                    )}

                    {/* Section to add a new Attribute Group */}
                    <div className="menu-variant-add-group-card">
                      <h5>Thêm nhóm biến thể mới</h5>
                      <CreatableVariantGroupInput
                        existingGroups={safeMenuForm.bien_the || {}}
                        attributes={attributesState?.items || []}
                        onAddGroup={(name) => {
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
                        }}
                      />
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
                      <label className="menu-upload-dropzone" htmlFor="menu-file-upload-input">
                        <input className="ui-input"
                          id="menu-file-upload-input"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          style={{ display: 'none' }}
                          onChange={(e) => uploadMenuImage && uploadMenuImage(e.target.files?.[0]).catch(() => {})}
                        />
                        <div className="menu-upload-icon-circle">
                          <Upload size={22} className="menu-upload-icon" />
                        </div>
                        <span className="menu-upload-title">
                          {uploadState?.loading ? 'Đang tải ảnh...' : 'Nhấp vào đây hoặc kéo thả ảnh để tải lên'}
                        </span>
                        <div className="menu-upload-chip">
                          <Plus size={13} />
                          <span>Chọn tệp ảnh</span>
                        </div>
                        <small className="menu-upload-hint">
                          {safeMenuForm.name
                            ? `Tự động đặt tên: ${safeMenuForm.name}`
                            : 'Định dạng hỗ trợ: JPG, PNG, WEBP (Tối đa 5MB)'}
                        </small>
                      </label>
                      {uploadState?.error && <p className="menu-error-msg">{uploadState.error}</p>}
                      {uploadState?.success && <p className="menu-success-msg">{uploadState.success}</p>}
                    </div>

                    {/* Direct Image URL Input */}
                    <div className="menu-form-group">
                      <label htmlFor="menu-img-url-input">Hoặc nhập đường dẫn ảnh (URL)</label>
                      <input className="ui-input"
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
                            style={{
                              backgroundColor: "#ffffff", color: "#dc2626", border: "1px solid var(--border-light)",
                              borderRadius: '6px',
                              padding: '0.35rem 0.75rem',
                              fontWeight: '600',
                              cursor: 'pointer'
                            }}
                          >
                            <Trash2 size={13} color="#dc2626" />
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
                  className="menu-btn menu-btn--success"
                  disabled={savingMenu || !String(safeMenuForm.name || '').trim() || !safeMenuForm.category_code}
                  style={{
                    background: "#18181b",
                    color: '#ffffff',
                    border: '1px solid #18181b',
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
                  {savingMenu ? (
                    <>
                      <RefreshCw size={16} className="menu-spin-icon" color="#ffffff" />
                      <span>Đang lưu...</span>
                    </>
                  ) : editingMenuId ? (
                    <>
                      <Check size={16} color="#ffffff" />
                      <span>Lưu cập nhật</span>
                    </>
                  ) : (
                    <>
                      <Plus size={16} color="#ffffff" />
                      <span>Tạo món mới</span>
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

export function AdminMenuManagementPanel(props) {
  return (
    <PanelErrorBoundary>
      <AdminMenuManagementPanelContent {...props} />
    </PanelErrorBoundary>
  )
}
