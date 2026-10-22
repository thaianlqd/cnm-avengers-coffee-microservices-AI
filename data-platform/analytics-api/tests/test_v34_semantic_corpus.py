"""Frozen120 contracts + seeded scope conservation; no provider accuracy claim."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import random
from unittest import TestCase
from unittest.mock import patch

from evals.semantic_eval_v34 import CASES,run_cases
from services.analysis_catalog import AnalysisCatalog
from services.scope_resolution_service import resolve_scope
from tests.analysis_fixtures import physical_metadata


class SemanticCorpusTests(TestCase):
    def test_frozen_category_allocation_and_all_cases_keep_expected_labels_and_zero_io(self):
        source=json.loads(CASES.read_text())
        self.assertEqual(len(source['cases']),120)
        self.assertEqual(Counter(c['category'] for c in source['cases']),source['category_allocation'])
        self.assertEqual(len(source['category_allocation']),17)
        self.assertEqual(sum(c['split']=='holdout' for c in source['cases']),40)
        self.assertEqual(len({c['id'] for c in source['cases']}),120)
        self.assertEqual(hashlib.sha256(CASES.read_bytes()).hexdigest(),'12959e3daef9e07d9941ba60abef564a64ad73203bc386a452e28b4783067fa4')
        with patch('psycopg2.connect',side_effect=AssertionError('forbidden warehouse')),\
             patch('requests.sessions.Session.request',side_effect=AssertionError('forbidden HTTP')):
            result=run_cases(AnalysisCatalog(physical_metadata()))
        self.assertEqual([r for r in result['rows'] if not r['ok']],[])
        self.assertEqual(result['passed'],120)

    def test_seeded_scope_unicode_case_spacing_variants_preserve_finite_membership(self):
        catalog=AnalysisCatalog(physical_metadata())
        expected={'Hồ Chí Minh','Cần Thơ','Bình Dương','Đồng Nai','Bà Rịa - Vũng Tàu','Kiên Giang'}
        rng=random.Random(340018)
        for _ in range(100):
            words=['Doanh','thu','miền','Nam','tháng','9','năm','2026']
            question=(' '*rng.randint(1,3)).join(w.upper() if rng.random()<0.5 else w.lower() for w in words)
            result=resolve_scope(question,catalog)
            members={v for b in result['bindings'] if b['dimension']=='city' for v in b['members']}
            self.assertEqual(members,expected)


    def test_authored_reference_meanings_cover_all120_ids_through_terminal_or_production_compiler(self):
        from evals.semantic_reference_eval_v34 import run,REFERENCES,REFERENCE_SHA256
        self.assertEqual(hashlib.sha256(REFERENCES.read_bytes()).hexdigest(),REFERENCE_SHA256)
        with patch('psycopg2.connect',side_effect=AssertionError('forbidden warehouse')), \
             patch('requests.sessions.Session.request',side_effect=AssertionError('forbidden HTTP')):
            result=run(AnalysisCatalog(physical_metadata()))
        self.assertEqual(result['case_count'],120)
        self.assertEqual(result['compiled_intents'],83)
        self.assertEqual([r for r in result['rows'] if not r['ok']],[])
        self.assertEqual(result['passed'],120)
        self.assertTrue(all(r['compiled'] for r in result['rows'] if r['stage']=='resolver_compiler'))
