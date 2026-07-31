import React, { useMemo, useState } from 'react'
import {
  MessageSquare,
  Star,
  Search,
  X,
  Send,
  Edit3,
  Trash2,
  User,
  Clock,
  Coffee,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  ThumbsUp,
  MessageCircle,
  AlertTriangle
} from 'lucide-react'

const FILTERS = [
  { id: 'ALL', label: 'Tất cả đánh giá' },
  { id: 'UNREPLIED', label: 'Chưa phản hồi' },
  { id: 'REPLIED', label: 'Đã phản hồi' },
  { id: 'LOW_RATING', label: '1-3 sao (Cần chú ý)' },
]

const PAGE_SIZE = 6

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function StarRating({ rating }) {
  const value = Math.min(5, Math.max(1, Number(rating || 0)))
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.15rem' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={16}
          color={i < value ? '#f59e0b' : '#cbd5e1'}
          fill={i < value ? '#f59e0b' : 'none'}
        />
      ))}
      <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#b45309', marginLeft: '0.35rem' }}>
        ({value}/5)
      </span>
    </div>
  )
}

export function ManagerCustomerCarePanel({
  reviewsState = { items: [], loading: false, error: null },
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

  const reviewsList = reviewsState.items || []

  // Metrics Summary
  const stats = useMemo(() => {
    let replied = 0
    let unreplied = 0
    let lowRating = 0

    reviewsList.forEach((r) => {
      if (hasReply(r)) replied++
      else unreplied++

      if (Number(r.so_sao || 0) <= 3) lowRating++
    })

    return {
      total: reviewsList.length,
      replied,
      unreplied,
      lowRating
    }
  }, [reviewsList])

  const filteredItems = useMemo(() => {
    const key = normalizeText(keyword)
    const rows = reviewsList.filter((item) => {
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
  }, [keyword, activeFilter, reviewsList])

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
    if (!window.confirm('Bạn có chắc chắn muốn xóa phản hồi này không?')) return
    await onDeleteReply(reviewId)
  }

  return (
    <div className="panel-container" style={{
      padding: '1.75rem',
      background: '#f8fafc',
      borderRadius: '20px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)'
    }}>
      {/* Top Header */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)'
          }}>
            <MessageSquare size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>
              Phản hồi & Chăm sóc Khách hàng
            </h2>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              Quản lý và phản hồi trực tiếp các đánh giá sản phẩm từ khách hàng để cải thiện chất lượng dịch vụ
            </span>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          background: '#ffffff',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500' }}>Tổng đánh giá</span>
            <strong style={{ fontSize: '1.3rem', fontWeight: '800', color: '#1e293b', display: 'block' }}>{stats.total} lượt</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500' }}>Chờ phản hồi</span>
            <strong style={{ fontSize: '1.3rem', fontWeight: '800', color: '#d97706', display: 'block' }}>{stats.unreplied} đánh giá</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500' }}>Đã phản hồi</span>
            <strong style={{ fontSize: '1.3rem', fontWeight: '800', color: '#059669', display: 'block' }}>{stats.replied} đánh giá</strong>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '12px', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <span style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500' }}>Đánh giá 1-3 sao</span>
            <strong style={{ fontSize: '1.3rem', fontWeight: '800', color: '#ef4444', display: 'block' }}>{stats.lowRating} đánh giá</strong>
          </div>
        </div>
      </div>

      {/* Toolbar Search & Filter Chips */}
      <div style={{
        background: '#ffffff',
        padding: '1rem 1.25rem',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '240px', maxWidth: '420px' }}>
            <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
              placeholder="Tìm theo sản phẩm, tên khách hàng, nội dung..."
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem 0.55rem 2.4rem',
                borderRadius: '10px',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword('')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {FILTERS.map((item) => {
              const isActive = activeFilter === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { setActiveFilter(item.id); setPage(1); }}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: '8px',
                    border: isActive ? '1px solid #10b981' : '1px solid #e2e8f0',
                    background: isActive ? '#10b981' : '#ffffff',
                    color: isActive ? '#ffffff' : '#475569',
                    fontWeight: isActive ? '700' : '500',
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                    boxShadow: isActive ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Loading & Error States */}
      {reviewsState.loading && (
        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', color: '#64748b' }}>
          <RefreshCw size={32} color="#10b981" style={{ animation: 'spin 1s linear infinite', marginBottom: '0.75rem' }} />
          <h4 style={{ margin: 0 }}>Đang tải danh sách đánh giá...</h4>
        </div>
      )}

      {reviewsState.error && (
        <div style={{ padding: '0.85rem', borderRadius: '12px', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          <AlertCircle size={16} style={{ display: 'inline', marginRight: '0.4rem' }} />
          {reviewsState.error}
        </div>
      )}

      {/* Review List */}
      {!reviewsState.loading && pageRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', background: '#ffffff', borderRadius: '16px', border: '1px dashed #cbd5e1' }}>
          <MessageSquare size={40} color="#94a3b8" style={{ marginBottom: '0.75rem' }} />
          <h4 style={{ margin: '0 0 0.5rem 0', color: '#334155' }}>Chưa có đánh giá nào phù hợp</h4>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.875rem' }}>Vui lòng chọn bộ lọc khác hoặc kiểm tra lại từ khóa tìm kiếm.</p>
        </div>
      ) : !reviewsState.loading && pageRows.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {pageRows.map((review) => {
            const draft = draftReplies[review.id] ?? review.phan_hoi_quan_ly ?? ''
            const productImage = resolveImage(review.hinh_anh_san_pham)
            const productName = review.ten_san_pham || `Sản phẩm #${review.ma_san_pham}`
            const isExpanded = expandedReplyId === review.id
            const hasManagerReply = hasReply(review)

            return (
              <div
                key={review.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  padding: '1.25rem',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}
              >
                {/* Product & User Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.85rem' }}>
                  <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'center' }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {productImage ? (
                        <img src={productImage} alt={productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Coffee size={24} color="#94a3b8" />
                      )}
                    </div>

                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0f172a' }}>
                        {productName}
                      </h3>
                      <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                        <User size={13} color="#64748b" /> Khách hàng: <strong>{review.ten_nguoi_dung || String(review.ma_nguoi_dung || '').slice(0, 8)}</strong>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <StarRating rating={review.so_sao} />

                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      padding: '0.25rem 0.65rem',
                      borderRadius: '9999px',
                      background: hasManagerReply ? '#d1fae5' : '#fef3c7',
                      color: hasManagerReply ? '#047857' : '#b45309',
                      border: hasManagerReply ? '1px solid #a7f3d0' : '1px solid #fde68a',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}>
                      {hasManagerReply ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                      {hasManagerReply ? 'Đã phản hồi' : 'Chờ phản hồi'}
                    </span>
                  </div>
                </div>

                {/* Customer Comment Card */}
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #f1f5f9',
                  borderRadius: '12px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem'
                }}>
                  <span style={{ fontSize: '0.775rem', fontWeight: '700', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <MessageSquare size={13} color="#64748b" /> Nội dung đánh giá từ khách hàng:
                  </span>
                  <p style={{ margin: 0, fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.5, fontWeight: '500' }}>
                    {review.binh_luan ? `"${review.binh_luan}"` : <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Khách hàng chỉ chấm sao, không để lại bình luận chữ.</span>}
                  </p>
                  <span style={{ fontSize: '0.725rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                    Thời gian: {review.ngay_cap_nhat ? new Date(review.ngay_cap_nhat).toLocaleString('vi-VN') : '---'}
                  </span>
                </div>

                {/* Current Manager Reply (If exists) */}
                {hasManagerReply && !isExpanded && (
                  <div style={{
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '12px',
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem'
                  }}>
                    <span style={{ fontSize: '0.775rem', fontWeight: '700', color: '#047857', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <CheckCircle2 size={14} color="#059669" /> Phản hồi từ Quản lý:
                    </span>
                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#064e3b', lineHeight: 1.5, fontWeight: '600' }}>
                      {review.phan_hoi_quan_ly}
                    </p>
                  </div>
                )}

                {/* Actions Row */}
                <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'flex-end', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedReplyId(isExpanded ? null : review.id)
                      if (!isExpanded && draftReplies[review.id] === undefined) {
                        setDraftReplies((prev) => ({ ...prev, [review.id]: review.phan_hoi_quan_ly || '' }))
                      }
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.55rem 1rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#10b981',
                      color: '#ffffff',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {isExpanded ? <X size={14} /> : hasManagerReply ? <Edit3 size={14} /> : <MessageSquare size={14} />}
                    {isExpanded ? 'Đóng ô nhập' : (hasManagerReply ? 'Sửa phản hồi' : 'Viết phản hồi')}
                  </button>

                  {hasManagerReply && (
                    <button
                      type="button"
                      onClick={() => handleDeleteReply(review.id)}
                      disabled={replyingReviewId === String(review.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '0.55rem 1rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#ef4444',
                        color: '#ffffff',
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        cursor: replyingReviewId === String(review.id) ? 'not-allowed' : 'pointer',
                        boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Trash2 size={14} /> Xóa phản hồi
                    </button>
                  )}
                </div>

                {/* Expanded Textarea Form */}
                {isExpanded && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '1rem',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}>
                    <label style={{ fontSize: '0.825rem', fontWeight: '700', color: '#0f172a' }}>
                      Nội dung phản hồi cho khách hàng:
                    </label>
                    <textarea
                      rows={3}
                      value={draft}
                      onChange={(e) => setDraftReplies((prev) => ({ ...prev, [review.id]: e.target.value }))}
                      placeholder="Cảm ơn bạn đã đóng góp ý kiến cho quán. Cửa hàng xin được hỗ trợ..."
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.875rem',
                        resize: 'vertical',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => (hasManagerReply ? handleSaveReplyEdit(review) : onReplyReview(review.id, draft))}
                        disabled={replyingReviewId === String(review.id) || !draft.trim()}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.55rem 1.1rem',
                          borderRadius: '8px',
                          border: 'none',
                          background: '#10b981',
                          color: '#ffffff',
                          fontSize: '0.85rem',
                          fontWeight: '700',
                          cursor: replyingReviewId === String(review.id) || !draft.trim() ? 'not-allowed' : 'pointer',
                          boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)'
                        }}
                      >
                        <Send size={14} />
                        {replyingReviewId === String(review.id) ? 'Đang gửi...' : (hasManagerReply ? 'Lưu cập nhật' : 'Gửi phản hồi ngay')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : null}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          marginTop: '1.5rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid #e2e8f0',
          flexWrap: 'wrap'
        }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
            Hiển thị <strong>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredItems.length)}</strong> trên <strong>{filteredItems.length}</strong> đánh giá
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: safePage === 1 ? '#cbd5e1' : '#334155',
                fontSize: '0.825rem',
                fontWeight: '600',
                cursor: safePage === 1 ? 'not-allowed' : 'pointer'
              }}
            >
              <ChevronLeft size={16} /> Trước
            </button>

            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    border: 'none',
                    background: safePage === p ? '#10b981' : 'transparent',
                    color: safePage === p ? '#ffffff' : '#64748b',
                    fontWeight: safePage === p ? '700' : '500',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: safePage === totalPages ? '#cbd5e1' : '#334155',
                fontSize: '0.825rem',
                fontWeight: '600',
                cursor: safePage === totalPages ? 'not-allowed' : 'pointer'
              }}
            >
              Tiếp <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
