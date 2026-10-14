import test from 'node:test';
import assert from 'node:assert/strict';
import { createStaffInbox, filteredConversations } from '../src/components/console/staffInbox.mjs';
const a = { ma_hoi_thoai: 'a', ten_khach_hang: 'An', so_tin_nhan_chua_doc_nhan_su: 2, trang_thai: 'OPEN' };
const b = { ma_hoi_thoai: 'b', ten_khach_hang: 'Bình', so_tin_nhan_chua_doc_nhan_su: 0, trang_thai: 'CLOSED' };
const message = (conv, value, role = 'CUSTOMER') => ({ id: value, ma_hoi_thoai: conv, noi_dung: value, vai_tro_nguoi_gui: role, ngay_tao: '2026-10-14T07:00:00Z' });
test('search and unread/open filters use real conversation fields', () => {
  assert.deepEqual(filteredConversations([a, b], '', 'unread'), [a]);
  assert.deepEqual(filteredConversations([a, b], 'Bình', 'all'), [b]);
  assert.deepEqual(filteredConversations([a, b], '', 'open'), [a]);
});
test('human messages containing menu prompts stay visible; other conversations and AI do not mix', async () => {
  const service = createStaffInbox({ client: { get: async () => ({ items: [message('a', 'cho tôi xem menu'), message('a', 'AI', 'AI'), message('b', 'private')] }), patch: async () => ({ conversation: { ...a, so_tin_nhan_chua_doc_nhan_su: 0 } }) }, userId: 'manager', role: 'MANAGER', name: 'Manager' });
  await service.select(a);
  service.receiveMessage(message('b', 'wrong-conversation'));
  assert.deepEqual(service.snapshot().messages.map(row => row.noi_dung), ['cho tôi xem menu']);
});
test('a slow previous conversation cannot overwrite the newly selected customer', async () => {
  let release;
  const service = createStaffInbox({ client: { get: path => path.includes('/a/') ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ items: [message('b', 'B')] }), patch: async () => ({ conversation: b }) }, userId: 'staff', role: 'STAFF', name: 'Staff' });
  const first = service.select(a); await service.select(b); release({ items: [message('a', 'A')] }); await first;
  assert.equal(service.snapshot().selected.ma_hoi_thoai, 'b');
  assert.deepEqual(service.snapshot().messages.map(row => row.id), ['B']);
});
test('REST sends once, retains failed drafts, deduplicates socket echo and preserves the new conversation', async () => {
  let fail = true, release; const calls = [];
  const client = { get: async () => ({ items: [] }), patch: async () => ({ conversation: a }), post: async (path, body) => { calls.push({ path, body }); if (fail) throw new Error('Network'); return new Promise(resolve => { release = resolve; }); } };
  const service = createStaffInbox({ client, userId: 'staff-id', role: 'STAFF', name: 'Linh' });
  await service.select(a); service.setDraft('Chào bạn'); await service.send();
  assert.equal(service.snapshot().drafts.a, 'Chào bạn');
  fail = false; const pending = service.send(); await service.send();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.sender_user_id, 'staff-id');
  const reply = message('a', 'sent', 'STAFF'); release({ message: reply, conversation: a }); await pending;
  service.receiveMessage(reply); assert.equal(service.snapshot().messages.length, 1);
  assert.equal(service.snapshot().drafts.a, '');
});
test('disposal prevents late updates or read receipts after account/workspace exit', async () => {
  let release, reads = 0, updates = 0;
  const service = createStaffInbox({ client: { get: () => new Promise(resolve => { release = resolve; }), patch: async () => { reads++; } }, userId: 'staff', role: 'STAFF', name: 'Staff', onChange: () => updates++ });
  const pending = service.select(a); service.dispose(); release({ items: [message('a', 'late')] }); await pending;
  assert.equal(reads, 0); assert.equal(updates, 1);
});
