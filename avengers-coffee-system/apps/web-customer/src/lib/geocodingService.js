import { coordinates, normalizeLocationText } from './locationModel';
/**
 * Geocoding & Distance Calculation Service
 * Supports real-time address suggestion, geocoding, reverse-geocoding, and distance calculation.
 */

// Bán kính phục vụ giao hàng mặc định (km)
export const MAX_DELIVERY_RADIUS_KM = 5.0;

// Toạ độ mặc định các Quận/Huyện/Thành phố lớn tại Việt Nam (Fallback khi mất kết nối Geocoding)
// Toạ độ chuẩn các Quận/Huyện/Thành phố tại Việt Nam (Dùng phân giải vị trí theo phân cấp hành chính)
export const DISTRICT_COORDINATES = {
  // TP. Hồ Chí Minh (24 quận huyện)
  'quận 12': { lat: 10.8671, lng: 106.6413, city: 'Hồ Chí Minh' },
  'quận 11': { lat: 10.7628, lng: 106.6455, city: 'Hồ Chí Minh' },
  'quận 10': { lat: 10.7743, lng: 106.6675, city: 'Hồ Chí Minh' },
  'quận 9': { lat: 10.8277, lng: 106.8123, city: 'Hồ Chí Minh' },
  'quận 8': { lat: 10.7249, lng: 106.6346, city: 'Hồ Chí Minh' },
  'quận 7': { lat: 10.7340, lng: 106.7216, city: 'Hồ Chí Minh' },
  'quận 6': { lat: 10.7481, lng: 106.6353, city: 'Hồ Chí Minh' },
  'quận 5': { lat: 10.7540, lng: 106.6631, city: 'Hồ Chí Minh' },
  'quận 4': { lat: 10.7588, lng: 106.7012, city: 'Hồ Chí Minh' },
  'quận 3': { lat: 10.7834, lng: 106.6802, city: 'Hồ Chí Minh' },
  'quận 2': { lat: 10.7876, lng: 106.7416, city: 'Hồ Chí Minh' },
  'quận 1': { lat: 10.7756, lng: 106.7019, city: 'Hồ Chí Minh' },
  'gò vấp': { lat: 10.8387, lng: 106.6661, city: 'Hồ Chí Minh' },
  'bình thạnh': { lat: 10.8106, lng: 106.7093, city: 'Hồ Chí Minh' },
  'tân bình': { lat: 10.8015, lng: 106.6526, city: 'Hồ Chí Minh' },
  'tân phú': { lat: 10.7901, lng: 106.6262, city: 'Hồ Chí Minh' },
  'phú nhuận': { lat: 10.7991, lng: 106.6781, city: 'Hồ Chí Minh' },
  'bình tân': { lat: 10.7653, lng: 106.6083, city: 'Hồ Chí Minh' },
  'thủ đức': { lat: 10.8494, lng: 106.7537, city: 'Hồ Chí Minh' },
  'hóc môn': { lat: 10.8841, lng: 106.5912, city: 'Hồ Chí Minh' },
  'bình chánh': { lat: 10.6874, lng: 106.5938, city: 'Hồ Chí Minh' },
  'nhà bè': { lat: 10.6952, lng: 106.7323, city: 'Hồ Chí Minh' },
  'củ chi': { lat: 10.9731, lng: 106.4939, city: 'Hồ Chí Minh' },
  'cần giờ': { lat: 10.4114, lng: 106.9547, city: 'Hồ Chí Minh' },

  // Hà Nội
  'ba đình': { lat: 21.0341, lng: 105.8239, city: 'Hà Nội' },
  'hoàn kiếm': { lat: 21.0313, lng: 105.8526, city: 'Hà Nội' },
  'tây hồ': { lat: 21.0718, lng: 105.8228, city: 'Hà Nội' },
  'long biên': { lat: 21.0365, lng: 105.8929, city: 'Hà Nội' },
  'cầu giấy': { lat: 21.0313, lng: 105.7928, city: 'Hà Nội' },
  'đống đa': { lat: 21.0181, lng: 105.8275, city: 'Hà Nội' },
  'hai bà trưng': { lat: 21.0063, lng: 105.8524, city: 'Hà Nội' },
  'hoàng mai': { lat: 20.9764, lng: 105.8452, city: 'Hà Nội' },
  'thanh xuân': { lat: 20.9937, lng: 105.8118, city: 'Hà Nội' },
  'nam từ liêm': { lat: 21.0189, lng: 105.7621, city: 'Hà Nội' },
  'bắc từ liêm': { lat: 21.0664, lng: 105.7634, city: 'Hà Nội' },
  'hà đông': { lat: 20.9723, lng: 105.7765, city: 'Hà Nội' },

  // Đà Nẵng
  'hải châu': { lat: 16.0680, lng: 108.2208, city: 'Đà Nẵng' },
  'thanh khê': { lat: 16.0620, lng: 108.1873, city: 'Đà Nẵng' },
  'sơn trà': { lat: 16.0820, lng: 108.2433, city: 'Đà Nẵng' },
  'ngũ hành sơn': { lat: 16.0026, lng: 108.2562, city: 'Đà Nẵng' },
  'liên chiểu': { lat: 16.0963, lng: 108.1472, city: 'Đà Nẵng' },
  'cẩm lệ': { lat: 16.0177, lng: 108.1963, city: 'Đà Nẵng' },

  // Bình Dương
  'thủ dầu một': { lat: 10.9804, lng: 106.6519, city: 'Bình Dương' },
  'dĩ an': { lat: 10.9068, lng: 106.7718, city: 'Bình Dương' },
  'thuận an': { lat: 10.9168, lng: 106.6961, city: 'Bình Dương' },
};

