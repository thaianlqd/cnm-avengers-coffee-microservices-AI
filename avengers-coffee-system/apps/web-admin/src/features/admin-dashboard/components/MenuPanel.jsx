import React, { useMemo, useState } from 'react'
import {
  Coffee,
  Search,
  X,
  CheckCircle2,
  PauseCircle,
  Layers,
  Grid,
  List,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Utensils,
  Tag,
  ToggleLeft,
  ToggleRight,
  Filter,
  Sparkles,
  Check,
  DollarSign
} from 'lucide-react'
import { fmtMoney, normalizeViText } from '../utils'

const GRID_PAGE_SIZE = 12
const LIST_PAGE_SIZE = 8

const SELLING_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'selling', label: 'Đang bán' },
  { value: 'paused', label: 'Tạm ngưng' },
]

export function MenuPanel({
  inventoryState = { items: [], loading: false, error: null },
  savingMenuStatusId,
  onToggleSelling,
}) {
  const [searchText, setSearchText] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterSelling, setFilterSelling] = useState('')
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [page, setPage] = useState(1)

  const itemsList = inventoryState.items || []

  // Metrics summary
  const stats = useMemo(() => {
    let selling = 0
    let paused = 0
    const catSet = new Set()

    itemsList.forEach((item) => {
      if (item.dang_ban) selling++
      else paused++
      if (item.category) catSet.add(item.category)
      else catSet.add('Khác')
    })

    return {
      total: itemsList.length,
      selling,
      paused,
      categoryCount: catSet.size
    }
  }, [itemsList])

  // Category list
  const categories = useMemo(() => {
    const set = new Set(itemsList.map((i) => i.category || 'Khác'))
    return ['', ...Array.from(set).sort()]
  }, [itemsList])

  // Filtered items
  const filtered = useMemo(() => {
    return itemsList.filter((item) => {
      if (searchText) {
        const q = searchText.toLowerCase().trim()
        const nameMatch = normalizeViText(item.name || '').toLowerCase().includes(q)
        const catMatch = (item.category || '').toLowerCase().includes(q)
        const idMatch = (item.ma_san_pham || '').toLowerCase().includes(q)
        if (!nameMatch && !catMatch && !idMatch) return false
      }

      if (filterCategory && (item.category || 'Khác') !== filterCategory) return false
      if (filterSelling === 'selling' && !item.dang_ban) return false
      if (filterSelling === 'paused' && item.dang_ban) return false

      return true
    })
  }, [itemsList, searchText, filterCategory, filterSelling])

  const pageSize = viewMode === 'grid' ? GRID_PAGE_SIZE : LIST_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const hasFilter = Boolean(searchText || filterCategory || filterSelling)

  const resetFilters = () => {
    setSearchText('')
    setFilterCategory('')
    setFilterSelling('')
    setPage(1)
  }

  const handleToggle = (maSanPham, currentDangBan) => {
    onToggleSelling(maSanPham, !currentDangBan)
  }

  return (
    <div className="panel-container" style={{
      padding: '1.75rem',
      background: '#f8fafc',
      borderRadius: '20px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)'
    }}>
      {/* Header Bar & Title */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
          }}>
            <Coffee size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>
              Quản lý Thực Đơn
            </h2>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              Bật/tắt mở bán sản phẩm, theo dõi giá cả và danh mục thực đơn toàn quán
            </span>
          </div>
        </div>

        {/* View Mode Toggle Switch */}
        <div style={{
          display: 'flex',
          background: '#ffffff',
          padding: '0.25rem',
          borderRadius: '10px',
          border: '1px solid #e2e8f0'
        }}>
          <button
            type="button"
            onClick={() => { setViewMode('grid'); setPage(1); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'grid' ? '#10b981' : 'transparent',
              color: viewMode === 'grid' ? '#ffffff' : '#64748b',
              fontWeight: viewMode === 'grid' ? '700' : '500',
              fontSize: '0.825rem',
              cursor: 'pointer',
              boxShadow: viewMode === 'grid' ? '0 2px 4px rgba(16, 185, 129, 0.25)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <Grid size={16} /> Dạng thẻ
          </button>

          <button
            type="button"
            onClick={() => { setViewMode('list'); setPage(1); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              borderRadius: '8px',
              border: 'none',
              background: viewMode === 'list' ? '#10b981' : 'transparent',
              color: viewMode === 'list' ? '#ffffff' : '#64748b',
              fontWeight: viewMode === 'list' ? '700' : '500',
              fontSize: '0.825rem',
              cursor: 'pointer',
              boxShadow: viewMode === 'list' ? '0 2px 4px rgba(16, 185, 129, 0.25)' : 'none',
              transition: 'all 0.2s ease'
            }}
          >
            <List size={16} /> Dạng danh sách
          </button>
        </div>
      </div>

      {/* Summary Cards Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          background: '#ffffff',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#eff6ff',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Grid size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500' }}>Tổng số món</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#1e293b' }}>{stats.total} món</div>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#ecfdf5',
            color: '#059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500' }}>Đang mở bán</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#059669' }}>{stats.selling} món</div>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#fef2f2',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <PauseCircle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500' }}>Tạm ngưng bán</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#ef4444' }}>{stats.paused} món</div>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#e0e7ff',
            color: '#4f46e5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Layers size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500' }}>Số danh mục</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#4f46e5' }}>{stats.categoryCount} nhóm</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{
        background: '#ffffff',
        padding: '1rem 1.25rem',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        {/* Search Bar & Result Indicator */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '420px' }}>
            <Search
              size={18}
              color="#94a3b8"
              style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Tìm theo tên món, mã SP, danh mục..."
              value={searchText}
              onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem 0.55rem 2.4rem',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border 0.2s ease'
              }}
              onFocus={(e) => { e.target.style.borderColor = '#10b981' }}
              onBlur={(e) => { e.target.style.borderColor = '#cbd5e1' }}
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '0.2rem',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {hasFilter ? (
              <>
                <span style={{
                  background: '#ecfdf5',
                  color: '#047857',
                  fontWeight: '700',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '9999px',
                  border: '1px solid #a7f3d0'
                }}>
                  {filtered.length} / {itemsList.length} món
                </span>
                <button
                  type="button"
                  onClick={resetFilters}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    fontSize: '0.825rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    textDecoration: 'underline'
                  }}
                >
                  Xóa bộ lọc
                </button>
              </>
            ) : (
              <span>Hiển thị tất cả <strong>{itemsList.length}</strong> món</span>
            )}
          </div>
        </div>

        {/* Category & Status Filter Chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.85rem' }}>
          {/* Categories row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', minWidth: '70px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Tag size={13} color="#64748b" /> Danh mục:
            </span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {categories.map((cat) => {
                const isActive = filterCategory === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => { setFilterCategory(cat); setPage(1); }}
                    style={{
                      padding: '0.35rem 0.8rem',
                      borderRadius: '8px',
                      border: isActive ? '1px solid #10b981' : '1px solid #e2e8f0',
                      background: isActive ? '#ecfdf5' : '#ffffff',
                      color: isActive ? '#047857' : '#475569',
                      fontWeight: isActive ? '700' : '500',
                      fontSize: '0.825rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {cat === '' ? 'Tất cả danh mục' : cat}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', minWidth: '70px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Filter size={13} color="#64748b" /> Trạng thái:
            </span>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {SELLING_STATUS_OPTIONS.map((opt) => {
                const isActive = filterSelling === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setFilterSelling(opt.value); setPage(1); }}
                    style={{
                      padding: '0.35rem 0.8rem',
                      borderRadius: '8px',
                      border: isActive ? '1px solid #10b981' : '1px solid #e2e8f0',
                      background: isActive ? '#10b981' : '#ffffff',
                      color: isActive ? '#ffffff' : '#475569',
                      fontWeight: isActive ? '700' : '500',
                      fontSize: '0.825rem',
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {inventoryState.loading ? (
        <div style={{
          textAlign: 'center',
          padding: '3.5rem 1.5rem',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          color: '#64748b'
        }}>
          <RefreshCw size={32} color="#10b981" style={{ animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
          <h4 style={{ margin: '0 0 0.25rem 0', color: '#334155' }}>Đang tải danh sách thực đơn...</h4>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>Dữ liệu sản phẩm đang được cập nhật từ hệ thống.</p>
        </div>
      ) : inventoryState.error ? (
        <div style={{
          textAlign: 'center',
          padding: '2.5rem 1.5rem',
          background: '#fef2f2',
          borderRadius: '16px',
          border: '1px solid #fecaca',
          color: '#b91c1c'
        }}>
          <AlertCircle size={36} style={{ marginBottom: '0.5rem' }} />
          <h4 style={{ margin: '0 0 0.5rem 0' }}>Không thể tải danh sách thực đơn</h4>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>{inventoryState.error}</p>
        </div>
      ) : pageItems.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3.5rem 1.5rem',
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px dashed #cbd5e1'
        }}>
          <AlertCircle size={40} color="#94a3b8" style={{ marginBottom: '0.75rem' }} />
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#334155', fontSize: '1.1rem' }}>Không tìm thấy sản phẩm phù hợp</h4>
          <p style={{ margin: '0 0 1.25rem 0', color: '#64748b', fontSize: '0.875rem' }}>
            Vui lòng thử tìm với từ khóa khác hoặc xóa bộ lọc danh mục/trạng thái.
          </p>
          {hasFilter && (
            <button
              type="button"
              onClick={resetFilters}
              style={{
                background: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                padding: '0.6rem 1.2rem',
                fontSize: '0.85rem',
                fontWeight: '700',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)'
              }}
            >
              Xóa bộ lọc
            </button>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID VIEW */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '1.25rem'
        }}>
          {pageItems.map((item) => {
            const isSaving = savingMenuStatusId === item.ma_san_pham
            return (
              <div
                key={item.ma_san_pham}
                style={{
                  background: item.dang_ban ? '#ffffff' : '#fafafa',
                  border: item.dang_ban ? '1px solid #e2e8f0' : '1px dashed #cbd5e1',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  boxShadow: item.dang_ban ? '0 4px 6px -1px rgba(0, 0, 0, 0.03)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  opacity: item.dang_ban ? 1 : 0.85
                }}
              >
                {/* Top Category Badge & Status Pill */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    color: '#4f46e5',
                    background: '#e0e7ff',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '6px'
                  }}>
                    {item.category || 'Khác'}
                  </span>

                  <span style={{
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '9999px',
                    background: item.dang_ban ? '#d1fae5' : '#fee2e2',
                    color: item.dang_ban ? '#047857' : '#b91c1c',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}>
                    {item.dang_ban ? <CheckCircle2 size={12} /> : <PauseCircle size={12} />}
                    {item.dang_ban ? 'Đang bán' : 'Tạm ngưng'}
                  </span>
                </div>

                {/* Product Info */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: item.dang_ban ? '#eff6ff' : '#f1f5f9',
                      color: item.dang_ban ? '#2563eb' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Coffee size={20} />
                    </div>
                    <div>
                      <h3 style={{
                        margin: 0,
                        fontSize: '1.05rem',
                        fontWeight: '700',
                        color: '#0f172a',
                        lineHeight: 1.3
                      }}>
                        {normalizeViText(item.name)}
                      </h3>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500' }}>
                        Mã SP: #{item.ma_san_pham}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#059669', marginTop: '0.4rem' }}>
                    {fmtMoney(item.price)}
                  </div>
                </div>

                {/* Toggle Status Action Button */}
                <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    onClick={() => handleToggle(item.ma_san_pham, item.dang_ban)}
                    disabled={isSaving}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.85rem',
                      borderRadius: '10px',
                      border: 'none',
                      background: item.dang_ban ? '#ef4444' : '#10b981',
                      color: '#ffffff',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      boxShadow: item.dang_ban
                        ? '0 2px 4px rgba(239, 68, 68, 0.2)'
                        : '0 2px 4px rgba(16, 185, 129, 0.25)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw size={15} style={{ animation: 'spin 1s linear infinite' }} /> Đang lưu...
                      </>
                    ) : item.dang_ban ? (
                      <>
                        <ToggleRight size={18} /> Tạm ngưng món này
                      </>
                    ) : (
                      <>
                        <ToggleLeft size={18} /> Mở bán món này
                      </>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div style={{
          background: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)'
        }}>
          {pageItems.map((item, idx) => {
            const isSaving = savingMenuStatusId === item.ma_san_pham
            return (
              <div
                key={item.ma_san_pham}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  padding: '1rem 1.25rem',
                  borderBottom: idx < pageItems.length - 1 ? '1px solid #f1f5f9' : 'none',
                  background: item.dang_ban ? '#ffffff' : '#fafafa'
                }}
              >
                {/* Left product details */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '10px',
                    background: item.dang_ban ? '#eff6ff' : '#f1f5f9',
                    color: item.dang_ban ? '#2563eb' : '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Coffee size={20} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                        {normalizeViText(item.name)}
                      </h3>
                      <span style={{
                        fontSize: '0.725rem',
                        fontWeight: '700',
                        color: '#4f46e5',
                        background: '#e0e7ff',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '6px'
                      }}>
                        {item.category || 'Khác'}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.775rem', color: '#94a3b8' }}>
                      Mã SP: #{item.ma_san_pham}
                    </span>
                  </div>
                </div>

                {/* Right Price & Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#059669' }}>
                    {fmtMoney(item.price)}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggle(item.ma_san_pham, item.dang_ban)}
                    disabled={isSaving}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: item.dang_ban ? '#ef4444' : '#10b981',
                      color: '#ffffff',
                      fontSize: '0.825rem',
                      fontWeight: '700',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: item.dang_ban ? '0 2px 4px rgba(239, 68, 68, 0.2)' : '0 2px 4px rgba(16, 185, 129, 0.2)',
                      transition: 'all 0.2s ease',
                      minWidth: '130px',
                      justifyContent: 'center'
                    }}
                  >
                    {isSaving ? (
                      <>
                        <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Đang lưu...
                      </>
                    ) : item.dang_ban ? (
                      <>
                        <ToggleRight size={16} /> Tạm ngưng
                      </>
                    ) : (
                      <>
                        <ToggleLeft size={16} /> Mở bán
                      </>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          marginTop: '1.5rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid #e2e8f0',
          flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Hiển thị <strong>{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)}</strong> trên <strong>{filtered.length}</strong> món
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: safePage === 1 ? '#cbd5e1' : '#334155',
                fontSize: '0.825rem',
                fontWeight: '600',
                cursor: safePage === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronLeft size={16} /> Trước
            </button>

            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    border: 'none',
                    background: safePage === p ? '#10b981' : 'transparent',
                    color: safePage === p ? '#ffffff' : '#64748b',
                    fontWeight: safePage === p ? '700' : '500',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: safePage === totalPages ? '#cbd5e1' : '#334155',
                fontSize: '0.825rem',
                fontWeight: '600',
                cursor: safePage === totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Tiếp <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
