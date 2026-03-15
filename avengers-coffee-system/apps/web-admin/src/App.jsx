import { useEffect } from 'react'
import './App.css'
import {
  DASHBOARD_ROLES,
  MANAGER_EMPLOYEE_MANAGEMENT_TAB,
  MANAGER_SHIFT_APPROVAL_TAB,
  MANAGER_WORKFORCE_MANAGEMENT_TAB,
  NAV_TABS,
  ORDER_STATUS_LABEL,
  POS_ORDER_TYPE_OPTIONS,
  POS_PAYMENT_OPTIONS,
  WORKFORCE_TAB,
} from './features/admin-dashboard/constants'
import { useAdminDashboard } from './features/admin-dashboard/hooks/useAdminDashboard'
import { fmtMoney, normalizeViText } from './features/admin-dashboard/utils'
import { LoginScreen } from './features/admin-dashboard/components/LoginScreen'
import { OverviewPanel } from './features/admin-dashboard/components/OverviewPanel'
import { OrdersPanel } from './features/admin-dashboard/components/OrdersPanel'
import { MenuPanel } from './features/admin-dashboard/components/MenuPanel'
import { ShiftPanel } from './features/admin-dashboard/components/ShiftPanel'
import { ManagerWorkforcePanel } from './features/manager-dashboard/components/ManagerWorkforcePanel'
import { ManagerEmployeePanel } from './features/manager-dashboard/components/ManagerEmployeePanel'
import { StaffWorkShiftsPanel } from './features/staff-dashboard/components/StaffWorkShiftsPanel'
import { AdminSystemConsole } from './features/actor-admin/components/AdminSystemConsole'
import { AdminChatWidget } from './features/admin-dashboard/components/AdminChatWidget'
import { AUTH_INVALID_EVENT } from './lib/adminFetch'