export const KNOWN_VIETNAM_COORDINATES = {
  ...DISTRICT_COORDINATES,
  'hồ chí minh': { lat: 10.7769, lng: 106.7009, city: 'Hồ Chí Minh' },
  'hà nội': { lat: 21.0285, lng: 105.8542, city: 'Hà Nội' },
  'đà nẵng': { lat: 16.0544, lng: 108.2022, city: 'Đà Nẵng' },
  'bình dương': { lat: 10.9804, lng: 106.6519, city: 'Bình Dương' },
};

/**
 * Tính khoảng cách (km) giữa 2 toạ độ GPS bằng công thức Haversine
 */
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const numLat1 = Number(lat1);
  const numLon1 = Number(lon1);
  const numLat2 = Number(lat2);
  const numLon2 = Number(lon2);
  if (isNaN(numLat1) || isNaN(numLon1) || isNaN(numLat2) || isNaN(numLon2)) return null;

  const R = 6371; // Bán kính Trái Đất (km)
  const dLat = (numLat2 - numLat1) * (Math.PI / 180);
  const dLon = (numLon2 - numLon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(numLat1 * (Math.PI / 180)) *
      Math.cos(numLat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 10) / 10; // Làm tròn 1 chữ số thập phân (vd: 2.3 km)
}

/**
 * Phân tích địa chỉ từ kết quả Geocoding OpenStreetMap
 */
