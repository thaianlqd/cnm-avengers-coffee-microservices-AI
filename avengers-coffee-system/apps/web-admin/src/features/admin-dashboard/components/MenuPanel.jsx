import { useMemo, useState } from 'react'
import { fmtMoney, normalizeViText } from '../utils'

const PAGE_SIZE = 8

const SELLING_STATUS_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'selling', label: '🟢 Đang bán' },
  { value: 'paused', label: '🔴 Tạm ngưng' },
]

export function MenuPanel({
  inventoryState,
  savingMenuStatusId,
  onToggleSelling,
}) {
  const [searchText, setSearchText] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterSelling, setFilterSelling] = useState('')
  const [page, setPage] = useState(1)

  const categories = useMemo(() => {
    const set = new Set(inventoryState.items.map((i) => i.category || 'Khác'))
    return ['', ...Array.from(set).sort()]
  }, [inventoryState.items])

  const filtered = useMemo(() => {
    setPage(1)
    return inventoryState.items.filter((item) => {
      if (searchText) {
        const q = searchText.toLowerCase()
        if (
          !normalizeViText(item.name).toLowerCase().includes(q) &&
          !(item.category || '').toLowerCase().includes(q)
        )
          return false
      }
      if (filterCategory && (item.category || 'Khác') !== filterCategory) return false
      if (filterSelling === 'selling' && !item.dang_ban) return false
      if (filterSelling === 'paused' && item.dang_ban) return false
      return true
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryState.items, searchText, filterCategory, filterSelling])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const hasFilter = searchText || filterCategory || filterSelling
  const resetFilters = () => {
    setSearchText('')
    setFilterCategory('')
    setFilterSelling('')
    setPage(1)
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Quản lý thực đơn</h2>
        <span>Bật / tắt bán từng món. Dữ liệu thật từ hệ thống.</span>
      </div>

      {/* ── Filter bar ── */}
      <div className="orders-filter-bar">
        <div className="ofb-search-row">
          <div className="ofb-search-wrap">
            <svg className="ofb-search-icon" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              className="ofb-search-input"
              type="text"
              placeholder="Tìm tên món, danh mục..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
            {searchText && (
              <button className="ofb-clear-btn" type="button" onClick={() => setSearchText('')}>×</button>
            )}
          </div>
          <div className="ofb-result-count">
            {hasFilter ? (
              <>
                <span className="ofb-count-badge">{filtered.length}</span>
                <span>/ {inventoryState.items.length} món</span>
                <button className="ofb-reset-link" type="button" onClick={resetFilters}>Xóa bộ lọc</button>
              </>
            ) : (
              <span>{inventoryState.items.length} món</span>
            )}
          </div>
        </div>

        <div className="ofb-filter-rows">
          <div className="ofb-filter-group">
            <span className="ofb-group-label">Danh mục</span>
            <div className="ofb-chips">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className={`ofb-chip ${filterCategory === cat ? 'ofb-chip--active' : ''}`}
                  onClick={() => setFilterCategory(cat)}
                >
                  {cat === '' ? 'Tất cả' : cat}
                </button>
              ))}
            </div>
          </div>
          <div className="ofb-filter-group">
            <span className="ofb-group-label">Trạng thái</span>
            <div className="ofb-chips">
              {SELLING_STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`ofb-chip ${filterSelling === opt.value ? 'ofb-chip--active' : ''}`}
                  onClick={() => setFilterSelling(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* ── End filter bar ── */}

      <div className="menu-table">
        {inventoryState.loading ? (
          <div className="ofb-loading"><span className="ofb-spinner" />Đang tải thực đơn...</div>
        ) : null}
        {inventoryState.error ? <p className="error-text">{inventoryState.error}</p> : null}
        {!inventoryState.loading && !inventoryState.error && pageItems.length === 0 ? (
          <div className="ofb-empty">
            <span>🔍</span>
            <p>{hasFilter ? 'Không có món khớp bộ lọc.' : 'Chưa có món nào.'}</p>
            {hasFilter && <button className="ofb-reset-link" type="button" onClick={resetFilters}>Xóa bộ lọc</button>}
          </div>
        ) : null}

        {pageItems.map((item) => (
          <article key={item.ma_san_pham} className={`menu-item-row ${item.dang_ban ? '' : 'menu-item-row--paused'}`}>
            <div className="menu-item-info">
              <div className="menu-item-name-row">
                <h3>{normalizeViText(item.name)}</h3>
                <span className={`menu-sell-badge ${item.dang_ban ? 'menu-sell-badge--on' : 'menu-sell-badge--off'}`}>
                  {item.dang_ban ? 'Đang bán' : 'Tạm ngưng'}
                </span>
              </div>
              <p className="menu-item-meta">
                Mã SP: {item.ma_san_pham}
                <span className="menu-cat-tag">{item.category || 'Khác'}</span>
                <strong className="menu-price">{fmtMoney(item.price)}</strong>
              </p>
            </div>
            <div className="menu-status-control">
              <label htmlFor={`sell-status-${item.ma_san_pham}`} className="menu-status-label">Trạng thái bán</label>
              <select
                id={`sell-status-${item.ma_san_pham}`}
                className="menu-status-select"
                value={item.dang_ban ? 'selling' : 'paused'}
                onChange={(e) => onToggleSelling(item.ma_san_pham, e.target.value === 'selling')}
                disabled={savingMenuStatusId === item.ma_san_pham}
              >
                <option value="selling">🟢 Đang bán</option>
                <option value="paused">🔴 Tạm ngưng bán</option>
              </select>
              {savingMenuStatusId === item.ma_san_pham && (
                <span className="menu-saving-tag">Đang lưu...</span>
              )}
            </div>
          </article>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination-bar">
          <button
            className="pg-btn"
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >‹ Trước</button>
          <div className="pg-pages">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                className={`pg-num ${safePage === p ? 'pg-num--active' : ''}`}
                onClick={() => setPage(p)}
              >{p}</button>
            ))}
          </div>
          <button
            className="pg-btn"
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
          >Tiếp ›</button>
          <span className="pg-info">{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} / {filtered.length}</span>
        </div>
      )}
    </section>
  )
}
