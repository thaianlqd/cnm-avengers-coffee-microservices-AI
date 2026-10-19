"""Rank correlation and sensitivity: independent hand fixtures, full populations."""
from unittest import TestCase
from services.insight_service import paired_observations,_average_ranks


class RelationshipDiagnosticsTests(TestCase):
    def pair(self,x,y):
        return paired_observations([{'key':i,'a':v} for i,v in enumerate(x)],
            [{'key':i,'b':v} for i,v in enumerate(y)],'key','a','b')

    def test_spearman_average_ties_matches_hand_rank_fixture(self):
        # Ranks X=[1,2.5,2.5,4,5], Y=[5,3.5,3.5,2,1] are exact reversals.
        self.assertEqual(_average_ranks([1,2,2,3,4]),[1,2.5,2.5,4,5])
        result=self.pair([1,2,2,3,4],[9,7,7,4,1])
        self.assertEqual(result['spearman'],-1)
        self.assertEqual(result['n'],5)
        self.assertEqual(result['sensitivity']['full_n'],5)

    def test_monotone_nonlinear_relationship_differs_from_pearson_without_changing_sample(self):
        result=self.pair(list(range(1,11)),[i*i for i in range(1,11)])
        self.assertEqual(result['spearman'],1)
        self.assertLess(result['r'],1)
        self.assertEqual(result['n'],10)

    def test_outlier_diagnostic_does_not_remove_full_pair_or_promote_coefficient(self):
        result=self.pair(list(range(1,11))+[1000],list(range(1,11))+[-1000])
        self.assertEqual(result['n'],11)
        self.assertEqual(len(result['pairs']),11)
        self.assertEqual(result['sensitivity']['flagged_pairs'],1)
        self.assertEqual(result['sensitivity']['diagnostic_n'],10)
        self.assertEqual(result['sensitivity']['diagnostic_pearson'],1)
        self.assertEqual(result['r'],result['sensitivity']['full_pearson'])
        self.assertLess(result['r'],0)
        self.assertEqual(result['sensitivity']['fisher_z_interval']['status'],'not_measured')

    def test_large_finite_values_do_not_overflow_and_constant_sample_is_unavailable(self):
        result=self.pair([1e306,2e306,3e306],[1e307,2e307,3e307])
        self.assertEqual(result['r'],1)
        self.assertEqual(self.pair([1]*10,list(range(10)))['status'],'zero_variance')

    def test_full_1215_population_and_reordered_rows_have_same_rank_coefficient(self):
        x=list(range(1215))
        first=self.pair(x,[v*v for v in x])
        second=self.pair(list(reversed(x)),[v*v for v in reversed(x)])
        self.assertEqual(first['n'],1215)
        self.assertEqual(first['spearman'],1)
        self.assertEqual(first['spearman'],second['spearman'])
        self.assertEqual(first['r'],second['r'])
