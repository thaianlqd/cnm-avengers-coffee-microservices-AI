"""Comparison workspace (CW00–CW05): member axis, server view modes, active-view claims.

Expected numbers come from evals.comparison_fixture.oracle (raw rows, plain Python) — never from
the production compiler/renderer/insight code. Every scenario runs the real hybrid pipeline offline
(scripted provider, SQLite fixture warehouse, no network).
"""
import json
import unittest
from copy import deepcopy

from evals import comparison_fixture as cf
from tests import cw_harness as h

A, B, G = cf.CITIES['Alpha'], cf.CITIES['Beta'], cf.CITIES['Gamma']


def series_values(payload, label):
    """{x_label: value} of one named series (or of the single series)."""
    keys = {s['label']: s['key'] for s in payload.get('series') or []}
    if payload.get('series'):
        key = keys.get(label)
        return {row['label']: row[key] for row in payload['data'] if key in row}
    return {row['label']: row['value'] for row in payload['data']}


def variant(chart, mode, member=None, value_mode='absolute', breakdown=None):
    for v in chart['view_modes']['variants']:
        spec = v['spec']
        if (spec['mode'] == mode and spec.get('member') == member and spec.get('value_mode', 'absolute') == value_mode
                and (breakdown is None or spec.get('breakdown') and spec['breakdown'][1] == breakdown)):
            return v
    return None


class ComparisonWorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = cf.warehouse_data()
        cls.report, cls.provider, cls.sql_calls = h.run([h.envelope()], data=cls.data)
        cls.oracle = cf.oracle(cls.data, [A, B])
        cls.by_month = cf.oracle(cls.data, [A, B], month=True)
        cls.by_type = cf.oracle(cls.data, [A, B], breakdown='loai_don_hang')

    def charts(self, dimension):
        return [c for c in self.report['charts'] if dimension in (c.get('dimension_ids') or [])]

    def test_report_is_verified_and_every_view_keeps_member_axis(self):
        r = self.report
        self.assertEqual(r['status'], 'success')
        self.assertEqual(r['verification']['status'], 'verified')
        self.assertEqual(r['quality_assessment']['status'], 'verified')
        self.assertEqual(self.provider.call_count, 1)
        frame = r['comparison_frames'][0]
        self.assertEqual(frame['axis_dimension_id'], 'city')
        self.assertEqual([m['key'] for m in frame['members']], [A, B])
        self.assertEqual(frame['missing_members'], [])
        revenue = [c for c in r['charts'] if c['metric'] == 'revenue']
        self.assertGreaterEqual(len(revenue), 4)
        for chart in revenue:
            with self.subTest(chart=chart['title']):
                # B.5.1: no supporting lens silently becomes an overview of the union.
                self.assertIn('city', chart['dimension_ids'])
                self.assertEqual(chart['view_modes']['default_variant'], chart['view_ref'])
                self.assertEqual(variant(chart, 'compare', breakdown=(chart['view_modes'].get('breakdown') or {}).get('options', [{}])[0].get('key'))['id']
                                 if chart['view_modes'].get('breakdown') else variant(chart, 'compare')['id'], chart['view_ref'])

    def test_pair_kpis_are_member_totals_before_supporting_extrema(self):
        cards=self.report['kpi_cards']
        self.assertEqual([c['value'] for c in cards[:2]],[self.oracle[m][()]['revenue'] for m in (A,B)])
        self.assertEqual({c['label'] for c in cards[:2]},{A,B})
        self.assertEqual(cards[2]['value'],300-700)
        self.assertIn(B,cards[3]['sub_text'])

    def test_reading_guidance_matches_the_actual_view_shape_not_a_generic_bar_template(self):
        primary=next(c for c in self.report['charts'] if c.get('relevance_role')=='primary')
        self.assertNotIn('xếp từ cao đến thấp',primary['insight']['what_it_shows'])
        trend=next(c for c in self.report['charts'] if c['chart_type'] in {'multi_line','multiline'})
        self.assertIn('Mỗi đường',trend['insight']['how_to_read'])
        self.assertNotIn('Thanh dài',trend['insight']['how_to_read'])
        single=variant(primary,'single',B)
        self.assertIn('phạm vi đang xem',single['insight']['how_to_read'])

    def test_compare_trend_matches_raw_oracle_per_member(self):
        trend = next(c for c in self.report['charts'] if c['x_field'] == 'period' and c['dimension_ids'] == ['city'])
        payload = variant(trend, 'compare')['payload']
        for member in (A, B):
            expected = {k[0]: v['revenue'] for k, v in self.by_month[member].items() if v['revenue'] is not None}
            got = {label[:7]: value for label, value in series_values(payload, member).items()}
            self.assertEqual(got, expected, member)

    def test_total_and_single_modes_follow_additive_law(self):
        trend = next(c for c in self.report['charts'] if c['x_field'] == 'period' and c['dimension_ids'] == ['city'])
        total = {k[:7]: v for k, v in series_values(variant(trend, 'total')['payload'], None).items()}
        self.assertEqual(total, {k[0]: v['revenue'] for k, v in self.by_month['union'].items()})
        for member in (A, B):
            single = {k[:7]: v for k, v in series_values(variant(trend, 'single', member)['payload'], None).items()}
            self.assertEqual(single, {k[0]: v['revenue'] for k, v in self.by_month[member].items() if v['revenue'] is not None})
        primary = next(c for c in self.report['charts'] if c.get('relevance_role') == 'primary')
        self.assertEqual(variant(primary, 'total')['payload']['data'][0]['value'], self.oracle['union'][()]['revenue'])
        self.assertEqual(variant(primary, 'total')['payload']['chart_type'], 'kpi')
        self.assertIn('Tổng của 2 đối tượng', variant(primary, 'total')['payload']['caption'])

    def test_breakdown_view_compares_members_within_each_group_and_shares_use_member_denominator(self):
        chart = next(c for c in self.report['charts'] if 'order_type' in c['dimension_ids'])
        payload = variant(chart, 'compare')['payload']
        labels = {'DUNG_TAI_CHO': 'Dùng tại chỗ', 'MANG_DI': 'Mang đi', 'GIAO_TAN_NOI': 'Giao tận nơi'}
        for member in (A, B):
            expected = {labels[k[0]]: v['revenue'] for k, v in self.by_type[member].items() if v['revenue'] is not None}
            self.assertEqual(series_values(payload, member), expected)
            shares = series_values(variant(chart, 'compare', value_mode='member_share')['payload'], member)
            total = sum(expected.values())
            for label, value in expected.items():
                self.assertAlmostEqual(shares[label], value / total * 100, places=9)
        share_facts = [f['text'] for f in variant(chart, 'compare', value_mode='member_share')['insight']['key_facts']]
        self.assertTrue(all('%' in t and 'VND' not in t for t in share_facts), share_facts)  # chart % ⇒ claim %, never VND

    def test_outside_scope_member_never_changes_any_view(self):
        bigger = cf.warehouse_data(gamma_amount=5000000)
        report, _, _ = h.run([h.envelope()], data=bigger)
        def strip(r):
            return [[(v['spec'], v.get('payload', {}).get('data'), [f['text'] for f in v.get('insight', {}).get('key_facts', [])])
                     for v in c['view_modes']['variants']] for c in r['charts']]
        self.assertEqual(strip(report), strip(self.report))
        self.assertNotIn(G, json.dumps(report['charts'], ensure_ascii=False))

    def test_requested_member_without_rows_is_disclosed_not_ranked(self):
        absent = 'Đà Nẵng'
        env = h.envelope(h.requirement(filters=[dict(dimension='city', operator='in', value=[A, absent])]))
        report, _, _ = h.run([env], question=f'so sánh doanh thu thành phố {A} và thành phố {absent}')
        frame = report['comparison_frames'][0]
        self.assertEqual(frame['missing_members'], [absent])
        self.assertTrue(any(l.get('reason') == 'requested_member_without_data' for l in report['quality_context']['limitations']))
        primary = next(c for c in report['charts'] if c.get('relevance_role') == 'primary')
        texts = ' '.join(f['text'] for f in primary['insight']['key_facts'])
        self.assertNotIn('Cao nhất', texts)
        self.assertNotIn('100% tổng', texts)

    def test_two_value_scope_without_comparison_intent_stays_an_overview(self):
        env = h.envelope(h.requirement(dimension_ids=[], derived_features=[], goal='Tổng quan doanh thu'))
        report, _, _ = h.run([env], question=f'tổng quan doanh thu thành phố {A} và thành phố {B}', mission='overview')
        self.assertEqual(report['comparison_frames'], [])
        self.assertFalse(any(c.get('view_modes') for c in report['charts']))

    def test_saved_report_round_trip_reverifies_every_variant(self):
        from services.analysis_response_service import session_report_summary
        from services.analysis_quality_service import verify_saved_report
        from services.analysis_catalog import AnalysisCatalog
        from tests.analysis_fixtures import physical_metadata
        import os
        from unittest.mock import patch
        with patch.dict(os.environ, h.ENV):
            # The standard runner resets the artifact store per test (tools.run_tests_v29): build within the test.
            report, _, _ = h.run([h.envelope()], data=self.data)
            result = verify_saved_report(deepcopy(report), AnalysisCatalog(physical_metadata()))
        self.assertEqual(result.get('status'), 'verified', result.get('reason'))


