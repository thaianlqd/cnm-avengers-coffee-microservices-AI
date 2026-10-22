import { normalizeSearch } from './catalogSelection.js';

export const DELIVERY_RADIUS_KM = 5;

const regions = [
  ['Hồ Chí Minh', ['ho chi minh', 'hcm', 'sai gon', 'saigon']],
  ['Hà Nội', ['ha noi', 'hanoi']], ['Đà Nẵng', ['da nang', 'danang']],
  ...['Hải Phòng', 'Cần Thơ', 'Huế', 'Bình Dương', 'Đồng Nai', 'Bà Rịa Vũng Tàu', 'Khánh Hòa', 'Lâm Đồng', 'Quảng Ninh', 'Bắc Ninh', 'Bắc Giang', 'Hưng Yên', 'Hải Dương', 'Thái Bình', 'Ninh Bình', 'Nam Định', 'Hà Nam', 'Thanh Hóa', 'Nghệ An', 'Hà Tĩnh', 'Quảng Bình', 'Quảng Trị', 'Quảng Nam', 'Quảng Ngãi', 'Bình Định', 'Phú Yên', 'Ninh Thuận', 'Bình Thuận', 'Đắk Lắk', 'Đắk Nông', 'Gia Lai', 'Kon Tum', 'Bình Phước', 'Tây Ninh', 'Long An', 'Tiền Giang', 'Bến Tre', 'Trà Vinh', 'Vĩnh Long', 'Đồng Tháp', 'An Giang', 'Kiên Giang', 'Hậu Giang', 'Sóc Trăng', 'Bạc Liêu', 'Cà Mau', 'Phú Thọ', 'Vĩnh Phúc', 'Hòa Bình', 'Thái Nguyên', 'Bắc Kạn', 'Tuyên Quang', 'Hà Giang', 'Lào Cai', 'Yên Bái', 'Sơn La', 'Điện Biên', 'Lai Châu', 'Lạng Sơn', 'Cao Bằng'].map(name => [name, [normalizeSearch(name)]]),
];

export function regionOf(value) {
  const text = ` ${normalizeSearch(value).replace(/[^a-z0-9]+/g, ' ')} `;
  return regions.find(([, aliases]) => aliases.some(alias => text.includes(` ${alias} `)))?.[0] || '';
}

export function validCoordinates(lat, lng) {
  if ([lat, lng].some(value => value == null || typeof value === 'boolean' || String(value).trim() === '')) return false;
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
}

export function distanceKm(aLat, aLon, bLat, bLon) {
  if (!validCoordinates(aLat, aLon) || !validCoordinates(bLat, bLon)) return null;
  const [lat1, lon1, lat2, lon2] = [aLat, aLon, bLat, bLon].map(value => Number(value) * Math.PI / 180);
  const a = Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}

export function deliveryRegionWarning(addressCity, branch, coordinates) {
  if (!branch) return '';
  const destinationRegion = regionOf(addressCity);
  const branchRegion = regionOf(branch.thanh_pho || branch.dia_chi);
  if (destinationRegion && branchRegion && destinationRegion !== branchRegion) {
    return `Địa chỉ nhận ở ${destinationRegion} nhưng chi nhánh đã chọn ở ${branchRegion}. Vui lòng chọn chi nhánh gần nơi nhận hàng.`;
  }
  const distance = distanceKm(coordinates?.lat, coordinates?.lng, branch.vi_do, branch.kinh_do);
  if (distance != null && distance > DELIVERY_RADIUS_KM) {
    return `Chi nhánh đã chọn cách địa chỉ nhận khoảng ${distance.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km, vượt phạm vi giao hàng ${DELIVERY_RADIUS_KM} km. Vui lòng chọn chi nhánh gần hơn hoặc đổi địa chỉ nhận.`;
  }
  return '';
}

// Current device location is advisory: the recipient may be in another city.
export function customerLocationWarning(customerCoordinates, branch) {
  const distance = distanceKm(customerCoordinates?.lat, customerCoordinates?.lng, branch?.vi_do, branch?.kinh_do);
  return distance != null && distance > 40
    ? `Chi nhánh này cách vị trí hiện tại của bạn khoảng ${Math.round(distance).toLocaleString('vi-VN')} km. Hãy kiểm tra địa chỉ người nhận; bạn vẫn có thể đặt hộ người ở khu vực này.`
    : '';
}
