import { ORDER_STATUSES, ORDER_STATUS_LABEL } from '../constants'
import { fmtMoney, normalizeViText, paymentTag } from '../utils'

const STAGE_CLASS = {
  MOI_TAO: 'stage-new',
  DA_XAC_NHAN: 'stage-brewing',
  DANG_CHUAN_BI: 'stage-brewing',
  DANG_GIAO: 'stage-ready',
  HOAN_THANH: 'stage-done',
  DA_HUY: 'stage-new',
}

const TONE_CLASS = {
  MOI_TAO: 'tone-new',
  DA_XAC_NHAN: 'tone-confirmed',
  DANG_CHUAN_BI: 'tone-preparing',
  DANG_GIAO: 'tone-shipping',
  HOAN_THANH: 'tone-done',
  DA_HUY: 'tone-cancelled',
}

export function OrdersPanel({ ordersState, updatingOrderId, onUpdateStatus }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Luồng đơn hàng</h2>
        <span>Dữ liệu thật từ hệ thống</span>
      </div>
      <div className="order-list">
        {ordersState.loading ? <p>Đang tải đơn hàng...</p> : null}
        {ordersState.error ? <p className="error-text">{ordersState.error}</p> : null}
        {!ordersState.loading && !ordersState.error && !ordersState.items.length ? (
          <p>Chưa có đơn hàng để hiển thị.</p>
        ) : null}
        {ordersState.items.map((order) => (
          <article key={order.ma_don_hang} className={`order-card ${STAGE_CLASS[order.trang_thai_don_hang] || ''}`}>
            <div>
              <h3>{order.ma_don_hang.slice(0, 8).toUpperCase()}</h3>
              <p>Khách: {normalizeViText(order.ten_khach_hang) || order.ma_nguoi_dung}</p>
              <p>{normalizeViText(order.dia_chi_giao_hang) || 'Không có địa chỉ'}</p>
              <p>
                Loại đơn: {order.loai_don_hang === 'TAI_CHO' ? 'Dùng tại quầy' : order.loai_don_hang === 'MANG_DI' ? 'Mang đi' : 'Online'}
              </p>
            </div>
            <div>
              <p>{paymentTag(order.phuong_thuc_thanh_toan)}</p>
              <strong>{fmtMoney(order.tong_tien)}</strong>
              <p>
                <span className={`status-pill ${TONE_CLASS[order.trang_thai_don_hang] || 'tone-new'}`}>
                  {ORDER_STATUS_LABEL[order.trang_thai_don_hang] || order.trang_thai_don_hang}
                </span>
              </p>
              <p>Thanh toán: {order.trang_thai_thanh_toan}</p>
              <p>Thu ngân: {normalizeViText(order.ten_thu_ngan) || 'N/A'}</p>
            </div>
            <div className="status-update-box">
              <label htmlFor={`status-${order.ma_don_hang}`}>Trạng thái đơn</label>
              <select
                id={`status-${order.ma_don_hang}`}
                value={order.trang_thai_don_hang}
                onChange={(e) => onUpdateStatus(order.ma_don_hang, e.target.value)}
                disabled={updatingOrderId === order.ma_don_hang}
              >
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ORDER_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
              <span>{new Date(order.ngay_tao).toLocaleString('vi-VN')}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
