"""Live evaluator calibration: a successful report can still answer the wrong question."""
from copy import deepcopy
from unittest import TestCase
from evals.cw_live_qualification import check_meaning


class LiveMeaningRubricTests(TestCase):
    def test_negative_requires_zero_execution_and_its_specific_diagnostic(self):
        from evals.cw_live_qualification import check_execution_constraints
        expected = dict(zero_business_queries=True, zero_provider_http=True,
            capability_codes_include=['input_write_unsupported'])
        meta = dict(warehouse_queries=0, http_attempts=0, capability_codes=['input_write_unsupported'])
        self.assertTrue(all(check_execution_constraints(expected, meta).values()))
        for change in [dict(warehouse_queries=1),dict(http_attempts=1),dict(capability_codes=['analysis_target_missing'])]:
            self.assertFalse(all(check_execution_constraints(expected, {**meta,**change}).values()))
        self.assertEqual(check_execution_constraints({}, meta), {})

    def setUp(self):
        self.expected=dict(metric='revenue',period=['2026-09-01','2026-09-30'],dimensions=['city'])
        self.report=dict(semantic_intent=dict(requirements=[dict(id='r',metric_ids=['revenue'],dimension_ids=['city'],filters=[])]),
                         analytical_queries=[dict(id='q',role='requested')],
                         query_plans=[dict(id='q',period=dict(start='2026-09-01',end='2026-09-30'))])

    def test_valid_control_and_wrong_metric_window_axis_are_distinguished(self):
        self.assertTrue(all(check_meaning(self.expected,self.report).values()))
        for mutation,check in [('metric','meaning_metric'),('time','meaning_period'),('axis','meaning_dimensions')]:
            bad=deepcopy(self.report)
            if mutation=='metric':bad['semantic_intent']['requirements'][0]['metric_ids']=['product_revenue']
            elif mutation=='time':bad['query_plans'][0]['period']['start']='2026-01-01'
            else:bad['semantic_intent']['requirements'][0]['dimension_ids']=[]
            with self.subTest(mutation=mutation):self.assertFalse(check_meaning(self.expected,bad)[check])

    def test_all_order_count_cannot_impersonate_the_valid_order_population(self):
        self.expected['metric']='valid_order_count'
        req=self.report['semantic_intent']['requirements'][0];req['metric_ids']=['order_count']
        self.assertFalse(check_meaning(self.expected,self.report)['meaning_metric'])
        req['filters']=[dict(dimension='order_status',operator='in',value=['HOAN_THANH','DANG_GIAO'])]
        self.assertTrue(check_meaning(self.expected,self.report)['meaning_metric'])
        req['filters'][0]['value'].append('DA_HUY')
        self.assertFalse(check_meaning(self.expected,self.report)['meaning_metric'])

    def test_dropped_exclusion_cannot_pass_even_with_the_right_metric_and_members(self):
        self.expected['exclude']=dict(dimension='order_type',value='GIAO_TAN_NOI')
        self.assertFalse(check_meaning(self.expected,self.report)['meaning_exclusion'])
        req=self.report['semantic_intent']['requirements'][0]
        req['filters']=[dict(dimension='order_type',operator='in',value=['DUNG_TAI_CHO','MANG_DI'])]
        self.assertTrue(check_meaning(self.expected,self.report)['meaning_exclusion'])

    def test_baseline_reversal_fails_even_when_both_dates_exist(self):
        self.expected['baseline_period']=['2026-08-01','2026-08-31']
        self.report['analytical_queries'].append(dict(id='baseline',role='requested'))
        self.report['query_plans'].append(dict(id='baseline',period=dict(start='2026-08-01',end='2026-08-31')))
        self.report['derived_feature_bindings']=[dict(feature='period_comparison',query_id='q')]
        self.assertTrue(all(check_meaning(self.expected,self.report).values()))
        self.report['derived_feature_bindings'][0]['query_id']='baseline'
        self.assertFalse(check_meaning(self.expected,self.report)['meaning_baseline_direction'])

    def test_reversed_or_truncated_ranking_is_not_a_pass(self):
        self.expected['ranking']=dict(metric='revenue',direction='bottom',limit=5)
        req=self.report['semantic_intent']['requirements'][0]
        req['ranking']=dict(metric_id='revenue',direction='bottom',limit=5)
        self.assertTrue(check_meaning(self.expected,self.report)['meaning_ranking'])
        req['ranking']['direction']='top'
        self.assertFalse(check_meaning(self.expected,self.report)['meaning_ranking'])
