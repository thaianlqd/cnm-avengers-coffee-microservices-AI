import { normalizeSearch } from './smartSelectModel'
export default function WorkspaceSearchResults({ items, query, onSelect }) {
  const needle = normalizeSearch(query)
  const matches = items.filter(item => normalizeSearch(item.label + ' ' + (item.group || '')).includes(needle))
  return <div className="workspace-search-results">
    <p>{needle ? `${matches.length} trang phù hợp` : 'Các trang trong không gian của bạn'}</p>
    {matches.length ? matches.map(item => {
      const Icon = item.icon
      return <button type="button" key={item.id} onClick={() => onSelect(item.id)}>{Icon && <Icon size={18} />}<span>{item.label}<small>{item.group}</small></span><span className="workspace-search-enter">↵</span></button>
    }) : <div className="workspace-search-empty">Không tìm thấy trang. Thử tên chức năng như “đơn hàng” hoặc “lịch làm”.</div>}
  </div>
}
