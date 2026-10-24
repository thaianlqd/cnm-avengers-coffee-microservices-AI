import StatusBadge from '../../../components/console/StatusBadge'
import SearchableSelect from '../../../components/console/SearchableSelect'
import { Switch } from '../../../components/ui/switch'
import { Card } from '../../../components/ui/card'
import { Table } from '../../../components/ui/table'
import { Label } from '../../../components/ui/label'
import { WorkspacePanelIntro } from '../../../components/console/OperationalPageFrame'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Badge } from '../../../components/ui/badge'
import { PageNumbers } from '../../../components/console/CompactPagination'
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
} from '../../../components/console/WorkspaceIcons'
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
        const idMatch = String(item.ma_san_pham || '').toLowerCase().includes(q)
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

  return <div className="manager-menu">
    <WorkspacePanelIntro><div><h2>Quản lý thực đơn</h2><p>Bật hoặc tạm ngưng bán sản phẩm tại cửa hàng.</p></div></WorkspacePanelIntro>
    <div className="operation-toolbar menu-toolbar-clean">
      <Label className="operation-search" htmlFor="manager-menu-search"><Search size={16} /><Input id="manager-menu-search" placeholder="Tìm tên món, mã sản phẩm…" value={searchText} onChange={e => { setSearchText(e.target.value); setPage(1) }} />{searchText && <Button variant="ghost" size="icon" aria-label="Xóa tìm kiếm món" onClick={() => { setSearchText(''); setPage(1) }}><X size={14} /></Button>}</Label>
      <SearchableSelect aria-label="Danh mục món" value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1) }} options={categories.map(value => ({ value, label: value || 'Tất cả danh mục' }))} />
      <SearchableSelect aria-label="Trạng thái bán" value={filterSelling} onChange={e => { setFilterSelling(e.target.value); setPage(1) }} options={SELLING_STATUS_OPTIONS} />
      <div className="operation-tabs" aria-label="Cách hiển thị thực đơn"><Button variant="ghost" data-selected={viewMode === 'grid'} aria-pressed={viewMode === 'grid'} onClick={() => { setViewMode('grid'); setPage(1) }}><Grid size={15} />Thẻ</Button><Button variant="ghost" data-selected={viewMode === 'list'} aria-pressed={viewMode === 'list'} onClick={() => { setViewMode('list'); setPage(1) }}><List size={15} />Bảng</Button></div>
    </div>
    <div className="operation-list-caption"><span>{filtered.length} sản phẩm{hasFilter ? ` / ${itemsList.length} sản phẩm` : ''}</span>{hasFilter && <Button variant="ghost" data-intent="danger" onClick={resetFilters}>Xóa bộ lọc</Button>}</div>
    {inventoryState.loading ? <p role="status" className="operation-empty">Đang tải thực đơn…</p> : inventoryState.error ? <p role="alert" className="console-error">{inventoryState.error}</p> : !pageItems.length ? <p className="operation-empty">Không tìm thấy món phù hợp. Thử tên khác hoặc xóa bộ lọc.</p> : viewMode === 'grid' ? <div className="manager-menu-grid">{pageItems.map(item => {
      const isSaving = savingMenuStatusId === item.ma_san_pham
      return <Card key={item.ma_san_pham} className="manager-menu-product"><div className="menu-product-visual">{item.image ? <img src={item.image} alt={normalizeViText(item.name)} onError={e => { e.currentTarget.style.display = 'none' }} /> : <Coffee size={30} />}</div><div className="menu-product-copy"><span>{item.category || 'Khác'}</span><h3>{normalizeViText(item.name)}</h3><small>#{item.ma_san_pham}</small><strong>{fmtMoney(item.price)}</strong></div><div className="menu-product-selling"><StatusBadge status={Boolean(item.dang_ban)}>{item.dang_ban ? 'Đang bán' : 'Tạm ngưng'}</StatusBadge><Switch aria-label={`Bán ${normalizeViText(item.name)}`} checked={Boolean(item.dang_ban)} disabled={isSaving} onCheckedChange={() => handleToggle(item.ma_san_pham, item.dang_ban)} /></div>{isSaving && <small role="status">Đang cập nhật…</small>}</Card>
    })}</div> : <div className="operation-table-frame"><Table><thead><tr><th style={{width:'38%'}}>Sản phẩm</th><th>Danh mục</th><th>Giá bán</th><th>Trạng thái</th><th style={{width:'90px'}}>Mở bán</th></tr></thead><tbody>{pageItems.map(item => <tr key={item.ma_san_pham}><td><strong>{normalizeViText(item.name)}</strong><small>#{item.ma_san_pham}</small></td><td>{item.category || 'Khác'}</td><td>{fmtMoney(item.price)}</td><td><StatusBadge status={Boolean(item.dang_ban)}>{item.dang_ban ? 'Đang bán' : 'Tạm ngưng'}</StatusBadge></td><td><Switch aria-label={`Bán ${normalizeViText(item.name)}`} checked={Boolean(item.dang_ban)} disabled={savingMenuStatusId === item.ma_san_pham} onCheckedChange={() => handleToggle(item.ma_san_pham, item.dang_ban)} /></td></tr>)}</tbody></Table></div>}
    <nav className="operation-pagination" aria-label="Phân trang thực đơn"><span>Trang {safePage} trên {totalPages}</span><div><Button variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}><ChevronLeft size={14} />Trước</Button><PageNumbers page={safePage} totalPages={totalPages} onChange={setPage} /><Button variant="outline" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>Sau<ChevronRight size={14} /></Button></div></nav>
  </div>

}
