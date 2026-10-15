export function routePoint(latitude, longitude) {
  if (latitude == null || longitude == null || String(latitude).trim() === '' || String(longitude).trim() === '') return null
  const lat = Number(latitude), lng = Number(longitude)
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0) ? [lat,lng] : null
}
export function orderRoutePoints(order) {
  return {
    store: routePoint(order.pickup_latitude ?? order.tracking?.store_latitude, order.pickup_longitude ?? order.tracking?.store_longitude),
    destination: routePoint(order.delivery_latitude ?? order.tracking?.destination_latitude, order.delivery_longitude ?? order.tracking?.destination_longitude),
  }
}