class NonAdditiveViewTests(unittest.TestCase):
    """Independent raw populations qualify the new mode kernel, not just SQL totals."""

    def run_metric(self,metric,data=None):
        question={'aov':'giá trị đơn trung bình','order_cancellation_rate':'tỷ lệ hủy đơn',
                  'purchasing_customer_count':'số khách hàng mua hàng'}[metric]
        report,_,_=h.run([h.envelope(h.requirement(metric_ids=[metric]))],data=data or cf.warehouse_data(),
                        question=f'so sánh {question} của {A} và {B}')
        chart=next(c for c in report['charts'] if c.get('relevance_role')=='primary' and c.get('view_modes') and c['metric']==metric)
        return report,chart

    def test_aov_total_is_union_revenue_over_union_valid_orders_not_mean_of_members(self):
        data=cf.warehouse_data();expected=cf.oracle(data,[A,B])
        report,chart=self.run_metric('aov',data)
        total=variant(chart,'total')
        self.assertEqual(total['availability'],'available')
        self.assertAlmostEqual(total['payload']['data'][0]['value'],expected['union'][()]['aov'],places=6)
        self.assertNotAlmostEqual(total['payload']['data'][0]['value'],
            (expected[A][()]['aov']+expected[B][()]['aov'])/2,places=6)
        for member in (A,B):self.assertAlmostEqual(variant(chart,'single',member)['payload']['data'][0]['value'],expected[member][()]['aov'],places=6)
        self.assertEqual(report['verification']['status'],'verified')

    def test_cancellation_total_uses_terminal_population_and_excludes_in_transit(self):
        data=cf.warehouse_data()
        data['don_hang'].append(dict(data['don_hang'][0],ma_don_hang='in-transit',tong_tien=999999,trang_thai_don_hang='DANG_GIAO'))
        expected=cf.oracle(data,[A,B]);report,chart=self.run_metric('order_cancellation_rate',data)
        rate=lambda item:100*item['cancelled_terminal_order_count']/item['terminal_order_count']
        total=variant(chart,'total')
        self.assertEqual(total['availability'],'available')
        self.assertAlmostEqual(total['payload']['data'][0]['value'],rate(expected['union'][()]),places=6)
        for member in (A,B):self.assertAlmostEqual(variant(chart,'single',member)['payload']['data'][0]['value'],rate(expected[member][()]),places=2)
        self.assertNotAlmostEqual(total['payload']['data'][0]['value'],(rate(expected[A][()])+rate(expected[B][()]))/2,places=2)
        self.assertEqual(report['verification']['status'],'verified')

    def test_shared_customer_identity_never_becomes_a_sum_of_distinct_member_counts(self):
        data=cf.warehouse_data();expected=cf.oracle(data,[A,B]);report,chart=self.run_metric('purchasing_customer_count',data)
        self.assertEqual(expected['union'][()]['purchasing_customer_count'],2)
        self.assertEqual(sum(expected[m][()]['purchasing_customer_count'] for m in (A,B)),3)
        self.assertEqual(variant(chart,'total')['availability'],'unavailable')
        self.assertIn('distinct',variant(chart,'total')['reason'])
        for member in (A,B):self.assertEqual(variant(chart,'single',member)['payload']['data'][0]['value'],expected[member][()]['purchasing_customer_count'])
        self.assertEqual(report['verification']['status'],'verified')


