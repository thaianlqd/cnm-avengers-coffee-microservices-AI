"""PLAN 20/10 P1: candidate-only retrieval receipts for the frozen business corpus.

Candidate recall is measured on the server-owned packet before any provider
call; a pass here does not certify live-model understanding.
"""
import json
from pathlib import Path

from tests import test_hybrid_v28 as f
from services.analytical_resolver import AnalyticalResolver
from services.domain_intelligence_service import DomainIntelligence
from services.semantic_candidate_service import candidate_packet
from services.request_anchors import request_anchors

CORPUS = json.loads((Path(__file__).parents[1] / 'evals/business_coverage_cases.json').read_text())


class BusinessCoverageRetrievalTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp

    def packet(self, question):
        anchors = request_anchors(question, self.catalog, {})
        packet, retrieved = candidate_packet(self.catalog, AnalyticalResolver(self.catalog, f.REFERENCE).index,
                                             DomainIntelligence(self.catalog), anchors, question, {})
        return packet.wire(), retrieved

    def test_candidate_only_corpus(self):
        for case in (c for c in CORPUS['cases'] if c['id'].startswith('BC-REV-')):  # frozen v1 slice
            with self.subTest(case=case['id'], question=case['question']):
                wire, retrieved = self.packet(case['question'])
                menu = {m['id'] for m in wire['metrics']}
                self.assertLessEqual(set(case['required_domains']), set(wire['candidate_domains']))
                self.assertLessEqual(set(case['required_metrics']), menu)
                self.assertFalse(set(case['forbidden_metrics']) & menu)
                topics = [u for u in wire['unresolved_meaning'] if u['kind'] == 'topic_target']
                if case['expect_ambiguous']:
                    self.assertEqual([sorted(case['ambiguous_options'])], [sorted(u['candidate_ids']) for u in topics])
                    self.assertFalse({c['id'] for c in retrieved if c['protected']} & set(case['ambiguous_options']))
                else:
                    self.assertEqual([], topics)

    def test_entity_context_never_protected_over_topic(self):
        _, retrieved = self.packet('Phân tích đánh giá của khách hàng về các sản phẩm')
        protected = {c['id'] for c in retrieved if c['protected']}
        self.assertEqual({'product_reviews'}, protected)

    def test_topic_concepts_validate_references(self):
        from copy import deepcopy
        from services.domain_intelligence_service import validate_profiles
        from services.analysis_catalog import AnalysisError
        registry = deepcopy(self.catalog.registry)
        registry['domain_intelligence']['topic_concepts'][0]['targets'][0]['domain_id'] = 'missing_domain'
        with self.assertRaises(AnalysisError):
            validate_profiles(registry)

    def test_clarification_labels_follow_retrieved_topic_not_fixed_revenue(self):
        from types import SimpleNamespace
        from services.analysis_issue_service import actionable_issue
        error = SimpleNamespace(business_category='clarification', missing_fields=['metric_ids'])
        issue = actionable_issue(error, 'x', diagnostics={'detailed_domain_ids': ['product_reviews']})
        text = ' '.join(issue['what_is_missing'] + [issue.get('resolution_guidance', '')]).lower()
        self.assertIn('điểm đánh giá trung bình', text)
        self.assertNotIn('doanh thu', text)
        generic = actionable_issue(error, 'x', diagnostics={})
        self.assertIn('doanh thu', ' '.join(generic['what_is_missing']).lower())  # no retrieved topic: generic examples

    def test_bare_review_topic_asks_which_reviews_before_any_provider_send(self):
        from services.analysis_catalog import AnalysisError
        provider = f.scripted()
        p = f.HybridTests.pipeline(self, provider)
        with self.assertRaises(AnalysisError) as caught:
            p.propose(f.HybridTests.request(self, 'phân tích đánh giá'))
        self.assertEqual('subject_ambiguous', caught.exception.category)
        self.assertEqual(0, provider.call_count)
        followups = [c['followup'] for c in caught.exception.choices]
        self.assertEqual(['phân tích đánh giá về tài xế', 'phân tích đánh giá về món', 'phân tích đánh giá về chi nhánh'], followups)
        for text in followups:  # every offered choice resolves to exactly one review domain
            _, retrieved = self.packet(text)
            self.assertEqual(1, len([c for c in retrieved if c['match_category'] == 'topic_concept_match']))

    def test_subject_synonym_is_not_an_unknown_filter_value(self):
        from services.analysis_catalog import AnalysisError
        def intent(value):
            req = f.requirement(id='r1', goal='Đánh giá đồ uống', domain_id='product_reviews', metric_ids=['avg_product_rating', 'review_count'],
                                dimension_ids=['product'], analysis_kind='aggregate', derived_features=[],
                                filters=[{'dimension': 'category', 'operator': 'in', 'value': [value]}])
            req.pop('ranking', None)
            return f.envelope(req)
        p = f.HybridTests.pipeline(self, f.scripted(intent('đồ uống')))
        proposal = p.propose(f.HybridTests.request(self, 'phan hoi ve do uong'))
        self.assertEqual('proposal_ready', proposal['status'])
        self.assertIn('subject_synonym_not_a_filter', {n['rule'] for n in p.semantic_info.get('semantic_normalizations', [])})
        p = f.HybridTests.pipeline(self, f.scripted(intent('Trà sữa không tồn tại')))
        with self.assertRaises(AnalysisError) as caught:
            p.propose(f.HybridTests.request(self, 'đánh giá trà sữa không tồn tại'))
        self.assertEqual('filter_value_unknown', caught.exception.category)

    def test_unaccented_subject_alias_does_not_fire_inside_accented_words(self):
        from services.preflight_service import _subject_hits
        self.assertEqual([], _subject_hits('Kiểm tra hoạt động', self.catalog.registry))  # "tra" is only the typing form of "trà"
        self.assertEqual({'subject:products'}, set(_subject_hits('Trà nào bán chạy', self.catalog.registry)))
        self.assertIn('subject:products', _subject_hits('tra nao ban chay', self.catalog.registry))  # unaccented question keeps the fold

    def test_size_words_in_questions_are_not_size_filters(self):
        anchors = request_anchors('Chi nhánh nào có doanh thu lớn nhất, món nào bán nhỏ lẻ vừa phải', self.catalog, {})
        self.assertFalse({'item_size', 'ice_level', 'sweetness'} & {v['dimension'] for v in anchors['values']})

    def test_generic_mentions_are_settled_by_the_named_domain(self):
        cases = {
            'so chuyen giao theo trang thai': dict(dims={'delivery_status'}),  # generic axis head, unique compatible
            'Thanh toán chuyển khoản tháng này': dict(defaults={'payment_count'}, values={('payment_method', 'CHUYEN_KHOAN')}),
            'Tiền mua combo nguyên liệu quý này': dict(metrics={'combo_order_value'}, values=set()),  # not a debt type filter
            'Mạng lưới kiosk theo loại kiosk': dict(defaults={'kiosk_count'}),
            'Đồ uống nào mang lại doanh thu cao nhất': dict(metrics={'product_revenue'}),  # the named subject owns "doanh thu"
        }
        for question, expected in cases.items():
            with self.subTest(question=question):
                anchors = request_anchors(question, self.catalog, {})
                packet, _ = candidate_packet(self.catalog, AnalyticalResolver(self.catalog, f.REFERENCE).index,
                                             DomainIntelligence(self.catalog), anchors, question, {})
                wire = packet.wire()
                if 'dims' in expected: self.assertTrue(expected['dims'] <= set(wire['explicit_dimension_ids']))
                if 'defaults' in expected: self.assertTrue(expected['defaults'] <= set(wire.get('default_metric_ids', [])))
                if 'metrics' in expected: self.assertEqual(expected['metrics'], set(wire['explicit_metric_ids']))
                if 'values' in expected: self.assertEqual(expected['values'], {(v['dimension'], v['value']) for v in packet.anchors['values']})
