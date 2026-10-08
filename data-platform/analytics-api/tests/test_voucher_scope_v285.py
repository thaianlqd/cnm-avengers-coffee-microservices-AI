"""Voucher populations, identity, orphan lookups, guardrails and safe errors.

All AI responses are scripted and HTTP/database transports are forbidden.
Recorded failures supply diagnostic codes only; these are fresh intent shapes.
"""
from copy import deepcopy
from unittest.mock import Mock,patch
from services.analysis_intent import AnalysisIntentEnvelope,intent_tool
from services.analytical_resolver import AnalyticalResolver,ResolutionIssues
from services.analysis_pipeline import safe_failure
from services.analysis_catalog import AnalysisError
from services.analysis_quality_service import verify_saved_report
from services.request_anchors import request_anchors,refinement_anchors
from tests import test_hybrid_v28 as fixture
from evals.fixture_warehouse import FixtureWarehouse,DATA

QUESTION=('Đánh giá việc sử dụng voucher trong 60 ngày gần nhất: số đơn dùng từng voucher, '
 'doanh thu đơn có voucher, tổng tiền giảm giá, giá trị đơn trung bình và tỷ trọng đóng góp '
 'của từng voucher vào tổng doanh thu có voucher. So sánh voucher dẫn đầu theo số đơn với '
 'voucher dẫn đầu theo doanh thu. Nêu rõ giới hạn khi đánh giá hiệu quả; nếu thiếu dữ liệu '
 'chi phí hoặc đối chứng thì không kết luận ROI hay tác động tăng doanh thu.')


def meaning(kind='detail',explicit=True):
    base=dict(domain_id='promotions',dimension_ids=['promotion'],ranking=None,
              time=dict(kind='rolling',amount=60,unit='day'))
    breakdown=fixture.requirement(id='voucher_breakdown_60d',goal='Thống kê từng mã voucher',
        **base,metric_ids=['voucher_order_count','voucher_revenue','discount_amount','aov'],
        analysis_kind=kind,derived_features=['contribution_share'],
        **({'feature_metrics':{'contribution_share':['voucher_revenue']}} if explicit else {}))
    leaders=[fixture.requirement(id=id,goal='Voucher dẫn đầu',**{**base,'ranking':{'limit':1,'metric_id':m}},
        metric_ids=[m],analysis_kind='ranking',derived_features=['leader'])
        for id,m in [('voucher_order_leader_60d','voucher_order_count'),('voucher_revenue_leader_60d','voucher_revenue')]]
    return fixture.envelope(breakdown,*leaders)


