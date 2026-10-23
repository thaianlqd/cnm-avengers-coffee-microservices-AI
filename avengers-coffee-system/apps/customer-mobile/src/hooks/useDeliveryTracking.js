import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { subscribeShipper } from '../../../web-customer/src/lib/maps/shipperRealtime.mjs'
import { io } from 'socket.io-client'
import { useUser } from '../context/UserContext'
import { getUserId } from '../lib/customerData'
import apiClient, { getAuthToken } from '../lib/apiClient'
import { createTrackingSession } from '../lib/trackingSession'

const initial = { data: null, loading: true, refreshing: false, error: null, receivedAt: null, live: false }
export default function useDeliveryTracking(orderId, visible) {
  const { user, activeUserId } = useUser()
  const userId = getUserId(user, activeUserId)
  const [state, setState] = useState(initial)
  const sessionRef = useRef(null)
  useEffect(() => {
    if (!visible || !orderId) return
    setState(initial)
    const apiBase = apiClient.defaults.baseURL
    const socketBase = process.env.EXPO_PUBLIC_SOCKET_URL || apiBase.replace(/:\d+(?=\/|$)/, ':3005').replace(/\/$/, '')
    const session = createTrackingSession({
      orderId,
      fetchTracking: async (id, signal) => {
        const response = await apiClient.get(`/shippers/delivery/tracking/${encodeURIComponent(id)}`, { signal })
        return response?.order ? response : response?.data
      },
      connectRealtime: (data,onLocation,onState) => subscribeShipper({ realtime:data.realtime,baseUrl:socketBase,orderId:data.order.ma_don_hang,onLocation,onState }),
      connectSocket: () => io(`${socketBase}/notifications`, { transports: ['websocket'], auth: { token: getAuthToken(), userId }, reconnectionDelay: 2000, reconnectionDelayMax: 15000 }),
      onChange: next => setState({ ...next, orderId }),
    })
    sessionRef.current = session
    if (AppState.currentState === 'active' || AppState.currentState == null) session.start()
    const listener = AppState.addEventListener('change', next => {
      if (next === 'active') session.start()
      else session.stop()
    })
    return () => { listener.remove(); session.stop(); sessionRef.current = null }
  }, [orderId, visible, userId])
  return { ...(state.orderId === orderId ? state : initial), refresh: () => sessionRef.current?.refresh() }
}
