import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultViewState, selectViewVariant, modeOptions, nextState, activeViewChart, valueModeOptions, reasonLabel, reportWithViewChoice, memberReportSelection } from './chartViewModes.mjs';

test('whole-report member selection uses all governed union keys and refuses a partial or unknown union', () => {
  const options=['id1','id2'].map(value=>({selection:{chart_id:'c',query_id:'q',dimension_id:'entity_id',operator:'eq',values:[{type:'string',value}]}}));
  const interaction={selection_behavior:'population_filter',options};
  const view={members:[{key:'combined display label',values:['id1','id2']},{key:'id1',label:'duplicate label'}]};
  assert.deepEqual(memberReportSelection(view,'combined display label',interaction),
    {...options[0].selection,operator:'in',values:[{type:'string',value:'id1'},{type:'string',value:'id2'}]});
  assert.equal(memberReportSelection(view,'combined display label',{...interaction,options:options.slice(0,1)}),null);
  assert.equal(memberReportSelection(view,'unknown',interaction),null);
  assert.equal(memberReportSelection(view,'id1',{...interaction,selection_behavior:'inspect_only'}),null);
  assert.deepEqual(memberReportSelection(view,'id1',interaction),options[0].selection);
});

const v = (id, spec, extra = {}) => ({ id, spec, availability: 'available', payload: { data: [{ label: id, value: 1 }], caption: id }, insight: { key_facts: [{ text: id }] }, ...extra });
const modes = {
  default_variant: 'c', members: [{ key: 'A', label: 'A' }, { key: 'B', label: 'B' }],
  variants: [v('c', { mode: 'compare' }), v('cs', { mode: 'compare', value_mode: 'member_share' }), v('t', { mode: 'total' }),
    v('sa', { mode: 'single', member: 'A' }), v('sb', { mode: 'single', member: 'B' }),
    { id: null, spec: { mode: 'total', value_mode: 'scope_share' }, availability: 'unavailable', reason: 'revenue:distinct_requires_identity_union' }],
};

test('default state selects the server default variant', () => {
  assert.equal(selectViewVariant(modes, defaultViewState(modes)).id, 'c');
});

test('saved view uses a server variant ID and reopening retains the active member without mutating report scope', () => {
  const source = { revision: 7, kpi_cards: [{ value: 200 }], charts: [{ id: 'x', view_modes: modes, view_ref: 'c' }] };
  const changed = reportWithViewChoice(source, 'x', { mode: 'single', member: 'B', valueMode: 'absolute' });
  assert.deepEqual(changed.chart_view_choices, { x: 'sb' });
  assert.equal(changed.charts[0].data[0].label, 'sb');
  assert.equal(defaultViewState(modes, changed.charts[0].view_ref).member, 'B');
  assert.deepEqual(changed.kpi_cards, source.kpi_cards);
  assert.equal(changed.revision, 7);
  assert.equal(source.charts[0].view_ref, 'c');
});

test('single mode picks a member and data+insight switch together', () => {
  const s = nextState(modes, defaultViewState(modes), { mode: 'single' });
  assert.equal(s.member, 'A');
  const chart = activeViewChart({ id: 'x', view_modes: modes, data: [], insight: { key_facts: [] } }, nextState(modes, s, { member: 'B' }));
  assert.equal(chart.view_ref, 'sb');
  assert.equal(chart.data[0].label, 'sb');
  assert.equal(chart.insight.key_facts[0].text, 'sb');
});

test('value mode falls back to absolute when unavailable in the new mode; never another mode', () => {
  const s = nextState(modes, { mode: 'compare', valueMode: 'member_share', member: null }, { mode: 'total' });
  assert.equal(s.valueMode, 'absolute');
  assert.equal(selectViewVariant(modes, s).id, 't');
  assert.deepEqual(valueModeOptions(modes, { mode: 'compare', member: null }).map((o) => o.id), ['absolute', 'member_share']);
});

test('unavailable modes expose a typed reason', () => {
  const m = { ...modes, variants: modes.variants.filter((x) => x.spec.mode !== 'total' || x.availability !== 'available') };
  const total = modeOptions(m).find((o) => o.id === 'total');
  assert.equal(total.available, false);
  assert.match(reasonLabel(total.reason), /không trùng/);
});
