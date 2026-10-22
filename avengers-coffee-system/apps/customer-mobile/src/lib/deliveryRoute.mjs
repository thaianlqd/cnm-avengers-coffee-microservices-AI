export function routePoints(delivery, coordinate) {
  const store = coordinate(delivery?.tracking?.store_location), destination = coordinate(delivery?.tracking?.destination_location), driver = coordinate(delivery?.shipper_location)
  const pickedUp = Boolean(delivery?.shipper_delivery?.picked_up_at) || ['IN_TRANSIT', 'DELIVERED'].includes(delivery?.shipper_delivery?.status)
  const terminal = ['HOAN_THANH', 'DA_HUY'].includes(delivery?.order?.trang_thai_don_hang)
  const points = terminal ? [store, destination] : pickedUp ? [driver || store, destination] : [driver, store, destination]
  return points.filter(Boolean).filter((p, i, all) => !i || p.latitude !== all[i-1].latitude || p.longitude !== all[i-1].longitude)
}
export { parseMeasuredRoute as parseRoute } from '../../../web-customer/src/components/map/deliveryMapPresentation.js'
