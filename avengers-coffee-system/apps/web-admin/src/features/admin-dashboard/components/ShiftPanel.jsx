import StatusBadge from '../../../components/console/StatusBadge'
import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import { Table } from '../../../components/ui/table'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'
import { Label } from '../../../components/ui/label'
import { Input } from '../../../components/ui/input'
import { Textarea } from '../../../components/ui/textarea'
import { PageNumbers } from '../../../components/console/CompactPagination'
import CurrencyInput from '../../../components/console/CurrencyInput'
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
} from '../../../components/console/WorkspaceIcons'
import { fmtMoney } from '../utils'

const SHIFT_PAGE_SIZE = 8

const HISTORY_FILTERS = [
  { id: 'today', label: 'Hôm nay' },
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: 'all', label: 'Tất cả' },
]

function getDiffStyle(diff) {
  if (diff === null || diff === undefined) return { bg: '#f8f9f6', color: '#69736a', border: '#e2e4df', icon: CheckCircle2 }
  if (diff > 0) return { bg: "#f4f5f2", color: '#1d4ed8', border: '#bfdbfe', icon: TrendingUp, text: 'Thừa tiền' }
  if (diff < 0) return { bg: "#f4f5f2", color: '#b91c1c', border: '#fecaca', icon: AlertTriangle, text: 'Thiếu tiền' }
  return { bg: 'var(--primary-light)', color: 'var(--primary-hover)', border: '#bfdbfe', icon: CheckCircle2, text: 'Chuẩn 0đ' }
}

