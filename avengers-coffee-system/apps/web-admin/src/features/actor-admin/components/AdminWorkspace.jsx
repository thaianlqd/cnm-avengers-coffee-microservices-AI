import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Coffee, LogOut, Menu, ShieldCheck, X } from '../../../components/console/WorkspaceIcons'
import { WorkspaceSearch } from '../../../components/console/WorkspaceNavigation'
import { AdminNotificationBell } from '../../shared/components/AdminNotificationBell'
import { TopbarUserDropdown } from '../../shared/components/UserProfileModals'
import '../styles/AdminWorkspace.css'

const descriptions = {
  overview: 'Theo dõi hoạt động và những số liệu mới nhất của hệ thống.',
  categories: 'Sắp xếp danh mục chính và danh mục phụ cho sản phẩm.',
  menu: 'Quản lý sản phẩm, giá bán, hình ảnh và các tùy chọn đặt món.',
  promotions: 'Quản lý mã ưu đãi và quy tắc phát voucher tự động.',
  customers: 'Quản lý hồ sơ, trạng thái tài khoản và điểm thành viên.',
  'membership-config': 'Thiết lập hạng thành viên, quyền lợi và vòng quay may mắn.',
  'survey-manage': 'Quản lý biểu mẫu khảo sát, xem phản hồi và kết quả phân tích.',
  branches: 'Quản lý thông tin chi nhánh và xem đánh giá của khách hàng.',
  shippers: 'Quản lý nhân viên giao hàng, phân công và hoạt động giao nhận.',
  kiosks: 'Theo dõi và quản lý mạng lưới kiosk nhượng quyền.',
  users: 'Quản lý nhân viên, phân quyền vai trò và cơ sở làm việc.',
  smtp: 'Thiết lập máy chủ gửi thư, kiểm tra kết nối và nội dung email.',
}

export function AdminWorkspace({ groups, activeTab, onSelect, session, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const nav = useRef(null)
  const toggle = useRef(null)
  const heading = useRef(null)
  const previousTab = useRef(activeTab)
  const restoreNavFocus = useRef(false)
  const user = session?.user || {}
  const name = user.hoTen || user.ho_ten || user.tenDangNhap || user.ten_dang_nhap || 'Quản trị viên'
  const group = groups.find(item => item.items.some(page => page.id === activeTab)) || groups[0]
  const page = group.items.find(item => item.id === activeTab) || group.items[0]
  const Icon = page.icon || Coffee
  const closeMenu = () => { restoreNavFocus.current = true; setMobileOpen(false) }

  useEffect(() => {
    if (!mobileOpen && restoreNavFocus.current) {
      toggle.current?.focus()
      restoreNavFocus.current = false
    }
  }, [mobileOpen])

  useEffect(() => {
    if (previousTab.current !== activeTab) {
      heading.current?.focus({ preventScroll: true })
      previousTab.current = activeTab
    }
  }, [activeTab])

  useEffect(() => {
    if (!mobileOpen) return
    const sidebar = nav.current
    sidebar?.querySelector('[aria-current="page"]')?.focus()
    const onKey = event => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        restoreNavFocus.current = true
        setMobileOpen(false)
      }
      if (event.key !== 'Tab') return
      const controls = [...sidebar.querySelectorAll('button')].filter(button => button.getClientRects().length && !button.disabled)
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus() }
    }
    const media = window.matchMedia('(min-width: 1101px)')
    const onResize = () => { if (media.matches) setMobileOpen(false) }
    media.addEventListener('change', onResize)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); media.removeEventListener('change', onResize) }
  }, [mobileOpen])

  const selectPage = id => {
    restoreNavFocus.current = false
    const section = groups.find(item => item.items.some(destination => destination.id === id))
    if (section) setCollapsed(value => ({ ...value, [section.label]: false }))
    onSelect(id)
    setMobileOpen(false)
  }

  return <div className="console-shell admin-workspace" data-actor="admin">
    <a className="admin-skip-link" href="#admin-page-title">Đến nội dung chính</a>
    {mobileOpen && <div className="admin-nav-backdrop" onClick={closeMenu} aria-hidden="true" />}
    <aside ref={nav} id="admin-navigation" className={`admin-sidebar workspace-sidebar${mobileOpen ? ' is-open' : ''}`} aria-label="Điều hướng quản trị">
      <div className="admin-brand">
        <span className="admin-brand-mark"><img src="/images/logo-white.png" alt="" /></span>
        <div><b>Avengers Coffee</b><span>Không gian quản trị</span></div>
        <button className="admin-mobile-close" type="button" onClick={closeMenu} aria-label="Đóng điều hướng"><X size={20} /></button>
      </div>
      <div className="admin-workspace-label"><ShieldCheck size={17} /><span>Quản trị hệ thống</span></div>
      <nav aria-label="Chức năng admin">
        {groups.map(section => <section className="admin-nav-group" key={section.label}>
          <button type="button" className="admin-nav-heading" aria-expanded={!collapsed[section.label]} onClick={() => setCollapsed(value => ({ ...value, [section.label]: !value[section.label] }))}>
            <span>{section.label}</span><ChevronDown size={13} className={collapsed[section.label] ? 'is-collapsed' : ''} />
          </button>
          {!collapsed[section.label] && <div className="admin-nav-items">{section.items.map(item => {
            const ItemIcon = item.icon || Coffee
            return <button type="button" className="admin-nav-item console-nav-item" key={item.id} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => selectPage(item.id)}>
              <ItemIcon size={19} /><span>{item.label}</span>{activeTab === item.id && <span className="admin-nav-dot" />}
            </button>
          })}</div>}
        </section>)}
      </nav>
      <footer className="admin-sidebar-footer">
        <div className="admin-user"><span className="admin-user-avatar">{name.charAt(0).toUpperCase()}</span><div><b>{name}</b><small>Quản trị viên</small></div><button type="button" onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={18} /></button></div>
      </footer>
    </aside>
    <main className="console-main admin-main" inert={mobileOpen || undefined}>
      <header className="admin-topbar">
        <div className="admin-topbar-start">
          <button ref={toggle} type="button" className="admin-menu-toggle" aria-controls="admin-navigation" aria-expanded={mobileOpen} aria-label="Mở điều hướng" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
          <div className="admin-breadcrumb"><span>Quản trị</span><ChevronRight size={13} /><span>{group.label}</span><ChevronRight size={13} /><b>{page.label}</b></div>
        </div>
        <div className="admin-topbar-actions"><WorkspaceSearch items={groups.flatMap(section => section.items.map(item => ({ ...item, group: section.label })))} onSelect={selectPage} /><span className="admin-topbar-divider" /><AdminNotificationBell session={session} /><TopbarUserDropdown session={session} onLogout={onLogout} /></div>
      </header>
      <div key={activeTab} className="console-admin-body admin-page-scroll" data-screen={activeTab}>
        <div className="admin-page">
          <div className="admin-page-heading"><div className="admin-page-icon"><Icon size={23} /></div><div><div className="admin-page-overline">{group.label}</div><h1 ref={heading} id="admin-page-title" tabIndex={-1}>{page.label}</h1><p>{descriptions[activeTab]}</p></div></div>
          <div className="admin-page-content">{children}</div>
          <footer className="admin-page-footer"><span>Avengers Coffee</span><span>Quản trị hệ thống</span></footer>
        </div>
      </div>
    </main>
  </div>
}
