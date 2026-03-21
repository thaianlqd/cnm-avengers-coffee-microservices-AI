import { useEffect, useMemo, useState } from 'react'
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

const EMPTY_FORM = {
  title: '',
  category: 'BLOG',
  description: '',
  content: '',
  author_name: '',
  is_published: true,
}

const PAGE_SIZE = 8

export function NewsPanel() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
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

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((article) => {
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
  }, [items, search])

  const activeArticle =
    filteredArticles.find((article) => article.id === activeArticleId) ||
    filteredArticles[0] ||
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
      setError('Tiêu đề và nội dung là bắt buộc')
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

      setMessage(activeArticleId ? 'Đã cập nhật bài viết' : 'Đã tạo bài viết mới')
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
    if (!window.confirm('Bạn chắc chắn muốn xóa bài viết này?')) return

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

      setMessage('Đã xóa bài viết')
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
    <section className="panel admin-news-panel">
      <div className="panel-head">
        <h2>Quản lý tin tức</h2>
        <span>Thêm, sửa, xóa bài viết và upload ảnh từ dashboard</span>
      </div>

      <div className="admin-news-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm bài viết theo tiêu đề, danh mục..."
        />
        <button type="button" className="btn-secondary" onClick={resetForCreate}>
          + Tạo bài viết mới
        </button>
      </div>

      {error ? <p style={{ color: '#b91c1c', fontWeight: 700 }}>{error}</p> : null}
      {message ? <p style={{ color: '#15803d', fontWeight: 700 }}>{message}</p> : null}

      {loading ? <p>Đang tải bài viết...</p> : null}
      {!loading && !filteredArticles.length ? <p>Chưa có bài viết nào.</p> : null}

      {!loading && filteredArticles.length ? (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Tiêu đề</th>
                <th>Danh mục</th>
                <th>Trạng thái</th>
                <th>Tác giả</th>
                <th>Ngày tạo</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((article) => (
                <tr key={article.id} className={activeArticle?.id === article.id ? 'ops-row-active' : ''}>
                  <td>
                    <strong>{article.title}</strong>
                    <p>ID: {article.id}</p>
                  </td>
                  <td>{article.category || 'BLOG'}</td>
                  <td>{article.is_published ? 'Published' : 'Draft'}</td>
                  <td>{article.author_name || 'Nhân viên'}</td>
                  <td>{fmtDate(article.created_at)}</td>
                  <td>
                    <div className="ops-table-actions">
                      <button type="button" className="secondary" onClick={() => setActiveArticleId(article.id)}>Sửa</button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => handleDelete(article.id)}
                        disabled={deletingId === article.id}
                      >
                        {deletingId === article.id ? 'Đang xóa...' : 'Xóa'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredArticles.length > PAGE_SIZE ? (
            <div className="ops-pagination">
              <span>{(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, filteredArticles.length)} / {filteredArticles.length}</span>
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
      ) : null}

      <article className="admin-news-detail news-editor-card">
          <form onSubmit={handleSave} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              <label>Tiêu đề</label>
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Nhập tiêu đề bài viết"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <label>Danh mục</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                >
                  <option value="COFFEEHOLIC">COFFEEHOLIC</option>
                  <option value="TEAHOLIC">TEAHOLIC</option>
                  <option value="BLOG">BLOG</option>
                </select>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <label>Tác giả</label>
                <input
                  value={form.author_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, author_name: e.target.value }))}
                  placeholder="Tên nhân viên"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label>Mô tả ngắn</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Mô tả ngắn cho card tin tức"
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label>Nội dung chi tiết</label>
              <textarea
                rows={8}
                value={form.content}
                onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                placeholder="Nhập nội dung bài viết"
              />
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <label>Ảnh bài viết</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
              />
              {activeArticleId && !imageFile && (
                <small style={{ color: '#666' }}>Bỏ trống để giữ ảnh cũ, chọn ảnh mới để thay thế</small>
              )}
              {imageFile && (
                <small style={{ color: '#15803d' }}>✓ Ảnh mới được chọn: {imageFile.name}</small>
              )}
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="preview"
                  className="admin-news-cover"
                  style={{ maxWidth: 320 }}
                />
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
              <input
                type="checkbox"
                checked={Boolean(form.is_published)}
                onChange={(e) => setForm((prev) => ({ ...prev, is_published: e.target.checked }))}
              />
              Đăng bài ngay (published)
            </label>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? 'Đang lưu...' : activeArticleId ? 'Cập nhật bài viết' : 'Tạo bài viết'}
              </button>
              {activeArticleId ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleDelete(activeArticleId)}
                  disabled={deletingId === activeArticleId}
                >
                  {deletingId === activeArticleId ? 'Đang xóa...' : 'Xóa bài viết'}
                </button>
              ) : null}
            </div>
          </form>
      </article>
    </section>
  )
}
