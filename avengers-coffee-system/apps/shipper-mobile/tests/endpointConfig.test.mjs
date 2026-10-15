import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShipperEndpoint as resolve } from '../src/lib/endpointConfig.mjs';
test('local web follows browser host instead of stale Wi-Fi IP; loopback uses IPv4', () => {
  assert.equal(resolve({platform:'web',pageUrl:'http://localhost:8081',apiUrl:'http://10.62.148.11:3000'}),'http://127.0.0.1:3000');
  assert.equal(resolve({platform:'web',pageUrl:'http://192.168.100.151:8081',apiUrl:'http://10.62.148.11:3000'}),'http://192.168.100.151:3000');
});
test('explicit web and remote deployment endpoints remain authoritative', () => {
  assert.equal(resolve({platform:'web',pageUrl:'http://localhost:8081',webUrl:'https://api.example.test/v1/'}),'https://api.example.test/v1');
  assert.equal(resolve({platform:'web',pageUrl:'http://localhost:8081',apiUrl:'https://api.example.test'}),'https://api.example.test');
});
test('native development uses Metro address and emulator fallback without a hard-coded LAN', () => {
  assert.equal(resolve({platform:'ios',scriptUrl:'http://192.168.100.151:8081/index.bundle',apiUrl:'http://10.62.148.11:3000'}),'http://192.168.100.151:3000');
  assert.equal(resolve({platform:'android',scriptUrl:'http://localhost:8081/index.bundle'}),'http://10.0.2.2:3000');
});