class VoucherTests(fixture.unittest.TestCase):
    setUp=fixture.HybridTests.setUp
    pipeline=fixture.HybridTests.pipeline
    request=fixture.HybridTests.request

    def report(self,intent=None,data=None):
        if data is not None:
            with patch.dict(DATA,data):warehouse=FixtureWarehouse(self.catalog.overlay)
        else:warehouse=FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        p=self.pipeline(fixture.scripted(intent or meaning()),executor=Mock(wraps=warehouse))
        req=self.request(QUESTION);proposal=p.propose(req);p.executor.assert_not_called()
        fixture.approve(req,proposal);report=p.generate(req)
        self.assertEqual(report['outcome'],'SUCCESS')
        self.assertEqual(p.provider.call_count,1)
        self.assertEqual(report['quality_assessment'],verify_saved_report(report,self.catalog))
        return p,report

    def rows(self,report,metric):
        q=next(q for q in report['analytical_queries'] if not q.get('ranking') and q['group_by'] and metric in q['metrics'])
        return {r['promotion_id']:r[metric] for r in report['result_sets'][q['id']]['rows']}

    def test_recorded_detail_and_guardrail_failure_now_single_interpretation(self):
        p,r=self.report()
        self.assertEqual(self.rows(r,'voucher_order_count'),{'v1':2,'v2':1})
        self.assertEqual(self.rows(r,'voucher_revenue'),{'v1':100,'v2':400})
        self.assertEqual(self.rows(r,'discount_amount'),{'v1':10,'v2':40})
        self.assertEqual(self.rows(r,'aov'),{'v1':100,'v2':400})
        self.assertTrue(any(n['value']=='aggregate' for n in p.semantic_info['semantic_normalizations']))

    def test_voucher_charts_and_conclusions_keep_code_identity(self):
        _,r=self.report(data={'khuyen_mai':[dict(v,ten_khuyen_mai='Cùng chương trình') for v in DATA['khuyen_mai']]})
        charts=[c for c in r['charts'] if c['query_id'] in {q['id'] for q in r['analytical_queries'] if not q.get('ranking') and q['group_by']}]
        self.assertTrue(charts)
        for c in charts:
            self.assertEqual(len(c['data']),2)
            self.assertEqual({row['label'] for row in c['data']},{'Cùng chương trình (v1)','Cùng chương trình (v2)'})
        leaders=[e for e in r['evidence'] if e['feature']=='leader']
        self.assertEqual({e['values']['entity'] for e in leaders},{'Cùng chương trình (v1)','Cùng chương trình (v2)'})
        shares=[e for e in r['evidence'] if e['feature']=='contribution_share']
        self.assertEqual({e['metric'] for e in shares},{'voucher_revenue'})
        self.assertEqual({e['values']['dimensions']['promotion_id']:e['values']['share_pct'] for e in shares},{'v1':20,'v2':80})
        leaders={e['metric']:e['values'] for e in r['evidence'] if e['feature']=='leader'}
        self.assertNotEqual(leaders['voucher_order_count'],leaders['voucher_revenue'])
        self.assertEqual(r['quality_assessment']['score'],90)
        self.assertTrue(any('không kết luận ROI' in l['label'] for l in r['quality_limitations']))

    def test_mixed_additive_average_default_targets_do_not_discard_aggregate(self):
        _,r=self.report(meaning('aggregate',False))
        self.assertEqual(self.rows(r,'aov'),{'v1':100,'v2':400})
        self.assertTrue(all(e['metric']!='aov' for e in r['evidence'] if e['feature']=='contribution_share'))

    def test_same_program_label_does_not_merge_codes(self):
        data={'khuyen_mai':[dict(v,ten_khuyen_mai='Cùng chương trình') for v in DATA['khuyen_mai']]}
        _,r=self.report(data=data)
        self.assertEqual(self.rows(r,'voucher_revenue'),{'v1':100,'v2':400})
        self.assertEqual(self.rows(r,'aov'),{'v1':100,'v2':400})

    def test_unmatched_code_retained_for_every_metric_and_denominator(self):
        data={'don_hang':[*DATA['don_hang'],dict(DATA['don_hang'][0],ma_don_hang='orphan',ma_voucher='missing',tong_tien=500,so_tien_giam=50)]}
        _,r=self.report(data=data)
        self.assertEqual(self.rows(r,'voucher_revenue'),{'v1':100,'v2':400,'missing':500})
        self.assertEqual(self.rows(r,'aov'),{'v1':100,'v2':400,'missing':500})
        self.assertEqual(self.rows(r,'voucher_order_count'),{'v1':2,'v2':1,'missing':1})
        shares=[e for e in r['evidence'] if e['feature']=='contribution_share']
        self.assertEqual({e['values']['denominator'] for e in shares},{1000})
        self.assertEqual(sum(e['values']['share_pct'] for e in shares),100)
        self.assertTrue(any(e['values'].get('entity')=='missing' for e in shares))

    def test_negated_capability_is_constraint_positive_roi_remains_requested(self):
        for q in ['Không kết luận ROI','Nếu thiếu dữ liệu thì không tính ROI','Chưa suy ra ROI','Đừng kết luận về ROI']:
            a=request_anchors(q,self.catalog,{})
            self.assertFalse(a['capabilities']);self.assertTrue(a['capability_constraints'])
        for q in ['Tính ROI','Không chỉ ROI mà cả doanh thu','Nếu có dữ liệu hãy tính ROI','Không kết luận ROI. Nhưng hãy tính ROI']:
            self.assertTrue(request_anchors(q,self.catalog,{})['capabilities'])
        self.assertFalse(request_anchors(QUESTION,self.catalog,{})['capabilities'])

    def test_invalid_explicit_targets_fail_instead_of_silently_dropping(self):
        for target in [[],['aov'],['unknown'],['revenue']]:
            raw=meaning('aggregate');raw['requirements'][0]['feature_metrics']={'contribution_share':target}
            if target==['aov']:
                resolved=AnalyticalResolver(self.catalog,fixture.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(raw))
                self.assertEqual(next(c for c in resolved['coverage'] if c['requirement_id']=='voucher_breakdown_60d')['state'],'UNSUPPORTED')
            else:
                with self.assertRaises(ResolutionIssues):
                    AnalyticalResolver(self.catalog,fixture.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(raw))

    def test_feature_schema_is_finite_on_primary_and_delta(self):
        for delta in [False,True]:
            schema=intent_tool(delta)['parameters']['properties']
            props=(schema['changes']['items']['properties']['changes'] if delta else schema['requirements']['items'])['properties']
            self.assertEqual(set(props['feature_metrics']['properties']),{'scalar','contribution_share','leader','top_gap','group_gap','change','change_pct','concentration','selected_total','relationship_strength'})

    def test_feature_metric_target_cannot_change_in_unrelated_refinement(self):
        intent=meaning('aggregate')
        delta={'changes':[{'action':'update','requirement_id':'voucher_breakdown_60d','changes':{'feature_metrics':{'contribution_share':['discount_amount']}}}]}
        with self.assertRaises(ResolutionIssues):refinement_anchors(QUESTION,intent,[{'feedback':'Đổi màu biểu đồ','delta':delta}],self.catalog,{},fixture.REFERENCE)

    def test_nonsense_and_older_generic_clarification_have_specific_safe_help(self):
        for reason in ['not_analytical_request','clarification']:
            p=self.pipeline(fixture.scripted({'decision':'clarification','clarification':{'reason':reason,'missing_fields':['analysis_goal','RAW SECRET SQL']}}))
            with self.assertRaises(AnalysisError) as caught:p.propose(self.request('hihi'))
            failure=safe_failure(caught.exception,p.calls,p.semantic_info)
            self.assertEqual(failure['outcome'],'NEEDS_INPUT');self.assertIsNone(failure['quality_assessment']['score'])
            self.assertIn('mục tiêu',failure['issue']['what_is_missing'][0])
            self.assertIn('Doanh thu',failure['issue']['resolution_guidance'])
            self.assertNotIn('RAW SECRET',str(failure));p.executor.assert_not_called()

    def test_root_failure_explains_conflict_and_fix_without_raw_provider_prose(self):
        error=ResolutionIssues([{'requirement_id':'x','field':'frozen','code':'accepted_requirement_changed'}])
        f=safe_failure(error,[],{'root_contract_issues':[{'requirement_id':'x','field':'analysis_kind','code':'detail_aggregate_conflict'}],
            'contract_issues':error.issues,'provider_call_count':3})
        self.assertIn('SUM/COUNT/AVG',' '.join(f['issue']['what_is_missing']))
        self.assertIn('Giữ nguyên câu hỏi',f['issue']['resolution_guidance'])
