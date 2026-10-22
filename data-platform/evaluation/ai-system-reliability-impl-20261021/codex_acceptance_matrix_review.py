"""Attribute frozen54 scenarios to executed assertions; missing coverage remains explicit.

No case is passed from test names alone: method IDs must occur in durable final
unittest passed_ids, and declared scenario gaps keep the case partial.
"""
import ast,json,re
from pathlib import Path
from collections import Counter
E=Path(__file__).resolve().parent;API=E.parents[1]/'analytics-api'
FUNCTIONS={}
for path in (API/'tests').glob('test_*.py'):
 for cls in ast.parse(path.read_text()).body:
  if isinstance(cls,ast.ClassDef):
   for method in cls.body:
    if isinstance(method,ast.FunctionDef) and method.name.startswith('test_'):
     FUNCTIONS.setdefault(method.name,[]).append('tests.'+path.stem+'.'+cls.name+'.'+method.name)
# Test assertions reused from full suite, plus independent raw-record harnesses.
METHODS={
'M01':['test_template_questions_for_every_eligible_metric_preflight','test_mission_examples_preflight_cleanly_and_guided_ones_compile'],
'M02':['test_scope_qualifiers_are_generic_catalog_roles_not_grouping','test_dependent_goals_run_inside_the_ranked_cohort'],
'M03':['test_I07_comparison_template_round_trips_both_members','test_compare_reports_both_groups_gap_and_percentage_gap'],
'M04':['test_raw_sign_calendar_and_top_limits','test_real_routes_stop_unknown_input_before_provider_sql_and_job_cache'],
'M05':['test_secondary_semantic_fields_cannot_hide_unknown_scope'],
'M06':['test_I11_write_requests_are_blocked_before_any_job'],
'M07':['test_ui_time_cannot_silently_replace_explicit_prompt_period'],
'M08':['test_I03_rare_member_outside_curated_enum_is_grounded_by_exact_lookup','test_five_rare_selected_members_share_the_execution_lookup_allowance'],
'M09':['test_bound_scope_membership_ignores_order_but_not_different_members','test_union_exclusion_and_unknown_sibling_never_partial_success'],
'M10':['test_identity_filter_pins_label_axis_without_hiding_the_exact_answer','test_resolution_cache_never_crosses_owner_access_or_catalog'],
'M11':['test_I04_scoped_free_text_risk_stays_on_risk_contract','test_bounded_risk_includes_labeled_current_snapshot_without_partial_approval'],
'M12':['test_healthy_total_does_not_hide_breaching_groups','test_classification_is_server_side_and_has_no_composite_score'],
'M13':['test_snapshot_exception_requires_server_mission_and_declared_clock','test_I10_snapshot_metric_with_bounded_period_is_not_ready'],
'M14':['test_relationship_guided_contract_uses_governed_grain'],
'M15':['test_I16_model_added_specialized_ranking_goal_is_dropped','test_unasked_scalar_in_cohort_request_cannot_become_a_national_total'],
'M16':['test_I01_cohort_scoped_views_reconcile_with_ranked_total','test_dependent_goal_read_as_multi_axis_ranking_is_rebound'],
'M17':[],'M18':[],
'M19':['test_I08_bottom_ranking_is_never_named_top','test_per_group_ranking_keeps_partition_and_rank_order'],
'M20':['test_explicit_independent_scalar_remains_national'],
'M21':['test_average_order_value_uses_cohort_sum_and_exposure','test_captured_l43_keeps_exact_top5_keys_and_independent_all_order_counts'],
'M22':['test_depths_are_monotonic_and_keep_the_same_meaning_and_numbers'],
'M23':['test_I12_single_group_is_reported_as_a_data_limit','test_one_day_scope_discloses_missing_time_view_instead_of_drawing_one_point'],
'M24':['test_tampered_membership_population_sql_and_parent_cannot_verify','test_full_artifact_membership_guard_rejects_a_different_top_n','test_chart_scope_and_unit_mutations_cannot_be_exported'],
'M25':['test_cancellation_ratio_uses_cohort_numerator_and_denominator','test_rollup_requires_matching_population_clock_and_complete_formula'],
'M26':['test_wrong_finding_scope_is_rejected','test_fact_refs_and_conclusion_replay_detect_scope_unit_period_and_prose_mutations'],
'M27':['test_I06_preflight_catalog_cache_is_keyed_by_access_projection','test_reported_feedback_accepts_multiple_patches_with_no_repair'],
'M28':['test_I06_preflight_catalog_cache_is_keyed_by_access_projection','test_resolution_cache_never_crosses_owner_access_or_catalog'],
'M29':['test_changed_generation_is_incomparable_and_missing_epoch_is_unmeasured','test_no_runner_or_zero_allowance_does_not_claim_measurement','test_save_reopen_refresh_preserve_snapshot_and_reject_revision_substitution'],
'M30':['test_cancel_cannot_publish_late_result_or_execute_sql','test_one_submit_produces_verified_report_and_duplicate_is_free','test_failed_execution_does_not_publish_or_mutate_source_session'],
'M31':['test_refinement_does_not_require_repeating_metric'],
'M32':[],
'H01':[],'H02':[],
'H03':['test_unicode_equivalence_and_hidden_controls','test_explicit_lookup_requires_exact_unique_match_and_retains_constraint'],
'H04':[],'H05':[],
'H06':['test_word_table_discloses_full_result_count_and_displayed_preview','test_many_group_contribution_is_a_full_population_pareto'],
'H07':['test_permission_denied_cannot_fallback_to_global_report','test_revoke_during_revision_prevents_atomic_publication','test_save_reopen_refresh_preserve_snapshot_and_reject_revision_substitution'],
'H08':[],
'A01':['test_guided_contract_is_validated_server_side','test_I07_comparison_template_round_trips_both_members'],
'A02':['test_depths_are_monotonic_and_keep_the_same_meaning_and_numbers','test_risk_mission_supporting_views_use_risk_metrics_only'],
'A03':['test_every_chart_maps_to_a_requirement_and_explains_itself','test_chart_scope_and_unit_mutations_cannot_be_exported'],
'A04':['test_I08_bottom_ranking_is_never_named_top','test_ranking_agreement_detects_order_and_set_errors'],
'A05':['test_average_order_value_uses_cohort_sum_and_exposure','test_cancellation_ratio_uses_cohort_numerator_and_denominator'],
'A06':['test_current_incomplete_month_is_not_compared_as_complete','test_trend_partial_period_and_ranking_top_n_caveats'],
'A07':['test_relationship_scatter_discloses_no_causality','test_healthy_total_does_not_hide_breaching_groups'],
'A08':['test_approval_reuses_spec_no_reinterpretation_chart_no_queries','test_non_ai_filter_drill_depth_refresh_visual_save_reopen_send_zero_provider_requests'],
'A09':['test_old_revision_and_cross_owner_cannot_open_current_artifact','test_failed_execution_does_not_publish_or_mutate_source_session'],
'A10':['test_explicit_independent_scalar_remains_national'],
'A11':['test_chart_scope_and_unit_mutations_cannot_be_exported','test_fact_refs_and_conclusion_replay_detect_scope_unit_period_and_prose_mutations','test_guided_compare_cards_have_verified_fact_ids_and_mutations_fail'],
'A12':['test_charts_reuse_rows_and_reject_ranking_donut_or_wrong_scope','test_distinct_count_is_never_a_composition'],
'A13':['test_saved_then_reopened_report_exports_the_same_conclusion_caveats_and_verification','test_word_table_discloses_full_result_count_and_displayed_preview'],
'A14':['test_template_questions_for_every_eligible_metric_preflight'],
}
EXTERNAL={
'M11':['t9-risk-equivalence-policy29.log'],'M27':['codex-refinement-http-policy29-final.json'],'M15':['t9-policy29-independent-all-final.log'],'M16':['t9-policy29-independent-all-final.log'],
'M19':['t9-ties-actual-empty-policy29.log'],'M17':['t9-policy29-independent-all-final.log'],'M18':['t9-policy29-independent-all-final.log'],
'M08':['t9-all55-cities-policy29-final.log'],'M20':['t9-policy29-independent-all-final.log'],'M22':['codex-family-matrix-policy29-final.log'],
'M31':['codex-web-e2e-policy29-all-final.log'],'M32':['codex-browser-policy29-final/receipt.json'],
'H03':['t9-identity-holdouts-policy29.log'],'M10':['t9-identity-holdouts-policy29.log'],'H01':['t9-h01-h02-policy29-final.log'],'H02':['t9-h01-h02-policy29-final.log'],
'H04':['t9-h04-h05-h08-policy29-final.log'],'H05':['t9-h04-h05-h08-policy29-final.log'],'H08':['t9-h04-h05-h08-policy29-final.log'],
'A02':['codex-family-matrix-policy29-final.log'],'A03':['codex-browser-policy29-final/receipt.json','codex-browser-policy29-artifact-review.json'],
'A09':['codex-browser-policy29-artifact-review.json','codex-web-e2e-policy29-all-final.log'],'A08':['codex-browser-policy29-final/receipt.json'],'A10':['t9-policy29-independent-all-final.log'],
'A13':['codex-docx-export-policy29-content-final.json'],'A14':['codex-family-matrix-policy29-final.json']}
# These are real remaining assertions, never waived by green related methods.
GAPS={
'M01':['All eligible metric/template/chip combinations were not each executed through HTTP; fixture test samples first6 metrics.'],



'M15':['Every extra model-added requested goal does not yet carry a complete per-clause provenance record.'],

'M19':['Numeric ties/actual<N/empty tested; all short-answer/map/pagination combinations not jointly asserted.'],


'M32':['Real-browser layout covers1440/mobile390, not every1280/1920/drawer combination.'],

'H04':['Minimum-observation qualification versus displayed percentage not jointly varied in sparse exposure fixture.'],
'H06':['Functional XML count checks pass; Word visual render remains unavailable.'],
'H07':['Exact saved comparison reopened after same-owner permission narrowing not separately executed; revocation controls separate.'],
'A01':['All four entry modes not compared on one fixed source snapshot with goal-level input provenance.'],

'A04':['Complete ties/actual<N/pagination matrix across short answer and every chart not jointly run.'],
'A06':['All zero/negative/missing baseline and forecast boundary cases not attributed per assertion here.'],
'A07':['Raw exposure risk and causal guard controls pass separately; every operational pair not qualified.'],

'A12':['Plot/geometry and chart controls cover selected representations; full stated encoding matrix not run.'],
'A13':['Word visual QA unavailable; all selected report surfaces not independently asserted on same revision.'],
'A14':['7 metric families ×3depths ×3densities passes; all advertised domains/presets/metrics not exhausted.'],
}

