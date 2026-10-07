"""The evaluator must reject deliberately wrong answers, not self-grade to 100%."""
import unittest
from copy import deepcopy
from unittest.mock import patch
from services.analysis_catalog import AnalysisCatalog
from tests.analysis_fixtures import physical_metadata
from evals.golden import load_cases
from evals.scorers import prf,wilson,tokens,filters,stability,assess_case
from evals.fixture_warehouse import FixtureWarehouse,oracle,result_equal
from evals.run_eval import run_offline,CRITICAL_IDS
from tools.audit_semantics_v27 import audit

class EvalV27Tests(unittest.TestCase):
    def setUp(self):
        for name in ('requests.sessions.Session.request','psycopg2.connect'):
            guard=patch(name,side_effect=AssertionError('External service forbidden'));guard.start();self.addCleanup(guard.stop)
        self.catalog=AnalysisCatalog(physical_metadata());self.cases=load_cases()
    def test_golden_count_all_domains_lenses_and_split_families(self):
        self.assertEqual(len(self.cases),100);ops=[o for c in self.cases for o in c['expected_operations']]
        self.assertEqual(len({o['domain_id'] for o in ops}),16);self.assertEqual(len({o['lens_id'] for o in ops}),38)
        families={}
        for c in self.cases:families.setdefault(c['family'],set()).add(c['split'])
        self.assertTrue(all(len(v)==1 for v in families.values()));self.assertEqual(len(CRITICAL_IDS),20)
    def test_precision_recall_f1_wrong_metric_and_missing_lens(self):
        self.assertEqual(prf({'a','b'},{'a'})['precision'],.5);self.assertEqual(prf({'a'},{'a','b'})['recall'],.5)
        self.assertEqual(prf(set(),set())['f1'],1)
        expected=self.cases[0]['expected_operations'];bad=deepcopy(expected);bad[0]['metrics']=['invented']
        self.assertEqual(prf(tokens(bad)['metric'],tokens(expected)['metric'])['f1'],0)
        bad[0]['lens_id']='wrong';self.assertEqual(prf(tokens(bad)['lens'],tokens(expected)['lens'])['f1'],0)
    def test_filter_order_is_irrelevant_but_values_and_operators_matter(self):
        a=[{'dimension':'city','operator':'in','value':['Hà Nội','Hồ Chí Minh']}];b=deepcopy(a);b[0]['value'].reverse()
        self.assertEqual(filters(a),filters(b));b[0]['value']=['Hà Nội'];self.assertNotEqual(filters(a),filters(b))
        self.assertEqual(filters([{'dimension':'city','value':'Hà Nội'}]),filters(b))
    def test_time_and_ranking_comparison_are_exact(self):
        c=deepcopy(next(c for c in self.cases if c['family']=='product_volume'));e=c['expected_operations'];bad=deepcopy(e)
        bad[0]['period']['start']='2026-08-01';self.assertNotEqual(tokens(e)['time'],tokens(bad)['time'])
        bad[0]['ranking']['top_n']=5;self.assertNotEqual(tokens(e)['ranking'],tokens(bad)['ranking'])
    def test_wilson_intervals_include_observation_and_boundary(self):
        self.assertIsNone(wilson(0,0));self.assertAlmostEqual(wilson(0,10)[0],0);self.assertAlmostEqual(wilson(10,10)[1],1)
        low,high=wilson(5,10);self.assertLess(low,.5);self.assertGreater(high,.5)
    def test_independent_oracle_excludes_cancelled_orders_and_distinct_buyers(self):
        base={'operation':'aggregate','group_by':[],'filters':[],'metrics':['revenue']}
        self.assertEqual(oracle(base),[{'revenue':700}])
        self.assertEqual(oracle(dict(base,metrics=['order_count'])),[{'order_count':4}])
        self.assertEqual(oracle(dict(base,metrics=['purchasing_customer_count'])),[{'purchasing_customer_count':2}])
        self.assertEqual(oracle(dict(base,metrics=['discount_amount'])),[{'discount_amount':50}])
    def test_fixture_engine_is_query_only_and_not_a_live_database(self):
        w=FixtureWarehouse(self.catalog.overlay);self.addCleanup(w.close)
        self.assertEqual(w('SELECT SUM(tong_tien) AS revenue FROM silver.don_hang')['rows'][0]['revenue'],1000)
        with self.assertRaises(ValueError):w('DELETE FROM silver.don_hang')
        with self.assertRaises(Exception):w.connection.execute('DELETE FROM silver.don_hang')
    def test_result_oracle_detects_wrong_number_identity_and_extra_row(self):
        good=[{'product_id':'p1','value':5}]
        self.assertTrue(result_equal(good,good));self.assertFalse(result_equal([dict(good[0],value=6)],good))
        self.assertFalse(result_equal([dict(good[0],product_id='p2')],good));self.assertFalse(result_equal(good*2,good))
    def test_correct_refusal_and_clarification_count_as_pass(self):
        for id in ('profit','ambiguous_store','history_shipper'):
            c=next(c for c in self.cases if c['id']==id)
            r=assess_case(c,{'outcome':c['expected_outcome'],'status':'needs_clarification'},self.catalog)
            self.assertTrue(r['passed']);self.assertIsNone(r['result_exact'])
    def test_unexpected_refusal_for_supported_question_fails(self):
        r=assess_case(self.cases[0],{'outcome':'UNSUPPORTED','status':'error'},self.catalog)
        self.assertFalse(r['passed']);self.assertIn('wrong_outcome',r['failures'])
    def test_stability_does_not_count_missing_or_duplicate_runs(self):
        rows=[dict(id='a',run_id=str(i),passed=i!=2,outcome='SUCCESS') for i in range(3)]
        s=stability(rows);self.assertEqual(s['complete_cases'],1);self.assertEqual(s['all_runs_pass_rate'],0)
        self.assertEqual(stability(rows[:2])['complete_cases'],0)
        with self.assertRaises(ValueError):stability(rows+[rows[0]])
    def test_synthetic_metadata_audit_all_blueprints(self):
        r=audit(self.catalog);self.assertEqual(r['errors'],[]);self.assertEqual((r['domain_count'],r['lens_count']),(16,38))
    def test_production_does_not_import_golden_or_contain_fixture_ids(self):
        from pathlib import Path
        root=Path(__file__).resolve().parent.parent/'services'
        for file in root.glob('*.py'):
            s=file.read_text();self.assertNotIn('from evals.',s);self.assertNotIn('import evals',s);self.assertNotIn('scoped_4',s)
