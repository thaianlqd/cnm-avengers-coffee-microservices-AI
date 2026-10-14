import { WorkspaceSidebar, WorkspaceSearch } from '../../../components/console/WorkspaceNavigation'
import { DashboardSkeleton } from '../../../components/console/DashboardCharts'
import { useEffect, useMemo, useState, lazy, Suspense } from 'react'
import { WorkspaceErrorBoundary } from '../../../components/console/WorkspaceErrorBoundary'
import { useSystemAdmin } from '../hooks/useSystemAdmin'
const AdminShipperPanel = lazy(() => import('./AdminShipperPanel').then(module => ({ default: module.AdminShipperPanel })))
import { AccountCenterPanel } from '../../shared/components/AccountCenterPanel'
import { AdminNotificationBell } from '../../shared/components/AdminNotificationBell'
import { ManagerSurveyPanel } from '../../manager-dashboard/components/ManagerSurveyPanel'
const AdminMembershipConfigPanel = lazy(() => import('./AdminMembershipConfigPanel').then(module => ({ default: module.AdminMembershipConfigPanel })))
import { BranchDetailReviewsView } from './BranchDetailReviewsView'
import { AdminCategoryManagementPanel } from './AdminCategoryManagementPanel'
const AdminMenuManagementPanel = lazy(() => import('./AdminMenuManagementPanel').then(module => ({ default: module.AdminMenuManagementPanel })))
const AdminPromotionManagementPanel = lazy(() => import('./AdminPromotionManagementPanel').then(module => ({ default: module.AdminPromotionManagementPanel })))
const AdminBranchManagementPanel = lazy(() => import('./AdminBranchManagementPanel').then(module => ({ default: module.AdminBranchManagementPanel })))
import { AdminOverviewDashboardPanel } from './AdminOverviewDashboardPanel'
const AdminUserManagementPanel = lazy(() => import('./AdminUserManagementPanel').then(module => ({ default: module.AdminUserManagementPanel })))
const AdminKioskManagementPanel = lazy(() => import('./AdminKioskManagementPanel').then(module => ({ default: module.AdminKioskManagementPanel })))
const AdminCustomerManagementPanel = lazy(() => import('./AdminCustomerManagementPanel').then(module => ({ default: module.AdminCustomerManagementPanel })))
const AdminSmtpConfigPanel = lazy(() => import('./AdminSmtpConfigPanel').then(module => ({ default: module.AdminSmtpConfigPanel })))
const AdminSatelliteKioskPanel = lazy(() => import('./AdminSatelliteKioskPanel').then(module => ({ default: module.AdminSatelliteKioskPanel })))
import { LayoutGrid, Users, UserCog, Settings, Store, FolderOpen, Coffee, ShieldCheck, Ticket, BarChart3, Brain, Activity, Bike, Search, ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, PieChart, Package, Map, UsersIcon, Monitor, TrendingUp, BarChart2, MapPin, Info, ArrowUpDown, UserPlus, Edit2, Trash2, Filter, MoreVertical, Coins, LogOut, MailCheck, Mail, Send } from 'lucide-react'

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

const ADMIN_NAV_GROUPS = [
  { label: 'Tổng quan', items: [{ id: 'overview', label: 'Dashboard hệ thống', icon: LayoutGrid }] },
  { label: 'Sản phẩm & khuyến mãi', items: [
    { id: 'categories', label: 'Danh mục sản phẩm', icon: FolderOpen },
    { id: 'menu', label: 'Thực đơn', icon: Coffee },
    { id: 'promotions', label: 'Khuyến mãi & voucher', icon: Ticket },
  ] },
  { label: 'Khách hàng', items: [
    { id: 'customers', label: 'Quản lý khách hàng', icon: Users },
    { id: 'membership-config', label: 'Hạng thành viên', icon: Settings },
    { id: 'survey-manage', label: 'Khảo sát & phản hồi', icon: BarChart3 },
  ] },
  { label: 'Mạng lưới & hệ thống', items: [
    { id: 'branches', label: 'Chi nhánh', icon: Store },
    { id: 'shippers', label: 'Nhân viên giao hàng', icon: Bike },
    { id: 'kiosks', label: 'Kiosk nhượng quyền', icon: Coffee },
    { id: 'satellite_kiosks', label: 'Kiosk vệ tinh', icon: Monitor },
    { id: 'users', label: 'Tài khoản hệ thống', icon: UserCog },
    { id: 'smtp', label: 'Email & SMTP', icon: MailCheck },
    { id: 'account', label: 'Hồ sơ & bảo mật', icon: ShieldCheck },
  ] },
]

