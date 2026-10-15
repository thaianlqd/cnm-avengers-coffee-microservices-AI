// A single order-scoped session. All timers, requests and sockets belong to it.
export function coordinate(value) {
  const validNumber = input => typeof input === 'number' || (typeof input === 'string' && input.trim() !== '')
  if (!validNumber(value?.latitude) || !validNumber(value?.longitude)) return null
  const latitude = Number(value.latitude), longitude = Number(value.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  return { latitude, longitude }
}
export function isTerminal(data) {
  return ['HOAN_THANH', 'DA_HUY'].includes(data?.order?.trang_thai_don_hang)
}
export function createTrackingSession({ orderId, fetchTracking, connectSocket, onChange, clock = { now: Date.now, setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay), clearTimeout: timer => globalThis.clearTimeout(timer) } }) {
  let active = false, generation = 0, data = null, socket = null, timer = null, controller = null, busy = false
  let connected = false, subscribed = false, lastGps = 0, lastGpsTimestamp = 0, lastRefresh = 0, receivedAt = null, error = null
  const publish = () => onChange({ data, loading: busy && !data, refreshing: busy && Boolean(data), error, receivedAt, live: connected && subscribed && Boolean(lastGps) && clock.now() - lastGps < 45000 })
  const clearTimer = () => { if (timer != null) clock.clearTimeout(timer); timer = null }
  const disposeSocket = () => { socket?.removeAllListeners?.(); socket?.disconnect(); socket = null; connected = false; subscribed = false }
  const schedule = () => {
    clearTimer()
    if (!active || isTerminal(data)) return
    timer = clock.setTimeout(async () => {
      const fresh = connected && subscribed && lastGps && clock.now() - lastGps < 45000
      // Fresh GPS avoids GPS polling, but periodically reconciles order status.
      if (!fresh || clock.now() - lastRefresh >= 60000) await refresh()
      else { publish(); schedule() }
    }, 30000)
  }
  const attachSocket = () => {
    if (socket || !active || !data || isTerminal(data)) return
    const current = generation
    const connection = connectSocket()
    socket = connection
    const valid = () => active && generation === current && socket === connection
    socket.on('connect', () => {
      if (!valid()) return
      connected = true; subscribed = false
      socket.timeout(5000).emit('tracking:subscribe', { maDonHang: orderId }, (err, ack) => {
        if (!valid()) return
        subscribed = !err && ack?.success === true; publish(); schedule()
      })
      publish()
    })
    socket.on('disconnect', () => { if (!valid()) return; connected = false; subscribed = false; if (active) { publish(); schedule() } })
    socket.on('connect_error', () => { if (!valid()) return; connected = false; subscribed = false; if (active) { publish(); schedule() } })
    socket.on('shipper:location:update', payload => {
      if (!valid() || !subscribed || isTerminal(data)) return
      // Events are scoped by the subscribed room; their payload has no order ID.
      const point = coordinate(payload)
      const timestamp = Date.parse(payload?.updated_at)
      if (!point || !Number.isFinite(timestamp) || timestamp <= lastGpsTimestamp) return
      if (payload.shipper_id && data.shipper?.id && String(payload.shipper_id) !== String(data.shipper.id)) { refresh(); return }
      lastGpsTimestamp = timestamp; lastGps = clock.now(); receivedAt = clock.now()
      const statusChanged = payload.status && payload.status !== data.shipper_delivery?.status
      data = { ...data, shipper_location: { ...data.shipper_location, ...point, updated_at: payload.updated_at } }
      publish(); if (statusChanged) refresh(); else schedule()
    })
    socket.on('notification:new', payload => {
      const id = payload?.ma_don_hang || payload?.data?.ma_don_hang || payload?.metadata?.ma_don_hang
      if (valid() && String(id) === String(orderId)) refresh()
    })
  }
  async function refresh() {
    if (!active || busy || isTerminal(data)) return
    const current = generation
    const request = new AbortController()
    controller = request; busy = true; publish()
    try {
      const result = await fetchTracking(orderId, request.signal)
      if (!active || current !== generation) return
      if (!result?.order || String(result.order.ma_don_hang) !== String(orderId)) throw new Error('Không nhận được dữ liệu của đơn hàng này.')
      // A slower REST result must not move the driver backwards after newer GPS.
      const location = lastGps && lastGps > lastRefresh ? data?.shipper_location : result.shipper_location
      data = { ...result, shipper_location: location }
      error = null; receivedAt = clock.now(); lastRefresh = clock.now()
      if (isTerminal(data)) { clearTimer(); disposeSocket() } else attachSocket()
    } catch (err) {
      if (active && current === generation && !request.signal.aborted) error = err?.response?.data?.message || err.message || 'Chưa cập nhật được hành trình.'
    } finally {
      if (active && current === generation) { busy = false; controller = null; publish(); schedule() }
    }
  }
  return {
    start() { if (active) return; active = true; generation++; refresh() },
    refresh,
    stop() { active = false; generation++; clearTimer(); controller?.abort(); controller = null; busy = false; disposeSocket() },
  }
}
