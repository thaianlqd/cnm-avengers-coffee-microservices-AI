"""Version/owner/semantic-diff policies preserve IDs and old approval identity."""
from copy import deepcopy
from unittest import TestCase

from services.analysis_catalog import AnalysisCatalog
from services.semantic_catalog_validation import contract_diff, semantic_fingerprint, validate_governance
from tests.analysis_fixtures import physical_metadata


class CatalogLifecycleTests(TestCase):
    def setUp(self):
        self.catalog = AnalysisCatalog(physical_metadata())
        self.old = self.catalog.overlay

    def governed(self):
        value = deepcopy(self.old)
        value['governance'] = {'contract_version': '3.4.0', 'default_owner': 'avengers-data-team'}
        for group in ('metrics', 'dimensions', 'subjects'):
            for definition in value['analysis_registry'][group].values():
                definition.update(owner='avengers-data-team', lifecycle={'status': 'active'})
        return value

    def test_legacy_catalog_is_readable_without_fake_governance_certification(self):
        old = deepcopy(self.old)
        old.pop('governance', None)
        self.assertEqual(validate_governance(old, required=True), 'legacy')

    def test_all_governed_ids_and_owners_are_validated(self):
        value = self.governed()
        self.assertEqual(validate_governance(value, required=True), 'governed')
        value['analysis_registry']['metrics']['revenue']['owner'] = ''
        with self.assertRaises(ValueError):
            validate_governance(value, required=True)

    def test_deprecation_requires_release_and_real_replacement_identity(self):
        value = self.governed()
        metric = value['analysis_registry']['metrics']['revenue']
        metric['lifecycle'] = {'status': 'deprecated', 'replacement_id': 'does_not_exist'}
        with self.assertRaises(ValueError):
            validate_governance(value, required=True)
        metric['lifecycle'] = {'status': 'deprecated', 'deprecated_in': '4.0.0', 'replacement_id': 'store_revenue'}
        self.assertEqual(validate_governance(value, required=True), 'governed')

    def test_display_only_change_keeps_shadow_semantic_hash_but_not_legacy_approval_hash(self):
        new = deepcopy(self.old)
        new['analysis_registry']['metrics']['revenue']['display_label'] = 'Revenue display label'
        diff = contract_diff(self.old, new)
        self.assertFalse(diff['requires_meaning_review'])
        self.assertEqual(diff['changes'][0]['kind'], 'presentation')
        self.assertEqual(semantic_fingerprint(self.old), semantic_fingerprint(new))
        rebuilt = AnalysisCatalog(physical_metadata(), new)
        self.assertNotEqual(self.catalog.fingerprint, rebuilt.fingerprint)
        self.assertEqual(self.catalog.semantic_fingerprint, rebuilt.semantic_fingerprint)

    def test_business_name_and_alias_changes_are_not_mistaken_for_cosmetic_labels(self):
        for field, value in (('business_name', 'New language anchor'), ('aliases', ['new phrase'])):
            new = deepcopy(self.old)
            new['analysis_registry']['metrics']['revenue'][field] = value
            diff = contract_diff(self.old, new)
            self.assertTrue(diff['requires_meaning_review'])
            self.assertIn('revenue', diff['impacted_metric_ids'])

    def test_formula_population_time_and_unit_changes_require_meaning_review(self):
        for field, value in (('expression', 'COUNT(*)'), ('business_filters', []), ('time_column', None), ('unit', 'USD')):
            new = deepcopy(self.old)
            new['analysis_registry']['metrics']['revenue'][field] = value
            diff = contract_diff(self.old, new)
            self.assertTrue(diff['requires_meaning_review'])
            self.assertNotEqual(diff['before_semantic_fingerprint'], diff['after_semantic_fingerprint'])

    def test_scope_membership_and_global_policy_changes_impact_metric_capabilities(self):
        new = deepcopy(self.old)
        new['analysis_registry']['scope_expression_policy']['all'].append('all scoped objects')
        diff = contract_diff(self.old, new)
        self.assertTrue(diff['requires_meaning_review'])
        self.assertEqual(set(diff['impacted_metric_ids']), set(self.old['analysis_registry']['metrics']))

    def test_owner_change_is_reported_without_replacing_semantic_or_approval_system(self):
        new = deepcopy(self.old)
        new['analysis_registry']['metrics']['revenue']['owner'] = 'fixture-reviewed-data-team'
        diff = contract_diff(self.old, new)
        self.assertEqual(diff['changes'][0]['kind'], 'governance')
        self.assertFalse(diff['requires_meaning_review'])
        self.assertEqual(diff['before_semantic_fingerprint'], diff['after_semantic_fingerprint'])

    def test_lineage_formula_hash_tracks_definition_but_not_display_or_owner(self):
        lineage = self.catalog.metric_lineage('revenue')
        self.assertEqual(lineage['source'], 'silver.don_hang')
        self.assertIn({'table': 'silver.don_hang', 'column': 'tong_tien'}, lineage['columns'])
        changed = deepcopy(self.old)
        changed['analysis_registry']['metrics']['revenue']['display_label'] = 'Only display'
        changed['analysis_registry']['metrics']['revenue']['owner'] = 'fixture-owner-team'
        self.assertEqual(AnalysisCatalog(physical_metadata(), changed).metric_lineage('revenue')['formula_fingerprint'],
                         lineage['formula_fingerprint'])
        changed['analysis_registry']['metrics']['revenue']['unit'] = 'USD'
        self.assertNotEqual(AnalysisCatalog(physical_metadata(), changed).metric_lineage('revenue')['formula_fingerprint'],
                            lineage['formula_fingerprint'])
