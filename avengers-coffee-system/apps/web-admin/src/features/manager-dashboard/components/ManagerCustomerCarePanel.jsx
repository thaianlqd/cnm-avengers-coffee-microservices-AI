import { useMemo, useState } from 'react'

const FILTERS = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'UNREPLIED', label: 'Chưa phản hồi' },
  { id: 'REPLIED', label: 'Đã phản hồi' },
  { id: 'LOW_RATING', label: '1-3 sao' },
]

const PAGE_SIZE = 8

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function starLabel(rating) {
  const value = Math.min(5, Math.max(1, Number(rating || 0)))
  return `${'★'.repeat(value)}${'☆'.repeat(5 - value)} (${value}/5)`
}

export function ManagerCustomerCarePanel({
  reviewsState,
  replyingReviewId,
  onReplyReview,
  onUpdateReply,
  onDeleteReply,
}) {
  const [keyword, setKeyword] = useState('')
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [draftReplies, setDraftReplies] = useState({})
  const [page, setPage] = useState(1)
  const [expandedReplyId, setExpandedReplyId] = useState(null)

  const resolveImage = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/images/')) return raw
    return `/images/products/${raw.split('/').pop()}`
  }

  const hasReply = (review) => !!String(review.phan_hoi_quan_ly || '').trim()

  const filteredItems = useMemo(() => {
    const key = normalizeText(keyword)
    const rows = (reviewsState.items || []).filter((item) => {
      if (activeFilter === 'UNREPLIED' && hasReply(item)) return false
      if (activeFilter === 'REPLIED' && !hasReply(item)) return false
      if (activeFilter === 'LOW_RATING' && Number(item.so_sao || 0) > 3) return false
      return true
    })

    if (!key) return rows

    return rows.filter((item) => {
      const haystack = normalizeText(
        [
          item.ma_san_pham,
          item.ten_san_pham,
          item.ten_nguoi_dung,
          item.ma_nguoi_dung,
          item.binh_luan,
          item.phan_hoi_quan_ly,
        ].join(' '),
      )
      return haystack.includes(key)
    })
  }, [keyword, activeFilter, reviewsState.items])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const pageRows = filteredItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const handleSaveReplyEdit = async (review) => {
    if (typeof onUpdateReply !== 'function') return
    const draft = String(draftReplies[review.id] ?? review.phan_hoi_quan_ly ?? '').trim()
    if (!draft) return
    const result = await onUpdateReply(review.id, draft)
    if (result?.ok) {
      setExpandedReplyId(null)
    }
  }

  const handleDeleteReply = async (reviewId) => {
    if (typeof onDeleteReply !== 'function') return
    if (!window.confirm('Xác nhận xóa phản hồi của manager?')) return
    await onDeleteReply(reviewId)
  }

  return (
    <section className="panel customer-care-panel">
      <div className="panel-head">
        <h2>Chăm sóc khách hàng</h2>
        <span>Manager phản hồi đánh giá để giữ trải nghiệm khách hàng nhất quán</span>
      </div>

      <div className="employee-filter-row">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Tìm theo sản phẩm, tên khách, bình luận"
        />
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
          {FILTERS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </div>

      <div className="manager-care-filter-chips">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeFilter === item.id ? 'manager-care-chip manager-care-chip--active' : 'manager-care-chip'}
            onClick={() => setActiveFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {reviewsState.loading ? <p>Đang tải danh sách đánh giá...</p> : null}
      {reviewsState.error ? <p className="error-text">{reviewsState.error}</p> : null}

      <div className="ops-table-wrap">
        {!reviewsState.loading && !filteredItems.length ? (
          <p className="employee-empty">Chưa có đánh giá nào cần xử lý.</p>
        ) : null}

        {!reviewsState.loading && filteredItems.length ? (
          <div className="employee-list">
            {pageRows.map((review) => {
              const draft = draftReplies[review.id] ?? review.phan_hoi_quan_ly ?? ''
              const productImage = resolveImage(review.hinh_anh_san_pham)
              const productName = review.ten_san_pham || `Sản phẩm #${review.ma_san_pham}`
              const isExpanded = expandedReplyId === review.id
              const hasManagerReply = hasReply(review)

              return (
                <article key={review.id} className="employee-card">
                  <div className="employee-card-head">
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e6d4c7', flexShrink: 0 }}>
                        {productImage ? <img src={productImage} alt={productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ width: '100%', height: '100%', background: '#f9f0e8' }} />}
                      </div>
                      <div>
                        <h3>{productName}</h3>
                        <p>Mã SP: {review.ma_san_pham} • Khách: {review.ten_nguoi_dung || String(review.ma_nguoi_dung || '').slice(0, 8)}</p>
                      </div>
                    </div>
                    <span className={hasManagerReply ? 'employee-status-pill employee-status-pill--approved' : 'employee-status-pill employee-status-pill--pending'}>
                      {hasManagerReply ? 'ĐÃ PHẢN HỒI' : 'CHỜ PHẢN HỒI'}
                    </span>
                  </div>

                  <div className="workforce-detail-meta">
                    <span>Đánh giá: {starLabel(review.so_sao)}</span>
                    <span>Cập nhật: {review.ngay_cap_nhat ? new Date(review.ngay_cap_nhat).toLocaleString('vi-VN') : '---'}</span>
                  </div>

                  {review.binh_luan ? <p className="workforce-detail-note">Bình luận: {review.binh_luan}</p> : <p className="workforce-detail-note">Khách chưa để lại bình luận.</p>}
                  {hasManagerReply ? <p className="workforce-detail-note">Phản hồi hiện tại: {review.phan_hoi_quan_ly}</p> : null}

                  <div className="workforce-detail-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedReplyId(isExpanded ? null : review.id)
                        if (!isExpanded && draftReplies[review.id] === undefined) {
                          setDraftReplies((prev) => ({ ...prev, [review.id]: review.phan_hoi_quan_ly || '' }))
                        }
                      }}
                    >
                      {isExpanded ? 'Ẩn phản hồi' : (hasManagerReply ? 'Sửa phản hồi' : 'Phản hồi')}
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleDeleteReply(review.id)}
                      disabled={!hasManagerReply || replyingReviewId === String(review.id)}
                    >
                      Xóa phản hồi
                    </button>
                  </div>

                  {isExpanded ? (
                    <div>
                      <label className="workforce-note-field">
                        Nội dung phản hồi manager
                        <textarea
                          rows={3}
                          value={draft}
                          onChange={(e) => setDraftReplies((prev) => ({ ...prev, [review.id]: e.target.value }))}
                          placeholder="Nhập phản hồi cho khách hàng"
                        />
                      </label>
                      <div className="workforce-detail-actions">
                        <button
                          type="button"
                          onClick={() => (hasManagerReply ? handleSaveReplyEdit(review) : onReplyReview(review.id, draft))}
                          disabled={replyingReviewId === String(review.id) || !draft.trim()}
                        >
                          {replyingReviewId === String(review.id) ? 'Đang gửi...' : (hasManagerReply ? 'Lưu phản hồi' : 'Gửi phản hồi')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : null}

        {filteredItems.length > PAGE_SIZE ? (
          <div className="ops-pagination">
            <span>{(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filteredItems.length)} / {filteredItems.length}</span>
            <div>
              <button type="button" className="secondary" onClick={() => setPage(1)} disabled={safePage <= 1}>Đầu</button>
              <button type="button" className="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}>Trước</button>
              <strong>Trang {safePage}/{totalPages}</strong>
              <button type="button" className="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}>Sau</button>
              <button type="button" className="secondary" onClick={() => setPage(totalPages)} disabled={safePage >= totalPages}>Cuối</button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
