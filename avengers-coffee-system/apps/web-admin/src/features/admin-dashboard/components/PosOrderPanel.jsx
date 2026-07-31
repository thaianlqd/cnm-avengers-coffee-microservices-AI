import {
  Monitor,
  Store,
  ShoppingBag,
  CreditCard,
  Coins,
  QrCode,
  User,
  MapPin,
  FileText,
  Plus,
  Trash2,
  Check,
  Printer,
  AlertCircle,
  Clock,
  ArrowRight,
  Sparkles
} from 'lucide-react'
import { POS_ORDER_TYPE_OPTIONS, POS_PAYMENT_OPTIONS, ORDER_STATUS_LABEL } from '../constants'
import { fmtMoney, normalizeViText, paymentTag } from '../utils'

export function PosOrderPanel({
  posForm,
  setPosForm,
  posItems,
  addPosItem,
  updatePosItem,
  removePosItem,
  inventoryState,
  posStatus,
  posHasUnavailableItem,
  posSubtotal,
  posVat,
  posTotal,
  isCashMethod,
  posCashInput,
  setPosCashInput,
  posCashInsufficient,
  posChange,
  creatingPosOrder,
  taoDonTaiQuay,
  lastPosOrder,
  inHoaDonPos,
  capNhatTrangThaiDon,
  setActiveTab,
  statusTone
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem 1.5rem' }}>
      
      {/* HEADER TITLE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Monitor size={22} color="#4f46e5" /> POS Tạo Đơn Nhanh Tại Quầy
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#64748b' }}>
            Tạo đơn trực tiếp cho khách dùng tại chỗ hoặc mang đi, tự động tính tiền thối và in hóa đơn tức thì.
          </p>
        </div>
      </div>

      {/* SPLIT CONTAINER */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: FORM & ITEMS SELECTION */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Order Type & Payment Method Switches */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: '#64748b', letterSpacing: '0.04em' }}>
              Loại đơn &amp; Hình thức thanh toán:
            </span>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
              {POS_ORDER_TYPE_OPTIONS.map((option) => {
                const isActive = posForm.loai_don_hang === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPosForm((prev) => ({ ...prev, loai_don_hang: option.id }))}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.45rem 0.95rem',
                      borderRadius: '8px',
                      fontSize: '0.8125rem',
                      fontWeight: isActive ? '700' : '600',
                      border: isActive ? '1px solid #4f46e5' : '1px solid #cbd5e1',
                      backgroundColor: isActive ? '#4f46e5' : '#ffffff',
                      color: isActive ? '#ffffff' : '#475569',
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 2px 6px rgba(79, 70, 229, 0.25)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {option.id === 'TAI_CHO' ? <Store size={15} /> : <ShoppingBag size={15} />}
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
              {POS_PAYMENT_OPTIONS.map((option) => {
                const isActive = posForm.phuong_thuc_thanh_toan === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setPosForm((prev) => ({ ...prev, phuong_thuc_thanh_toan: option.id }))}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      padding: '0.45rem 0.95rem',
                      borderRadius: '8px',
                      fontSize: '0.8125rem',
                      fontWeight: isActive ? '700' : '600',
                      border: isActive ? '1px solid #4f46e5' : '1px solid #cbd5e1',
                      backgroundColor: isActive ? '#4f46e5' : '#ffffff',
                      color: isActive ? '#ffffff' : '#475569',
                      cursor: 'pointer',
                      boxShadow: isActive ? '0 2px 6px rgba(79, 70, 229, 0.25)' : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {option.id === 'THANH_TOAN_KHI_NHAN_HANG' ? <Coins size={15} /> : <QrCode size={15} />}
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Customer & Table Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <User size={14} color="#64748b" /> Tên khách hàng
              </label>
              <input
                type="text"
                placeholder="Khách vãng lai (không bắt buộc)"
                value={posForm.ten_khach_hang}
                onChange={(e) => setPosForm((prev) => ({ ...prev, ten_khach_hang: e.target.value }))}
                style={{ height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8125rem', color: '#0f172a', outline: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <MapPin size={14} color="#64748b" /> Mã / Số bàn
              </label>
              <input
                type="text"
                placeholder="Số bàn (nếu dùng tại chỗ)"
                disabled={!['TAI_CHO', 'DUNG_TAI_CHO'].includes(posForm.loai_don_hang)}
                value={posForm.ma_ban}
                onChange={(e) => setPosForm((prev) => ({ ...prev, ma_ban: e.target.value }))}
                style={{ height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: ['TAI_CHO', 'DUNG_TAI_CHO'].includes(posForm.loai_don_hang) ? '#ffffff' : '#f1f5f9', fontSize: '0.8125rem', color: '#0f172a', outline: 'none' }}
              />
            </div>
          </div>

          {/* Note Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <FileText size={14} color="#64748b" /> Ghi chú đơn
            </label>
            <textarea
              placeholder="VD: Ít đường, mang đi gấp..."
              rows={2}
              value={posForm.ghi_chu}
              onChange={(e) => setPosForm((prev) => ({ ...prev, ghi_chu: e.target.value }))}
              style={{ padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.8125rem', color: '#0f172a', outline: 'none', resize: 'vertical' }}
            />
          </div>

          {/* Items Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: '700', color: '#0f172a' }}>Danh sách món trong đơn:</span>
              <button
                type="button"
                onClick={addPosItem}
                disabled={!inventoryState?.items?.length}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: '#e0e7ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: '8px', padding: '0.35rem 0.75rem', fontSize: '0.78125rem', fontWeight: '700', cursor: 'pointer' }}
              >
                <Plus size={14} /> Thêm món
              </button>
            </div>

            {!inventoryState?.loading && !inventoryState?.items?.length ? (
              <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: 0 }}>Không có món nào trong thực đơn để chọn.</p>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {posItems.map((item, index) => (
                <div key={`${item.ma_san_pham}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#f8fafc', padding: '0.6rem 0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
                  <select
                    value={item.ma_san_pham}
                    onChange={(e) => updatePosItem(index, 'ma_san_pham', e.target.value)}
                    style={{ flex: 2, height: '36px', padding: '0 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem', fontWeight: '600', color: '#0f172a' }}
                  >
                    {(inventoryState?.items || []).map((menuItem) => (
                      <option key={menuItem.ma_san_pham} value={menuItem.ma_san_pham}>
                        {normalizeViText(menuItem.name)} {menuItem.dang_ban ? '' : '(Tạm hết)'}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => updatePosItem(index, 'qty', e.target.value)}
                    style={{ width: '65px', height: '36px', padding: '0 0.45rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.8125rem', fontWeight: '700', textAlign: 'center' }}
                  />

                  <div style={{ width: '100px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 0.5rem', backgroundColor: '#e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '700', color: '#0f172a' }}>
                    {fmtMoney(Number(item.price || 0) * Number(item.qty || 1))}
                  </div>

                  <button
                    type="button"
                    onClick={() => removePosItem(index)}
                    style={{ backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', width: '36px', height: '36px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            {posStatus?.error ? (
              <p style={{ margin: 0, fontSize: '0.78125rem', color: '#dc2626', fontWeight: '600', backgroundColor: '#fef2f2', padding: '0.5rem', borderRadius: '6px' }}>{posStatus.error}</p>
            ) : null}
            {posStatus?.success ? (
              <p style={{ margin: 0, fontSize: '0.78125rem', color: '#059669', fontWeight: '600', backgroundColor: '#ecfdf5', padding: '0.5rem', borderRadius: '6px' }}>{posStatus.success}</p>
            ) : null}
            {posHasUnavailableItem ? (
              <p style={{ margin: 0, fontSize: '0.78125rem', color: '#dc2626', fontWeight: '600', backgroundColor: '#fef2f2', padding: '0.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <AlertCircle size={14} /> Có món tạm ngưng bán trong danh sách. Vui lòng đổi món khác.
              </p>
            ) : null}
          </div>

        </div>

        {/* RIGHT COLUMN: RECEIPT PREVIEW & CONFIRMATION */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Sparkles size={16} color="#4f46e5" /> Xem trước tính tiền
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.84rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>Tạm tính tiền món:</span>
                <strong style={{ color: '#0f172a' }}>{fmtMoney(posSubtotal)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
                <span>VAT 8% (tham khảo):</span>
                <strong style={{ color: '#0f172a' }}>{fmtMoney(posVat)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', color: '#0f172a', borderTop: '1px solid #f1f5f9', paddingTop: '0.65rem', marginTop: '0.2rem' }}>
                <span>Tổng cộng thu khách:</span>
                <strong style={{ color: '#4f46e5', fontWeight: '800' }}>{fmtMoney(posTotal)}</strong>
              </div>
            </div>

            {/* Cash input & calculation */}
            {isCashMethod ? (
              <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.25rem' }}>
                <label htmlFor="pos-cash-input" style={{ fontSize: '0.78125rem', fontWeight: '700', color: '#334155' }}>
                  Tiền khách đưa (VNĐ):
                </label>
                <input
                  id="pos-cash-input"
                  type="number"
                  min="0"
                  style={{ height: '36px', width: '100%', padding: '0 0.65rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: '700', color: '#0f172a' }}
                  value={posCashInput}
                  onChange={(e) => setPosCashInput(Number(e.target.value) || 0)}
                />
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78125rem', fontWeight: '700', color: posCashInsufficient ? '#dc2626' : '#059669' }}>
                  {posCashInsufficient ? '⚠️ Tiền khách đưa chưa đủ' : `Tiền thối lại: ${fmtMoney(posChange)}`}
                </p>
              </div>
            ) : null}

            {/* Confirm Create Button */}
            <button
              type="button"
              className="btn-save-green"
              onClick={taoDonTaiQuay}
              disabled={
                creatingPosOrder ||
                inventoryState?.loading ||
                !inventoryState?.items?.length ||
                posHasUnavailableItem ||
                (isCashMethod && posCashInsufficient)
              }
              style={{ width: '100%', height: '42px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem', marginTop: '0.5rem' }}
            >
              <Check size={18} color="#ffffff" />
              <span>{creatingPosOrder ? 'Đang tạo đơn...' : 'Xác Nhận Tạo Đơn Tại Quầy'}</span>
            </button>
          </div>

          {/* CREATED POS ORDER BILL BOX */}
          {lastPosOrder?.order ? (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid #c7d2fe', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 12px rgba(79, 70, 229, 0.08)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e0e7ff', paddingBottom: '0.65rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={16} color="#4f46e5" /> Đơn vừa tạo thành công
                </h3>
                <button
                  type="button"
                  onClick={() => inHoaDonPos(lastPosOrder.order.ma_don_hang)}
                  style={{ backgroundColor: '#e0e7ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: '6px', padding: '0.25rem 0.65rem', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Printer size={13} /> In hóa đơn
                </button>
              </div>

              <div style={{ fontSize: '0.8125rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Mã đơn hàng:</span>
                  <strong style={{ color: '#0f172a' }}>#{lastPosOrder.order.ma_don_hang?.slice(0, 8)?.toUpperCase()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Trạng thái đơn:</span>
                  <span className={`status-pill ${statusTone ? statusTone(lastPosOrder.order.trang_thai_don_hang) : 'tone-new'}`}>
                    {ORDER_STATUS_LABEL[lastPosOrder.order.trang_thai_don_hang] || lastPosOrder.order.trang_thai_don_hang}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Thanh toán:</span>
                  <strong style={{ color: '#059669' }}>{lastPosOrder.order.trang_thai_thanh_toan}</strong>
                </div>
              </div>

              {lastPosOrder.order.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG' && lastPosOrder.paymentDetails?.qr_img_url ? (
                <div style={{ textAlign: 'center', backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '0.25rem' }}>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', fontWeight: '600', marginBottom: '0.4rem' }}>Khách quét QR để thanh toán:</span>
                  <img src={lastPosOrder.paymentDetails.qr_img_url} alt="Mã QR thanh toán" style={{ width: '150px', height: '150px', objectFit: 'contain', margin: '0 auto', display: 'block', borderRadius: '6px' }} />
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    capNhatTrangThaiDon(lastPosOrder.order.ma_don_hang, 'DA_XAC_NHAN')
                    setActiveTab('orders')
                  }}
                  style={{ flex: 1, backgroundColor: '#4f46e5', color: '#ffffff', border: 'none', borderRadius: '6px', height: '34px', fontSize: '0.78125rem', fontWeight: '700', cursor: 'pointer' }}
                >
                  Xác nhận đơn
                </button>
                <button
                  type="button"
                  onClick={() => {
                    capNhatTrangThaiDon(lastPosOrder.order.ma_don_hang, 'DANG_CHUAN_BI')
                    setActiveTab('orders')
                  }}
                  style={{ flex: 1, backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', height: '34px', fontSize: '0.78125rem', fontWeight: '600', cursor: 'pointer' }}
                >
                  Đang chuẩn bị
                </button>
              </div>
            </div>
          ) : null}

        </div>

      </div>

    </div>
  )
}
