import { useEffect, useMemo, useState } from 'react'
import { useSystemAdmin } from '../hooks/useSystemAdmin'
import { AiAnalyticsPanel } from './AiAnalyticsPanel'
import { SystemOpsPanel } from './SystemOpsPanel'
import { AdminShipperPanel } from './AdminShipperPanel'
import { AccountCenterPanel } from '../../shared/components/AccountCenterPanel'
import { AdminNotificationBell } from '../../shared/components/AdminNotificationBell'
import { ManagerSurveyPanel } from '../../manager-dashboard/components/ManagerSurveyPanel'
import { AdminMembershipConfigPanel } from './AdminMembershipConfigPanel'
import { BranchDetailReviewsView } from './BranchDetailReviewsView'

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('vi-VN')
}

function fmtDateShort(value) {
  if (!value) return '---'
  try { return new Date(value).toLocaleDateString('vi-VN') } catch { return String(value) }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const PROMOTION_TYPE_LABELS = { PERCENT: 'Giảm %', FIXED: 'Giảm tiền', FREE_ITEM: 'Tặng kèm' }
const PROMOTION_STATUS_LABELS = { ACTIVE: 'Hiệu lực', INACTIVE: 'Tạm dừng', EXPIRED: 'Hết hạn' }
const PAGE_SIZE = 8
const ADMIN_LOCAL_NOTIFY_EVENT = 'avengers-admin-local-notify'

function buildPage(items = [], page = 1, pageSize = PAGE_SIZE) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(Number(page || 1), 1), totalPages)
  const start = (safePage - 1) * pageSize
  const end = start + pageSize
  return {
    rows: items.slice(start, end),
    total,
    totalPages,
    page: safePage,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(end, total),
  }
}

function Pagination({ pageData, onPageChange }) {
  if (!pageData || pageData.total <= PAGE_SIZE) return null
  return (
    <div className="system-admin-pagination">
      <span>Hiển thị {pageData.from}-{pageData.to} / {pageData.total}</span>
      <div>
        <button type="button" className="secondary" onClick={() => onPageChange(1)} disabled={pageData.page <= 1}>Đầu</button>
        <button type="button" className="secondary" onClick={() => onPageChange(pageData.page - 1)} disabled={pageData.page <= 1}>Trước</button>
        <strong>Trang {pageData.page}/{pageData.totalPages}</strong>
        <button type="button" className="secondary" onClick={() => onPageChange(pageData.page + 1)} disabled={pageData.page >= pageData.totalPages}>Sau</button>
        <button type="button" className="secondary" onClick={() => onPageChange(pageData.totalPages)} disabled={pageData.page >= pageData.totalPages}>Cuối</button>
      </div>
    </div>
  )
}