class ViewModeMutationTests(unittest.TestCase):
    """Calibration: each enumerated corruption must be caught; the untouched report must pass."""

    def setUp(self):
        # Stored artifacts are per test under the standard runner; each mutation re-derives from a fresh report.
        type(self).report, _, _ = h.run([h.envelope()])

    @classmethod
    def setUpClass(cls):
        import os
        from unittest.mock import patch
        from services.analysis_catalog import AnalysisCatalog
        from tests.analysis_fixtures import physical_metadata
        with patch.dict(os.environ, h.ENV):
            cls.catalog = AnalysisCatalog(physical_metadata())

    def verdict(self, report):
        import os
        from unittest.mock import patch
        from services.analysis_quality_service import verify_saved_report
        with patch.dict(os.environ, h.ENV):
            return verify_saved_report(report, self.catalog).get('status')

    def mutate(self, fn):
        report = deepcopy(self.report)
        chart = next(c for c in report['charts'] if 'order_type' in c.get('dimension_ids', []))
        fn(chart)
        return report

    def test_valid_control_is_accepted(self):
        self.assertEqual(self.verdict(deepcopy(self.report)), 'verified')

    def test_selected_view_replay_is_verified_and_rejects_unknown_or_cross_chart_ids(self):
        from services.view_mode_service import apply_view_choices
        from services.analysis_catalog import AnalysisError
        chart=next(c for c in self.report['charts'] if 'order_type' in c.get('dimension_ids',[]))
        chosen=variant(chart,'single',B)
        replay=apply_view_choices(self.report,{chart['id']:chosen['id']})
        shown=next(c for c in replay['charts'] if c['id']==chart['id'])
        self.assertEqual(shown['data'],chosen['payload']['data'])
        self.assertEqual(shown['insight'],chosen['insight'])
        self.assertEqual(replay['kpi_cards'],self.report['kpi_cards'])
        self.assertEqual(self.verdict(replay),'verified')
        self.assertNotEqual(chart['view_ref'],chosen['id'])
        for choices in ({'unknown':chosen['id']},{chart['id']:'forged'},
                        {self.report['charts'][0]['id']:chosen['id']}):
            with self.subTest(choices=choices),self.assertRaises(AnalysisError):
                apply_view_choices(self.report,choices)

    def test_saved_view_survives_rehydrate_and_word_export(self):
        import os
        from unittest.mock import patch
        from services.view_mode_service import apply_view_choices
        from services.analysis_response_service import restore_report_presentation,session_report_summary
        from services.analysis_quality_service import restore_artifacts
        from services.docx_service import generate_report_docx
        from docx import Document
        chart=next(c for c in self.report['charts'] if 'order_type' in c.get('dimension_ids',[]))
        chosen=variant(chart,'single',B)
        with patch.dict(os.environ,h.ENV):
            replay=apply_view_choices(self.report,{chart['id']:chosen['id']})
            restored=restore_report_presentation(session_report_summary(replay),restore_artifacts(replay,self.catalog),self.catalog)
            self.assertEqual(next(c for c in restored['charts'] if c['id']==chart['id'])['data'],chosen['payload']['data'])
            self.assertEqual(self.verdict(restored),'verified')
            document=Document(generate_report_docx(restored))
            self.assertIn(chosen['payload']['caption'],'\n'.join(p.text for p in document.paragraphs))

    def test_export_replays_ids_from_owned_session_not_client_data_and_rejects_stale_revision(self):
        import os
        from types import SimpleNamespace
        from unittest.mock import patch
        from fastapi import HTTPException
        from routers import reports
        chart=next(c for c in self.report['charts'] if 'order_type' in c.get('dimension_ids',[]))
        chosen=variant(chart,'total')
        payload=dict(session_id=self.report['session_id'],revision=self.report['revision'],
                     chart_view_choices={chart['id']:chosen['id']},charts=[dict(data=[dict(value=999999999)])])
        with patch.dict(os.environ,h.ENV),patch('routers.reports._principal',return_value=SimpleNamespace(bound_owner='owner-a')), \
             patch('services.analysis_pipeline.AnalysisPipeline.catalog',return_value=self.catalog), \
             patch('services.access_policy.current_principal',return_value=SimpleNamespace()):
            restored=reports._authoritative_report(payload)
            self.assertEqual(self.verdict(restored),'verified')
            self.assertEqual(next(c for c in restored['charts'] if c['id']==chart['id'])['data'],chosen['payload']['data'])
            self.assertNotIn('999999999',str(restored['charts']))
            with self.assertRaises(HTTPException) as stale:
                reports._authoritative_report({**payload,'revision':payload['revision']+1})
            self.assertEqual(stale.exception.status_code,409)
            with patch('routers.reports._principal',return_value=SimpleNamespace(bound_owner='another-owner')):
                with self.assertRaises(HTTPException) as denied:reports._authoritative_report(payload)
                self.assertEqual(denied.exception.status_code,404)

    def test_saved_snapshot_view_export_does_not_require_the_expired_transient_session(self):
        import os
        from types import SimpleNamespace
        from unittest.mock import patch
        from routers import reports
        from fastapi import HTTPException
        chart=next(c for c in self.report['charts'] if 'order_type' in c.get('dimension_ids',[]))
        chosen=variant(chart,'single',B)
        payload=dict(saved_report_id='rpt_owned',revision=self.report['revision'],chart_view_choices={chart['id']:chosen['id']})
        with patch.dict(os.environ,h.ENV),patch('routers.reports._principal',return_value=SimpleNamespace(bound_owner='owner-a')), \
             patch('routers.reports.get_saved_report',return_value=dict(module_config=self.report)) as load, \
             patch('services.session_service.get_session',side_effect=AssertionError('Expired session must not be read')), \
             patch('services.access_policy.current_principal',return_value=SimpleNamespace()):
            replay=reports._authoritative_report(payload)
            load.assert_called_once_with('rpt_owned')
            self.assertEqual(self.verdict(replay),'verified')
            with patch('routers.reports.get_saved_report',side_effect=HTTPException(404,'Not owned')):
                with self.assertRaises(HTTPException):reports._authoritative_report(payload)

    def test_enumerated_mutations_are_rejected(self):
        def swap_members(chart):
            v = variant(chart, 'compare')['payload']
            v['series'][0]['label'], v['series'][1]['label'] = v['series'][1]['label'], v['series'][0]['label']
        def inflate_total(chart):
            variant(chart, 'total')['payload']['data'][0]['value'] += 1
        def stale_fact(chart):
            variant(chart, 'single', A)['insight']['key_facts'][0]['value'] += 1
        def forged_view_ref(chart):
            chart['view_ref'] = chart['view_ref'] + '~forged'
        def member_retarget(chart):
            variant(chart, 'single', A)['spec']['member'] = B
        def share_labelled_absolute(chart):
            variant(chart, 'compare', value_mode='member_share')['payload']['unit'] = 'VND'
        def visible_data_differs_from_default(chart):
            chart['data'][0][next(k for k in chart['data'][0] if k != 'label')] += 5
        def outside_member_injected(chart):
            v = variant(chart, 'compare')['payload']
            v['series'].append(dict(key='series_9', label=G, color='#000'))
            v['data'][0]['series_9'] = 1000000
        def hidden_missing_member_note(chart):
            block = variant(chart, 'compare')['insight']
            block['verification_context']['chart']['view_note'] = None
            block['caveats'] = [c for c in block['caveats'] if 'Không có dữ liệu' not in c]
            # same as valid when nothing is missing; force a note mismatch instead
            block['verification_context']['chart']['view_note'] = 'Không có dữ liệu cho X trong lát cắt này.'
        mutations = dict(swap_members=swap_members, inflate_total=inflate_total, stale_fact=stale_fact, forged_view_ref=forged_view_ref,
                         member_retarget=member_retarget, share_labelled_absolute=share_labelled_absolute,
                         visible_data_differs_from_default=visible_data_differs_from_default,
                         outside_member_injected=outside_member_injected, hidden_missing_member_note=hidden_missing_member_note)
        for name, fn in mutations.items():
            with self.subTest(mutation=name):
                self.assertNotEqual(self.verdict(self.mutate(fn)), 'verified')


