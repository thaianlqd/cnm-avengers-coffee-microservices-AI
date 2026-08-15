import { useEffect, useState } from 'react'
import './App.css'
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
import { ManagerSurveyPanel } from './features/manager-dashboard/components/ManagerSurveyPanel'
import { fmtMoney, normalizeViText } from './features/admin-dashboard/utils'
import { LoginScreen } from './features/admin-dashboard/components/LoginScreen'
import { OverviewPanel } from './features/admin-dashboard/components/OverviewPanel'
import { OrdersPanel } from './features/admin-dashboard/components/OrdersPanel'
import { MenuPanel } from './features/admin-dashboard/components/MenuPanel'
import { ShiftPanel } from './features/admin-dashboard/components/ShiftPanel'
import { PosOrderPanel } from './features/admin-dashboard/components/PosOrderPanel'
import { ManagerWorkforcePanel } from './features/manager-dashboard/components/ManagerWorkforcePanel'
import { ManagerEmployeePanel } from './features/manager-dashboard/components/ManagerEmployeePanel'
import { ManagerCustomerCarePanel } from './features/manager-dashboard/components/ManagerCustomerCarePanel'
import { StaffWorkShiftsPanel } from './features/staff-dashboard/components/StaffWorkShiftsPanel'
import StaffDeliveryPanel from './features/staff-dashboard/features_thaian/StaffDeliveryPanel'
import { AdminSystemConsole } from './features/actor-admin/components/AdminSystemConsole'
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
} from 'lucide-react'
import { ManagerShipperPanel } from './features/manager-dashboard/components/ManagerShipperPanel'
import { AdminChatWidget } from './features/admin-dashboard/components/AdminChatWidget'
import { TableManagementPanel } from './features/admin-dashboard/components/TableManagementPanel'
import { AUTH_INVALID_EVENT } from './lib/adminFetch'
import { AccountCenterPanel } from './features/shared/components/AccountCenterPanel'
import { AdminNotificationBell } from './features/shared/components/AdminNotificationBell'
import { NewsPanel } from './features/shared/components/NewsPanel'