const PROMOTION_TYPE_LABELS = { PERCENT: 'Giảm phần trăm (%)', FIXED: 'Giảm tiền (VNĐ)', FREE_ITEM: 'Tặng kèm món' }
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
    recentOrders,
    recentOrdersState,
    recentUsers,
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
    <div className="console-shell" data-actor="admin" style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: '#f7f9fb' }}>
      <WorkspaceSidebar groups={ADMIN_NAV_GROUPS} activeTab={activeTab} onSelect={setActiveTab} session={session} label="Quản trị hệ thống" onLogout={onLogout} />

      {/* MAIN CONTENT WRAPPER */}
      <main className="console-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', backgroundColor: '#f7f9fb' }}>
        
        {/* TOP NAVIGATION BAR */}
        <header
          style={{
            height: '60px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 2rem',
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #e5e7eb',
            flexShrink: 0
          }}
        >
          {(() => {
            const TAB_BREADCRUMBS = {
              'overview': { group: 'Tổng quan', label: 'Dashboard tổng' },
              'categories': { group: 'Sản phẩm & Menu', label: 'Quản lý danh mục' },
              'menu': { group: 'Sản phẩm & Menu', label: 'Quản lý menu tổng' },
              'promotions': { group: 'Sản phẩm & Menu', label: 'Khuyến mãi & Voucher' },
              'customers': { group: 'Khách hàng & CSKH', label: 'Quản lý khách hàng' },
              'membership-config': { group: 'Khách hàng & CSKH', label: 'Thiết lập Membership' },
              'survey-manage': { group: 'Khách hàng & CSKH', label: 'Quản lý Khảo sát' },
              'branches': { group: 'Mạng lưới & Hệ thống', label: 'Quản lý chi nhánh' },
              'shippers': { group: 'Mạng lưới & Hệ thống', label: 'Quản lý shipper' },
              'satellite_kiosks': { group: 'Mạng lưới', label: 'Kiosk vệ tinh' },
              'kiosks': { group: 'Mạng lưới & Hệ thống', label: 'Quản lý Kiosk' },
              'users': { group: 'Mạng lưới & Hệ thống', label: 'Quản lý người dùng' },
              'smtp': { group: 'Mạng lưới & Hệ thống', label: 'Cấu hình Email & SMTP' },
              'account': { group: 'Tài khoản', label: 'Hồ sơ & Bảo mật' },
            }
            const activeCrumb = TAB_BREADCRUMBS[activeTab] || { group: 'Quản trị', label: 'Hệ thống' }

            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem' }}>
                <LayoutGrid size={15} color="#9ca3af" />
                <span style={{ color: '#6b7280', fontWeight: '500' }}>{activeCrumb.group}</span>
                <span style={{ color: '#d1d5db', margin: '0 0.15rem' }}>/</span>
                <span style={{ fontWeight: '700', color: '#111827' }}>{activeCrumb.label}</span>
              </div>
            )
          })()}
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <WorkspaceSearch items={ADMIN_NAV_GROUPS.flatMap(group => group.items.map(item => ({ ...item, group: group.label })))} onSelect={setActiveTab} />

            <AdminNotificationBell session={session} />
          </div>
        </header>

        {/* SCROLLABLE VIEWPORT CONTENT */}
        <div key={activeTab} className="custom-scrollbar console-admin-body" style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f7f9fb' }}>
          <WorkspaceErrorBoundary key={activeTab} inline>
          <Suspense fallback={<DashboardSkeleton />}>
          {activeTab === 'account' ? <AccountCenterPanel session={session} /> : null}

          {activeTab === 'overview' && (
            <AdminOverviewDashboardPanel
              statsState={statsState}
              dashboardSummary={dashboardSummary}
              roleChartRows={roleChartRows}
              branchChartRows={branchChartRows}
              recentOrders={recentOrders}
              recentOrdersState={recentOrdersState}
              recentUsers={recentUsers}
              branchesState={branchesState}
              menuState={menuState}
              promotionsState={promotionsState}
            />
          )}

        {activeTab === 'promotions' && (
          <section style={{ padding: '1.75rem 2rem', backgroundColor: '#f7f9fb', minHeight: '100%' }}>
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

        {activeTab === 'kiosks' && (
          <AdminKioskManagementPanel session={session} />
        )}

        {activeTab === 'smtp' && (
          <AdminSmtpConfigPanel />
        )}
        {activeTab === 'satellite_kiosks' && (
          <AdminSatelliteKioskPanel session={session} />
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
            <section style={{ padding: '1.75rem 2rem', backgroundColor: '#f7f9fb', minHeight: '100%' }}>
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

        {activeTab === 'categories' && (
          <section style={{ padding: '1.75rem 2rem', backgroundColor: '#f7f9fb', minHeight: '100%' }}>
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
          <section style={{ padding: '1.75rem 2rem', backgroundColor: '#f7f9fb', minHeight: '100%' }}>
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
          </Suspense>
          </WorkspaceErrorBoundary>
        </div>
      </main>
    </div>
  )
}
