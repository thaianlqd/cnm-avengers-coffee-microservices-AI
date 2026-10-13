#!/usr/bin/env node
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.resolve(__dirname, '../../avengers-coffee-system/apps/web-customer/package.json'));
const { io } = req('socket.io-client');
const base = process.env.SOCKET_URL || 'http://localhost:3005';
const sockets = [];
const errors = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const wait = (socket, event) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error('Socket operation timed out')), 6000);
  socket.once(event, data => { clearTimeout(timer); resolve(data); });
});
const ack = (socket, event, data) => new Promise((resolve, reject) => {
  socket.timeout(6000).emit(event, data, (error, result) => error ? reject(error) : resolve(result));
});
(async () => {
  for (const transport of ['websocket', 'polling']) {
    const identity = `k8s-demo-synthetic-${Date.now()}`;
    for (const namespace of ['/chat', '/notifications']) {
      const socket = io(base + namespace, { transports: [transport], forceNew: true,
        autoConnect: false, reconnection: false, auth: { userId: identity, role: 'CUSTOMER' } });
      sockets.push(socket);
      socket.on('connect_error', () => errors.push('connect_error'));
      let connected = wait(socket, 'connect'); socket.connect(); await connected;
      const event = namespace === '/chat' ? 'chat:conversation:join' : 'notifications:subscribe';
      const payload = namespace === '/chat' ? { conversationId: identity } : { userId: identity };
      assert.equal((await ack(socket, event, payload)).success, true);
      socket.disconnect(); await delay(50);
      connected = wait(socket, 'connect'); socket.connect(); await connected;
      assert.equal((await ack(socket, event, payload)).success, true);
      socket.disconnect();
    }
    console.log(`PASS public LoadBalancer ${transport}: chat/notification connect, synthetic room join, reconnect`);
  }
  assert.deepEqual(errors, []);
})().catch(() => { console.error('FAIL public Socket.IO qualification (no credentials/events payload logged)'); process.exitCode = 1; })
  .finally(() => sockets.forEach(s => s.disconnect()));