function App() {
  const [adminToast, setAdminToast] = useState(null)
  const openShipperLauncher = () => {
    window.open('http://localhost:5176', '_blank', 'noopener,noreferrer')
  }

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
  } = useAdminDashboard()

  const userRole = session?.user?.vaiTro || session?.user?.vai_tro || DASHBOARD_ROLES.STAFF
  const branchName = session?.user?.coSoTen || session?.user?.co_so_ten || 'Chi nhánh hệ thống'
  const isSystemAdmin = userRole === DASHBOARD_ROLES.ADMIN
  const isManager = userRole === DASHBOARD_ROLES.MANAGER
  const staffNavTabs = isManager
    ? [...NAV_TABS, { ...WORKFORCE_TAB, label: 'Lịch làm của tôi' }, ACCOUNT_TAB]
    : [...NAV_TABS, WORKFORCE_TAB, ACCOUNT_TAB]
  const managerNavTabs = isManager
    ? [
        MANAGER_SHIFT_APPROVAL_TAB,
        MANAGER_EMPLOYEE_MANAGEMENT_TAB,
        MANAGER_WORKFORCE_MANAGEMENT_TAB,
        MANAGER_CUSTOMER_CARE_TAB,
        { id: 'shipper-manage', label: 'Quản lý giao hàng' },
      ]
    : []

  const [activeStaffGroup, setActiveStaffGroup] = useState('group-1')

  useEffect(() => {
    if (['overview', 'orders', 'pos', 'delivery', 'table-management', 'shift'].includes(activeTab)) {
      setActiveStaffGroup('group-1')
    } else if (['menu', 'news'].includes(activeTab)) {
      setActiveStaffGroup('group-2')
    } else if (['workforce', 'account', 'shift-approval', 'employee-manage', 'workforce-manage', 'shipper-manage', 'customer-care', 'survey-manage'].includes(activeTab)) {
      setActiveStaffGroup('group-3')
    }
  }, [activeTab])

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

  if (!session) {
    return <LoginScreen loginForm={loginForm} setLoginForm={setLoginForm} loginStatus={loginStatus} onLogin={login} />
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
    <div className="admin-app-shell">
      <aside className="left-nav">
        <div style={{ padding: '0.75rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.625rem', borderBottom: '1px solid #f1f5f9', marginBottom: '0.75rem' }}>
          <div style={{ width: '1.875rem', height: '1.875rem', backgroundColor: '#4f46e5', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 4px rgba(79, 70, 229, 0.25)' }}>
            <span style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '1rem' }}>A</span>
          </div>
          <span style={{ fontWeight: '700', fontSize: '1.125rem', letterSpacing: '-0.025em', color: '#0f172a' }}>Avengers Admin</span>
        </div>



        <div style={{ padding: '0 0.25rem', marginBottom: '0.85rem' }}>
          <button type="button" className="shipper-launcher-btn" onClick={openShipperLauncher} style={{ width: '100%', margin: 0, height: '38px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', backgroundColor: '#e0e7ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: '8px', fontWeight: '700', fontSize: '0.8125rem', cursor: 'pointer', transition: 'all 0.15s ease' }}>
            <Bike size={16} color="#4f46e5" />
            <span>Mở Shipper Mobile</span>
          </button>
        </div>

        <nav style={{ padding: '0 0.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          
          {/* GROUP 1: VẬN HÀNH & BÁN HÀNG */}
          <div>
            <button
              type="button"
              className="nav-group-header-btn"
              onClick={() => setActiveStaffGroup(activeStaffGroup === 'group-1' ? '' : 'group-1')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                padding: '0.45rem 0.55rem',
                border: 'none',
                background: 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#64748b',
                fontWeight: '700',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ShoppingBag size={14} color="#64748b" />
                <span>Vận hành &amp; Bán hàng</span>
              </div>
              {activeStaffGroup === 'group-1' ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </button>

            {activeStaffGroup === 'group-1' && (
              <div className="nav-group-children" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.25rem', paddingLeft: '0.35rem' }}>
                <button type="button" className={activeTab === 'overview' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('overview')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <LayoutGrid size={15} /> <span>Tổng quan</span>
                </button>
                <button type="button" className={activeTab === 'orders' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('orders')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShoppingBag size={15} /> <span>Quản lý đơn hàng</span>
                </button>
                <button type="button" className={activeTab === 'pos' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('pos')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Monitor size={15} /> <span>POS tạo đơn nhanh</span>
                </button>
                <button type="button" className={activeTab === 'delivery' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('delivery')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Bike size={15} /> <span>Quản lý Giao hàng</span>
                </button>
                <button type="button" className={activeTab === 'table-management' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('table-management')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Store size={15} /> <span>Quản lý Bàn</span>
                </button>
                <button type="button" className={activeTab === 'shift' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('shift')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={15} /> <span>Chốt ca</span>
                </button>
              </div>
            )}
          </div>

          {/* GROUP 2: SẢN PHẨM & TIN TỨC */}
          <div>
            <button
              type="button"
              className="nav-group-header-btn"
              onClick={() => setActiveStaffGroup(activeStaffGroup === 'group-2' ? '' : 'group-2')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                padding: '0.45rem 0.55rem',
                border: 'none',
                background: 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#64748b',
                fontWeight: '700',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Coffee size={14} color="#64748b" />
                <span>Sản phẩm &amp; Tin tức</span>
              </div>
              {activeStaffGroup === 'group-2' ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </button>

            {activeStaffGroup === 'group-2' && (
              <div className="nav-group-children" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.25rem', paddingLeft: '0.35rem' }}>
                <button type="button" className={activeTab === 'menu' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('menu')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Coffee size={15} /> <span>Quản lý thực đơn</span>
                </button>
                <button type="button" className={activeTab === 'news' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('news')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Newspaper size={15} /> <span>Quản lý tin tức</span>
                </button>
              </div>
            )}
          </div>

          {/* GROUP 3: NHÂN SỰ & QUẢN LÝ */}
          <div>
            <button
              type="button"
              className="nav-group-header-btn"
              onClick={() => setActiveStaffGroup(activeStaffGroup === 'group-3' ? '' : 'group-3')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                padding: '0.45rem 0.55rem',
                border: 'none',
                background: 'transparent',
                borderRadius: '6px',
                cursor: 'pointer',
                color: '#64748b',
                fontWeight: '700',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Users size={14} color="#64748b" />
                <span>Nhân sự &amp; Quản lý</span>
              </div>
              {activeStaffGroup === 'group-3' ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
            </button>

            {activeStaffGroup === 'group-3' && (
              <div className="nav-group-children" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', marginTop: '0.25rem', paddingLeft: '0.35rem' }}>
                <button type="button" className={activeTab === 'workforce' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('workforce')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={15} /> <span>{isManager ? 'Lịch làm của tôi' : 'Lịch làm nhân sự'}</span>
                </button>

                <button type="button" className={activeTab === 'account' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('account')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <UserCheck size={15} /> <span>Hồ sơ &amp; Bảo mật</span>
                </button>

                {isManager && (
                  <>
                    <button type="button" className={activeTab === 'shift-approval' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('shift-approval')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircle2 size={15} /> <span>Kiểm tra chốt ca</span>
                    </button>
                    <button type="button" className={activeTab === 'employee-manage' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('employee-manage')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Users size={15} /> <span>Quản lý nhân viên</span>
                    </button>
                    <button type="button" className={activeTab === 'workforce-manage' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('workforce-manage')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Calendar size={15} /> <span>Quản lý lịch làm nhân viên</span>
                    </button>
                    <button type="button" className={activeTab === 'shipper-manage' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('shipper-manage')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Truck size={15} /> <span>Quản lý giao hàng</span>
                    </button>
                    <button type="button" className={activeTab === 'customer-care' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('customer-care')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <MessageSquare size={15} /> <span>CSKH phản hồi đánh giá</span>
                    </button>
                    <button type="button" className={activeTab === 'survey-manage' ? 'nav-tab active' : 'nav-tab'} onClick={() => setActiveTab('survey-manage')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <BarChart3 size={15} /> <span>Quản lý khảo sát</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '0.75rem', paddingLeft: '0.25rem', paddingRight: '0.25rem' }}>
          <button type="button" className="logout-btn" onClick={logout} style={{ width: '100%', height: '38px', borderRadius: '8px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
            <LogOut size={16} /> Đăng xuất
          </button>
        </div>
      </aside>

      <main className="content-area">
        <header className="content-header" style={{ padding: '1rem 1.75rem', backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="content-header-title">
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#0f172a' }}>Trung tâm vận hành cửa hàng</h1>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem', color: '#64748b' }}>Xin chào <strong>{session.user?.tenDangNhap || session.user?.email || 'nhan vien'}</strong>, cơ sở {branchName}.</p>
          </div>
          <div className="header-right-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div className="header-search" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={15} color="#64748b" style={{ position: 'absolute', left: '0.75rem', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Tìm kiếm mọi thứ..."
                style={{ padding: '0.45rem 0.85rem 0.45rem 2.2rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontSize: '0.8125rem', color: '#0f172a', outline: 'none', width: '220px' }}
              />
            </div>
            <AdminNotificationBell session={session} />
          </div>
        </header>

        {activeTab === 'overview' ? (
          <OverviewPanel
            branchName={branchName}
            totals={totals}
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

        {activeTab === 'account' ? <AccountCenterPanel session={session} /> : null}
      </main>
        <AdminChatWidget session={session} />

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

export default App
