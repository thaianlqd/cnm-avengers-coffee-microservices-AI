export const MAX_DELIVERY_DISTANCE_KM = 5;

export function deliveryRegion(value: unknown): string {
  const text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/ho chi minh|\bhcm\b|\bsai gon\b/.test(text)) return 'Hồ Chí Minh';
  if (/ha noi|\bhanoi\b/.test(text)) return 'Hà Nội';
  if (/da nang|\bdanang\b/.test(text)) return 'Đà Nẵng';
  return '';
}

export function deliveryDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLon = radians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function validCoordinates(lat: unknown, lon: unknown): lat is number {
  return typeof lat === 'number' && typeof lon === 'number'
    && Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}
