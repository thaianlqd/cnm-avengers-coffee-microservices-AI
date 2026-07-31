import React, { useMemo, useState } from 'react'
import {
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Edit3,
  Trash2,
  Save,
  X,
  FileText,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  User,
  UserCheck,
  ClipboardList,
  Inbox,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  AlertCircle
} from 'lucide-react'
import { fmtMoney } from '../utils'

const SHIFT_PAGE_SIZE = 8

const HISTORY_FILTERS = [
  { id: 'today', label: 'Hôm nay' },
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: 'all', label: 'Tất cả' },
]

function getDiffStyle(diff) {
  if (diff === null || diff === undefined) return { bg: '#f8fafc', color: '#64748b', border: '#e2e8f0', icon: CheckCircle2 }
  if (diff > 0) return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', icon: TrendingUp, text: 'Thừa tiền' }
  if (diff < 0) return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', icon: AlertTriangle, text: 'Thiếu tiền' }
  return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', icon: CheckCircle2, text: 'Chuẩn 0đ' }
}

function getApprovalBadgeStyle(status) {
  if (status === 'APPROVED') {
    return {
      background: '#d1fae5',
      color: '#047857',
      border: '1px solid #a7f3d0',
      icon: CheckCircle2,
      label: 'Đã duyệt'
    }
  }
  if (status === 'REJECTED') {
    return {
      background: '#fee2e2',
      color: '#b91c1c',
      border: '1px solid #fca5a5',
      icon: XCircle,
      label: 'Từ chối'
    }
  }
  return {
    background: '#fef3c7',
    color: '#b45309',
    border: '1px solid #fde68a',
    icon: Clock,
    label: 'Chờ duyệt'
  }
}