if __name__ == '__main__':
    unittest.main()


class SelectionTests(unittest.TestCase):
    """Selection → fixed cohort → comparison; scores from evals.comparison_fixture (independent)."""

    def test_calendar_missing_for_every_member_is_not_skipped(self):
        from services.selection_service import calendar_buckets,select
        from services.insight_service import trend_bucket_coverage
        period=dict(start='2026-01-01',end='2026-04-30')
        complete=lambda b:not trend_bucket_coverage(b,'month',period)['partial']
        rows=[dict(city=c,period=f'2026-{m:02}-01',revenue=10) for c in ['A','B'] for m in (1,3,4)]
        buckets=calendar_buckets(rows,'month',period,complete)
        self.assertIn('2026-02-01',buckets)
        result=select(rows,'city','revenue','stability',2,complete,expected_buckets=buckets)
        self.assertEqual(result['status'],'insufficient_eligible')
        self.assertEqual(result['excluded'],{'missing_buckets':2})

    def expected(self, data, field, criterion, limit):
        series = cf.monthly_series(data, member_field=field)
        scores = {m: (cf.cv([v[k] for k in sorted(v)]) if criterion == 'stability' else cf.growth([v[k] for k in sorted(v)]))
                  for m, v in series.items() if len(v) == 4}
        scores = {m: s for m, s in scores.items() if s is not None}
        ordered = sorted(scores, key=lambda m: (scores[m] if criterion == 'stability' else -scores[m], m))
        return ordered[:limit], scores

    def test_two_most_stable_provinces_are_selected_then_compared(self):
        data = cf.selection_data()
        req = h.requirement(filters=[], selection=dict(criterion='stability', limit=2))
        report, provider, _ = h.run([h.envelope(req)], data=data, question='so sánh doanh thu của 2 tỉnh có doanh thu ổn định nhất')
        chosen, scores = self.expected(data, 'thanh_pho', 'stability', 2)
        frame = report['comparison_frames'][0]
        self.assertEqual(provider.call_count, 1)
        self.assertEqual(report['verification']['status'], 'verified')
        self.assertEqual(sorted(m['key'] for m in frame['members']), sorted(chosen))
        self.assertEqual(frame['selection']['selected'], chosen)
        for e in frame['selection']['eligible']:
            self.assertAlmostEqual(e['score'], scores[e['key']], places=12)
        primary = next(c for c in report['charts'] if c.get('relevance_role') == 'primary')
        self.assertEqual({row['label'] for row in variant(primary, 'compare')['payload']['data']}, set(chosen))

    def test_model_cannot_supply_the_selected_cohort_or_selector_execution_fields(self):
        data=cf.selection_data()
        req=h.requirement(filters=[],selection=dict(criterion='stability',limit=2,selected_keys=['invented'],
                          entity_dimension_id='store',cadence='day'))
        report,_,_=h.run([h.envelope(req)],data=data,question='so sánh doanh thu của 2 tỉnh có doanh thu ổn định nhất')
        chosen,_=self.expected(data,'thanh_pho','stability',2)
        receipt=report['comparison_frames'][0]['selection']
        self.assertEqual(receipt['selected'],chosen)
        self.assertEqual(receipt['entity_dimension_id'],'city')
        self.assertEqual(receipt['cadence'],'month')

    def test_selection_receipt_is_reverified_and_forgeries_are_caught(self):
        import os
        from unittest.mock import patch
        from services.analysis_quality_service import verify_saved_report
        from services.analysis_catalog import AnalysisCatalog
        from tests.analysis_fixtures import physical_metadata
        req = h.requirement(filters=[], selection=dict(criterion='stability', limit=2))
        report, _, _ = h.run([h.envelope(req)], data=cf.selection_data(), question='so sánh doanh thu của 2 tỉnh có doanh thu ổn định nhất')
        with patch.dict(os.environ, h.ENV):
            catalog = AnalysisCatalog(physical_metadata())
            self.assertEqual(verify_saved_report(deepcopy(report), catalog)['status'], 'verified')
            for name, mutate in dict(
                    swapped_member=lambda s: s.update(selected=list(reversed(s['selected'])) if len(set(s['selected'])) > 1 else s['selected'] + ['X']),
                    inflated_score=lambda s: s['eligible'][0].update(score=s['eligible'][0]['score'] + 0.5),
                    hidden_exclusion=lambda s: s.update(excluded={})).items():
                with self.subTest(mutation=name):
                    forged = deepcopy(report)
                    mutate(forged['comparison_frames'][0]['selection'])
                    if name == 'hidden_exclusion' and not report['comparison_frames'][0]['selection']['excluded']:
                        forged['comparison_frames'][0]['selection']['excluded'] = {'missing_buckets': 9}
                    self.assertNotEqual(verify_saved_report(forged, catalog)['status'], 'verified')

    def test_too_few_eligible_members_is_insufficient_data_not_a_fallback(self):
        series = dict(cf.SELECTION_SERIES, sb1=[100, None, 50, 200], sb2=[None, None, None, None])  # Beta misses a month
        data = cf.selection_data(series)
        req = h.requirement(filters=[], selection=dict(criterion='stability', limit=3))
        with self.assertRaises(Exception) as ctx:
            h.run([h.envelope(req)], data=data, question='so sánh doanh thu của 3 tỉnh có doanh thu ổn định nhất')
        self.assertEqual(getattr(ctx.exception, 'category', None), 'insufficient_data')

    def test_criterion_incompatible_with_metric_class_is_typed_unsupported(self):
        req = h.requirement(filters=[], metric_ids=['purchasing_customer_count'], selection=dict(criterion='stability', limit=2))
        with self.assertRaises(Exception) as ctx:
            h.run([h.envelope(req)], data=cf.selection_data(), question='2 tỉnh có số khách hàng mua hàng ổn định nhất')
        self.assertEqual(getattr(ctx.exception, 'category', None), 'selection_unsupported')

    def test_growth_selection_transfers_to_another_entity_axis(self):
        data = cf.selection_data()
        req = h.requirement(filters=[], dimension_ids=['store'], selection=dict(criterion='growth', limit=1),
                            goal='Cửa hàng tăng trưởng nhanh nhất')
        report, _, _ = h.run([h.envelope(req)], data=data, question='cửa hàng nào tăng trưởng doanh thu nhanh nhất', mission=None)
        stores = {s['ma_chi_nhanh']: s['ten_chi_nhanh'] for s in data['chi_nhanh']}
        series = {}
        for o in data['don_hang']:
            series.setdefault(stores[o['co_so_ma']], {})[o['ngay_tao'][:7]] = o['tong_tien']
        best = max(series, key=lambda k: cf.growth([series[k][m] for m in sorted(series[k])]))
        req = next(r for r in report['semantic_intent']['requirements'] if r['id'] == 'r1')
        best_id=next(k for k,v in stores.items() if v==best)
        self.assertEqual(req['selection']['selected_keys'], [best_id])
        self.assertEqual(req['filters'], [dict(dimension='store_id', operator='in', value=[best_id])])
        rows = [r for q in report['result_sets'].values() if q.get('role') == 'requested' for r in q['rows']]
        self.assertTrue(rows and all(r.get('store') == best for r in rows if 'store' in r))

    def test_duplicate_entity_labels_keep_identity_selection_and_view_members_separate(self):
        data=cf.selection_data()
        for store in data['chi_nhanh']:store['ten_chi_nhanh']='Cửa hàng trùng tên'
        req=h.requirement(filters=[],dimension_ids=['store'],selection=dict(criterion='growth',limit=2))
        report,_,_=h.run([h.envelope(req)],data=data,question='so sánh doanh thu của 2 cửa hàng tăng trưởng nhanh nhất',mission=None)
        frame=report['comparison_frames'][0]
        self.assertEqual(frame['member_key_dimension'],'store_id')
        self.assertEqual(len({m['key'] for m in frame['members']}),2)
        self.assertEqual(len({m['label'] for m in frame['members']}),2)
        primary=next(c for c in report['charts'] if c.get('relevance_role')=='primary' and c.get('view_modes'))
        for member in frame['members']:
            single=variant(primary,'single',member['key'])
            self.assertIsNotNone(single)
            self.assertEqual(single['availability'],'available')
            self.assertTrue(all(str(r.get('label','')).startswith('Doanh thu') or 'trùng tên' in r.get('label','') for r in single['payload']['data']))
        self.assertEqual(report['verification']['status'],'verified')


