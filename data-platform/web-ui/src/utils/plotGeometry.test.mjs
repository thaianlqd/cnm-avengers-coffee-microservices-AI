import {test} from 'node:test';import assert from 'node:assert/strict';
import {monotonePath,timeSegments,timePositions,axisInset} from './plotGeometry.mjs';
test('monotone curve passes through source observations without overshooting adjacent values',()=>{
 const points=[{x:0,y:0},{x:1,y:10},{x:2,y:3},{x:3,y:8},{x:4,y:8}],path=monotonePath(points);
 const pieces=[...path.matchAll(/C ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+)/g)];
 assert.equal(pieces.length,points.length-1);
 pieces.forEach((p,i)=>{const a=points[i],b=points[i+1];assert.equal(Number(p[5]),b.x);assert.equal(Number(p[6]),b.y);
  for(let t=0;t<=1;t+=.01){const y=(1-t)**3*a.y+3*(1-t)**2*t*Number(p[2])+3*(1-t)*t*t*Number(p[4])+t**3*b.y;assert(y>=Math.min(a.y,b.y)-1e-9&&y<=Math.max(a.y,b.y)+1e-9);}});
 assert.equal(monotonePath([]),'');assert.equal(monotonePath([{x:2,y:5}]),'M 2 5');
});
test('missing observations remain gaps and incomplete boundaries are dashed only',()=>{
 const rows=[{v:5},{v:7},{v:null},{v:3},{v:4},{v:8}];
 const {solid,partial}=timeSegments(rows,'v',[{partial:true},{},{},{},{},{partial:true}]);
 assert.deepEqual(partial,[[0,1],[4,5]]);assert(solid.some(segment=>segment.join(',')==='3,4'));
 for(const segment of solid)assert(!segment.includes(2));assert(!solid.some(segment=>segment.includes(0)&&segment.includes(1)));
});
test('large signed axis labels receive more inset without pushing the plot off a mobile card',()=>{
 assert(axisInset(['-559,6 triệu','0','559,6 triệu'])>axisInset(['0','10']));assert(axisInset(['x'.repeat(500)])<=104);
});

test('temporal geometry handles singleton leap days and invalid chronology without coercion',()=>{
 assert.deepEqual(timePositions([{label:'2024-02-29'}]),[.5]);
 assert.deepEqual(timePositions([{label:'2024-02-28'},{label:'2024-02-29'},{label:'2024-03-01'}]),[0,.5,1]);
 for(const labels of [['2026-02-30'],['2026-09-02','2026-09-01'],['2026-09-01','2026-09-01'],['2026-09-01','unknown']])
  assert.equal(timePositions(labels.map(label=>({label}))),null);
 assert.deepEqual(timePositions([{label:'Kỳ A'},{label:'Kỳ B'}]),[0,1]);
});

test('absent weekly monthly and quarterly buckets split paths without adding zero rows',()=>{
 for(const [granularity,labels] of [['week',['2026-09-07','2026-09-14','2026-09-28']],
  ['month',['2026-01-01','2026-02-01','2026-04-01']],['quarter',['2026-01-01','2026-04-01','2026-10-01']]]){
  const rows=labels.map((label,i)=>({label,v:i+2})),before=JSON.stringify(rows);
  assert.deepEqual(timeSegments(rows,'v',[],granularity).solid,[[0,1],[2]]);
  assert.equal(JSON.stringify(rows),before);
 }
});
