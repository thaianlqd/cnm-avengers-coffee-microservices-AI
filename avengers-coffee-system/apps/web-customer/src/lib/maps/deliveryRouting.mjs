// A fallback is measured road geometry, never a straight line disguised as a route.
export function parseRoadRoute(payload, provider) {
  const path = provider === 'vietmap' ? payload?.paths?.[0] : payload?.routes?.[0];
  const raw = provider === 'vietmap' ? path?.points?.coordinates : path?.geometry?.coordinates;
  const coordinates = (raw || []).filter(p => Array.isArray(p) && p.length >= 2 &&
    Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)
    .map(([longitude, latitude]) => ({ latitude, longitude }));
  const distance = path?.distance, seconds = provider === 'vietmap' ? path?.time / 1000 : path?.duration;
  if (coordinates.length < 2 || !Number.isFinite(distance) || distance < 0 || !Number.isFinite(seconds) || seconds < 0) throw new Error('Không có tuyến đường hợp lệ');
  return { coordinates, distanceKm: distance / 1000, durationMinutes: seconds / 60,
    provider, vehicle: provider === 'vietmap' ? 'motorcycle' : 'driving', approximate: provider !== 'vietmap' };
}
export async function fetchRoadRoute(points, { key, signal, fetcher = fetch, timeoutMs = 7000 } = {}) {
  if (points.length < 2 || points.some(p => !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180)) throw new Error('Thiếu tọa độ tuyến đường');
  const request = async (url, provider) => {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    if (signal?.aborted) throw new Error('Route cancelled');
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, timeoutMs);
    try {
      const response = await fetcher(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Route provider unavailable');
      return parseRoadRoute(await response.json(), provider);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  };
  if (key) {
    const params = new URLSearchParams({ 'api-version': '1.1', apikey: key, vehicle: 'motorcycle', points_encoded: 'false' });
    points.forEach(p => params.append('point', `${p.latitude},${p.longitude}`));
    try { return await request(`https://maps.vietmap.vn/api/route?${params}`, 'vietmap'); }
    catch (error) { if (signal?.aborted) throw error; }
  }
  const locations = points.map(p => `${p.longitude},${p.latitude}`).join(';');
  return request(`https://router.project-osrm.org/route/v1/driving/${locations}?overview=full&geometries=geojson&steps=false`, 'osrm');
}
