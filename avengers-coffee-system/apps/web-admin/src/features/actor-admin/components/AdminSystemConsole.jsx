import { useEffect, useMemo, useState } from 'react'
import { useSystemAdmin } from '../hooks/useSystemAdmin'
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
import { AdminKioskManagementPanel } from './AdminKioskManagementPanel'
import { AdminCustomerManagementPanel } from './AdminCustomerManagementPanel'
import { AdminSmtpConfigPanel } from './AdminSmtpConfigPanel'
import { AdminSatelliteKioskPanel } from './AdminSatelliteKioskPanel'
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
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: '#f7f9fb' }}>
      {/* KRAVIO ENTERPRISE SIDEBAR */}
      <aside
        style={{
          width: '260px',
          backgroundColor: '#ffffff',
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          flexShrink: 0,
          zIndex: 20
        }}
      >
        {/* Logo Section */}
        <div style={{ padding: '1.25rem 1.25rem 1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{ width: '34px', height: '34px', backgroundColor: '#0f172a', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0, 0, 0, 0.15)' }}>
            <span style={{ color: '#ffffff', fontWeight: '800', fontSize: '1.1rem' }}>A</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: '800', fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#0f172a', lineHeight: '1.15' }}>Avengers</span>
            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enterprise Console</span>
          </div>
        </div>
        
        {/* Global Sidebar Search */}
        <div style={{ padding: '0 1rem 0.85rem 1rem' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              placeholder="Tìm nhanh tính năng..."
              style={{
                width: '100%',
                padding: '0.45rem 2rem 0.45rem 2.15rem',
                backgroundColor: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '0.775rem',
                color: '#111827',
                outline: 'none',
                transition: 'border-color 0.15s ease'
              }}
              onFocus={(e) => { e.target.style.borderColor = '#2563eb'; e.target.style.backgroundColor = '#ffffff'; }}
              onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.backgroundColor = '#f9fafb'; }}
            />
            <span style={{ position: 'absolute', right: '0.65rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'monospace', fontWeight: '700' }}>⌘K</span>
          </div>
        </div>

        {/* Navigation Sections */}
        <nav className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 0.85rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          
          {/* NHÓM 1: TỔNG QUAN VÀ BÁO CÁO */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0.35rem 0.65rem', marginBottom: '0.35rem' }}>
              Tổng Quan và Báo Cáo
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: activeTab === 'overview' ? '700' : '500',
                color: activeTab === 'overview' ? '#2563eb' : '#475569',
                backgroundColor: activeTab === 'overview' ? '#eff6ff' : 'transparent',
                border: activeTab === 'overview' ? '1px solid #dbeafe' : '1px solid transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => { if (activeTab !== 'overview') e.currentTarget.style.backgroundColor = '#f8fafc' }}
              onMouseLeave={(e) => { if (activeTab !== 'overview') e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <LayoutGrid size={17} color={activeTab === 'overview' ? '#2563eb' : '#64748b'} />
              <span>Dashboard Tổng Quan</span>
            </button>
          </div>

          {/* NHÓM 2: SẢN PHẨM VÀ KHUYẾN MÃI */}
          <div>
            <button
              type="button"
              onClick={() => setActiveGroup(activeGroup === 'group-2' ? '' : 'group-2')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.45rem 0.65rem',
                border: 'none',
                background: activeGroup === 'group-2' ? '#f8fafc' : 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#334155',
                fontWeight: '800',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              <span>Sản Phẩm và Khuyến Mãi</span>
              {activeGroup === 'group-2' ? <ChevronDown size={14} color="#334155" strokeWidth={2.5} /> : <ChevronRight size={14} color="#64748b" strokeWidth={2.5} />}
            </button>
            
            {activeGroup === 'group-2' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.35rem', paddingLeft: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('categories')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'categories' ? '700' : '500',
                    color: activeTab === 'categories' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'categories' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'categories' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'categories') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'categories') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <FolderOpen size={16} color={activeTab === 'categories' ? '#2563eb' : '#64748b'} />
                  <span>Quản lý danh mục</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('menu')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'menu' ? '700' : '500',
                    color: activeTab === 'menu' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'menu' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'menu' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'menu') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'menu') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <Coffee size={16} color={activeTab === 'menu' ? '#2563eb' : '#64748b'} />
                  <span>Quản lý menu tổng</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('promotions')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'promotions' ? '700' : '500',
                    color: activeTab === 'promotions' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'promotions' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'promotions' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'promotions') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'promotions') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <Ticket size={16} color={activeTab === 'promotions' ? '#2563eb' : '#64748b'} />
                  <span>Khuyến mãi và Voucher</span>
                </button>
              </div>
            )}
          </div>

          {/* NHÓM 3: KHÁCH HÀNG VÀ CHĂM SÓC KHÁCH HÀNG */}
          <div>
            <button
              type="button"
              onClick={() => setActiveGroup(activeGroup === 'group-3' ? '' : 'group-3')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.45rem 0.65rem',
                border: 'none',
                background: activeGroup === 'group-3' ? '#f8fafc' : 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#334155',
                fontWeight: '800',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              <span>Khách Hàng và CSKH</span>
              {activeGroup === 'group-3' ? <ChevronDown size={14} color="#334155" strokeWidth={2.5} /> : <ChevronRight size={14} color="#64748b" strokeWidth={2.5} />}
            </button>
            
            {activeGroup === 'group-3' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.35rem', paddingLeft: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('customers')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'customers' ? '700' : '500',
                    color: activeTab === 'customers' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'customers' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'customers' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'customers') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'customers') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <Users size={16} color={activeTab === 'customers' ? '#2563eb' : '#64748b'} />
                  <span>Quản lý khách hàng</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('membership-config')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'membership-config' ? '700' : '500',
                    color: activeTab === 'membership-config' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'membership-config' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'membership-config' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'membership-config') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'membership-config') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <Settings size={16} color={activeTab === 'membership-config' ? '#2563eb' : '#64748b'} />
                  <span>Thiết lập hạng thành viên</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('survey-manage')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'survey-manage' ? '700' : '500',
                    color: activeTab === 'survey-manage' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'survey-manage' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'survey-manage' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'survey-manage') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'survey-manage') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <BarChart3 size={16} color={activeTab === 'survey-manage' ? '#2563eb' : '#64748b'} />
                  <span>Khảo sát khách hàng</span>
                </button>
              </div>
            )}
          </div>

          {/* NHÓM 4: MẠNG LƯỚI VÀ CHI NHÁNH */}
          <div>
            <button
              type="button"
              onClick={() => setActiveGroup(activeGroup === 'group-4' ? '' : 'group-4')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.45rem 0.65rem',
                border: 'none',
                background: activeGroup === 'group-4' ? '#f8fafc' : 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#334155',
                fontWeight: '800',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              <span>Mạng Lưới và Chi Nhánh</span>
              {activeGroup === 'group-4' ? <ChevronDown size={14} color="#334155" strokeWidth={2.5} /> : <ChevronRight size={14} color="#64748b" strokeWidth={2.5} />}
            </button>
            
            {activeGroup === 'group-4' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.35rem', paddingLeft: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setActiveTab('branches')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'branches' ? '700' : '500',
                    color: activeTab === 'branches' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'branches' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'branches' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'branches') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'branches') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <Store size={16} color={activeTab === 'branches' ? '#2563eb' : '#64748b'} />
                  <span>Quản lý chi nhánh</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('shippers')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'shippers' ? '700' : '500',
                    color: activeTab === 'shippers' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'shippers' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'shippers' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'shippers') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'shippers') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <Bike size={16} color={activeTab === 'shippers' ? '#2563eb' : '#64748b'} />
                  <span>Quản lý shipper</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('kiosks')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'kiosks' ? '700' : '500',
                    color: activeTab === 'kiosks' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'kiosks' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'kiosks' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'kiosks') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'kiosks') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <Monitor size={16} color={activeTab === 'kiosks' ? '#2563eb' : '#64748b'} />
                  <span>Quản lý Kiosk</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('satellite_kiosks')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'satellite_kiosks' ? '700' : '500',
                    color: activeTab === 'satellite_kiosks' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'satellite_kiosks' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'satellite_kiosks' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'satellite_kiosks') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'satellite_kiosks') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <MapPin size={16} color={activeTab === 'satellite_kiosks' ? '#2563eb' : '#64748b'} />
                  <span>Điểm Bán Take-away</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'users' ? '700' : '500',
                    color: activeTab === 'users' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'users' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'users' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'users') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'users') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <UserCog size={16} color={activeTab === 'users' ? '#2563eb' : '#64748b'} />
                  <span>Quản lý nhân sự</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('smtp')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'smtp' ? '700' : '500',
                    color: activeTab === 'smtp' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'smtp' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'smtp' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'smtp') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'smtp') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <MailCheck size={16} color={activeTab === 'smtp' ? '#2563eb' : '#64748b'} />
                  <span>Cấu hình Email &amp; SMTP</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('account')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    padding: '0.55rem 0.65rem',
                    borderRadius: '8px',
                    fontSize: '0.825rem',
                    fontWeight: activeTab === 'account' ? '700' : '500',
                    color: activeTab === 'account' ? '#2563eb' : '#475569',
                    backgroundColor: activeTab === 'account' ? '#eff6ff' : 'transparent',
                    border: activeTab === 'account' ? '1px solid #dbeafe' : '1px solid transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={(e) => { if (activeTab !== 'account') e.currentTarget.style.backgroundColor = '#f8fafc' }}
                  onMouseLeave={(e) => { if (activeTab !== 'account') e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <ShieldCheck size={16} color={activeTab === 'account' ? '#2563eb' : '#64748b'} />
                  <span>Hồ sơ và Bảo mật</span>
                </button>
              </div>
            )}
          </div>

        </nav>

        {/* User Profile (Bottom Widget) */}
        <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid #e5e7eb', backgroundColor: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              backgroundColor: '#ffedd5',
              color: '#ea580c',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '800',
              fontSize: '0.825rem',
              flexShrink: 0
            }}>
              AD
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.825rem', fontWeight: '700', color: '#111827', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {session?.user?.tenDangNhap || 'Quản trị viên Tổng'}
              </p>
              <p style={{ margin: 0, fontSize: '0.7rem', color: '#9ca3af', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {session?.user?.email || 'admin@avengers.coffee'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            style={{
              width: '100%',
              height: '36px',
              backgroundColor: '#fef2f2',
              color: '#ef4444',
              border: '1px solid #fee2e2',
              borderRadius: '6px',
              fontWeight: '700',
              fontSize: '0.8rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ef4444'
              e.currentTarget.style.color = '#ffffff'
              e.currentTarget.style.borderColor = '#ef4444'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#fef2f2'
              e.currentTarget.style.color = '#ef4444'
              e.currentTarget.style.borderColor = '#fee2e2'
            }}
          >
            <LogOut size={15} /> <span>Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT WRAPPER */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', backgroundColor: '#f7f9fb' }}>
        
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
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="text"
                placeholder="Tìm kiếm dữ liệu..."
                style={{
                  padding: '0.4rem 2rem 0.4rem 2.15rem',
                  borderRadius: '6px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                  fontSize: '0.8rem',
                  outline: 'none',
                  width: '230px',
                  color: '#111827'
                }}
                onFocus={(e) => { e.target.style.borderColor = '#2563eb'; e.target.style.backgroundColor = '#ffffff'; }}
                onBlur={(e) => { e.target.style.borderColor = '#e5e7eb'; e.target.style.backgroundColor = '#f9fafb'; }}
              />
              <span style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', color: '#9ca3af', fontFamily: 'monospace' }}>⌘K</span>
            </div>
            
            <AdminNotificationBell session={session} />
          </div>
        </header>

        {/* SCROLLABLE VIEWPORT CONTENT */}
        <div className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', backgroundColor: '#f7f9fb' }}>
          {activeTab === 'account' ? <AccountCenterPanel session={session} /> : null}

          {activeTab === 'overview' && (
            <AdminOverviewDashboardPanel
              statsState={statsState}
              dashboardSummary={dashboardSummary}
              roleChartRows={roleChartRows}
              branchChartRows={branchChartRows}
              recentOrders={recentOrders}
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
        </div>
      </main>
    </div>
  )
}
