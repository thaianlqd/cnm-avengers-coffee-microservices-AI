import { useMemo, useState } from 'react'
import { fmtMoney } from '../utils'

const SHIFT_PAGE_SIZE = 8

const HISTORY_FILTERS = [
  { id: 'today', label: 'Hôm nay' },
  { id: '7d', label: '7 ngày' },
  { id: '30d', label: '30 ngày' },
  { id: 'all', label: 'Tất cả' },
]

function diffColor(diff) {
  if (diff === null || diff === undefined) return ''
  if (diff > 0) return 'shift-diff--surplus'
  if (diff < 0) return 'shift-diff--deficit'
  return 'shift-diff--balanced'
}

function ShiftHistoryItem({ item, onDelete, onSaveEdit }) {
  const [editing, setEditing] = useState(false)
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

  const diff = editing
    ? Number(draft.cash_close) - (Number(draft.cash_open) + item.cash_revenue)
    : item.difference

  return (
    <article className="shift-history-card">
      <div className="shc-header">
        <div className="shc-header-left">
          <span className="shc-id">#{item.ma_ca.slice(0, 8).toUpperCase()}</span>
          <span className="shc-staff">{item.staff_name || 'N/A'}</span>
        </div>
        <div className="shc-actions">
          {!editing && (
            <button type="button" className="shc-btn shc-btn--edit" onClick={() => setEditing(true)}>
              ✏️ Sửa
            </button>
          )}
          <button type="button" className="shc-btn shc-btn--del" onClick={() => onDelete(item.ma_ca)}>
            🗑 Xóa
          </button>
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
            <span>Thu tiền mặt</span>
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
      )}
      {!editing && item.note && (
        <p className="shc-note">📝 {item.note}</p>
      )}
    </article>
  )
}

export function ShiftPanel({
  shiftRange, setShiftRange,
  shiftInput, setShiftInput,
  shiftPreview, shiftHistory,
  shiftStatus, closingShift,
  chotCaTienMat, suaCaLamViec, xoaCaLamViec,
}) {
  const [historyFilter, setHistoryFilter] = useState('today')
  const [historyPage, setHistoryPage] = useState(1)

  const preview = shiftPreview
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

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / SHIFT_PAGE_SIZE))
  const safePage = Math.min(historyPage, totalPages)
  const pagedHistory = filteredHistory.slice((safePage - 1) * SHIFT_PAGE_SIZE, safePage * SHIFT_PAGE_SIZE)

  const onChangeFilter = (nextFilter) => {
    setHistoryFilter(nextFilter)
    setHistoryPage(1)
  }

  return (
    <div className="shift-shell">
      {/* ─── Left: form chốt ca mới ─── */}
      <section className="shift-form-card">
        <div className="shift-form-header">
          <h2>🕐 Chốt ca làm việc</h2>
          <p>Nhập thông tin ca và xác nhận để lưu biên bản đối soát.</p>
        </div>

        <div className="shift-form-body">
          <div className="sff-row">
            <div className="sff-field">
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
            </div>
            <div className="sff-field">
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

        {/* Preview stats */}
        <div className="shift-preview-grid">
          <div className="spg-card">
            <span>Tổng đơn</span>
            <strong>{preview?.system?.total_orders ?? 0}</strong>
          </div>
          <div className="spg-card">
            <span>Doanh thu</span>
            <strong>{fmtMoney(preview?.system?.total_revenue ?? 0)}</strong>
          </div>
          <div className="spg-card">
            <span>Thu tiền mặt</span>
            <strong>{fmtMoney(preview?.system?.cash_revenue ?? 0)}</strong>
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

        {shiftStatus.error && <p className="shift-error">{shiftStatus.error}</p>}
        {shiftStatus.success && <p className="shift-success">{shiftStatus.success}</p>}

        <button
          type="button"
          className="shift-submit-btn"
          onClick={chotCaTienMat}
          disabled={closingShift || shiftStatus.loading}
        >
          {closingShift ? (
            <><span className="ofb-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Đang chốt ca...</>
          ) : (
            '✅ Xác nhận chốt ca'
          )}
        </button>
      </section>

      {/* ─── Right: history ─── */}
      <section className="shift-history-panel">
        <div className="shift-history-header">
          <h2>📋 Lịch sử ca đã chốt</h2>
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
                onDelete={xoaCaLamViec}
                onSaveEdit={suaCaLamViec}
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
