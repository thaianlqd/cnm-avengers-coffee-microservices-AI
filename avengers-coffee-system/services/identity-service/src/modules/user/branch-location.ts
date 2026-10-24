import { BadRequestException } from '@nestjs/common';

export type BranchCoordinatePayload = { vi_do?: number | null; kinh_do?: number | null };
export function branchCoordinates(payload: BranchCoordinatePayload) {
  if (payload.vi_do === undefined && payload.kinh_do === undefined) return undefined;
  if (typeof payload.vi_do !== 'number' || typeof payload.kinh_do !== 'number' ||
      !Number.isFinite(payload.vi_do) || !Number.isFinite(payload.kinh_do) ||
      Math.abs(payload.vi_do) > 90 || Math.abs(payload.kinh_do) > 180) {
    throw new BadRequestException('Vui lòng chọn địa chỉ trên bản đồ có đủ vĩ độ và kinh độ hợp lệ.');
  }
  return { vi_do: payload.vi_do, kinh_do: payload.kinh_do };
}
const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();
const locality = (value: unknown) => normalize(value).replace(/^(thanh pho|tinh|phuong|xa|thi tran|tp)\s+/, '');
export type BranchPlace = { id: string; title: string; address: string; vi_do: number; kinh_do: number; provider: string; city: string; ward: string };
export function inBranchArea(place: BranchPlace, city: string, ward: string) {
  return !!place.city && !!place.ward && locality(place.city) === locality(city) && locality(place.ward) === locality(ward) &&
    Number.isFinite(place.vi_do) && Number.isFinite(place.kinh_do) && Math.abs(place.vi_do) <= 90 && Math.abs(place.kinh_do) <= 180;
}

/** Server-side provider access keeps the Vietmap key off the browser. No centroid fallback. */
export async function searchBranchAddresses(query: string, city: string, ward: string,
  fetcher: typeof fetch = fetch, apiKey = process.env.VIETMAP_API_KEY || ''): Promise<BranchPlace[]> {
  if (query.trim().length < 3 || !city.trim() || !ward.trim()) return [];
  if (query.length > 200 || city.length > 100 || ward.length > 100) throw new BadRequestException('Địa chỉ tìm kiếm quá dài.');
  const get = async (url: string) => {
    const response = await fetcher(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Không kết nối được dịch vụ bản đồ. Vui lòng thử lại.');
    return response.json();
  };
  const text = `${query.trim()}, ${ward.trim()}, ${city.trim()}`;
  if (apiKey) {
    const url = new URL('https://maps.vietmap.vn/api/autocomplete/v4');
    url.search = new URLSearchParams({ apikey: apiKey, text, display_type: '1' }).toString();
    const results = await get(url.href);
    if (!Array.isArray(results)) throw new Error('Dịch vụ bản đồ trả về dữ liệu không hợp lệ.');
    const places = await Promise.all(results.slice(0, 6).map(async item => {
      if (!item.ref_id) return null;
      const details = new URL('https://maps.vietmap.vn/api/place/v4');
      details.search = new URLSearchParams({ apikey: apiKey, refid: item.ref_id }).toString();
      const place = await get(details.href);
      if (place.lat == null || place.lng == null || place.lat === '' || place.lng === '') return null;
      const address = String(place.display || item.display || [place.name || item.name, place.address || item.address].filter(Boolean).join(', '));
      const boundaries = item.boundaries || [];
      const placeCity = place.city || boundaries.find(b => b.type === 0)?.full_name;
      const placeWard = place.ward || boundaries.find(b => b.type === 2)?.full_name;
      if (!placeCity || !placeWard) return null;
      return { id: String(item.ref_id), title: String(place.name || place.address || item.name || ''), address, city: placeCity, ward: placeWard,
        vi_do: Number(place.lat), kinh_do: Number(place.lng), provider: 'vietmap' };
    }));
    return places.filter((place): place is BranchPlace => !!place && inBranchArea(place, city, ward));
  }
  // Photon supports search-as-you-type. The public Nominatim service does not.
  const url = new URL('https://photon.komoot.io/api/');
  url.search = new URLSearchParams({ q: text, limit: '8' }).toString();
  const response = await get(url.href);
  if (!Array.isArray(response.features)) throw new Error('Dịch vụ bản đồ trả về dữ liệu không hợp lệ.');
  const places: BranchPlace[] = response.features.filter(feature => String(feature.properties?.countrycode || '').toUpperCase() === 'VN').map(feature => {
    const p = feature.properties || {}, point = feature.geometry?.coordinates || [];
    const street = [p.housenumber, p.street].filter(Boolean).join(' ');
    const title = String(p.name || street || '');
    const address = [...new Set([title, street, p.locality, p.district, p.city, p.county, p.state, p.country].filter(Boolean))].join(', ');
    return { id: `${p.osm_type}:${p.osm_id}`, title, address, vi_do: point[1], kinh_do: point[0], provider: 'photon', city: p.state || p.city, ward: p.locality || p.district }; 
  });
  return places.filter(place => place.title && inBranchArea(place, city, ward)).slice(0, 6);
}
