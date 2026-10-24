import { useEffect, useState, useMemo } from 'react'
import { Plus, Edit2, Trash2, Save, RefreshCw, Clock, Search, X, Coffee, ArrowRight, Calendar, Check, AlertCircle } from '../../../components/console/WorkspaceIcons'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Switch } from '../../../components/ui/switch'
import StatusBadge from '../../../components/console/StatusBadge'
import DateTimePicker from '../../../components/console/DateTimePicker'
import CurrencyInput from '../../../components/console/CurrencyInput'
import { Chart } from '../../../components/console/DashboardCharts'
import { API_BASE_URL } from '../../admin-dashboard/constants'

async function request(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, options)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Không thể tải dữ liệu. Vui lòng thử lại.')
  return data
}
const money = value => Number(value || 0).toLocaleString('vi-VN') + ' đ'
const date = value => new Date(value).toLocaleString('vi-VN', { dateStyle:'short', timeStyle:'short' })
const localDate = value => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16) }
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toLowerCase().replace(/\s+/g,' ').trim()
const labels = { ACTIVE:'Đang diễn ra', INACTIVE:'Tạm dừng', SCHEDULED:'Sắp diễn ra', EXPIRED:'Đã kết thúc' }
const criteria = { purchases:['Số lượng đã mua','total_qty'], orders:['Số đơn hoàn tất','order_count'], rating:['Điểm đánh giá trung bình','avg_rating'], reviews:['Số lượt đánh giá','total_reviews'], favorites:['Lượt yêu thích','favorite_count'], vouchers:['Số lượng mua có voucher','voucher_qty'] }

function ProductImage({ product }) {
  const src = product?.hinh_anh_url || product?.image || product?.image_url || product?.hinh_anh
  const name = product?.ten_san_pham || product?.name || 'Sản phẩm'
  return (
    <div className="commerce-product-photo">
      {src ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <Coffee size={24} />
      )}
    </div>
  )
}

function normalizeProduct(p) {
  const id = Number(p.ma_san_pham ?? p.id ?? p.ma_mon ?? 0)
  const name = p.ten_san_pham || p.name || p.ten_mon || `Món #${id}`
  const price = Number(p.gia_ban ?? p.price ?? p.gia ?? 0)
  // The editor loads the admin catalog: price is the persisted selling price,
  // while original_price may be an unrelated crossed-out retail price.
  const regularPrice = price
  const image = p.hinh_anh_url || p.image || p.image_url || p.hinh_anh || ''
  const active = p.dang_ban !== undefined ? Boolean(p.dang_ban) : p.trang_thai !== undefined ? Boolean(p.trang_thai) : true
  const categoryValue = p.category || p.category_name || p.ten_danh_muc || p.danh_muc || p.danhMuc?.ten_danh_muc || 'Món khác'
  const category = typeof categoryValue === 'object' ? categoryValue.ten_danh_muc || categoryValue.name || 'Món khác' : String(categoryValue)
  return {
    ...p,
    ma_san_pham: id,
    ten_san_pham: name,
    gia_ban: price,
    gia_niem_yet: regularPrice,
    hinh_anh_url: image,
    trang_thai: active,
    category,
  }
}

