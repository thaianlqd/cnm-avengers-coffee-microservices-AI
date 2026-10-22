export const MAP_COLORS = { store: '#00a77d', destination: '#ed3f74', driver: '#7945ff' };
export const JOURNEY_STAGES = ['Nhận đơn', 'Đến quán', 'Lấy món', 'Hoàn tất'];
export function journeyWaypoints({ store, destination, driver, status, otherDestinations = [] }) {
  const valid = point => point && point.latitude != null && point.longitude != null && Number.isFinite(Number(point.latitude)) && Number.isFinite(Number(point.longitude)) && Math.abs(Number(point.latitude)) <= 90 && Math.abs(Number(point.longitude)) <= 180;
  const stops = otherDestinations.filter(valid);
  const terminal = ['DELIVERED','HOAN_THANH','CANCELLED','FAILED','DA_HUY'].includes(status);
  const points = terminal ? [store,destination] : status === 'IN_TRANSIT' ? [driver || store,...stops,destination] : [driver,store,...stops,destination];
  return points.filter(valid).map(point => ({ latitude:Number(point.latitude),longitude:Number(point.longitude) })).filter((point,index,all) => !index || point.latitude !== all[index-1].latitude || point.longitude !== all[index-1].longitude);
}
export function journeyProgress(status, hasDriver = false) {
  if (['CANCELLED', 'FAILED', 'DA_HUY'].includes(status)) return { step: -1, label: 'Hành trình đã kết thúc', closed: true };
  if (['DELIVERED', 'HOAN_THANH'].includes(status)) return { step: 3, label: 'Đã giao thành công' };
  if (status === 'IN_TRANSIT') return { step: 2, label: 'Đang giao đến khách hàng' };
  if (status === 'PICKING_UP') return { step: 1, label: 'Tài xế đang lấy món tại quán' };
  if (status === 'CONFIRMED') return { step: 0, label: 'Tài xế đã nhận đơn' };
  return { step: -1, label: hasDriver ? 'Đang cập nhật hành trình' : 'Đang chờ tài xế nhận đơn' };
}
// Geometry and icons are shared, while popup labels are bound with DOM textContent.
export function mapPinHtml(kind) {
  const color = MAP_COLORS[kind] || MAP_COLORS.driver;
  const glyph = kind === 'store' ? '<path d="M12 15h14v5c0 5-14 5-14 0zM26 16h3a3 3 0 010 6h-3M11 27h18M16 9v3m5-4v4"/>' : kind === 'destination' ? '<path d="M11 18l10-8 10 8M14 17v11h14V17M19 28v-7h5v7"/>' : '<circle cx="12" cy="26" r="5"/><circle cx="32" cy="26" r="5"/><path d="M15 26h5l5-10h7l-5-6h-4m-12 7h8l5 6M8 17l-2-2m22 2l4 9"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="54" viewBox="0 0 44 54" style="filter:drop-shadow(0 3px 4px #23334d40)"><path d="M22 2C11 2 3 10 3 21c0 13 19 30 19 30s19-17 19-30C41 10 33 2 22 2z" fill="${color}" stroke="white" stroke-width="3"/><g fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
}
export function measuredRouteSummary(route) {
  const distance = route?.distanceKm ?? route?.distance, duration = route?.durationMinutes ?? route?.duration;
  return Number.isFinite(distance) && distance >= 0 && Number.isFinite(duration) && duration >= 0
    ? { distance: `${distance.toFixed(1)} km`, duration: duration < 1 ? '< 1 phút' : `~${Math.ceil(duration)} phút` } : null;
}
export function parseMeasuredRoute(data) {
  const path = data?.paths?.[0];
  const coordinates = (path?.points?.coordinates || []).filter(point => Array.isArray(point) && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90).map(([longitude,latitude]) => ({latitude,longitude}));
  if (coordinates.length < 2 || !Number.isFinite(path?.distance) || !Number.isFinite(path?.time) || path.distance < 0 || path.time < 0) throw new Error('Chưa tải được tuyến đường');
  return { coordinates,distanceKm:path.distance/1000,durationMinutes:path.time/60000 };
}