function ShiftHistoryItem({ item, canApprove, canEdit, approvingShiftId, onDelete, onSaveEdit, onApprove }) {
  const [editing, setEditing] = useState(false)
  const [approvalNote, setApprovalNote] = useState(item.approval_note || '')
  const [draft, setDraft] = useState({
    cash_open: item.cash_open,
    cash_close: item.cash_close,
    note: item.note || '',
    staff_name: item.staff_name || '',
  })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const ok = await onSaveEdit(item.ma_ca, {
      cash_open: Number(draft.cash_open) || 0,
      cash_close: Number(draft.cash_close) || 0,
      note: draft.note,
      staff_name: draft.staff_name,
    })
    setSaving(false)
    if (ok) setEditing(false)
  }

  const handleApprove = async (status) => {
    await onApprove(item.ma_ca, {
      status,
      approval_note: approvalNote,
    })
  }

  const diff = editing
    ? Number(draft.cash_close) - (Number(draft.cash_open) + item.cash_revenue)
    : item.difference

  const diffMeta = getDiffStyle(diff)
  const DiffIcon = diffMeta.icon
  const approvalMeta = getApprovalBadgeStyle(item.approval_status)
  const StatusIcon = approvalMeta.icon

  const lockedForStaff = item.approval_status === 'APPROVED'

  return (
    <article style={{
      background: '#ffffff',
      borderRadius: '14px',
      border: '1px solid #e2e8f0',
      padding: '1rem',
      marginBottom: '0.85rem',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.02)',
      transition: 'all 0.2s ease'
    }}>
      {/* Header card */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.5rem',
        paddingBottom: '0.6rem',
        borderBottom: '1px solid #f1f5f9',
        marginBottom: '0.6rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.8rem',
            fontWeight: '800',
            color: '#1e293b',
            background: '#f1f5f9',
            padding: '0.2rem 0.5rem',
            borderRadius: '6px'
          }}>
            #{item.ma_ca.slice(0, 8).toUpperCase()}
          </span>

          <span style={{
            fontSize: '0.825rem',
            fontWeight: '600',
            color: '#334155',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}>
            <User size={14} color="#2563eb" /> {item.staff_name || 'Không xác định'}
          </span>

          <span style={{
            fontSize: '0.75rem',
            fontWeight: '700',
            padding: '0.2rem 0.55rem',
            borderRadius: '9999px',
            background: approvalMeta.background,
            color: approvalMeta.color,
            border: approvalMeta.border,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            <StatusIcon size={12} /> {approvalMeta.label}
          </span>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {!editing && canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={lockedForStaff}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                border: 'none',
                background: lockedForStaff ? '#e2e8f0' : '#eff6ff',
                color: lockedForStaff ? '#94a3b8' : '#2563eb',
                fontSize: '0.775rem',
                fontWeight: '600',
                cursor: lockedForStaff ? 'not-allowed' : 'pointer'
              }}
            >
              <Edit3 size={13} /> Sửa
            </button>
          )}

          {canEdit && (
            <button
              type="button"
              onClick={() => onDelete(item.ma_ca)}
              disabled={lockedForStaff}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                border: 'none',
                background: lockedForStaff ? '#e2e8f0' : '#fef2f2',
                color: lockedForStaff ? '#94a3b8' : '#ef4444',
                fontSize: '0.775rem',
                fontWeight: '600',
                cursor: lockedForStaff ? 'not-allowed' : 'pointer'
              }}
            >
              <Trash2 size={13} /> Xóa
            </button>
          )}
        </div>
      </div>

      {/* Time Row */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.775rem',
        color: '#64748b',
        marginBottom: '0.65rem'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Clock size={13} color="#64748b" /> {new Date(item.from).toLocaleString('vi-VN')} → {new Date(item.to).toLocaleString('vi-VN')}
        </span>
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
          Chốt: {new Date(item.created_at).toLocaleString('vi-VN')}
        </span>
      </div>

      {/* Edit Mode Form */}
      {editing ? (
        <div style={{
          background: '#f8fafc',
          padding: '0.85rem',
          borderRadius: '10px',
          border: '1px solid #cbd5e1',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
                Tiền đầu ca
              </label>
              <input
                type="number"
                min="0"
                value={draft.cash_open === 0 || draft.cash_open === '0' ? '' : draft.cash_open}
                onChange={(e) => {
                  const val = e.target.value
                  setDraft((p) => ({ ...p, cash_open: val === '' ? 0 : Number(val) }))
                }}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                style={{ width: '100%', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
                Tiền cuối ca
              </label>
              <input
                type="number"
                min="0"
                value={draft.cash_close === 0 || draft.cash_close === '0' ? '' : draft.cash_close}
                onChange={(e) => {
                  const val = e.target.value
                  setDraft((p) => ({ ...p, cash_close: val === '' ? 0 : Number(val) }))
                }}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                style={{ width: '100%', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
                Nhân viên
              </label>
              <input
                type="text"
                value={draft.staff_name}
                onChange={(e) => setDraft((p) => ({ ...p, staff_name: e.target.value }))}
                style={{ width: '100%', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', display: 'block', marginBottom: '0.2rem' }}>
              Ghi chú
            </label>
            <input
              type="text"
              value={draft.note}
              onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
              style={{ width: '100%', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.825rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                border: 'none',
                background: '#10b981',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <Save size={13} /> {saving ? 'Lưu...' : 'Lưu'}
            </button>

            <button
              type="button"
              onClick={() => setEditing(false)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <X size={13} /> Hủy
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
            gap: '0.5rem',
            marginBottom: '0.65rem'
          }}>
            <div style={{ background: '#f8fafc', padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Tiền đầu ca</span>
              <strong style={{ fontSize: '0.825rem', color: '#1e293b' }}>{fmtMoney(item.cash_open)}</strong>
            </div>

            <div style={{ background: '#f8fafc', padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Tiền cuối ca</span>
              <strong style={{ fontSize: '0.825rem', color: '#1e293b' }}>{fmtMoney(item.cash_close)}</strong>
            </div>

            <div style={{ background: '#f8fafc', padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Thực thu mặt</span>
              <strong style={{ fontSize: '0.825rem', color: '#059669' }}>{fmtMoney(item.cash_revenue)}</strong>
            </div>

            <div style={{ background: '#f8fafc', padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Doanh thu</span>
              <strong style={{ fontSize: '0.825rem', color: '#0f172a' }}>{fmtMoney(item.total_revenue)}</strong>
            </div>

            <div style={{
              background: diffMeta.bg,
              padding: '0.45rem 0.6rem',
              borderRadius: '8px',
              border: `1px solid ${diffMeta.border}`,
              color: diffMeta.color
            }}>
              <span style={{ fontSize: '0.7rem', opacity: 0.9, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <DiffIcon size={11} /> Chênh lệch
              </span>
              <strong style={{ fontSize: '0.85rem', display: 'block', marginTop: '0.1rem' }}>
                {diff >= 0 ? '+' : ''}{fmtMoney(diff)}
              </strong>
            </div>
          </div>

          {/* Notes */}
          {item.note && (
            <div style={{
              fontSize: '0.775rem',
              color: '#475569',
              background: '#f8fafc',
              padding: '0.4rem 0.6rem',
              borderRadius: '6px',
              marginBottom: '0.4rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <FileText size={13} color="#64748b" style={{ flexShrink: 0 }} />
              <span>Ghi chú: {item.note}</span>
            </div>
          )}

          {item.approval_note && (
            <div style={{
              fontSize: '0.775rem',
              color: '#1e293b',
              background: '#eff6ff',
              padding: '0.4rem 0.6rem',
              borderRadius: '6px',
              marginBottom: '0.4rem',
              border: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <ShieldCheck size={13} color="#2563eb" style={{ flexShrink: 0 }} />
              <span>Manager: {item.approval_note}</span>
            </div>
          )}

          {/* Manager Approval Actions Box */}
          {canApprove && (
            <div style={{
              marginTop: '0.65rem',
              padding: '0.75rem',
              background: '#f8fafc',
              borderRadius: '10px',
              border: '1px dashed #cbd5e1',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <textarea
                rows={1}
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Ghi chú xét duyệt ca..."
                style={{
                  width: '100%',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.8rem',
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => handleApprove('APPROVED')}
                  disabled={approvingShiftId === item.ma_ca}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  <CheckCircle2 size={14} /> Duyệt ca
                </button>

                <button
                  type="button"
                  onClick={() => handleApprove('REJECTED')}
                  disabled={approvingShiftId === item.ma_ca}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#ef4444',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  <XCircle size={14} /> Từ chối
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </article>
  )
}

export function ShiftPanel({
  isManager,
  mode = 'shift',
  currentUserName,
  shiftDate, setShiftDate,
  shiftRange, setShiftRange,
  shiftInput, setShiftInput,
  shiftPreview, shiftHistory = [],
  shiftStatus = {}, closingShift,
  approvingShiftId,
  chotCaTienMat, suaCaLamViec, xoaCaLamViec, pheDuyetCaLamViec,
}) {
  const isApprovalMode = mode === 'approval'
  const canApprove = isManager && isApprovalMode
  const canEditHistory = !isApprovalMode || isManager

  const [historyFilter, setHistoryFilter] = useState('today')
  const [historyPage, setHistoryPage] = useState(1)
  const [showDetails, setShowDetails] = useState(false)

  const preview = shiftPreview
  const existingShift = preview?.existing_shift || null
  const diff = preview?.reconciliation?.difference ?? (shiftInput.cashClose - shiftInput.cashOpen)
  const expectedClose = preview?.reconciliation?.expected_cash_close ?? 0
  const diffMeta = getDiffStyle(diff)
  const DiffIcon = diffMeta.icon

  const filteredHistory = useMemo(() => {
    const now = Date.now()
    const minTs =
      historyFilter === 'today'
        ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        : historyFilter === '7d'
          ? now - 7 * 24 * 60 * 60 * 1000
          : historyFilter === '30d'
            ? now - 30 * 24 * 60 * 60 * 1000
            : 0

    return shiftHistory.filter((item) => {
      if (historyFilter === 'all') return true
      const ts = new Date(item.created_at).getTime()
      return !Number.isNaN(ts) && ts >= minTs
    })
  }, [shiftHistory, historyFilter])

  const approvalSummary = useMemo(() => ({
    total: shiftHistory.length,
    pending: shiftHistory.filter((item) => item.approval_status === 'PENDING').length,
    approved: shiftHistory.filter((item) => item.approval_status === 'APPROVED').length,
    rejected: shiftHistory.filter((item) => item.approval_status === 'REJECTED').length,
  }), [shiftHistory])

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / SHIFT_PAGE_SIZE))
  const safePage = Math.min(historyPage, totalPages)
  const pagedHistory = filteredHistory.slice((safePage - 1) * SHIFT_PAGE_SIZE, safePage * SHIFT_PAGE_SIZE)

  const onChangeFilter = (nextFilter) => {
    setHistoryFilter(nextFilter)
    setHistoryPage(1)
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
      gap: '1.25rem',
      alignItems: 'start',
      width: '100%'
    }}>
      {/* LEFT COLUMN / COMPACT FORM CARD */}
      <section style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {isApprovalMode ? (
          <>
            <div style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
              padding: '1rem 1.25rem',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem'
            }}>
              <ShieldCheck size={22} color="#38bdf8" />
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#ffffff' }}>
                  Kiểm tra biên bản chốt ca
                </h2>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', opacity: 0.85 }}>
                  Manager duyệt hoặc từ chối biên bản ca trực do nhân viên nộp.
                </p>
              </div>
            </div>

            <div style={{ padding: '1.25rem' }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.25rem 0.65rem',
                borderRadius: '9999px',
                background: '#eff6ff',
                color: '#2563eb',
                fontSize: '0.8rem',
                fontWeight: '700',
                marginBottom: '0.85rem'
              }}>
                <UserCheck size={14} /> Manager: {currentUserName || 'Quản lý'}
              </div>

              {/* Approval Summary Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.65rem' }}>
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Tổng số biên bản</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a', marginTop: '0.1rem' }}>
                    {approvalSummary.total}
                  </div>
                </div>

                <div style={{ background: '#fef3c7', padding: '0.75rem', borderRadius: '10px', border: '1px solid #fde68a' }}>
                  <span style={{ fontSize: '0.75rem', color: '#b45309' }}>Chờ phê duyệt</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#b45309', marginTop: '0.1rem' }}>
                    {approvalSummary.pending}
                  </div>
                </div>

                <div style={{ background: '#d1fae5', padding: '0.75rem', borderRadius: '10px', border: '1px solid #a7f3d0' }}>
                  <span style={{ fontSize: '0.75rem', color: '#047857' }}>Đã chấp thuận</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#047857', marginTop: '0.1rem' }}>
                    {approvalSummary.approved}
                  </div>
                </div>

                <div style={{ background: '#fee2e2', padding: '0.75rem', borderRadius: '10px', border: '1px solid #fca5a5' }}>
                  <span style={{ fontSize: '0.75rem', color: '#b91c1c' }}>Đã từ chối</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#b91c1c', marginTop: '0.1rem' }}>
                    {approvalSummary.rejected}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
              padding: '1rem 1.25rem',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem'
            }}>
              <Clock size={22} color="#ffffff" />
              <div>
                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#ffffff' }}>
                  Chốt ca làm việc
                </h2>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', opacity: 0.9 }}>
                  {isManager ? 'Ghi nhận đối soát tiền mặt & ca trực Quản lý.' : 'Nhập tiền mặt thực tế và kiểm tra biên bản đối soát ca.'}
                </p>
              </div>
            </div>

            {/* Compact Form Body */}
            <div style={{ padding: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Row 1: Date, Cash Open, Cash Close in 3 Inline Columns */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: '0.65rem' }}>
                <div>
                  <label htmlFor="shift-date" style={{ fontSize: '0.775rem', fontWeight: '700', color: '#374151', display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                    <Calendar size={13} color="#10b981" /> Ngày chốt
                  </label>
                  <input
                    id="shift-date"
                    type="date"
                    value={shiftDate}
                    onChange={(e) => setShiftDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.55rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.825rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label htmlFor="cash-open" style={{ fontSize: '0.775rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.25rem' }}>
                    Tiền đầu ca
                  </label>
                  <input
                    id="cash-open"
                    type="number"
                    min="0"
                    value={shiftInput.cashOpen === 0 || shiftInput.cashOpen === '0' ? '' : shiftInput.cashOpen}
                    onChange={(e) => {
                      const val = e.target.value
                      setShiftInput((p) => ({ ...p, cashOpen: val === '' ? 0 : Number(val) }))
                    }}
                    onFocus={(e) => e.target.select()}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.55rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label htmlFor="cash-close" style={{ fontSize: '0.775rem', fontWeight: '700', color: '#059669', display: 'block', marginBottom: '0.25rem' }}>
                    Tiền cuối ca
                  </label>
                  <input
                    id="cash-close"
                    type="number"
                    min="0"
                    value={shiftInput.cashClose === 0 || shiftInput.cashClose === '0' ? '' : shiftInput.cashClose}
                    onChange={(e) => {
                      const val = e.target.value
                      setShiftInput((p) => ({ ...p, cashClose: val === '' ? 0 : Number(val) }))
                    }}
                    onFocus={(e) => e.target.select()}
                    placeholder="0"
                    style={{
                      width: '100%',
                      padding: '0.45rem 0.55rem',
                      borderRadius: '8px',
                      border: '1.5px solid #10b981',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      color: '#059669',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Row 2: Note Field */}
              <div>
                <label htmlFor="shift-note" style={{ fontSize: '0.775rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.25rem' }}>
                  Ghi chú bàn giao
                </label>
                <input
                  id="shift-note"
                  type="text"
                  value={shiftInput.note}
                  onChange={(e) => setShiftInput((p) => ({ ...p, note: e.target.value }))}
                  placeholder="Ghi chú sự cố, chênh lệch hoặc lưu ý ca sau..."
                  style={{
                    width: '100%',
                    padding: '0.45rem 0.65rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.825rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Compact 4-Card Financial Reconciliation Grid */}
              <div style={{
                background: '#f8fafc',
                borderRadius: '12px',
                padding: '0.75rem',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  {/* Card 1: Doanh thu ca */}
                  <div style={{ background: '#ffffff', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.725rem', color: '#64748b' }}>Doanh thu ({preview?.system?.total_orders ?? 0} đơn)</span>
                    <strong style={{ fontSize: '0.9rem', display: 'block', color: '#0f172a', marginTop: '0.1rem' }}>
                      {fmtMoney(preview?.system?.total_revenue ?? 0)}
                    </strong>
                  </div>

                  {/* Card 2: Thực thu tiền mặt */}
                  <div style={{ background: '#ffffff', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.725rem', color: '#64748b' }}>Thực thu tiền mặt</span>
                    <strong style={{ fontSize: '0.9rem', display: 'block', color: '#059669', marginTop: '0.1rem' }}>
                      {fmtMoney(preview?.system?.cash_revenue ?? 0)}
                    </strong>
                  </div>

                  {/* Card 3: Kỳ vọng cuối ca */}
                  <div style={{ background: '#ffffff', padding: '0.5rem 0.65rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.725rem', color: '#64748b' }}>Kỳ vọng cuối ca</span>
                    <strong style={{ fontSize: '0.9rem', display: 'block', color: '#2563eb', fontWeight: '800', marginTop: '0.1rem' }}>
                      {fmtMoney(expectedClose)}
                    </strong>
                  </div>

                  {/* Card 4: Chênh lệch */}
                  <div style={{
                    background: diffMeta.bg,
                    padding: '0.5rem 0.65rem',
                    borderRadius: '8px',
                    border: `1px solid ${diffMeta.border}`,
                    color: diffMeta.color
                  }}>
                    <span style={{ fontSize: '0.725rem', opacity: 0.9, display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                      <DiffIcon size={12} /> {diffMeta.text}
                    </span>
                    <strong style={{ fontSize: '0.95rem', display: 'block', marginTop: '0.1rem' }}>
                      {diff >= 0 ? '+' : ''}{fmtMoney(diff)}
                    </strong>
                  </div>
                </div>

                {/* Collapsible Advanced Breakdown */}
                <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setShowDetails(!showDetails)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#2563eb',
                      fontSize: '0.775rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.2rem 0.4rem'
                    }}
                  >
                    {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    {showDetails ? 'Thu gọn chi tiết' : 'Xem chi tiết tiền thối & Online'}
                  </button>

                  {showDetails && (
                    <div style={{
                      marginTop: '0.5rem',
                      paddingTop: '0.5rem',
                      borderTop: '1px dashed #cbd5e1',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '0.4rem',
                      textAlign: 'left'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Tiền mặt thu vào: <strong>{fmtMoney(preview?.system?.cash_in_gross ?? 0)}</strong>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Tiền thối khách: <strong>{fmtMoney(preview?.system?.cash_change_out ?? 0)}</strong>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Doanh thu Online: <strong>{fmtMoney(preview?.system?.online_revenue ?? 0)}</strong>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        Doanh thu tại shop: <strong>{fmtMoney(preview?.system?.in_store_revenue ?? 0)}</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Alert Messages */}
              {existingShift && (
                <div style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>Ngày này đã chốt ca <strong>#{existingShift.ma_ca.slice(0, 8).toUpperCase()}</strong>.</span>
                </div>
              )}

              {shiftStatus.error && (
                <div style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}>
                  <AlertCircle size={15} /> {shiftStatus.error}
                </div>
              )}

              {shiftStatus.success && (
                <div style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: '8px',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#047857',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}>
                  <CheckCircle2 size={15} /> {shiftStatus.success}
                </div>
              )}

              {/* Compact Submit Button */}
              <button
                type="button"
                onClick={chotCaTienMat}
                disabled={closingShift || shiftStatus.loading || Boolean(existingShift)}
                style={{
                  width: '100%',
                  padding: '0.7rem 1rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: Boolean(existingShift) ? '#cbd5e1' : 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                  color: '#ffffff',
                  fontSize: '0.925rem',
                  fontWeight: '700',
                  cursor: Boolean(existingShift) ? 'not-allowed' : 'pointer',
                  boxShadow: Boolean(existingShift) ? 'none' : '0 4px 10px rgba(16, 185, 129, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  transition: 'all 0.2s ease'
                }}
              >
                {closingShift ? (
                  <>
                    <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Đang xử lý...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} /> Xác nhận chốt ca làm việc
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </section>

      {/* RIGHT COLUMN / SHIFT HISTORY PANEL */}
      <section style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '1.25rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* History Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          paddingBottom: '0.65rem',
          borderBottom: '1px solid #f1f5f9'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ClipboardList size={20} color="#059669" />
            <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#0f172a' }}>
              {isApprovalMode ? 'Biên bản chờ kiểm tra' : 'Lịch sử ca đã chốt'}
            </h2>
          </div>
          <span style={{
            fontSize: '0.775rem',
            fontWeight: '700',
            background: '#eff6ff',
            color: '#2563eb',
            padding: '0.2rem 0.55rem',
            borderRadius: '9999px'
          }}>
            {filteredHistory.length} ca
          </span>
        </div>

        {/* Filter Chips Row */}
        <div style={{
          display: 'flex',
          gap: '0.4rem',
          background: '#f1f5f9',
          padding: '0.25rem',
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          {HISTORY_FILTERS.map((item) => {
            const isActive = historyFilter === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeFilter(item.id)}
                style={{
                  flex: 1,
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  border: 'none',
                  background: isActive ? '#ffffff' : 'transparent',
                  color: isActive ? '#0f172a' : '#64748b',
                  fontWeight: isActive ? '700' : '500',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                {item.label}
              </button>
            )
          })}
        </div>

        {/* History List or Empty State */}
        {!pagedHistory.length ? (
          <div style={{
            textAlign: 'center',
            padding: '2.5rem 1rem',
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1px dashed #cbd5e1'
          }}>
            <Inbox size={36} color="#94a3b8" style={{ marginBottom: '0.5rem' }} />
            <h4 style={{ margin: '0 0 0.3rem 0', color: '#334155', fontSize: '1rem' }}>Chưa có biên bản ca phù hợp</h4>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.825rem' }}>
              {shiftHistory.length ? 'Thử chọn bộ lọc thời gian khác để xem biên bản.' : 'Chưa có ca làm việc nào được gửi.'}
            </p>
          </div>
        ) : (
          <div>
            {pagedHistory.map((item) => (
              <ShiftHistoryItem
                key={item.ma_ca}
                item={item}
                canApprove={canApprove}
                canEdit={canEditHistory}
                approvingShiftId={approvingShiftId}
                onDelete={xoaCaLamViec}
                onSaveEdit={suaCaLamViec}
                onApprove={pheDuyetCaLamViec}
              />
            ))}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.4rem',
            marginTop: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid #f1f5f9'
          }}>
            <button
              type="button"
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: safePage === 1 ? '#cbd5e1' : '#334155',
                fontSize: '0.775rem',
                fontWeight: '600',
                cursor: safePage === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronLeft size={14} /> Trước
            </button>

            <div style={{ display: 'flex', gap: '0.2rem' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setHistoryPage(p)}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    border: 'none',
                    background: safePage === p ? '#10b981' : 'transparent',
                    color: safePage === p ? '#ffffff' : '#64748b',
                    fontWeight: safePage === p ? '700' : '500',
                    fontSize: '0.775rem',
                    cursor: 'pointer'
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem',
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: safePage === totalPages ? '#cbd5e1' : '#334155',
                fontSize: '0.775rem',
                fontWeight: '600',
                cursor: safePage === totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Tiếp <ChevronRight size={14} />
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
