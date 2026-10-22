"""Resolve each prior gap with actual new assertions; keep all historical receipts."""
import json,re
from pathlib import Path
from collections import Counter
import codex_acceptance_matrix_review as base
E=Path(__file__).resolve().parent
O='codex-offline-policy33-final/'
B='codex-browser-policy33-final-v2/'
AF=O+'rechecks/codex_acceptance_properties.log'
FAMILY=O+'family-matrix.json'
WORD='codex-word-policy33-final-native/visual-review.json'
WEB='codex-consolidated-web-policy33-final.json'
EXTRA={
 'M01':['test_composition_rejects_axes_without_governed_additivity_before_ready','test_metric_names_cannot_supply_mission_operators_or_entity_filters'],
 'M15':['test_each_goal_traces_input_clause_and_verified_cohort_dependency','test_guided_selection_is_server_origin_and_model_cannot_supply_provenance'],
 'M19':['test_ties_actual_n_and_full_fact_universe_at_every_depth'],
 'H04':['test_same_delivery_percentage_requires_independent_minimum_exposure'],
 'H07':['test_saved_comparison_cannot_reopen_after_same_owner_permission_narrows'],
 'A01':['test_text_builder_preset_and_owned_followup_share_scoped_primary_and_provenance'],
 'A04':['test_ties_actual_n_and_full_fact_universe_at_every_depth','test_all_bottom_facts_and_word_keep_direction'],
 'A06':['test_zero_negative_and_missing_revenue_baselines_at_all_depths','test_smape_skips_zero_actual_and_forecast','test_incomplete_current_period_is_excluded_and_trailing_zeros_filled'],
 'A07':['test_governed_operational_pair_keeps_grain_and_causal_guard_at_all_depths'],
 'A12':['test_time_distance_is_not_array_index','test_multiline_missing_values_are_not_zero_and_names_are_semantic',
        'test_negative_bar_is_not_clipped','test_missing_buckets_break_line_without_changing_observations',
        'test_invalid_or_reversed_time_uses_table_and_zero_is_real','test_unplottable_chart_has_explicit_table_without_fabricated_zero'],
 'A13':['test_bottom_chart_metadata_and_conclusion_are_factual'],
}
EXTERNAL={
 'M01':[O+'advertised-roundtrip.json'], 'M08':[O+'city-inventory.json'],
 'M10':[O+'rechecks/codex_identity_holdouts.log'],'M11':[O+'codex_risk_equivalence.log'],
 'M15':[AF], 'M16':[AF], 'M17':[AF], 'M18':[O+'codex_holdout_cohorts.log'],
 'M19':[AF,WEB],'M20':[AF],'M22':[FAMILY],
 'M27':['codex-refinement-http-policy33-final.json'],'M31':[WEB],
 'M32':[B+'receipt.json'],
 'H01':[O+'codex_holdout_cohorts.log'],'H02':[O+'codex_holdout_cohorts.log'],
 'H03':[O+'rechecks/codex_identity_holdouts.log'],'H04':[O+'codex_remaining_holdouts.log'],
 'H05':[O+'codex_remaining_holdouts.log'],'H06':[WORD,'codex-docx-export-policy33-content-final.json'],
 'H08':[O+'codex_remaining_holdouts.log'],
 'A02':[FAMILY],'A03':[B+'receipt.json','codex-browser-policy33-artifact-review.json'],
 'A04':[AF,WEB],'A08':[B+'receipt.json'],'A09':[WEB,'codex-browser-policy33-artifact-review.json'],
 'A10':[AF],'A12':[WEB,'web-utils33-final.log'],
 'A13':[WORD,B+'receipt.json','codex-docx-export-policy33-content-final.json'],
 'A14':[FAMILY,O+'advertised-roundtrip.json','codex-domain-matrix33/result.json'],
}
RESOLUTION={
 'M01':'Frozen448 advertised mission/metric template cases through HTTP:429compile0AI,19correct missing-comparison-input cases. Representative eligible axes plus separate dimension/grammar controls; no Cartesian-universe claim.',
 'M15':'Every generated requirement has server clause/structured/dependency receipts; semantic/cohort/receipt mutations fail replay. Broad interpreted clauses are labeled as interpretation, not explicit wording.',
 'M19':'18raw tie/direction/N cases and18real-pipeline UI artifacts with55cities, N5/20/100, all depths; map pagination/search preserves values and claims. Empty population covered independently by AF oracle.',
 'M32':'Served1440 journeys plus1280/1920/390 expanded insight, composer bounds, capability drawer and scope controls.',
 'H04':'Same50percent with2/4/0observations and governed fixture minimum3; raw counts independently varied. No production business minimum invented.',
 'H06':'Native Word rendered and inspected all10cohort+2preview pages; XML/HTTP separately assert displayed/full counts.',
 'H07':'Same owner wide access can reopen; old principal after policy change403, narrowed principal get/download404; exact saved comparison cannot leak wider cohort.',
 'A01':'Four canonically equivalent adapters on same raw350VND snapshot ×3depths, verified goal receipts. Equivalent preset fixture is not a claim that production D01 broader bundle equals a single-metric task; real53presets qualified separately.',
 'A04':'Top/Bottom raw membership/values/ties and actual<N plus18UI page/search/accordion invariance cases; map list explicitly uses its own displayed metric sort.',
 'A06':'Zero/negative/missing revenue baselines ×3depths; zero baseline has no relative percent, negative nonnegative-metric observations reject, missing remains partial. Forecast zero-SMAPE/current-incomplete/short-history controls attributed separately.',
 'A07':'All advertised governed operational pairs inventory asserted: one revenue/cancellation pair, n5/r=-1 at3depths, causal mutation rejected; generic driver snapshot pair governed separately and blocked when invalid for time grain.',
 'A12':'Elapsed date distance, missing calendar bucket gaps, singleton, invalid/reversed dates, missing-series values, nonadditive shares, negative values and long/multiple-series layouts; valid table fallback preserves observations with reason.',
 'A13':'Served revision binds all chart insights, short answer, map, saved reopen and server-owned Word export; native Word rendering qualified on same frozen exporter, exact HTTP content checked separately.',
 'A14':'26advertised domains ×3densities ×3depths234;7metric-family63;448mission/metric template cases;53presets in full suite; live outcomes separate. Finite pairwise coverage per PLAN19.7, not every metric Cartesian product.',
}

