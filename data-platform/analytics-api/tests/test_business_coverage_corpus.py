"""PLAN 20/10 P6: candidate-only receipt over the frozen business corpus (offline, no provider).

Measures retrieval/menu recall, forbidden substitutions, governed limitations
and privacy blocks before any model call. A pass is not live-model evidence.
"""
import hashlib
import json
from datetime import date
from pathlib import Path

from tests import test_hybrid_v28 as f
from services import preflight_service
from services.analytical_resolver import AnalyticalResolver
from services.domain_intelligence_service import DomainIntelligence
from services.request_anchors import request_anchors
from services.semantic_candidate_service import candidate_packet

ROOT = Path(__file__).resolve().parents[1]
CORPUS = json.loads((ROOT / 'evals/business_coverage_cases.json').read_text())
MANIFEST = json.loads((ROOT / 'evals/business_coverage_manifest.json').read_text())


def evaluate(catalog, case):
    q = case['question']
    anchors = request_anchors(q, catalog, {})
    packet, retrieved = candidate_packet(catalog, AnalyticalResolver(catalog, f.REFERENCE).index, DomainIntelligence(catalog), anchors, q, {})
    wire = packet.wire()
    menu = {m['id'] for m in wire['metrics']} | set(wire['explicit_metric_ids'])
    codes = {x['code']: x for x in preflight_service.run(q, reference=date(2026, 10, 20), catalog=catalog)['findings']}
    problems = []
    if not set(case['required_domains']) <= set(wire['candidate_domains']):
        problems.append('domains %s missing from %s' % (sorted(set(case['required_domains']) - set(wire['candidate_domains'])), wire['candidate_domains']))
    for m in case.get('required_metrics', []):
        if m not in menu: problems.append('metric %s missing' % m)
    if case.get('required_metrics_any') and not set(case['required_metrics_any']) & menu:
        problems.append('none of %s in menu' % case['required_metrics_any'])
    if set(case['forbidden_metrics']) & menu:
        problems.append('forbidden %s offered' % sorted(set(case['forbidden_metrics']) & menu))
    topics = [u['candidate_ids'] for u in wire['unresolved_meaning'] if u['kind'] == 'topic_target']
    if case['expect_ambiguous'] and [sorted(case['ambiguous_options'])] != [sorted(t) for t in topics]:
        problems.append('expected topic ambiguity %s got %s' % (case['ambiguous_options'], topics))
    if not case['expect_ambiguous'] and topics:
        problems.append('unexpected topic ambiguity %s' % topics)
    if case.get('expect_capability'):
        found = {a['candidate_ids'][0] for a in anchors['capabilities']} | {codes.get(k, {}).get('concept') for k in ('unsupported_concept', 'unsupported_predicate')}
        if case['expect_capability'] not in found:
            problems.append('capability %s not recognized' % case['expect_capability'])
    supported = (case['required_domains'] or case.get('required_metrics_any') or case.get('required_metrics')) and not case.get('expect_capability')
    gate = {'unrecognized_question', 'analysis_target_missing'} & set(codes)
    if supported and gate:
        problems.append('blocked before the interpreter: %s' % sorted(gate))
    if case.get('expect_privacy_block') and 'privacy_blocked' not in codes:
        problems.append('privacy block missing')
    return problems


class BusinessCoverageCorpusTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp

    def test_corpus_is_frozen_and_meets_the_plan_floor(self):
        body = json.dumps(CORPUS['cases'], ensure_ascii=False, sort_keys=True).encode()
        self.assertEqual(MANIFEST['sha256'], hashlib.sha256(body).hexdigest())  # edits need a manifest/history update
        groups = {c['group'] for c in CORPUS['cases']}
        self.assertTrue({'B%02d' % i for i in range(1, 35)} <= groups)
        self.assertGreaterEqual(len(CORPUS['cases']), 264)
        self.assertTrue(all(sum(c['group'] == 'B%02d' % i for c in CORPUS['cases']) >= 6 for i in range(1, 35)))
        self.assertGreaterEqual(sum(c['group'] == 'X' for c in CORPUS['cases']), 60)
        self.assertGreaterEqual(sum(c['holdout'] for c in CORPUS['cases']) / len(CORPUS['cases']), 0.25)

    def test_candidate_only_receipt(self):
        failures = {}
        for case in CORPUS['cases']:
            problems = evaluate(self.catalog, case)
            if problems:
                failures[case['id']] = (case['question'], problems)
        receipt = dict(cases=len(CORPUS['cases']), passed=len(CORPUS['cases']) - len(failures),
                       holdout_failed=sorted(i for i in failures if next(c for c in CORPUS['cases'] if c['id'] == i)['holdout']),
                       failures=failures)
        (ROOT / 'evaluation').mkdir(exist_ok=True)
        (ROOT / 'evaluation/business_coverage_candidate_receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
        self.assertEqual({}, failures)
