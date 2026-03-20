import { useMemo, useState } from 'react'

const FILTERS = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'UNREPLIED', label: 'Chưa phản hồi' },
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

export function ManagerCustomerCarePanel({ reviewsState, replyingReviewId, onReplyReview }) {
  const [keyword, setKeyword] = useState('')
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [draftReplies, setDraftReplies] = useState({})
  const [page, setPage] = useState(1)

  const resolveImage = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/images/')) return raw
    return `/images/products/${raw.split('/').pop()}`
  }

  const filteredItems = useMemo(() => {
    const key = normalizeText(keyword)
    const rows = (reviewsState.items || []).filter((item) => {
      if (activeFilter === 'UNREPLIED' && String(item.phan_hoi_quan_ly || '').trim()) return false
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
          <table className="ops-table">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>Khách hàng</th>
                <th>Đánh giá</th>
                <th>Bình luận</th>
                <th>Phản hồi manager</th>
                <th>Cập nhật</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((review) => {
                const draft = draftReplies[review.id] ?? review.phan_hoi_quan_ly ?? ''
                const productImage = resolveImage(review.hinh_anh_san_pham)
                const productName = review.ten_san_pham || `Sản phẩm #${review.ma_san_pham}`
                return (
                  <tr key={review.id}>
                    <td>
                      <div className="manager-care-product-head">
                        <div className="manager-care-thumb-wrap">
                          {productImage ? <img src={productImage} alt={productName} className="manager-care-thumb" /> : <div className="manager-care-thumb-placeholder">No image</div>}
                        </div>
                        <div>
                          <strong>{productName}</strong>
                          <p>Mã SP: {review.ma_san_pham}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong>{review.ten_nguoi_dung || `Khách ${String(review.ma_nguoi_dung || '').slice(0, 8)}`}</strong>
                    </td>
                    <td>{Number(review.so_sao || 0)} sao</td>
                    <td>{review.binh_luan || 'Khách hàng chưa để lại bình luận chữ.'}</td>
                    <td>
                      <textarea
                        className="ops-inline-input"
                        rows={3}
                        value={draft}
                        onChange={(e) => setDraftReplies((prev) => ({ ...prev, [review.id]: e.target.value }))}
                        placeholder="Nhập phản hồi chăm sóc khách hàng..."
                      />
                    </td>
                    <td>{review.ngay_cap_nhat ? new Date(review.ngay_cap_nhat).toLocaleString('vi-VN') : '---'}</td>
                    <td>
                      <div className="ops-table-actions">
                        <button
                          type="button"
                          onClick={() => onReplyReview(review.id, draft)}
                          disabled={replyingReviewId === String(review.id) || !draft.trim()}
                        >
                          {replyingReviewId === String(review.id) ? 'Đang gửi...' : 'Gửi phản hồi'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
