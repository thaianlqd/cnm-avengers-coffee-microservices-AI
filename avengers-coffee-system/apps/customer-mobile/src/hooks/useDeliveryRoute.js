import { useQuery } from '@tanstack/react-query'
import { coordinate } from '../lib/trackingSession'
import { fetchRoadRoute } from '../../../web-customer/src/lib/maps/deliveryRouting.mjs'
import { routePoints } from '../lib/deliveryRoute.mjs'
export default function useDeliveryRoute(delivery) {
  const points = routePoints(delivery, coordinate), key = process.env.EXPO_PUBLIC_VIETMAP_API_KEY
  const query = useQuery({
    // Reuse road geometry until the driver moves into a different ~100m cell.
    queryKey: ['delivery-route', delivery?.order?.ma_don_hang, points.map(p => [p.latitude.toFixed(3), p.longitude.toFixed(3)]).flat().join(',')],
    enabled: points.length >= 2, staleTime: 30000, retry: 1,
    queryFn: async ({ signal }) => {
      return fetchRoadRoute(points, { key, signal })
    },
  })
  return { ...query, configured: Boolean(key), possible: points.length >= 2 }
}
