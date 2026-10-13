import test from 'node:test'
import assert from 'node:assert/strict'
import { coordinate, createTrackingSession } from '../src/lib/trackingSession.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
function fixture(fetch) {
  let now = 100000, serial = 0, calls = 0
  const timers = new Map(), sockets = [], changes = []
  const result = { order: { ma_don_hang: 'order-1', trang_thai_don_hang: 'DANG_GIAO' }, shipper: { id: 'driver-1' }, shipper_delivery: { status: 'IN_TRANSIT' }, shipper_location: { latitude: 10, longitude: 106 } }
  const session = createTrackingSession({ orderId: 'order-1',
    fetchTracking: async (id, signal) => { calls++; return fetch ? fetch(id, signal, calls) : structuredClone(result) },
    onChange: state => changes.push(state),
    clock: { now: () => now, setTimeout: (fn, delay) => { const id = ++serial; timers.set(id, { fn, at: now + delay }); return id }, clearTimeout: id => timers.delete(id) },
    connectSocket: () => {
      const handlers = new Map()
      const socket = { on: (name, fn) => handlers.set(name, fn), timeout: () => socket, emit: (name, payload, cb) => cb?.(null, { success: true }), disconnect: () => { socket.closed = true }, fire: (name, payload) => handlers.get(name)?.(payload) }
      sockets.push(socket); return socket
    },
  })
  return { session, changes, sockets, result, get calls() { return calls }, timers,
    async advance(ms) { now += ms; for (const [id, job] of [...timers]) if (job.at <= now) { timers.delete(id); await job.fn() } await tick() },
    gps: (time, latitude = 10.5) => ({ latitude, longitude: 106.1, updated_at: new Date(time).toISOString(), shipper_id: 'driver-1', status: 'IN_TRANSIT' }) }
}
test('valid coordinates include zero; missing, malformed and out of range coordinates are rejected', () => {
  assert.deepEqual(coordinate({latitude: 0, longitude: '106'}), {latitude: 0, longitude: 106})
  for (const value of [null, {latitude: true, longitude: 5}, {latitude: ' ', longitude: 5}, {latitude: null, longitude: 5}, {latitude: '', longitude: 0}, {latitude: 'bad',longitude: 5}, {latitude: 91,longitude: 5}]) assert.equal(coordinate(value), null)
})
test('order-scoped GPS updates accept payload without orderId, ignore duplicates and older timestamps', async () => {
  const f = fixture(); f.session.start(); await tick(); const socket = f.sockets[0]; socket.fire('connect')
  socket.fire('shipper:location:update', f.gps(100001))
  assert.equal(f.changes.at(-1).data.shipper_location.latitude, 10.5)
  socket.fire('shipper:location:update', f.gps(99999, 9)); socket.fire('shipper:location:update', f.gps(100001, 9))
  assert.equal(f.changes.at(-1).data.shipper_location.latitude, 10.5)
  await f.advance(30000); assert.equal(f.calls, 1)
  await f.advance(30000); assert.equal(f.calls, 2)
  f.session.stop()
})
test('disconnect falls back to REST; repeated start and refresh do not overlap requests', async () => {
  let resolve
  const f = fixture((id, signal, count) => count === 1 ? new Promise(r => { resolve = r }) : structuredClone(f.result))
  f.session.start(); f.session.start(); f.session.refresh(); assert.equal(f.calls, 1)
  resolve(f.result); await tick(); const socket = f.sockets[0]; socket.fire('connect'); socket.fire('disconnect')
  await f.advance(30000); assert.equal(f.calls, 2)
  f.session.stop()
})
test('closing aborts in-flight work and prevents late UI updates, timers and sockets', async () => {
  let resolve, signal
  const f = fixture((id, s) => { signal = s; return new Promise(r => { resolve = r }) })
  f.session.start(); const before = f.changes.length; f.session.stop(); assert.equal(signal.aborted, true)
  resolve(f.result); await tick(); await f.advance(60000)
  assert.equal(f.changes.length, before); assert.equal(f.sockets.length, 0); assert.equal(f.timers.size, 0)
})
test('terminal state stops socket/polling; foreground resumes with one authoritative fetch', async () => {
  const f = fixture(); f.session.start(); await tick(); f.session.stop(); assert.equal(f.sockets[0].closed, true)
  f.session.start(); await tick(); assert.equal(f.calls, 2)
  f.result.order.trang_thai_don_hang = 'HOAN_THANH'; await f.session.refresh()
  assert.equal(f.sockets[1].closed, true); assert.equal(f.timers.size, 0)
  const calls = f.calls; await f.advance(120000); assert.equal(f.calls, calls); f.session.stop()
})
test('a fetch error retains the last confirmed order and location', async () => {
  const f = fixture((id, signal, count) => { if (count > 1) throw new Error('offline'); return structuredClone(f.result) })
  f.session.start(); await tick(); await f.session.refresh()
  assert.equal(f.changes.at(-1).data.order.ma_don_hang, 'order-1'); assert.equal(f.changes.at(-1).error, 'offline')
  f.session.stop()
})
