import { ArrowLeft, Edit3, ShoppingBag, User, CreditCard } from '../../../components/console/WorkspaceIcons'
import { Button } from '../../../components/ui/button'
import StatusBadge from '../../../components/console/StatusBadge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/card'
import { Table } from '../../../components/ui/table'
import { ORDER_STATUS_LABEL } from '../constants'
import { normalizeOrderStatus, paymentTag, orderCancellationReason } from '../utils'

export default function OrderDetailView({ order, onBack, onEdit, canEdit, editReason }) {
  const money = value => Number(value || 0).toLocaleString('vi-VN') + ' đ'
  const date = order.ngay_tao && Number.isFinite(new Date(order.ngay_tao).getTime()) ? new Date(order.ngay_tao).toLocaleString('vi-VN') : 'Chưa có thời gian'
  const status = normalizeOrderStatus(order.trang_thai_don_hang)
  const items = order.chi_tiet || []
  const fact = (label, value) => <div><dt>{label}</dt><dd>{value || 'Chưa cập nhật'}</dd></div>
  return <section className="record-page order-detail-page">
    <div className="record-page-actions"><Button variant="outline" onClick={onBack}><ArrowLeft size={17} />Quay lại danh sách</Button><Button variant="outline" onClick={onEdit} disabled={!canEdit} title={editReason}><Edit3 size={17} />Chỉnh sửa đơn</Button></div>
    <header className="record-order-heading"><h1>Đơn hàng #{String(order.ma_don_hang).slice(0, 8).toUpperCase()}</h1><p>Đặt lúc {date}</p></header>
    <div className="record-order-cards">
      <Card><CardHeader><CardTitle><ShoppingBag size={18} />Thông tin đơn hàng</CardTitle><CardDescription>Thông tin xử lý và phục vụ</CardDescription></CardHeader><CardContent><dl className="record-facts record-facts-inline">
        {fact('Mã đơn', order.ma_don_hang)}{orderCancellationReason(order) && fact('Lý do hủy', orderCancellationReason(order))}<div><dt>Trạng thái</dt><dd><StatusBadge status={status}>{ORDER_STATUS_LABEL[status] || status}</StatusBadge></dd></div>{fact('Ngày đặt', date)}{fact('Bàn / Điểm nhận', order.ma_ban || order.dia_chi_giao_hang || 'Nhận tại quán')}
      </dl></CardContent></Card>
      <Card><CardHeader><CardTitle><User size={18} />Khách hàng</CardTitle><CardDescription>Liên hệ và địa chỉ nhận hàng</CardDescription></CardHeader><CardContent><dl className="record-facts">{fact('Họ tên', order.ten_khach_hang)}{fact('Số điện thoại', order.so_dien_thoai || order.so_dien_thoai_khach_hang)}{fact('Địa chỉ', order.dia_chi_giao_hang || 'Nhận tại quán')}{order.ghi_chu && fact('Ghi chú', order.ghi_chu)}</dl></CardContent></Card>
      <Card><CardHeader><CardTitle><CreditCard size={18} />Thanh toán</CardTitle><CardDescription>Giá trị ghi nhận của đơn hàng</CardDescription></CardHeader><CardContent><dl className="record-facts record-facts-inline">{fact('Phương thức', paymentTag(order.phuong_thuc_thanh_toan))}{order.phi_giao_hang != null && fact('Phí giao hàng', money(order.phi_giao_hang))}{order.giam_gia != null && fact('Giảm giá', money(order.giam_gia))}<div><dt>Tổng thanh toán</dt><dd className="record-price">{money(order.tong_tien)}</dd></div>{['TAI_CHO', 'MANG_DI'].includes(order.loai_don_hang) && order.ten_thu_ngan && fact('Nhân viên tạo đơn', order.ten_thu_ngan)}</dl></CardContent></Card>
    </div>
    <Card><CardHeader><CardTitle>Sản phẩm trong đơn</CardTitle><CardDescription>{items.length} dòng sản phẩm</CardDescription></CardHeader><CardContent><Table><thead><tr><th style={{ width: '45%' }}>Sản phẩm</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{items.map((line, index) => <tr key={line.id || index}><td><strong>{line.ten_san_pham || 'Sản phẩm'}</strong>{line.kich_co && <p className="record-line-note">Kích cỡ: {line.kich_co}</p>}{line.ghi_chu && <p className="record-line-note">{line.ghi_chu}</p>}</td><td>{line.so_luong}</td><td>{money(line.gia_ban)}</td><td>{money(line.thanh_tien ?? Number(line.gia_ban || 0) * Number(line.so_luong || 0))}</td></tr>)}</tbody></Table>{!items.length && <p className="record-line-note">Đơn hàng chưa có chi tiết sản phẩm trong dữ liệu đã tải.</p>}</CardContent></Card>
  </section>
}
