export function isAcceptedDelivery(status) {
  return ['CONFIRMED', 'PICKING_UP', 'IN_TRANSIT', 'DELIVERED'].includes(status)
}

// Reservations are not acceptance. The driver must confirm through their own authenticated endpoint.
export function deliveryActionPath(shipperId, delivery, action) {
  if (action === 'accept') {
    if (delivery.status !== 'PENDING' || !delivery.ma_don_hang) throw new Error('Đơn không còn chờ nhận. Vui lòng tải lại.')
    return `/shippers/${shipperId}/accept/${delivery.ma_don_hang}`
  }
  if (delivery.status === 'PENDING') throw new Error('Hãy nhận đơn trước khi đi lấy món.')
  return `/shippers/${shipperId}/deliveries/${delivery.id}/${action}`
}
