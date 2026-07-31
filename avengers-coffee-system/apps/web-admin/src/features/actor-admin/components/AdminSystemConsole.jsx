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
import { AdminCategoryManagementPanel } from './AdminCategoryManagementPanel'
import { AdminMenuManagementPanel } from './AdminMenuManagementPanel'
import { AdminPromotionManagementPanel } from './AdminPromotionManagementPanel'
import { AdminBranchManagementPanel } from './AdminBranchManagementPanel'
import { AdminOverviewDashboardPanel } from './AdminOverviewDashboardPanel'
import { AdminUserManagementPanel } from './AdminUserManagementPanel'
import { AdminCustomerManagementPanel } from './AdminCustomerManagementPanel'
import { LayoutGrid, Users, UserCog, Settings, Store, FolderOpen, Coffee, ShieldCheck, Ticket, BarChart3, Brain, Activity, Bike, Search, ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, PieChart, Package, Map, UsersIcon, Monitor, TrendingUp, BarChart2, MapPin, Info, ArrowUpDown, UserPlus, Edit2, Trash2, Filter, MoreVertical, Coins } from 'lucide-react'
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
const PAGE_SIZE = 10
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', fontSize: '0.875rem', color: '#6b7280', paddingTop: '0.85rem', marginTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
      <span>Hiển thị {pageData.from} - {pageData.to} trên tổng số {pageData.total}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(1)} disabled={pageData.page <= 1} title="Trang đầu">
          <ChevronsLeft size={18} />
        </button>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.page - 1)} disabled={pageData.page <= 1} title="Trang trước">
          <ChevronLeft size={18} />
        </button>
        <span style={{ margin: '0 0.5rem', fontWeight: '600', color: '#334155', fontSize: '0.825rem' }}>Trang {pageData.page} trên {pageData.totalPages}</span>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.page + 1)} disabled={pageData.page >= pageData.totalPages} title="Trang sau">
          <ChevronRight size={18} />
        </button>
        <button type="button" className="admin-pg-btn" onClick={() => onPageChange(pageData.totalPages)} disabled={pageData.page >= pageData.totalPages} title="Trang cuối">
          <ChevronsRight size={18} />
        </button>
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
    loadBranches,
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
    loadCategories,
    categoryForm,
    setCategoryForm,
    editingCategoryId,
    startEditCategory,
    cancelEditCategory,
    saveCategory,
    deleteCategory,
    savingCategory,
    menuState,
    loadMenu,
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
    loadPromotions,
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

  const staffUsersOnly = useMemo(() => {
    return (usersState?.items || []).filter((u) => u && u.vai_tro !== 'CUSTOMER')
  }, [usersState?.items])

  const usersPageData = useMemo(() => buildPage(staffUsersOnly, usersPage), [staffUsersOnly, usersPage])
  const customersPageData = useMemo(() => buildPage(customersState?.items || [], customersPage), [customersState?.items, customersPage])
  const branchesPageData = useMemo(() => buildPage(branchesState?.items || [], branchesPage), [branchesState?.items, branchesPage])

  const filteredCategories = useMemo(() => {
    const keyword = normalizeText(categoryKeyword)
    const items = (categoriesState?.items || []).filter(Boolean)
    if (!keyword) return items
    return items.filter((cat) => normalizeText(cat?.label || '').includes(keyword))
  }, [categoriesState?.items, categoryKeyword])

  const categoriesPageData = useMemo(() => buildPage(filteredCategories, categoriesPage), [filteredCategories, categoriesPage])

  const filteredMenuItems = useMemo(() => {
    const keyword = normalizeText(menuKeyword)
    const items = (menuState?.items || []).filter(Boolean)
    if (!keyword) return items
    return items.filter((item) => {
      const haystack = normalizeText([
        item?.name || '',
        item?.category || '',
        item?.description || '',
      ].join(' '))
      return haystack.includes(keyword)
    })
  }, [menuState?.items, menuKeyword])

  const menuPageData = useMemo(() => buildPage(filteredMenuItems, menuPage), [filteredMenuItems, menuPage])
  const promotionsPageData = useMemo(() => buildPage(promotionFilteredItems || [], promotionsPage), [promotionFilteredItems, promotionsPage])

  const [activeGroup, setActiveGroup] = useState('group-1')
  const [selectedAttributeSelect, setSelectedAttributeSelect] = useState('')
  const [selectedBranchForReview, setSelectedBranchForReview] = useState(null)
  const [customAttributeName, setCustomAttributeName] = useState('')
  const [newOptionState, setNewOptionState] = useState({}) // { [attrName]: { name: '', price: '' } }
  const [openCustomerActionId, setOpenCustomerActionId] = useState(null)
  const [openUserActionId, setOpenUserActionId] = useState(null)

  useEffect(() => {
    const handleClickOutside = () => {
      setOpenCustomerActionId(null)
      setOpenUserActionId(null)
    }
    window.addEventListener('click', handleClickOutside)
    return () => window.removeEventListener('click', handleClickOutside)
  }, [])

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
        <div style={{ padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.625rem', borderBottom: '1px solid #f1f5f9', marginBottom: '0.75rem' }}>
          <div style={{ width: '1.875rem', height: '1.875rem', backgroundColor: '#4f46e5', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(79, 70, 229, 0.25)' }}>
            <span style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '1rem' }}>A</span>
          </div>
          <span style={{ fontWeight: '700', fontSize: '1.125rem', letterSpacing: '-0.025em', color: '#0f172a' }}>Avengers</span>
        </div>
        
        <div style={{ padding: '0 1.25rem', marginBottom: '0.5rem' }}>
          <p className="staff-tag" style={{ margin: 0, fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94a3b8' }}>
            Main Navigation
          </p>
        </div>

        <div className="system-admin-tabs">
          {/* GROUP 1: TỔNG QUAN & BÁO CÁO */}
          <div style={{ marginBottom: '0.85rem' }}>
            <button type="button" className="nav-group-header-btn" onClick={() => setActiveGroup(activeGroup === 'group-1' ? '' : 'group-1')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <PieChart size={15} color="#64748b" /> <span>Tổng quan &amp; Báo cáo</span>
              </div>
              {activeGroup === 'group-1' ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </button>
            {activeGroup === 'group-1' && (
              <div className="nav-group-children">
                <button type="button" className={activeTab === 'overview' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('overview')}>
                  <LayoutGrid size={15} /> Dashboard tổng
                </button>
                <button type="button" className={activeTab === 'ai-analytics' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('ai-analytics')}>
                  <Brain size={15} /> Phân tích mua sắm
                </button>
                <button type="button" className={activeTab === 'system-ops' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('system-ops')}>
                  <Activity size={15} /> Giám sát hệ thống
                </button>
              </div>
            )}
          </div>

          {/* GROUP 2: SẢN PHẨM & KINH DOANH */}
          <div style={{ marginBottom: '0.85rem' }}>
            <button type="button" className="nav-group-header-btn" onClick={() => setActiveGroup(activeGroup === 'group-2' ? '' : 'group-2')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Package size={15} color="#64748b" /> <span>Sản phẩm &amp; Kinh doanh</span>
              </div>
              {activeGroup === 'group-2' ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </button>
            {activeGroup === 'group-2' && (
              <div className="nav-group-children">
                <button type="button" className={activeTab === 'categories' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('categories')}>
                  <FolderOpen size={15} /> Quản lý danh mục
                </button>
                <button type="button" className={activeTab === 'menu' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('menu')}>
                  <Coffee size={15} /> Quản lý menu tổng
                </button>
                <button type="button" className={activeTab === 'promotions' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('promotions')}>
                  <Ticket size={15} /> Khuyến mãi &amp; Voucher
                </button>
              </div>
            )}
          </div>

          {/* GROUP 3: MẠNG LƯỚI & QUẢN TRỊ HỆ THỐNG */}
          <div style={{ marginBottom: '0.85rem' }}>
            <button type="button" className="nav-group-header-btn" onClick={() => setActiveGroup(activeGroup === 'group-3' ? '' : 'group-3')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Map size={15} color="#64748b" /> <span>Mạng lưới &amp; Quản trị hệ thống</span>
              </div>
              {activeGroup === 'group-3' ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </button>
            {activeGroup === 'group-3' && (
              <div className="nav-group-children">
                <button type="button" className={activeTab === 'branches' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('branches')}>
                  <Store size={15} /> Quản lý chi nhánh
                </button>
                <button type="button" className={activeTab === 'shippers' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('shippers')}>
                  <Bike size={15} /> Quản lý giao hàng
                </button>
                <button type="button" className={activeTab === 'customers' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('customers')}>
                  <UserCog size={15} /> Quản lý khách hàng
                </button>
                <button type="button" className={activeTab === 'membership-config' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('membership-config')}>
                  <Settings size={15} /> Thiết lập Membership
                </button>
                <button type="button" className={activeTab === 'survey-manage' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('survey-manage')}>
                  <BarChart3 size={15} /> Quản lý Khảo sát
                </button>
                <button type="button" className={activeTab === 'users' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('users')}>
                  <Users size={15} /> Quản lý người dùng
                </button>
                <button type="button" className={activeTab === 'account' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('account')}>
                  <ShieldCheck size={15} /> Hồ sơ &amp; Bảo mật
                </button>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 'auto', padding: '0.75rem 1rem', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem', padding: '0.25rem 0' }}>
            <div style={{ width: '2.125rem', height: '2.125rem', borderRadius: '999px', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.75rem', border: '1px solid #c7d2fe' }}>
              AD
            </div>
            <div style={{ overflow: 'hidden' }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: '600', color: '#0f172a', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{session?.user?.tenDangNhap || 'System Admin'}</p>
              <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{session?.user?.email || 'admin@avengers.com'}</p>
            </div>
          </div>
          <button type="button" className="logout-btn" onClick={onLogout} style={{ width: '100%' }}>Đăng xuất</button>
        </div>
      </aside>

      <main className="system-admin-content" style={{ padding: 0, gap: 0 }}>
        <header className="system-admin-hero" style={{ padding: '1rem 2rem', backgroundColor: '#ffffff', borderBottom: '1px solid #e5e7eb', borderRadius: 0, margin: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Overview</span>
            <span style={{ color: '#d1d5db' }}>/</span>
            <span style={{ fontWeight: '500', color: '#111827', fontSize: '0.875rem' }}>Dashboard</span>
          </div>
          
          <div className="system-admin-hero-tools" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ position: 'relative' }}>
               <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
               <input type="text" placeholder="Search anything" style={{ padding: '0.5rem 1rem 0.5rem 2.25rem', borderRadius: '6px', border: '1px solid #e5e7eb', backgroundColor: '#f9fafb', fontSize: '0.875rem', outline: 'none', width: '250px' }} />
               <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.625rem', color: '#9ca3af', fontFamily: 'monospace' }}>⌘K</span>
            </div>
            <AdminNotificationBell session={session} />
          </div>
        </header>

        {activeTab === 'account' ? <AccountCenterPanel session={session} /> : null}

        {activeTab === 'overview' && (
          <AdminOverviewDashboardPanel
            statsState={statsState}
            dashboardSummary={dashboardSummary}
            roleChartRows={roleChartRows}
            branchChartRows={branchChartRows}
          />
        )}

        {activeTab === 'promotions' && (
          <section className="panel system-admin-panel" style={{ padding: '24px 28px' }}>
            <AdminPromotionManagementPanel
              promotionsState={promotionsState}
              loadPromotions={loadPromotions}
              promotionFilter={promotionFilter}
              setPromotionFilter={setPromotionFilter}
              promotionFilteredItems={promotionFilteredItems}
              promotionForm={promotionForm}
              setPromotionForm={setPromotionForm}
              editingPromotionCode={editingPromotionCode}
              startEditPromotion={startEditPromotion}
              cancelEditPromotion={cancelEditPromotion}
              savePromotion={savePromotion}
              deletePromotion={deletePromotion}
              savingPromotion={savingPromotion}
              PROMOTION_TYPES={PROMOTION_TYPES}
              menuItemsList={menuItemsList}
            />
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
          <AdminUserManagementPanel
            userForm={userForm}
            setUserForm={setUserForm}
            editingUserId={editingUserId}
            startEditUser={startEditUser}
            cancelEditUser={cancelEditUser}
            saveUser={saveUser}
            deleteUser={deleteUser}
            savingUser={savingUser}
            branchOptions={branchOptions}
            userFilters={userFilters}
            setUserFilters={setUserFilters}
            loadUsers={loadUsers}
            usersState={usersState}
            usersPageData={usersPageData}
            usersPage={usersPage}
            setUsersPage={setUsersPage}
          />
        )}

        {activeTab === 'customers' && (
          <AdminCustomerManagementPanel
            customersState={customersState}
            customerForm={customerForm}
            setCustomerForm={setCustomerForm}
            editingCustomerId={editingCustomerId}
            startEditCustomer={startEditCustomer}
            cancelEditCustomer={cancelEditCustomer}
            saveCustomer={saveCustomer}
            deleteCustomer={deleteCustomer}
            savingCustomer={savingCustomer}
            editingCustomerMembershipId={editingCustomerMembershipId}
            customerMembershipForm={customerMembershipForm}
            setCustomerMembershipForm={setCustomerMembershipForm}
            startEditCustomerMembership={startEditCustomerMembership}
            cancelEditCustomerMembership={cancelEditCustomerMembership}
            saveCustomerMembership={saveCustomerMembership}
            savingCustomerMembership={savingCustomerMembership}
            customerFilters={customerFilters}
            setCustomerFilters={setCustomerFilters}
            loadCustomers={loadCustomers}
            customersPageData={customersPageData}
            setCustomersPage={setCustomersPage}
          />
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
            <section className="panel system-admin-panel" style={{ padding: '24px 28px' }}>
              <AdminBranchManagementPanel
                branchesState={branchesState}
                loadBranches={loadBranches}
                branchForm={branchForm}
                setBranchForm={setBranchForm}
                editingBranchCode={editingBranchCode}
                startEditBranch={startEditBranch}
                cancelEditBranch={cancelEditBranch}
                saveBranch={saveBranch}
                deleteBranch={deleteBranch}
                savingBranch={savingBranch}
                locationSearch={locationSearch}
                setLocationSearch={setLocationSearch}
                cityOptions={cityOptions}
                districtOptions={districtOptions}
                wardOptions={wardOptions}
                branchAddressPreview={branchAddressPreview}
                setSelectedBranchForReview={setSelectedBranchForReview}
              />
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
          <section className="panel system-admin-panel" style={{ padding: '24px 28px' }}>
            <AdminCategoryManagementPanel
              categoriesState={categoriesState}
              categoryForm={categoryForm}
              setCategoryForm={setCategoryForm}
              editingCategoryId={editingCategoryId}
              savingCategory={savingCategory}
              startEditCategory={startEditCategory}
              cancelEditCategory={cancelEditCategory}
              saveCategory={saveCategory}
              deleteCategory={deleteCategory}
              categoryKeyword={categoryKeyword}
              setCategoryKeyword={setCategoryKeyword}
              filteredCategories={filteredCategories}
              categoriesPageData={categoriesPageData}
              categoriesPage={categoriesPage}
              setCategoriesPage={setCategoriesPage}
              onRefresh={loadCategories}
            />
          </section>
        )}

        {activeTab === 'menu' && (
          <section className="panel system-admin-panel" style={{ padding: '24px 28px' }}>
            <AdminMenuManagementPanel
              menuState={menuState}
              loadMenu={loadMenu}
              menuForm={menuForm}
              setMenuForm={setMenuForm}
              editingMenuId={editingMenuId}
              savingMenu={savingMenu}
              startEditMenu={startEditMenu}
              cancelEditMenu={cancelEditMenu}
              saveMenu={saveMenu}
              deleteMenu={deleteMenu}
              menuKeyword={menuKeyword}
              setMenuKeyword={setMenuKeyword}
              filteredMenuItems={filteredMenuItems}
              menuPageData={menuPageData}
              menuPage={menuPage}
              setMenuPage={setMenuPage}
              uploadState={uploadState}
              uploadMenuImage={uploadMenuImage}
              clearMenuImage={clearMenuImage}
              categoriesState={categoriesState}
              attributesState={attributesState}
            />
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
