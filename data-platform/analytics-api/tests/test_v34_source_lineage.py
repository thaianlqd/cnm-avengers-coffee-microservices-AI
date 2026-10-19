"""A group action creates new governed work with owned artifact lineage."""
from copy import deepcopy

from common import AiTextToReportRequest
from tests import test_hybrid_v28 as f
from services.analysis_quality_service import verify_saved_report
from services.session_service import get_session,encode_session,decode_session


class SourceLineageTests(f.unittest.TestCase):
    setUp=f.HybridTests.setUp
    pipeline=f.HybridTests.pipeline
    request=f.HybridTests.request

    def parent(self):
        from evals import fixture_warehouse as w
        data=deepcopy(w.DATA)
        # The selected group has two observed weeks, so a guided overview can
        # honestly satisfy both its KPI and time-series views.
        data['don_hang'].append({**data['don_hang'][3],'ma_don_hang':'extra-week',
            'ngay_tao':'2026-09-15T10:00:00','tong_tien':50})
        with f.patch.object(w,'DATA',data):warehouse=f.FixtureWarehouse(self.catalog.overlay)
        self.addCleanup(warehouse.close)
        req=f.requirement(metric_ids=['revenue'],dimension_ids=['city','order_type'],analysis_kind='cross_tab',
            ranking=None,derived_features=[],time={'kind':'month','month':9,'year':2026})
        pipeline=self.pipeline(f.scripted(f.envelope(req)),executor=warehouse)
        request=self.request('Doanh thu theo thành phố và kênh bán tháng 9 năm 2026',analysis_depth='focused')
        report=pipeline.generate(f.approve(request,pipeline.propose(request)))
        query=next(q for q in report['analytical_queries'] if q['role']=='requested' and q['group_by'])
        row=report['result_sets'][query['id']]['rows'][0]
        keys={d:row[d] for d in query['group_by']}
        source=dict(session_id=report['session_id'],revision=report['revision'],query_id=query['id'],
            artifact_id=report['result_sets'][query['id']]['artifact_ref']['artifact_id'],filters=keys)
        raw=dict(question='Tình hình doanh thu từ 2026-09-01 đến 2026-09-30',input_mode='guided',
            analysis_mission='overview',guided_contract={'metric':'revenue'},
            time={'mode':'custom','start':'2026-09-01','end':'2026-09-30'},analysis_depth='focused',
            analysis_scope={'mode':'selected','filters':[{'dimension':d,'operator':'eq','value':v} for d,v in keys.items()]},
            source_analysis=source)
        return raw,warehouse,report

    def test_new_report_retains_server_validated_parent_and_computes_its_own_numbers(self):
        raw,warehouse,parent=self.parent()
        pipeline=self.pipeline(executor=warehouse)
        request=AiTextToReportRequest(**raw)
        proposal=pipeline.propose(request)
        self.assertEqual(pipeline.provider.call_count,0)
        report=pipeline.generate(f.approve(request,proposal))
        self.assertNotEqual(report['session_id'],parent['session_id'])
        source=report['provenance']['source_analysis']
        self.assertEqual(source['artifact_id'],raw['source_analysis']['artifact_id'])
        self.assertEqual(source['validation'],'owned_immutable_artifact_at_submission')
        self.assertEqual(report['verification']['status'],'verified',f.json.dumps({k:report.get(k) for k in
            ['verification','quality_assessment','quality_limitations','analysis_state']},ensure_ascii=False))
        session=decode_session(encode_session(get_session(report['session_id'])))
        self.assertEqual(session.source_analysis,source)
        bad=deepcopy(report);bad['provenance']['source_analysis']['artifact_id']='forged'
        self.assertNotEqual(verify_saved_report(bad,self.catalog)['status'],'verified')
        self.assertEqual(pipeline.provider.call_count,0)

    def test_cross_owner_old_revision_wrong_artifact_missing_key_and_scope_widening_stop_before_work(self):
        raw,warehouse,_=self.parent()
        variants=[]
        for field,value in [('revision',999),('artifact_id','other-artifact'),('query_id','other-query')]:
            bad=deepcopy(raw);bad['source_analysis'][field]=value;variants.append(bad)
        missing=deepcopy(raw);missing['source_analysis']['filters'].pop(next(iter(missing['source_analysis']['filters'])))
        variants.append(missing)
        wider=deepcopy(raw);wider['analysis_scope']={'mode':'all','filters':[]};variants.append(wider)
        metric=deepcopy(raw);metric['guided_contract']['metric']='order_count';variants.append(metric)
        time=deepcopy(raw);time['time']['start']='2026-08-01';variants.append(time)
        for candidate in variants:
            pipeline=self.pipeline()
            with self.subTest(candidate=candidate),self.assertRaises(f.AnalysisError):
                pipeline.propose(AiTextToReportRequest(**candidate))
            self.assertEqual(pipeline.provider.call_count,0);pipeline.executor.assert_not_called()
        pipeline=self.pipeline();pipeline.owner_id='other-owner'
        with self.assertRaises(f.AnalysisError):pipeline.propose(AiTextToReportRequest(**raw))
        self.assertEqual(pipeline.provider.call_count,0);pipeline.executor.assert_not_called()