function parseNominatimAddress(item) {
  const addr = item.address || {};
  const lat = Number(item.lat);
  const lng = Number(item.lon);
  const displayName = item.display_name || '';
  const rawParts = displayName.split(',').map((p) => p.trim()).filter(Boolean);

  // 1. Tên địa điểm / số nhà / tên đường
  const streetNumber = addr.house_number || '';
  const road = addr.road || addr.street || addr.pedestrian || addr.footway || addr.highway || '';
  let street = [streetNumber, road].filter(Boolean).join(' ') || item.name || '';

  if (!street && rawParts.length > 0) {
    street = rawParts[0];
  }

  // 2. Phường / Xã / Thị trấn
  let ward =
    addr.quarter ||
    addr.suburb ||
    addr.neighbourhood ||
    addr.residential ||
    addr.village ||
    addr.town ||
    addr.hamlet ||
    '';

  if (!ward) {
    for (const part of rawParts) {
      if (/^(Phường|Xã|Thị trấn|P\.|X\.)\s*/i.test(part)) {
        ward = part;
        break;
      }
    }
  }

  // 3. Quận / Huyện / Thị xã
  let district = addr.city_district || addr.district || addr.county || addr.borough || '';
  if (!district) {
    for (const part of rawParts) {
      if (/^(Quận|Huyện|Thị xã|TP\.|Thành phố)\s*/i.test(part) && !/Hồ Chí Minh|Hà Nội|Đà Nẵng|Cần Thơ|Hải Phòng/i.test(part)) {
        district = part;
        break;
      }
    }
  }

  // 4. Tỉnh / Thành phố
  let city =
    addr.city ||
    addr.state ||
    addr.province ||
    addr.region ||
    addr.municipality ||
    '';

  if (!city) {
    for (let i = rawParts.length - 1; i >= 0; i--) {
      const part = rawParts[i];
      if (/Hồ Chí Minh|Hà Nội|Đà Nẵng|Cần Thơ|Hải Phòng|Bình Dương|Đồng Nai|Khánh Hòa|Lâm Đồng|Quảng Nam|Huế/i.test(part)) {
        city = part;
        break;
      }
    }
  }

  // Chuẩn hóa Tỉnh/Thành phố
  city = city.replace(/^(Thành phố|Tỉnh)\s+/i, '').trim();
  if (city.toLowerCase().includes('hồ chí minh') || city.toLowerCase().includes('hcm') || city.toLowerCase().includes('saigon')) {
    city = 'Hồ Chí Minh';
  } else if (city.toLowerCase().includes('hà nội')) {
    city = 'Hà Nội';
  } else if (city.toLowerCase().includes('đà nẵng')) {
    city = 'Đà Nẵng';
  }

  // Tiêu đề ngắn gọn
  let title = item.name || street || road || ward || 'Địa chỉ bản đồ';
  if (streetNumber && road && !title.includes(streetNumber)) {
    title = `${streetNumber} ${road}`;
  }

  // Phụ đề mô tả
  const subtitleParts = [ward, district, city].filter(Boolean);
  const subtitle = subtitleParts.join(', ') || displayName;

  return {
    id: item.place_id || `${lat}_${lng}`,
    title,
    subtitle,
    displayName,
    lat,
    lng,
    street: street || title,
    ward,
    district,
    city: city || 'Hồ Chí Minh',
  };
}

function normalizeCityName(cityName) {
  const c = String(cityName || '').trim();
  if (/ho chi minh|hcm|saigon|hồ chí minh/i.test(c)) return 'Hồ Chí Minh';
  if (/hanoi|hà nội/i.test(c)) return 'Hà Nội';
  if (/da nang|đà nẵng/i.test(c)) return 'Đà Nẵng';
  if (/binh duong|bình dương/i.test(c)) return 'Bình Dương';
  if (/dong nai|đồng nai/i.test(c)) return 'Đồng Nai';
  if (/can tho|cần thơ/i.test(c)) return 'Cần Thơ';
  if (/hai phong|hải phòng/i.test(c)) return 'Hải Phòng';
  return c.replace(/^(Thành phố|Tỉnh)\s+/i, '').trim();
}

function normalizeWardName(wardName) {
  let w = String(wardName || '').trim();
  if (!w) return '';
  w = w.replace(/^(Phường|Xã|Thị trấn|P\.|X\.)\s*/i, '').trim();
  return `Phường ${w}`;
}

const VIETMAP_API_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VIETMAP_API_KEY) ||
  '';

/**
 * Tìm kiếm gợi ý địa chỉ theo thời gian thực (Address Autocomplete Dropdown)
 * Sử dụng giải thuật phân tách địa chỉ và Forward Geocoding đa nguồn (Ưu tiên Vietmap API)
 */
async function geocodingFetch(url, signal) {
  const timeout = AbortSignal.timeout(6000);
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error('Address provider unavailable');
  return response.json();
}

