import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { provinceFeatures, colorScale, provinceRegion, MISSING_COLOR, ZERO_COLOR, geometryBounds, geometryPath } from './provinceMap.mjs';
const boundaries=JSON.parse(readFileSync(new URL('../../public/geo/vietnam-provinces-2020.geojson',import.meta.url),'utf8'));

test('local detailed geometry has 63 unique matched provinces and valid closed polygon rings',()=>{
  assert.equal(boundaries.features.length,63);assert.equal(new Set(boundaries.features.map(f=>f.id)).size,63);
  for(const feature of boundaries.features){
    const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
    for(const polygon of polygons)for(const ring of polygon){assert.ok(ring.length>=4);assert.deepEqual(ring[0],ring.at(-1));}
    const bounds=geometryBounds(feature.geometry);assert.ok(bounds[0][0]>=100&&bounds[1][0]<=120);
    assert.ok(geometryPath(feature.geometry).startsWith('M'));
  }
});

test('province colors keep absent, zero, signed and constant metrics distinct',()=>{
  const scale=colorScale([{value:0},{value:10},{value:50},{value:100}]);
  assert.equal(scale.color(null),MISSING_COLOR);assert.equal(scale.color(undefined),MISSING_COLOR);
  assert.equal(scale.color(0),ZERO_COLOR);assert.notEqual(scale.color(10),scale.color(100));
  const signed=colorScale([{value:-100},{value:50}]);assert.ok(signed.signed);assert.notEqual(signed.color(-50),signed.color(50));
  const same=colorScale([{value:100},{value:100}]);assert.equal(same.colors.length,1);assert.deepEqual(same.breaks,[]);
});

test('province observations remain exact and duplicate aliases are never averaged or summed',()=>{
  const rows=[{index:0,label:'Hà Nội',value:4.5},{index:1,label:'Đà Nẵng',value:0},{index:2,label:'Cần Thơ',value:null},{index:3,label:'Chưa xác định',value:3.5}];
  const snapshot=structuredClone(rows);
  const data=provinceFeatures(boundaries,{x_field:'city'},rows);
  const get=name=>data.features.find(f=>f.properties.name===name).properties;
  assert.equal(get('Hà Nội').value,4.5);assert.equal(get('Đà Nẵng').value,0);assert.ok(get('Đà Nẵng').hasData);
  assert.equal(get('Cần Thơ').value,null);assert.ok(!get('An Giang').hasData);assert.deepEqual(rows,snapshot);
  const ambiguous=provinceFeatures(boundaries,{x_field:'city'},[...rows,{index:4,label:'Ha Noi',value:5}]);
  assert.ok(ambiguous.features.find(f=>f.properties.name==='Hà Nội').properties.ambiguous);
  assert.ok(!ambiguous.features.find(f=>f.properties.name==='Hà Nội').properties.hasData);
});

test('regional shading locates group membership and retains regional values without redistributing totals',()=>{
  const rows=[{index:0,label:'Miền Bắc',value:100},{index:1,label:'Miền Trung',value:80},{index:2,label:'Miền Nam',value:200},{index:3,label:'Chưa phân loại',value:70}];
  const data=provinceFeatures(boundaries,{x_field:'reporting_region'},rows);
  for(const f of data.features){assert.equal(f.properties.value,rows[f.properties.rowIndex].value);assert.equal(f.properties.group,provinceRegion(f.properties.name));}
  assert.equal(rows.reduce((sum,r)=>sum+r.value,0),450);
  const catalog=JSON.parse(readFileSync(new URL('../../../analytics-api/metadata/semantic_catalog.json',import.meta.url),'utf8'));
  for(const group of catalog.analysis_registry.dimensions.city.value_groups.filter(g=>g.primary))for(const city of group.values)assert.equal(provinceRegion(city),group.value);
});
