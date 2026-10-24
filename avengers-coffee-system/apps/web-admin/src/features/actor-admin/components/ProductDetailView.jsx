import StatusBadge from '../../../components/console/StatusBadge'
import { ArrowLeft, Edit3, Trash2, Coffee } from '../../../components/console/WorkspaceIcons'
import { useWorkspacePage } from '../../../components/console/WorkspacePageContext'
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card'
import { Badge } from '../../../components/ui/badge'
import { Button } from '../../../components/ui/button'

export function ProductDetailView({ product, categories = [], onBack, onEdit, onDelete }) {
  useWorkspacePage(product.name || 'Chi tiết sản phẩm', 'Thông tin sản phẩm, tùy chọn đặt món và giá bán.')
  const category = product.category || categories.find(c => String(c.id) === String(product.ma_danh_muc) || String(c.code) === String(product.category_code))?.label || product.parent_category || 'Chưa phân loại'
  const money = value => Number(value || 0).toLocaleString('vi-VN') + ' đ'
  const attributes = product.bien_the && typeof product.bien_the === 'object' ? Object.entries(product.bien_the) : []
  return (
    <div className="record-page" style={{ paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div className="record-page-actions" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', paddingBottom: '0.25rem' }}>
        <Button
          variant="outline"
          className="admin-button-secondary"
          onClick={onBack}
          style={{
            height: '38px',
            padding: '0 14px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
            color: '#334155',
            fontWeight: 500,
            fontSize: '13px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={16} /> Quay lại danh sách
        </Button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="outline"
            className="admin-button-secondary"
            onClick={onEdit}
            style={{
              height: '38px',
              padding: '0 14px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff',
              color: '#334155',
              fontWeight: 500,
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
              cursor: 'pointer'
            }}
          >
            <Edit3 size={16} /> Chỉnh sửa
          </Button>
          <Button
            variant="outline"
            data-intent="danger"
            className="btn-delete"
            onClick={onDelete}
            style={{
              height: '38px',
              padding: '0 14px',
              borderRadius: '8px',
              border: '1px solid #fee2e2',
              backgroundColor: '#ffffff',
              color: '#ef4444',
              fontWeight: 500,
              fontSize: '13px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 2px rgba(239, 68, 68, 0.04)',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={16} /> Xóa sản phẩm
          </Button>
        </div>
      </div>
      <div className="record-product-grid">
        <Card className="record-product-main"><CardHeader><CardTitle>Thông tin sản phẩm</CardTitle></CardHeader><CardContent>
          <dl className="record-facts"><div><dt>Tên sản phẩm</dt><dd>{product.name || 'Chưa đặt tên'}</dd></div><div><dt>Mô tả</dt><dd>{product.description || 'Chưa có mô tả.'}</dd></div></dl>
          <div className="record-inline-facts"><div><span>Trạng thái</span><StatusBadge status={Boolean(product.dang_ban)}>{product.dang_ban ? 'Đang bán' : 'Tạm ngưng'}</StatusBadge></div><div><span>Danh mục</span><Badge variant="outline">{category}</Badge></div><div><span>Mã sản phẩm</span><strong>{product.id || '—'}</strong></div></div>
          {attributes.length > 0 && <><h3 className="record-subheading">Tùy chọn đặt món</h3><dl className="record-facts">{attributes.map(([name, choices]) => <div key={name}><dt>{name}</dt><dd>{typeof choices === 'object' ? Object.entries(choices || {}).map(([label, value]) => <span className="record-option" key={label}>{label}<small>{typeof value === 'number' ? '+' + money(value) : ''}</small></span>) : String(choices)}</dd></div>)}</dl></>}
        </CardContent></Card>
        <div className="record-side-stack"><Card><CardHeader><CardTitle>Hình ảnh</CardTitle></CardHeader><CardContent><div className="record-product-image">{product.image ? <img src={product.image} alt={product.name || 'Sản phẩm'} /> : <Coffee size={64} />}</div></CardContent></Card>
          <Card><CardHeader><CardTitle>Giá bán &amp; hiển thị</CardTitle></CardHeader><CardContent><dl className="record-facts record-facts-inline"><div><dt>Giá bán</dt><dd className="record-price">{money(product.price)}</dd></div>{Number(product.original_price) > Number(product.price) && <div><dt>Giá niêm yết</dt><dd>{money(product.original_price)}</dd></div>}<div><dt>Nhãn đặc trưng</dt><dd>{[product.la_hot && 'Bán chạy', product.la_moi && 'Mới', product.is_discounted && 'Ưu đãi'].filter(Boolean).join(' · ') || 'Tiêu chuẩn'}</dd></div></dl></CardContent></Card>
        </div>
      </div>
    </div>
  )
}
