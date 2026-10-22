"""Remaining reliability gates; external transports are forbidden."""
from copy import deepcopy
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from pydantic import ValidationError
from tests import test_hybrid_v28 as f


class FeatureNoiseTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def compare(self, feature, explicit=False):
        req=f.requirement(metric_ids=['revenue'],dimension_ids=['city'],
            analysis_kind='aggregate',ranking=None,derived_features=[feature],
            filters=[dict(dimension='city',operator='in',value=['Hà Nội','Hồ Chí Minh'])])
        p=self.pipeline(f.scripted(f.envelope(req)))
        question='So sánh doanh thu theo tỉnh giữa Hồ Chí Minh và Hà Nội trong 30 ngày gần nhất'
        if explicit: question += '; kèm khoảng cách với hạng hai'
        return p, self.request(question,analysis_mission='compare')

    def test_unasked_rank_gap_on_comparison_does_not_consume_repair(self):
        p,r=self.compare('top_gap')
        proposal=p.propose(r)
        self.assertEqual(proposal['status'],'proposal_ready')
        self.assertEqual(p.provider.call_count,1)
        self.assertNotIn('top_gap',p.semantic_info['semantic_intent']['requirements'][0]['derived_features'])
        p.executor.assert_not_called()

    def test_explicit_rank_gap_cannot_be_removed_as_noise(self):
        from services.analytical_resolver import drop_unrequested_feature_conflicts
        intent=f.AnalysisIntentEnvelope.model_validate(f.envelope(f.requirement(
            analysis_kind='aggregate',ranking=None,derived_features=['top_gap'])))
        normalized,changes=drop_unrequested_feature_conflicts(intent,{'features':[{'candidate_ids':['top_gap']}]})
        self.assertEqual(normalized.requirements[0].derived_features,['top_gap'])
        self.assertEqual(changes,[])

    def test_valid_ranking_features_are_preserved(self):
        from services.analytical_resolver import drop_unrequested_feature_conflicts
        intent=f.AnalysisIntentEnvelope.model_validate(f.envelope(f.requirement(derived_features=['leader','top_gap'])))
        normalized,_=drop_unrequested_feature_conflicts(intent,{})
        self.assertEqual(normalized.requirements[0].derived_features,['leader','top_gap'])


class SavedAccessTests(f.unittest.TestCase):
    def test_saved_comparison_cannot_reopen_after_same_owner_permission_narrows(self):
        from services.access_policy import principal_for,active_principal
        from routers import reports
        identity=dict(subject='same-user',role='analyst',expires_at=9999999999)
        policy=dict(version='fixture',roles={'analyst':dict(permissions=['analytics.read','reports.export'],
            datasets=['*'],store_ids=[],national=True)})
        wide=principal_for(identity,policy)
        restricted=deepcopy(policy)
        restricted['roles']['analyst'].update(national=False,store_ids=['s1'])
        narrow=principal_for(identity,restricted)
        saved=dict(id='saved-compare',module_config={'analysis_mission':'compare',
            'comparison_members':['s1','s2']},owner_key=wide.owner_key,
            access_policy_fingerprint=wide.access_fingerprint)
        self.assertEqual(wide.owner_key,narrow.owner_key)
        conn=MagicMock();cur=conn.cursor.return_value.__enter__.return_value
        def select(sql,params):
            self.assertIn('access_policy_fingerprint=%s',sql)
            self.assertEqual(params[1],wide.owner_key)
            cur.fetchone.return_value=deepcopy(saved) if params[2]==wide.access_fingerprint else None
        cur.execute.side_effect=select
        with patch.object(reports,'get_db_conn',return_value=MagicMock(__enter__=MagicMock(return_value=conn))), \
             patch('services.telemetry.audit'):
            token=active_principal.set(wide)
            try:
                with patch('services.access_policy.load_policy',return_value=policy):
                    self.assertEqual(reports.get_saved_report(saved['id'])['module_config'],saved['module_config'])
                # The still-open old identity is rejected immediately as well.
                with patch('services.access_policy.load_policy',return_value=restricted):
                    with self.assertRaises(HTTPException) as caught:reports.get_saved_report(saved['id'])
                    self.assertEqual(caught.exception.status_code,403)
            finally:active_principal.reset(token)
            token=active_principal.set(narrow)
            try:
                with patch('services.access_policy.load_policy',return_value=restricted):
                    with self.assertRaises(HTTPException) as caught:reports.get_saved_report(saved['id'])
                    self.assertEqual(caught.exception.status_code,404)
                    for read in (reports.download_saved_report_docx,):
                        with self.assertRaises(HTTPException) as caught:read(saved['id'])
                        self.assertIn(caught.exception.status_code,(403,404))
            finally:active_principal.reset(token)


class GoalProvenanceTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_each_goal_traces_input_clause_and_verified_cohort_dependency(self):
        from evals.fixture_warehouse import FixtureWarehouse
        from services.goal_provenance_service import goal_provenance
        period=dict(kind='range',start='2026-09-01',end='2026-09-30')
        rank=f.requirement(id='rank',metric_ids=['revenue'],dimension_ids=['city'],time=period,
            ranking=dict(limit=2,direction='bottom',metric_id='revenue'),derived_features=[])
        child=f.requirement(id='child',metric_ids=['revenue'],dimension_ids=['store'],time=period,
            analysis_kind='aggregate',ranking=None,derived_features=[])
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(f.scripted(f.envelope(rank,child)),executor=warehouse)
        question='Bottom 2 tỉnh theo doanh thu tháng 9 năm 2026; phân tích chi nhánh chỉ trong các tỉnh này'
        req=self.request(question,analysis_depth='deep')
        r=p.generate(f.approve(req,p.propose(req)))
        receipt=r['goal_provenance']
        self.assertEqual(receipt,goal_provenance(r,self.catalog))
        goals={g['requirement_id']:g for g in receipt['goals']}
        self.assertEqual(set(goals),{g['id'] for g in r['semantic_intent']['requirements']})
        self.assertTrue(all(g['input_refs'] for g in goals.values()))
        self.assertTrue(any(x.get('explicit_metrics')==['revenue'] and x['start']==0 for x in goals['rank']['input_refs']))
        self.assertTrue(any(x.get('explicit_axes')==['store'] and x['start']>0 for x in goals['child']['input_refs']))
        self.assertTrue(goals['child']['cohort_query_refs'])
        for g in goals.values():
            for query in g['operation_ids']:
                self.assertIn(query,r['result_sets'])
        for field,value in (('input_refs',[]),('semantics',{'metric_ids':['order_count']}),('cohort_query_refs',['foreign'])):
            bad=deepcopy(r);next(g for g in bad['goal_provenance']['goals'] if g['requirement_id']=='child')[field]=value
            self.assertEqual(f.verify_saved_report(bad,self.catalog)['status'],'not_scored')

    def test_guided_selection_is_server_origin_and_model_cannot_supply_provenance(self):
        from evals.fixture_warehouse import FixtureWarehouse
        warehouse=FixtureWarehouse(self.catalog.overlay);self.addCleanup(warehouse.close)
        p=self.pipeline(executor=warehouse)
        req=self.request('Doanh thu',input_mode='guided',analysis_mission='overview',guided_contract={'metric':'revenue'},time={'mode':'all_time'})
        r=p.generate(f.approve(req,p.propose(req)))
        self.assertEqual(p.provider.call_count,0)
        self.assertTrue(all(any(s['kind']=='structured_selection' or s['kind']=='governed_supporting_view'
            for s in g['input_refs']) for g in r['goal_provenance']['goals']))
        with self.assertRaises(ValidationError):
            f.IntentRequirement.model_validate({**f.requirement(),'input_refs':[{'kind':'structured_selection'}]})


class RiskExposureTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp

    def test_same_delivery_percentage_requires_independent_minimum_exposure(self):
        from services import risk_watch_service as risk
        signal=next(s for s in self.catalog.registry['risk_signals'] if s['metric']=='delivery_success_rate')
        # Test a governed minimum without inventing a production business
        # threshold: the shipped delivery signal does not set a minimum.
        signal['observation_metric']=self.catalog.registry['metrics'][signal['metric']]['components']['denominator_metric']
        signal['minimum_observations']=3
        metric,obs=signal['metric'],signal['observation_metric']
        for sample,expected in ((2,'insufficient_sample'),(4,'red'),(0,'no_data')):
            with self.subTest(sample=sample):
                # Raw terminal outcomes are distinct observations; percentages
                # stay identical while the independent count doubles.
                terminal=['DELIVERED','FAILED']*(sample//2)
                percent=100*terminal.count('DELIVERED')/len(terminal) if terminal else None
                def execute(*args):return ([{metric:percent,obs:len(terminal)}],{})
                with patch.object(risk,'_execute',side_effect=execute),patch.object(risk,'evaluate_anomaly',return_value={}):
                    result=risk.evaluate(self.catalog,breakdown=None,signal_ids=[signal['id']])
                self.assertEqual(result['signals'][0]['status'],expected)
                self.assertEqual(result['signals'][0]['observations'],sample)


class ExportValueTests(f.unittest.TestCase):
    def test_negative_values_are_preserved_and_missing_values_never_fabricated(self):
        from services.docx_service import _clean_val
        self.assertEqual(_clean_val(-66500),'-66,500')
        self.assertEqual(_clean_val('-18,500'),'-18,500')
        for label in ('Doanh thu','Số đơn','AOV','Tỷ lệ hoàn thành','Khách hàng'):
            for missing in ('—','-','SELECT SUM(secret) FROM silver.don_hang','chờ kết quả'):
                with self.subTest(label=label,missing=missing):
                    self.assertEqual(_clean_val(missing,card={'label':label}),'—')

    def test_structured_conclusions_render_as_text_without_python_objects(self):
        from services.docx_service import generate_report_docx
        from xml.etree import ElementTree
        import zipfile
        report=dict(title='Kiểm phạm vi',conclusions=['Phạm vi A có 12 đơn.'],
            recommendations=[dict(text='Kiểm tra biến động trong phạm vi A.',evidence_id='private-ref',action='monitor')])
        with zipfile.ZipFile(generate_report_docx(report)) as archive:
            text=''.join(ElementTree.fromstring(archive.read('word/document.xml')).itertext())
        self.assertIn('Phạm vi A có 12 đơn.',text)
        self.assertIn('Kiểm tra biến động trong phạm vi A.',text)
        self.assertNotIn("['Phạm vi",text)
        self.assertNotIn("'evidence_id':",text)
        self.assertNotIn('Đã khớp lệnh & Duyệt',text)


class RankingDirectionTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_all_bottom_facts_and_word_keep_direction(self):
        from evals.fixture_warehouse import FixtureWarehouse
        from services.docx_service import generate_report_docx
        from xml.etree import ElementTree
        import zipfile
        req=f.requirement(metric_ids=['revenue'],dimension_ids=['city'],
            ranking=dict(limit=2,metric_id='revenue',direction='bottom'),derived_features=['selected_total'])
        wh=FixtureWarehouse(self.catalog.overlay);self.addCleanup(wh.close)
        p=self.pipeline(f.scripted(f.envelope(req)),executor=wh)
        request=self.request('Bottom 2 tỉnh theo doanh thu trong 30 ngày gần nhất; kèm tổng doanh thu tập chọn',analysis_depth='focused')
        report=p.generate(f.approve(request,p.propose(request)))
        total=next(e for e in report['evidence'] if e['feature']=='selected_total')
        self.assertIn('Bottom N',total['statement'])
        self.assertNotIn('Top N',total['statement'])
        with zipfile.ZipFile(generate_report_docx(report)) as archive:
            text=''.join(ElementTree.fromstring(archive.read('word/document.xml')).itertext())
        self.assertNotIn('tổng của tập Top N',text)


class AdvertisedEchoTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_metric_names_cannot_supply_mission_operators_or_entity_filters(self):
        from services.preflight_service import run
        from services.mission_contract_service import guided_question,validate_guided
        cases=[('overview',{'metric':'kiosk_red_alert_count'}),
            ('overview',{'metric':'kiosk_price_override_count'}),
            ('ranking',dict(metric='avg_delivery_minutes',dimension='city',direction='bottom',n=5)),
            ('forecast',dict(metric='store_revenue',horizon=3,cadence='day'))]
        for mission,contract in cases:
            with self.subTest(mission=mission,contract=contract):
                q=guided_question(self.catalog,validate_guided(self.catalog,mission,contract))
                pf=run(q,catalog=self.catalog,reference=f.REFERENCE,analysis_mission=mission,
                    input_mode='guided',guided_contract=contract,time_range={'mode':'all_time'})
                self.assertTrue(pf['can_submit'],pf['findings'])

    def test_axis_label_containing_another_metric_is_not_a_second_goal(self):
        from services.request_anchors import request_anchors
        q='So sánh hồ sơ nhượng quyền đã duyệt theo trạng thái hồ sơ nhượng quyền giữa CHO_XEM_XET và DA_DUYET'
        anchors=request_anchors(q,self.catalog,{})
        self.assertEqual({m for a in anchors['metrics'] for m in a['candidate_ids']},{'franchise_approved_count'})

    def test_composition_rejects_axes_without_governed_additivity_before_ready(self):
        from services.mission_contract_service import validate_guided,GuidedContractError
        self.assertEqual(validate_guided(self.catalog,'composition',{'metric':'sale_positions','dimension':'product'})['dimension'],'product')
        with self.assertRaises(GuidedContractError):
            validate_guided(self.catalog,'composition',{'metric':'sale_positions','dimension':'city'})

    def test_real_unknown_scope_and_conflicting_mission_still_block(self):
        from services.preflight_service import run
        for q,mission in [('Số override giá kiosk tại Sao Hỏa','overview'),
            ('Dự báo doanh thu trong 3 tháng tới','ranking')]:
            with self.subTest(q=q):
                self.assertFalse(run(q,catalog=self.catalog,reference=f.REFERENCE,analysis_mission=mission)['can_submit'])

    def test_metric_namespace_is_not_an_implicit_entity_group_filter(self):
        from services.request_anchors import request_anchors
        plain=request_anchors('Tình hình số ca kiosk',self.catalog,{})
        self.assertFalse(any(v['dimension']=='store_type' for v in plain['values']))
        explicit=request_anchors('Tình hình số ca kiosk tại kiosk vệ tinh',self.catalog,{})
        self.assertEqual({v['value'] for v in explicit['values'] if v['dimension']=='store_type'},{'KIOSK_VE_TINH'})


class RankingMatrixTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_ties_actual_n_and_full_fact_universe_at_every_depth(self):
        from evals import fixture_warehouse as w
        from services.result_artifact_store import artifact_store
        cities=['Hồ Chí Minh','Hà Nội','Đà Nẵng','Cần Thơ','Đồng Nai','Quảng Trị']
        amounts=[100,100,200,300,300,400]
        data=deepcopy(w.DATA)
        data['chi_nhanh']=[{**data['chi_nhanh'][0],'ma_chi_nhanh':f's{i}','ten_chi_nhanh':f'Cửa hàng {i}',
            'thanh_pho':city} for i,city in enumerate(cities)]
        data['don_hang']=[{**data['don_hang'][0],'ma_don_hang':f'o{i}','co_so_ma':f's{i}',
            'tong_tien':amount,'trang_thai_don_hang':'HOAN_THANH','ngay_tao':'2026-09-10T12:00:00'}
            for i,amount in enumerate(amounts)]
        for direction in ('top','bottom'):
            for limit in (1,5,20):
                expected=sorted(zip(cities,amounts),key=lambda p:((-p[1] if direction=='top' else p[1]),p[0]))[:limit]
                for depth in ('focused','deep','comprehensive'):
                    with self.subTest(direction=direction,limit=limit,depth=depth),patch.dict(w.DATA,data):
                        wh=w.FixtureWarehouse(self.catalog.overlay)
                        try:
                            req=f.requirement(metric_ids=['revenue'],dimension_ids=['city'],
                                ranking=dict(limit=limit,metric_id='revenue',direction=direction),
                                derived_features=['selected_total'],time=dict(kind='month',month=9,year=2026))
                            p=self.pipeline(f.scripted(f.envelope(req)),executor=wh)
                            request=self.request(f'{direction.title()} {limit} tỉnh theo doanh thu tháng 9 năm 2026; kèm tổng doanh thu tập chọn',
                                analysis_depth=depth,refresh=True)
                            r=p.generate(f.approve(request,p.propose(request)))
                            query=next(q for q in r['analytical_queries'] if q['role']=='requested' and q['operation']=='ranking')
                            result=r['result_sets'][query['id']]
                            rows=artifact_store().get(result['artifact_ref'])['rows']
                            self.assertEqual([(row['city'],row['revenue']) for row in rows],expected)
                            self.assertEqual(result['total_rows'],min(limit,6))
                            total=next(e for e in r['evidence'] if e['scope_ref']==query['id'] and e['feature']=='selected_total')
                            self.assertEqual(total['values']['total'],sum(v for _,v in expected))
                            self.assertIn(direction.title()+' N',total['statement'])
                            self.assertIn(str(len(expected))+' mục',total['statement'])
                            self.assertTrue(r['short_answer'])
                            for chart in r['charts']:
                                if chart['query_id']==query['id']:
                                    self.assertEqual(chart['scope_ref'],query['id'])
                                    for fact in chart['insight']['key_facts']:
                                        self.assertTrue(fact['evidence_ref'].startswith(query['id']+':'))
                                        self.assertEqual(fact['unit'],'VND')
                            self.assertFalse(any(c['status'] in {'failed','partial'} for c in r['quality_assessment'].get('publication_checks',[])))
                        finally:wh.close()


class BaselineBoundaryTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_zero_negative_and_missing_revenue_baselines_at_all_depths(self):
        from tests.test_v34_period_comparison import PeriodComparisonTests,intent,QUESTION
        from evals.fixture_warehouse import FixtureWarehouse
        for depth in ('focused','deep','comprehensive'):
            for baseline in (0,-100,None):
                with self.subTest(depth=depth,baseline=baseline):
                    wh=PeriodComparisonTests.warehouse(self,baseline=baseline) if baseline is not None else FixtureWarehouse(self.catalog.overlay)
                    self.addCleanup(wh.close)
                    p=self.pipeline(f.scripted(intent()),executor=wh)
                    req=self.request(QUESTION,analysis_depth=depth,refresh=True)
                    try:r=p.generate(f.approve(req,p.propose(req)))
                    except f.AnalysisError as error:
                        self.assertIsNot(baseline,0)
                        self.assertIn(error.category,{'result_contract','insufficient_data'})
                        continue
                    if baseline==0:
                        fact=next(e for e in r['evidence'] if e['feature']=='period_comparison')
                        self.assertEqual(fact['values']['baseline'],0)
                        self.assertIsNone(fact['values']['change_pct'])
                        self.assertIn('bằng 0',fact['statement'])
                    elif baseline is None:
                        self.assertFalse(any(e['feature']=='period_comparison' for e in r['evidence']))
                        self.assertEqual(r['completion_status'],'partial')
                    else:self.fail('Nonnegative revenue cannot publish a negative baseline')


class CausalPairTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline

    def request(self,*args,**kwargs):
        kwargs['analysis_depth']=self.depth
        return f.HybridTests.request(self,*args,**kwargs)

    def test_governed_operational_pair_keeps_grain_and_causal_guard_at_all_depths(self):
        from tests.test_v33_pair import PairPipelineTests
        from services.analysis_quality_service import publication_issues
        self.assertEqual({p['id'] for p in self.catalog.registry['governed_pairs']},{'revenue_vs_cancellation_by_store'})
        for depth in ('focused','deep','comprehensive'):
            self.depth=depth
            with self.subTest(depth=depth):
                _,_,r=PairPipelineTests.run_pair(self,[(9,1),(8,2),(6,4),(5,5),(3,7)])
                fact=next(e for e in r['evidence'] if e['feature']=='pearson')
                self.assertEqual(fact['values']['n'],5)
                self.assertAlmostEqual(fact['values']['r'],-1,places=8)
                chart=next(c for c in r['charts'] if c['chart_type']=='scatter')
                self.assertTrue(any('nhân quả' in x.lower() for x in chart['insight']['caveats']))
                bad=deepcopy(r)
                next(c for c in bad['charts'] if c['chart_type']=='scatter')['insight']['interpretation']='Doanh thu cao gây ra tỷ lệ hủy thấp.'
                quality=f.verify_saved_report(bad,self.catalog)
                self.assertTrue(quality['status']=='not_scored' or publication_issues(quality))


class EntryModeParityTests(f.unittest.TestCase):
    setUp = f.HybridTests.setUp
    pipeline = f.HybridTests.pipeline
    request = f.HybridTests.request

    def test_text_builder_preset_and_owned_followup_share_scoped_primary_and_provenance(self):
        from evals import fixture_warehouse as w
        from services.result_artifact_store import artifact_store
        from services.workspace_service import dashboard_intent
        data=deepcopy(w.DATA)
        data['don_hang'].append({**data['don_hang'][0],'ma_don_hang':'parity-extra',
            'ngay_tao':'2026-09-22T10:00:00','tong_tien':50})
        selected={r['ma_chi_nhanh'] for r in data['chi_nhanh'] if r['thanh_pho']=='Hồ Chí Minh'}
        expected=sum(r['tong_tien'] for r in data['don_hang'] if r['co_so_ma'] in selected
            and r['trang_thai_don_hang'] in {'HOAN_THANH','DANG_GIAO'} and '2026-09-01'<=r['ngay_tao'][:10]<='2026-09-30')
        metric='revenue';dimension='city'
        selection=dict(dimension=dimension,operator='eq',value='Hồ Chí Minh')
        # Canonically equivalent preset fixture exercises the actual preset
        # adapter. Production D01's broader bundle is independently tested in
        # the complete53-preset suite, not asserted equal to a single-metric task.
        overlay=deepcopy(self.catalog.overlay)
        template=next(t for t in overlay['analysis_registry']['workspace']['dashboard_templates'] if t['id']=='D01')
        template['requirements']=[dict(id='scalar',goal='Tổng doanh thu',metric_ids=[metric],dimension_ids=[],
            analysis_kind='aggregate',derived_features=['scalar']),dict(id='groups',goal='Doanh thu theo tỉnh',
            metric_ids=[metric],dimension_ids=[dimension],analysis_kind='aggregate')]
        self.catalog=f.AnalysisCatalog(f.physical_metadata(),overlay=overlay)
        for depth in ('focused','deep','comprehensive'):
            reports={}
            with patch.dict(w.DATA,data):
                wh=w.FixtureWarehouse(self.catalog.overlay)
                try:
                    for mode in ('text','guided','preset','followup'):
                        with self.subTest(depth=depth,mode=mode):
                            params=dict(analysis_depth=depth,time={'mode':'custom','start':'2026-09-01','end':'2026-09-30'},refresh=True,
                                analysis_scope={'mode':'selected','filters':[selection]})
                            if mode=='text':
                                meaning=dashboard_intent(self.catalog,'D01',template['version'])
                                for req in meaning['requirements']:req['filters']=[selection]
                                provider=f.scripted(meaning)
                                req=self.request('Tổng doanh thu và phân tích doanh thu theo tỉnh',**params)
                            else:
                                provider=f.scripted()
                                if mode=='preset':
                                    req=f.AiTextToReportRequest(dashboard_id='D01',dashboard_version=template['version'],reference_date=f.REFERENCE,**params)
                                else:
                                    params.update(input_mode='guided',analysis_mission='overview',guided_contract={'metric':metric,'dimension':dimension})
                                    if mode=='followup':
                                        parent=reports['preset'];q=next(q for q in parent['analytical_queries'] if dimension in q['group_by'])
                                        params['source_analysis']=dict(session_id=parent['session_id'],revision=parent['revision'],query_id=q['id'],
                                            artifact_id=parent['result_sets'][q['id']]['artifact_ref']['artifact_id'],filters={dimension:'Hồ Chí Minh'})
                                    req=self.request('Tình hình doanh thu',**params)
                            p=self.pipeline(provider,executor=wh)
                            p.catalog=f.Mock(return_value=self.catalog)
                            p._active_catalog=self.catalog
                            r=p.generate(f.approve(req,p.propose(req)));reports[mode]=r
                            primary=next(q for q in r['analytical_queries'] if q['role']=='requested' and q['operation']=='aggregate' and not q['group_by'])
                            result=artifact_store().get(r['result_sets'][primary['id']]['artifact_ref'])
                            self.assertEqual(result['rows'][0][metric],expected)
                            for query in r['analytical_queries']:
                                self.assertIn(selection,query['filters'])
                            self.assertTrue(all(g['input_refs'] for g in r['goal_provenance']['goals']))
                            self.assertEqual(provider.call_count,1 if mode=='text' else 0)
                            if mode=='followup':self.assertEqual(r['provenance']['source_analysis']['validation'],'owned_immutable_artifact_at_submission')
                finally:wh.close()
