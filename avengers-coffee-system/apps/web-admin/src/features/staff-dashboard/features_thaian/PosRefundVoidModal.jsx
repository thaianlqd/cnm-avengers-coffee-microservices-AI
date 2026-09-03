import React, { useState } from 'react'
import {
  AlertTriangle,
  RotateCcw,
  X,
  Coins,
  Clock,
  User,
  ShoppingBag,
  Store,
  FileText,
  CheckCircle2,
  AlertCircle,
  Info
} from 'lucide-react'
import { fmtMoney, normalizeViText } from '../../admin-dashboard/utils'

const PRESET_REASONS = [
  'Nhập nhầm món hoặc nhầm số lượng tại quầy',
  'Khách hàng đổi ý hủy đơn trước khi pha chế',
  'Lỗi thao tác thu ngân quầy',
  'Khách hàng trả lại đồ uống do chất lượng',
  'Hết nguyên liệu pha chế tại Kiosk',
  'Lý do khác',
]

export function PosRefundVoidModal({
  order,
  activeShift,
  isOpen,
  onClose,
  onConfirmRefundVoid,
  processing = false,
}) {
  const [selectedPreset, setSelectedPreset] = useState(PRESET_REASONS[0])
  const [customNote, setCustomNote] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  if (!isOpen || !order) return null

  const tongTien = Number(order.tong_tien || 0)
  const isPaid = order.trang_thai_thanh_toan === 'DA_THANH_TOAN'

  const handleConfirm = async () => {
    const finalReason = selectedPreset === 'Lý do khác'
      ? customNote.trim()
      : customNote.trim()
        ? `${selectedPreset}: ${customNote.trim()}`
        : selectedPreset

    if (!finalReason) {
      setErrorMsg('Vui lòng chọn hoặc nhập lý do hoàn tiền và hủy đơn.')
      return
    }

    setErrorMsg('')
    try {
      await onConfirmRefundVoid(order.ma_don_hang, {
        reason: finalReason,
        branch_code: order.co_so_ma,
      })
      onClose()
    } catch (err) {
      setErrorMsg(err.message || 'Không thể hoàn tiền và hủy đơn.')
    }
  }

  const shiftOpenTimeFormatted = activeShift?.thoi_gian_mo_ca
    ? new Date(activeShift.thoi_gian_mo_ca).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : 'Đang mở'

  const orderTimeFormatted = order.ngay_tao
    ? new Date(order.ngay_tao).toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : 'Vừa tạo'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !processing) onClose()
      }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #fee2e2',
        }}
      >
        {/* MODAL HEADER */}
        <div
          style={{
            padding: '1.15rem 1.4rem',
            borderBottom: '1px solid #fee2e2',
            backgroundColor: '#fff5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={20} color="#dc2626" />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#991b1b' }}>
                Hoàn Tiền Mặt &amp; Hủy Giao Dịch POS
              </h2>
              <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.76rem', color: '#7f1d1d' }}>
                Thao tác dành cho quầy Kiosk bán tại chỗ và mang đi
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            style={{
              border: 'none',
              background: '#ffffff',
              borderRadius: '8px',
              padding: '0.4rem',
              cursor: processing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* MODAL BODY */}
        <div
          style={{
            padding: '1.25rem 1.4rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* CA TRỰC STATUS CHIP */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '10px',
              padding: '0.65rem 0.85rem',
              fontSize: '0.78rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#166534' }}>
              <Clock size={15} color="#16a34a" />
              <span>
                Ca Kiosk đang mở lúc: <strong>{shiftOpenTimeFormatted}</strong>
              </span>
            </div>
            <span
              style={{
                backgroundColor: '#dcfce7',
                color: '#15803d',
                padding: '0.15rem 0.5rem',
                borderRadius: '6px',
                fontWeight: '700',
                fontSize: '0.72rem',
              }}
            >
              Đủ điều kiện hoàn hủy
            </span>
          </div>

          {/* ORDER BRIEF INFO CARD */}
          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '0.9rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0f172a' }}>
                  Đơn #{order.ma_don_hang?.slice(0, 8)?.toUpperCase()}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    padding: '0.1rem 0.45rem',
                    borderRadius: '4px',
                    backgroundColor: '#e2e8f0',
                    color: '#334155',
                  }}
                >
                  {order.loai_don_hang === 'TAI_CHO' ? 'Dùng tại quầy' : 'Mang đi'}
                </span>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Tạo lúc {orderTimeFormatted}</span>
            </div>

            {/* Chi tiết món */}
            <div
              style={{
                borderTop: '1px dashed #cbd5e1',
                borderBottom: '1px dashed #cbd5e1',
                padding: '0.5rem 0',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                maxHeight: '120px',
                overflowY: 'auto',
              }}
            >
              {(order.chi_tiet || []).map((line, idx) => (
                <div
                  key={`${line.ma_san_pham}-${idx}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.78rem',
                    color: '#334155',
                  }}
                >
                  <span>
                    <strong>{line.so_luong}x</strong> {normalizeViText(line.ten_san_pham)}
                  </span>
                  <span style={{ fontWeight: '600', color: '#0f172a' }}>
                    {fmtMoney(Number(line.gia_ban || 0) * Number(line.so_luong || 1))}
                  </span>
                </div>
              ))}
            </div>

            {/* Khách & Bàn */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: '#64748b' }}>
              <span>
                Khách: <strong style={{ color: '#0f172a' }}>{normalizeViText(order.ten_khach_hang) || 'Khách vãng lai'}</strong>
              </span>
              {order.ma_ban ? (
                <span>
                  Bàn số: <strong style={{ color: '#0f172a' }}>{order.ma_ban}</strong>
                </span>
              ) : null}
            </div>
          </div>

          {/* CASH REFUND HIGHLIGHT BOX */}
          <div
            style={{
              backgroundColor: '#fff7ed',
              border: '1.5px solid #fed7aa',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: '#ffedd5',
                  color: '#ea580c',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Coins size={20} color="#ea580c" />
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: '#9a3412' }}>
                  {isPaid ? 'Số tiền mặt xuất quỹ hoàn lại cho khách:' : 'Giá trị hủy đơn:'}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#c2410c' }}>
                  Hình thức: <strong>Hoàn tiền mặt trực tiếp tại quầy Kiosk</strong>
                </span>
              </div>
            </div>

            <span style={{ fontSize: '1.15rem', fontWeight: '900', color: '#c2410c', flexShrink: 0 }}>
              {fmtMoney(tongTien)}
            </span>
          </div>

          {/* REASON SELECTION */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.81rem', fontWeight: '700', color: '#334155' }}>
              Lý do hoàn tiền &amp; hủy giao dịch:
            </label>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              {PRESET_REASONS.map((reason) => {
                const isSelected = selectedPreset === reason
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setSelectedPreset(reason)}
                    style={{
                      padding: '0.4rem 0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.76rem',
                      fontWeight: isSelected ? '700' : '500',
                      border: isSelected ? '1.5px solid #dc2626' : '1px solid #e2e8f0',
                      backgroundColor: isSelected ? '#fef2f2' : '#ffffff',
                      color: isSelected ? '#dc2626' : '#475569',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {reason}
                  </button>
                )
              })}
            </div>

            <textarea
              rows={2}
              placeholder="Ghi chú chi tiết thêm lý do hoàn tiền (không bắt buộc)..."
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.78rem',
                color: '#0f172a',
                outline: 'none',
                resize: 'vertical',
                marginTop: '0.2rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* WARNING NOTE */}
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '0.65rem 0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              fontSize: '0.74rem',
              color: '#991b1b',
            }}
          >
            <Info size={15} color="#dc2626" style={{ flexShrink: 0 }} />
            <span>
              <strong>Lưu ý:</strong> Sau khi xác nhận, giao dịch này sẽ được loại trừ hoàn toàn khỏi tổng doanh thu và tiền mặt khi chốt ca Kiosk.
            </span>
          </div>

          {errorMsg && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #f87171',
                borderRadius: '8px',
                padding: '0.6rem 0.8rem',
                color: '#b91c1c',
                fontSize: '0.78rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <AlertCircle size={15} color="#b91c1c" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div
          style={{
            padding: '1rem 1.4rem',
            borderTop: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              backgroundColor: '#ffffff',
              color: '#475569',
              fontSize: '0.81rem',
              fontWeight: '600',
              cursor: processing ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Hủy Bỏ / Quay Lại
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={processing}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: '#dc2626',
              color: '#ffffff',
              fontSize: '0.81rem',
              fontWeight: '700',
              cursor: processing ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.35)',
              transition: 'all 0.15s ease',
            }}
          >
            <RotateCcw size={16} color="#ffffff" />
            <span>{processing ? 'Đang xử lý...' : 'Xác Nhận Hoàn Tiền & Hủy Đơn'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
