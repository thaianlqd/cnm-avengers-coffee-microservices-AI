import React, { useEffect, useMemo, useState } from 'react'
import {
  Newspaper,
  Plus,
  Search,
  X,
  Edit3,
  Trash2,
  Save,
  Image as ImageIcon,
  FileText,
  Tag,
  User,
  Calendar,
  CheckCircle2,
  Globe,
  FileEdit,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Eye,
  Check,
  FolderKanban
} from 'lucide-react'
import { API_BASE_URL } from '../../admin-dashboard/constants'

function fmtDate(value) {
  if (!value) return '---'
  try {
    return new Date(value).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return String(value)
  }
}

function resolveImageUrl(path) {
  if (!path) return ''
  if (String(path).startsWith('http://') || String(path).startsWith('https://')) {
    return path
  }
  if (String(path).startsWith('/')) return `${API_BASE_URL}${path}`
  return `${API_BASE_URL}/${path}`
}

const CATEGORY_MAP = {
  COFFEEHOLIC: 'Góc Cà Phê (COFFEEHOLIC)',
  TEAHOLIC: 'Góc Trà (TEAHOLIC)',
  BLOG: 'Tin Tức & Khuyến Mãi (BLOG)',
}

const EMPTY_FORM = {
  title: '',
  category: 'BLOG',
  description: '',
  content: '',
  author_name: '',
  is_published: true,
}

const PAGE_SIZE = 6