function getApprovalBadgeStyle(status) {
  if (status === 'APPROVED') {
    return {
      background: "#f4f5f2",
      color: '#1d4ed8',
      border: '1px solid #bfdbfe',
      icon: CheckCircle2,
      label: 'Đã duyệt'
    }
  }
  if (status === 'REJECTED') {
    return {
      background: "#f4f5f2",
      color: '#b91c1c',
      border: '1px solid #fca5a5',
      icon: XCircle,
      label: 'Từ chối'
    }
  }
  return {
    background: "#f4f5f2",
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
      border: '1px solid #e2e4df',
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
        borderBottom: '1px solid #f4f5f2',
        marginBottom: '0.6rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Badge variant="outline" data-quiet-label="true" style={{
            fontSize: '0.8rem',
            fontWeight: '600',
            color: '#30382e',
            background: '#f4f5f2',
            padding: '0.2rem 0.5rem',
            borderRadius: '6px'
          }}>
            #{item.ma_ca.slice(0, 8).toUpperCase()}
          </Badge>

          <span style={{
            fontSize: '0.825rem',
            fontWeight: '600',
            color: '#414743',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}>
            <User size={14} color="var(--primary)" /> {item.staff_name || 'Không xác định'}
          </span>

          <StatusBadge status={item.approval_status}>{approvalMeta.label}</StatusBadge>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {!editing && canEdit && (
            <Button
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
                background: lockedForStaff ? "#f4f5f2" : 'var(--primary-light)',
                color: lockedForStaff ? '#85907d' : 'var(--primary)',
                fontSize: '0.775rem',
                fontWeight: '600',
                cursor: lockedForStaff ? 'not-allowed' : 'pointer'
              }}
            >
              <Edit3 size={13} /> Sửa
            </Button>
          )}

          {canEdit && (
            <Button data-intent="danger"
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
                background: lockedForStaff ? "#f4f5f2" : "#f4f5f2",
                color: lockedForStaff ? '#85907d' : '#ef4444',
                fontSize: '0.775rem',
                fontWeight: '600',
                cursor: lockedForStaff ? 'not-allowed' : 'pointer'
              }}
            >
              <Trash2 size={13} /> Xóa
            </Button>
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
        color: '#69736a',
        marginBottom: '0.65rem'
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Clock size={13} color="#69736a" /> {new Date(item.from).toLocaleString('vi-VN')} → {new Date(item.to).toLocaleString('vi-VN')}
        </span>
        <span style={{ fontSize: '0.75rem', color: '#85907d' }}>
          Chốt: {new Date(item.created_at).toLocaleString('vi-VN')}
        </span>
      </div>

      {/* Edit Mode Form */}
      {editing ? (
        <div style={{
          background: '#f8f9f6',
          padding: '0.85rem',
          borderRadius: '10px',
          border: '1px solid #ccd3c7',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
            <div>
              <Label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#596255', display: 'block', marginBottom: '0.2rem' }}>
                Tiền đầu ca
              </Label>
              <CurrencyInput
                value={draft.cash_open}
                onChange={(e) => {
                  const val = e.target.value
                  setDraft((p) => ({ ...p, cash_open: val === '' ? 0 : Number(val) }))
                }}
                placeholder="0"
                style={{ width: '100%', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid #ccd3c7', fontSize: '0.825rem' }}
              />
            </div>
            <div>
              <Label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#596255', display: 'block', marginBottom: '0.2rem' }}>
                Tiền cuối ca
              </Label>
              <CurrencyInput
                value={draft.cash_close}
                onChange={(e) => {
                  const val = e.target.value
                  setDraft((p) => ({ ...p, cash_close: val === '' ? 0 : Number(val) }))
                }}
                placeholder="0"
                style={{ width: '100%', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid #ccd3c7', fontSize: '0.825rem' }}
              />
            </div>
            <div>
              <Label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#596255', display: 'block', marginBottom: '0.2rem' }}>
                Nhân viên
              </Label>
              <Input
                type="text"
                value={draft.staff_name}
                onChange={(e) => setDraft((p) => ({ ...p, staff_name: e.target.value }))}
                style={{ width: '100%', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid #ccd3c7', fontSize: '0.825rem' }}
              />
            </div>
          </div>

          <div>
            <Label style={{ fontSize: '0.75rem', fontWeight: '600', color: '#596255', display: 'block', marginBottom: '0.2rem' }}>
              Ghi chú
            </Label>
            <Input
              type="text"
              value={draft.note}
              onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
              style={{ width: '100%', padding: '0.4rem 0.55rem', borderRadius: '6px', border: '1px solid #ccd3c7', fontSize: '0.825rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
            <Button
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
                background: "var(--primary)",
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              <Save size={13} /> {saving ? 'Lưu...' : 'Lưu'}
            </Button>

            <Button data-intent="danger"
              type="button"
              onClick={() => setEditing(false)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                border: '1px solid #ccd3c7',
                background: '#ffffff',
                color: '#596255',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              <X size={13} /> Hủy
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <dl className="operation-facts"><div><dt>Tiền đầu ca</dt><dd>{fmtMoney(item.cash_open)}</dd></div><div><dt>Tiền kiểm đếm cuối ca</dt><dd>{fmtMoney(item.cash_close)}</dd></div><div><dt>Thực thu tiền mặt</dt><dd>{fmtMoney(item.cash_revenue)}</dd></div><div><dt>Doanh thu hệ thống</dt><dd>{fmtMoney(item.total_revenue)}</dd></div><div><dt>Chênh lệch</dt><dd><StatusBadge tone={diff === 0 ? 'success' : 'warning'}>{diff >= 0 ? '+' : ''}{fmtMoney(diff)}</StatusBadge></dd></div></dl>

          {/* Notes */}
          {item.note && (
            <div style={{
              fontSize: '0.775rem',
              color: '#596255',
              background: '#f8f9f6',
              padding: '0.4rem 0.6rem',
              borderRadius: '6px',
              marginBottom: '0.4rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <FileText size={13} color="#69736a" style={{ flexShrink: 0 }} />
              <span>Ghi chú: {item.note}</span>
            </div>
          )}

          {item.approval_note && (
            <div style={{
              fontSize: '0.775rem',
              color: '#30382e',
              background: 'var(--primary-light)',
              padding: '0.4rem 0.6rem',
              borderRadius: '6px',
              marginBottom: '0.4rem',
              border: '1px solid #bfdbfe',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}>
              <ShieldCheck size={13} color="var(--primary)" style={{ flexShrink: 0 }} />
              <span>Manager: {item.approval_note}</span>
            </div>
          )}

          {/* Manager Approval Actions Box */}
          {canApprove && (
            <div style={{
              marginTop: '0.65rem',
              padding: '0.75rem',
              background: '#f8f9f6',
              borderRadius: '10px',
              border: '1px dashed #ccd3c7',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <Textarea
                rows={1}
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Ghi chú xét duyệt ca..."
                style={{
                  width: '100%',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '6px',
                  border: '1px solid #ccd3c7',
                  fontSize: '0.8rem',
                  resize: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                <Button data-intent="success"
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
                    background: "var(--primary)",
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  <CheckCircle2 size={14} /> Duyệt ca
                </Button>

                <Button data-intent="danger"
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
                </Button>
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
  const [selectedRecordId, setSelectedRecordId] = useState(null)
  const selectedRecord = shiftHistory.find(item => item.ma_ca === selectedRecordId)

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

  return <div className={`manager-shifts ${isApprovalMode ? 'approval-layout' : 'closing-layout'}`}>
    {!isApprovalMode && <section className="operation-surface shift-close-form">
      <h2>Kiểm đếm và bàn giao</h2><p className="operation-note">Nhập tiền thực tế tại quầy để đối chiếu với số liệu hệ thống.</p>
      <div className="operation-form-fields">
        <Label htmlFor="shift-date">Ngày chốt ca<Input id="shift-date" type="date" value={shiftDate} onChange={e => setShiftDate(e.target.value)} /></Label>
        <Label htmlFor="cash-open">Tiền đầu ca (VNĐ)<CurrencyInput id="cash-open" value={shiftInput.cashOpen} onChange={e => setShiftInput(p => ({ ...p, cashOpen: e.target.value === '' ? 0 : Number(e.target.value) }))} /></Label>
        <Label htmlFor="cash-close">Tiền kiểm đếm cuối ca (VNĐ)<CurrencyInput id="cash-close" value={shiftInput.cashClose} onChange={e => setShiftInput(p => ({ ...p, cashClose: e.target.value === '' ? 0 : Number(e.target.value) }))} /></Label>
        <Label htmlFor="shift-note">Ghi chú bàn giao<Textarea id="shift-note" rows={3} value={shiftInput.note} onChange={e => setShiftInput(p => ({ ...p, note: e.target.value }))} placeholder="Chênh lệch, sự cố hoặc lưu ý cho ca sau…" /></Label>
      </div>
      <dl className="operation-facts shift-reconciliation"><div><dt>Doanh thu hệ thống</dt><dd>{fmtMoney(preview?.system?.total_revenue ?? 0)}</dd></div><div><dt>Thực thu tiền mặt</dt><dd>{fmtMoney(preview?.system?.cash_revenue ?? 0)}</dd></div><div><dt>Tiền cuối ca dự kiến</dt><dd>{fmtMoney(expectedClose)}</dd></div><div><dt>Chênh lệch kiểm đếm</dt><dd><StatusBadge tone={diff === 0 ? 'success' : 'warning'}>{diff >= 0 ? '+' : ''}{fmtMoney(diff)}</StatusBadge></dd></div></dl>
      <Button variant="ghost" onClick={() => setShowDetails(!showDetails)} aria-expanded={showDetails}>{showDetails ? 'Ẩn đối chiếu chi tiết' : 'Xem đối chiếu chi tiết'}<ChevronDown size={14} /></Button>
      {showDetails && <dl className="operation-facts"><div><dt>Tiền khách đưa</dt><dd>{fmtMoney(preview?.system?.cash_in_gross ?? 0)}</dd></div><div><dt>Tiền trả lại khách</dt><dd>{fmtMoney(preview?.system?.cash_change_out ?? 0)}</dd></div><div><dt>Doanh thu online</dt><dd>{fmtMoney(preview?.system?.online_revenue ?? 0)}</dd></div><div><dt>Doanh thu tại quầy</dt><dd>{fmtMoney(preview?.system?.shop_revenue ?? 0)}</dd></div></dl>}
      {existingShift && <p role="status" className="operation-note">Ngày này đã có biên bản chốt ca. Bạn có thể xem lại trong lịch sử.</p>}
      {shiftStatus.error && <p className="console-error" role="alert">{shiftStatus.error}</p>}{shiftStatus.success && <p role="status">{shiftStatus.success}</p>}
      <div className="operation-footer"><Button className="admin-button-primary" data-intent="success" onClick={chotCaTienMat} disabled={closingShift || shiftStatus.loading || Boolean(existingShift)}><CheckCircle2 size={16} />{closingShift ? 'Đang chốt ca…' : 'Xác nhận chốt ca làm việc'}</Button></div>
    </section>}
    <section className="operation-surface shift-history">
      <div className="operation-section-heading"><h2>{isApprovalMode ? 'Danh sách biên bản chốt ca' : 'Lịch sử bàn giao'}</h2><span>{filteredHistory.length} biên bản</span></div>
      <div className="operation-tabs" aria-label="Khoảng ngày chốt ca">{HISTORY_FILTERS.map(item => <Button variant="ghost" key={item.id} data-selected={historyFilter === item.id} aria-pressed={historyFilter === item.id} onClick={() => onChangeFilter(item.id)}>{item.label}</Button>)}</div>
      {isApprovalMode && <p className="operation-note">Chọn biên bản để xem đối chiếu, nhập ghi chú và duyệt hoặc từ chối.</p>}
      {!pagedHistory.length ? <p className="operation-empty">Chưa có biên bản trong khoảng thời gian này. Chọn “Tất cả” để xem lịch sử.</p> : <div className="operation-table-frame"><Table><thead><tr><th>Ngày / nhân viên</th><th>Tiền cuối ca</th><th>Chênh lệch</th><th>Trạng thái</th><th style={{width:'100px'}}>Biên bản</th></tr></thead><tbody>{pagedHistory.map(item => <tr key={item.ma_ca}><td><strong>{item.staff_name || 'Chưa cập nhật'}</strong><small>{new Date(item.created_at).toLocaleString('vi-VN')}</small></td><td>{fmtMoney(item.cash_close)}</td><td>{fmtMoney(item.difference || 0)}</td><td><StatusBadge status={item.approval_status}>{getApprovalBadgeStyle(item.approval_status).label}</StatusBadge></td><td><Button variant="outline" onClick={() => setSelectedRecordId(item.ma_ca)}>{isApprovalMode ? 'Kiểm tra' : 'Chi tiết'}</Button></td></tr>)}</tbody></Table></div>}
      <nav className="operation-pagination" aria-label="Phân trang biên bản"><span>Trang {safePage} trên {totalPages}</span><div><Button variant="outline" disabled={safePage <= 1} onClick={() => setHistoryPage(p => Math.max(1, p - 1))}><ChevronLeft size={14} /></Button><PageNumbers page={safePage} totalPages={totalPages} onChange={setHistoryPage} /><Button variant="outline" disabled={safePage >= totalPages} onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}><ChevronRight size={14} /></Button></div></nav>
    </section>
    {selectedRecord && <WorkspaceDialog title={`Biên bản chốt ca · ${selectedRecord.staff_name || selectedRecord.ma_ca.slice(0, 8)}`} onClose={() => setSelectedRecordId(null)} busy={approvingShiftId === selectedRecord.ma_ca} className="workspace-dialog--wide"><div data-modal-body="true" className="shift-record-detail"><ShiftHistoryItem key={selectedRecord.ma_ca} item={selectedRecord} canApprove={canApprove} canEdit={canEditHistory} approvingShiftId={approvingShiftId} onDelete={xoaCaLamViec} onSaveEdit={suaCaLamViec} onApprove={pheDuyetCaLamViec} /></div></WorkspaceDialog>}
  </div>

}