class CompositeMemberTests(unittest.TestCase):
    """“Các kiosk” is the governed union of kiosk subtypes; the primary answer compares the union with the
    main stores instead of picking the two extremes among subtypes (incident 3 class)."""

    def test_kiosk_union_versus_main_store(self):
        data = cf.warehouse_data()
        env = h.envelope(h.requirement(dimension_ids=['store_type'], filters=[dict(dimension='store_type', operator='in',
                         value=['KIOSK_NHUONG_QUYEN', 'KIOSK_VE_TINH', 'CHI_NHANH_CHINH']), dict(dimension='city', operator='eq', value=A)]))
        report, _, _ = h.run([env], data=data, question=f'so sánh doanh thu kiosk với chi nhánh chính tại {A}')
        types = {s['ma_chi_nhanh']: (s['loai_diem_ban'], s['thanh_pho']) for s in data['chi_nhanh']}
        scoped = [o for o in data['don_hang'] if o['trang_thai_don_hang'] in cf.VALID and types[o['co_so_ma']][1] == A]
        kiosk = sum(o['tong_tien'] for o in scoped if types[o['co_so_ma']][0].startswith('KIOSK'))
        main = sum(o['tong_tien'] for o in scoped if types[o['co_so_ma']][0] == 'CHI_NHANH_CHINH')
        frame = report['comparison_frames'][0]
        self.assertTrue(frame.get('composite'), frame)
        self.assertEqual(report['verification']['status'], 'verified')
        primary = next(c for c in report['charts'] if c.get('relevance_role') == 'primary')
        values = {row['label']: row['value'] for row in variant(primary, 'compare')['payload']['data']}
        self.assertEqual(sorted(values.values()), sorted([kiosk, main]))
        kiosk_label = next(m['label'] for m in frame['members'] if len(m['values']) == 2)
        self.assertEqual(values[kiosk_label], kiosk)
        texts = ' '.join(f['text'] for f in primary['insight']['key_facts'])
        self.assertIn(kiosk_label, texts)  # the answer names the union, not a subtype extreme


class CriterionClarificationTests(unittest.TestCase):
    def test_undefined_criterion_asks_only_for_the_criterion_without_repair(self):
        req = h.requirement(filters=[], availability='needs_input', reason='ambiguous_criterion', derived_features=[])
        with self.assertRaises(Exception) as ctx:
            h.run([h.envelope(req)], question='so sánh doanh thu của 2 tỉnh hiệu quả nhất')
        error = ctx.exception
        self.assertEqual(getattr(error, 'category', None), 'clarification')
        self.assertIn('chọn 2 nhóm', str(error))          # the stated N is kept, not asked again
        options = error.choices
        criteria = {o.get('criterion') or o.get('id') for o in options}
        self.assertTrue({'stability', 'growth', 'volatility'} <= criteria, options)
        self.assertFalse(any('Top' in o['label'] and 'doanh thu' in o['label'] and not o['label'].startswith('Hoặc') for o in options))

    def test_model_reported_ambiguous_criterion_returns_governed_choices(self):
        req = h.requirement(filters=[], availability='needs_input', reason='ambiguous_criterion', derived_features=[])
        with self.assertRaises(Exception) as ctx:
            h.run([h.envelope(req)], question='so sánh doanh thu của 2 tỉnh có doanh thu ổn định nhất')
        self.assertEqual(getattr(ctx.exception, 'category', None), 'clarification')
        self.assertEqual({c['id'] for c in ctx.exception.choices}, {'stability', 'growth', 'volatility'})
        self.assertEqual(h.LAST['pipeline'].semantic_info.get('semantic_repair_count', 0), 0)


class TimeRangeUnderstandingTests(unittest.TestCase):
    def test_month_and_quarter_ranges_are_one_window_and_period_comparisons_stay_two(self):
        from services.time_resolution_service import parse_time
        from services.preflight_service import preflight_catalog
        registry = preflight_catalog().registry
        def parts(q):
            return [{k: v for k, v in p.items() if v is not None} for p in parse_time(q, registry['interpretation'], registry['timezone'])['recognized_time_parts']]
        self.assertEqual(parts('doanh thu từ tháng 1 đến tháng 9 năm 2026'), [dict(kind='range', start='2026-01-01', end='2026-09-30')])
        self.assertEqual(parts('số đơn quý 2 - quý 3 năm 2025'), [dict(kind='range', start='2025-04-01', end='2025-09-30')])
        self.assertEqual(len(parts('so sánh doanh thu tháng 8 với tháng 9 năm 2026')), 2)
        self.assertEqual(parts('doanh thu từ tháng 9 đến tháng 1 năm 2026'), [])  # inverted range is invalid, never two months


