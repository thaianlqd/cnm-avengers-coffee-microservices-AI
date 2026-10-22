"""Scope/fact mutations must fail independent verification and export admission."""
from copy import deepcopy
from unittest.mock import patch
from fastapi import HTTPException
from tests import test_hybrid_v28 as f
from tests.test_ai_final_depth_contract import DepthReportMixin
from services.analysis_quality_service import verify_saved_report
from evals.rich_fixture import rich_orders_data


class NarrativeScopeTests(DepthReportMixin, f.unittest.TestCase):
    def test_word_table_discloses_full_result_count_and_displayed_preview(self):
        from services.docx_service import generate_report_docx
        import zipfile
        from xml.etree import ElementTree
        for full,preview,shown in [(80,50,15),(2,2,2)]:
            with self.subTest(full=full):
                report={'title':'Phạm vi dữ liệu','table_data':{'columns':['city','revenue'],
                    'rows':[{'city':f'Tỉnh {i}','revenue':i} for i in range(preview)],'total_rows':full}}
                content=generate_report_docx(report)
                with zipfile.ZipFile(content) as archive:
                    root=ElementTree.fromstring(archive.read('word/document.xml'))
                text=''.join(root.itertext())
                self.assertIn(f'Hiển thị {shown} trên tổng số {full} dòng kết quả',text)
                self.assertNotIn(f'Tổng cộng {preview} bản ghi hợp lệ',text)

    def test_guided_compare_cards_have_verified_fact_ids_and_mutations_fail(self):
        report = self.report(f.requirement(), 'So sánh doanh thu theo tỉnh/thành giữa Hồ Chí Minh và Hà Nội tháng 9 năm 2026',
            rich_orders_data(), analysis_mission='compare', input_mode='guided', analysis_depth='focused',
            time={'mode': 'custom', 'start': '2026-09-01', 'end': '2026-09-30'},
            guided_contract={'metric': 'revenue', 'dimension': 'city', 'group_a': 'Hồ Chí Minh', 'group_b': 'Hà Nội'})[2]
        self.assertEqual(report['quality_assessment']['status'], 'verified')
        self.assertGreaterEqual(len(report['kpi_cards']), 4)
        for index in range(4):
            self.assertTrue(report['kpi_cards'][index]['evidence_id'])
            bad = deepcopy(report); bad['kpi_cards'][index]['value'] += 1
            check = self.evidence_check(bad)
            self.assertLess(check['passed'], check['total'])

    def ranked_report(self):
        req = f.requirement(domain_id='orders', metric_ids=['revenue'], dimension_ids=['city'], analysis_kind='ranking',
            ranking={'limit': 2, 'metric_id': 'revenue', 'direction': 'bottom'}, derived_features=['leader'],
            time={'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'})
        return self.report(req, 'Bottom 2 tỉnh theo doanh thu tháng 9 năm 2026', analysis_depth='deep')[2]

    def evidence_check(self, report):
        quality = verify_saved_report(report, self.catalog)
        return next(c for c in quality['verification_checks'] if c['id'] == 'evidence_grounding')

    def test_wrong_finding_scope_is_rejected(self):
        report = self.ranked_report()
        bad = deepcopy(report)
        bad['key_findings'][0]['scope_ref'] = 'unrelated_query'
        check = self.evidence_check(bad)
        self.assertLess(check['passed'], check['total'])

    def test_geography_warning_discloses_source_labels_without_scoring_name_heuristics(self):
        report = self.ranked_report()
        limitations = report['quality_limitations']
        warning = next((v for v in limitations if v['id'].startswith('dimension_limit:city:')), None)
        self.assertIsNotNone(warning)
        self.assertIn('2025', warning['label'])
        self.assertIn(warning['label'], report['conclusion']['caveats'])
        self.assertEqual(report['quality_assessment']['status'], 'verified')

    def test_export_rejects_unverified_claim_even_with_stored_perfect_score(self):
        from routers.reports import _verified_export
        report = self.ranked_report()
        report['key_findings'][0]['value'] = 999999
        report['quality_assessment'] = {'status': 'verified', 'score': 100}
        with patch('services.analysis_catalog.AnalysisCatalog', return_value=self.catalog), \
             patch('services.metadata_service.get_local_metadata', return_value={}):
            with self.assertRaises(HTTPException) as caught:
                _verified_export(report)
        self.assertEqual(caught.exception.status_code, 409)

    def test_chart_scope_and_unit_mutations_cannot_be_exported(self):
        from routers.reports import _verified_export
        report=self.ranked_report()
        for field,value in [('unit','USD'),('scope_ref','unrelated_query')]:
            with self.subTest(field=field):
                bad=deepcopy(report);bad['charts'][0][field]=value
                with patch('services.analysis_catalog.AnalysisCatalog',return_value=self.catalog), \
                     patch('services.metadata_service.get_local_metadata',return_value={}):
                    with self.assertRaises(HTTPException) as caught:_verified_export(bad)
                self.assertEqual(caught.exception.status_code,409)
        mutations=[
            lambda r:r['charts'][0]['insight']['key_facts'][0].update(value=999999),
            lambda r:r['charts'][0]['insight'].update(caveats=[]),
            lambda r:r['charts'][0]['insight']['verification_context'].update(reference='2026-08-01'),
            lambda r:r.update(quality_limitations=[]),
        ]
        for index,mutate in enumerate(mutations):
            with self.subTest(mutation=index):
                bad=deepcopy(report);mutate(bad)
                with patch('services.analysis_catalog.AnalysisCatalog',return_value=self.catalog), \
                     patch('services.metadata_service.get_local_metadata',return_value={}):
                    with self.assertRaises(HTTPException):_verified_export(bad)

    def test_fact_refs_and_conclusion_replay_detect_scope_unit_period_and_prose_mutations(self):
        report = self.ranked_report()
        self.assertEqual(verify_saved_report(report, self.catalog)['status'], 'verified')
        for finding in report['key_findings']:
            evidence = next(e for e in report['evidence'] if e['id'] == finding['evidence_id'])
            for field in ('scope_ref', 'metric', 'unit'):
                self.assertEqual(finding[field], evidence[field])
        mutations = [
            lambda r: r['executive_summary_facts'][0].update(scope_ref='wrong_query'),
            lambda r: r['key_findings'][0].update(unit='USD'),
            lambda r: r['key_findings'][0].update(evidence_id='missing_evidence'),
            lambda r: r['evidence'][0]['scope']['period'].update(start='2026-08-01'),
            lambda r: r['conclusion']['findings'][0].update(scope_ref='wrong_query'),
            lambda r: r.update(executive_summary='Nguyên nhân là thay đổi phương thức thanh toán.'),
            lambda r: r['key_findings'][0].update(value_details={'denominator': 1}),
        ]
        for i, mutate in enumerate(mutations):
            with self.subTest(mutation=i):
                bad = deepcopy(report); mutate(bad)
                quality = verify_saved_report(bad, self.catalog)
                self.assertTrue(quality['status'] == 'not_scored' or any(c['id'] == 'evidence_grounding'
                    and c['passed'] < c['total'] for c in quality['verification_checks']))

    def test_unproved_average_rollups_remain_explicit_whole_scope_benchmarks(self):
        req = f.requirement(domain_id='stores', metric_ids=['store_aov'], dimension_ids=['store'],
            ranking={'limit': 2, 'metric_id': 'store_aov', 'direction': 'top'}, derived_features=[],
            time={'kind': 'range', 'start': '2026-09-01', 'end': '2026-09-30'})
        report = self.report(req, 'Top 2 chi nhánh theo AOV chi nhánh tháng 9 năm 2026', rich_orders_data(),
                             analysis_depth='deep')[2]
        benchmarks = [e for e in report['evidence'] if e['scope'].get('population_scope') == 'scope_benchmark']
        self.assertTrue(benchmarks)
        for evidence in benchmarks:
            self.assertIn('toàn bộ tập đã lọc', evidence['statement'])
        self.assertEqual(verify_saved_report(report, self.catalog)['status'], 'verified')
