import test from 'node:test';
import assert from 'node:assert/strict';
import {selectChartPeriod, vietnamDay} from '../src/components/console/chartPeriod.js';
const now=new Date('2026-10-13T06:00:00Z');
test('keeps current period when two real days exist',()=>{
 const rows=[{ngay_tao:'2026-10-12T00:00:00Z'},{ngay_tao:'2026-10-13T00:00:00Z'}];
 assert.equal(selectChartPeriod(rows,7,now).fallback,false);
});
test('historical fallback excludes future/invalid dates and preserves selected KPI rows',()=>{
 const rows=[{ngay_tao:'2026-09-01'},{ngay_tao:'2026-09-02'},{ngay_tao:'invalid'},{ngay_tao:'2027-01-01'}];
 const p=selectChartPeriod(rows,7,now);assert.equal(p.rows.length,2);assert.equal(p.selectedRows.length,0);assert.equal(p.fallback,true);assert.match(p.label,/2026/);
});
test('single-day and empty data are never fabricated into history',()=>{
 assert.equal(selectChartPeriod([],7,now).rows.length,0);
 assert.equal(selectChartPeriod([{ngay_tao:'2026-09-02'}],7,now).rows.length,1);
 assert.equal(vietnamDay('2026-10-12T18:00:00Z'),'2026-10-13');
});
