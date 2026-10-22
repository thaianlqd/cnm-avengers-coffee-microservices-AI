"""Selected structured values share execution grounding without I/O while typing."""
from datetime import date
from unittest.mock import Mock, patch
from unittest import TestCase
from tests import test_input_integrity as integrity
from services.preflight_service import run


class StructuredScopeTests(TestCase):
    setUp = integrity.InputIntegrityTests.setUp
    # Reuse setup only, not inherited corpus tests in this module.
    def check_scope(self, value, **kwargs):
        return run('Doanh thu tháng 9 năm 2026', catalog=self.catalog, reference=date(2026, 10, 21), coverage={},
            analysis_scope={'mode': 'selected', 'filters': [{'dimension': 'city', 'operator': 'in', 'value': [value]}]},
            **kwargs)

    def test_unknown_selected_scope_never_reports_ready(self):
        lookup = Mock(return_value={'values': [], 'queries': 1})
        result = self.check_scope('Tỉnh qzxn không tồn tại', input_lookup=lookup)
        self.assertFalse(result['can_submit'])
        self.assertFalse(result['state'].startswith('READY'))
        self.assertEqual(result['provider_calls'], 0)
        self.assertEqual(result['input_validation']['lookup_queries'], 1)

    def test_rare_scope_requires_explicit_lookup_then_uses_exact_value(self):
        rare = 'Bắc Kạn'
        with patch('services.input_integrity_service.entity_lookup', return_value=Mock(return_value=None)):
            typing = self.check_scope(rare)
        self.assertFalse(typing['can_submit'])
        self.assertEqual(typing['input_validation']['lookup_queries'], 0)
        lookup = Mock(return_value={'values': [rare], 'queries': 1})
        explicit = self.check_scope(rare, input_lookup=lookup)
        self.assertTrue(explicit['can_submit'], explicit['findings'])
        self.assertEqual(explicit['input_validation']['lookup_queries'], 1)
        self.assertEqual(explicit['provider_calls'], 0)
        lookup.assert_called_once_with('city', rare)

    def test_curated_scope_needs_no_lookup(self):
        lookup = Mock(side_effect=AssertionError('Curated value needs no lookup'))
        result = self.check_scope('Hồ Chí Minh', input_lookup=lookup)
        self.assertTrue(result['can_submit'], result['findings'])
        self.assertEqual(result['input_validation']['lookup_queries'], 0)
        lookup.assert_not_called()

    def test_qualified_overlapping_metric_phrase_does_not_add_registered_customers(self):
        from services.request_anchors import request_anchors
        question='Số khách đã mua trong tháng 9 năm 2026'
        anchors=request_anchors(question,self.catalog,{})
        self.assertEqual({m for a in anchors['metrics'] for m in a['candidate_ids']}, {'purchasing_customer_count'})
        checked=run(question,catalog=self.catalog,reference=date(2026,10,21),coverage={})
        self.assertEqual({m['id'] for m in checked['understood']['metrics']},{'purchasing_customer_count'})

    def test_five_rare_selected_members_share_the_execution_lookup_allowance(self):
        members = ['Ninh Thuận', 'Sóc Trăng', 'Bạc Liêu', 'Trà Vinh', 'Quảng Trị']
        lookup = Mock(side_effect=lambda name, value: {'values': [value], 'queries': 1})
        result = run('Bottom 5 tỉnh theo doanh thu tháng 9 năm 2026', catalog=self.catalog,
            reference=date(2026, 10, 21), coverage={}, input_lookup=lookup,
            analysis_scope={'mode': 'selected', 'filters': [{'dimension': 'city', 'operator': 'in', 'value': members}]})
        self.assertTrue(result['can_submit'], result['findings'])
        self.assertEqual(result['lookup_queries'], len(members))
        self.assertEqual(result['provider_calls'], 0)
