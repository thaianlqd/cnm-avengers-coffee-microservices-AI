import './App.css'
import { NAV_TABS, ORDER_STATUS_LABEL, POS_ORDER_TYPE_OPTIONS, POS_PAYMENT_OPTIONS } from './features/admin-dashboard/constants'
import { useAdminDashboard } from './features/admin-dashboard/hooks/useAdminDashboard'
import { fmtMoney, normalizeViText } from './features/admin-dashboard/utils'
import { LoginScreen } from './features/admin-dashboard/components/LoginScreen'
import { OverviewPanel } from './features/admin-dashboard/components/OverviewPanel'
import { OrdersPanel } from './features/admin-dashboard/components/OrdersPanel'
import { MenuPanel } from './features/admin-dashboard/components/MenuPanel'

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
    shiftRange,
    setShiftRange,
    shiftPreview,
    shiftHistory,
    shiftStatus,
    closingShift,
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
    totals,
    overviewData,
    login,
    logout,
    capNhatTrangThaiDon,
    capNhatTonKho,
    capNhatTrangThaiBanMon,
    chotCaTienMat,
    addPosItem,
    updatePosItem,
    removePosItem,
    taoDonTaiQuay,
    inHoaDonPos,
  } = useAdminDashboard()

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

  if (!session) {
    return <LoginScreen loginForm={loginForm} setLoginForm={setLoginForm} loginStatus={loginStatus} onLogin={login} />
  }

  return (
    <div className="admin-app-shell">
      <aside className="left-nav">
        <h2>Avengers Admin</h2>
        <p className="staff-tag">Đang đăng nhập: {session.user?.tenDangNhap || session.user?.email || 'nhân viên'}</p>
        <nav>
          {NAV_TABS.map((tab) => (
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
          <p>Theo dõi ca làm việc theo thời gian thực cho admin và staff.</p>
        </header>

        {activeTab === 'overview' ? (
          <OverviewPanel
            totals={totals}
            overviewData={overviewData}
            overviewRange={overviewRange}
            setOverviewRange={setOverviewRange}
          />
        ) : null}

        {activeTab === 'orders' && (
          <OrdersPanel
            ordersState={ordersState}
            updatingOrderId={updatingOrderId}
            onUpdateStatus={capNhatTrangThaiDon}
          />
        )}

        {activeTab === 'menu' && (
          <MenuPanel
            inventoryState={inventoryState}
            stockDrafts={stockDrafts}
            setStockDrafts={setStockDrafts}
            savingStockId={savingStockId}
            savingMenuStatusId={savingMenuStatusId}
            onSaveStock={capNhatTonKho}
            onToggleSelling={capNhatTrangThaiBanMon}
          />
        )}

        {activeTab === 'shift' && (
          <section className="panel split">
            <div>
              <div className="panel-head">
                <h2>Đối soát tiền mặt cuối ca</h2>
                <span>Hỗ trợ chốt ca hằng ngày</span>
              </div>
              <label htmlFor="shift-from">Bắt đầu ca</label>
              <input
                id="shift-from"
                type="datetime-local"
                value={shiftRange.from ? shiftRange.from.slice(0, 16) : ''}
                onChange={(e) =>
                  setShiftRange((prev) => ({
                    ...prev,
                    from: e.target.value ? new Date(e.target.value).toISOString() : prev.from,
                  }))
                }
              />
              <label htmlFor="shift-to">Kết thúc ca</label>
              <input
                id="shift-to"
                type="datetime-local"
                value={shiftRange.to ? shiftRange.to.slice(0, 16) : ''}
                onChange={(e) =>
                  setShiftRange((prev) => ({
                    ...prev,
                    to: e.target.value ? new Date(e.target.value).toISOString() : prev.to,
                  }))
                }
              />
              <label htmlFor="cash-open">Tiền đầu ca</label>
              <input
                id="cash-open"
                type="number"
                value={shiftInput.cashOpen}
                onChange={(e) => setShiftInput((prev) => ({ ...prev, cashOpen: Number(e.target.value) || 0 }))}
              />
              <label htmlFor="cash-close">Tiền cuối ca</label>
              <input
                id="cash-close"
                type="number"
                value={shiftInput.cashClose}
                onChange={(e) => setShiftInput((prev) => ({ ...prev, cashClose: Number(e.target.value) || 0 }))}
              />
              <label htmlFor="shift-note">Ghi chú ca làm</label>
              <textarea
                id="shift-note"
                value={shiftInput.note}
                onChange={(e) => setShiftInput((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Sự cố hoặc ghi chú bàn giao cho ca sau"
              />
              {shiftStatus.error ? <p className="error-text">{shiftStatus.error}</p> : null}
              {shiftStatus.success ? <p>{shiftStatus.success}</p> : null}
            </div>
            <div className="shift-result">
              <h3>Chênh lệch tiền mặt</h3>
              <p>{fmtMoney(shiftPreview?.reconciliation?.difference ?? shiftInput.cashClose - shiftInput.cashOpen)}</p>
              <small>Tổng đơn trong ca: {shiftPreview?.system?.total_orders ?? 0}</small>
              <small>Doanh thu hệ thống: {fmtMoney(shiftPreview?.system?.total_revenue ?? 0)}</small>
              <small>Thu tiền mặt theo hệ thống: {fmtMoney(shiftPreview?.system?.cash_revenue ?? 0)}</small>
              <small>Tiền mặt kỳ vọng cuối ca: {fmtMoney(shiftPreview?.reconciliation?.expected_cash_close ?? 0)}</small>
              <small>Thanh toán online cần tách báo cáo riêng trước khi xác nhận chốt ca.</small>
              <button type="button" onClick={chotCaTienMat} disabled={closingShift || shiftStatus.loading}>
                {closingShift ? 'Đang chốt ca...' : 'Xác nhận chốt ca'}
              </button>

              {shiftHistory.length ? (
                <div className="pos-created-box">
                  <h3>Lịch sử chốt ca gần đây</h3>
                  {shiftHistory.map((item) => (
                    <p key={item.ma_ca}>
                      {new Date(item.created_at).toLocaleString('vi-VN')} - Chênh lệch {fmtMoney(item.difference)}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
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
                      onChange={(e) => updatePosItem(index, 'price', e.target.value)}
                      min="0"
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
      </main>
    </div>
  )
}

export default App