export function NewsPanel() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [activeArticleId, setActiveArticleId] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [imageFile, setImageFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  const loadArticles = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/news/admin/list?limit=200`)
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.message || 'Không thể tải danh sách bài viết')
      }
      setItems(data?.items || [])
    } catch (err) {
      setError(err?.message || 'Không thể tải danh sách bài viết')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadArticles()
  }, [])

  // Thống kê tổng quan
  const stats = useMemo(() => {
    let published = 0
    let draft = 0
    items.forEach(a => {
      if (a.is_published) published++
      else draft++
    })
    return {
      total: items.length,
      published,
      draft
    }
  }, [items])

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((article) => {
      if (filterCat && article.category !== filterCat) return false
      if (!q) return true
      const bag = [
        article.title,
        article.category,
        article.description,
        article.author_name,
      ]
        .join(' ')
        .toLowerCase()
      return bag.includes(q)
    })
  }, [items, search, filterCat])

  const activeArticle =
    filteredArticles.find((article) => article.id === activeArticleId) ||
    items.find((article) => article.id === activeArticleId) ||
    null

  const totalPages = Math.max(1, Math.ceil(filteredArticles.length / PAGE_SIZE))
  const safePage = Math.min(Math.max(page, 1), totalPages)
  const pageRows = filteredArticles.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => {
    if (!activeArticle) {
      return
    }
    setForm({
      title: activeArticle.title || '',
      category: activeArticle.category || 'BLOG',
      description: activeArticle.description || '',
      content: activeArticle.content || '',
      author_name: activeArticle.author_name || '',
      is_published: Boolean(activeArticle.is_published),
    })
    setImageFile(null)
  }, [activeArticle?.id])

  const resetForCreate = () => {
    setActiveArticleId('')
    setForm(EMPTY_FORM)
    setImageFile(null)
    setError('')
    setMessage('')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (!form.title.trim() || !form.content.trim()) {
      setError('Tiêu đề và nội dung chi tiết là bắt buộc.')
      return
    }

    setSubmitting(true)
    try {
      const payload = new FormData()
      payload.append('title', form.title.trim())
      payload.append('category', form.category || 'BLOG')
      payload.append('description', form.description.trim())
      payload.append('content', form.content.trim())
      payload.append('author_name', form.author_name.trim() || 'Nhân viên')
      payload.append('is_published', String(Boolean(form.is_published)))
      if (imageFile) {
        payload.append('image', imageFile)
      }

      const endpoint = activeArticleId
        ? `${API_BASE_URL}/news/admin/${activeArticleId}`
        : `${API_BASE_URL}/news/admin/create`
      const method = activeArticleId ? 'PUT' : 'POST'

      const response = await fetch(endpoint, {
        method,
        body: payload,
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.message || 'Không thể lưu bài viết')
      }

      setMessage(activeArticleId ? 'Đã cập nhật bài viết thành công!' : 'Đã tạo bài viết mới thành công!')
      await loadArticles()
      if (!activeArticleId && data?.id) {
        setActiveArticleId(data.id)
      }
    } catch (err) {
      setError(err?.message || 'Không thể lưu bài viết')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id) => {
    if (!id) return
    if (!window.confirm('Bạn có chắc chắn muốn xóa bài viết này không? Action này không thể hoàn tác.')) return

    setDeletingId(id)
    setError('')
    setMessage('')

    try {
      const response = await fetch(`${API_BASE_URL}/news/admin/${id}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.message || 'Không thể xóa bài viết')
      }

      setMessage('Đã xóa bài viết thành công!')
      if (activeArticleId === id) {
        resetForCreate()
      }
      await loadArticles()
    } catch (err) {
      setError(err?.message || 'Không thể xóa bài viết')
    } finally {
      setDeletingId('')
    }
  }

  const imagePreview = imageFile
    ? URL.createObjectURL(imageFile)
    : resolveImageUrl(activeArticle?.image_url)

  return (
    <div className="panel-container" style={{
      padding: '1.75rem',
      background: '#f8fafc',
      borderRadius: '20px',
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.02)'
    }}>
      {/* Top Header Bar */}
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
            <Newspaper size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>
              Quản lý Tin Tức & Bài Viết
            </h2>
            <span style={{ fontSize: '0.825rem', color: '#64748b' }}>
              Đăng tin tức, bài viết blog, chương trình khuyến mãi và tải ảnh minh họa bài viết
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={resetForCreate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.6rem 1.2rem',
            borderRadius: '10px',
            border: 'none',
            background: '#10b981',
            color: '#ffffff',
            fontSize: '0.875rem',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(16, 185, 129, 0.25)',
            transition: 'all 0.2s ease'
          }}
        >
          <Plus size={18} /> Soạn bài viết mới
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#eff6ff',
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FileText size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500' }}>Tổng số bài viết</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#1e293b' }}>{stats.total} bài</div>
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
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#ecfdf5',
            color: '#059669',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Globe size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500' }}>Đã xuất bản</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#059669' }}>{stats.published} bài</div>
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
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: '#fef3c7',
            color: '#d97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FileEdit size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.775rem', color: '#64748b', fontWeight: '500' }}>Bản nháp (Draft)</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#d97706' }}>{stats.draft} bài</div>
          </div>
        </div>
      </div>

      {/* Alert Notification Messages */}
      {error && (
        <div style={{
          padding: '0.85rem 1.25rem',
          borderRadius: '12px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          color: '#b91c1c',
          fontSize: '0.875rem',
          fontWeight: '600',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {message && (
        <div style={{
          padding: '0.85rem 1.25rem',
          borderRadius: '12px',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          color: '#047857',
          fontSize: '0.875rem',
          fontWeight: '600',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}>
          <CheckCircle2 size={18} /> {message}
        </div>
      )}

      {/* Two Column Main Dashboard Layout */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '1.5rem',
        alignItems: 'start'
      }}>
        {/* LEFT COLUMN: LIST OF ARTICLES */}
        <div style={{
          background: '#ffffff',
          borderRadius: '18px',
          border: '1px solid #e2e8f0',
          padding: '1.25rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #f1f5f9',
            paddingBottom: '0.75rem'
          }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FolderKanban size={18} color="#059669" /> Danh sách bài viết
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600', background: '#eff6ff', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
              {filteredArticles.length} kết quả
            </span>
          </div>

          {/* Search & Category Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Tìm tiêu đề, tác giả..."
                style={{
                  width: '100%',
                  padding: '0.5rem 0.65rem 0.5rem 2.2rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
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
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Category chips */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => { setFilterCat(''); setPage(1); }}
                style={{
                  padding: '0.25rem 0.65rem',
                  borderRadius: '6px',
                  border: filterCat === '' ? '1px solid #10b981' : '1px solid #e2e8f0',
                  background: filterCat === '' ? '#ecfdf5' : '#ffffff',
                  color: filterCat === '' ? '#047857' : '#64748b',
                  fontSize: '0.775rem',
                  fontWeight: filterCat === '' ? '700' : '500',
                  cursor: 'pointer'
                }}
              >
                Tất cả
              </button>
              {['BLOG', 'COFFEEHOLIC', 'TEAHOLIC'].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setFilterCat(cat); setPage(1); }}
                  style={{
                    padding: '0.25rem 0.65rem',
                    borderRadius: '6px',
                    border: filterCat === cat ? '1px solid #10b981' : '1px solid #e2e8f0',
                    background: filterCat === cat ? '#ecfdf5' : '#ffffff',
                    color: filterCat === cat ? '#047857' : '#64748b',
                    fontSize: '0.775rem',
                    fontWeight: filterCat === cat ? '700' : '500',
                    cursor: 'pointer'
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* List items */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
              <RefreshCw size={24} color="#10b981" style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
              <p style={{ margin: 0, fontSize: '0.85rem' }}>Đang tải bài viết...</p>
            </div>
          ) : pageRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <Newspaper size={32} color="#94a3b8" style={{ marginBottom: '0.5rem' }} />
              <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>Không tìm thấy bài viết nào.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {pageRows.map((article) => {
                const isActive = activeArticle?.id === article.id
                return (
                  <div
                    key={article.id}
                    onClick={() => setActiveArticleId(article.id)}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: '12px',
                      border: isActive ? '2px solid #10b981' : '1px solid #e2e8f0',
                      background: isActive ? '#ecfdf5' : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                      boxShadow: isActive ? '0 4px 6px -1px rgba(16, 185, 129, 0.15)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.925rem', fontWeight: '700', color: '#0f172a', lineHeight: 1.35 }}>
                        {article.title}
                      </h4>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                        flexShrink: 0,
                        background: article.is_published ? '#d1fae5' : '#fef3c7',
                        color: article.is_published ? '#047857' : '#b45309'
                      }}>
                        {article.is_published ? 'Đã xuất bản' : 'Bản nháp'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.775rem', color: '#64748b', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <span style={{ background: '#e0e7ff', color: '#4f46e5', padding: '0.1rem 0.45rem', borderRadius: '4px', fontWeight: '600' }}>
                        {article.category || 'BLOG'}
                      </span>
                      <span>Tác giả: <strong>{article.author_name || 'Nhân viên'}</strong></span>
                      <span>{fmtDate(article.created_at)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '0.2rem' }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setActiveArticleId(article.id); }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.25rem 0.55rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#eff6ff',
                          color: '#2563eb',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        <Edit3 size={12} /> Chỉnh sửa
                      </button>

                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(article.id); }}
                        disabled={deletingId === article.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.25rem 0.55rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: '#fef2f2',
                          color: '#ef4444',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={12} /> {deletingId === article.id ? 'Đang xóa...' : 'Xóa'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.4rem',
              marginTop: '0.5rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid #f1f5f9'
            }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
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

              <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: '600', padding: '0 0.5rem' }}>
                Trang {safePage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
        </div>

        {/* RIGHT COLUMN: ARTICLE EDITOR FORM */}
        <div style={{
          background: '#ffffff',
          borderRadius: '18px',
          border: '1px solid #e2e8f0',
          padding: '1.25rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.03)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid #f1f5f9',
            paddingBottom: '0.75rem',
            marginBottom: '1rem'
          }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FileEdit size={18} color="#10b981" />
              {activeArticleId ? 'Cập nhật bài viết' : 'Soạn bài viết mới'}
            </h3>
            {activeArticleId && (
              <button
                type="button"
                onClick={resetForCreate}
                style={{
                  background: '#f1f5f9',
                  border: 'none',
                  color: '#475569',
                  padding: '0.3rem 0.65rem',
                  borderRadius: '6px',
                  fontSize: '0.775rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
              >
                <Plus size={13} /> Tạo mới
              </button>
            )}
          </div>

          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {/* Title */}
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>
                Tiêu đề bài viết <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Nhập tiêu đề hấp dẫn cho bài viết..."
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Category & Author */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>
                  Danh mục
                </label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    color: '#1e293b',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="COFFEEHOLIC">Góc Cà Phê (COFFEEHOLIC)</option>
                  <option value="TEAHOLIC">Góc Trà (TEAHOLIC)</option>
                  <option value="BLOG">Tin Tức & Blog (BLOG)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>
                  Tác giả
                </label>
                <input
                  type="text"
                  value={form.author_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, author_name: e.target.value }))}
                  placeholder="Tên tác giả / NV"
                  style={{
                    width: '100%',
                    padding: '0.55rem 0.75rem',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '0.85rem',
                    color: '#1e293b',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Description */}
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>
                Mô tả ngắn (tóm tắt)
              </label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Mô tả ngắn hiển thị trên thẻ bài viết..."
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Content */}
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'block', marginBottom: '0.3rem' }}>
                Nội dung chi tiết bài viết <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <textarea
                rows={6}
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Soạn thảo nội dung bài viết đầy đủ tại đây..."
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '10px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  lineHeight: 1.5
                }}
              />
            </div>

            {/* Upload Image */}
            <div style={{
              background: '#f8fafc',
              padding: '0.85rem',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#374151', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <ImageIcon size={15} color="#10b981" /> Ảnh đại diện bài viết
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                style={{ fontSize: '0.825rem' }}
              />
              {activeArticleId && !imageFile && (
                <small style={{ color: '#64748b' }}>Bỏ trống để giữ ảnh hiện tại, chọn ảnh mới để thay thế.</small>
              )}
              {imageFile && (
                <small style={{ color: '#059669', fontWeight: '600' }}>✓ Đã chọn ảnh mới: {imageFile.name}</small>
              )}

              {imagePreview && (
                <div style={{ marginTop: '0.35rem' }}>
                  <img
                    src={imagePreview}
                    alt="Xem trước ảnh bài viết"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '160px',
                      borderRadius: '8px',
                      objectFit: 'cover',
                      border: '1px solid #e2e8f0'
                    }}
                  />
                </div>
              )}
            </div>

            {/* Is Published Toggle Checkbox */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              borderRadius: '10px',
              background: form.is_published ? '#ecfdf5' : '#fef3c7',
              border: form.is_published ? '1px solid #a7f3d0' : '1px solid #fde68a'
            }}>
              <input
                id="is-published-cb"
                type="checkbox"
                checked={Boolean(form.is_published)}
                onChange={(e) => setForm((prev) => ({ ...prev, is_published: e.target.checked }))}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="is-published-cb" style={{ fontSize: '0.85rem', fontWeight: '700', color: form.is_published ? '#047857' : '#b45309', cursor: 'pointer' }}>
                Xuất bản công khai ngay (Published)
              </label>
            </div>

            {/* Submit Action Buttons */}
            <div style={{ display: 'flex', gap: '0.65rem', marginTop: '0.5rem' }}>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  padding: '0.75rem 1rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: '#10b981',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  fontWeight: '700',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 10px rgba(16, 185, 129, 0.25)',
                  transition: 'all 0.2s ease'
                }}
              >
                {submitting ? (
                  <>
                    <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Đang lưu...
                  </>
                ) : (
                  <>
                    <Save size={16} /> {activeArticleId ? 'Cập nhật bài viết' : 'Lưu & Đăng bài viết'}
                  </>
                )}
              </button>

              {activeArticleId && (
                <button
                  type="button"
                  onClick={() => handleDelete(activeArticleId)}
                  disabled={deletingId === activeArticleId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#ef4444',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    fontWeight: '700',
                    cursor: deletingId === activeArticleId ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 10px rgba(239, 68, 68, 0.25)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Trash2 size={16} /> {deletingId === activeArticleId ? 'Đang xóa...' : 'Xóa bài'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
