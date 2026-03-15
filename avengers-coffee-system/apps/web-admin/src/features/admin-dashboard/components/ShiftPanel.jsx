import { useMemo, useState } from 'react'
import { fmtMoney } from '../utils'

const SHIFT_PAGE_SIZE = 8

const HISTORY_FILTERS = [
  { id: 'today', label: 'Hôm nay' },
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: 'all', label: 'Tất cả' },
]

const APPROVAL_LABEL = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Từ chối',
}

function diffColor(diff) {
  if (diff === null || diff === undefined) return ''
  if (diff > 0) return 'shift-diff--surplus'
  if (diff < 0) return 'shift-diff--deficit'
  return 'shift-diff--balanced'
}

function approvalTone(status) {
  if (status === 'APPROVED') return 'approval-pill approval-pill--approved'
  if (status === 'REJECTED') return 'approval-pill approval-pill--rejected'
  return 'approval-pill approval-pill--pending'
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

  const lockedForStaff = item.approval_status === 'APPROVED'

  return (
    <article className="shift-history-card">
      <div className="shc-header">
        <div className="shc-header-left">
          <span className="shc-id">#{item.ma_ca.slice(0, 8).toUpperCase()}</span>
          <span className="shc-staff">{item.staff_name || 'N/A'}</span>
          <span className={approvalTone(item.approval_status)}>{APPROVAL_LABEL[item.approval_status] || item.approval_status}</span>
        </div>
        <div className="shc-actions">
          {!editing && canEdit && (
            <button type="button" className="shc-btn shc-btn--edit" onClick={() => setEditing(true)} disabled={lockedForStaff}>
              ✏️ Sửa
            </button>
          )}
          {canEdit ? (
            <button type="button" className="shc-btn shc-btn--del" onClick={() => onDelete(item.ma_ca)} disabled={lockedForStaff}>
              🗑 Xóa
            </button>
          ) : null}
        </div>
      </div>

      <div className="shc-time-row">
        <span>🕐 {new Date(item.from).toLocaleString('vi-VN')} → {new Date(item.to).toLocaleString('vi-VN')}</span>
        <span className="shc-chot">{new Date(item.created_at).toLocaleString('vi-VN')}</span>
      </div>

      {editing ? (
        <div className="shc-edit-form">
          <div className="shc-edit-row">
            <div>
              <label>Tiền đầu ca</label>
              <input type="number" value={draft.cash_open} onChange={(e) => setDraft((p) => ({ ...p, cash_open: e.target.value }))} />
            </div>
            <div>
              <label>Tiền cuối ca</label>
              <input type="number" value={draft.cash_close} onChange={(e) => setDraft((p) => ({ ...p, cash_close: e.target.value }))} />
            </div>
            <div>
              <label>Nhân viên</label>
              <input type="text" value={draft.staff_name} onChange={(e) => setDraft((p) => ({ ...p, staff_name: e.target.value }))} />
            </div>
          </div>
          <div>
            <label>Ghi chú</label>
            <textarea rows={2} value={draft.note} onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))} />
          </div>
          <div className="shc-edit-btns">
            <button type="button" className="shc-btn shc-btn--save" onClick={handleSave} disabled={saving}>
              {saving ? 'Đang lưu...' : '💾 Lưu thay đổi'}
            </button>
            <button type="button" className="shc-btn shc-btn--cancel" onClick={() => setEditing(false)}>Hủy</button>
          </div>
        </div>
      ) : (
        <>
          <div className="shc-stats">
            <div className="shc-stat">
              <span>Tiền đầu ca</span>
              <strong>{fmtMoney(item.cash_open)}</strong>
            </div>
            <div className="shc-stat">
              <span>Tiền cuối ca</span>
              <strong>{fmtMoney(item.cash_close)}</strong>
            </div>
            <div className="shc-stat">
              <span>Tiền mặt thu vào</span>
              <strong>{fmtMoney(item.cash_in_gross ?? item.cash_revenue)}</strong>
            </div>
            <div className="shc-stat">
              <span>Tiền thối</span>
              <strong>{fmtMoney(item.cash_change_out ?? 0)}</strong>
            </div>
            <div className="shc-stat">
              <span>Thu tiền mặt thực</span>
              <strong>{fmtMoney(item.cash_revenue)}</strong>
            </div>
            <div className="shc-stat">
              <span>Tổng đơn</span>
              <strong>{item.total_orders ?? 0}</strong>
            </div>
            <div className="shc-stat">
              <span>Doanh thu</span>
              <strong>{fmtMoney(item.total_revenue)}</strong>
            </div>
            <div className={`shc-stat shc-stat--diff ${diffColor(diff)}`}>
              <span>Chênh lệch</span>
              <strong>{diff >= 0 ? '+' : ''}{fmtMoney(diff)}</strong>
            </div>
          </div>
          {item.note ? <p className="shc-note">📝 {item.note}</p> : null}
          {item.approval_note ? <p className="shc-note shc-note--approval">🛡 {item.approval_note}</p> : null}
          {item.approved_by || item.approved_at ? (
            <p className="shc-note shc-note--approval-meta">
              {item.approved_by ? `Manager: ${item.approved_by}` : 'Manager chưa cập nhật'}
              {item.approved_at ? ` • ${new Date(item.approved_at).toLocaleString('vi-VN')}` : ''}
            </p>
          ) : null}
          {canApprove ? (
            <div className="shift-approval-box">
              <label htmlFor={`approval-${item.ma_ca}`}>Ghi chú phê duyệt</label>
              <textarea
                id={`approval-${item.ma_ca}`}
                rows={2}
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Ghi rõ lý do nếu cần chỉnh lại biên bản"
              />
              <div className="shift-approval-actions">
                <button
                  type="button"
                  className="shc-btn shc-btn--approve"
                  onClick={() => handleApprove('APPROVED')}
                  disabled={approvingShiftId === item.ma_ca}
                >
                  {approvingShiftId === item.ma_ca ? 'Đang xử lý...' : 'Phê duyệt'}
                </button>
                <button
                  type="button"
                  className="shc-btn shc-btn--reject"
                  onClick={() => handleApprove('REJECTED')}
                  disabled={approvingShiftId === item.ma_ca}
                >
                  Từ chối
                </button>
              </div>
            </div>
          ) : null}
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
  shiftPreview, shiftHistory,
  shiftStatus, closingShift,
  approvingShiftId,
  chotCaTienMat, suaCaLamViec, xoaCaLamViec, pheDuyetCaLamViec,
}) {
  const isApprovalMode = mode === 'approval'
  const canApprove = isManager && isApprovalMode
  const canEditHistory = !isApprovalMode

  const [historyFilter, setHistoryFilter] = useState('today')
  const [historyPage, setHistoryPage] = useState(1)

  const preview = shiftPreview
  const existingShift = preview?.existing_shift || null
  const diff = preview?.reconciliation?.difference ?? (shiftInput.cashClose - shiftInput.cashOpen)
  const expectedClose = preview?.reconciliation?.expected_cash_close ?? 0

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
    <div className="shift-shell">
      <section className="shift-form-card">
        {isApprovalMode ? (
          <>
            <div className="shift-form-header">
              <h2>🛡 Kiểm tra biên bản chốt ca</h2>
              <p>Manager duyệt hoặc từ chối biên bản staff đã nộp.</p>
            </div>
            <div className="shift-form-body shift-approval-summary">
              <div className="shift-manager-badge">Manager: {currentUserName}</div>
              <div className="shift-preview-grid shift-preview-grid--manager">
                <div className="spg-card">
                  <span>Tổng biên bản</span>
                  <strong>{approvalSummary.total}</strong>
                </div>
                <div className="spg-card">
                  <span>Chờ duyệt</span>
                  <strong>{approvalSummary.pending}</strong>
                </div>
                <div className="spg-card">
                  <span>Đã duyệt</span>
                  <strong>{approvalSummary.approved}</strong>
                </div>
                <div className="spg-card">
                  <span>Từ chối</span>
                  <strong>{approvalSummary.rejected}</strong>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="shift-form-header">
              <h2>🕐 Chốt ca làm việc</h2>
              <p>{isManager ? 'Manager có thể chốt ca như staff để ghi nhận ca trực của mình.' : 'Nhập thông tin ca và xác nhận để lưu biên bản đối soát.'}</p>
            </div>

            <div className="shift-form-body">
              <div className="sff-row">
                <div className="sff-field">
                  <label htmlFor="shift-date">Ngày chốt ca</label>
                  <input
                    id="shift-date"
                    type="date"
                    value={shiftDate}
                    onChange={(e) => setShiftDate(e.target.value)}
                  />
                </div>
                <div className="sff-field">
                  <label htmlFor="shift-from">Bắt đầu ca (cố định)</label>
                  <input
                    id="shift-from"
                    type="text"
                    value="07:00"
                    readOnly
                  />
                </div>
                <div className="sff-field">
                  <label htmlFor="shift-to">Kết thúc ca (cố định)</label>
                  <input
                    id="shift-to"
                    type="text"
                    value="22:00"
                    readOnly
                  />
                </div>
              </div>

              <div className="sff-row">
                <div className="sff-field">
                  <label htmlFor="cash-open">Tiền đầu ca</label>
                  <input
                    id="cash-open"
                    type="number"
                    min="0"
                    value={shiftInput.cashOpen}
                    onChange={(e) => setShiftInput((p) => ({ ...p, cashOpen: Number(e.target.value) || 0 }))}
                  />
                </div>
                <div className="sff-field">
                  <label htmlFor="cash-close">Tiền cuối ca (thực tế)</label>
                  <input
                    id="cash-close"
                    type="number"
                    min="0"
                    value={shiftInput.cashClose}
                    onChange={(e) => setShiftInput((p) => ({ ...p, cashClose: Number(e.target.value) || 0 }))}
                  />
                </div>
              </div>

              <div className="sff-field">
                <label htmlFor="shift-note">Ghi chú bàn giao</label>
                <textarea
                  id="shift-note"
                  rows={3}
                  value={shiftInput.note}
                  onChange={(e) => setShiftInput((p) => ({ ...p, note: e.target.value }))}
                  placeholder="Sự cố, ghi chú cho ca sau..."
                />
              </div>
            </div>

            <div className="shift-preview-grid">
              <div className="spg-card">
                <span>Tổng đơn</span>
                <strong>{preview?.system?.total_orders ?? 0}</strong>
              </div>
              <div className="spg-card">
                <span>Doanh thu hoàn thành</span>
                <strong>{fmtMoney(preview?.system?.total_revenue ?? 0)}</strong>
              </div>
              <div className="spg-card">
                <span>Tiền mặt thu vào</span>
                <strong>{fmtMoney(preview?.system?.cash_in_gross ?? 0)}</strong>
              </div>
              <div className="spg-card">
                <span>Tiền thối khách</span>
                <strong>{fmtMoney(preview?.system?.cash_change_out ?? 0)}</strong>
              </div>
              <div className="spg-card">
                <span>Tiền mặt thực thu</span>
                <strong>{fmtMoney(preview?.system?.cash_revenue ?? 0)}</strong>
              </div>
              <div className="spg-card">
                <span>Doanh thu online</span>
                <strong>{fmtMoney(preview?.system?.online_revenue ?? 0)}</strong>
              </div>
              <div className="spg-card">
                <span>Doanh thu tại shop</span>
                <strong>{fmtMoney(preview?.system?.in_store_revenue ?? 0)}</strong>
              </div>
              <div className="spg-card">
                <span>Doanh thu không tiền mặt</span>
                <strong>{fmtMoney(preview?.system?.non_cash_revenue ?? 0)}</strong>
              </div>
              <div className="spg-card">
                <span>Kỳ vọng cuối ca</span>
                <strong>{fmtMoney(expectedClose)}</strong>
              </div>
              <div className={`spg-card spg-card--diff ${diffColor(diff)}`} style={{ gridColumn: 'span 2' }}>
                <span>Chênh lệch</span>
                <strong className="spg-diff-val">
                  {diff >= 0 ? '+' : ''}{fmtMoney(diff)}
                </strong>
              </div>
            </div>

            {existingShift ? (
              <p className="shift-error" style={{ marginTop: '0.6rem' }}>
                Ngày này đã có biên bản chốt ca #{existingShift.ma_ca.slice(0, 8).toUpperCase()}. Mỗi ngày chỉ chốt 1 lần, bạn hãy sửa hoặc xóa biên bản cũ nếu cần.
              </p>
            ) : null}

            {shiftStatus.error && <p className="shift-error">{shiftStatus.error}</p>}
            {shiftStatus.success && <p className="shift-success">{shiftStatus.success}</p>}

            <button
              type="button"
              className="shift-submit-btn"
              onClick={chotCaTienMat}
              disabled={closingShift || shiftStatus.loading || Boolean(existingShift)}
            >
              {closingShift ? (
                <><span className="ofb-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Đang chốt ca...</>
              ) : (
                '✅ Xác nhận chốt ca'
              )}
            </button>
          </>
        )}
      </section>

      <section className="shift-history-panel">
        <div className="shift-history-header">
          <h2>{isApprovalMode ? '📋 Biên bản chờ manager kiểm tra' : '📋 Lịch sử ca đã chốt'}</h2>
          <span>{filteredHistory.length} ca</span>
        </div>

        <div className="shift-history-filters">
          {HISTORY_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`shift-filter-chip ${historyFilter === item.id ? 'shift-filter-chip--active' : ''}`}
              onClick={() => onChangeFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {shiftStatus.error && isApprovalMode ? <p className="shift-error shift-error--inline">{shiftStatus.error}</p> : null}
        {shiftStatus.success && isApprovalMode ? <p className="shift-success shift-success--inline">{shiftStatus.success}</p> : null}

        {!pagedHistory.length ? (
          <div className="shift-history-empty">
            <span>📭</span>
            <p>{shiftHistory.length ? 'Không có ca phù hợp bộ lọc.' : 'Chưa có ca nào được chốt.'}</p>
          </div>
        ) : (
          <div className="shift-history-list">
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

        {totalPages > 1 && (
          <div className="pagination-bar shift-pagination">
            <button
              className="pg-btn"
              type="button"
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
            >‹ Trước</button>
            <div className="pg-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`pg-num ${safePage === p ? 'pg-num--active' : ''}`}
                  onClick={() => setHistoryPage(p)}
                >{p}</button>
              ))}
            </div>
            <button
              className="pg-btn"
              type="button"
              onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
            >Tiếp ›</button>
          </div>
        )}
      </section>
    </div>
  )
}