function campaignStatus(campaign, now) {
  return !campaign.enabled ? 'INACTIVE' : now < new Date(campaign.starts_at).getTime() ? 'SCHEDULED' : now >= new Date(campaign.ends_at).getTime() ? 'EXPIRED' : 'ACTIVE'
}
function CampaignClock({ campaign, now }) {
  const start = new Date(campaign.starts_at).getTime(), end = new Date(campaign.ends_at).getTime()
  const state = campaignStatus(campaign, now)
  const remaining = Math.max(0, Math.ceil(((state === 'SCHEDULED' ? start : end) - now) / 1000))
  const days = Math.floor(remaining / 86400)
  const clock = `${days ? `${days} ngày ` : ''}${String(Math.floor(remaining % 86400 / 3600)).padStart(2,'0')}:${String(Math.floor(remaining % 3600 / 60)).padStart(2,'0')}:${String(remaining % 60).padStart(2,'0')}`
  const progress = Math.min(100, Math.max(0, (now-start)/(end-start)*100))
  return <div className="campaign-clock"><div><Clock size={17}/><span>{state === 'ACTIVE' ? 'Kết thúc sau' : state === 'SCHEDULED' ? 'Bắt đầu sau' : labels[state]}</span>{['ACTIVE','SCHEDULED'].includes(state) && <strong aria-label="Thời gian còn lại">{clock}</strong>}</div><progress max="100" value={progress} aria-label="Tiến trình chương trình"/><small>{date(campaign.starts_at)} — {date(campaign.ends_at)}</small></div>
}

