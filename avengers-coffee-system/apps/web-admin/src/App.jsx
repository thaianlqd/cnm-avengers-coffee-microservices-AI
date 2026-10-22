import { WorkspaceSidebar, WorkspaceSearch } from './components/console/WorkspaceNavigation'
import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import './App.css'
import './Console.css'
import './Workspace.css'
import { DashboardSkeleton } from './components/console/DashboardCharts'
import { WorkspaceErrorBoundary } from './components/console/WorkspaceErrorBoundary'
import {
  ACCOUNT_TAB,
  DASHBOARD_ROLES,
  MANAGER_CUSTOMER_CARE_TAB,
  MANAGER_EMPLOYEE_MANAGEMENT_TAB,
  MANAGER_SHIFT_APPROVAL_TAB,
  MANAGER_WORKFORCE_MANAGEMENT_TAB,
  MANAGER_SURVEY_TAB,
  NAV_TABS,
  ORDER_STATUS_LABEL,
  POS_ORDER_TYPE_OPTIONS,
  POS_PAYMENT_OPTIONS,
  WORKFORCE_TAB,
} from './features/admin-dashboard/constants'
import { useAdminDashboard } from './features/admin-dashboard/hooks/useAdminDashboard'
const ManagerSurveyPanel = lazy(() => import('./features/manager-dashboard/components/ManagerSurveyPanel').then(module => ({ default: module.ManagerSurveyPanel })))
import { fmtMoney, normalizeViText } from './features/admin-dashboard/utils'
import { LoginScreen } from './features/admin-dashboard/components/LoginScreen'
import { OverviewPanel } from './features/admin-dashboard/components/OverviewPanel'
const OrdersPanel = lazy(() => import('./features/admin-dashboard/components/OrdersPanel').then(module => ({ default: module.OrdersPanel })))
const MenuPanel = lazy(() => import('./features/admin-dashboard/components/MenuPanel').then(module => ({ default: module.MenuPanel })))
const ShiftPanel = lazy(() => import('./features/admin-dashboard/components/ShiftPanel').then(module => ({ default: module.ShiftPanel })))
const PosOrderPanel = lazy(() => import('./features/admin-dashboard/components/PosOrderPanel').then(module => ({ default: module.PosOrderPanel })))
const ManagerWorkforcePanel = lazy(() => import('./features/manager-dashboard/components/ManagerWorkforcePanel').then(module => ({ default: module.ManagerWorkforcePanel })))
const ManagerEmployeePanel = lazy(() => import('./features/manager-dashboard/components/ManagerEmployeePanel').then(module => ({ default: module.ManagerEmployeePanel })))
const ManagerCustomerCarePanel = lazy(() => import('./features/manager-dashboard/components/ManagerCustomerCarePanel').then(module => ({ default: module.ManagerCustomerCarePanel })))
import { StaffWorkShiftsPanel } from './features/staff-dashboard/components/StaffWorkShiftsPanel'
import StaffDeliveryPanel from './features/staff-dashboard/components/StaffDeliveryPanel'
const AdminSystemConsole = lazy(() => import('./features/actor-admin/components/AdminSystemConsole').then(module => ({ default: module.AdminSystemConsole })))
import {
  Bike,
  Search,
  LogOut,
  LayoutGrid,
  ShoppingBag,
  Monitor,
  Store,
  Clock,
  Coffee,
  Newspaper,
  Calendar,
  UserCheck,
  CheckCircle2,
  Users,
  Truck,
  MessageSquare,
  BarChart3,
  ChevronDown,
  ChevronRight
} from './components/console/WorkspaceIcons'
const ManagerShipperPanel = lazy(() => import('./features/manager-dashboard/components/ManagerShipperPanel').then(module => ({ default: module.ManagerShipperPanel })))
import { AdminChatWidget } from './features/admin-dashboard/components/AdminChatWidget'
import StaffInbox from './features/admin-dashboard/components/StaffInbox'
const TableManagementPanel = lazy(() => import('./features/admin-dashboard/components/TableManagementPanel').then(module => ({ default: module.TableManagementPanel })))
import { AUTH_INVALID_EVENT } from './lib/adminFetch'
import { LayoutGrid as FiGrid, ShoppingBag as FiShoppingBag, Monitor as FiMonitor, Truck as FiTruck, MapPin as FiMapPin, Clock as FiClock, Coffee as FiCoffee, FileText as FiFileText, Calendar as FiCalendar, MessageSquare as FiMessageSquare, CheckCircle2 as FiCheckCircle, UsersIcon as FiUsers, BarChart2 as FiBarChart2 } from './components/console/WorkspaceIcons'
import { AdminNotificationBell } from './features/shared/components/AdminNotificationBell'
import { TopbarUserDropdown } from './features/shared/components/UserProfileModals'
const NewsPanel = lazy(() => import('./features/shared/components/NewsPanel').then(module => ({ default: module.NewsPanel })))
const FranchisePanel = lazy(() => import('./features/franchise/FranchisePanel').then(module => ({ default: module.FranchisePanel })))
import { KioskComboReceiver } from './features/staff-dashboard/components/KioskComboReceiver'
const FranchiseePortal = lazy(() => import('./features/franchise/FranchiseePortal').then(module => ({ default: module.FranchiseePortal })))
const FranchiseStaffPortal = lazy(() => import('./features/franchise/FranchiseStaffPortal').then(module => ({ default: module.FranchiseStaffPortal })))
const AccountantFranchiseShell = lazy(() => import('./features/franchise/AccountantFranchiseShell').then(module => ({ default: module.AccountantFranchiseShell })))

