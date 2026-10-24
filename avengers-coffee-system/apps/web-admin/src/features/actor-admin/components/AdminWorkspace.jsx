import { WorkspacePageContext } from '../../../components/console/WorkspacePageContext'
import { Button } from '../../../components/ui/button'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Coffee, LogOut, ShieldCheck } from '../../../components/console/WorkspaceIcons'
import { WorkspaceSearch } from '../../../components/console/WorkspaceNavigation'
import { AdminNotificationBell } from '../../shared/components/AdminNotificationBell'
import { TopbarUserDropdown } from '../../shared/components/UserProfileModals'
import '../styles/AdminWorkspace.css'
import '../styles/AdminEnterprise.css'

const descriptions = {
  'flash-sales': 'Thiết lập sản phẩm flash sale và lịch ưu đãi trên trang đặt hàng.',
  'product-ranking': 'Điều chỉnh tiêu chí và xem 5 món được gợi ý theo dữ liệu mua hàng.',
  overview: 'Theo dõi hoạt động và những số liệu mới nhất của hệ thống.',
  categories: 'Sắp xếp danh mục chính và danh mục phụ cho thực đơn món.',
  menu: 'Quản lý sản phẩm, giá bán, hình ảnh và các tùy chọn đặt món.',
  promotions: 'Quản lý voucher công khai và voucher dành cho thành viên hệ thống.',
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
  const [detailPage, setDetailPage] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const nav = useRef(null)
  const heading = useRef(null)
  const previousTab = useRef(activeTab)
  const user = session?.user || {}
  const name = user.hoTen || user.ho_ten || user.tenDangNhap || user.ten_dang_nhap || 'Quản trị viên'
  const group = groups.find(item => item.items.some(page => page.id === activeTab)) || groups[0]
  const page = group.items.find(item => item.id === activeTab) || group.items[0]
  const Icon = page.icon || Coffee

  useEffect(() => {
    if (previousTab.current !== activeTab) {
      heading.current?.focus({ preventScroll: true })
      previousTab.current = activeTab
    }
  }, [activeTab])

  const selectPage = id => {
    const section = groups.find(item => item.items.some(destination => destination.id === id))
    if (section) setCollapsed(value => ({ ...value, [section.label]: false }))
    onSelect(id)
  }

  return <div className="console-shell admin-workspace admin-enterprise" data-actor="admin">
    <a className="admin-skip-link" href="#admin-page-title">Đến nội dung chính</a>
    <aside ref={nav} id="admin-navigation" className="admin-sidebar workspace-sidebar" aria-label="Điều hướng quản trị">
      <div className="admin-brand">
        <span className="admin-brand-mark">
          <img
            src="/images/brand/logo-white.svg"

            alt="Avengers Coffee"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </span>
        <div className="admin-brand-text">
          <b>Avengers Coffee</b>
          <span>Không gian quản trị</span>
        </div>
      </div>
      <div className="admin-workspace-label">
        <ShieldCheck size={16} />
        <span>Quản trị hệ thống</span>
      </div>
      <nav aria-label="Chức năng admin">
        {groups.map(section => <section className="admin-nav-group" key={section.label}>
          <Button type="button" className="admin-nav-heading" aria-expanded={!collapsed[section.label]} onClick={() => setCollapsed(value => ({ ...value, [section.label]: !value[section.label] }))}>
            <span>{section.label}</span><ChevronDown size={13} className={collapsed[section.label] ? 'is-collapsed' : ''} />
          </Button>
          {!collapsed[section.label] && <div className="admin-nav-items">{section.items.map(item => {
            const ItemIcon = item.icon || Coffee
            return <Button type="button" className="admin-nav-item console-nav-item" key={item.id} aria-current={activeTab === item.id ? 'page' : undefined} onClick={() => selectPage(item.id)}>
              <ItemIcon size={18} /><span>{item.label}</span>{activeTab === item.id && <span className="admin-nav-dot" />}
            </Button>
          })}</div>}
        </section>)}
      </nav>
      <footer className="admin-sidebar-footer">
        <div className="admin-user">
          <span className="admin-user-avatar">{name.charAt(0).toUpperCase()}</span>
          <div className="admin-user-meta">
            <b>{name}</b>
            <small>Quản trị viên</small>
          </div>
          <Button type="button" onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất" className="admin-logout-btn">
            <LogOut size={16} />
          </Button>
        </div>
      </footer>
    </aside>
    <main className="console-main admin-main">
      <header className="admin-topbar">
        <div className="admin-topbar-start">
          <nav aria-label="Breadcrumb" className="admin-breadcrumb">
            <span className="admin-breadcrumb-root">Quản trị</span>
            <ChevronRight size={13} className="admin-breadcrumb-sep" />
            <span className="admin-breadcrumb-group">{group.label}</span>
            <ChevronRight size={13} className="admin-breadcrumb-sep" />
            <b className="admin-breadcrumb-page">{page.label}</b>
            {detailPage && (
              <>
                <ChevronRight size={13} className="admin-breadcrumb-sep" />
                <b className="admin-breadcrumb-page">{detailPage.title}</b>
              </>
            )}
          </nav>
        </div>
        <div className="admin-topbar-actions">
          <WorkspaceSearch items={groups.flatMap(section => section.items.map(item => ({ ...item, group: section.label })))} onSelect={selectPage} />
          <span className="admin-topbar-divider" />
          <AdminNotificationBell session={session} />
          <TopbarUserDropdown session={session} onLogout={onLogout} />
        </div>
      </header>
      <WorkspacePageContext.Provider value={setDetailPage}>
        <div key={activeTab} className="console-admin-body admin-page-scroll" data-screen={activeTab}>
          <div className="admin-page">
            <div className="admin-page-heading">
              <div className="admin-page-icon"><Icon size={22} /></div>
              <div className="admin-page-heading-text">
                <h1 ref={heading} id="admin-page-title" tabIndex={-1}>{detailPage?.title || page.label}</h1>
                <p>{detailPage?.description || descriptions[activeTab]}</p>
              </div>
            </div>
            <div className="admin-page-content">{children}</div>
            <footer className="admin-page-footer">
              <span>Avengers Coffee · Nền tảng quản trị thông minh</span>
              <span>Phiên bản Enterprise</span>
            </footer>
          </div>
        </div>
      </WorkspacePageContext.Provider>
    </main>
  </div>
}
