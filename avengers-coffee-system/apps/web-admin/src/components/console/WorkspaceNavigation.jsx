import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Coffee, ChevronDown, LogOut, Search, X, Menu } from 'lucide-react'
const SearchResults = lazy(() => import('./WorkspaceSearchResults'))

export function WorkspaceSearch({ items, onSelect }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const trigger = useRef(null)
  const close = () => { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    const onKey = event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setOpen(value => !value)
      }
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement
    return () => previous?.focus?.()
  }, [open])
  return <>
    <button ref={trigger} type="button" className="workspace-search-trigger" onClick={() => { setQuery(''); setOpen(true) }} aria-haspopup="dialog" aria-expanded={open}>
      <Search size={17} /><span>Tìm trang làm việc</span><kbd>⌘ K</kbd>
    </button>
    {open && <div className="workspace-search-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close() }}>
      <section className="workspace-search-dialog" role="dialog" aria-modal="true" aria-label="Tìm trang làm việc" onKeyDown={event => {
        if (event.key !== 'Tab') return
        const controls = Array.from(event.currentTarget.querySelectorAll('input,button')).filter(el => !el.disabled)
        const index = controls.indexOf(document.activeElement)
        if (event.shiftKey && index === 0) { event.preventDefault(); controls.at(-1)?.focus() }
        else if (!event.shiftKey && index === controls.length - 1) { event.preventDefault(); controls[0]?.focus() }
      }}>
        <div className="workspace-search-input"><Search size={19} /><input autoFocus placeholder="Nhập tên trang hoặc chức năng…" value={query} onChange={event => setQuery(event.target.value)} aria-label="Tên trang hoặc chức năng" /><button type="button" className="workspace-icon-button" aria-label="Đóng tìm kiếm" onClick={close}><X size={18} /></button></div>
        <Suspense fallback={<div className="workspace-loading" role="status"><span className="workspace-shimmer" />Đang tải điều hướng…</div>}>
          <SearchResults items={items} query={query} onSelect={id => { onSelect(id); close() }} />
        </Suspense>
        <footer>Tab để chọn · Enter để mở · Esc để đóng</footer>
      </section>
    </div>}
  </>
}

export function WorkspaceSidebar({ groups, activeTab, onSelect, session, label, onLogout, extra }) {
  const [collapseState, setCollapseState] = useState({ activeTab, groups: {} })
  const collapsed = collapseState.activeTab === activeTab ? collapseState.groups : {}
  const [mobileOpen, setMobileOpen] = useState(false)
  const user = session?.user || {}
  const name = user.hoTen || user.ho_ten || user.tenDangNhap || user.ten_dang_nhap || label
  return <>
    <button type="button" className="workspace-mobile-toggle workspace-icon-button" aria-label="Mở điều hướng" aria-expanded={mobileOpen} onClick={() => setMobileOpen(value => !value)}><Menu size={20} /></button>
    {mobileOpen && <div className="workspace-sidebar-backdrop" onClick={() => setMobileOpen(false)} />}
    <aside className={'console-sidebar workspace-sidebar' + (mobileOpen ? ' is-open' : '')}>
      <div className="console-brand"><span className="console-brand-icon"><Coffee size={21} /></span><div><b>Avengers Coffee</b><small>{label}</small></div></div>
      {extra}
      <nav aria-label={'Điều hướng ' + label}>
        {groups.map(group => <section className="workspace-nav-group" key={group.label}>
          <button type="button" className="workspace-nav-heading" aria-expanded={!collapsed[group.label]} onClick={() => setCollapseState({ activeTab, groups: { ...collapsed, [group.label]: !collapsed[group.label] } })}><span>{group.label}</span><ChevronDown size={14} className={collapsed[group.label] ? 'is-collapsed' : ''} /></button>
          {!collapsed[group.label] && <div className="workspace-nav-links">{group.items.map(item => {
            const Icon = item.icon || Coffee
            return <button type="button" className="console-nav-item" key={item.id} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => { onSelect(item.id); setMobileOpen(false) }}><Icon size={17} /><span>{item.label}</span></button>
          })}</div>}
        </section>)}
      </nav>
      <div className="workspace-sidebar-footer"><div className="console-user"><span className="console-avatar">{name.charAt(0).toUpperCase()}</span><div><b>{name}</b><small>{user.email || label}</small></div></div><button type="button" className="console-logout" onClick={onLogout}><LogOut size={16} />Đăng xuất</button></div>
    </aside>
  </>
}
