"""Deterministic verification adversaries; all external transports are forbidden."""
import json
import os
import unittest
from copy import deepcopy
from datetime import date
from unittest.mock import Mock, patch
from common import AiTextToReportRequest, AiReportRefineRequest
from services.analysis_pipeline import safe_failure
from tests.archive_planner import ArchivedGraphPipeline as AnalysisPipeline
from services.analysis_catalog import AnalysisCatalog, AnalysisError
from services.analysis_quality_service import assess_report, verify_saved_report, not_scored, WEIGHTS
from services.analysis_coverage_service import canonical_components
from services.domain_intelligence_service import DomainIntelligence
from services.analyst_decision import decision_tool
from tests.analysis_fixtures import physical_metadata, result, ranked_rows
from tests.test_one_shot_v24 import scripted
from tests.agent_fixtures import ScriptedProvider, call
from tests.test_agent_v23 import fixture_executor


def component(id='main', lens='product_volume', domain='products', **updates):
    return dict(id=id, business_goal='Yêu cầu '+id, domain_id=domain, lens_id=lens,
                operation_ids=[id], requested_or_supporting='requested', status='planned', **updates)


def plan(operations=None, components=None):
    return dict(decision_type='plan',analysis_breadth='focused',requested_operations=operations or [dict(id='main',lens_id='product_volume')],
                analysis_components=components or [component()])


