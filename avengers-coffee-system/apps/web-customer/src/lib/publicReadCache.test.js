import test from 'node:test';import assert from 'node:assert/strict';
import {createPublicReadCache} from './publicReadCache.js';
test('public reads coalesce, survive reload only until TTL, and never persist auth',async()=>{
 const store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 let time=0,calls=0;const fetcher=async()=>{calls++;return {status:200,data:{items:[1]},config:{headers:{Authorization:'private-token'}}};};
 let cache=createPublicReadCache({storage,now:()=>time});await Promise.all([cache.get('/users/branches/public',{},fetcher),cache.get('/users/branches/public',{},fetcher)]);assert.equal(calls,1);assert.ok(!JSON.stringify([...store]).includes('private-token'));
 cache=createPublicReadCache({storage,now:()=>time});await cache.get('/users/branches/public',{},fetcher);assert.equal(calls,1);
 time=60000;await cache.get('/users/branches/public',{},fetcher);assert.equal(calls,2);cache.clear();await cache.get('/users/branches/public',{},fetcher);assert.equal(calls,3);
});
test('private reads, errors, forced refresh and aborted requests bypass persisted caching',async()=>{
 const cache=createPublicReadCache();let calls=0;const read=async()=>{calls++;return {status:200,data:[]};};
 for(const url of ['/cart/user','/customers/a/wallet','/inventory/items']) {await cache.get(url,{},read);await cache.get(url,{},read);} assert.equal(calls,6);
 await assert.rejects(cache.get('/menu/san-pham',{},()=>Promise.reject(new Error('offline'))));
 await cache.get('/menu/san-pham',{},read);await cache.get('/menu/san-pham',{refresh:true},read);assert.equal(calls,8);
});

test('a caller cannot mutate the cached payload and invalidation defeats late inflight responses',async()=>{
 const cache=createPublicReadCache();let done;const first=cache.get('/menu/san-pham',{},()=>new Promise(resolve=>{done=resolve;}));await Promise.resolve();cache.clear();done({status:200,data:[1]});await first;
 const next=await cache.get('/menu/san-pham',{},async()=>({status:200,data:[2]}));next.data.push(3);
 const cached=await cache.get('/menu/san-pham',{},()=>{throw new Error('unexpected network');});assert.deepEqual(cached.data,[2]);
});
