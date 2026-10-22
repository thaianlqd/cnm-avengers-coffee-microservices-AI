import geography from '../data/vietnamGeography.json' with { type: 'json' };
import { foldSearch } from './dashboardDiscovery.mjs';
import { locateGeography, projectPoint } from './reportGeography.mjs';

export const MAP_PALETTES = {
  blue: { label: 'Xanh phân tích', colors: ['#e0edff','#b8d4ff','#86b4fb','#548feb','#326ed1','#1e4fa4'] },
  spectral: { label: 'Đa sắc', colors: ['#5e4fa2','#3288bd','#66c2a5','#e6f598','#fdae61','#d53e4f'] },
  ocean: { label: 'Đại dương', colors: ['#cffafe','#67e8f9','#22d3ee','#0284c7','#2563eb','#4338ca'] },
  heat: { label: 'Nhiệt', colors: ['#fef3c7','#fcd34d','#fb923c','#f97316','#ef4444','#b91c1c'] },
};
const REGION_COLORS = { 'Miền Bắc':'#3b82f6', 'Miền Trung':'#f59e0b', 'Miền Nam':'#10b981', 'Chưa phân loại':'#a78bfa' };
export const MISSING_COLOR = '#d8e0e9';
export const ZERO_COLOR = '#dbeafe';
export function provinceRegion(name) { return geography.reportingMembership[name] || 'Chưa phân loại'; }

export function colorScale(rows, palette = 'spectral', method = 'quantile') {
  const values = rows.map(row => row.value).filter(Number.isFinite);
  const positive = values.filter(value => value !== 0).sort((a,b) => a-b);
  const colors = MAP_PALETTES[palette]?.colors || MAP_PALETTES.spectral.colors;
  const signed = values.some(value => value < 0);
  const low = signed ? -Math.max(...values.map(Math.abs),1) : positive[0] ?? 0;
  const high = signed ? -low : positive.at(-1) ?? 0;
  const quantile = fraction => {
    const position=(positive.length-1)*fraction, index=Math.floor(position);
    return positive[index]+(positive[Math.min(index+1,positive.length-1)]-positive[index])*(position-index);
  };
  const breaks = [...new Set(Array.from({ length:5 }, (_,index) => method === 'equal' || signed
    ? low + (high-low)*(index+1)/6 : quantile((index+1)/6)).filter(value=>Number.isFinite(value)&&value>low&&value<high))];
  const tones = signed ? ['#9f1239','#f43f5e','#fda4af','#99f6e4','#14b8a6','#0f766e'] : colors;
  const activeColors=low===high?[tones[2]]:Array.from({length:breaks.length+1},(_,index)=>tones[Math.round(index/Math.max(1,breaks.length)*(tones.length-1))]);
  const color = value => !Number.isFinite(value) ? MISSING_COLOR : value === 0 ? ZERO_COLOR
    : activeColors[Math.min(activeColors.length-1, breaks.filter(boundary => value >= boundary).length)];
  return { color, colors: activeColors, breaks, low, high, signed, method: signed ? 'equal' : method };
}

/** Each province receives exactly one original row or no row. No summing of ratios/averages. */
export function provinceFeatures(boundaries, chart, rows, palette = 'spectral', method = 'quantile') {
  const scale = colorScale(rows,palette,method);
  const regional = chart.x_field === 'reporting_region';
  const indexed = new Map();
  for (const row of rows) { const name = regional ? row.label : locateGeography(row.label,'city')?.label; if(name) indexed.set(name,[...(indexed.get(name)||[]),row]); }
  return { type:'FeatureCollection', features:boundaries.features.map(feature => {
    const name = feature.properties.name;
    const group = provinceRegion(name);
    const candidates = indexed.get(regional ? group : name) || [];
    // Ambiguous aliases stay unpainted instead of silently selecting or averaging multiple source rows.
    const row = candidates.length === 1 ? candidates[0] : null;
    const hasData = Boolean(row && Number.isFinite(row.value));
    return { ...feature, properties: { ...feature.properties,
      group, rowIndex:row?.index ?? -1, value:hasData ? row.value : null, hasData,
      ambiguous:candidates.length > 1,
      color:hasData ? regional ? REGION_COLORS[group] || '#a78bfa' : scale.color(row.value) : MISSING_COLOR,
      searchKey:foldSearch(name),
    } };
  }) };
}
export function regionalLegend(rows) { return rows.map(row => ({ label:row.label,value:row.value,color:REGION_COLORS[row.label] || MISSING_COLOR })); }
export function geometryBounds(geometry) {
  const points=[];
  const walk = value => { if (typeof value[0] === 'number') points.push(value); else value.forEach(walk); };
  walk(geometry.coordinates);
  return [[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]];
}
export function geometryPath(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.flatMap(polygon => polygon.map(ring => ring.map((point,index) => `${index ? 'L' : 'M'}${projectPoint(point).map(v => v.toFixed(2)).join(',')}`).join(' ')+'Z')).join(' ');
}
let boundaryPromise;
export function loadProvinceBoundaries() {
  if (!boundaryPromise) boundaryPromise = fetch('/geo/vietnam-provinces-2020.geojson')
    .then(async response => { if (!response.ok) throw Error('Chưa tải được địa giới tỉnh/thành.'); const data=await response.json(); if(data.type!=='FeatureCollection'||data.features?.length!==63)throw Error('Bộ địa giới chưa hợp lệ.');return data; })
    .catch(error => { boundaryPromise=null; throw error; });
  return boundaryPromise;
}
