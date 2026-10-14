import { useQuery } from '@tanstack/react-query'
import { coordinate } from '../lib/trackingSession'
import { routePoints, parseRoute } from '../lib/deliveryRoute.mjs'
export default function useDeliveryRoute(delivery) {
  const points = routePoints(delivery, coordinate), key = process.env.EXPO_PUBLIC_VIETMAP_API_KEY
  const query = useQuery({
    // Reuse road geometry until the driver moves into a different ~100m cell.
    queryKey: ['delivery-route', delivery?.order?.ma_don_hang, points.map(p => [p.latitude.toFixed(3), p.longitude.toFixed(3)]).flat().join(',')],
    enabled: Boolean(key && points.length >= 2), staleTime: 30000, retry: 1,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ 'api-version': '1.1', apikey: key, vehicle: 'motorcycle', points_encoded: 'false' })
      points.forEach(p => params.append('point', `${p.latitude},${p.longitude}`))
      const response = await fetch(`https://maps.vietmap.vn/api/route?${params}`, { signal })
      if (!response.ok) throw new Error('Chưa tải được tuyến đường')
      return parseRoute(await response.json())
    },
  })
  return { ...query, configured: Boolean(key), possible: points.length >= 2 }
}
