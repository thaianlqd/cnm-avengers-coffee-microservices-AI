import { coordinates } from './locationModel';
const key = import.meta.env.VITE_VIETMAP_API_KEY;
async function request(path, params, signal) {
  if (!key) return null;
  const timeout = AbortSignal.timeout(6000);
  const response = await fetch(`https://maps.vietmap.vn/api/${path}?${new URLSearchParams({ apikey:key, ...params })}`, {
    signal: signal ? AbortSignal.any([signal,timeout]) : timeout,
  });
  if (!response.ok) throw new Error('Chưa tải được địa chỉ từ VietMap.');
  return response.json();
}
export const placesConfigured = Boolean(key);
export async function autocompletePlaces(text, { signal } = {}) {
  if (text.trim().length < 3) return [];
  const items = await request('autocomplete/v3', { text:text.trim() }, signal);
  return (Array.isArray(items) ? items : []).filter(item => item.ref_id).slice(0,6)
    .map(item => ({ type:'place', value:item.ref_id, text:item.name || item.display, subtext:item.address || item.display }));
}
export async function resolveSuggestedPlace(refid, { signal } = {}) {
  const place = await request('place/v3', { refid }, signal);
  const point = coordinates(place);
  if (!point) throw new Error('Địa điểm chưa có tọa độ hợp lệ.');
  return { ...point, label:place.display || place.name || place.address };
}