export async function searchAddressSuggestions(query, { signal } = {}) {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  if (VIETMAP_API_KEY) {
    try {
      const data = await geocodingFetch(`https://maps.vietmap.vn/api/search/v3?apikey=${VIETMAP_API_KEY}&text=${encodeURIComponent(q)}`, signal);
      const results = await Promise.all((Array.isArray(data) ? data : []).slice(0, 6).map(async item => {
        if (!item.ref_id) return null;
        const place = await geocodingFetch(`https://maps.vietmap.vn/api/place/v3?apikey=${VIETMAP_API_KEY}&refid=${encodeURIComponent(item.ref_id)}`, signal);
        const point = coordinates(place);
        if (!point) return null;
        const boundaries = place.boundaries || item.boundaries || [];
        const boundary = pattern => boundaries.find(b => pattern.test(b.prefix || b.full_name || ''));
        const ward = boundary(/phường|xã|thị trấn/i), district = boundary(/quận|huyện|thị xã/i), city = boundary(/tỉnh|thành phố/i);
        const street = place.name || item.name || place.address || item.address || '';
        return { id: item.ref_id, placeId: item.ref_id, provider: 'vietmap', ...point,
          title: street, street, ward: ward?.full_name || ward?.name || '',
          district: district?.full_name || district?.name || '',
          city: normalizeCityName(city?.full_name || city?.name || place.city || ''),
          subtitle: place.address || item.address || '', displayName: place.display || item.display || street };
      }));
      const valid = results.filter(Boolean);
      if (valid.length) return valid;
    } catch (error) { if (signal?.aborted) throw error; }
  }
  // Keep provider addresses intact; never attach a typed house number to a street centroid.
  try {
    const data = await geocodingFetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=vn&limit=6&accept-language=vi&q=${encodeURIComponent(q)}`, signal);
    return (Array.isArray(data) ? data : []).map(item => ({ ...parseNominatimAddress(item),
      id: String(item.place_id), placeId: String(item.place_id), provider: 'nominatim',
    })).filter(item => coordinates(item));
  } catch (error) { if (signal?.aborted) throw error; return []; }
}

/**
 * Reverse Geocoding: Tọa độ GPS -> Địa chỉ cụ thể (Ưu tiên Vietmap Reverse API)
 */
export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null;

  // 1. Ưu tiên Vietmap Reverse Geocoding API
  if (VIETMAP_API_KEY) {
    try {
      const vmReverseUrl = `https://maps.vietmap.vn/api/reverse/v3?apikey=${VIETMAP_API_KEY}&lat=${lat}&lng=${lng}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(vmReverseUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const item = Array.isArray(data) ? data[0] : data;
        if (item && item.display) {
          const boundaries = Array.isArray(item.boundaries) ? item.boundaries : [];
          const wardObj = boundaries.find((b) => b.type === 2 || /phường|xã|thị trấn/i.test(b.prefix || ''));
          const districtObj = boundaries.find((b) => b.type === 1 || /quận|huyện|thị xã/i.test(b.prefix || ''));
          const cityObj = boundaries.find((b) => b.type === 0 || /thành phố|tỉnh/i.test(b.prefix || ''));

          const rawWard = wardObj?.full_name || wardObj?.name || '';
          const ward = rawWard ? normalizeWardName(rawWard) : '';
          const district = districtObj?.full_name || districtObj?.name || '';
          const city = normalizeCityName(cityObj?.full_name || cityObj?.name || '');
          const title = item.name || 'Vị trí hiện tại';
          const subtitle = item.address || [ward, district, city].filter(Boolean).join(', ');

          return {
            lat: Number(lat),
            lng: Number(lng),
            title,
            subtitle,
            displayName: item.display || `${title}, ${subtitle}`,
            street: title,
            ward,
            district,
            city,
          };
        }
      }
    } catch (vmErr) {
      console.warn('[Vietmap Reverse Error]', vmErr);
    }
  }

  // 2. Dự phòng qua OpenStreetMap Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=vi`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept-Language': 'vi-VN,vi;q=0.9',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && (data.display_name || data.address)) {
        return parseNominatimAddress(data);
      }
    }
  } catch { /* Leave unresolved locations without invented coordinates. */ }

  return {
    lat,
    lng,
    title: 'Vị trí hiện tại',
    subtitle: `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`,
    displayName: 'Vị trí hiện tại của bạn',
    street: '',
    ward: '',
    city: '',
  };
}

/**
 * Geocode trực tiếp từ chuỗi địa chỉ thành toạ độ GPS
 */
export async function geocodeAddress(fullAddress) {
  const requested = normalizeLocationText(fullAddress);
  if (!requested) return null;
  const results = await searchAddressSuggestions(fullAddress);
  return results.find(item => normalizeLocationText(item.displayName) === requested) || null;
}

/**
 * Lấy toạ độ GPS vị trí thực tế của người dùng từ trình duyệt
 */
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ GPS'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      err => {
        reject(err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}

/**
 * Tìm và giải mã toạ độ chi nhánh
 */
export function resolveBranchCoordinates(branch) {
  return coordinates(branch);
}

// Legacy tracking callers must display an unlocated address until a confirmed
// point is available, rather than sending a district centre to the shipper.
export function resolveAddressCoordinates() {
  return null;
}
