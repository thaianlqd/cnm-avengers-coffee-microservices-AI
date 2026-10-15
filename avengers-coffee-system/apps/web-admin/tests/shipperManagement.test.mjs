import test from 'node:test';
import assert from 'node:assert/strict';
import { systemBranches, newestShippers } from '../src/lib/shipperManagement.mjs';
test('shipper branches exclude franchises and satellite kiosks while retaining canonical stores', () => {
  const store = {code:'D9',name:'Highlands D9',loai_diem_ban:'CHI_NHANH_CHINH'};
  assert.deepEqual(systemBranches([store,{code:'KSK-1',name:'Kiosk Avengers'},{code:'KVT_1',loai_diem_ban:'KIOSK_VE_TINH'},{code:'F1',type:'FRANCHISE'}]),[store]);
});
test('created account is first and server timestamps keep newest first after reload', () => {
  const rows=[{id:'old',created_at:'2026-10-01'},{id:'new',created_at:'2026-10-14'}];
  assert.equal(newestShippers(rows)[0].id,'new');
  assert.equal(newestShippers([...rows,{id:'just-created'}],'just-created')[0].id,'just-created');
});
