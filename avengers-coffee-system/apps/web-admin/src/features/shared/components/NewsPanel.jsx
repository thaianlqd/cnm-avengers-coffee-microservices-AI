import ArticleEditor from './ArticleEditor'
import { WorkspacePanelIntro } from '../../../components/console/OperationalPageFrame'
import { Button } from '../../../components/ui/button'
import { Badge } from '../../../components/ui/badge'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import SearchableSelect from '../../../components/console/SearchableSelect'
import WorkspaceDialog from '../../../components/console/WorkspaceDialog'
import { Check as WorkspaceSymbolCheck } from '../../../components/console/WorkspaceIcons'
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
} from '../../../components/console/WorkspaceIcons'
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
  const [editorOpen, setEditorOpen] = useState(false)
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
    setEditorOpen(true)
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
      setEditorOpen(false)
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
        setEditorOpen(false)
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

  if (editorOpen) return <ArticleEditor form={form} setForm={setForm} onSubmit={handleSave} onBack={() => setEditorOpen(false)} busy={submitting} error={error} imagePreview={imagePreview} onImageChange={setImageFile} editing={Boolean(activeArticleId)} />

  return (
    <div className="panel-container" style={{
      padding: '1.75rem',
      background: '#f8f9f6',
      borderRadius: '20px',
      border: '1px solid #e2e4df',
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
          <div className="operational-title-decoration" style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)'
          }}>
            <Newspaper size={24} />
          </div>
          <WorkspacePanelIntro><div>
            <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '600', color: '#252927' }}>
              Quản lý Tin Tức & Bài Viết
            </h2>
            <span style={{ fontSize: '0.825rem', color: '#69736a' }}>
              Đăng tin tức, bài viết blog, chương trình khuyến mãi và tải ảnh minh họa bài viết
            </span>
          </div></WorkspacePanelIntro>
        </div>

        <Button
          type="button"
          onClick={resetForCreate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.6rem 1.2rem',
            borderRadius: '10px',
            border: 'none',
            background: "var(--primary)",
            color: '#ffffff',
            fontSize: '0.875rem',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(59, 130, 246, 0.25)',
            transition: 'all 0.2s ease'
          }}
        >
          <Plus size={18} /> Soạn bài viết mới
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="news-summary-cards" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
        gap: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{
          background: '#ffffff',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e4df',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'var(--primary-light)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FileText size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.775rem', color: '#69736a', fontWeight: '500' }}>Tổng số bài viết</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '600', color: '#30382e' }}>{stats.total} bài</div>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e4df',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: "#f4f5f2",
            color: '#2563eb',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Globe size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.775rem', color: '#69736a', fontWeight: '500' }}>Đã xuất bản</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '600', color: '#2563eb' }}>{stats.published} bài</div>
          </div>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '1.1rem 1.25rem',
          borderRadius: '14px',
          border: '1px solid #e2e4df',
          display: 'flex',
          alignItems: 'center',
          gap: '0.85rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: "#f4f5f2",
            color: '#d97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <FileEdit size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.775rem', color: '#69736a', fontWeight: '500' }}>Bản nháp (Draft)</div>
            <div style={{ fontSize: '1.3rem', fontWeight: '600', color: '#d97706' }}>{stats.draft} bài</div>
          </div>
        </div>
      </div>

      {/* Alert Notification Messages */}
      {error && (
        <div style={{
          padding: '0.85rem 1.25rem',
          borderRadius: '12px',
          background: "#f4f5f2",
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
          background: "#f4f5f2",
          border: '1px solid #bfdbfe',
          color: '#1d4ed8',
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

      {/* Article list */}
      <div className="workspace-news-layout" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))',
        gap: '1.5rem',
        alignItems: 'start'
      }}>
        {/* LEFT COLUMN: LIST OF ARTICLES */}
        <div style={{
          background: '#ffffff',
          borderRadius: '18px',
          border: '1px solid #e2e4df',
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
            borderBottom: '1px solid #f4f5f2',
            paddingBottom: '0.75rem'
          }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600', color: '#252927', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FolderKanban size={18} color="#2563eb" /> Danh sách bài viết
            </h3>
            <Badge variant="outline" data-quiet-label="true" className="workspace-inline-label" style={{ fontSize: '0.8rem', color: '#69736a', fontWeight: '600', background: 'var(--primary-light)', padding: '0.2rem 0.6rem', borderRadius: '9999px' }}>
              {filteredArticles.length} kết quả
            </Badge>
          </div>

          {/* Search & Category Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} color="#85907d" style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)' }} />
              <Input data-input-prefix="true"
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Tìm tiêu đề, tác giả..."
                style={{
                  width: '100%',
                  padding: '0.5rem 0.65rem 0.5rem 2.2rem',
                  borderRadius: '10px',
                  border: '1px solid #ccd3c7',
                  fontSize: '0.85rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {search && (
                <Button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: '0.5rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#85907d',
                    cursor: 'pointer'
                  }}
                >
                  <X size={14} />
                </Button>
              )}
            </div>

            {/* Category chips */}
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <Button data-selected={filterCat === ''}
                type="button"
                onClick={() => { setFilterCat(''); setPage(1); }}
                style={{
                  padding: '0.25rem 0.65rem',
                  borderRadius: '6px',
                  border: filterCat === '' ? "1px solid var(--primary)" : '1px solid #e2e4df',
                  background: filterCat === '' ? "#f4f5f2" : '#ffffff',
                  color: filterCat === '' ? "var(--primary)" : '#69736a',
                  fontSize: '0.775rem',
                  fontWeight: filterCat === '' ? '700' : '500',
                  cursor: 'pointer'
                }}
              >
                Tất cả
              </Button>
              {['BLOG', 'COFFEEHOLIC', 'TEAHOLIC'].map((cat) => (
                <Button data-selected={filterCat === cat}
                  key={cat}
                  type="button"
                  onClick={() => { setFilterCat(cat); setPage(1); }}
                  style={{
                    padding: '0.25rem 0.65rem',
                    borderRadius: '6px',
                    border: filterCat === cat ? "1px solid var(--primary)" : '1px solid #e2e4df',
                    background: filterCat === cat ? "#f4f5f2" : '#ffffff',
                    color: filterCat === cat ? "var(--primary)" : '#69736a',
                    fontSize: '0.775rem',
                    fontWeight: filterCat === cat ? '700' : '500',
                    cursor: 'pointer'
                  }}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          {/* List items */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#69736a' }}>
              <RefreshCw size={24} color="#3b82f6" style={{ animation: 'spin 1s linear infinite', marginBottom: '0.5rem' }} />
              <p style={{ margin: 0, fontSize: '0.85rem' }}>Đang tải bài viết...</p>
            </div>
          ) : pageRows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: '#f8f9f6', borderRadius: '12px', border: '1px dashed #ccd3c7' }}>
              <Newspaper size={32} color="#85907d" style={{ marginBottom: '0.5rem' }} />
              <p style={{ margin: 0, color: '#69736a', fontSize: '0.85rem' }}>Không tìm thấy bài viết nào.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {pageRows.map((article) => {
                const isActive = activeArticle?.id === article.id
                return (
                  <div
                    key={article.id}
                    onClick={() => { setActiveArticleId(article.id); setError(''); setEditorOpen(true) }}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: '12px',
                      border: isActive ? '2px solid #3b82f6' : '1px solid #e2e4df',
                      background: isActive ? "#f4f5f2" : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.4rem',
                      boxShadow: isActive ? '0 4px 6px -1px rgba(59, 130, 246, 0.15)' : 'none'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.925rem', fontWeight: '700', color: '#252927', lineHeight: 1.35 }}>
                        {article.title}
                      </h4>
                      <Badge variant="outline" data-quiet-label="true" className="workspace-inline-label" style={{
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '9999px',
                        flexShrink: 0,
                        background: article.is_published ? "#f4f5f2" : "#f4f5f2",
                        color: article.is_published ? '#1d4ed8' : '#b45309'
                      }}>
                        {article.is_published ? 'Đã xuất bản' : 'Bản nháp'}
                      </Badge>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.775rem', color: '#69736a', flexWrap: 'wrap', gap: '0.4rem' }}>
                      <Badge variant="outline" data-quiet-label="true" style={{ background: 'var(--primary-subtle)', color: 'var(--primary)', padding: '0.1rem 0.45rem', borderRadius: '4px', fontWeight: '600' }}>
                        {article.category || 'BLOG'}
                      </Badge>
                      <span>Tác giả: <strong>{article.author_name || 'Nhân viên'}</strong></span>
                      <span>{fmtDate(article.created_at)}</span>
                    </div>

                    <div data-modal-actions="true" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', marginTop: '0.2rem' }}>
                      <Button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setActiveArticleId(article.id); setError(''); setEditorOpen(true); }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          padding: '0.25rem 0.55rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'var(--primary-light)',
                          color: 'var(--primary)',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        <Edit3 size={12} /> Chỉnh sửa
                      </Button>

                      <Button
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
                          background: "#f4f5f2",
                          color: '#ef4444',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={12} /> {deletingId === article.id ? 'Đang xóa...' : 'Xóa'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div data-modal-actions="true" style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '0.4rem',
              marginTop: '0.5rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid #f4f5f2'
            }}>
              <Button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #ccd3c7',
                  background: '#ffffff',
                  color: safePage === 1 ? '#ccd3c7' : '#414743',
                  fontSize: '0.775rem',
                  fontWeight: '600',
                  cursor: safePage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                <ChevronLeft size={14} /> Trước
              </Button>

              <span style={{ fontSize: '0.8rem', color: '#69736a', fontWeight: '600', padding: '0 0.5rem' }}>
                Trang {safePage} / {totalPages}
              </span>

              <Button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '6px',
                  border: '1px solid #ccd3c7',
                  background: '#ffffff',
                  color: safePage === totalPages ? '#ccd3c7' : '#414743',
                  fontSize: '0.775rem',
                  fontWeight: '600',
                  cursor: safePage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Tiếp <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: ARTICLE EDITOR FORM */}

      </div>
    </div>
  )
}