function CampaignEditor({ initial, products, busy, error, onCancel, onSave, onClearError }) {
  const [form, setForm] = useState(() => ({
    ...initial,
    starts_at: localDate(initial.starts_at),
    ends_at: localDate(initial.ends_at),
    products: (initial.products || []).map(p => ({
      product_id: Number(p.product_id),
      sale_price: p.sale_price !== undefined && p.sale_price !== null ? String(Number(p.sale_price)) : ''
    }))
  }))
  const [search, setSearch] = useState('')
  const [localError, setLocalError] = useState('')

  const update = (key, value) => {
    setLocalError('')
    onClearError?.()
    setForm(f => ({ ...f, [key]: value }))
  }

  const selectedMap = useMemo(() => {
    const map = new Map()
    for (const p of form.products) {
      map.set(Number(p.product_id), p.sale_price)
    }
    return map
  }, [form.products])

  const setProductPrice = (productId, newPrice) => {
    const pid = Number(productId)
    setLocalError('')
    onClearError?.()
    setForm(f => {
      const exists = f.products.some(p => p.product_id === pid)
      const valStr = newPrice !== '' && newPrice !== null && newPrice !== undefined ? String(newPrice) : ''
      if (!exists) {
        return {
          ...f,
          products: [...f.products, { product_id: pid, sale_price: valStr }]
        }
      }
      return {
        ...f,
        products: f.products.map(p => p.product_id === pid ? { ...p, sale_price: valStr } : p)
      }
    })
  }

  const addProduct = product => {
    const pid = Number(product.ma_san_pham)
    setLocalError('')
    onClearError?.()
    setForm(f => f.products.some(line => line.product_id === pid) ? f : {...f, products: [...f.products, {product_id: pid, sale_price: ''}]})
    setSearch('')
  }
  const removeProduct = pid => { onClearError?.(); setForm(f => ({...f, products: f.products.filter(line => line.product_id !== pid)})) }
  const suggestions = useMemo(() => {
    const q = normalize(search)
    if (!q) return []
    return products.filter(p => p.trang_thai !== false && !selectedMap.has(Number(p.ma_san_pham)) &&
      [p.ten_san_pham, p.category, p.ma_san_pham].some(value => normalize(value).includes(q))).slice(0,8)
  }, [products, selectedMap, search])
  const selectedProducts = form.products.map(line => products.find(p => Number(p.ma_san_pham) === line.product_id) || {ma_san_pham: line.product_id, ten_san_pham: `Món #${line.product_id}`, category: 'Sản phẩm trong chương trình'})

  const handleSubmit = (event) => {
    event.preventDefault()
    setLocalError('')

    if (!form.title.trim()) {
      setLocalError('Vui lòng nhập tên chương trình Flash Sale.')
      return
    }
    const start = new Date(form.starts_at).getTime()
    const end = new Date(form.ends_at).getTime()
    if (!start || !end || end <= start) {
      setLocalError('Thời gian kết thúc phải sau thời gian bắt đầu.')
      return
    }
    if (!form.products.length) {
      setLocalError('Vui lòng chọn ít nhất một sản phẩm tham gia Flash Sale.')
      return
    }

    const invalidItems = []
    for (const line of form.products) {
      const prod = products.find(p => Number(p.ma_san_pham) === line.product_id)
      const base = Number(prod?.gia_niem_yet || prod?.gia_ban || 0)
      const sale = Number(line.sale_price)
      if (!Number.isFinite(sale) || sale <= 0) {
        invalidItems.push(`“${prod?.ten_san_pham || `#${line.product_id}`}” chưa nhập giá sale.`)
      } else if (base > 0 && sale >= base) {
        invalidItems.push(`“${prod?.ten_san_pham || `#${line.product_id}`}” giá sale (${money(sale)}) phải nhỏ hơn giá gốc (${money(base)}).`)
      }
    }

    if (invalidItems.length > 0) {
      setLocalError(invalidItems.slice(0, 3).join(' ') + (invalidItems.length > 3 ? ` và ${invalidItems.length - 3} món khác.` : ''))
      return
    }

    onSave({
      ...form,
      title: form.title.trim(),
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      products: form.products.map(p => ({
        product_id: Number(p.product_id),
        sale_price: Number(p.sale_price)
      }))
    })
  }

  return (
    <form className="campaign-editor" onSubmit={handleSubmit}>
      <header>
        <div>
          <h2>{initial.id ? 'Chỉnh sửa chương trình' : 'Tạo chương trình flash sale'}</h2>
          <p>Chọn món và cài đặt giá ưu đãi trực tiếp ngay trên từng sản phẩm.</p>
        </div>
        <Button variant="ghost" type="button" size="icon" onClick={onCancel} disabled={busy} aria-label="Đóng chỉnh sửa" className="campaign-close-editor">
          <X />
        </Button>
      </header>

      {(error || localError) && (
        <p role="alert" className="workspace-form-error">{localError || error}</p>
      )}

      <fieldset disabled={busy} className="campaign-settings">
        <div className="campaign-title-field">
          <Label htmlFor="sale-title">Tên chương trình</Label>
          <Input
            id="sale-title"
            required
            maxLength={200}
            value={form.title}
            onChange={e => update('title', e.target.value)}
            placeholder="Ví dụ: Giờ vàng cà phê sáng"
          />
        </div>
        <div>
          <Label>Bắt đầu</Label>
          <DateTimePicker required value={form.starts_at} onChange={e => update('starts_at', e.target.value)} />
        </div>
        <div>
          <Label>Kết thúc</Label>
          <DateTimePicker required value={form.ends_at} onChange={e => update('ends_at', e.target.value)} />
        </div>
        <div className="campaign-enabled">
          <Switch id="sale-enabled" checked={form.enabled} onCheckedChange={v => update('enabled', v)} />
          <Label htmlFor="sale-enabled">Cho phép chạy theo lịch</Label>
        </div>
      </fieldset>

      <section className="campaign-unified-section">
        <div className="campaign-selection-intro"><h3>Sản phẩm và giá ưu đãi</h3><p>Tìm món và bấm Thêm. Sau đó nhập giá flash sale trong danh sách đã chọn bên dưới.</p></div>
        <div className="campaign-product-finder">
          <Label htmlFor="campaign-product-query">Thêm sản phẩm</Label>
          <div className="campaign-product-search"><Search size={17}/><Input id="campaign-product-query" aria-label="Tìm sản phẩm flash sale" placeholder="Nhập tên món hoặc mã sản phẩm…" value={search} disabled={busy} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(suggestions.length===1)addProduct(suggestions[0])}if(e.key==='Escape')setSearch('')}}/>{search&&<Button variant="ghost" size="icon" type="button" aria-label="Xóa tìm kiếm sản phẩm" onClick={()=>setSearch('')}><X size={14}/></Button>}</div>
          {normalize(search) ? <div className="campaign-suggestions" aria-label="Kết quả tìm sản phẩm">
            {suggestions.map(product=><Button key={product.ma_san_pham} type="button" variant="ghost" disabled={busy} onClick={()=>addProduct(product)} aria-label={`Thêm ${product.ten_san_pham}`}><ProductImage product={product}/><span><strong>{product.ten_san_pham}</strong><small>{product.category} · #{product.ma_san_pham} · {money(product.gia_niem_yet||product.gia_ban)}</small></span><span className="campaign-add-label"><Plus size={16}/>Thêm</span></Button>)}
            {!suggestions.length&&<p role="status">Không tìm thấy món mới phù hợp. Món đã thêm nằm trong danh sách bên dưới.</p>}
          </div> : <p className="campaign-search-hint">Nhập từ khóa để xem gợi ý sản phẩm.</p>}
        </div>
        <div className="campaign-selected-heading"><h4>Món trong chương trình</h4><span>{form.products.length} món đã chọn</span></div>
        <div className="campaign-price-list" aria-label="Danh sách món đã chọn và giá flash sale">
          {selectedProducts.length>0&&<div className="campaign-price-head" aria-hidden="true"><span>Sản phẩm</span><span>Giá thường</span><span>Giá flash sale (VNĐ)</span><span>Ưu đãi</span><span>Thao tác</span></div>}
          {selectedProducts.map(product=>{
            const pid=Number(product.ma_san_pham), price=selectedMap.get(pid)??'', base=Number(product.gia_niem_yet || product.gia_ban || 0), valid=Number(price)>0&&Number(price)<base
            return <div key={pid} className="campaign-price-row is-selected">
              <div className="campaign-price-product"><ProductImage product={product}/><div><strong>{product.ten_san_pham}</strong><small>{product.category} · #{pid}</small></div></div>
              <div className="campaign-regular-price"><span>Giá thường</span><strong>{money(base)}</strong></div>
              <div className="campaign-price-input"><Label htmlFor={`sale-price-${pid}`}>Giá flash sale cho {product.ten_san_pham} (VNĐ)</Label><CurrencyInput id={`sale-price-${pid}`} disabled={busy} required value={price} placeholder="Nhập giá ưu đãi" onChange={e=>setProductPrice(pid,e.target.value)}/></div>
              <div className="campaign-price-feedback">{valid?<><strong>Giảm {Math.round((1-Number(price)/base)*100)}%</strong><small>Tiết kiệm {money(base-Number(price))}</small></>:price!==''?<span className="campaign-price-error"><AlertCircle size={14}/>Giá phải lớn hơn 0 và thấp hơn giá thường</span>:<small>Chưa nhập giá</small>}</div>
              <Button type="button" variant="ghost" size="icon" className="campaign-remove-product" disabled={busy} onClick={()=>removeProduct(pid)} aria-label={`Bỏ ${product.ten_san_pham}`} title="Bỏ món khỏi chương trình"><Trash2 size={17}/></Button>
            </div>
          })}
          {!selectedProducts.length&&<div className="campaign-empty-list"><Coffee size={28}/><p>Chưa thêm món nào. Tìm kiếm sản phẩm ở trên để bắt đầu.</p></div>}
        </div>
      </section>

      <footer>
        <span className="campaign-footer-count">
          <strong>{form.products.length}</strong> sản phẩm đã chọn
        </span>
        <Button variant="outline" type="button" disabled={busy} onClick={onCancel}>
          Hủy
        </Button>
        <Button
          className="admin-button-primary"
          variant="default"
          type="submit"
          disabled={busy || !form.products.length}
        >
          <Save size={16} />
          {busy ? 'Đang lưu…' : 'Lưu chương trình'}
        </Button>
      </footer>
    </form>
  )
}

export function AdminFlashSalePanel() {
  const [items, setItems] = useState([]), [products, setProducts] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [editor, setEditor] = useState(null), [saving, setSaving] = useState(false), [now, setNow] = useState(Date.now())
  
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [sales,menu]=await Promise.all([request('/products/flash-sale-campaigns'),request('/menu/items')])
      const list=Array.isArray(menu)?menu:menu?.items||menu?.data||[]
      if (!Array.isArray(list)) throw new Error('Dữ liệu thực đơn không hợp lệ. Vui lòng tải lại.')
      setItems(sales.items||[])
      setProducts(list.map(normalizeProduct))
    } catch(e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const edit = item => { setError(''); setEditor(item) }
  const save = async form => {
    setSaving(true)
    setError('')
    try {
      await request(`/products/flash-sale-campaigns${form.id ? `/${form.id}` : ''}`, {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      setEditor(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }
  const remove = async item => {
    if (!window.confirm(`Xóa chương trình “${item.title}”?`)) return
    try {
      await request(`/products/flash-sale-campaigns/${item.id}`, { method: 'DELETE' })
      if (editor?.id === item.id) setEditor(null)
      await load()
    } catch (e) {
      setError(e.message)
    }
  }
  const sorted = [...items].sort((a, b) => {
    const priority = { ACTIVE: 0, SCHEDULED: 1, INACTIVE: 2, EXPIRED: 3 }
    return priority[campaignStatus(a, now)] - priority[campaignStatus(b, now)] || new Date(b.starts_at) - new Date(a.starts_at)
  })

  return (
    <section className="admin-commerce">
      <div className="operation-section-heading">
        <p>Quản lý chương trình và giá từng món theo khung giờ ưu đãi.</p>
        <Button
          className="admin-button-primary"
          variant="default"
          disabled={saving}
          onClick={() => edit({
            title: '',
            starts_at: new Date().toISOString(),
            ends_at: new Date(Date.now() + 86400000).toISOString(),
            enabled: true,
            products: []
          })}
        >
          <Plus size={16} /> Tạo flash sale
        </Button>
      </div>

      {error && !editor && <p role="alert" className="workspace-form-error">{error}</p>}
      {editor && !editor.id && (
        <CampaignEditor
          key="new"
          initial={editor}
          products={products}
          busy={saving}
          error={error}
          onCancel={() => setEditor(null)}
          onSave={save}
          onClearError={() => setError('')}
        />
      )}

      {loading ? (
        <p role="status">Đang tải chương trình…</p>
      ) : (
        <div className="campaign-list">
          {sorted.map(campaign => (
            <article key={campaign.id} className="campaign-program">
              <header>
                <div>
                  <StatusBadge status={campaignStatus(campaign, now)}>
                    {labels[campaignStatus(campaign, now)]}
                  </StatusBadge>
                  <h2>{campaign.title}</h2>
                  <p>
                    <Calendar size={15} />
                    {campaign.products.length} sản phẩm trong chương trình
                  </p>
                </div>
                <div className="campaign-program-actions">
                  <Button className="campaign-edit-button" variant="outline" disabled={saving} onClick={() => edit(campaign)}>
                    <Edit2 size={16} /> Chỉnh sửa
                  </Button>
                  <Button
                    variant="outline"
                    disabled={saving}
                    data-intent="danger"
                    size="icon"
                    aria-label={`Xóa ${campaign.title}`}
                    onClick={() => remove(campaign)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </header>
              <CampaignClock campaign={campaign} now={now} />
              {editor?.id === campaign.id ? (
                <CampaignEditor
                  key={campaign.id}
                  initial={editor}
                  products={products}
                  busy={saving}
                  error={error}
                  onCancel={() => setEditor(null)}
                  onSave={save}
                  onClearError={() => setError('')}
                />
              ) : (
                <div className="campaign-product-preview">
                  {campaign.products.map(product => (
                    <div key={product.product_id}>
                      <ProductImage product={product} />
                      <span>
                        <strong>{product.ten_san_pham}</strong>
                        <small>
                          <del>{money(product.original_price)}</del>
                          <ArrowRight size={12} />
                          <b>{money(product.sale_price)}</b>
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {!loading && !items.length && !editor && (
        <div className="commerce-empty">
          <Clock size={32} />
          <h2>Chưa có chương trình flash sale</h2>
          <p>Tạo chương trình để chọn món, giá ưu đãi và lịch chạy.</p>
        </div>
      )}
    </section>
  )
}

export function AdminProductRankingPanel() {
  const [data,setData] = useState(null), [weights,setWeights] = useState({}), [error,setError] = useState(''), [saving,setSaving] = useState(false), [message,setMessage] = useState('')
  const load = async () => {setError('');try {const result=await request('/products/ranking');setData(result);setWeights(result.weights)} catch(e) {setError(e.message)}}
  useEffect(()=>{load()},[])
  const save = async e => {e.preventDefault();setSaving(true);setMessage('');try {await request('/products/ranking',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({weights})});await load();setMessage('Đã lưu. Top 5 chung cuộc đã được cập nhật cho trang đặt hàng.')} catch(e) {setError(e.message)} finally {setSaving(false)}}
  return <section className="admin-commerce"><p className="operation-note">Dữ liệu 90 ngày gần nhất từ đơn hoàn tất đã thanh toán, voucher, đánh giá và yêu thích.</p>{error && <p role="alert" className="workspace-form-error">{error}</p>}{message && <p role="status">{message}</p>}
    {!data ? (error?<Button variant="outline" onClick={load}>Thử tải lại</Button>:<p role="status">Đang tải dữ liệu chấm điểm…</p>) : <>
      <section className="ranking-final"><header><h2>Top 5 món gợi ý trên web</h2><p>Kết quả chung cuộc theo tổng điểm và trọng số đã lưu.</p></header><ol>{(data.top || data.items.filter(p=>p.score>0).slice(0,5)).map((p,index)=><li key={p.ma_san_pham}><span className="ranking-position">{index+1}</span><ProductImage product={p}/><div><strong>{p.ten_san_pham}</strong><small>{money(p.gia_ban)}</small></div><span className="ranking-score"><b>{Number(p.score).toLocaleString('vi-VN',{maximumFractionDigits:2})}</b> điểm</span></li>)}</ol>{!data.top?.length && <p className="operation-empty">Chưa có đủ tương tác để gợi ý món.</p>}</section>
      <div className="ranking-criteria-charts">{Object.entries(criteria).map(([key,[title,field]])=>{const rows=[...data.items].filter(p=>Number(p[field])>0).sort((a,b)=>Number(b[field])-Number(a[field]) || Number(a.ma_san_pham)-Number(b.ma_san_pham)).slice(0,5).map(p=>({label:p.ten_san_pham,value:Number(p[field])}));return <Chart key={key} title={title} subtitle={`Top 5 theo tiêu chí · Trọng số ${data.weights[key]}`} rows={rows} format={v=>Number(v).toLocaleString('vi-VN',{maximumFractionDigits:2})}/>})}</div>
      <details className="ranking-settings"><summary>Điều chỉnh trọng số chấm điểm</summary><form onSubmit={save} className="ranking-weights">{Object.entries(criteria).map(([key,[label]])=><div key={key}><Label htmlFor={`weight-${key}`}>{label}</Label><Input id={`weight-${key}`} type="number" min="0" max="100" step="0.1" required value={weights[key]??0} onChange={e=>setWeights({...weights,[key]:Number(e.target.value)})}/></div>)}<footer><Button type="button" variant="outline" onClick={load}><RefreshCw size={16}/>Tải lại</Button><Button className="admin-button-primary" variant="default" type="submit" disabled={saving}><Save size={16}/>{saving?'Đang lưu…':'Lưu trọng số'}</Button></footer></form></details>
    </>}
  </section>
}
