import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageWindow, pageSlice } from '../src/components/console/paginationModel.js';
test('page navigation stays bounded for very large datasets and preserves first/current/last', () => {
  for (const page of [1,2,17,50000,100000]) {
    const values = pageWindow(page,100000);
    assert(values.length <= 7); assert(values.includes(1)); assert(values.includes(100000)); assert(values.includes(page));
  }
  assert.deepEqual(pageWindow(2,3),[1,2,3]);
});
test('filtered/deleted data clamps the page and never loses rows or creates duplicates', () => {
  const rows = Array.from({ length: 23 }, (_, id) => ({ id }));
  assert.deepEqual([1,2,3].flatMap(page => pageSlice(rows,page).rows), rows);
  assert.deepEqual(pageSlice(rows.slice(0,4),3).rows, rows.slice(0,4));
  assert.equal(pageSlice([],99).from,0); assert.equal(pageSlice([],99).page,1);
});