def main():
 folder=E/'codex-regression-policy29-final';records=json.loads((folder/'modules.json').read_text())
 passed={i for r in records for i in r.get('passed_ids',[])}
 cases=json.loads((E.parent/'ai-system-audit-20261021/acceptance-matrix.json').read_text())['cases']+json.loads((E.parent/'ai-system-reliability-plan-addendum-20261021/acceptance-addendum.json').read_text())['cases']
 result=[]
 for c in cases:
  ids=[]
  for name in METHODS[c['id']]:
   if name not in FUNCTIONS:raise ValueError('Missing function '+name)
   ids.extend(FUNCTIONS[name])
  missing=[i for i in ids if i not in passed]
  row={**c,'implementation_status':'EXECUTED_RELATED_ASSERTIONS','test_ids':ids,'test_ids_passed':sorted(set(ids)&passed),
       'pending_or_failed_test_ids':missing,'external_receipts':EXTERNAL.get(c['id'],[]),'unverified_assertions':GAPS.get(c['id'],[])}
  receipt_failures=[]
  for receipt in row['external_receipts']:
   path=E/receipt
   if not path.exists():receipt_failures.append(receipt+': missing');continue
   if path.suffix=='.log':
    content=path.read_text()
    if receipt.startswith('codex-web-e2e'):
     if re.search(r'(?m)^\s*\d+ failed(?:\s|$)',content) or not re.search(r'(?m)^\s*\d+ passed \(',content):receipt_failures.append(receipt+': full UI attempt has failures or incomplete summary')
    elif '\nOK\n' not in content:receipt_failures.append(receipt+': no successful unittest completion')
   elif path.name=='receipt.json':
    data=json.loads(path.read_text())
    if len(data)!=12 or any(r.get('status')!='PASS' for r in data):receipt_failures.append(receipt+': incomplete browser')
   elif path.name.endswith('artifact-review.json'):
    if not json.loads(path.read_text()).get('passed'):receipt_failures.append(receipt+': artifact assertions failed')
   elif path.name.startswith('codex-refinement-http'):
    if not all(r['passed'] for r in json.loads(path.read_text())):receipt_failures.append(receipt+': HTTP assertion failed')
   elif path.name.startswith('codex-docx-export'):
    if json.loads(path.read_text()).get('status')!='PASS_CONTENT_ONLY':receipt_failures.append(receipt+': export content failed')
   elif path.name.startswith('codex-family-matrix'):
    if not json.loads(path.read_text()).get('passed'):receipt_failures.append(receipt+': matrix failed')
  if c['id']=='A09':row['applicability_note']='Chart explanations are precomputed in the bound report, no separate async explanation response exists; report/revision races are exercised by UI tests.'
  row['receipt_failures']=receipt_failures
  row['status']='PENDING_EVIDENCE' if receipt_failures else 'PENDING_FINAL_REGRESSION' if missing else 'PARTIAL' if row['unverified_assertions'] else 'PASS_FINITE_ASSERTIONS'
  result.append(row)
 output={'status':'NOT_QUALIFIED' if any(r['status']!='PASS_FINITE_ASSERTIONS' for r in result) else 'PASS_FINITE_MATRIX',
  'counts':dict(Counter(r['status'] for r in result)),'cases':result,
  'limits':'Attribution of actual assertions to frozen54 scenarios; partial gaps remain explicit. No universal semantic accuracy claim.'}
 (E/'codex-acceptance-matrix-policy29.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
 print(json.dumps({'status':output['status'],'counts':output['counts']}))
if __name__=='__main__':main()
