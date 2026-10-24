import StatusBadge from '../../../components/console/StatusBadge'
import { WorkspacePanelIntro } from '../../../components/console/OperationalPageFrame'
import { Label } from '../../../components/ui/label'
import { Input } from '../../../components/ui/input'
import { Button } from '../../../components/ui/button'
import { Textarea } from '../../../components/ui/textarea'
import SearchableSelect from '../../../components/console/SearchableSelect'
import CurrencyInput from '../../../components/console/CurrencyInput'
import React, { useState, useEffect } from 'react'
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
  CheckCircle2,
  Printer,
  AlertCircle,
  Clock,
  ArrowRight,
  Sparkles
} from '../../../components/console/WorkspaceIcons'
import { POS_ORDER_TYPE_OPTIONS, POS_PAYMENT_OPTIONS, ORDER_STATUS_LABEL } from '../constants'
import { fmtMoney, normalizeViText, paymentTag } from '../utils'

export function PosOrderPanel({
  isKioskStaff,
  isManager,
  isStaff,
  activeKioskShift,
  moCaKiosk,
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
  statusTone,
}) {
  const [openShiftCash, setOpenShiftCash] = useState(0)
  const [openShiftNote, setOpenShiftNote] = useState('')
  const [isOpeningShift, setIsOpeningShift] = useState(false)
  const [openShiftError, setOpenShiftError] = useState('')

  useEffect(() => {
    if (isKioskStaff && posForm.loai_don_hang !== 'MANG_DI') {
      setPosForm(prev => ({ ...prev, loai_don_hang: 'MANG_DI', ma_ban: '' }))
    }
  }, [isKioskStaff, posForm.loai_don_hang, setPosForm])

  const handleOpenShift = async () => {
    setIsOpeningShift(true)
    setOpenShiftError('')
    try {
      const result = await moCaKiosk?.({ cash_open: openShiftCash, note: openShiftNote })
      if (result?.ok === false || result === false) setOpenShiftError(result?.error || 'Không mở được ca. Vui lòng thử lại.')
    } catch (error) { setOpenShiftError(error.message) }
    finally { setIsOpeningShift(false) }
  }

  return (
    <div className="manager-pos" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '1.25rem 1.5rem' }}>
      
      {/* HEADER TITLE */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid #e2e4df', paddingBottom: '1rem' }}>
        <WorkspacePanelIntro><div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700', color: '#252927', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Monitor size={22} color="var(--primary)" /> {isKioskStaff ? 'POS Tạo Đơn Nhanh Mang Đi' : 'POS Tạo Đơn Nhanh Tại Quầy'}
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: '#69736a' }}>
            {isKioskStaff
              ? 'Tạo đơn nhanh cho khách mang đi (Takeaway), tự động tính tiền thối và in hóa đơn tức thì.'
              : 'Tạo đơn trực tiếp cho khách dùng tại chỗ hoặc mang đi, tự động tính tiền thối và in hóa đơn tức thì.'}
          </p>
        </div></WorkspacePanelIntro>
      </div>

      {(isKioskStaff || isStaff || isManager) && <section className={`pos-session ${activeKioskShift ? 'pos-session--open' : ''}`} aria-label="Ca bán hàng">
        <div className="pos-session-intro"><div className="pos-session-icon"><Clock size={22}/></div><div><h2>{activeKioskShift ? 'Ca bán hàng đang mở' : 'Bắt đầu ca bán hàng'}</h2><p>{activeKioskShift ? `Mở lúc ${new Date(activeKioskShift.thoi_gian_mo_ca).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})} · Tiền đầu ca ${fmtMoney(activeKioskShift.tien_dau_ca)}` : 'Kiểm đếm tiền mặt đầu ca trước khi nhận thanh toán tại quầy.'}</p></div>{activeKioskShift && <StatusBadge status="ACTIVE">Đang hoạt động</StatusBadge>}</div>
        {!activeKioskShift && <><div className="pos-session-fields"><div><Label htmlFor="pos-opening-cash">Tiền mặt đầu ca</Label><CurrencyInput id="pos-opening-cash" value={openShiftCash === 0 ? '' : openShiftCash} onChange={e=>setOpenShiftCash(Number(e.target.value)||0)} placeholder="Ví dụ: 500.000"/></div><div><Label htmlFor="pos-opening-note">Ghi chú ca làm việc</Label><Input id="pos-opening-note" value={openShiftNote} onChange={e=>setOpenShiftNote(e.target.value)} placeholder="Không bắt buộc"/></div><Button variant="default" className="admin-button-primary" type="button" onClick={handleOpenShift} disabled={isOpeningShift}><CheckCircle2 size={16}/>{isOpeningShift ? 'Đang mở ca…' : 'Mở ca bán hàng'}</Button></div>{openShiftError&&<p role="alert" className="workspace-form-error">{openShiftError}</p>}</>}
      </section>}

      {/* SPLIT CONTAINER */}
      <div data-pos-layout="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* LEFT COLUMN: FORM & ITEMS SELECTION */}
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e4df', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Order Type & Payment Method Switches */}
          <div className="pos-order-options"><Label htmlFor="pos-order-type">Hình thức phục vụ<SearchableSelect id="pos-order-type" value={posForm.loai_don_hang} disabled={isKioskStaff} onChange={e => setPosForm(prev => ({ ...prev, loai_don_hang: e.target.value }))} options={POS_ORDER_TYPE_OPTIONS.filter(option => !isKioskStaff || option.id === 'MANG_DI').map(option => ({ value: option.id, label: option.label }))} /></Label><Label htmlFor="pos-payment-method">Phương thức thanh toán<SearchableSelect id="pos-payment-method" value={posForm.phuong_thuc_thanh_toan} onChange={e => setPosForm(prev => ({ ...prev, phuong_thuc_thanh_toan: e.target.value }))} options={POS_PAYMENT_OPTIONS.map(option => ({ value: option.id, label: option.label }))} /></Label></div>

          {/* Customer & Table Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: '0.85rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <Label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#414743', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <User size={14} color="#69736a" /> Tên khách hàng
              </Label>
              <Input
                type="text"
                placeholder="Khách vãng lai (không bắt buộc)"
                value={posForm.ten_khach_hang}
                onChange={(e) => setPosForm((prev) => ({ ...prev, ten_khach_hang: e.target.value }))}
                style={{ height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.8125rem', color: '#252927', outline: 'none' }}
              />
            </div>

            {!isKioskStaff && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <Label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#414743', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <MapPin size={14} color="#69736a" /> Mã / Số bàn
                </Label>
                <Input
                  type="text"
                  placeholder="Số bàn (nếu dùng tại chỗ)"
                  disabled={!['TAI_CHO', 'DUNG_TAI_CHO'].includes(posForm.loai_don_hang)}
                  value={posForm.ma_ban}
                  onChange={(e) => setPosForm((prev) => ({ ...prev, ma_ban: e.target.value }))}
                  style={{ height: '38px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', backgroundColor: ['TAI_CHO', 'DUNG_TAI_CHO'].includes(posForm.loai_don_hang) ? '#ffffff' : '#f4f5f2', fontSize: '0.8125rem', color: '#252927', outline: 'none' }}
                />
              </div>
            )}
          </div>

          {/* Note Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <Label style={{ fontSize: '0.78125rem', fontWeight: '600', color: '#414743', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <FileText size={14} color="#69736a" /> Ghi chú đơn
            </Label>
            <Textarea
              placeholder="VD: Ít đường, mang đi gấp..."
              rows={2}
              value={posForm.ghi_chu}
              onChange={(e) => setPosForm((prev) => ({ ...prev, ghi_chu: e.target.value }))}
              style={{ padding: '0.65rem 0.75rem', borderRadius: '8px', border: '1px solid #ccd3c7', fontSize: '0.8125rem', color: '#252927', outline: 'none', resize: 'vertical' }}
            />
          </div>

          {/* Items Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid #f4f5f2', paddingTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: '700', color: '#252927' }}>Danh sách món trong đơn:</span>
              <Button
                type="button"
                onClick={addPosItem}
                disabled={!inventoryState?.items?.length}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', backgroundColor: 'var(--primary-light)', color: 'var(--primary-hover)', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '0.35rem 0.75rem', fontSize: '0.78125rem', fontWeight: '700', cursor: 'pointer' }}
              >
                <Plus size={14} /> Thêm món
              </Button>
            </div>

            {!inventoryState?.loading && !inventoryState?.items?.length ? (
              <p style={{ fontSize: '0.8125rem', color: '#69736a', margin: 0 }}>Không có món nào trong thực đơn để chọn.</p>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {posItems.map((item, index) => (
                <div data-pos-line="true" key={`${item.ma_san_pham}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#f8f9f6', padding: '0.6rem 0.75rem', borderRadius: '10px', border: '1px solid #e2e4df', flexWrap: 'wrap' }}>
                  <SearchableSelect
                    value={item.ma_san_pham}
                    onChange={(e) => updatePosItem(index, 'ma_san_pham', e.target.value)}
                    style={{ flex: 2, height: '36px', padding: '0 0.65rem', borderRadius: '6px', border: '1px solid #ccd3c7', fontSize: '0.8125rem', fontWeight: '600', color: '#252927' }}
                  >
                    {(inventoryState?.items || []).map((menuItem) => (
                      <option key={menuItem.ma_san_pham} value={menuItem.ma_san_pham}>
                        {normalizeViText(menuItem.name)} {menuItem.dang_ban ? '' : '(Tạm hết)'}
                      </option>
                    ))}
                  </SearchableSelect>

                  <Input
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(e) => updatePosItem(index, 'qty', e.target.value)}
                    style={{ width: '65px', height: '36px', padding: '0 0.45rem', borderRadius: '6px', border: '1px solid #ccd3c7', fontSize: '0.8125rem', fontWeight: '700', textAlign: 'center' }}
                  />

                  <div style={{ width: '100px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 0.5rem', backgroundColor: "#f4f5f2", borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '700', color: '#252927' }}>
                    {fmtMoney(Number(item.price || 0) * Number(item.qty || 1))}
                  </div>

                  <Button
                    type="button"
                    onClick={() => removePosItem(index)}
                    style={{ backgroundColor: "#f4f5f2", color: '#dc2626', border: '1px solid #fecaca', width: '36px', height: '36px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              ))}
            </div>

            {posStatus?.error ? (
              <p style={{ margin: 0, fontSize: '0.78125rem', color: '#dc2626', fontWeight: '600', backgroundColor: "#f4f5f2", padding: '0.5rem', borderRadius: '6px' }}>{posStatus.error}</p>
            ) : null}
            {posStatus?.success ? (
              <p style={{ margin: 0, fontSize: '0.78125rem', color: '#2563eb', fontWeight: '600', backgroundColor: "#f4f5f2", padding: '0.5rem', borderRadius: '6px' }}>{posStatus.success}</p>
            ) : null}
            {posHasUnavailableItem ? (
              <p style={{ margin: 0, fontSize: '0.78125rem', color: '#dc2626', fontWeight: '600', backgroundColor: "#f4f5f2", padding: '0.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <AlertCircle size={14} /> Có món tạm ngưng bán trong danh sách. Vui lòng đổi món khác.
              </p>
            ) : null}
          </div>

        </div>

        {/* RIGHT COLUMN: RECEIPT PREVIEW & CONFIRMATION */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e4df', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 12px rgba(15, 23, 42, 0.03)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#252927', borderBottom: '1px solid #f4f5f2', paddingBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Sparkles size={16} color="var(--primary)" /> Xem trước tính tiền
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.84rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#69736a' }}>
                <span>Tạm tính tiền món:</span>
                <strong style={{ color: '#252927' }}>{fmtMoney(posSubtotal)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#69736a' }}>
                <span>VAT 8% (tham khảo):</span>
                <strong style={{ color: '#252927' }}>{fmtMoney(posVat)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.05rem', color: '#252927', borderTop: '1px solid #f4f5f2', paddingTop: '0.65rem', marginTop: '0.2rem' }}>
                <span>Tổng cộng thu khách:</span>
                <strong style={{ color: 'var(--primary)', fontWeight: '600' }}>{fmtMoney(posTotal)}</strong>
              </div>
            </div>

            {/* Cash input & calculation */}
            {isCashMethod ? (
              <div style={{ backgroundColor: '#f8f9f6', border: '1px solid #e2e4df', borderRadius: '10px', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.25rem' }}>
                <Label htmlFor="pos-cash-input" style={{ fontSize: '0.78125rem', fontWeight: '700', color: '#414743' }}>
                  Tiền khách đưa (VNĐ):
                </Label>
                <CurrencyInput
                  id="pos-cash-input"
                  style={{ height: '36px', width: '100%', padding: '0 0.65rem', borderRadius: '6px', border: '1px solid #ccd3c7', fontSize: '0.9rem', fontWeight: '700', color: '#252927' }}
                  value={posCashInput === 0 || posCashInput === '0' ? '' : posCashInput}
                  onChange={(e) => {
                    const val = e.target.value
                    setPosCashInput(val === '' ? 0 : Number(val))
                  }}
                  onFocus={(e) => e.target.select()}
                  placeholder="0"
                />
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.78125rem', fontWeight: '700', color: posCashInsufficient ? '#dc2626' : '#2563eb' }}>
                  {posCashInsufficient ? "Tiền khách đưa chưa đủ" : `Tiền thối lại: ${fmtMoney(posChange)}`}
                </p>
              </div>
            ) : null}

            {/* Confirm Create Button */}
            <Button data-intent="success"
              type="button"
              className="btn-save-green"
              onClick={taoDonTaiQuay}
              disabled={
                creatingPosOrder ||
                inventoryState?.loading ||
                !inventoryState?.items?.length ||
                posHasUnavailableItem ||
                (isCashMethod && posCashInsufficient) ||
                ((isKioskStaff || isStaff || isManager) && !activeKioskShift)
              }
              style={{
                width: '100%',
                height: '42px',
                borderRadius: '10px',
                fontSize: '0.9rem',
                fontWeight: '700',
                cursor: ((isKioskStaff || isStaff || isManager) && !activeKioskShift) ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                marginTop: '0.5rem',
                opacity: ((isKioskStaff || isStaff || isManager) && !activeKioskShift) ? 0.6 : 1
              }}
            >
              <Check size={18} color="#ffffff" />
              <span>{creatingPosOrder ? 'Đang tạo đơn...' : isKioskStaff ? 'Xác Nhận Tạo Đơn Mang Đi' : 'Xác Nhận Tạo Đơn Tại Quầy'}</span>
            </Button>
          </div>

          {/* CREATED POS ORDER BILL BOX */}
          {lastPosOrder?.order ? (
            <div style={{ backgroundColor: '#ffffff', border: '1px solid var(--border-light)', borderRadius: '16px', padding: '1.25rem', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--primary-light)', paddingBottom: '0.65rem' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={16} color="var(--primary)" /> Đơn vừa tạo thành công
                </h3>
                <Button
                  type="button"
                  onClick={() => inHoaDonPos(lastPosOrder.order.ma_don_hang)}
                  style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary-hover)', border: '1px solid var(--border-light)', borderRadius: '6px', padding: '0.25rem 0.65rem', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <Printer size={13} /> In hóa đơn
                </Button>
              </div>

              <div style={{ fontSize: '0.8125rem', color: '#414743', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Mã đơn hàng:</span>
                  <strong style={{ color: '#252927' }}>#{lastPosOrder.order.ma_don_hang?.slice(0, 8)?.toUpperCase()}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Trạng thái đơn:</span>
                  <span className={`status-pill ${statusTone ? statusTone(lastPosOrder.order.trang_thai_don_hang) : 'tone-new'}`}>
                    {ORDER_STATUS_LABEL[lastPosOrder.order.trang_thai_don_hang] || lastPosOrder.order.trang_thai_don_hang}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Thanh toán:</span>
                  <strong style={{ color: '#2563eb' }}>{lastPosOrder.order.trang_thai_thanh_toan}</strong>
                </div>
              </div>

              {lastPosOrder.order.phuong_thuc_thanh_toan !== 'THANH_TOAN_KHI_NHAN_HANG' && lastPosOrder.paymentDetails?.qr_img_url ? (
                <div style={{ textAlign: 'center', backgroundColor: '#f8f9f6', padding: '0.75rem', borderRadius: '8px', border: '1px solid #e2e4df', marginTop: '0.25rem' }}>
                  <span style={{ display: 'block', fontSize: '0.75rem', color: '#69736a', fontWeight: '600', marginBottom: '0.4rem' }}>Khách quét QR để thanh toán:</span>
                  <img src={lastPosOrder.paymentDetails.qr_img_url} alt="Mã QR thanh toán" style={{ width: '150px', height: '150px', objectFit: 'contain', margin: '0 auto', display: 'block', borderRadius: '6px' }} />
                </div>
              ) : null}

              <div data-modal-actions="true" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.35rem' }}>
                <Button data-intent="success"
                  type="button"
                  onClick={() => {
                    capNhatTrangThaiDon(lastPosOrder.order.ma_don_hang, 'DA_XAC_NHAN')
                    setActiveTab('orders')
                  }}
                  style={{ flex: 1, backgroundColor: 'var(--primary)', color: '#ffffff', border: 'none', borderRadius: '6px', height: '34px', fontSize: '0.78125rem', fontWeight: '700', cursor: 'pointer' }}
                >
                  Xác nhận đơn
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    capNhatTrangThaiDon(lastPosOrder.order.ma_don_hang, 'DANG_CHUAN_BI')
                    setActiveTab('orders')
                  }}
                  style={{ flex: 1, backgroundColor: '#f4f5f2', color: '#414743', border: '1px solid #ccd3c7', borderRadius: '6px', height: '34px', fontSize: '0.78125rem', fontWeight: '600', cursor: 'pointer' }}
                >
                  Đang chuẩn bị
                </Button>
              </div>
            </div>
          ) : null}

        </div>

      </div>

    </div>
  )
}
