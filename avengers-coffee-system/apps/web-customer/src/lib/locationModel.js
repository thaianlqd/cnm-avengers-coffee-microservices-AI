export const DEFAULT_MAP_CENTER = [10.7769, 106.7009];

export function decodeHtmlEntities(value) {
  if (!value) return '';
  return String(value)
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'");
}

export function normalizeLocationText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function coordinates(value) {
  const lat = value?.lat ?? value?.latitude ?? value?.vi_do;
  const lng = value?.lng ?? value?.longitude ?? value?.kinh_do;
  if (lat == null || lng == null || String(lat).trim() === '' || String(lng).trim() === '') return null;
  if (typeof lat === 'boolean' || typeof lng === 'boolean') return null;
  const latitude = Number(lat), longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { lat: latitude, lng: longitude } : null;
}

export function normalizeCityName(value) {
  const original = String(value || '').trim();
  const key = normalizeLocationText(original);
  if (/ho chi minh|tp hcm|^hcm$|sai gon|saigon/.test(key)) return 'Hồ Chí Minh';
  if (/ha noi|hanoi|^hn$/.test(key)) return 'Hà Nội';
  if (/da nang/.test(key)) return 'Đà Nẵng';
  return original.replace(/^(Thành phố|Tỉnh|TP\.?)\s+/i, '').trim();
}

export function branchLocation(branch) {
  const rawAddress = decodeHtmlEntities(branch?.address || branch?.dia_chi || '').trim();
  const parts = rawAddress.split(',').map(s => s.trim()).filter(Boolean);
  const city = normalizeCityName(branch?.city || branch?.thanh_pho || branch?.tinh_thanh ||
    parts.filter(s => !/^(Việt Nam|Vietnam|\d{5,6})$/i.test(s)).at(-1));
  let ward = branch?.ward || branch?.phuong_xa || parts.find(s => /^(Phường|Xã|Thị trấn|P\.|X\.)\s*/i.test(s)) || '';
  let district = branch?.district || branch?.quan_huyen || parts.find(s => /^(Quận|Huyện|Thị xã|TP\.?|Thành phố|Q\.|H\.)\s*/i.test(s)) || '';

  if (!ward && parts.length >= 3) {
    const candidate = parts[parts.length - 2];
    if (candidate && !/^(Quận|Huyện|Thị xã|TP\.?|Thành phố|Q\.|H\.)\s*/i.test(candidate)) {
      ward = candidate;
    }
  }

  const areas = [...new Set([ward, district].filter(Boolean))];
  return { city, ward, district, areas };
}

export function branchFilterOptions(branches, city = '') {
  const cities = [...new Set(branches.map(branch => branchLocation(branch).city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  
  const relevantBranches = city && city !== 'ALL'
    ? branches.filter(branch => branchLocation(branch).city === city)
    : branches;

  const wards = [...new Set(relevantBranches.map(branch => branchLocation(branch).ward).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));
  const areas = [...new Set(relevantBranches.flatMap(branch => branchLocation(branch).areas))].sort((a, b) => a.localeCompare(b, 'vi'));

  return { cities, wards, areas };
}

export function filterBranches(branches, { city = '', ward = '', area = '', query = '' } = {}) {
  const search = normalizeLocationText(query);
  return branches.filter(branch => {
    const location = branchLocation(branch);
    if (city && city !== 'ALL' && location.city !== city) return false;
    if (ward && location.ward !== ward) return false;
    if (area && !location.areas.includes(area)) return false;
    return !search || normalizeLocationText([
      branch.name, branch.ten_chi_nhanh, branch.ten_co_so, branch.address, branch.dia_chi,
      branch.ma_chi_nhanh, location.city, location.ward, location.district, ...location.areas,
    ].filter(Boolean).join(' ')).includes(search);
  });
}

export function buildStructuredAddress(value = {}) {
  const street = String(value.street || value.so_nha_ten_duong || value.title || '').trim();
  const ward = String(value.ward || value.phuong_xa || '').trim();
  const district = String(value.district || value.quan_huyen || '').trim();
  const city = String(value.city || value.thanh_pho || '').trim();
  const point = coordinates(value);
  return {
    street, ward, district, city,
    fullAddress: [...new Set([street, ward, district, city].filter(Boolean))].join(', '),
    latitude: point?.lat ?? null, longitude: point?.lng ?? null,
    provider: String(value.provider || value.coordinate_source || ''),
    placeId: String(value.placeId || value.place_id || value.id || ''),
  };
}

export function branchDisplayName(value) {
  const decoded = decodeHtmlEntities(value);
  const name = String(decoded || '').trim().replace(/^(?:Avengers Coffee|Highlands Coffee|Highlands|Avengers)\s*[-–—:]?\s*/i, '');
  return name ? `Avengers Coffee - ${name}` : 'Avengers Coffee';
}
