"""Inactive binding noise never consumes semantic retries or hides requested work."""
from copy import deepcopy
from unittest.mock import Mock
from services.analysis_intent import AnalysisIntentEnvelope, remove_inactive_feature_bindings
from services.analytical_resolver import AnalyticalResolver, ResolutionIssues
from services.analysis_quality_service import verify_saved_report
from services.analysis_catalog import AnalysisError
from evals.fixture_warehouse import FixtureWarehouse
from tests import test_hybrid_v28 as f
from tests.test_capacity_v29 import req
from tests.test_final_review_v29 import OVERVIEW_45D


def observed_shape(binding):
    trend=req('sales_summary_trend_type',['revenue','order_count','aov'],['order_type'],
        kind='trend',days=45,granularity='week',feature_metrics=binding)
    comparison=req('sales_summary_comparison',['revenue','order_count','aov'],['order_type'],
        kind='comparison',days=45,features=['contribution_share'],
        feature_metrics={'contribution_share':['revenue']})
    return f.envelope(trend,comparison)


class InactiveBindingTests(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request

    def test_observed_shapes_and_inactive_target_variants_complete_on_primary(self):
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        fingerprints=set()
        for targets in ([],['revenue'],['aov'],['order_count'],['unknown_metric'],['revenue','aov']):
            with self.subTest(targets=targets):
                raw=observed_shape({'contribution_share':targets})
                p=self.pipeline(f.scripted(raw),executor=Mock(wraps=warehouse))
                request=self.request(OVERVIEW_45D);proposal=p.propose(request)
                self.assertEqual(p.provider.call_count,1);p.executor.assert_not_called()
                self.assertEqual(len([q for q in proposal['proposal']['analytical_queries'] if q['role']=='requested']),5)
                changes=proposal['diagnostics']['semantic_normalizations']
                self.assertTrue(any(c['rule']=='inactive_feature_binding' and c['feature']=='contribution_share' for c in changes))
                fingerprints.add(proposal['proposal']['resolved_plan_fingerprint'])
                f.approve(request,proposal);report=p.generate(request)
                self.assertEqual(report['outcome'],'SUCCESS');self.assertEqual(p.provider.call_count,1)
                self.assertEqual(p.executor.call_count,len(report['analytical_queries']))
                self.assertLessEqual(report['quality_assessment']['score'],90)
                checks={c['id']:c for c in report['quality_assessment']['verification_checks']}
                for key in ('request_coverage','semantic_consistency','derived_features','analysis_depth_coverage'):
                    self.assertEqual(checks[key]['status'],'passed')
                self.assertEqual(verify_saved_report(report,self.catalog),report['quality_assessment'])
                self.assertTrue(all(c['state']=='RESOLVED' for c in report['resolved_requirement_coverage']))
                shares=[e for e in report['evidence'] if e['feature']=='contribution_share']
                self.assertEqual({e['metric'] for e in shares},{'revenue'})
                self.assertAlmostEqual(sum(e['values']['share_pct'] for e in shares),100)
        self.assertEqual(len(fingerprints),1)

    def test_all_inactive_features_are_structural_noise_not_a_share_specific_rule(self):
        raw=observed_shape({'contribution_share':['aov'],'leader':['revenue'],'change_pct':[]})
        original=AnalysisIntentEnvelope.model_validate(raw);baseline=original.model_copy(deep=True)
        normalized,changes=remove_inactive_feature_bindings(original)
        self.assertEqual(original,baseline)
        self.assertEqual(normalized.requirements[0].feature_metrics,{})
        self.assertEqual({c['feature'] for c in changes},{'contribution_share','leader','change_pct'})
        self.assertEqual(normalized.requirements[1],baseline.requirements[1])
        before=baseline.requirements[0].model_dump();after=normalized.requirements[0].model_dump()
        before.pop('feature_metrics');after.pop('feature_metrics');self.assertEqual(before,after)
        self.assertEqual(remove_inactive_feature_bindings(normalized),(normalized,[]))

    def test_active_empty_invalid_and_nonadditive_bindings_are_never_dropped(self):
        for targets in ([],['unknown_metric'],['aov']):
            raw=observed_shape({});raw['requirements']=raw['requirements'][1:]
            raw['requirements'][0]['feature_metrics']={'contribution_share':targets}
            intent=AnalysisIntentEnvelope.model_validate(raw)
            normalized,changes=remove_inactive_feature_bindings(intent)
            self.assertEqual(normalized,intent);self.assertEqual(changes,[])
            resolver=AnalyticalResolver(self.catalog,f.REFERENCE)
            if targets==['aov']:
                self.assertEqual(resolver.resolve(normalized)['coverage'][0]['state'],'UNSUPPORTED')
            else:
                with self.assertRaises(ResolutionIssues):resolver.resolve(normalized)

    def test_orphan_hint_cannot_satisfy_a_missing_requested_feature(self):
        raw=observed_shape({'contribution_share':['revenue']});raw['requirements']=raw['requirements'][:1]
        p=self.pipeline(f.scripted(raw,raw,raw))
        with self.assertRaises(AnalysisError):p.propose(self.request(OVERVIEW_45D))
        self.assertEqual(p.provider.call_count,3);p.executor.assert_not_called()
        self.assertIn('explicit_features_missing',{i['code'] for i in p.semantic_info['root_contract_issues']})

    def test_resolver_and_approved_report_still_reject_inactive_bindings(self):
        raw=observed_shape({'contribution_share':['revenue']})
        with self.assertRaises(ResolutionIssues) as caught:
            AnalyticalResolver(self.catalog,f.REFERENCE).resolve(AnalysisIntentEnvelope.model_validate(raw))
        self.assertEqual(caught.exception.issues[0]['binding_failure'],'inactive_feature')
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(f.scripted(observed_shape({})),executor=Mock(wraps=warehouse))
        request=self.request(OVERVIEW_45D);proposal=p.propose(request);f.approve(request,proposal)
        report=p.generate(request);tampered=deepcopy(report)
        trend=next(r for r in tampered['semantic_intent']['requirements'] if r['analysis_kind']=='trend')
        trend['feature_metrics']={'contribution_share':['revenue']}
        verification=verify_saved_report(tampered,self.catalog)
        self.assertEqual(verification['status'],'not_scored')
        self.assertIsNone(verification['score'])

    def test_frozen_repair_cannot_silently_clean_or_introduce_binding_noise(self):
        raw=observed_shape({});raw['requirements'][0].update(derived_features=['leader'],
            feature_metrics={'leader':['revenue']})
        attack=f.envelope({'id':'sales_summary_trend_type','derived_features':[],
            'feature_metrics':{'contribution_share':['revenue']}})
        p=self.pipeline(f.scripted(raw,attack,attack))
        with self.assertRaises(AnalysisError):p.propose(self.request(OVERVIEW_45D))
        self.assertEqual(p.provider.call_count,3);p.executor.assert_not_called()