function App() {
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
  } = useAdminDashboard()

  const userRole = session?.user?.vaiTro || session?.user?.vai_tro || DASHBOARD_ROLES.STAFF
  const branchName = session?.user?.coSoTen || session?.user?.co_so_ten || 'Mạc Đĩnh Chi'
  const isSystemAdmin = userRole === DASHBOARD_ROLES.ADMIN
  const isManager = userRole === DASHBOARD_ROLES.MANAGER
  const staffNavTabs = isManager
    ? [...NAV_TABS, { ...WORKFORCE_TAB, label: 'Lịch làm của tôi' }]
    : [...NAV_TABS, WORKFORCE_TAB]
  const managerNavTabs = isManager
    ? [
        MANAGER_SHIFT_APPROVAL_TAB,
        MANAGER_EMPLOYEE_MANAGEMENT_TAB,
        MANAGER_WORKFORCE_MANAGEMENT_TAB,
      ]
    : []

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

  if (!session) {
    return <LoginScreen loginForm={loginForm} setLoginForm={setLoginForm} loginStatus={loginStatus} onLogin={login} />
  }

  if (isSystemAdmin) {
    return <AdminSystemConsole session={session} onLogout={logout} />
  }

  return (
    <div className="admin-app-shell">
      <aside className="left-nav">
        <h2>Avengers Admin</h2>
        <p className="staff-tag">
          Đang đăng nhập: {session.user?.tenDangNhap || session.user?.email || 'nhan vien'} ({isManager ? 'Manager' : 'Staff'}) - Cơ sở {branchName}
        </p>
        <nav>
          <p className="nav-group-title">Chức năng cho staff</p>
          {staffNavTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'nav-tab active' : 'nav-tab'}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}

          {isManager ? <p className="nav-group-title nav-group-title--manager">Chức năng dành cho manager</p> : null}
          {managerNavTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeTab === tab.id ? 'nav-tab active' : 'nav-tab'}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <button type="button" className="logout-btn" onClick={logout}>
          Đăng xuất
        </button>
      </aside>

      <main className="content-area">
        <header className="content-header">
          <h1>Trung tâm vận hành cửa hàng</h1>
          <p>Xin chào {session.user?.tenDangNhap || session.user?.email || 'nhan vien'}, cơ sở {branchName}.</p>
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

        {activeTab === 'menu' && (
          <MenuPanel
            inventoryState={inventoryState}
            savingMenuStatusId={savingMenuStatusId}
            onToggleSelling={capNhatTrangThaiBanMon}
          />
        )}

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
          <section className="panel split">
            <div>
              <div className="panel-head">
                <h2>POS tạo đơn nhanh</h2>
                <span>Tạo đơn trực tiếp cho khách tại chỗ hoặc mang đi</span>
              </div>

              <div className="pos-row pos-form-row">
                <select
                  value={posForm.loai_don_hang}
                  onChange={(e) => setPosForm((prev) => ({ ...prev, loai_don_hang: e.target.value }))}
                >
                  {POS_ORDER_TYPE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={posForm.phuong_thuc_thanh_toan}
                  onChange={(e) => setPosForm((prev) => ({ ...prev, phuong_thuc_thanh_toan: e.target.value }))}
                >
                  {POS_PAYMENT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  value={posForm.ten_khach_hang}
                  onChange={(e) => setPosForm((prev) => ({ ...prev, ten_khach_hang: e.target.value }))}
                  placeholder="Tên khách (không bắt buộc)"
                />
                <input
                  value={posForm.ma_ban}
                  onChange={(e) => setPosForm((prev) => ({ ...prev, ma_ban: e.target.value }))}
                  placeholder="Mã bàn (nếu tại quầy)"
                  disabled={posForm.loai_don_hang !== 'TAI_CHO'}
                />
              </div>

              <textarea
                value={posForm.ghi_chu}
                onChange={(e) => setPosForm((prev) => ({ ...prev, ghi_chu: e.target.value }))}
                placeholder="Ghi chú đơn tại quầy"
              />

              <div className="pos-list">
                {!inventoryState.loading && !inventoryState.items.length ? (
                  <p>Không có món trong thực đơn để tạo đơn POS.</p>
                ) : null}
                {posItems.map((item, index) => (
                  <div key={`${item.ma_san_pham}-${index}`} className="pos-row">
                    <select value={item.ma_san_pham} onChange={(e) => updatePosItem(index, 'ma_san_pham', e.target.value)}>
                      {inventoryState.items.map((menuItem) => (
                        <option key={menuItem.ma_san_pham} value={menuItem.ma_san_pham}>
                          {normalizeViText(menuItem.name)} {menuItem.dang_ban ? '' : '(Tạm hết)'}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) => updatePosItem(index, 'qty', e.target.value)}
                      min="1"
                    />
                    <input
                      type="number"
                      value={item.price}
                      readOnly
                      disabled
                      min="0"
                      title="Giá món được khóa theo thực đơn"
                    />
                    <button type="button" onClick={() => removePosItem(index)}>
                      Xóa
                    </button>
                  </div>
                ))}
              </div>
              {posStatus.error ? <p className="error-text">{posStatus.error}</p> : null}
              {posStatus.success ? <p>{posStatus.success}</p> : null}
              {posHasUnavailableItem ? <p className="error-text">Có món đang tạm ngưng bán trong đơn POS. Vui lòng đổi món khác.</p> : null}
              <button type="button" className="secondary" onClick={addPosItem} disabled={!inventoryState.items.length}>
                Thêm dòng món
              </button>
            </div>
            <div className="receipt-box">
              <h3>Xem trước hóa đơn</h3>
              <p>Tạm tính: {fmtMoney(posSubtotal)}</p>
              <p>VAT 8% (tham khảo): {fmtMoney(posVat)}</p>
              <strong>Tổng cộng thu khách: {fmtMoney(posTotal)}</strong>

              {isCashMethod ? (
                <div className="cash-box">
                  <label htmlFor="cash-received">Tiền khách đưa</label>
                  <input
                    id="cash-received"
                    type="number"
                    min="0"
                    value={posCashInput}
                    onChange={(e) => setPosCashInput(Number(e.target.value) || 0)}
                  />
                  <p className={posCashInsufficient ? 'cash-warning' : ''}>
                    {posCashInsufficient ? 'Tiền khách đưa chưa đủ' : `Tiền thối lại: ${fmtMoney(posChange)}`}
                  </p>
                </div>
              ) : null}

              <button
                type="button"
                onClick={taoDonTaiQuay}
                disabled={
                  creatingPosOrder ||
                  inventoryState.loading ||
                  !inventoryState.items.length ||
                  posHasUnavailableItem ||
                  (isCashMethod && posCashInsufficient)
                }
              >
                {creatingPosOrder ? 'Đang tạo đơn...' : 'Xác nhận tạo đơn tại quầy'}
              </button>

              {lastPosOrder?.order ? (
                <div className="pos-created-box">
                  <h3>Đơn tại quầy vừa tạo</h3>
                  <p>Mã đơn: {lastPosOrder.order.ma_don_hang?.slice(0, 8)?.toUpperCase()}</p>
                  <p>
                    Trạng thái đơn:{' '}
                    <span className={`status-pill ${statusTone(lastPosOrder.order.trang_thai_don_hang)}`}>
                      {ORDER_STATUS_LABEL[lastPosOrder.order.trang_thai_don_hang] || lastPosOrder.order.trang_thai_don_hang}
                    </span>
                  </p>
                  <p>Trạng thái thanh toán: {lastPosOrder.order.trang_thai_thanh_toan}</p>
                  {lastPosOrder.order.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG' && lastPosOrder.paymentDetails?.qr_img_url ? (
                    <>
                      <small>Khách có thể quét QR để thanh toán nhanh:</small>
                      <img src={lastPosOrder.paymentDetails.qr_img_url} alt="Mã QR thanh toán" className="pos-qr" />
                    </>
                  ) : null}
                  {lastPosOrder.order.phuong_thuc_thanh_toan === 'THANH_TOAN_KHI_NHAN_HANG' ? (
                    <small>Đơn tiền mặt: kiểm tra tiền nhận và in bill cho khách.</small>
                  ) : null}
                  <div className="pos-created-actions">
                    <button
                      type="button"
                      onClick={() => {
                        capNhatTrangThaiDon(lastPosOrder.order.ma_don_hang, 'DA_XAC_NHAN')
                        setActiveTab('orders')
                      }}
                    >
                      Xác nhận đơn
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        capNhatTrangThaiDon(lastPosOrder.order.ma_don_hang, 'DANG_CHUAN_BI')
                        setActiveTab('orders')
                      }}
                    >
                      Chuyển sang Đang chuẩn bị
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        capNhatTrangThaiDon(lastPosOrder.order.ma_don_hang, 'HOAN_THANH')
                        setActiveTab('orders')
                      }}
                    >
                      Xác nhận đã hoàn thành
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        capNhatTrangThaiDon(lastPosOrder.order.ma_don_hang, 'DA_HUY')
                        setActiveTab('orders')
                      }}
                    >
                      Hủy đơn
                    </button>
                    <button type="button" className="secondary" onClick={inHoaDonPos}>
                      In hóa đơn K80
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        )}

        {activeTab === 'workforce' && (
          <StaffWorkShiftsPanel
            myWorkShiftState={myWorkShiftState}
            staffUsername={session.user?.tenDangNhap || session.user?.email || (isManager ? 'manager' : 'staff')}
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
      </main>
        <AdminChatWidget session={session} />
    </div>
  )
}

export default App
