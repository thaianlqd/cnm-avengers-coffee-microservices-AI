"""Independent oracle attempts include failures; they cannot escape the budget."""
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock

from services.verification_reconciliation_service import reconcile


def artifact(name, *, ranking=False):
    query = SimpleNamespace(role='requested', model_dump=lambda **_: {'id': name})
    plan = SimpleNamespace(kind='aggregate', metrics=['revenue'], dimensions=['city'],
                           ranking=SimpleNamespace(metric='revenue', direction='DESC', top_n=2) if ranking else None,
                           explicit_limit=False)
    return SimpleNamespace(query=query, plan=plan, result={'rows': [{'city': 'Hà Nội', 'revenue': 100}]})


class OracleBudgetTests(TestCase):
    def setUp(self):
        self.catalog = SimpleNamespace(registry={'metrics': {'revenue': {'additive': True, 'unit': 'VND', 'business_name': 'Doanh thu'}}})

    def test_failed_numeric_queries_consume_the_attempt_allowance(self):
        runner = Mock(side_effect=TimeoutError('isolated fixture timeout'))
        report = reconcile({str(i): artifact('a'+str(i)) for i in range(7)}, self.catalog, runner, max_oracle_queries=3)
        self.assertEqual(runner.call_count, 3)
        self.assertEqual(report['oracle_queries'], 3)
        self.assertEqual(report['oracle_failures'], 3)
        self.assertIsNone(report['independent_oracle'])
        self.assertTrue(all(c['status'] == 'not_measured' for c in report['numeric']))

    def test_failed_rank_queries_cannot_escape_the_same_allowance(self):
        runner = Mock(side_effect=ValueError('isolated fixture failure'))
        report = reconcile({str(i): artifact('a'+str(i), ranking=True) for i in range(7)}, self.catalog, runner, max_oracle_queries=2)
        self.assertEqual(runner.call_count, 2)
        self.assertEqual(report['oracle_queries'], 2)
        self.assertEqual(report['oracle_failures'], 2)

    def test_no_runner_or_zero_allowance_does_not_claim_measurement(self):
        for runner, maximum in ((None, 3), (Mock(), 0)):
            report = reconcile({'a': artifact('a')}, self.catalog, runner, max_oracle_queries=maximum)
            self.assertEqual(report['oracle_queries'], 0)
            self.assertIsNone(report['independent_oracle'])

    def test_negative_allowance_is_rejected(self):
        with self.assertRaises(ValueError):
            reconcile({}, self.catalog, Mock(), max_oracle_queries=-1)

    def test_changed_generation_is_incomparable_and_missing_epoch_is_unmeasured(self):
        from services.verification_reconciliation_service import compare_epochs
        original={'status':'observed','fingerprint':'a'*64}
        self.assertEqual(compare_epochs(original,original)['status'],'same_generation')
        self.assertEqual(compare_epochs(original,{'status':'observed','fingerprint':'b'*64})['status'],'incomparable_snapshot')
        for old,new in ((None,original),(original,None),({'status':'not_measured'},original)):
            self.assertEqual(compare_epochs(old,new)['status'],'not_measured')

    def test_distinct_population_cannot_use_legacy_additive_flag_across_overlapping_axes(self):
        from services.verification_reconciliation_service import _additive
        from types import SimpleNamespace
        catalog=SimpleNamespace(registry={'metrics':{'fixture':{'additive':True,'aggregation_semantics':'distinct_count'}}})
        self.assertFalse(_additive(catalog,'fixture',['city']))
        self.assertFalse(_additive(catalog,'fixture',['time']))
        catalog.registry['metrics']['fixture']['disjoint_partitions']=['customer_id']
        self.assertTrue(_additive(catalog,'fixture',['customer_id']))
        self.assertFalse(_additive(catalog,'fixture',['customer_id','city']))