class VerifiableV27Tests(unittest.TestCase):
    def setUp(self):
        for name in ('requests.sessions.Session.request','psycopg2.connect'):
            guard=patch(name,side_effect=AssertionError('External transport forbidden'));guard.start();self.addCleanup(guard.stop)
        config=patch.dict(os.environ,{'AI_OFFLINE':'1','DATA_ANALYST_MAX_PROVIDER_CALLS_PER_TURN':'2','DATA_ANALYST_ENABLE_CONTRACT_REPAIR':'1'});config.start();self.addCleanup(config.stop)
        self.catalog=AnalysisCatalog(physical_metadata())

    def pipeline(self, decision=None, provider=None):
        return AnalysisPipeline(metadata_loader=physical_metadata,provider=provider or scripted(decision or plan()),executor=Mock(return_value=result(ranked_rows(10))),value_lookup=Mock(return_value=[]))

    def approved(self, decision=None):
        p=self.pipeline(decision);req=AiTextToReportRequest(question='Phân tích sản phẩm',reference_date=date(2026,10,7))
        req.session_id=p.propose(req)['session_id'];r=p.generate(req);return p,req,r

    def test_perfect_ranking_runtime_and_restore_have_same_score(self):
        p,req,r=self.approved();q=r['quality_assessment']
        self.assertGreaterEqual(q['score'],90);self.assertEqual(q['grade'],'excellent')
        self.assertEqual(q,verify_saved_report(r,self.catalog));self.assertEqual(p.provider.call_count,1)
        self.assertEqual(sum(WEIGHTS.values()),100);self.assertTrue(q['completed'][0]['evidence_refs'])
        self.assertEqual(q['generated_by'],'deterministic_verifier')

    def test_scalar_has_no_visual_penalty(self):
        d=plan([{'id':'main','lens_id':'sales_overview'}],[component(lens='sales_overview',domain='orders')])
        p=self.pipeline(d);p.executor=Mock(return_value=result([{'revenue':1500}]))
        req=AiTextToReportRequest(question='Tổng doanh thu',reference_date=date(2026,10,7));req.session_id=p.propose(req)['session_id'];r=p.generate(req)
        self.assertEqual(r['charts'],[]);self.assertGreaterEqual(r['quality_assessment']['score'],90)
        v=next(c for c in r['quality_assessment']['components'] if c['id']=='visualization_appropriateness')
        self.assertEqual(v['status'],'not_applicable');self.assertEqual(v['score'],10)

    def test_null_scalar_is_insufficient_data_without_a_score(self):
        d=plan([{'id':'main','lens_id':'sales_overview'}],[component(lens='sales_overview',domain='orders')])
        p=self.pipeline(d);p.executor=Mock(return_value=result([{'revenue':None}]))
        req=AiTextToReportRequest(question='Tổng doanh thu',reference_date=date(2026,10,7));req.session_id=p.propose(req)['session_id']
        with self.assertRaises(AnalysisError) as caught:p.generate(req)
        self.assertEqual(caught.exception.category,'insufficient_data')
        self.assertIsNone(safe_failure(caught.exception)['quality_assessment']['score'])

    def test_saved_comment_conclusion_label_and_numeric_finding_are_verified(self):
        _,_,r=self.approved()
        for field in ('comment','conclusion','label','finding_value'):
            with self.subTest(field=field):
                bad=deepcopy(r)
                if field=='comment':bad['key_findings'][0]['comment']='Chắc chắn chiến dịch làm tăng doanh thu.'
                elif field=='conclusion':bad['conclusions']=['Chắc chắn chiến dịch làm tăng doanh thu.']
                elif field=='label':bad['kpi_cards'][0]['label']='Lợi nhuận ròng'
                else:bad['key_findings'][0]['value']=999999
                self.assertLess(verify_saved_report(bad,self.catalog)['score'],90)

    def test_export_recomputes_stale_score_without_sql_or_provider(self):
        from routers.reports import _verified_export
        from services.docx_service import generate_report_docx
        from docx import Document
        _,_,r=self.approved();r['quality_assessment']={'score':1}
        with patch('services.metadata_service.get_local_metadata',return_value=physical_metadata()):
            verified=_verified_export(r)
        self.assertGreaterEqual(verified['quality_assessment']['score'],90)
        text=' '.join(p.text for p in Document(generate_report_docx(verified)).paragraphs)
        self.assertIn('Mức độ kiểm chứng',text)
        self.assertIn('/100',text)

    def test_partial_requires_explicit_approval_and_caps_score(self):
        missing=component('history',lens='delivery_volume',domain='delivery');missing.update(operation_ids=[],status='insufficient_data',reason='historical_data_unavailable')
        p=self.pipeline(plan(components=[component(),missing]));req=AiTextToReportRequest(question='Sản phẩm và lịch sử shipper',reference_date=date(2026,10,7))
        proposal=p.propose(req);self.assertEqual(proposal['outcome'],'PARTIAL_AVAILABLE');req.session_id=proposal['session_id']
        with self.assertRaises(AnalysisError) as caught:p.generate(req)
        self.assertEqual(caught.exception.category,'approval_required');p.executor.assert_not_called()
        req.accept_partial_scope=True;r=p.generate(req);q=r['quality_assessment']
        self.assertEqual(r['outcome'],'PARTIAL_AVAILABLE');self.assertEqual(r['completion_status'],'partial')
        self.assertLessEqual(q['score'],74);self.assertNotEqual(q['grade'],'excellent');self.assertEqual(len(q['missing']),1)
        self.assertEqual(q['suggested_next_actions'][-1]['action'],'add_history');self.assertEqual(p.provider.call_count,1)

    def test_tampered_evidence_kpi_finding_and_summary_reduce_score(self):
        _,_,r=self.approved()
        for target in ('evidence','kpi_cards','key_findings','executive_summary'):
            with self.subTest(target=target):
                bad=deepcopy(r)
                if target=='evidence':bad[target][0]['values']['value']=123456789
                elif target=='kpi_cards':bad[target][0]['value']=123456789
                elif target=='key_findings':bad[target][0]['finding']='Chắc chắn do chiến dịch quảng cáo.'
                else:bad[target]='Doanh thu chắc chắn tăng do quảng cáo.'
                q=verify_saved_report(bad,self.catalog);self.assertLess(q['score'],90);self.assertTrue(q['unverified'])

    def test_invalid_chart_numbers_and_shape_never_excellent(self):
        _,_,r=self.approved()
        for change in ('number','type','coverage','duplicate'):
            bad=deepcopy(r)
            if change=='number':bad['charts'][0]['data'][0]['quantity_sold']=999999
            elif change=='type':bad['charts'][0]['chart_type']='donut'
            elif change=='coverage':bad['charts'][0]['scope_refs']=['nonexistent']
            else:bad['charts'].append(deepcopy(bad['charts'][0]))
            q=verify_saved_report(bad,self.catalog);self.assertLessEqual(q['score'],74)

    def test_equivalent_metric_aliases_share_one_chart_without_losing_coverage(self):
        d=plan([{'id':'main','lens_id':'sales_overview','metrics':['revenue'],'group_by':['store']},
                {'id':'branch','lens_id':'store_performance','metrics':['store_revenue'],'group_by':['store']}],
               [component(lens='sales_overview',domain='orders'),component('branch',lens='store_performance',domain='stores')])
        p=self.pipeline(d)
        p.executor=Mock(side_effect=lambda sql,**kw:result([{'store':'Chi nhánh A','store_id':'s1',
            'store_revenue' if 'AS store_revenue' in sql or 'AS "store_revenue"' in sql else 'revenue':1500}]))
        req=AiTextToReportRequest(question='Doanh thu và doanh thu chi nhánh',reference_date=date(2026,10,7));req.session_id=p.propose(req)['session_id'];r=p.generate(req)
        self.assertEqual(len(r['charts']),1);self.assertEqual(set(r['charts'][0]['scope_refs']),{'main','branch'})
        self.assertGreaterEqual(r['quality_assessment']['score'],90)
        self.assertEqual(r['quality_assessment'],verify_saved_report(r,self.catalog))
        bad=deepcopy(r);bad['result_sets']['branch']['rows'][0]['store_revenue']=99999
        self.assertLessEqual(verify_saved_report(bad,self.catalog)['score'],74)

    def test_stale_legacy_failed_invalid_result_unscored(self):
        _,_,r=self.approved()
        bads=[{},dict(r,status='error'),dict(r,quality_context={}),dict(r,analysis_components=[])]
        stale=deepcopy(r);stale['quality_context']['catalog_fingerprint']='stale';bads.append(stale)
        invalid=deepcopy(r);invalid['result_sets']['main']['rows'][0]['quantity_sold']=-1;bads.append(invalid)
        invalid=deepcopy(r);invalid['result_contracts']['main']['valid']=False;bads.append(invalid)
        for bad in bads:
            q=verify_saved_report(bad,self.catalog);self.assertIsNone(q['score']);self.assertEqual(q['status'],'not_scored')

    def test_oversized_and_injected_payload_is_unscored_without_external_calls(self):
        _,_,r=self.approved()
        bad=deepcopy(r);bad['result_sets']['main']['rows']*=250
        self.assertIsNone(verify_saved_report(bad,self.catalog)['score'])
        bad=deepcopy(r);bad['analytical_queries'][0]['metrics']=['SUM(foo); DROP TABLE users']
        self.assertIsNone(verify_saved_report(bad,self.catalog)['score'])
        bad=deepcopy(r);bad['sql_query']='DROP TABLE users';bad['sql_by_query']={'main':'DROP TABLE users'}
        # Stored SQL is inert: only the logical algebra is recompiled and checked.
        self.assertEqual(verify_saved_report(bad,self.catalog)['score'],r['quality_assessment']['score'])

    def test_missing_limitations_reduce_score_and_remain_visible(self):
        _,_,r=self.approved();r['quality_limitations']=[];q=verify_saved_report(r,self.catalog)
        self.assertLess(q['score'],90);self.assertTrue(q['limitations'])

    def test_declared_operation_mapping_repaired_once_before_sql(self):
        bad=plan();bad['analysis_components'][0]['operation_ids']=['missing']
        provider=ScriptedProvider([call('submit_analyst_decision',bad)],[call('submit_analyst_decision',plan())])
        p=self.pipeline(provider=provider);req=AiTextToReportRequest(question='Sản phẩm bán chạy',reference_date=date(2026,10,7));r=p.propose(req)
        self.assertEqual(r['status'],'proposal_ready');self.assertEqual(provider.call_count,2);p.executor.assert_not_called()
        self.assertEqual(r['diagnostics']['repair_round_count'],1)

    def test_repair_cannot_drop_requested_components(self):
        bad=plan();other=component('other',lens='product_sales');other['operation_ids']=['absent'];bad['analysis_components'].append(other)
        provider=ScriptedProvider([call('submit_analyst_decision',bad)],[call('submit_analyst_decision',plan())])
        p=self.pipeline(provider=provider)
        with self.assertRaises(AnalysisError):p.propose(AiTextToReportRequest(question='Sản phẩm và doanh thu',reference_date=date(2026,10,7)))
        self.assertEqual(provider.call_count,2);p.executor.assert_not_called()

    def test_failure_outcomes_have_no_score(self):
        for category,outcome in [('insufficient_data','INSUFFICIENT_DATA'),('historical_metric_unavailable','INSUFFICIENT_DATA'),('execution','SYSTEM_ERROR')]:
            r=safe_failure(AnalysisError(category,'private detail'))
            self.assertEqual(r['outcome'],outcome);self.assertIsNone(r['quality_assessment']['score']);self.assertNotIn('private detail',json.dumps(r))

    def test_all_metadata_definitions_examples_and_business_links(self):
        r=self.catalog.registry;intel=DomainIntelligence(self.catalog)
        self.assertEqual(len(intel.available()),16);self.assertEqual(sum(len(p['analytical_lenses']) for p in intel.available().values()),38)
        for m in r['metrics'].values():
            for key in ('business_definition','population_definition','aggregation_behavior','additivity_by_dimension','historical_capability','quality_direction','invalid_uses'):self.assertTrue(m.get(key),key)
        self.assertEqual(r['metrics']['aov']['aggregation_semantics'],'average')
        for d in r['dimensions'].values():
            for key in ('business_meaning','grouping_semantics','filter_semantics','cardinality_hint'):self.assertTrue(d.get(key),key)
        for p in intel.available().values():
            for lens in p['analytical_lenses']:self.assertEqual(len(lens['example_intents']),2)
        self.assertTrue(r['domain_intelligence']['business_relationships'])

    def test_unknown_vocabulary_broadens_knowledge_without_authorizing_queries(self):
        intel=DomainIntelligence(self.catalog);cs=intel.candidates('zzzz unknown vocabulary','auto','focused')
        self.assertGreaterEqual(len(cs),3);self.assertFalse(any(c['protected'] for c in cs))
        provider=scripted(plan());p=self.pipeline(provider=provider);p.propose(AiTextToReportRequest(question='zzzz unknown vocabulary',reference_date=date(2026,10,7)))
        self.assertEqual(p.semantic_info['retrieval_confidence'],'low');self.assertGreater(p.semantic_info['global_lens_directory_chars'],0)
        p.executor.assert_not_called()

    def test_unknown_unavailable_domain_and_duplicate_components_rejected(self):
        for components in ([component(),component()], [dict(component(),status='unsupported',reason='metric_unavailable',operation_ids=[],domain_id='invented')]):
            with self.assertRaises(AnalysisError):canonical_components(components,{},DomainIntelligence(self.catalog))

    def test_startup_default_performs_no_warehouse_mutations(self):
        import server
        with patch.object(server,'init_warehouse_views',side_effect=AssertionError('No DDL')) as init,patch.dict(os.environ,{'ANALYTICS_INITIALIZE_WAREHOUSE_ON_STARTUP':'false'}):
            server.on_startup();init.assert_not_called()

    def test_schema_declares_coverage_without_private_reasoning(self):
        schema=decision_tool(natural=True)['parameters']['properties']['analysis_components']
        self.assertEqual(schema['maxItems'],16);self.assertNotIn('reasoning',schema['items']['properties'])
        self.assertIn('analysis_components',decision_tool(natural=True)['parameters']['required'])
        self.assertNotIn('analysis_components',decision_tool(natural=False)['parameters']['required'])
