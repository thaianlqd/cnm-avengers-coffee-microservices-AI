import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceRevisionController, workspaceRevisionInput, queueWorkspaceFilter } from './workspaceInteraction.mjs';
const report = { session_id: 's', revision: 1, interaction_contract: { session_id: 's', revision: 1, catalog_fingerprint: 'c', access_fingerprint: 'a' } };
const result = id => ({ status: 'success', session_id: 's', revision: 2, interaction_contract: {session_id:'s', revision: 2 }, id });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('E25 late Apply A cannot overwrite Apply B even if HTTP ignores abort', async () => {
  const c = workspaceRevisionController(), a = deferred(), b = deferred(), published = [];
  const pa = c.apply({ session_id:'s', revision:1, filters:['a'] }, () => a.promise, r => published.push(r.id));
  const pb = c.apply({ session_id:'s', revision:1, filters:['b'] }, () => b.promise, r => published.push(r.id));
  b.resolve(result('B')); assert.equal(await pb, true);
  a.resolve(result('A')); assert.equal(await pa, false);
  assert.deepEqual(published, ['B']);
});
test('pending changes coalesce locally; one Apply single-flights an identical revision', async () => {
  let filters = queueWorkspaceFilter([], { dimension_id:'region', values:[{type:'string',value:'one'}] });
  filters = queueWorkspaceFilter(filters, { dimension_id:'region', values:[{type:'string',value:'two'}] });
  filters = queueWorkspaceFilter(filters, { dimension_id:'store', values:[{type:'number',value:5}] });
  const input = workspaceRevisionInput(report,filters,[],'deep');
  let sends=0, publications=0; const done=deferred(), c=workspaceRevisionController();
  const send = () => { sends++; return done.promise; };
  const a=c.apply(input,send,()=>publications++), b=c.apply(input,send,()=>publications++);
  assert.equal(sends,1); assert.equal(input.filters.length,2); assert.equal('sql' in input,false);
  done.resolve({...result('B'),interaction_contract:{...result('B').interaction_contract,catalog_fingerprint:'c',access_fingerprint:'a'}}); await Promise.all([a,b]); assert.equal(publications,1);
});
test('navigation/unmount suppress publication and mixed revision payload is rejected', async () => {
  const c=workspaceRevisionController(), d=deferred(); let published=0;
  const p=c.apply({session_id:'s',revision:1},()=>d.promise,()=>published++);
  c.invalidate(); d.resolve(result('old')); await p; assert.equal(published,0);
  await assert.rejects(c.apply({session_id:'s',revision:1},async()=>({...result('bad'),revision:8}),()=>published++),/revision/);
  assert.equal(published,0);
});