class MemberAxisMetadataTests(unittest.TestCase):
    """Live catalogs state a closed enumeration's cardinality as a count; named members beat enumerations."""
    REG = {'dimensions': {
        'store_type': dict(cardinality_hint=3, enum=['A', 'B', 'C']),
        'payment_method': dict(cardinality_hint='enumerated', enum=['cash', 'card']),
        'city': dict(cardinality_hint='high')}}

    def req(self, **kw):
        base = dict(id='r', analysis_kind='comparison', dimension_ids=['store_type'], filters=[], derived_features=[],
                    supporting_for=None, availability='requested', comparison_time=None)
        return {**base, **kw}

    def test_numeric_cardinality_enumeration_is_an_axis(self):
        from services.view_mode_service import member_axis
        self.assertEqual(member_axis(self.req(), self.REG)[:2], ('store_type', ['A', 'B', 'C']))

    def test_named_filter_axis_wins_over_earlier_enumeration(self):
        from services.view_mode_service import member_axis
        req = self.req(dimension_ids=['payment_method', 'city'], filters=[dict(dimension='city', operator='in', value=['X', 'Y'])])
        self.assertEqual(member_axis(req, self.REG)[:2], ('city', ['X', 'Y']))

    def test_grouped_member_filter_is_comparison_but_plain_filter_is_not(self):
        from services.view_mode_service import comparison_evidence
        grouped = self.req(analysis_kind='cross_tab', dimension_ids=['city'], filters=[dict(dimension='city', operator='in', value=['X', 'Y'])])
        self.assertEqual(comparison_evidence(grouped), 'grouped_member_filter')
        plain = self.req(analysis_kind='cross_tab', dimension_ids=['payment_method'], filters=[dict(dimension='city', operator='in', value=['X', 'Y'])])
        self.assertIsNone(comparison_evidence(plain))
        # Two-axis breakdown restricted to named values is a scope (heatmap stays), unless scope resolution bound a comparison.
        table = self.req(analysis_kind='cross_tab', dimension_ids=['city', 'payment_method'], filters=[dict(dimension='city', operator='in', value=['X', 'Y'])])
        self.assertIsNone(comparison_evidence(table))
        scope = dict(bindings=[dict(dimension='city', comparison=True, comparison_dimension='city', members=['X', 'Y'])])
        self.assertEqual(comparison_evidence(table, scope_resolution=scope), 'scope_comparison')


class SelectionAnchorTests(unittest.TestCase):
    def test_model_invented_criterion_is_dropped_not_executed(self):
        # Live P10: "top 5 … cao nhất" came back with selection=stability → insufficient_data. The criterion must be the user's.
        req = h.requirement(filters=[], selection=dict(criterion='stability', limit=2))
        report, _, _ = h.run([h.envelope(req)], data=cf.selection_data(), question='so sánh doanh thu của các tỉnh')
        self.assertEqual(report['status'], 'success')
        self.assertFalse(any(f.get('selection') for f in report.get('comparison_frames') or []))
        rules = [n['rule'] for n in h.LAST['pipeline'].semantic_info.get('diagnostics', {}).get('semantic_normalizations', [])] \
            if isinstance(h.LAST['pipeline'].semantic_info.get('diagnostics'), dict) else None
        self.assertTrue(rules is None or 'selection_criterion_unanchored' in rules)

    def test_cues_fold_accents(self):
        from services.selection_service import criterion_anchored
        self.assertTrue(criterion_anchored('stability', '2 TỈNH Ổn Định nhất'))
        self.assertTrue(criterion_anchored('volatility', 'biến động nhiều nhất'))
        self.assertFalse(criterion_anchored('growth', 'top 5 cửa hàng doanh thu cao nhất'))


class MetricAnchorNameTests(unittest.TestCase):
    def test_parenthesised_definition_name_anchors_the_qualified_metric(self):
        # Live P02: "số đơn hợp lệ" anchored the generic "số đơn" (all orders) because the governed name carries "(…)".
        from services.request_anchors import request_anchors
        from services.analysis_catalog import AnalysisCatalog
        from tests.analysis_fixtures import physical_metadata
        catalog = AnalysisCatalog(physical_metadata())
        m = catalog.registry['metrics']
        m['valid_order_count'] = dict(m['order_count'], business_name='Số đơn hợp lệ (HOAN_THANH + DANG_GIAO)', aliases=[])
        m['order_count'] = dict(m['order_count'], business_name='Số lượng đơn', aliases=['số đơn'])
        found = request_anchors('so sánh số đơn hợp lệ của Hải Phòng và Cần Thơ', catalog, {})['metrics']
        self.assertEqual([x['candidate_ids'] for x in found], [['valid_order_count']])