function AppContent() {
  const consoleMainRef = useRef(null)
  const [adminToast, setAdminToast] = useState(null)

  const showAdminToast = (title, message) => {
    setAdminToast({ title, message })
  }

  const {
    loginForm,
    setLoginForm,
    loginStatus,
    session,
    activeTab,
    setActiveTab,
    ordersState,
    inventoryState,
    updatingOrderId,
    savingStockId,
    savingMenuStatusId,
    overviewRange,
    setOverviewRange,
    stockDrafts,
    setStockDrafts,
    shiftInput,
    setShiftInput,
    shiftDate,
    setShiftDate,
    shiftRange,
    setShiftRange,
    shiftPreview,
    shiftHistory,
    shiftStatus,
    closingShift,
    approvingShiftId,
    posForm,
    setPosForm,
    posItems,
    posCashInput,
    setPosCashInput,
    posSubtotal,
    posVat,
    posTotal,
    posChange,
    isCashMethod,
    posCashInsufficient,
    creatingPosOrder,
    posStatus,
    lastPosOrder,
    workShiftForm,
    setWorkShiftForm,
    workShiftState,
    myWorkShiftState,
    workforceUsersState,
    creatingWorkShift,
    updatingWorkShiftId,
    staffShiftRequestState,
    managerShiftRequestState,
    creatingShiftRequest,
    handlingShiftRequestId,
    checkingAttendanceShiftId,
    reviewsState,
    replyingReviewId,
    totals,
    overviewData,
    login,
    logout,
    capNhatTrangThaiDon,
    capNhatDonChoStaff,
    xoaDonChoStaff,
    hoanHuyDonHangPos,
    activeKioskShift,
    moCaKiosk,
    capNhatTonKho,
    capNhatTrangThaiBanMon,
    chotCaTienMat,
    suaCaLamViec,
    xoaCaLamViec,
    pheDuyetCaLamViec,
    addPosItem,
    updatePosItem,
    removePosItem,
    taoDonTaiQuay,
    inHoaDonPos,
    taoLichLamViec,
    capNhatChamCong,
    xoaLichLamViec,
    taoYeuCauDangKyCa,
    suaYeuCauDangKyCa,
    xuLyYeuCauDangKyCa,
    xoaYeuCauDangKyCa,
    xoaYeuCauDangKyCaChoManager,
    chamCongCaLamViecCaNhan,
    phanHoiReview,
    suaPhanHoiReview,
    xoaPhanHoiReview,
    surveysState,
    surveyResponsesState,
    taoBieuMauKhaoSat,
    suaBieuMauKhaoSat,
    xoaBieuMauKhaoSat,
    kichHoatBieuMauKhaoSat,
    taiDanhSachBieuMau,
    taiDanhSachPhanHoi,
    taoKioskStaff,
    pendingPasswordChange,
    confirmFirstLoginPasswordChange,
  } = useAdminDashboard()

  const userRole = session?.user?.vaiTro || session?.user?.vai_tro || DASHBOARD_ROLES.STAFF
  const isFranchisee = userRole === DASHBOARD_ROLES.FRANCHISEE
  const isAccountant = userRole === DASHBOARD_ROLES.ACCOUNTANT
  const isFranchiseStaff = userRole === DASHBOARD_ROLES.FRANCHISE_STAFF
  const branchName = session?.user?.coSoTen || session?.user?.co_so_ten || 'Chi nhánh hệ thống'
  const isSystemAdmin = userRole === DASHBOARD_ROLES.ADMIN
  const isManager = userRole === DASHBOARD_ROLES.MANAGER
  const isKioskStaff = userRole === DASHBOARD_ROLES.KIOSK_STAFF
  const operationalGroups = [
    { label: 'Vận hành & bán hàng', items: [
      ...(!isKioskStaff ? [{ id: 'overview', label: 'Tổng quan', icon: FiGrid }] : []),
      { id: 'orders', label: 'Đơn hàng', icon: FiShoppingBag }, { id: 'pos', label: 'Bán hàng POS', icon: FiMonitor },
      ...(!isKioskStaff ? [{ id: 'delivery', label: 'Giao hàng', icon: FiTruck }, { id: 'table-management', label: 'Bàn & khu vực', icon: FiMapPin }] : []),
      { id: 'shift', label: 'Chốt ca', icon: FiClock },
      ...(isKioskStaff ? [{ id: 'kiosk-combo', label: 'Nhận combo nguyên liệu', icon: FiCoffee }] : []),
    ] },
    ...(!isKioskStaff ? [{ label: 'Sản phẩm & tin tức', items: [{ id: 'menu', label: 'Thực đơn', icon: FiCoffee }, { id: 'news', label: 'Tin tức', icon: FiFileText }] }] : []),
    { label: isManager ? 'Nhân sự & chăm sóc khách hàng' : 'Ca làm & cá nhân', items: [
      { id: 'workforce', label: 'Lịch làm của tôi', icon: FiCalendar },
      ...(['STAFF', 'MANAGER'].includes(userRole) ? [{ id: 'messages', label: 'Tin nhắn khách hàng', icon: FiMessageSquare }] : []),
      ...(isManager ? [
        { id: 'shift-approval', label: 'Duyệt chốt ca', icon: FiCheckCircle },
        { id: 'employee-manage', label: 'Nhân viên', icon: FiUsers },
        { id: 'workforce-manage', label: 'Lịch làm nhân viên', icon: FiCalendar },
        { id: 'shipper-manage', label: 'Nhân viên giao hàng', icon: FiTruck },
        { id: 'customer-care', label: 'Đánh giá khách hàng', icon: FiMessageSquare },
        { id: 'survey-manage', label: 'Khảo sát', icon: FiBarChart2 },
      ] : []),
    ] },
  ]
  useEffect(() => { consoleMainRef.current?.scrollTo({ top: 0, behavior: 'instant' }) }, [activeTab])

  const statusTone = (status) => {
    const map = {
      MOI_TAO: 'tone-new',
      DA_XAC_NHAN: 'tone-confirmed',
      DANG_CHUAN_BI: 'tone-preparing',
      DANG_GIAO: 'tone-shipping',
      HOAN_THANH: 'tone-done',
      DA_HUY: 'tone-cancelled',
    }
    return map[status] || 'tone-new'
  }

  const posHasUnavailableItem = posItems.some((line) => {
    const product = inventoryState.items.find((item) => item.ma_san_pham === Number(line.ma_san_pham))
    return product && !product.dang_ban
  })

  useEffect(() => {
    const handleInvalidSession = () => {
      logout()
    }

    window.addEventListener(AUTH_INVALID_EVENT, handleInvalidSession)
    return () => {
      window.removeEventListener(AUTH_INVALID_EVENT, handleInvalidSession)
    }
  }, [logout])

  useEffect(() => {
    if (!adminToast) return
    const timeout = setTimeout(() => setAdminToast(null), 4500)
    return () => clearTimeout(timeout)
  }, [adminToast])

  useEffect(() => {
    const ADMIN_LOCAL_NOTIFY_EVENT = 'avengers-admin-local-notify'
    const handleLocalNotify = (event) => {
      const detail = event?.detail || {}
      showAdminToast(detail.tieu_de || 'Thông báo', detail.noi_dung || '')
    }

    window.addEventListener(ADMIN_LOCAL_NOTIFY_EVENT, handleLocalNotify)
    return () => window.removeEventListener(ADMIN_LOCAL_NOTIFY_EVENT, handleLocalNotify)
  }, [])

  if (!session && !pendingPasswordChange) {
    return <LoginScreen loginForm={loginForm} setLoginForm={setLoginForm} loginStatus={loginStatus} onLogin={login} />
  }

  if (pendingPasswordChange) {
    return (
      <LoginScreen
        pendingPasswordChange={pendingPasswordChange}
        loginStatus={loginStatus}
        onConfirmPasswordChange={confirmFirstLoginPasswordChange}
      />
    )
  }

  // Phân vùng 2: Cửa hàng nhượng quyền (Franchise Kiosks)
  // 1. Admin nhượng quyền (Franchisee Admin)
  if (isFranchisee) {
    return <FranchiseePortal session={session} onLogout={logout} />
  }

  // 2. Nhân viên Kiosk nhượng quyền (Franchise Staff)
  if (isFranchiseStaff) {
    return <FranchiseStaffPortal session={session} onLogout={logout} />
  }

  // Role ACCOUNTANT → Giao diện quản lý nhượng quyền
  if (isAccountant) {
    return <AccountantFranchiseShell session={session} onLogout={logout} />
  }

  if (isSystemAdmin) {
    return (
      <AdminSystemConsole
        session={session}
        onLogout={logout}
        surveysState={surveysState}
        surveyResponsesState={surveyResponsesState}
        onKichHoatForm={kichHoatBieuMauKhaoSat}
        onTaoForm={taoBieuMauKhaoSat}
        onSuaForm={suaBieuMauKhaoSat}
        onXoaForm={xoaBieuMauKhaoSat}
        onTaiForms={taiDanhSachBieuMau}
        onTaiResponses={taiDanhSachPhanHoi}
      />
    )
  }

  return (
    <div className="admin-app-shell console-shell" data-actor={isManager ? 'manager' : 'staff'}>
      <WorkspaceSidebar groups={operationalGroups} activeTab={activeTab} onSelect={setActiveTab} session={session} label={isManager ? 'Quản lý cửa hàng' : 'Nhân viên cửa hàng'} onLogout={logout} />

      <main ref={consoleMainRef} className="content-area console-main">
        <header className="content-header" style={{ padding: '1rem 1.75rem', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e4df', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="content-header-title">
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#252927' }}>Trung tâm vận hành cửa hàng</h1>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem', color: '#69736a' }}>Xin chào <strong>{session.user?.tenDangNhap || session.user?.email || 'nhan vien'}</strong>, cơ sở {branchName}.</p>
          </div>
          <div className="header-right-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <WorkspaceSearch items={operationalGroups.flatMap(group => group.items.map(item => ({ ...item, group: group.label })))} onSelect={setActiveTab} />
            <AdminNotificationBell session={session} />
            <TopbarUserDropdown session={session} onLogout={logout} />
          </div>
        </header>

        <WorkspaceErrorBoundary key={activeTab} inline><div key={activeTab} className="workspace-tab-content"><Suspense fallback={<DashboardSkeleton />}>
        {activeTab === 'overview' ? (
          <OverviewPanel
            branchName={branchName}
            totals={totals}
            loading={ordersState.loading || inventoryState.loading}
            error={ordersState.error || inventoryState.error}
            overviewData={overviewData}
            overviewRange={overviewRange}
            setOverviewRange={setOverviewRange}
          />
        ) : null}

        {activeTab === 'orders' && (
          <OrdersPanel
            ordersState={ordersState}
            inventoryState={inventoryState}
            updatingOrderId={updatingOrderId}
            onUpdateStatus={capNhatTrangThaiDon}
            onUpdateOrder={capNhatDonChoStaff}
            onDeleteOrder={xoaDonChoStaff}
          />
        )}

        {activeTab === 'delivery' && <StaffDeliveryPanel />}

        {activeTab === 'menu' && (
          <MenuPanel
            inventoryState={inventoryState}
            savingMenuStatusId={savingMenuStatusId}
            onToggleSelling={capNhatTrangThaiBanMon}
          />
        )}

        {activeTab === 'news' && <NewsPanel />}

        {activeTab === 'kiosk-combo' && isKioskStaff && <KioskComboReceiver session={session} />}

        {activeTab === 'shift' && (
          <ShiftPanel
            isManager={isManager}
            mode="shift"
            currentUserName={session.user?.tenDangNhap || session.user?.email || 'staff'}
            shiftDate={shiftDate}
            setShiftDate={setShiftDate}
            shiftRange={shiftRange}
            setShiftRange={setShiftRange}
            shiftInput={shiftInput}
            setShiftInput={setShiftInput}
            shiftPreview={shiftPreview}
            shiftHistory={shiftHistory}
            shiftStatus={shiftStatus}
            closingShift={closingShift}
            approvingShiftId={approvingShiftId}
            chotCaTienMat={chotCaTienMat}
            suaCaLamViec={suaCaLamViec}
            xoaCaLamViec={xoaCaLamViec}
            pheDuyetCaLamViec={pheDuyetCaLamViec}
          />
        )}

        {activeTab === 'shift-approval' && isManager && (
          <ShiftPanel
            isManager={isManager}
            mode="approval"
            currentUserName={session.user?.tenDangNhap || session.user?.email || 'manager'}
            shiftDate={shiftDate}
            setShiftDate={setShiftDate}
            shiftRange={shiftRange}
            setShiftRange={setShiftRange}
            shiftInput={shiftInput}
            setShiftInput={setShiftInput}
            shiftPreview={shiftPreview}
            shiftHistory={shiftHistory}
            shiftStatus={shiftStatus}
            closingShift={closingShift}
            approvingShiftId={approvingShiftId}
            chotCaTienMat={chotCaTienMat}
            suaCaLamViec={suaCaLamViec}
            xoaCaLamViec={xoaCaLamViec}
            pheDuyetCaLamViec={pheDuyetCaLamViec}
          />
        )}

        {activeTab === 'pos' && (
          <PosOrderPanel
            isKioskStaff={isKioskStaff}
            isStaff={userRole === DASHBOARD_ROLES.STAFF}
            activeKioskShift={activeKioskShift}
            moCaKiosk={moCaKiosk}
            posForm={posForm}
            setPosForm={setPosForm}
            posItems={posItems}
            addPosItem={addPosItem}
            updatePosItem={updatePosItem}
            removePosItem={removePosItem}
            inventoryState={inventoryState}
            posStatus={posStatus}
            posHasUnavailableItem={posHasUnavailableItem}
            posSubtotal={posSubtotal}
            posVat={posVat}
            posTotal={posTotal}
            isCashMethod={isCashMethod}
            posCashInput={posCashInput}
            setPosCashInput={setPosCashInput}
            posCashInsufficient={posCashInsufficient}
            posChange={posChange}
            creatingPosOrder={creatingPosOrder}
            taoDonTaiQuay={taoDonTaiQuay}
            lastPosOrder={lastPosOrder}
            inHoaDonPos={inHoaDonPos}
            capNhatTrangThaiDon={capNhatTrangThaiDon}
            setActiveTab={setActiveTab}
            statusTone={statusTone}
          />
        )}

        {activeTab === 'table-management' && (
          <TableManagementPanel
            ordersState={ordersState}
            onUpdateStatus={capNhatTrangThaiDon}
            session={session}
          />
        )}

        {activeTab === 'workforce' && (
          <StaffWorkShiftsPanel
            myWorkShiftState={myWorkShiftState}
            staffUsername={session.user?.tenDangNhap || session.user?.email || (isManager ? 'manager' : 'staff')}
            shiftRequestState={staffShiftRequestState}
            creatingShiftRequest={creatingShiftRequest}
            onRequestShift={taoYeuCauDangKyCa}
            onEditShiftRequest={suaYeuCauDangKyCa}
            onDeleteShiftRequest={xoaYeuCauDangKyCa}
            handlingShiftRequestId={handlingShiftRequestId}
            onSelfAttendance={chamCongCaLamViecCaNhan}
            checkingAttendanceShiftId={checkingAttendanceShiftId}
            enableRequestTabs={!isManager}
          />
        )}

        {activeTab === 'workforce-manage' && isManager && (
          <ManagerWorkforcePanel
            workShiftState={workShiftState}
            workforceUsersState={workforceUsersState}
            workShiftForm={workShiftForm}
            setWorkShiftForm={setWorkShiftForm}
            creatingWorkShift={creatingWorkShift}
            onCreateWorkShift={taoLichLamViec}
            onUpdateAttendance={capNhatChamCong}
            onDeleteWorkShift={xoaLichLamViec}
            updatingWorkShiftId={updatingWorkShiftId}
            shiftRequestState={managerShiftRequestState}
            handlingShiftRequestId={handlingShiftRequestId}
            onHandleShiftRequest={xuLyYeuCauDangKyCa}
            onDeleteShiftRequest={xoaYeuCauDangKyCaChoManager}
          />
        )}

        {activeTab === 'employee-manage' && isManager && (
          <ManagerEmployeePanel
            workShiftState={workShiftState}
            workforceUsersState={workforceUsersState}
            onUpdateAttendance={capNhatChamCong}
            updatingWorkShiftId={updatingWorkShiftId}
            taoKioskStaff={taoKioskStaff}
            session={session}
          />
        )}

        {activeTab === 'customer-care' && isManager && (
          <ManagerCustomerCarePanel
            reviewsState={reviewsState}
            replyingReviewId={replyingReviewId}
            onReplyReview={phanHoiReview}
            onUpdateReply={suaPhanHoiReview}
            onDeleteReply={xoaPhanHoiReview}
          />
        )}

        {activeTab === 'survey-manage' && isManager && (
          <ManagerSurveyPanel
            surveysState={surveysState}
            surveyResponsesState={surveyResponsesState}
            onKichHoatForm={kichHoatBieuMauKhaoSat}
            onTaoForm={taoBieuMauKhaoSat}
            onSuaForm={suaBieuMauKhaoSat}
            onXoaForm={xoaBieuMauKhaoSat}
            onTaiForms={taiDanhSachBieuMau}
            onTaiResponses={taiDanhSachPhanHoi}
          />
        )}

        {activeTab === 'shipper-manage' && isManager && (
          <ManagerShipperPanel session={session} />
        )}

        {activeTab === 'franchise-manage' && (
          <div style={{ padding: '1.5rem 1.75rem' }}>
            <FranchisePanel />
          </div>
        )}

        {activeTab === 'messages' && ['STAFF', 'MANAGER'].includes(userRole) && <StaffInbox key={session?.user?.id || session?.user?.maNguoiDung || session?.user?.tenDangNhap} session={session} />}

        </Suspense></div></WorkspaceErrorBoundary>
      </main>
        {['STAFF', 'MANAGER'].includes(userRole) && <AdminChatWidget session={session} onOpenInbox={() => setActiveTab('messages')} hidden={activeTab === 'messages'} />}

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
              animation: 'slideInRight 0.3s ease-out',
            }}
          >
            <p style={{ margin: '0 0 8px 0', fontWeight: '700', color: '#333', fontSize: '14px' }}>{adminToast.title}</p>
            <p style={{ margin: 0, color: '#666', fontSize: '13px' }}>{adminToast.message}</p>
          </div>
        ) : null}
    </div>
  )
}

function App() {
  return <WorkspaceErrorBoundary><Suspense fallback={<div className="console-shell"><div className="console-page"><DashboardSkeleton /></div></div>}><AppContent /></Suspense></WorkspaceErrorBoundary>
}
export default App