def receipt_ok(name):
    path=E/name
    if not path.exists():return False
    if path.suffix=='.log':
        text=path.read_text()
        return ('\nOK\n' in text) or ('# pass 231' in text and '# fail 0' in text)
    data=json.loads(path.read_text())
    if name==B+'receipt.json':
        rank=next((r for r in data if r['id']=='ranking-comprehensive'),{})
        return len(data)==12 and all(r['status']=='PASS' for r in data) and {r['width'] for r in rank.get('breakpoints',[])}=={1280,1920,390} and bool(rank.get('saved_export'))
    if name==WORD:return data['status']=='PASS_FINITE_VISUAL_QA' and sum(r['pages'] for r in data['cases'])==12
    if name==WEB:return data['passed']==95 and data['optional_skipped']==2 and data['unique_cases']==97
    if name.endswith('city-inventory.json'):return data['count']==55 and all(r['provider_calls']==0 and r['fixture_revenue']==137 for r in data['cases'])
    if name.endswith('advertised-roundtrip.json'):return data['passed'] and len(data['cases'])==448
    if name.endswith('result.json'):return data['passed'] and len(data['cases'])==234
    if name.startswith('codex-refinement-http'):return all(r['passed'] for r in data)
    if name.startswith('codex-docx-export'):return data['status']=='PASS_CONTENT_ONLY' and all(data['checks'].values())
    return bool(data.get('passed'))

def main():
    folder=E/'codex-regression-policy33-final'
    effective=json.loads((folder/'effective-final.json').read_text())
    if not effective['passed']:raise SystemExit('Effective final regression not qualified')
    records=json.loads((folder/'modules.json').read_text());records+=json.loads((folder/effective['rechecks_directory']/'modules.json').read_text())
    passed={i for r in records for i in r.get('passed_ids',[])}
    cases=json.loads((E/'codex-acceptance-matrix-policy29.json').read_text())['cases'];rows=[]
    for old in cases:
        identity=old['id'];methods=base.METHODS[identity]+EXTRA.get(identity,[])
        ids=sorted({i for method in methods for i in base.FUNCTIONS[method]})
        missing=sorted(set(ids)-passed);receipts=EXTERNAL.get(identity,[])
        failed=[name for name in receipts if not receipt_ok(name)]
        prior_gap=old.get('unverified_assertions',[])
        resolved=not prior_gap or (identity in RESOLUTION and not missing and not failed)
        row={**old,'test_ids':ids,'test_ids_passed':sorted(set(ids)&passed),'pending_or_failed_test_ids':missing,
            'external_receipts':receipts,'receipt_failures':failed,'unverified_assertions':[] if resolved else prior_gap,
            'prior_gap_resolution':RESOLUTION.get(identity),'status':'PASS_FINITE_ASSERTIONS' if not missing and not failed and resolved else 'PARTIAL'}
        rows.append(row)
    output=dict(status='PASS_FINITE_MATRIX' if all(r['status']=='PASS_FINITE_ASSERTIONS' for r in rows) else 'NOT_QUALIFIED',
        counts=dict(Counter(r['status'] for r in rows)),cases=rows,
        limits='Frozen54scenario assertions with actual method/receipt attribution; finite pairwise coverage. Historical failures retained; no universal or blind-holdout language accuracy claim.')
    (E/'codex-acceptance-matrix-policy33-final.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in output.items() if k not in {'cases','limits'}}));raise SystemExit(output['status']!='PASS_FINITE_MATRIX')

if __name__=='__main__':main()
