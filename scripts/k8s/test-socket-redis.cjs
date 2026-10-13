#!/usr/bin/env node
// Two real Nest/Socket.IO servers using the production gateways and Redis adapter.
// Synthetic room names only; no database, order, payment, or provider operations.
const path = require('node:path');
const { createRequire } = require('node:module');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const order = path.join(root, 'avengers-coffee-system/services/order-service');
const req = createRequire(path.join(order, 'package.json'));
req('reflect-metadata');
const { NestFactory } = req('@nestjs/core');
const { Module } = req('@nestjs/common');
const { SocketRedisAdapter } = req('./dist/infrastructure/socket-redis.adapter');
const { ChatGateway } = req('./dist/modules/chat/chat.gateway');
const { NotificationGateway } = req('./dist/modules/notification/notification.gateway');
const webReq = createRequire(path.join(root, 'avengers-coffee-system/apps/web-customer/package.json'));
const { io } = webReq('socket.io-client');
const apps = [], adapters = [], clients = [];
const errors = [];
const timeout = (promise, label) => Promise.race([promise, new Promise((_, reject) => {
  const timer = setTimeout(() => reject(Error(`Timed out: ${label}`)), 8000);
  timer.unref();
})]);
const once = (socket, event) => timeout(new Promise(resolve => socket.once(event, resolve)), event);
const ack = (socket, event, payload) => timeout(new Promise(resolve => socket.emit(event, payload, resolve)), event);
async function connect(base, namespace, transports, auth) {
  const client = io(base + namespace, { transports, auth, autoConnect: false, reconnection: false, timeout: 5000 });
  clients.push(client);
  client.on('connect_error', err => errors.push(err.message));
  const ready = once(client, 'connect');
  client.connect();
  await ready;
  return client;
}
async function main() {
  for (let i = 0; i < 2; i++) {
    class TestApp {}
    Module({ providers: [ChatGateway, NotificationGateway] })(TestApp);
    const app = await NestFactory.create(TestApp, { logger: false });
    apps.push(app);
    const adapter = new SocketRedisAdapter(app);
    adapters.push(adapter);
    await adapter.connect();
    app.useWebSocketAdapter(adapter);
    await app.listen(0, '127.0.0.1');
  }
  const bases = apps.map(app => `http://127.0.0.1:${app.getHttpServer().address().port}`);
  // Test both native WebSocket and polling-only clients across distinct replicas.
  for (const transports of [['websocket'], ['polling']]) {
    const uid = `k8s-synthetic-${Date.now()}`;
    const chat = await connect(bases[0], '/chat', transports, { userId: uid, role: 'CUSTOMER' });
    assert.equal((await ack(chat, 'chat:conversation:join', { conversationId: uid })).success, true);
    const message = once(chat, 'chat:message:new');
    // Prove membership is visible from the other replica before broadcasting.
    const remote = apps[1].get(ChatGateway);
    assert.equal((await remote.server.in(`conversation:${uid}`).fetchSockets()).length, 1);
    remote.emitMessage(uid, { synthetic: uid });
    assert.deepEqual(await message, { synthetic: uid });
    const support = await connect(bases[0], '/chat', transports, { userId: uid, role: 'STAFF' });
    const supportEvent = once(support, 'chat:conversation:update');
    remote.emitConversationUpdate({ synthetic: uid }, uid);
    assert.deepEqual(await supportEvent, { synthetic: uid });

    const notification = await connect(bases[0], '/notifications', transports, { userId: uid });
    const other = apps[1].get(NotificationGateway);
    const event = once(notification, 'notification:new');
    other.guiThongBaoTheoNguoiDung(uid, { id: uid });
    assert.deepEqual(await event, { id: uid });
    await ack(notification, 'workforce:subscribe', { branchCode: uid });
    const workforce = once(notification, 'workforce:event');
    other.guiSuKienNhanSuTheoChiNhanh(uid, { synthetic: true });
    assert.equal((await workforce).synthetic, true);
    await ack(notification, 'tracking:subscribe', { maDonHang: uid });
    const location = once(notification, 'shipper:location:update');
    other.guiViTriShipper(uid, null, { synthetic: uid });
    assert.deepEqual(await location, { synthetic: uid });

    // A reconnect must re-establish automatic personal rooms and explicit rooms.
    const previousId = notification.id;
    notification.disconnect();
    // Wait for the peer to process the namespace disconnect before reconnecting
    // a multiplexed client on its still-active underlying transport.
    await timeout((async () => {
      while (apps[0].get(NotificationGateway).server.sockets.has(previousId)) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    })(), 'namespace disconnect');
    const reconnected = once(notification, 'connect');
    notification.connect();
    await reconnected;
    assert.equal((await ack(notification, 'notifications:subscribe', { userId: uid })).success, true);
    const afterReconnect = once(notification, 'notification:new');
    other.guiThongBaoTheoNguoiDung(uid, { id: 'reconnected' });
    assert.deepEqual(await afterReconnect, { id: 'reconnected' });
    chat.disconnect(); support.disconnect(); notification.disconnect();
    console.log(`PASS two-server ${transports[0]}: join, cross-replica chat/support/notification/workforce/tracking, reconnect`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS no connect errors/unknown sessions in direct-server test. Kubernetes affinity still requires live qualification.');
}
main().catch(error => {
  console.error('FAIL Socket.IO Redis qualification:', error.name, error.code || '');
  if (String(error.message).startsWith('Timed out:')) console.error(error.message);
  // Stack locations help diagnose test failures without printing connection credentials.
  console.error(String(error.stack || '').split('\n').filter(line => line.trim().startsWith('at ')).slice(0, 5).join('\n'));
  process.exitCode = 1;
})
  .finally(async () => {
    clients.forEach(c => c.disconnect());
    await Promise.all(apps.map(a => a.close()));
    await Promise.all(adapters.map(a => a.disconnect()));
  });
