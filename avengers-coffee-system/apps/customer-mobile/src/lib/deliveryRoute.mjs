export function routePoints(delivery, coordinate) {
  const store = coordinate(delivery?.tracking?.store_location), destination = coordinate(delivery?.tracking?.destination_location), driver = coordinate(delivery?.shipper_location)
  const pickedUp = Boolean(delivery?.shipper_delivery?.picked_up_at) || ['IN_TRANSIT', 'DELIVERED'].includes(delivery?.shipper_delivery?.status)
  const terminal = ['HOAN_THANH', 'DA_HUY'].includes(delivery?.order?.trang_thai_don_hang)
  const points = terminal ? [store, destination] : pickedUp ? [driver || store, destination] : [driver, store, destination]
  return points.filter(Boolean).filter((p, i, all) => !i || p.latitude !== all[i-1].latitude || p.longitude !== all[i-1].longitude)
}
export function parseRoute(data) {
  const path = data?.paths?.[0]
  const coordinates = (path?.points?.coordinates || []).filter(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90).map(([longitude, latitude]) => ({ latitude, longitude }))
  if (coordinates.length < 2 || !Number.isFinite(path.distance) || !Number.isFinite(path.time) || path.distance < 0 || path.time < 0) throw new Error('Chưa tải được tuyến đường')
  return { coordinates, distanceKm: path.distance / 1000, durationMinutes: path.time / 60000 }
}
