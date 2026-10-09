"""Exact scope/conditional counts, authored contrasts and independent rows."""
from copy import deepcopy
from unittest.mock import patch
from tests import test_hybrid_v28 as f
from services.request_anchors import request_anchors, verify_anchors, complete_explicit_time
from services.analysis_intent import AnalysisIntentEnvelope, repair_tool
from services.analysis_catalog import AnalysisError
from services.analysis_quality_service import verify_saved_report
from evals.fixture_warehouse import FixtureWarehouse
from evals.one_click_cases import CASES, intent
import json
from pathlib import Path


class OneClickSemantics(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def captured(self,name):
        return json.loads((Path(__file__).resolve().parents[1]/'evaluation'/('one_click_captured_'+name+'.json')).read_text())

    def kiosk_warehouse(self):
        from evals import fixture_warehouse as w
        stores=deepcopy(w.STORES);stores[1]['loai_diem_ban']='KIOSK_NHUONG_QUYEN'
        with patch.dict(w.DATA,{'chi_nhanh':stores}):
            return FixtureWarehouse(self.catalog.overlay)

    def test_captured_voucher_primary_is_rejected_before_any_sql(self):
        raw=self.captured('vouchers')
        provider=f.scripted(raw,raw,raw);executor=f.Mock();p=self.pipeline(provider,executor)
        with self.assertRaises(AnalysisError):p.propose(self.request(CASES[3]['question']))
        executor.assert_not_called()
        payload=json.loads(provider.requests[1]['messages'][0]['content'])
        codes={i['code'] for i in payload['validation_issues']}
        self.assertTrue({'population_disclosure_used_as_filter','explicit_global_ranking_partitioned'}<=codes)
        self.assertIn('unique_explicit_clause_grain',{n['rule'] for n in p.semantic_info['semantic_normalizations']})
        self.assertIsNone(f.safe_failure(AnalysisError('semantic_intent_invalid','invalid'),p.calls,p.semantic_info)['quality_assessment']['score'])

    def test_captured_primaries_recover_in_one_targeted_patch(self):
        patches={
            'kiosks':[
                dict(id='overall_kpi',filters=[dict(dimension='store_type',operator='in',value=['KIOSK_NHUONG_QUYEN','KIOSK_VE_TINH'])],feature_metrics={'scalar':['store_revenue','store_order_count','aov']}),
                dict(id='top_10_stores_revenue',dimension_ids=['store']),
                dict(id='top_10_stores_orders',dimension_ids=['store']),
                dict(id='revenue_by_city',dimension_ids=['city'],derived_features=['contribution_share'],feature_metrics={'contribution_share':['store_revenue']}),
                dict(id='revenue_by_store_type',dimension_ids=['store_type'],derived_features=['contribution_share'],feature_metrics={'contribution_share':['store_revenue']})],
            'vouchers':[
                dict(id='req_1',filters=[]),
                dict(id='req_2',filters=[],dimension_ids=['promotion'],ranking={'per_group':[]}),
                dict(id='req_3',dimension_ids=['promotion'],ranking={'per_group':[]}),
                dict(id='req_4',dimension_ids=[]),dict(id='req_5',dimension_ids=[]),dict(id='req_6',dimension_ids=['city'])]}
        for name,changes in patches.items():
            with self.subTest(case=name):
                provider=f.scripted(self.captured(name),dict(decision='analyze',requirements=changes))
                from evals import fixture_warehouse as w
                stores=deepcopy(w.STORES);stores[1]['loai_diem_ban']='KIOSK_NHUONG_QUYEN'
                with patch.dict(w.DATA,{'chi_nhanh':stores}):
                    warehouse=FixtureWarehouse(self.catalog.overlay)
                try:
                    p=self.pipeline(provider,warehouse);request=self.request(next(c['question'] for c in CASES if c['id']==name))
                    proposal=p.propose(request);report=p.generate(f.approve(request,proposal))
                    self.assertEqual(provider.call_count,2)
                    self.assertGreaterEqual(len(report['charts']),5)
                    self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
                    self.assertLessEqual(p.semantic_info['repair_context_chars'],24000)
                finally:warehouse.close()

    def test_explicit_partition_and_multiple_named_axes_remain_valid(self):
        a=request_anchors('Top 5 sản phẩm theo doanh thu sản phẩm trong mỗi danh mục',self.catalog,{})
        req=f.requirement(dimension_ids=['product','category'],ranking=dict(limit=5,metric_id='product_revenue',per_group=['category']),derived_features=[])
        issues=verify_anchors(a,AnalysisIntentEnvelope.model_validate(f.envelope(req)).requirements,f.REFERENCE,self.catalog)
        self.assertFalse(issues)
        a=request_anchors('Doanh thu voucher theo thành phố và voucher',self.catalog,{})
        self.assertFalse(a['clause_bindings'])

    def test_captured_extra_companions_recover_with_time_only_patch(self):
        raw=self.captured('kiosk_companions')
        changes=[dict(id=r['id'],time=dict(kind='rolling',amount=30,unit='day'))
                 for r in raw['requirements']]
        provider=f.scripted(raw,dict(decision='analyze',requirements=changes))
        warehouse=self.kiosk_warehouse()
        try:
            p=self.pipeline(provider,executor=warehouse)
            request=self.request(CASES[0]['question'])
            proposal=p.propose(request)
            self.assertEqual(provider.call_count,2)
            self.assertFalse(p.semantic_info['contract_issues'])
            self.assertTrue(all(c['status']=='planned' for c in p.semantic_info['analysis_components']
                                if c['requested_or_supporting']=='requested'))
            report=p.generate(f.approve(request,proposal))
            self.assertGreaterEqual(len(report['charts']),5)
            self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
            self.assertTrue(all(item['label']!='Phần yêu cầu chưa được hỗ trợ'
                                for item in report['quality_assessment']['completed']))
            self.assertIn('unique_explicit_clause_metrics',
                {n['rule'] for n in p.semantic_info['semantic_normalizations']})
        finally:warehouse.close()

    def test_clause_normalization_keeps_explicit_companions_and_unbound_kpis(self):
        from services.request_anchors import normalize_explicit_grains,normalize_explicit_metrics
        for case in CASES:
            draft=AnalysisIntentEnvelope.model_validate(intent(case))
            anchors=request_anchors(case['question'],self.catalog,{})
            normalized,_=normalize_explicit_grains(draft,anchors,self.catalog)
            normalized,_=normalize_explicit_metrics(normalized,anchors,self.catalog)
            self.assertEqual([r.metric_ids for r in normalized.requirements],
                             [r.metric_ids for r in draft.requirements],case['id'])

    def test_captured_duplicate_scalar_and_invented_rank_recover_together(self):
        raw=self.captured('kiosk_features')
        changes=[dict(id=r['id'],time=dict(kind='rolling',amount=30,unit='day')) for r in raw['requirements']]
        next(r for r in changes if r['id']=='req_city')['dimension_ids']=['city']
        next(r for r in changes if r['id']=='req_store_type')['dimension_ids']=['store_type']
        provider=f.scripted(raw,dict(decision='analyze',requirements=changes))
        warehouse=self.kiosk_warehouse()
        try:
            p=self.pipeline(provider,executor=warehouse);request=self.request(CASES[0]['question'])
            proposal=p.propose(request)
            self.assertEqual(provider.call_count,2)
            self.assertTrue(all(c['status']=='planned' for c in p.semantic_info['analysis_components']
                                if c['requested_or_supporting']=='requested'))
            report=p.generate(f.approve(request,proposal))
            self.assertGreaterEqual(len(report['charts']),5)
            self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
        finally:warehouse.close()

    def test_cashier_is_not_an_order_payment_filter(self):
        for phrase in ('đối soát tiền mặt','chênh lệch tiền mặt','doanh thu tiền mặt hệ thống',
                       'tiền mặt thực tế','kiểm đếm tiền mặt','tiền mặt kỳ vọng'):
            with self.subTest(phrase=phrase):
                a=request_anchors('Phân tích '+phrase,self.catalog,{})
                self.assertNotIn(dict(dimension='payment_method',value='TIEN_MAT'),a['values'])
        a=request_anchors('Doanh thu đơn hàng thanh toán bằng tiền mặt',self.catalog,{})
        self.assertIn(dict(dimension='payment_method',value='TIEN_MAT'),a['values'])
        self.assertFalse(any('system_cash_revenue' in m['candidate_ids'] for m in a['metrics']))

    def test_late_count_requires_real_cohort_not_label(self):
        for phrase in ('số ca đi muộn','số ca đi trễ'):
            a=request_anchors(phrase+' theo chi nhánh',self.catalog,{})
            wrong=f.requirement(metric_ids=['shift_count'],dimension_ids=['store'],analysis_kind='aggregate',
                ranking=None,derived_features=[],time=None,goal=phrase)
            self.assertTrue(verify_anchors(a,AnalysisIntentEnvelope.model_validate(f.envelope(wrong)).requirements,f.REFERENCE,self.catalog))
            correct={**wrong,'filters':[dict(dimension='attendance_status',value='DI_TRE')]}
            self.assertFalse(verify_anchors(a,AnalysisIntentEnvelope.model_validate(f.envelope(correct)).requirements,f.REFERENCE,self.catalog))

    def test_common_time_inherits_without_overwriting_or_guessing_multiple_windows(self):
        for days in (7,30,45,60):
            a=request_anchors(f'Trong {days} ngày gần nhất, phân tích doanh thu',self.catalog,{})
            draft=AnalysisIntentEnvelope.model_validate(f.envelope(f.requirement(time=None)))
            completed,changes=complete_explicit_time(draft,a)
            self.assertEqual(completed.requirements[0].time.amount,days)
            self.assertEqual(len(changes),1);self.assertIsNone(draft.requirements[0].time)
            draft.requirements[0].time=f.IntentRequirement.model_validate(f.requirement()).time
            kept,_=complete_explicit_time(draft,a)
            self.assertEqual(kept.requirements[0].time.amount,30)
        a=request_anchors('Doanh thu 7 ngày gần nhất và số đơn 30 ngày gần nhất',self.catalog,{})
        draft=AnalysisIntentEnvelope.model_validate(f.envelope(f.requirement(time=None)))
        self.assertFalse(complete_explicit_time(draft,a)[1])

    def test_sixty_authored_scope_contrasts(self):
        # 15 independent metric/axis pairs × four windows, with protected
        # wrong-window and wrong-axis counterparts. No live transport.
        pairs=[('doanh thu đơn hàng','revenue','thành phố','city'),
            ('số đơn','order_count','thành phố','city'),
            ('doanh thu sản phẩm','product_revenue','danh mục','category'),
            ('số lượng sản phẩm bán','quantity_sold','danh mục','category'),
            ('số giao dịch','payment_count','cổng thanh toán','payment_gateway'),
            ('doanh thu thanh toán','payment_revenue','cổng thanh toán','payment_gateway'),
            ('số ca đi muộn','late_count','chi nhánh','store'),
            ('tổng số ca làm','shift_count','trạng thái chấm công','attendance_status'),
            ('tổng tiền chênh lệch','total_cash_difference','chi nhánh','store'),
            ('doanh thu tiền mặt hệ thống','system_cash_revenue','chi nhánh','store'),
            ('số ca đã đối soát','reconciled_shifts','chi nhánh','store'),
            ('doanh thu voucher','voucher_revenue','thành phố','city'),
            ('tổng giảm giá','discount_amount','thành phố','city'),
            ('số đơn dùng voucher','voucher_order_count','thành phố','city'),
            ('số giao dịch','payment_count','trạng thái giao dịch','payment_transaction_status')]
        checked=0
        for label,metric,axis,dimension in pairs:
            for days in (7,30,45,60):
                with self.subTest(metric=metric,days=days):
                    a=request_anchors(f'Trong {days} ngày gần nhất, {label} theo {axis}',self.catalog,{})
                    r=f.requirement(metric_ids=[metric],dimension_ids=[dimension],analysis_kind='aggregate',
                        ranking=None,derived_features=[],time=dict(kind='rolling',amount=days,unit='day'))
                    good=AnalysisIntentEnvelope.model_validate(f.envelope(r)).requirements
                    self.assertFalse(verify_anchors(a,good,f.REFERENCE,self.catalog))
                    bad=deepcopy(good);bad[0].time.amount=days+1
                    self.assertTrue(any(i['field']=='time' for i in verify_anchors(a,bad,f.REFERENCE,self.catalog)))
                    bad=deepcopy(good);bad[0].dimension_ids=[]
                    self.assertTrue(verify_anchors(a,bad,f.REFERENCE,self.catalog))
                    checked+=1
        self.assertEqual(checked,60)

    def test_repair_addition_has_required_shape_and_partial_update_keeps_fields(self):
        baseline=AnalysisIntentEnvelope.model_validate(f.envelope())
        schema=repair_tool([dict(requirement_id=None,field='metric_ids',code='explicit_metrics_missing'),
            dict(requirement_id='r1',field='time',code='explicit_time_missing')],baseline)
        variants=schema['parameters']['properties']['requirements']['items']['anyOf']
        addition=next(v for v in variants if 'repair_add_1' in v['properties']['id']['enum'])
        self.assertIn('analysis_kind',addition['required'])
        update=next(v for v in variants if v['properties']['id']['enum']==['r1'])
        self.assertEqual(set(update['properties']),{'id','time'})

    def test_metric_windows_cannot_be_swapped_between_clauses(self):
        a=request_anchors('Doanh thu 7 ngày gần nhất theo thành phố; số đơn 30 ngày gần nhất theo chi nhánh',self.catalog,{})
        good=AnalysisIntentEnvelope.model_validate(f.envelope(
            f.requirement(id='r1',metric_ids=['revenue'],dimension_ids=['city'],analysis_kind='aggregate',ranking=None,derived_features=[],time=dict(kind='rolling',amount=7,unit='day')),
            f.requirement(id='r2',metric_ids=['order_count'],dimension_ids=['store'],analysis_kind='aggregate',ranking=None,derived_features=[]))).requirements
        self.assertFalse(verify_anchors(a,good,f.REFERENCE,self.catalog))
        bad=deepcopy(good);bad[0].time,bad[1].time=bad[1].time,bad[0].time
        self.assertTrue(verify_anchors(a,bad,f.REFERENCE,self.catalog))
        bad=deepcopy(good);bad[0].dimension_ids,bad[1].dimension_ids=bad[1].dimension_ids,bad[0].dimension_ids
        self.assertTrue(verify_anchors(a,bad,f.REFERENCE,self.catalog))

    def test_optional_query_failure_keeps_requested_report_and_replays_provenance(self):
        warehouse=FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        r=self.request();p=self.pipeline(f.scripted(f.envelope()),warehouse)
        proposal=p.propose(r)
        from services.analytical_query_service import AnalyticalQueries
        original=AnalyticalQueries.run
        failed=[]
        def run(queries,artifact):
            if artifact.query.role=='supporting' and not failed:
                failed.append(artifact.query.id)
                raise AnalysisError('execution','Injected optional failure')
            return original(queries,artifact)
        with patch.object(AnalyticalQueries,'run',run):
            report=p.generate(f.approve(r,proposal))
        self.assertTrue(failed)
        self.assertEqual(report['completion_status'],'partial')
        self.assertEqual(report['outcome'],'PARTIAL_AVAILABLE')
        self.assertNotEqual(verify_saved_report(report,self.catalog)['status'],'not_scored')
        self.assertTrue(all(c['status']=='planned' for c in report['analysis_components'] if c['requested_or_supporting']=='requested'))

    def test_five_large_problems_execute_and_verify_independently(self):
        from evals import fixture_warehouse as w
        stores=deepcopy(w.STORES)
        stores[0]['loai_diem_ban']='CHI_NHANH_CHINH'
        stores[1]['loai_diem_ban']='KIOSK_NHUONG_QUYEN'
        for case in CASES:
            with self.subTest(case=case['id']), patch.dict(w.DATA,{'chi_nhanh':stores}):
                warehouse=FixtureWarehouse(self.catalog.overlay)
                try:
                    p=self.pipeline(f.scripted(intent(case)),executor=warehouse)
                    request=self.request(case['question'])
                    proposal=p.propose(request);f.approve(request,proposal)
                    report=p.generate(request)
                    self.assertEqual(p.provider.call_count,1)
                    self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
                    self.assertGreaterEqual(len(report['charts']),5)
                    self.assertLessEqual(len(report['analytical_queries']),8)
                    for query in report['analytical_queries']:
                        self.assertEqual(query['time']['end'],'2026-10-08')
                    # Separately authored totals using the fixture facts. No
                    # production SQL/compiler is used to generate expectations.
                    totals=[row for key,result in report['result_sets'].items() for row in result['rows']
                        if not next(q for q in report['analytical_queries'] if q['id']==key)['group_by']
                        and next(q for q in report['analytical_queries'] if q['id']==key)['operation']=='aggregate']
                    expected={'kiosks':{'store_revenue':400,'order_count':2},
                        'products':{'quantity_sold':12,'product_revenue':600},
                        'payments':{'payment_count':2,'payment_revenue':500,'revenue':600},
                        'vouchers':{'voucher_order_count':3,'voucher_revenue':500,'discount_amount':50},
                        'cashier_shifts':{'shift_count':2,'late_count':1,'system_cash_revenue':500,
                            'reconciled_shifts':2,'total_cash_difference':-5}}[case['id']]
                    for metric,value in expected.items():
                        self.assertTrue(any(row.get(metric)==value for row in totals),(case['id'],metric,totals))
                finally:
                    warehouse.close()
