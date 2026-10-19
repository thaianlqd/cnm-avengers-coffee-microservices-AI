"""Behavior contracts for moving intent helpers without changing meaning."""
import ast
from copy import deepcopy
from pathlib import Path
from unittest import TestCase
from unittest.mock import patch

from services.analysis_intent import AnalysisIntentEnvelope
from services.hybrid_analyst_planner import apply_delta, semantic_repair_limit
from services.analysis_catalog import AnalysisError
from services.analytical_resolver import ResolutionIssues


class IntentDeltaPreservationTests(TestCase):
    def baseline(self):
        return AnalysisIntentEnvelope.model_validate({
            'decision': 'analyze', 'requirements': [{
                'id': 'sales', 'metric_ids': ['revenue'], 'dimension_ids': ['store'],
                'ranking': {'direction': 'top', 'limit': 5, 'metric_id': 'revenue'},
                'time': {'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'},
                'filters': [{'dimension': 'city', 'operator': 'eq', 'value': 'Hà Nội'}],
            }]})

    def test_ranking_patch_keeps_metric_scope_time_and_input_immutable(self):
        before = self.baseline()
        snapshot = before.model_dump(mode='json')
        result = apply_delta(before, {'changes': [{
            'action': 'update', 'requirement_id': 'sales', 'changes': {'ranking': {'limit': 3}}}]})
        self.assertEqual(before.model_dump(mode='json'), snapshot)
        expected = deepcopy(snapshot)
        expected['requirements'][0]['ranking']['limit'] = 3
        self.assertEqual(result.model_dump(mode='json'), expected)

    def test_conflicting_updates_fail_atomically_instead_of_last_write_wins(self):
        before = self.baseline()
        snapshot = before.model_dump(mode='json')
        with self.assertRaises(ResolutionIssues) as caught:
            apply_delta(before, {'changes': [
                {'action': 'update', 'requirement_id': 'sales', 'changes': {'ranking': {'limit': 2}}},
                {'action': 'update', 'requirement_id': 'sales', 'changes': {'ranking': {'limit': 7}}}]})
        self.assertEqual(caught.exception.issues[0]['code'], 'duplicate_delta')
        self.assertEqual(before.model_dump(mode='json'), snapshot)

    def test_accepted_parent_change_invalidates_derived_supporting_requirements(self):
        before = self.baseline()
        before.requirements.append(before.requirements[0].model_copy(update={
            'id': 'companion', 'supporting_for': 'sales'}))
        after = apply_delta(before, {'changes': [{
            'action': 'update', 'requirement_id': 'sales', 'changes': {'dimension_ids': ['city']}}]})
        self.assertEqual([r.id for r in after.requirements], ['sales'])
        self.assertEqual(len(before.requirements), 2)

    def test_removing_last_requirement_is_clarification_not_empty_success(self):
        with self.assertRaises(AnalysisError) as caught:
            apply_delta(self.baseline(), {'changes': [{'action': 'remove', 'requirement_id': 'sales'}]})
        self.assertEqual(caught.exception.category, 'clarification')

    def test_delta_owner_does_not_import_orchestrator_or_resolver(self):
        from services import analysis_intent
        self.assertIs(apply_delta, getattr(analysis_intent, 'apply_delta', None))
        source = Path(analysis_intent.__file__).read_text()
        for node in ast.walk(ast.parse(source)):
            if isinstance(node, ast.ImportFrom):
                self.assertNotIn(node.module, {
                    'services.hybrid_analyst_planner', 'services.analytical_resolver'})

    def test_error_types_remain_compatible_at_legacy_import_locations(self):
        from services import error_taxonomy
        self.assertIs(AnalysisError, getattr(error_taxonomy, 'AnalysisError', None))
        self.assertIs(ResolutionIssues, getattr(error_taxonomy, 'ResolutionIssues', None))
        self.assertTrue(issubclass(ResolutionIssues, AnalysisError))

    def test_repair_policy_stays_bounded_and_rejects_invalid_configuration(self):
        for raw, expected in [('0', 0), ('1', 1), ('2', 1)]:
            with self.subTest(raw=raw), patch.dict('os.environ', {'DATA_ANALYST_MAX_SEMANTIC_REPAIRS': raw}):
                self.assertEqual(semantic_repair_limit(), expected)
        with patch.dict('os.environ', {'DATA_ANALYST_MAX_SEMANTIC_REPAIRS': '3'}):
            with self.assertRaises(AnalysisError) as caught:
                semantic_repair_limit()
            self.assertEqual(caught.exception.category, 'provider_policy')
