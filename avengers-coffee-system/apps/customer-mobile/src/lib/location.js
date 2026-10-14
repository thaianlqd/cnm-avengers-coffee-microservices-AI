export function coordinates(value) {
  const lat = value?.latitude ?? value?.vi_do ?? value?.lat
  const lng = value?.longitude ?? value?.kinh_do ?? value?.lng ?? value?.lon
  if (lat == null || lng == null || lat === '' || lng === '') return null
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null
  if (Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180) return null
  return { latitude: Number(lat), longitude: Number(lng) }
}
export function distanceKm(a, b) {
  if (!a || !b) return null
  const rad = n => n * Math.PI / 180
  const dlat = rad(b.latitude - a.latitude), dlng = rad(b.longitude - a.longitude)
  const v = Math.sin(dlat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dlng / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v))
}
export async function lookupAddress(address) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=vn&limit=1&q=${encodeURIComponent(address)}`, { signal: controller.signal })
    if (!response.ok) throw new Error('Không thể kiểm tra vị trí địa chỉ. Vui lòng thử lại.')
    const data = await response.json()
    const position = coordinates(data[0])
    if (!position) throw new Error('Chưa tìm được địa chỉ. Nhập rõ số nhà, đường, phường và thành phố hoặc dùng GPS.')
    return position
  } finally { clearTimeout(timeout) }
}