class RankingCensusTests(unittest.TestCase):
    def test_ranked_rate_carries_its_own_components_and_gap_is_percentage_points(self):
        req=h.requirement(metric_ids=['order_completion_rate'],filters=[],derived_features=['top_gap'],analysis_kind='ranking',
                          ranking=dict(direction='top',metric_id='order_completion_rate',limit=2))
        report,_,_=h.run([h.envelope(req)],data=cf.warehouse_data(),mission=None,
                         question='top 2 tỉnh có tỷ lệ hoàn thành đơn cao nhất')
        primary=next(c for c in report['charts'] if c.get('ranking_census'))
        self.assertTrue(all('numerator' in r and 'denominator' in r for r in primary['data']))
        expected={A:(2,3),G:(1,1)}
        self.assertEqual({r['label']:(r['numerator'],r['denominator']) for r in primary['data']},expected)
        gaps=[c for c in report['kpi_cards'] if c.get('label')=='Chênh lệch hạng 1–2']
        self.assertTrue(gaps)
        self.assertEqual(gaps[0]['unit'],'điểm %')
        # The supporting time series is a percentage measure too: its absolute
        # movement is a percentage-point difference, never a relative % claim.
        trend=next(c for c in report['charts'] if c.get('x_field')=='period')
        movement=next(f for f in trend['insight']['key_facts'] if (f.get('calc') or {}).get('kind')=='change')
        self.assertEqual(movement['unit'],'điểm %')
        self.assertIn('33,3 điểm %',movement['text'])

    """Incident 4: Top-N with a tie at the boundary states actual n/N; it is never a member projection."""

    @staticmethod
    def totals(data):
        stores = {s['ma_chi_nhanh']: s['thanh_pho'] for s in data['chi_nhanh']}
        out = {}
        for o in data['don_hang']:
            if o['trang_thai_don_hang'] in ('HOAN_THANH', 'DANG_GIAO'):
                out[stores[o['co_so_ma']]] = out.get(stores[o['co_so_ma']], 0) + o['tong_tien']
        return out

    def tied_data(self):
        base = self.totals(cf.warehouse_data(gamma_amount=0))
        gamma = cf.CITIES['Gamma']
        low = min(v for k, v in base.items() if k != gamma)
        data = cf.warehouse_data(gamma_amount=low - base.get(gamma, 0))   # Gamma ties the lowest other city
        totals = self.totals(data)
        self.assertEqual(sorted(totals.values())[0], sorted(totals.values())[1])
        return data, totals

    def report(self, data):
        req = h.requirement(analysis_kind='ranking', filters=[], derived_features=[],
                            ranking=dict(metric_id='revenue', direction='bottom', limit=1))
        report, _, _ = h.run([h.envelope(req)], data=data, mission=None, question='tỉnh có doanh thu thấp nhất')
        return report

    def test_boundary_tie_census_counts_are_oracle_exact_and_chart_is_not_projected(self):
        data, totals = self.tied_data()
        report = self.report(data)
        self.assertEqual(report['verification']['status'], 'verified')
        chart = next(c for c in report['charts'] if c.get('ranking_census'))
        census = chart['ranking_census']
        low = min(totals.values())
        self.assertEqual(census['eligible_population'], len(totals))
        self.assertEqual(census['boundary_tie_count'], sum(1 for v in totals.values() if v == low))
        self.assertEqual((census['selected'], census['boundary_shown']), (1, 1))
        self.assertIn('đồng hạng', census['note'])
        self.assertFalse(chart.get('view_modes'))

    def test_mutation_hidden_tie_is_detected(self):
        data, _ = self.tied_data()
        report = self.report(data)
        chart = next(c for c in report['charts'] if c.get('ranking_census'))
        forged = deepcopy(report)
        fchart = next(c for c in forged['charts'] if c.get('id') == chart.get('id'))
        fchart['ranking_census']['boundary_tie_count'] = 1
        self.assertNotEqual(report_status(forged, h), 'verified')


def report_status(report, harness):
    from services.analysis_quality_service import verify_saved_report
    try:
        from services.analysis_catalog import AnalysisCatalog
        from tests.analysis_fixtures import physical_metadata
        import os
        from unittest.mock import patch
        with patch.dict(os.environ, harness.ENV):
            return verify_saved_report(report, AnalysisCatalog(physical_metadata()))['status']
    except Exception:  # noqa: BLE001 - a rejected forgery is a pass for the mutation
        return 'rejected'


class LiveDevGeneralizationTests(unittest.TestCase):
    """Generic causes found in the live dev batch (dev-run-1..4), each reproduced offline."""

    def test_component_only_count_is_requestable_twin_plus_governed_filter(self):
        # P02: "số đơn hợp lệ" = component-only valid_order_count → order_count + order_status IN (HOAN_THANH, DANG_GIAO).
        data = cf.warehouse_data()
        a, b = cf.CITIES['Alpha'], cf.CITIES['Beta']
        req = h.requirement(metric_ids=['valid_order_count'], analysis_kind='comparison', feature_metrics={'group_gap': ['valid_order_count']})
        report, _, _ = h.run([h.envelope(req)], data=data, question=f'so sánh số đơn hợp lệ của {a} và {b}')
        stores = {s['ma_chi_nhanh']: s['thanh_pho'] for s in data['chi_nhanh']}
        expected = {}
        for o in data['don_hang']:
            if o['trang_thai_don_hang'] in ('HOAN_THANH', 'DANG_GIAO') and stores[o['co_so_ma']] in (a, b):
                expected[stores[o['co_so_ma']]] = expected.get(stores[o['co_so_ma']], 0) + 1
        primary = next(c for c in report['charts'] if c.get('relevance_role') == 'primary' and c.get('view_modes'))
        self.assertEqual(report['verification']['status'], 'verified')
        self.assertEqual({r['label']: r['value'] for r in variant(primary, 'compare')['payload']['data']}, expected)

    def test_value_ranking_with_one_named_criterion_becomes_that_selection(self):
        # P24: "2 tỉnh biến động nhiều nhất" drafted as Top 2 revenue; the named criterion wins, never the raw value.
        data = cf.selection_data()
        req = h.requirement(filters=[], analysis_kind='ranking', derived_features=[], ranking=dict(metric_id='revenue', direction='top', limit=2))
        report, _, _ = h.run([h.envelope(req)], data=data, question='so sánh doanh thu của 2 tỉnh có doanh thu biến động nhiều nhất')
        series = cf.monthly_series(data, member_field='thanh_pho')
        scores = {m: cf.cv([v[k] for k in sorted(v)]) for m, v in series.items() if len(v) == 4}
        chosen = sorted((m for m in scores if scores[m] is not None), key=lambda m: (-scores[m], m))[:2]
        frame = report['comparison_frames'][0]
        self.assertEqual(frame['selection']['criterion'], 'volatility')
        self.assertEqual(frame['selection']['selected'], chosen)

    def test_rate_companions_are_not_separate_charts(self):
        # T07: numerator/denominator of a compared rate are evidence inside its chart, never their own bars.
        req = h.requirement(metric_ids=['order_completion_rate'], dimension_ids=['store_type'], filters=[], analysis_kind='comparison',
                            feature_metrics={'group_gap': ['order_completion_rate']})
        report, _, _ = h.run([h.envelope(req)], data=cf.warehouse_data(), question='so sánh tỷ lệ hoàn thành đơn giữa các loại điểm bán')
        companions = {'completed_terminal_order_count', 'terminal_order_count'}
        self.assertFalse([c for c in report['charts'] if set(c.get('metrics') or [c.get('metric')]) & companions])
        self.assertEqual(report['verification']['status'], 'verified')
        self.assertTrue(any(c.get('metric') == 'order_completion_rate' for c in report['charts']))

    def test_breakdown_comparison_without_member_axis_gets_targeted_axis_repair(self):
        # P17: grouped by payment method, filtered to the two compared cities, city axis missing.
        from services.scope_resolution_service import scope_issues
        from services.analysis_intent import IntentRequirement
        from services.analysis_catalog import AnalysisCatalog
        from tests.analysis_fixtures import physical_metadata
        catalog = AnalysisCatalog(physical_metadata())
        resolution = dict(bindings=[dict(dimension='city', members=['X', 'Y'], comparison=True, comparison_dimension='city',
                                         cohorts=[dict(members=['X']), dict(members=['Y'])], excluded_members=[])])
        req = IntentRequirement.model_validate(dict(id='r1', metric_ids=['revenue'], dimension_ids=['payment_method'], analysis_kind='cross_tab',
                                                    filters=[dict(dimension='city', operator='in', value=['X', 'Y'])]))
        axis = [i for i in scope_issues(resolution, [req], catalog) if i['code'] == 'scope_cohort_axis_mismatch']
        self.assertEqual([i['expected'] for i in axis], [['city', 'payment_method']])


