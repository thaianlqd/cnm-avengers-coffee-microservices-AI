"""PLAN 20/10 §3.1: retail availability replaces physical stock semantics.

The numeric oracle re-implements the checkout rule
(order-service `kiemTraTonKhoTruocKhiTaoDon`: a configured row whose flag is not
true blocks the item; a missing row never blocks; quantity is ignored) in plain
Python. It never imports the production compiler.
"""
import sqlite3
from copy import deepcopy

import sqlglot

from tests import test_hybrid_v28 as f
from services.analysis_catalog import AnalysisError
from services.analytical_resolver import AnalyticalResolver
from services.domain_intelligence_service import DomainIntelligence, validate_profiles
from services.request_anchors import request_anchors
from services.semantic_candidate_service import candidate_packet
from services.workspace_service import dashboard_template

RETIRED = {'stock_quantity', 'low_stock_count'}
# (store, product, flag, quantity): flag/quantity disagree on purpose.
ROWS = [('s1', 1, True, 0), ('s1', 2, False, 50), ('s2', 1, None, 10), ('s2', 2, True, 5), ('s3', 2, False, 0)]
UNCONFIGURED = [('s1', 3)]  # sold at s1 by the global menu; checkout never blocks it


def checkout_blocks(store, product):
    row = next((r for r in ROWS if r[:2] == (store, product)), None)
    return row is not None and row[2] is not True


class AvailabilitySemanticsTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp

    def packet(self, question):
        anchors = request_anchors(question, self.catalog, {})
        packet, _ = candidate_packet(self.catalog, AnalyticalResolver(self.catalog, f.REFERENCE).index,
                                     DomainIntelligence(self.catalog), anchors, question, {})
        return anchors, packet.wire()

    def test_d09_and_active_surfaces_offer_availability_only(self):
        r = self.catalog.registry
        profile = r['domain_intelligence']['profiles']['inventory']
        self.assertEqual({'sale_positions', 'paused_sale_positions'}, set(profile['metric_refs']))
        d09 = dashboard_template(self.catalog, 'D09', '2.0.0')
        self.assertEqual('Khả dụng bán theo điểm bán', d09['title'])
        self.assertFalse(RETIRED & {m for q in d09['requirements'] for m in q['metric_ids']})
        self.assertFalse(RETIRED & {s['metric'] for s in r['risk_signals']})
        with self.assertRaises(AnalysisError):  # an old saved D09 asks for refresh, never silently re-KPIs
            dashboard_template(self.catalog, 'D09', '1.0.0')
        for m in RETIRED:  # retained for saved-report compatibility, clearly retired
            self.assertEqual('deprecated', r['metrics'][m]['lifecycle']['status'])

    def test_retired_metric_cannot_return_to_an_active_surface(self):
        broken = deepcopy(self.catalog.registry)
        broken['domain_intelligence']['profiles']['inventory']['metric_refs'].append('low_stock_count')
        with self.assertRaises(AnalysisError):
            validate_profiles(broken)

    def test_stock_questions_never_reach_quantity_metrics(self):
        for question in ('Tồn kho hiện tại theo chi nhánh', 'món nào sắp hết hàng', 'số lượng tồn của từng món'):
            with self.subTest(question=question):
                anchors, wire = self.packet(question)
                self.assertFalse(RETIRED & {m['id'] for m in wire['metrics']})
                self.assertFalse(RETIRED & {m for a in anchors['metrics'] for m in a['candidate_ids']})
        anchors, _ = self.packet('món nào sắp hết hàng')
        self.assertEqual(['physical_stock_quantity'], [m['candidate_ids'][0] for m in anchors['capabilities']])

    def test_paused_question_selects_availability(self):
        _, wire = self.packet('Món nào đang tạm ngưng bán ở các chi nhánh')
        self.assertIn('inventory', wire['candidate_domains'])
        self.assertIn('paused_sale_positions', {m['id'] for m in wire['metrics']})

    def test_numeric_oracle_matches_checkout_rule(self):
        db = sqlite3.connect(':memory:')
        db.execute('CREATE TABLE ton_kho_san_pham (id INTEGER, co_so_ma TEXT, ma_san_pham INTEGER, dang_kinh_doanh BOOLEAN, so_luong_ton INTEGER)')
        db.executemany('INSERT INTO ton_kho_san_pham VALUES (?,?,?,?,?)', [(i, *row) for i, row in enumerate(ROWS)])
        expected = {
            'sale_positions': len(ROWS),
            'paused_sale_positions': sum(checkout_blocks(s, p) for s, p, _, _ in ROWS),
        }
        self.assertFalse(any(checkout_blocks(s, p) for s, p in UNCONFIGURED))
        for metric, value in expected.items():
            with self.subTest(metric=metric):
                expression = self.catalog.registry['metrics'][metric]['expression'].replace('silver.', '')
                sql = sqlglot.transpile(f'SELECT {expression} FROM ton_kho_san_pham', read='postgres', write='sqlite')[0]
                self.assertEqual(value, db.execute(sql).fetchone()[0])
        self.assertEqual((5, 3), tuple(expected.values()))