export function AdminSystemConsole({
  session,
  onLogout,
  surveysState,
  surveyResponsesState,
  onKichHoatForm,
  onTaoForm,
  onSuaForm,
  onXoaForm,
  onTaiForms,
  onTaiResponses,
}) {
  const [adminToast, setAdminToast] = useState(null)
  const [usersPage, setUsersPage] = useState(1)
  const [customersPage, setCustomersPage] = useState(1)
  const [branchesPage, setBranchesPage] = useState(1)
  const [categoriesPage, setCategoriesPage] = useState(1)
  const [categoryKeyword, setCategoryKeyword] = useState('')
  const [menuPage, setMenuPage] = useState(1)
  const [menuKeyword, setMenuKeyword] = useState('')
  const [promotionsPage, setPromotionsPage] = useState(1)

  const {
    activeTab,
    setActiveTab,
    statsState,
    roleChartRows,
    branchChartRows,
    dashboardSummary,
    userFilters,
    setUserFilters,
    customerFilters,
    setCustomerFilters,
    branchesState,
    branchOptions,
    cityOptions,
    districtOptions,
    wardOptions,
    locationSearch,
    setLocationSearch,
    branchAddressPreview,
    usersState,
    loadUsers,
    customersState,
    loadCustomers,
    branchForm,
    setBranchForm,
    editingBranchCode,
    startEditBranch,
    cancelEditBranch,
    saveBranch,
    deleteBranch,
    savingBranch,
    userForm,
    setUserForm,
    editingUserId,
    startEditUser,
    cancelEditUser,
    saveUser,
    deleteUser,
    savingUser,
    customerForm,
    setCustomerForm,
    editingCustomerId,
    startEditCustomer,
    cancelEditCustomer,
    saveCustomer,
    deleteCustomer,
    savingCustomer,
    categoriesState,
    categoryForm,
    setCategoryForm,
    editingCategoryId,
    startEditCategory,
    cancelEditCategory,
    saveCategory,
    deleteCategory,
    savingCategory,
    menuState,
    menuForm,
    setMenuForm,
    uploadState,
    uploadMenuImage,
    clearMenuImage,
    editingMenuId,
    startEditMenu,
    cancelEditMenu,
    saveMenu,
    deleteMenu,
    savingMenu,
    PROMOTION_TYPES,
    menuItemsList,
    allToppingsList,
    promotionsState,
    promotionFilter,
    setPromotionFilter,
    promotionFilteredItems,
    promotionForm,
    setPromotionForm,
    editingPromotionCode,
    startEditPromotion,
    cancelEditPromotion,
    savePromotion,
    deletePromotion,
    savingPromotion,
    attributesState,
    loadAttributes,
    membershipConfigsState,
    savingMembershipConfig,
    loadMembershipConfigs,
    saveMembershipConfig,
    customerMembershipForm,
    setCustomerMembershipForm,
    editingCustomerMembershipId,
    savingCustomerMembership,
    startEditCustomerMembership,
    cancelEditCustomerMembership,
    saveCustomerMembership,
  } = useSystemAdmin()

  const usersPageData = useMemo(() => buildPage(usersState.items, usersPage), [usersState.items, usersPage])
  const customersPageData = useMemo(() => buildPage(customersState.items, customersPage), [customersState.items, customersPage])
  const branchesPageData = useMemo(() => buildPage(branchesState.items, branchesPage), [branchesState.items, branchesPage])
  const filteredCategories = useMemo(() => {
    const keyword = normalizeText(categoryKeyword)
    if (!keyword) return categoriesState.items
    return (categoriesState.items || []).filter((cat) => normalizeText(cat.label).includes(keyword))
  }, [categoriesState.items, categoryKeyword])

  const categoriesPageData = useMemo(() => buildPage(filteredCategories, categoriesPage), [filteredCategories, categoriesPage])
  const filteredMenuItems = useMemo(() => {
    const keyword = normalizeText(menuKeyword)
    if (!keyword) return menuState.items
    return (menuState.items || []).filter((item) => {
      const haystack = normalizeText([
        item.name,
        item.category,
        item.description,
      ].join(' '))
      return haystack.includes(keyword)
    })
  }, [menuState.items, menuKeyword])

  const menuPageData = useMemo(() => buildPage(filteredMenuItems, menuPage), [filteredMenuItems, menuPage])
  const promotionsPageData = useMemo(() => buildPage(promotionFilteredItems, promotionsPage), [promotionFilteredItems, promotionsPage])

  const [selectedAttributeSelect, setSelectedAttributeSelect] = useState('')
  const [selectedBranchForReview, setSelectedBranchForReview] = useState(null)
  const [customAttributeName, setCustomAttributeName] = useState('')
  const [newOptionState, setNewOptionState] = useState({}) // { [attrName]: { name: '', price: '' } }

  const addAttributeGroup = () => {
    const name = (customAttributeName.trim() || selectedAttributeSelect.trim())
    if (!name) {
      window.alert('Vui lòng chọn hoặc nhập tên biến thể mới!')
      return
    }

    const currentBienThe = menuForm.bien_the || {}
    if (currentBienThe[name]) {
      window.alert('Nhóm biến thể này đã tồn tại!')
      return
    }

    const updated = { ...currentBienThe, [name]: {} }
    setMenuForm((prev) => ({
      ...prev,
      bien_the: updated,
    }))

    setSelectedAttributeSelect('')
    setCustomAttributeName('')
  }

  const removeAttributeGroup = (attrName) => {
    if (!window.confirm(`Xóa toàn bộ nhóm biến thể "${attrName}"?`)) return
    const currentBienThe = menuForm.bien_the || {}
    const updated = { ...currentBienThe }
    delete updated[attrName]
    setMenuForm((prev) => ({
      ...prev,
      bien_the: updated,
    }))
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

    const currentBienThe = menuForm.bien_the || {}
    const currentOptions = currentBienThe[attrName] || {}
    const updatedOptions = { ...currentOptions, [optionName]: Number(opt.price) || 0 }

    const updatedBienThe = { ...currentBienThe, [attrName]: updatedOptions }
    setMenuForm((prev) => ({
      ...prev,
      bien_the: updatedBienThe,
    }))

    setNewOptionState((prev) => ({
      ...prev,
      [attrName]: { name: '', price: '' },
    }))
  }

  const removeOptionFromGroup = (attrName, optionName) => {
    const currentBienThe = menuForm.bien_the || {}
    const currentOptions = currentBienThe[attrName] || {}
    const updatedOptions = { ...currentOptions }
    delete updatedOptions[optionName]

    const updatedBienThe = { ...currentBienThe, [attrName]: updatedOptions }
    setMenuForm((prev) => ({
      ...prev,
      bien_the: updatedBienThe,
    }))
  }

  useEffect(() => {
    if (!adminToast) return
    const timeout = window.setTimeout(() => setAdminToast(null), 4500)
    return () => window.clearTimeout(timeout)
  }, [adminToast])

  useEffect(() => {
    const handleLocalNotify = (event) => {
      const detail = event?.detail || {}
      setAdminToast({
        title: detail.tieu_de || 'Thông báo',
        message: detail.noi_dung || '',
      })
    }

    window.addEventListener(ADMIN_LOCAL_NOTIFY_EVENT, handleLocalNotify)
    return () => window.removeEventListener(ADMIN_LOCAL_NOTIFY_EVENT, handleLocalNotify)
  }, [])

  useEffect(() => {
    if (activeTab === 'survey-manage') {
      onTaiForms();
      onTaiResponses();
    }
    if (activeTab === 'membership-config') {
      loadMembershipConfigs();
    }
  }, [activeTab]);

  return (
    <div className="system-admin-shell">
      <aside className="system-admin-sidebar">
        <h2>System Admin</h2>
        <p className="staff-tag" style={{ marginTop: '0.5rem' }}>
          {session?.user?.tenDangNhap || 'admin'} (ADMIN)
        </p>

        <div className="system-admin-tabs">
          <button type="button" className={activeTab === 'overview' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('overview')}>
            Dashboard tổng
          </button>
          <button type="button" className={activeTab === 'users' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('users')}>
            Quản lý người dùng
          </button>
          <button type="button" className={activeTab === 'customers' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('customers')}>
            Quản lý khách hàng
          </button>
          <button type="button" className={activeTab === 'membership-config' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('membership-config')}>
            ⚙️ Thiết lập Membership
          </button>
          <button type="button" className={activeTab === 'branches' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('branches')}>
            Quản lý chi nhánh
          </button>
          <button type="button" className={activeTab === 'categories' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('categories')}>
            Quản lý danh mục
          </button>
          <button type="button" className={activeTab === 'menu' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('menu')}>
            Quản lý menu tổng
          </button>
          <button type="button" className={activeTab === 'account' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('account')}>
            Hồ sơ &amp; Bảo mật
          </button>
          <button type="button" className={activeTab === 'promotions' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('promotions')}>
            Khuyến mãi &amp; Voucher
          </button>
          <button type="button" className={activeTab === 'survey-manage' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('survey-manage')}>
            📊 Quản lý Khảo sát
          </button>
          <button type="button" className={activeTab === 'ai-analytics' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('ai-analytics')}>
            Phân tích mua sắm
          </button>
          <button type="button" className={activeTab === 'system-ops' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('system-ops')}>
            Giám sát hệ thống
          </button>
          <button type="button" className={activeTab === 'shippers' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('shippers')}>
            🚴 Quản lý Shipper
          </button>
        </div>

        <button type="button" className="logout-btn" onClick={onLogout}>Đăng xuất</button>
      </aside>

      <main className="system-admin-content">
        <section className="system-admin-hero">
          <div>
            <p className="system-admin-kicker">System-wide Control</p>
            <h1>Bảng điều khiển Quản trị viên hệ thống</h1>
            <p>Tách biệt hoàn toàn với giao diện Manager/Staff để tập trung vận hành và quản trị dữ liệu hệ thống.</p>
          </div>
          <div className="system-admin-hero-tools">
            <AdminNotificationBell session={session} />
            <div className="system-admin-hero-badge">
              <strong>{session?.user?.tenDangNhap || 'Quản trị viên'}</strong>
              <span>Toàn hệ thống cửa hàng</span>
            </div>
          </div>
        </section>

        {activeTab === 'account' ? <AccountCenterPanel session={session} /> : null}

        {activeTab === 'overview' && (
          <section className="panel system-admin-panel">
            <div className="panel-head">
              <h2>Thống kê người dùng toàn hệ thống</h2>
              <span>Dashboard chi tiết theo role, trạng thái và phân bổ chi nhánh</span>
            </div>

            {statsState.loading ? <p>Đang tải thống kê...</p> : null}
            {statsState.error ? <p className="error-text">{statsState.error}</p> : null}

            {!statsState.loading && !statsState.error && statsState.data ? (
              <>
                <div className="system-admin-kpi-grid">
                  <article className="system-admin-kpi-card">
                    <p>Tổng tài khoản</p>
                    <h3>{fmtNumber(dashboardSummary.totalUsers)}</h3>
                    <small>{fmtNumber(dashboardSummary.branchCount)} chi nhánh đang có tài khoản</small>
                  </article>
                  <article className="system-admin-kpi-card">
                    <p>Tỷ lệ hoạt động</p>
                    <h3>{dashboardSummary.activeRate}%</h3>
                    <small>{fmtNumber(dashboardSummary.activeUsers)} active / {fmtNumber(dashboardSummary.inactiveUsers)} inactive</small>
                  </article>
                  <article className="system-admin-kpi-card">
                    <p>Khối vận hành</p>
                    <h3>{fmtNumber(dashboardSummary.workforceCount)}</h3>
                    <small>{dashboardSummary.workforceRate}% tổng users là STAFF/MANAGER</small>
                  </article>
                  <article className="system-admin-kpi-card">
                    <p>Khách hàng</p>
                    <h3>{fmtNumber(dashboardSummary.customerCount)}</h3>
                    <small>{dashboardSummary.customerRate}% trên toàn hệ thống</small>
                  </article>
                </div>

                <div className="system-admin-charts-grid">
                  <article className="system-admin-card">
                    <div className="panel-head"><h2>Biểu đồ tròn trạng thái</h2></div>
                    <div className="system-admin-donut-grid">
                      <div className="system-admin-donut-card">
                        <div className="system-admin-donut" style={{ '--percent': `${dashboardSummary.activeRate}%` }}>
                          <div>
                            <strong>{dashboardSummary.activeRate}%</strong>
                            <small>Active</small>
                          </div>
                        </div>
                        <p>{fmtNumber(dashboardSummary.activeUsers)} tài khoản đang hoạt động</p>
                      </div>
                      <div className="system-admin-donut-card">
                        <div className="system-admin-donut" style={{ '--percent': `${dashboardSummary.workforceRate}%` }}>
                          <div>
                            <strong>{dashboardSummary.workforceRate}%</strong>
                            <small>Workforce</small>
                          </div>
                        </div>
                        <p>{fmtNumber(dashboardSummary.workforceCount)} STAFF/MANAGER</p>
                      </div>
                    </div>
                  </article>

                  <article className="system-admin-card">
                    <div className="panel-head"><h2>Biểu đồ cột theo role</h2></div>
                    <div className="system-admin-bars-wrap">
                      {roleChartRows.map((row) => (
                        <div key={row.role} className="system-admin-bar-item">
                          <div className="system-admin-bar-row">
                            <strong>{row.role}</strong>
                            <span>{row.count} ({row.percent}%)</span>
                          </div>
                          <div className="system-admin-bar-track">
                            <div className="system-admin-bar-fill" style={{ width: `${Math.min(Math.max(row.percent, 0), 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>

                  </article>

                  <article className="system-admin-card">
                    <div className="panel-head"><h2>Phân bổ tài khoản theo chi nhánh</h2></div>
                    <div className="system-admin-bars-wrap">
                      {branchChartRows.map((row) => (
                        <div key={row.code} className="system-admin-bar-item">
                          <div className="system-admin-bar-row">
                            <strong>{row.label}</strong>
                            <span>{row.count} tài khoản</span>
                          </div>
                          <div className="system-admin-bar-track">
                            <div className="system-admin-bar-fill system-admin-bar-fill--branch" style={{ width: `${Math.min(Math.max(row.percentOfMax, 0), 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="system-admin-card">
                    <div className="panel-head"><h2>Phân tích lực lượng</h2></div>
                    <div className="system-admin-role-pill-grid">
                      <div>
                        <span>ADMIN</span>
                        <strong>{fmtNumber(dashboardSummary.adminCount)}</strong>
                      </div>
                      <div>
                        <span>MANAGER</span>
                        <strong>{fmtNumber(dashboardSummary.managerCount)}</strong>
                      </div>
                      <div>
                        <span>STAFF</span>
                        <strong>{fmtNumber(dashboardSummary.staffCount)}</strong>
                      </div>
                      <div>
                        <span>CUSTOMER</span>
                        <strong>{fmtNumber(dashboardSummary.customerCount)}</strong>
                      </div>
                    </div>
                  </article>
                </div>
              </>
            ) : null}
          </section>
        )}

        {activeTab === 'promotions' && (
          <section className="panel system-admin-panel">
            <div
              className="system-admin-card"
              style={{
                marginBottom: '1.5rem',
                padding: '1.5rem',
                borderRadius: '14px',
                background: '#ffffff',
                border: '1px solid #e8e2da',
                borderTop: '4px solid #c41230',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
              }}
            >
              <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid #f4f0eb' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#c41230', margin: 0, fontFamily: "'Playfair Display', 'Nunito', serif" }}>
                  {editingPromotionCode ? `Cập nhật thông tin Voucher: ${editingPromotionCode}` : 'Tạo chương trình Voucher mới'}
                </h3>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ fontWeight: '600', fontSize: '0.85rem', color: '#374151', display: 'block', marginBottom: '0.5rem' }}>
                  Loại hình phân phối <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  <div
                    onClick={() => {
                      if (!editingPromotionCode) {
                        setPromotionForm((p) => ({ ...p, loai_phan_phoi: 'PUBLIC' }));
                      }
                    }}
                    style={{
                      border: promotionForm.loai_phan_phoi === 'PUBLIC' ? '2px solid #c41230' : '1px solid #e8e2da',
                      backgroundColor: promotionForm.loai_phan_phoi === 'PUBLIC' ? '#faf7f4' : '#ffffff',
                      borderRadius: '10px',
                      padding: '0.85rem 1rem',
                      cursor: editingPromotionCode ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease-in-out'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: '700', fontSize: '0.9rem', color: '#1a1a1a' }}>
                        <input
                          type="radio"
                          name="loai_phan_phoi"
                          checked={promotionForm.loai_phan_phoi === 'PUBLIC'}
                          onChange={() => {
                            if (!editingPromotionCode) {
                              setPromotionForm((p) => ({ ...p, loai_phan_phoi: 'PUBLIC' }));
                            }
                          }}
                          style={{ accentColor: '#c41230', cursor: 'pointer' }}
                        />
                        Mã công khai
                      </label>
                      <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#1d4ed8', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: '700', border: '1px solid #bfdbfe' }}>
                        Phát hành rộng rãi
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0.25rem 0 0 1.5rem', lineHeight: 1.35 }}>
                      Khách hàng nhập trực tiếp mã này trên ứng dụng khi đặt hàng thanh toán.
                    </p>
                  </div>

                  <div
                    onClick={() => {
                      if (!editingPromotionCode) {
                        setPromotionForm((p) => ({ ...p, loai_phan_phoi: 'TEMPLATE' }));
                      }
                    }}
                    style={{
                      border: promotionForm.loai_phan_phoi === 'TEMPLATE' ? '2px solid #c41230' : '1px solid #e8e2da',
                      backgroundColor: promotionForm.loai_phan_phoi === 'TEMPLATE' ? '#faf7f4' : '#ffffff',
                      borderRadius: '10px',
                      padding: '0.85rem 1rem',
                      cursor: editingPromotionCode ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease-in-out'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0, fontWeight: '700', fontSize: '0.9rem', color: '#1a1a1a' }}>
                        <input
                          type="radio"
                          name="loai_phan_phoi"
                          checked={promotionForm.loai_phan_phoi === 'TEMPLATE'}
                          onChange={() => {
                            if (!editingPromotionCode) {
                              setPromotionForm((p) => ({ ...p, loai_phan_phoi: 'TEMPLATE' }));
                            }
                          }}
                          style={{ accentColor: '#c41230', cursor: 'pointer' }}
                        />
                        Template nội bộ
                      </label>
                      <span style={{ fontSize: '0.72rem', background: '#f3e8ff', color: '#6b21a8', padding: '0.15rem 0.5rem', borderRadius: '6px', fontWeight: '700', border: '1px solid #e9d5ff' }}>
                        Dùng cho hệ thống
                      </span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#6b7280', margin: '0.25rem 0 0 1.5rem', lineHeight: 1.35 }}>
                      Khuôn mẫu làm nguyên liệu để tự động sinh mã cho Thăng hạng, Sinh nhật, Vòng quay...
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem', alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>
                    {promotionForm.loai_phan_phoi === 'PUBLIC' ? 'Tên chương trình' : 'Tên mẫu template'} <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    value={promotionForm.ten_khuyen_mai}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, ten_khuyen_mai: e.target.value }))}
                    placeholder={promotionForm.loai_phan_phoi === 'PUBLIC' ? 'VD: Khuyến mãi Mùa Hè 2026' : 'VD: Template Quà Sinh Nhật VIP'}
                    style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>
                      {promotionForm.loai_phan_phoi === 'PUBLIC' ? 'Mã Voucher' : 'Mã Template'} <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    {promotionForm.loai_phan_phoi === 'PUBLIC' && !editingPromotionCode && (
                      <button
                        type="button"
                        onClick={() => {
                          const rnd = `PUB_${Math.random().toString(36).substring(2, 7).toUpperCase()}`
                          setPromotionForm((p) => ({ ...p, ma_khuyen_mai: rnd }))
                        }}
                        style={{ border: 'none', background: 'none', color: '#c41230', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', padding: 0 }}
                      >
                        Tạo mã ngẫu nhiên
                      </button>
                    )}
                  </div>
                  <input
                    value={promotionForm.ma_khuyen_mai}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, ma_khuyen_mai: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
                    placeholder={promotionForm.loai_phan_phoi === 'PUBLIC' ? 'VD: SUMMER2026' : 'Tự động sinh mã'}
                    disabled={Boolean(editingPromotionCode)}
                    style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit', backgroundColor: editingPromotionCode || promotionForm.loai_phan_phoi === 'TEMPLATE' ? '#f9fafb' : '#ffffff' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Hình thức giảm giá</label>
                  <select
                    value={promotionForm.loai_khuyen_mai}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, loai_khuyen_mai: e.target.value }))}
                    style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                  >
                    {(PROMOTION_TYPES || []).map((t) => (
                      <option key={t.code} value={t.code}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>
                    {promotionForm.loai_khuyen_mai === 'PERCENT' ? 'Mức giảm (%)' : promotionForm.loai_khuyen_mai === 'FIXED' ? 'Số tiền giảm (đ)' : 'Giá trị giảm'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={promotionForm.loai_khuyen_mai === 'PERCENT' ? 100 : undefined}
                    value={promotionForm.gia_tri}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, gia_tri: e.target.value }))}
                    disabled={promotionForm.loai_khuyen_mai === 'FREE_ITEM'}
                    style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit', backgroundColor: promotionForm.loai_khuyen_mai === 'FREE_ITEM' ? '#f9fafb' : '#ffffff' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {promotionForm.loai_khuyen_mai === 'PERCENT' ? (
                    <>
                      <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Giảm tối đa (đ)</label>
                      <input
                        type="number"
                        min="0"
                        value={promotionForm.giam_toi_da}
                        onChange={(e) => setPromotionForm((p) => ({ ...p, giam_toi_da: e.target.value }))}
                        placeholder="Để trống = Không giới hạn"
                        style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                      />
                    </>
                  ) : promotionForm.loai_khuyen_mai === 'FREE_ITEM' ? (
                    <>
                      <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Sản phẩm tặng kèm</label>
                      <select
                        value={promotionForm.ten_san_pham_tang}
                        onChange={(e) => setPromotionForm((p) => ({ ...p, ten_san_pham_tang: e.target.value }))}
                        style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit', backgroundColor: '#ffffff' }}
                      >
                        <option value="">-- Chọn sản phẩm --</option>
                        {(menuItemsList || []).map((item) => (
                          <option key={item.id} value={item.name}>{item.name} ({Number(item.price).toLocaleString('vi-VN')}đ)</option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#9ca3af' }}>Giảm tối đa (đ)</label>
                      <input
                        disabled
                        placeholder="Không áp dụng cho giảm cố định"
                        style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', backgroundColor: '#f9fafb' }}
                      />
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Đơn tối thiểu (đ)</label>
                  <input
                    type="number"
                    min="0"
                    value={promotionForm.gia_tri_don_toi_thieu}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, gia_tri_don_toi_thieu: e.target.value }))}
                    placeholder="0 = Không giới hạn"
                    style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                  />
                </div>

                {promotionForm.loai_phan_phoi === 'PUBLIC' ? (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Tổng lượt phát hành</label>
                      <input
                        type="number"
                        min="0"
                        value={promotionForm.so_luong_toi_da}
                        onChange={(e) => setPromotionForm((p) => ({ ...p, so_luong_toi_da: e.target.value }))}
                        placeholder="0 = Không giới hạn"
                        style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Lượt dùng tối đa / Khách</label>
                      <input
                        type="number"
                        min="1"
                        value={promotionForm.gioi_han_moi_nguoi}
                        onChange={(e) => setPromotionForm((p) => ({ ...p, gioi_han_moi_nguoi: e.target.value }))}
                        style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Trạng thái hoạt động</label>
                      <select
                        value={promotionForm.trang_thai}
                        onChange={(e) => setPromotionForm((p) => ({ ...p, trang_thai: e.target.value }))}
                        style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                      >
                        <option value="ACTIVE">Hoạt động</option>
                        <option value="INACTIVE">Tạm dừng</option>
                      </select>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Thời gian bắt đầu</label>
                      <input
                        type="datetime-local"
                        value={promotionForm.ngay_bat_dau}
                        onChange={(e) => setPromotionForm((p) => ({ ...p, ngay_bat_dau: e.target.value }))}
                        style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Thời gian kết thúc</label>
                      <input
                        type="datetime-local"
                        value={promotionForm.ngay_ket_thuc}
                        onChange={(e) => setPromotionForm((p) => ({ ...p, ngay_ket_thuc: e.target.value }))}
                        style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', justifyContent: 'center' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Hiển thị trên ứng dụng</label>
                      <div style={{ height: '38px', display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#faf7f4', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da' }}>
                        <input
                          type="checkbox"
                          id="hien_thi_cho_khach_chk"
                          checked={Boolean(promotionForm.hien_thi_cho_khach)}
                          onChange={(e) => setPromotionForm((p) => ({ ...p, hien_thi_cho_khach: e.target.checked }))}
                          style={{ width: '16px', height: '16px', accentColor: '#c41230', cursor: 'pointer' }}
                        />
                        <label htmlFor="hien_thi_cho_khach_chk" style={{ fontSize: '0.85rem', color: '#1a1a1a', cursor: 'pointer', margin: 0, fontWeight: '600' }}>
                          Hiển thị trang Khuyến mãi
                        </label>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Ngữ cảnh áp dụng tự động</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', backgroundColor: '#faf7f4', padding: '0.55rem 0.85rem', borderRadius: '8px', border: '1px solid #e8e2da', minHeight: '38px', alignItems: 'center' }}>
                        {[
                          { code: 'TIER_UP', label: 'Thăng hạng' },
                          { code: 'LUCKY_WHEEL', label: 'Vòng quay' },
                          { code: 'BIRTHDAY', label: 'Sinh nhật' },
                          { code: 'FREESHIP', label: 'Freeship' },
                        ].map((ctx) => {
                          const currentContexts = Array.isArray(promotionForm.ngu_canh_su_dung) ? promotionForm.ngu_canh_su_dung : []
                          const isChecked = currentContexts.includes(ctx.code)
                          return (
                            <label key={ctx.code} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.82rem', color: '#1a1a1a', fontWeight: isChecked ? '700' : '500' }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  let next = [...currentContexts]
                                  if (e.target.checked) {
                                    if (!next.includes(ctx.code)) next.push(ctx.code)
                                  } else {
                                    next = next.filter((c) => c !== ctx.code)
                                  }
                                  setPromotionForm((p) => ({ ...p, ngu_canh_su_dung: next }))
                                }}
                                style={{ accentColor: '#c41230' }}
                              />
                              {ctx.label}
                            </label>
                          )
                        })}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Hạn dùng sau khi phát (ngày)</label>
                      <input
                        type="number"
                        min="1"
                        value={promotionForm.so_ngay_hieu_luc}
                        onChange={(e) => setPromotionForm((p) => ({ ...p, so_ngay_hieu_luc: e.target.value }))}
                        placeholder="Mặc định: 30 ngày"
                        style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                      />
                    </div>
                  </>
                )}

                <div style={{ gridColumn: 'span 2', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Đường dẫn hình ảnh Banner</label>
                  <input
                    value={promotionForm.hinh_anh}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, hinh_anh: e.target.value }))}
                    placeholder="https://..."
                    style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: '600', color: '#374151' }}>Mô tả chương trình</label>
                  <input
                    value={promotionForm.mo_ta}
                    onChange={(e) => setPromotionForm((p) => ({ ...p, mo_ta: e.target.value }))}
                    placeholder="Nhập mô tả chi tiết..."
                    style={{ width: '100%', height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem', fontFamily: 'inherit' }}
                  />
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f4f0eb', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                {editingPromotionCode ? (
                  <button
                    type="button"
                    onClick={cancelEditPromotion}
                    style={{
                      padding: '0.55rem 1.25rem',
                      borderRadius: '8px',
                      border: '1px solid #e8e2da',
                      backgroundColor: '#ffffff',
                      color: '#4b5563',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      cursor: 'pointer'
                    }}
                  >
                    Hủy bỏ
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={savePromotion}
                  disabled={savingPromotion}
                  style={{
                    padding: '0.55rem 1.75rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#c41230',
                    color: '#ffffff',
                    fontWeight: '700',
                    fontSize: '0.875rem',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(196, 18, 48, 0.2)'
                  }}
                >
                  {savingPromotion ? 'Đang lưu...' : editingPromotionCode ? 'Cập nhật Voucher' : 'Lưu chương trình Voucher'}
                </button>
              </div>
            </div>

            <div className="orders-filter-bar" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px', gap: '0.75rem' }}>
                <input
                  value={promotionFilter.q}
                  onChange={(e) => setPromotionFilter((prev) => ({ ...prev, q: e.target.value }))}
                  placeholder="Tìm kiếm mã hoặc tên chương trình..."
                  style={{ height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem' }}
                />
                <select
                  value={promotionFilter.type}
                  onChange={(e) => setPromotionFilter((prev) => ({ ...prev, type: e.target.value }))}
                  style={{ height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem' }}
                >
                  <option value="">Tất cả phân loại</option>
                  <option value="PUBLIC">Mã công khai</option>
                  <option value="TEMPLATE">Template nội bộ</option>
                </select>
                <select
                  value={promotionFilter.status}
                  onChange={(e) => setPromotionFilter((prev) => ({ ...prev, status: e.target.value }))}
                  style={{ height: '38px', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid #e8e2da', fontSize: '0.875rem' }}
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="ACTIVE">Hoạt động</option>
                  <option value="INACTIVE">Tạm dừng</option>
                </select>
              </div>
            </div>

            {promotionsState.loading ? <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Đang tải danh sách voucher...</p> : null}
            {promotionsState.error ? <p className="error-text">{promotionsState.error}</p> : null}

            {(!promotionFilter.type || promotionFilter.type === 'PUBLIC') && (
              <div style={{ marginTop: '1rem', marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, color: '#c41230', fontWeight: '700', fontSize: '1rem', fontFamily: "'Playfair Display', 'Nunito', serif" }}>
                    Danh sách Mã áp dụng công khai
                  </h3>
                  <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: '700', border: '1px solid #bfdbfe' }}>
                    {promotionFilteredItems.filter((i) => (i.loai_phan_phoi || 'PUBLIC') === 'PUBLIC').length} mã
                  </span>
                </div>

                {promotionFilteredItems.filter((i) => (i.loai_phan_phoi || 'PUBLIC') === 'PUBLIC').length > 0 ? (
                  <div className="system-admin-table-wrap">
                    <table className="system-admin-table">
                      <thead>
                        <tr>
                          <th>Chương trình</th>
                          <th>Loại giảm giá</th>
                          <th>Đơn tối thiểu</th>
                          <th>Thời gian áp dụng</th>
                          <th>Lượt sử dụng</th>
                          <th>Trạng thái</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {promotionFilteredItems
                          .filter((i) => (i.loai_phan_phoi || 'PUBLIC') === 'PUBLIC')
                          .map((item) => (
                            <tr key={item.ma_khuyen_mai || item.ma_voucher}>
                              <td>
                                <strong style={{ color: '#c41230', fontSize: '0.92rem' }}>{item.ma_khuyen_mai || item.ma_voucher}</strong>
                                <p style={{ margin: '0.15rem 0 0 0', fontWeight: '600', color: '#1f2937' }}>{item.ten_khuyen_mai || item.ten_voucher}</p>
                                {item.mo_ta ? <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>{item.mo_ta}</p> : null}
                              </td>
                              <td>
                                <strong>
                                  {(item.loai_khuyen_mai || item.loai) === 'PERCENT'
                                    ? `${item.gia_tri}%${item.giam_toi_da ? ` (Tối đa ${fmtNumber(item.giam_toi_da)}đ)` : ''}`
                                    : (item.loai_khuyen_mai || item.loai) === 'FIXED'
                                      ? `${fmtNumber(item.gia_tri)}đ`
                                      : (item.loai_khuyen_mai || item.loai) === 'FREE_TOPPING'
                                        ? `Free Topping`
                                        : `Tặng: ${item.ten_san_pham_tang || 'Món'}`}
                                </strong>
                              </td>
                              <td>{item.gia_tri_don_toi_thieu > 0 || item.don_hang_toi_thieu > 0 ? `${fmtNumber(item.gia_tri_don_toi_thieu || item.don_hang_toi_thieu)}đ` : 'Không'}</td>
                              <td>
                                <p style={{ margin: 0, fontSize: '0.78rem' }}>Từ: {fmtDateShort(item.ngay_bat_dau)}</p>
                                <p style={{ margin: 0, fontSize: '0.78rem' }}>Đến: {fmtDateShort(item.ngay_ket_thuc || item.han_su_dung)}</p>
                              </td>
                              <td>{item.so_luong_da_dung || item.luot_da_dung || 0}{item.so_luong_toi_da || item.tong_luot_dung ? ` / ${fmtNumber(item.so_luong_toi_da || item.tong_luot_dung)}` : ' / Vô hạn'}</td>
                              <td>
                                <span className={`status-tag ${item.trang_thai === 'ACTIVE' ? 'active' : 'inactive'}`}>
                                  {PROMOTION_STATUS_LABELS[item.trang_thai] || item.trang_thai}
                                </span>
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.4rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => startEditPromotion(item)}
                                    style={{ border: '1px solid #c41230', backgroundColor: '#ffffff', color: '#c41230', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
                                  >
                                    Chỉnh sửa
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deletePromotion(item.ma_khuyen_mai || item.ma_voucher)}
                                    style={{ border: '1px solid #ef4444', backgroundColor: '#ffffff', color: '#ef4444', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
                                  >
                                    Xóa
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: '#6b7280', fontSize: '0.85rem', fontStyle: 'italic' }}>Chưa có mã công khai nào.</p>
                )}
              </div>
            )}

            {(!promotionFilter.type || promotionFilter.type === 'TEMPLATE') && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e8e2da', paddingTop: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, color: '#c41230', fontWeight: '700', fontSize: '1rem', fontFamily: "'Playfair Display', 'Nunito', serif" }}>
                    Danh sách Template Voucher nội bộ
                  </h3>
                  <span style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '12px', fontWeight: '700', border: '1px solid #e9d5ff' }}>
                    {promotionFilteredItems.filter((i) => i.loai_phan_phoi === 'TEMPLATE').length} template
                  </span>
                </div>

                {promotionFilteredItems.filter((i) => i.loai_phan_phoi === 'TEMPLATE').length > 0 ? (
                  <div className="system-admin-table-wrap">
                    <table className="system-admin-table">
                      <thead>
                        <tr>
                          <th>Mẫu Voucher</th>
                          <th>Ngữ cảnh áp dụng</th>
                          <th>Quy tắc giảm giá</th>
                          <th>Đơn tối thiểu</th>
                          <th>Thời hạn khi cấp</th>
                          <th>Trạng thái</th>
                          <th>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {promotionFilteredItems
                          .filter((i) => i.loai_phan_phoi === 'TEMPLATE')
                          .map((item) => {
                            const rawCtx = item.ngu_canh_su_dung || ''
                            const ctxList = typeof rawCtx === 'string' ? rawCtx.split(',').map((s) => s.trim()).filter(Boolean) : (Array.isArray(rawCtx) ? rawCtx : [])
                            const CTX_MAP = { TIER_UP: 'Thăng hạng', LUCKY_WHEEL: 'Vòng quay', BIRTHDAY: 'Sinh nhật', FREESHIP: 'Freeship' }
                            return (
                              <tr key={item.ma_khuyen_mai || item.ma_voucher}>
                                <td>
                                  <strong style={{ color: '#6b21a8', fontSize: '0.92rem' }}>{item.ma_khuyen_mai || item.ma_voucher}</strong>
                                  <p style={{ margin: '0.15rem 0 0 0', fontWeight: '600', color: '#1f2937' }}>{item.ten_khuyen_mai || item.ten_voucher}</p>
                                  {item.mo_ta ? <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>{item.mo_ta}</p> : null}
                                </td>
                                <td>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                    {ctxList.length > 0 ? ctxList.map((c) => (
                                      <span key={c} style={{ backgroundColor: '#f3e8ff', color: '#6b21a8', fontSize: '0.72rem', padding: '0.1rem 0.45rem', borderRadius: '4px', fontWeight: '600' }}>
                                        {CTX_MAP[c] || c}
                                      </span>
                                    )) : <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Chưa chọn</span>}
                                  </div>
                                </td>
                                <td>
                                  <strong>
                                    {(item.loai_khuyen_mai || item.loai) === 'PERCENT'
                                      ? `${item.gia_tri}%${item.giam_toi_da ? ` (Tối đa ${fmtNumber(item.giam_toi_da)}đ)` : ''}`
                                      : (item.loai_khuyen_mai || item.loai) === 'FIXED'
                                        ? `${fmtNumber(item.gia_tri)}đ`
                                        : (item.loai_khuyen_mai || item.loai) === 'FREE_TOPPING'
                                          ? `Free Topping`
                                          : `Tặng: ${item.ten_san_pham_tang || 'Món'}`}
                                  </strong>
                                </td>
                                <td>{item.gia_tri_don_toi_thieu > 0 || item.don_hang_toi_thieu > 0 ? `${fmtNumber(item.gia_tri_don_toi_thieu || item.don_hang_toi_thieu)}đ` : 'Không'}</td>
                                <td>{item.so_ngay_hieu_luc || 30} ngày</td>
                                <td>
                                  <span className={`status-tag ${item.trang_thai === 'ACTIVE' ? 'active' : 'inactive'}`}>
                                    {PROMOTION_STATUS_LABELS[item.trang_thai] || item.trang_thai}
                                  </span>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                                    <button
                                      type="button"
                                      onClick={() => startEditPromotion(item)}
                                      style={{ border: '1px solid #c41230', backgroundColor: '#ffffff', color: '#c41230', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                      Chỉnh sửa
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deletePromotion(item.ma_khuyen_mai || item.ma_voucher)}
                                      style={{ border: '1px solid #ef4444', backgroundColor: '#ffffff', color: '#ef4444', padding: '0.25rem 0.65rem', borderRadius: '6px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                      Xóa
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: '#6b7280', fontSize: '0.85rem', fontStyle: 'italic' }}>Chưa có template nội bộ nào.</p>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === 'survey-manage' && (
          <ManagerSurveyPanel
            surveysState={surveysState}
            surveyResponsesState={surveyResponsesState}
            onKichHoatForm={onKichHoatForm}
            onTaoForm={onTaoForm}
            onSuaForm={onSuaForm}
            onXoaForm={onXoaForm}
            onTaiForms={onTaiForms}
            onTaiResponses={onTaiResponses}
          />
        )}

        {activeTab === 'users' && (
          <section className="panel system-admin-panel">
            <div className="panel-head system-admin-panel-head">
              <h2>Quản lý người dùng và phân quyền</h2>
              <span>CRUD tài khoản STAFF/MANAGER + gán chi nhánh</span>
            </div>

            <div className="orders-filter-bar" style={{ marginBottom: '0.8rem' }}>
              <div className="system-admin-filter-grid">
                <input
                  value={userFilters.q}
                  onChange={(e) => setUserFilters((prev) => ({ ...prev, q: e.target.value }))}
                  placeholder="Tìm username, họ tên, email"
                />
                <select value={userFilters.role} onChange={(e) => setUserFilters((prev) => ({ ...prev, role: e.target.value }))}>
                  <option value="">Tất cả role</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="STAFF">STAFF</option>
                  <option value="CUSTOMER">CUSTOMER</option>
                </select>
                <select value={userFilters.branch_code} onChange={(e) => setUserFilters((prev) => ({ ...prev, branch_code: e.target.value }))}>
                  <option value="">Tất cả chi nhánh</option>
                  {branchOptions.map((branch) => (
                    <option key={branch.code} value={branch.code}>{branch.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => loadUsers()}>Lọc</button>
              </div>
            </div>

            <div className="system-admin-card" style={{ marginBottom: '0.8rem' }}>
              <div className="panel-head"><h2>{editingUserId ? 'Cập nhật tài khoản' : 'Tạo tài khoản mới'}</h2></div>
              <div className="system-admin-form-grid system-admin-form-grid--user">
                <label>
                  <span>Username</span>
                  <input value={userForm.ten_dang_nhap} onChange={(e) => setUserForm((p) => ({ ...p, ten_dang_nhap: e.target.value }))} />
                </label>
                <label>
                  <span>Họ tên</span>
                  <input value={userForm.ho_ten} onChange={(e) => setUserForm((p) => ({ ...p, ho_ten: e.target.value }))} />
                </label>
                <label>
                  <span>Email</span>
                  <input value={userForm.email || ''} onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))} />
                </label>
                <label>
                  <span>Mật khẩu {editingUserId ? '(để trống nếu giữ nguyên)' : ''}</span>
                  <input type="password" value={userForm.mat_khau || ''} onChange={(e) => setUserForm((p) => ({ ...p, mat_khau: e.target.value }))} />
                </label>
                <label>
                  <span>Vai trò</span>
                  <select value={userForm.vai_tro} onChange={(e) => setUserForm((p) => ({ ...p, vai_tro: e.target.value }))}>
                    <option value="STAFF">STAFF</option>
                    <option value="MANAGER">MANAGER</option>
                  </select>
                </label>
                <label>
                  <span>Chi nhánh</span>
                  <select value={userForm.co_so_ma} onChange={(e) => setUserForm((p) => ({ ...p, co_so_ma: e.target.value }))}>
                    {branchOptions.map((branch) => (
                      <option key={branch.code} value={branch.code}>{branch.name}</option>
                    ))}
                  </select>
                </label>
                {editingUserId ? (
                  <label>
                    <span>Trạng thái</span>
                    <select value={userForm.trang_thai || 'ACTIVE'} onChange={(e) => setUserForm((p) => ({ ...p, trang_thai: e.target.value }))}>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </label>
                ) : null}
              </div>
              <div className="system-admin-form-actions">
                <button type="button" onClick={saveUser} disabled={savingUser}>{savingUser ? 'Đang lưu...' : 'Lưu tài khoản'}</button>
                {editingUserId ? <button type="button" className="secondary" onClick={cancelEditUser}>Hủy sửa</button> : null}
              </div>
            </div>

            {usersState.loading ? <p>Đang tải users...</p> : null}
            {usersState.error ? <p className="error-text">{usersState.error}</p> : null}
            <div className="system-admin-table-wrap">
              <table className="system-admin-table">
                <thead>
                  <tr>
                    <th>Họ tên / Username</th>
                    <th>Email</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Chi nhánh</th>
                    <th>Ngày tạo</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {usersPageData.rows.map((item) => (
                    <tr key={item.ma_nguoi_dung}>
                      <td>
                        <strong>{item.ho_ten}</strong>
                        <p>@{item.ten_dang_nhap}</p>
                      </td>
                      <td>{item.email || '---'}</td>
                      <td>{item.vai_tro}</td>
                      <td>{item.trang_thai}</td>
                      <td>{item.co_so_ten || 'Không gán chi nhánh'}</td>
                      <td>{new Date(item.ngay_tao).toLocaleString('vi-VN')}</td>
                      <td>
                        <div className="system-admin-table-actions">
                          <button type="button" className="secondary" onClick={() => startEditUser(item)}>Sửa</button>
                          <button type="button" className="secondary" onClick={() => deleteUser(item.ma_nguoi_dung)} disabled={item.vai_tro === 'ADMIN'}>Xóa</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination pageData={usersPageData} onPageChange={setUsersPage} />
            </div>
          </section>
        )}

        {activeTab === 'customers' && (
          <section className="panel system-admin-panel">
            <div className="panel-head system-admin-panel-head">
              <h2>Quản lý khách hàng</h2>
              <span>CRUD tài khoản CUSTOMER, trạng thái và thông tin liên hệ</span>
            </div>

            <div className="orders-filter-bar" style={{ marginBottom: '0.8rem' }}>
              <div className="system-admin-filter-grid">
                <input
                  value={customerFilters.q}
                  onChange={(e) => setCustomerFilters((prev) => ({ ...prev, q: e.target.value }))}
                  placeholder="Tìm username, họ tên, email khách hàng"
                />
                <select value={customerFilters.status} onChange={(e) => setCustomerFilters((prev) => ({ ...prev, status: e.target.value }))}>
                  <option value="">Tất cả trạng thái</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
                <button type="button" onClick={() => loadCustomers()}>Lọc</button>
              </div>
            </div>

            <div className="system-admin-card" style={{ marginBottom: '0.8rem' }}>
              <div className="panel-head"><h2>{editingCustomerId ? 'Cập nhật khách hàng' : 'Tạo khách hàng mới'}</h2></div>
              <div className="system-admin-form-grid system-admin-form-grid--user">
                <label>
                  <span>Username</span>
                  <input value={customerForm.ten_dang_nhap} onChange={(e) => setCustomerForm((p) => ({ ...p, ten_dang_nhap: e.target.value }))} />
                </label>
                <label>
                  <span>Họ tên</span>
                  <input value={customerForm.ho_ten} onChange={(e) => setCustomerForm((p) => ({ ...p, ho_ten: e.target.value }))} />
                </label>
                <label>
                  <span>Email</span>
                  <input value={customerForm.email || ''} onChange={(e) => setCustomerForm((p) => ({ ...p, email: e.target.value }))} />
                </label>
                <label>
                  <span>Mật khẩu {editingCustomerId ? '(để trống nếu giữ nguyên)' : ''}</span>
                  <input type="password" value={customerForm.mat_khau || ''} onChange={(e) => setCustomerForm((p) => ({ ...p, mat_khau: e.target.value }))} />
                </label>
                <label>
                  <span>Trạng thái</span>
                  <select value={customerForm.trang_thai || 'ACTIVE'} onChange={(e) => setCustomerForm((p) => ({ ...p, trang_thai: e.target.value }))}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </label>
              </div>
              <div className="system-admin-form-actions">
                <button type="button" onClick={saveCustomer} disabled={savingCustomer}>{savingCustomer ? 'Đang lưu...' : 'Lưu khách hàng'}</button>
                {editingCustomerId ? <button type="button" className="secondary" onClick={cancelEditCustomer}>Hủy sửa</button> : null}
              </div>
            </div>

            {customersState.loading ? <p>Đang tải khách hàng...</p> : null}
            {customersState.error ? <p className="error-text">{customersState.error}</p> : null}
            <div className="system-admin-table-wrap">
              <table className="system-admin-table">
                <thead>
                  <tr>
                    <th>Họ tên / Username</th>
                    <th>Email</th>
                    <th>Số điện thoại</th>
                    <th>Hạng</th>
                    <th>Điểm (Loyalty / Khả dụng)</th>
                    <th>Tổng chi tiêu</th>
                    <th>Ngày sinh</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {customersPageData.rows.map((item) => {
                    const getCustomerRankBadge = (diem) => {
                      if (diem >= 5000) return <span className="badge" style={{ backgroundColor: '#0ea5e9', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold' }}>💎 Kim Cương</span>;
                      if (diem >= 3000) return <span className="badge" style={{ backgroundColor: '#d97706', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold' }}>🥇 Vàng</span>;
                      if (diem >= 1000) return <span className="badge" style={{ backgroundColor: '#64748b', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold' }}>🥈 Bạc</span>;
                      return <span className="badge" style={{ backgroundColor: '#9ca3af', color: 'white', padding: '0.2rem 0.5rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 'bold' }}>🎖️ Thành viên</span>;
                    };

                    return (
                      <tr key={item.ma_nguoi_dung}>
                        <td>
                          <strong>{item.ho_ten}</strong>
                          <p>@{item.ten_dang_nhap}</p>
                        </td>
                        <td>{item.email || '---'}</td>
                        <td>{item.so_dien_thoai || '---'}</td>
                        <td>{getCustomerRankBadge(item.diem_loyalty)}</td>
                        <td>
                          <p>Loyalty: <strong>{fmtNumber(item.diem_loyalty)}</strong></p>
                          <p>Khả dụng: <strong>{fmtNumber(item.diem_kha_dung)}</strong></p>
                        </td>
                        <td>{fmtNumber(item.tong_chi_tieu)}đ</td>
                        <td>{fmtDateShort(item.ngay_sinh)}</td>
                        <td>{item.trang_thai}</td>
                        <td>
                          <div className="system-admin-table-actions">
                            <button type="button" className="secondary" onClick={() => startEditCustomer(item)}>Sửa profile</button>
                            <button type="button" className="secondary" onClick={() => startEditCustomerMembership(item)}>Sửa điểm</button>
                            <button type="button" className="secondary" onClick={() => deleteCustomer(item.ma_nguoi_dung)}>Xóa</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination pageData={customersPageData} onPageChange={setCustomersPage} />
            </div>

            {/* Modal Sửa Membership */}
            {editingCustomerMembershipId && (
              <div className="admin-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div className="admin-modal" style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '16px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', margin: 'auto' }}>
                  <h3 style={{ borderBottom: '1px solid #e7dfd8', paddingBottom: '0.5rem', marginBottom: '1rem', color: 'var(--burnt)', marginTop: 0 }}>Chỉnh sửa Membership</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#6b503e' }}>Điểm Loyalty (Tích lũy xét hạng)</span>
                      <input
                        type="number"
                        value={customerMembershipForm.diem_loyalty}
                        onChange={(e) => setCustomerMembershipForm(prev => ({ ...prev, diem_loyalty: Number(e.target.value) }))}
                        min="0"
                        style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #dcd3cb' }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#6b503e' }}>Điểm khả dụng (Dùng để quay thưởng)</span>
                      <input
                        type="number"
                        value={customerMembershipForm.diem_kha_dung}
                        onChange={(e) => setCustomerMembershipForm(prev => ({ ...prev, diem_kha_dung: Number(e.target.value) }))}
                        min="0"
                        style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #dcd3cb' }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#6b503e' }}>Tổng chi tiêu tích lũy (đ)</span>
                      <input
                        type="number"
                        value={customerMembershipForm.tong_chi_tieu}
                        onChange={(e) => setCustomerMembershipForm(prev => ({ ...prev, tong_chi_tieu: Number(e.target.value) }))}
                        min="0"
                        style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #dcd3cb' }}
                      />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#6b503e' }}>Ngày sinh</span>
                      <input
                        type="date"
                        value={customerMembershipForm.ngay_sinh}
                        onChange={(e) => setCustomerMembershipForm(prev => ({ ...prev, ngay_sinh: e.target.value }))}
                        style={{ padding: '0.5rem', borderRadius: '8px', border: '1px solid #dcd3cb', color: '#4a2f20' }}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                    <button type="button" className="secondary" onClick={cancelEditCustomerMembership} style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #dcd3cb', cursor: 'pointer' }}>Hủy</button>
                    <button type="button" onClick={saveCustomerMembership} disabled={savingCustomerMembership} style={{ backgroundColor: 'var(--burnt)', color: 'white', border: 'none', padding: '0.5rem 1.5rem', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', opacity: savingCustomerMembership ? 0.7 : 1 }}>
                      {savingCustomerMembership ? 'Đang lưu...' : 'Lưu'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'membership-config' && (
          <AdminMembershipConfigPanel
            membershipConfigsState={membershipConfigsState}
            savingMembershipConfig={savingMembershipConfig}
            saveMembershipConfig={saveMembershipConfig}
            promotionsState={promotionsState}
            menuState={menuState}
          />
        )}

        {activeTab === 'branches' && (
          selectedBranchForReview ? (
            <BranchDetailReviewsView
              branch={selectedBranchForReview}
              onBack={() => setSelectedBranchForReview(null)}
            />
          ) : (
            <section className="panel system-admin-panel">
              <div className="panel-head system-admin-panel-head">
                <h2>Quản lý chi nhánh cửa hàng</h2>
                <span>CRUD chi nhánh: mã, tên, địa chỉ, số điện thoại, trạng thái. Bấm vào 1 dòng chi nhánh để xem đánh giá chi tiết.</span>
              </div>

              <div className="system-admin-card" style={{ marginBottom: '0.8rem' }}>
                <div className="panel-head"><h2>{editingBranchCode ? 'Cập nhật chi nhánh' : 'Tạo chi nhánh mới'}</h2></div>
                <div className="system-admin-form-grid system-admin-form-grid--branch">
                  <label>
                    <span>Mã chi nhánh</span>
                    <input
                      value={branchForm.ma_chi_nhanh}
                      onChange={(e) => setBranchForm((p) => ({ ...p, ma_chi_nhanh: e.target.value.toUpperCase() }))}
                      placeholder="VD: QUAN_1"
                      disabled={Boolean(editingBranchCode)}
                    />
                  </label>
                  <label>
                    <span>Tên chi nhánh</span>
                    <input value={branchForm.ten_chi_nhanh} onChange={(e) => setBranchForm((p) => ({ ...p, ten_chi_nhanh: e.target.value }))} />
                  </label>

                  <label className="system-admin-branch-city-field">
                    <span>Tỉnh/Thành phố</span>
                    <input
                      className="system-admin-select-search"
                      value={locationSearch.city}
                      onChange={(e) => setLocationSearch((p) => ({ ...p, city: e.target.value }))}
                      placeholder="Gõ để lọc tỉnh/thành"
                    />
                    <select
                      value={branchForm.thanh_pho}
                      onChange={(e) => {
                        setBranchForm((p) => ({
                          ...p,
                          thanh_pho: e.target.value,
                          quan_huyen: '',
                          phuong_xa: '',
                        }))
                        setLocationSearch((p) => ({ ...p, district: '', ward: '' }))
                      }}
                    >
                      {cityOptions.map((city) => (
                        <option key={city.code} value={city.code}>{city.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="system-admin-branch-district-field">
                    <span>Quận/Huyện</span>
                    <input
                      className="system-admin-select-search"
                      value={locationSearch.district}
                      onChange={(e) => setLocationSearch((p) => ({ ...p, district: e.target.value }))}
                      placeholder="Gõ để lọc quận/huyện"
                      disabled={!branchForm.thanh_pho}
                    />
                    <select
                      value={branchForm.quan_huyen}
                      onChange={(e) => {
                        setBranchForm((p) => ({ ...p, quan_huyen: e.target.value, phuong_xa: '' }))
                        setLocationSearch((p) => ({ ...p, ward: '' }))
                      }}
                      disabled={!districtOptions.length}
                    >
                      <option value="">Chọn quận/huyện</option>
                      {districtOptions.map((district) => (
                        <option key={district.code} value={district.code}>{district.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="system-admin-branch-ward-field">
                    <span>Phường/Xã</span>
                    <input
                      className="system-admin-select-search"
                      value={locationSearch.ward}
                      onChange={(e) => setLocationSearch((p) => ({ ...p, ward: e.target.value }))}
                      placeholder="Gõ để lọc phường/xã"
                      disabled={!branchForm.quan_huyen}
                    />
                    <select
                      value={branchForm.phuong_xa}
                      onChange={(e) => setBranchForm((p) => ({ ...p, phuong_xa: e.target.value }))}
                      disabled={!wardOptions.length}
                    >
                      <option value="">Chọn phường/xã</option>
                      {wardOptions.map((ward) => (
                        <option key={ward.code} value={ward.code}>{ward.label}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Số điện thoại</span>
                    <input value={branchForm.so_dien_thoai || ''} onChange={(e) => setBranchForm((p) => ({ ...p, so_dien_thoai: e.target.value }))} />
                  </label>
                  <label>
                    <span>Giờ mở cửa (HH:MM)</span>
                    <input value={branchForm.gio_mo_cua || ''} onChange={(e) => setBranchForm((p) => ({ ...p, gio_mo_cua: e.target.value }))} placeholder="07:00" />
                  </label>
                  <label>
                    <span>Giờ đóng cửa (HH:MM)</span>
                    <input value={branchForm.gio_dong_cua || ''} onChange={(e) => setBranchForm((p) => ({ ...p, gio_dong_cua: e.target.value }))} placeholder="22:00" />
                  </label>
                  <label>
                    <span>Trạng thái</span>
                    <select value={branchForm.trang_thai} onChange={(e) => setBranchForm((p) => ({ ...p, trang_thai: e.target.value }))}>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="INACTIVE">INACTIVE</option>
                    </select>
                  </label>
                  <label className="system-admin-branch-address-field">
                    <span>Địa chỉ chi tiết (số nhà, tên đường, tòa nhà)</span>
                    <input
                      value={branchForm.dia_chi_chi_tiet || ''}
                      onChange={(e) => setBranchForm((p) => ({ ...p, dia_chi_chi_tiet: e.target.value }))}
                      placeholder="VD: 123 Nguyen Dinh Chieu"
                    />
                  </label>
                  <label className="system-admin-branch-address-field">
                    <span>URL ảnh chi nhánh</span>
                    <input
                      value={branchForm.hinh_anh_url || ''}
                      onChange={(e) => setBranchForm((p) => ({ ...p, hinh_anh_url: e.target.value }))}
                      placeholder="https://..."
                    />
                  </label>
                  <label className="system-admin-branch-address-field">
                    <span>Link Google Maps</span>
                    <input
                      value={branchForm.map_url || ''}
                      onChange={(e) => setBranchForm((p) => ({ ...p, map_url: e.target.value }))}
                      placeholder="https://www.google.com/maps/search/?api=1&query=..."
                    />
                  </label>

                  <div className="system-admin-branch-address-preview">
                    <strong>Địa chỉ đầy đủ:</strong>
                    <span>{branchAddressPreview || 'Chưa đủ thông tin địa chỉ để hiển thị preview'}</span>
                  </div>
                </div>

                <div className="system-admin-form-actions">
                  <button type="button" onClick={saveBranch} disabled={savingBranch}>{savingBranch ? 'Đang lưu...' : 'Lưu chi nhánh'}</button>
                  {editingBranchCode ? <button type="button" className="secondary" onClick={cancelEditBranch}>Hủy sửa</button> : null}
                </div>
              </div>

              {branchesState.loading ? <p>Đang tải chi nhánh...</p> : null}
              {branchesState.error ? <p className="error-text">{branchesState.error}</p> : null}

              <div className="system-admin-table-wrap">
                <table className="system-admin-table">
                  <thead>
                    <tr>
                      <th>Tên chi nhánh</th>
                      <th>Mã</th>
                      <th>Địa chỉ</th>
                      <th>SĐT</th>
                      <th>Tài khoản</th>
                      <th>Trạng thái</th>
                      <th>Cập nhật</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchesPageData.rows.map((branch) => (
                      <tr
                        key={branch.ma_chi_nhanh}
                        onClick={() => setSelectedBranchForReview(branch)}
                        style={{ cursor: 'pointer' }}
                        title="Bấm vào dòng để xem chi tiết & đánh giá chi nhánh"
                      >
                        <td><strong>{branch.ten_chi_nhanh}</strong></td>
                        <td>{branch.ma_chi_nhanh}</td>
                        <td>{branch.dia_chi || '---'}</td>
                        <td>{branch.so_dien_thoai || '---'}</td>
                        <td>{fmtNumber(branch.account_count)}</td>
                        <td>{branch.trang_thai}</td>
                        <td>{new Date(branch.ngay_cap_nhat || branch.ngay_tao).toLocaleString('vi-VN')}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="system-admin-table-actions">
                            <button type="button" className="secondary" onClick={() => startEditBranch(branch)}>Sửa</button>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => deleteBranch(branch.ma_chi_nhanh)}
                              disabled={Number(branch.account_count || 0) > 0}
                              title={Number(branch.account_count || 0) > 0 ? 'Không thể xóa vì đang có tài khoản gán vào' : ''}
                            >
                              Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Pagination pageData={branchesPageData} onPageChange={setBranchesPage} />
              </div>
            </section>
          )
        )}

        {activeTab === 'ai-analytics' && (
          <section className="panel system-admin-panel" style={{ padding: '28px 32px' }}>
            <AiAnalyticsPanel session={session} />
          </section>
        )}

        {activeTab === 'system-ops' && <SystemOpsPanel session={session} />}

        {activeTab === 'categories' && (
          <section className="panel system-admin-panel">
            <div className="panel-head system-admin-panel-head">
              <h2>Quản lý danh mục (CRUD)</h2>
              <span>Thiết lập danh mục để phân loại món trong menu tổng</span>
            </div>

            <section className="system-admin-card system-admin-card--flat">
              <div className="panel-head">
                <h2>{editingCategoryId ? `Cập nhật danh mục #${editingCategoryId}` : 'Thông tin danh mục'}</h2>
                <span>{filteredCategories.length} danh mục</span>
              </div>

              <div className="system-admin-category-toolbar">
                <input
                  value={categoryKeyword}
                  onChange={(e) => {
                    setCategoryKeyword(e.target.value)
                    setCategoriesPage(1)
                  }}
                  placeholder="Tìm theo tên danh mục"
                />
              </div>

              <div className="system-admin-form-grid" style={{ marginBottom: '0.7rem' }}>
                <label>
                  <span>Tên danh mục</span>
                  <input
                    value={categoryForm.label}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, label: e.target.value }))}
                    placeholder="Ví dụ: Cà phê"
                  />
                </label>
                <label>
                  <span>Icon URL (tùy chọn)</span>
                  <input
                    value={categoryForm.icon}
                    onChange={(e) => setCategoryForm((p) => ({ ...p, icon: e.target.value }))}
                    placeholder="https://..."
                  />
                </label>
                <label>
                  <span>Cấp bậc</span>
                  <select value={categoryForm.cap_bac} onChange={(e) => setCategoryForm((p) => ({ ...p, cap_bac: Number(e.target.value) }))}>
                    <option value={1}>Cấp 1 - Danh mục chính</option>
                    <option value={2}>Cấp 2 - Danh mục phụ</option>
                  </select>
                </label>
                {Number(categoryForm.cap_bac) === 2 && (
                  <label>
                    <span>Danh mục cha</span>
                    <select value={categoryForm.ma_danh_muc_cha} onChange={(e) => setCategoryForm((p) => ({ ...p, ma_danh_muc_cha: e.target.value }))}>
                      <option value="">-- Chọn danh mục cha --</option>
                      {categoriesState.items.filter(c => c.cap_bac === 1).map(c => (
                        <option key={c.code} value={c.code}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="system-admin-form-actions" style={{ marginBottom: '0.8rem' }}>
                <button type="button" onClick={saveCategory} disabled={savingCategory}>
                  {savingCategory ? 'Đang lưu...' : editingCategoryId ? 'Cập nhật danh mục' : 'Thêm danh mục'}
                </button>
                {editingCategoryId ? (
                  <button type="button" className="secondary" onClick={cancelEditCategory}>Hủy sửa</button>
                ) : null}
              </div>

              {categoriesState.loading ? <p>Đang tải danh mục...</p> : null}
              {categoriesState.error ? <p className="error-text">{categoriesState.error}</p> : null}

              {!categoriesState.loading && !categoriesState.error ? (
                <div className="system-admin-table-wrap">
                  <table className="system-admin-table">
                    <thead>
                      <tr>
                        <th>Tên danh mục</th>
                        <th>Mã danh mục</th>
                        <th>Cấp bậc</th>
                        <th>Danh mục cha</th>
                        <th>Số món đang dùng</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoriesPageData.rows.map((cat) => (
                        <tr key={cat.code}>
                          <td><strong>{cat.label}</strong></td>
                          <td>{cat.code}</td>
                          <td>{cat.cap_bac === 1 ? 'Cấp 1' : 'Cấp 2'}</td>
                          <td>{cat.cap_bac === 2 ? (categoriesState.items.find(c => String(c.code) === String(cat.ma_danh_muc_cha))?.label || `#${cat.ma_danh_muc_cha}`) : '---'}</td>
                          <td>{fmtNumber(cat.product_count || 0)}</td>
                          <td>
                            <div className="system-admin-table-actions">
                              <button type="button" className="secondary" onClick={() => startEditCategory(cat)}>Sửa</button>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => deleteCategory(cat.id || cat.code, cat.label)}
                                disabled={Number(cat.product_count || 0) > 0}
                                title={Number(cat.product_count || 0) > 0 ? 'Không thể xóa vì danh mục đang có sản phẩm' : ''}
                              >
                                Xóa
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination pageData={categoriesPageData} onPageChange={setCategoriesPage} />
                </div>
              ) : null}
            </section>
          </section>
        )}

        {activeTab === 'menu' && (
          <section className="panel system-admin-panel">
            <div className="panel-head system-admin-panel-head">
              <h2>Quản lý menu tổng (CRUD)</h2>
              <span>Ảnh upload sẽ được lưu vào web-customer/public/images/products</span>
            </div>

            <div className="system-admin-menu-stacked-layout">
              <section className="system-admin-card system-admin-form-card">
                <div className="panel-head"><h2>{editingMenuId ? 'Cập nhật món' : 'Thêm món mới'}</h2></div>

                <div className="system-admin-form-grid system-admin-form-grid--menu">
                  <label>
                    <span>Tên món</span>
                    <input value={menuForm.name} onChange={(e) => setMenuForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ví dụ: Cà phê sữa đá" />
                  </label>
                  <label>
                    <span>Đường dẫn (Slug)</span>
                    <input value={menuForm.slug} onChange={(e) => setMenuForm((p) => ({ ...p, slug: e.target.value }))} placeholder="ca-phe-sua-da (tự tạo nếu để trống)" />
                  </label>
                  <label>
                    <span>Danh mục</span>
                    <select value={menuForm.category_code} onChange={(e) => setMenuForm((p) => ({ ...p, category_code: e.target.value }))}>
                      <option value="">Chọn danh mục</option>
                      {categoriesState.items.filter(c => c.cap_bac === 1).map((parent) => {
                        const children = categoriesState.items.filter(c => c.cap_bac === 2 && String(c.ma_danh_muc_cha) === String(parent.code));
                        if (children.length === 0) return (
                          <option key={parent.code} value={parent.code}>{parent.label}</option>
                        );
                        return (
                          <optgroup key={parent.code} label={parent.label}>
                            <option value={parent.code}>{parent.label} (Danh mục cha)</option>
                            {children.map(child => (
                              <option key={child.code} value={child.code}>{child.label}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </label>
                  <label>
                    <span>Giá bán cơ bản</span>
                    <input type="number" min="0" value={menuForm.price} onChange={(e) => setMenuForm((p) => ({ ...p, price: Number(e.target.value) || 0 }))} />
                  </label>
                  <label>
                    <span>Giá niêm yết</span>
                    <input type="number" min="0" value={menuForm.original_price} onChange={(e) => setMenuForm((p) => ({ ...p, original_price: Number(e.target.value) || 0 }))} />
                  </label>
                  <label>
                    <span>Trạng thái</span>
                    <select value={menuForm.dang_ban ? '1' : '0'} onChange={(e) => setMenuForm((p) => ({ ...p, dang_ban: e.target.value === '1' }))}>
                      <option value="1">Đang bán</option>
                      <option value="0">Tạm ngưng</option>
                    </select>
                  </label>
                  <label>
                    <span>Gắn nhãn</span>
                    <select
                      value={`${menuForm.la_hot ? 'H' : ''}${menuForm.la_moi ? 'N' : ''}` || 'NONE'}
                      onChange={(e) => {
                        const val = e.target.value;
                        setMenuForm((p) => ({
                          ...p,
                          la_hot: val === 'H' || val === 'HN',
                          la_moi: val === 'N' || val === 'HN',
                        }));
                      }}
                    >
                      <option value="NONE">Bình thường</option>
                      <option value="H">Hot</option>
                      <option value="N">Mới</option>
                      <option value="HN">Hot + Mới</option>
                    </select>
                  </label>
                  <label>
                    <span>Đường dẫn ảnh</span>
                    <input value={menuForm.image} onChange={(e) => setMenuForm((p) => ({ ...p, image: e.target.value }))} placeholder="/images/products/ca-phe-sua-da.jpg" />
                  </label>
                  <label className="system-admin-branch-address-field">
                    <span>Mô tả ngắn gọn</span>
                    <input value={menuForm.description} onChange={(e) => setMenuForm((p) => ({ ...p, description: e.target.value }))} placeholder="Mô tả món..." />
                  </label>

                  {/* Dynamic Variant & Attribute Builder */}
                  <div className="system-admin-branch-address-field variant-manager-wrapper">
                    <div className="variant-manager">
                      <div className="variant-manager-title">Quản lý biến thể &amp; Tùy chọn món</div>
                      <div className="variant-manager-subtitle">Thiết lập các thuộc tính và phụ thu tương ứng cho sản phẩm (giống WooCommerce/Odoo)</div>

                      {/* List of active attributes */}
                      <div className="variant-groups-list">
                        {Object.entries(menuForm.bien_the || {}).length === 0 ? (
                          <div style={{ padding: '1rem', textAlign: 'center', color: '#8c6b56', fontSize: '0.86rem', fontStyle: 'italic' }}>
                            Sản phẩm này hiện chưa được cấu hình biến thể nào. Sử dụng bộ công cụ bên dưới để thêm nhóm biến thể.
                          </div>
                        ) : (
                          Object.entries(menuForm.bien_the || {}).map(([attrName, optionsObj]) => (
                            <div key={attrName} className="variant-group-card">
                              <div className="variant-group-header">
                                <h3>{attrName}</h3>
                                <button
                                  type="button"
                                  className="variant-group-delete-btn"
                                  onClick={() => removeAttributeGroup(attrName)}
                                  title={`Xóa toàn bộ nhóm "${attrName}"`}
                                >
                                  Xóa nhóm
                                </button>
                              </div>

                              {/* List of values in this group */}
                              <div className="variant-options-list">
                                {Object.entries(optionsObj || {}).length === 0 ? (
                                  <p style={{ fontSize: '0.8rem', color: '#8c6b56', fontStyle: 'italic', margin: '0.5rem 0' }}>
                                    Chưa có lựa chọn nào trong nhóm này.
                                  </p>
                                ) : (
                                  Object.entries(optionsObj || {}).map(([valName, price]) => (
                                    <div key={valName} className="variant-option-item">
                                      <div className="variant-option-info">
                                        <span className="variant-option-name">{valName}</span>
                                        <span className="variant-option-price">
                                          {price > 0 ? `+${fmtNumber(price)} đ` : '0 đ'}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        className="variant-option-delete-btn"
                                        onClick={() => removeOptionFromGroup(attrName, valName)}
                                        title="Xóa lựa chọn này"
                                      >
                                        &times;
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>

                              {/* Add option to this group form */}
                              <div className="variant-option-add-form-inline">
                                <input
                                  type="text"
                                  placeholder="Tên lựa chọn (VD: Lớn, Mỏng)..."
                                  value={newOptionState[attrName]?.name || ''}
                                  onChange={(e) => handleOptionStateChange(attrName, 'name', e.target.value)}
                                />
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="Phụ thu (đ)..."
                                  value={newOptionState[attrName]?.price || ''}
                                  onChange={(e) => handleOptionStateChange(attrName, 'price', e.target.value)}
                                />
                                <button
                                  type="button"
                                  onClick={() => addOptionToGroup(attrName)}
                                >
                                  + Thêm tùy chọn
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Section to add a new attribute group */}
                      <div className="variant-add-group-form">
                        <h4>Thêm nhóm biến thể mới</h4>
                        <div className="variant-add-group-inputs">
                          <select
                            value={selectedAttributeSelect}
                            onChange={(e) => setSelectedAttributeSelect(e.target.value)}
                          >
                            <option value="">-- Chọn biến thể có sẵn --</option>
                            {['Kích thước', 'Topping', 'Lượng đá', 'Độ ngọt', 'Loại sữa'].map((attr) => (
                              <option key={attr} value={attr}>{attr}</option>
                            ))}
                            {(attributesState.items || []).map((attr) => {
                              const defaults = ['Kích thước', 'Topping', 'Lượng đá', 'Độ ngọt', 'Loại sữa']
                              if (defaults.includes(attr.name)) return null;
                              return <option key={attr.id} value={attr.name}>{attr.name}</option>
                            })}
                          </select>

                          <span style={{ fontSize: '0.86rem', color: '#8c6b56', alignSelf: 'center' }}>hoặc</span>

                          <input
                            type="text"
                            placeholder="Nhập biến thể mới..."
                            value={customAttributeName}
                            onChange={(e) => setCustomAttributeName(e.target.value)}
                          />

                          <button
                            type="button"
                            className="variant-add-btn"
                            onClick={addAttributeGroup}
                          >
                            + Thêm nhóm
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="system-admin-upload-box">
                    <div>
                      <strong>Tải ảnh sản phẩm</strong>
                      <p>Chọn file, hệ thống sẽ tự đổi tên theo tên món và lưu vào thư mục ảnh sản phẩm.</p>
                    </div>
                    <label className="system-admin-upload-drop">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => uploadMenuImage(e.target.files?.[0]).catch(() => { })}
                      />
                      <span>{uploadState.loading ? 'Đang tải ảnh...' : 'Chọn ảnh JPG, PNG, WEBP'}</span>
                      <small>{menuForm.name ? `Tên file sẽ bám theo: ${menuForm.name}` : 'Nhập tên món trước để ra tên file đẹp hơn'}</small>
                    </label>
                    {uploadState.error ? <p className="error-text">{uploadState.error}</p> : null}
                    {uploadState.success ? <p className="system-admin-success">{uploadState.success}</p> : null}
                  </div>

                  <div className="system-admin-image-preview">
                    {menuForm.image ? <img src={menuForm.image} alt={menuForm.name || 'Preview'} /> : <div className="system-admin-image-placeholder">Chưa có ảnh xem trước</div>}
                    <div className="system-admin-image-meta">
                      <p>{menuForm.image || 'Chưa có đường dẫn ảnh'}</p>
                      <button type="button" className="secondary" onClick={clearMenuImage} disabled={!menuForm.image}>Xóa ảnh</button>
                    </div>
                  </div>
                </div>

                <div className="system-admin-form-actions">
                  <button type="button" onClick={saveMenu} disabled={savingMenu}>{savingMenu ? 'Đang lưu...' : 'Lưu món'}</button>
                  {editingMenuId ? <button type="button" className="secondary" onClick={cancelEditMenu}>Hủy sửa</button> : null}
                </div>
              </section>

              <section className="system-admin-card system-admin-menu-list-card">
                <div className="panel-head"><h2>Danh sách menu tổng</h2><span>{filteredMenuItems.length} món</span></div>
                <div className="system-admin-category-toolbar">
                  <input
                    value={menuKeyword}
                    onChange={(e) => {
                      setMenuKeyword(e.target.value)
                      setMenuPage(1)
                    }}
                    placeholder="Tìm theo tên món, danh mục hoặc mô tả"
                  />
                </div>
                {menuState.loading ? <p>Đang tải menu...</p> : null}
                {menuState.error ? <p className="error-text">{menuState.error}</p> : null}

                <div className="system-admin-table-wrap">
                  <table className="system-admin-table">
                    <thead>
                      <tr>
                        <th>Món</th>
                        <th>Danh mục</th>
                        <th>Giá bán</th>
                        <th>Giá niêm yết</th>
                        <th>Trạng thái</th>
                        <th>Nhãn</th>
                        <th>Mô tả</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {menuPageData.rows.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div className="system-admin-table-product">
                              {item.image ? <img src={item.image} alt={item.name} className="system-admin-table-product-thumb" /> : <div className="system-admin-table-product-thumb system-admin-table-product-thumb--empty">No image</div>}
                              <strong>{item.name}</strong>
                            </div>
                          </td>
                          <td>{item.category || 'Chưa có danh mục'}</td>
                          <td>{fmtNumber(item.price)} đ</td>
                          <td>{Number(item.original_price || 0) > 0 ? `${fmtNumber(item.original_price)} đ` : '---'}</td>
                          <td>{item.dang_ban ? 'Đang bán' : 'Tạm ngưng'}</td>
                          <td>
                            <div className="system-admin-table-tags">
                              {item.la_hot ? <span>Hot</span> : null}
                              {item.la_moi ? <span>Mới</span> : null}
                              {item.is_discounted ? <span>Giảm giá</span> : null}
                              {!item.la_hot && !item.la_moi && !item.is_discounted ? <span>Bình thường</span> : null}
                            </div>
                          </td>
                          <td>{item.description || 'Chưa có mô tả'}</td>
                          <td>
                            <div className="system-admin-table-actions">
                              <button type="button" className="secondary" onClick={() => startEditMenu(item)}>Sửa</button>
                              <button type="button" className="secondary" onClick={() => deleteMenu(item.id)}>Xóa</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination pageData={menuPageData} onPageChange={setMenuPage} />
                </div>
              </section>
            </div>
          </section>
        )}

        {activeTab === 'shippers' && (
          <AdminShipperPanel branchOptions={branchOptions} />
        )}

        {adminToast ? (
          <div
            style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              background: '#fff',
              border: '1px solid #ddd',
              borderRadius: '8px',
              padding: '16px 20px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 9999,
              maxWidth: '320px',
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontWeight: '700', color: '#333', fontSize: '14px' }}>{adminToast.title}</p>
            <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>{adminToast.message}</p>
          </div>
        ) : null}
      </main>
    </div>
  )
}