class FinalRunGeneralizationTests(unittest.TestCase):
    """Generic causes from final-run-1 (35/40, NOT_QUALIFIED), each reproduced offline before the next qualification."""

    def test_calendar_prefix_is_an_exact_window_not_the_full_year(self):
        from services.time_resolution_service import parse_time
        from services.analysis_catalog import AnalysisCatalog
        from tests.analysis_fixtures import physical_metadata
        catalog=AnalysisCatalog(physical_metadata())
        for months,year,end in [(1,2025,'2025-01-31'),(2,2024,'2024-02-29'),(9,2026,'2026-09-30')]:
            result=parse_time(f'doanh thu {months} tháng đầu năm {year}',catalog.registry['interpretation'],catalog.registry['timezone'])
            self.assertEqual(result['recognized_time_parts'],[dict(kind='range',start=f'{year}-01-01',end=end)])

    def test_eq_pinned_axis_is_scope_and_scope_comparison_is_evidence(self):
        # P06: cross_tab [store_type, city] with city = Hà Nội; scope resolution bound kiosk vs chi nhánh as a comparison.
        from services.view_mode_service import comparison_evidence
        req = dict(analysis_kind='cross_tab', dimension_ids=['store_type', 'city'], derived_features=[], comparison_time=None,
                   filters=[dict(dimension='city', operator='eq', value='X')])
        self.assertIsNone(comparison_evidence(req))
        scope = dict(bindings=[dict(dimension='store_type', comparison=True, comparison_dimension='store_group', members=['A', 'B'])])
        self.assertEqual(comparison_evidence(req, scope_resolution=scope), 'scope_comparison')
        pinned_named = dict(req, filters=[*req['filters'], dict(dimension='store_type', operator='in', value=['A', 'B'])])
        self.assertEqual(comparison_evidence(pinned_named), 'grouped_member_filter')

    def test_top1_among_named_members_keeps_both_members(self):
        # T06: "A hay B có AOV cao hơn" drafted as Top 1 → every named member stays visible, the leader is a fact.
        a, b = cf.CITIES['Alpha'], cf.CITIES['Beta']
        req = h.requirement(analysis_kind='ranking', derived_features=['leader'], ranking=dict(metric_id='revenue', direction='top', limit=1))
        report, _, _ = h.run([h.envelope(req)], data=cf.warehouse_data(), question=f'{a} hay {b} có doanh thu cao hơn')
        frame = report['comparison_frames'][0]
        self.assertEqual(sorted(m['key'] for m in frame['members']), sorted([a, b]))
        primary = next(c for c in report['charts'] if c.get('relevance_role') == 'primary' and c.get('view_modes'))
        self.assertEqual({r['label'] for r in variant(primary, 'compare')['payload']['data']}, {a, b})

    def test_governed_scope_patch_is_applied_without_a_repair_call(self):
        # P09/P17: the model's copy of required_scope_patches changed untargeted fields; the server owns scope facts.
        a, b, g = cf.CITIES['Alpha'], cf.CITIES['Beta'], cf.CITIES['Gamma']
        req = h.requirement(filters=[dict(dimension='city', operator='in', value=[a, g])])
        report, provider, _ = h.run([h.envelope(req)], data=cf.warehouse_data(), question=f'so sánh doanh thu của {a} và {b}')
        self.assertEqual(provider.call_count, 1)
        self.assertEqual(sorted(m['key'] for m in report['comparison_frames'][0]['members']), sorted([a, b]))

    def test_comparison_grain_keeps_member_and_requested_breakdown(self):
        for kind, dims, clause, granularity in [('trend', [], 'theo tháng', 'month'),
                                               ('cross_tab', ['city', 'order_type'], 'theo hình thức nhận hàng', None)]:
            with self.subTest(kind=kind):
                req=h.requirement(analysis_kind=kind,dimension_ids=dims,derived_features=[],granularity=granularity)
                report,provider,_=h.run([h.envelope(req)],mission=None,question=f'so sánh doanh thu {clause} giữa {A} và {B}')
                self.assertEqual(provider.call_count,1)
                self.assertEqual({m['key'] for m in report['comparison_frames'][0]['members']},{A,B})
                self.assertEqual(report['verification']['status'],'verified')
                self.assertTrue(all('city' in c.get('dimension_ids',[]) for c in report['charts']
                                    if c.get('relevance_role')=='supporting' and c.get('metric')=='revenue'))

    def test_named_comparison_does_not_accept_model_invented_top_n(self):
        req=h.requirement(dimension_ids=['city','store_type'], analysis_kind='comparison',
            filters=[dict(dimension='city',operator='eq',value=A),dict(dimension='store_type',operator='in',
                value=['CHI_NHANH_CHINH','KIOSK_NHUONG_QUYEN','KIOSK_VE_TINH'])],
            ranking=dict(direction='top',metric_id='revenue',limit=2),derived_features=['top_gap'])
        report,provider,_=h.run([h.envelope(req)],question=f'so sánh doanh thu kiosk và chi nhánh chính ở {A}')
        self.assertEqual(provider.call_count,1)
        frame=report['comparison_frames'][0]
        self.assertEqual(frame['axis_dimension_id'],'store_type')
        self.assertTrue(frame.get('composite'))

    def test_selection_checks_time_before_any_selection_query(self):
        from types import SimpleNamespace
        from datetime import date
        from unittest.mock import Mock
        from services.hybrid_analyst_planner import HybridAnalystPlanner
        from services.analysis_intent import AnalysisIntentEnvelope
        from services.analytical_resolver import ResolutionIssues
        from services.analysis_catalog import AnalysisCatalog
        from services.request_anchors import request_anchors
        from tests.analysis_fixtures import physical_metadata
        catalog=AnalysisCatalog(physical_metadata())
        question='2 tỉnh có doanh thu ổn định nhất từ tháng 1 đến tháng 9 năm 2026'
        anchors=request_anchors(question,catalog,{})
        req=h.requirement(filters=[],selection=dict(criterion='stability',limit=2),
                          time=dict(kind='range',start='2026-09-01',end='2026-10-01'))
        planner=SimpleNamespace(diagnostics={},anchors=anchors,reference=date(2026,10,22),catalog=catalog,queries=Mock())
        resolver=Mock()
        with self.assertRaises(ResolutionIssues) as caught:
            HybridAnalystPlanner.apply_selections(planner,AnalysisIntentEnvelope.model_validate(h.envelope(req)),resolver,question)
        self.assertTrue(any(i['field']=='time' for i in caught.exception.issues))
        resolver.resolve.assert_not_called()
        planner.queries.run_batch.assert_not_called()
